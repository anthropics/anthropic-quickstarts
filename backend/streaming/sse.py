"""Replay a session's history, then tail live events, framed as SSE."""

from collections.abc import AsyncIterator, Awaitable, Callable
from uuid import UUID

from backend.streaming.bus import EventBus, SessionGone, SubscriberLagging
from shared.events import Event

HistoryReader = Callable[[UUID, int], Awaitable[list[Event]]]

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    # Without this, a reverse proxy may buffer the stream and defeat the point.
    "X-Accel-Buffering": "no",
}


def format_sse(event: Event) -> str:
    """Frame one event, using `seq` as the SSE id so a client can resume."""
    return (
        f"id: {event.seq}\n"
        f"event: {event.payload.type}\n"
        f"data: {event.model_dump_json()}\n\n"
    )


async def session_event_stream(
    session_id: UUID,
    *,
    from_seq: int,
    bus: EventBus,
    read_history: HistoryReader,
    keepalive: float = 0,
) -> AsyncIterator[str]:
    """Yield stored events from `from_seq`, then whatever is published next.

    The subscription is opened before history is read so an event persisted
    during that read lands on the queue. `seq` is a total order, so anything
    already yielded is skipped when the live tail starts — a gap is impossible
    and a duplicate is dropped.
    """
    async with bus.subscribe(session_id) as subscription:
        last_seq = from_seq - 1
        for event in await read_history(session_id, from_seq):
            yield format_sse(event)
            last_seq = event.seq
        while True:
            try:
                event = await subscription.next_event(idle=keepalive or None)
            except SubscriberLagging:
                yield ": lagging — reconnect\n\n"
                return
            except SessionGone:
                return
            if event is None:
                yield ": keepalive\n\n"
                continue
            if event.seq <= last_seq:
                continue
            yield format_sse(event)
            last_seq = event.seq
