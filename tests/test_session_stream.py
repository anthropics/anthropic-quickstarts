"""The replay-then-live handoff, driven by a fake history reader.

These cases are what a reconnecting client depends on, and they are not
reachable through HTTP alone: the interesting moment is an event landing
on the bus *during* the history read.
"""

from uuid import uuid4

from backend.streaming.bus import EventBus
from backend.streaming.sse import session_event_stream
from shared.events import AssistantText, Event
from tests.sse import parse_sse


def event(session_id, seq, text):
    return Event(session_id=session_id, seq=seq, payload=AssistantText(text=text))


async def take(stream, count: int) -> list[dict]:
    frames = []
    async for chunk in stream:
        frames.extend(parse_sse(chunk))
        if len(frames) >= count:
            break
    return frames


async def test_history_is_replayed_in_order():
    bus = EventBus()
    session_id = uuid4()
    history = [event(session_id, n, str(n)) for n in range(3)]

    async def read_history(_session_id, from_seq):
        return [item for item in history if item.seq >= from_seq]

    stream = session_event_stream(
        session_id, from_seq=0, bus=bus, read_history=read_history
    )
    frames = await take(stream, 3)
    await stream.aclose()

    assert [frame["id"] for frame in frames] == [0, 1, 2]
    assert [frame["data"]["payload"]["text"] for frame in frames] == ["0", "1", "2"]


async def test_replay_can_start_from_a_later_seq():
    bus = EventBus()
    session_id = uuid4()

    async def read_history(_session_id, from_seq):
        return [event(session_id, n, str(n)) for n in range(from_seq, 4)]

    stream = session_event_stream(
        session_id, from_seq=2, bus=bus, read_history=read_history
    )
    frames = await take(stream, 2)
    await stream.aclose()

    assert [frame["id"] for frame in frames] == [2, 3]


async def test_an_event_published_during_replay_is_not_lost():
    """The reason the bus is subscribed before history is read."""
    bus = EventBus()
    session_id = uuid4()
    stored = event(session_id, 0, "old")
    live = event(session_id, 1, "during")

    async def read_history(_session_id, _from_seq):
        bus.publish(live)
        return [stored]

    stream = session_event_stream(
        session_id, from_seq=0, bus=bus, read_history=read_history
    )
    frames = await take(stream, 2)
    await stream.aclose()

    assert [frame["id"] for frame in frames] == [0, 1]
    assert [frame["data"]["payload"]["text"] for frame in frames] == ["old", "during"]


async def test_an_event_already_replayed_is_not_yielded_again():
    bus = EventBus()
    session_id = uuid4()
    stored = event(session_id, 0, "once")

    async def read_history(_session_id, _from_seq):
        bus.publish(stored)
        return [stored]

    stream = session_event_stream(
        session_id, from_seq=0, bus=bus, read_history=read_history, keepalive=0.01
    )
    first = await take(stream, 1)
    # A keepalive arrives next if the duplicate was correctly skipped.
    idle = []
    async for chunk in stream:
        idle.append(chunk)
        if chunk.startswith(":"):
            break
    await stream.aclose()

    assert [frame["id"] for frame in first] == [0]
    assert idle[-1].startswith(": keepalive")


async def test_live_events_follow_replay():
    bus = EventBus()
    session_id = uuid4()

    async def read_history(_session_id, _from_seq):
        return [event(session_id, 0, "stored")]

    stream = session_event_stream(
        session_id, from_seq=0, bus=bus, read_history=read_history
    )
    first = await take(stream, 1)
    bus.publish(event(session_id, 1, "live"))
    second = await take(stream, 1)
    await stream.aclose()

    assert first[0]["data"]["payload"]["text"] == "stored"
    assert second[0]["data"]["payload"]["text"] == "live"


async def test_a_lagging_subscriber_is_told_to_reconnect():
    """Overflow happens during replay, before the live loop drains anything."""
    bus = EventBus(maxsize=1)
    session_id = uuid4()

    async def read_history(_session_id, _from_seq):
        bus.publish(event(session_id, 0, "a"))
        bus.publish(event(session_id, 1, "b"))
        return []

    chunks = [
        chunk
        async for chunk in session_event_stream(
            session_id, from_seq=0, bus=bus, read_history=read_history
        )
    ]

    assert chunks == [": lagging — reconnect\n\n"]


async def test_closing_the_session_ends_the_stream():
    bus = EventBus()
    session_id = uuid4()

    async def read_history(_session_id, _from_seq):
        bus.close(session_id)
        return []

    chunks = [
        chunk
        async for chunk in session_event_stream(
            session_id, from_seq=0, bus=bus, read_history=read_history
        )
    ]

    assert chunks == []
