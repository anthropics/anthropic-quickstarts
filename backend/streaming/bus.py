"""A per-session fan-out for events that have already been persisted.

Subscribers are bounded. A client that stops reading is disconnected rather
than allowed to grow a queue without limit; it reconnects with `Last-Event-ID`
and the database supplies what it missed. That is honest and cheap, and it is
the same path a dropped network connection already takes.
"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from shared.events import Event

DEFAULT_QUEUE_SIZE = 256
_CLOSED = object()


class SubscriberLagging(Exception):
    """This subscriber's queue filled; it should reconnect and replay."""


class SessionGone(Exception):
    """The session was closed under this subscriber."""


class Subscription:
    """One client's queue of live events for a session."""

    def __init__(self, maxsize: int) -> None:
        self._queue: asyncio.Queue[Event | object] = asyncio.Queue(maxsize=maxsize)
        self.lagging = False
        self._closed = False

    def push(self, event: Event) -> None:
        if self.lagging or self._closed:
            return
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            self.lagging = True

    def close(self) -> None:
        self._closed = True
        try:
            self._queue.put_nowait(_CLOSED)
        except asyncio.QueueFull:
            # The reader is already behind; it will see lagging or _closed.
            pass

    async def next_event(self, idle: float | None = None) -> Event | None:
        """Return the next event, or `None` if `idle` seconds pass with nothing.

        `idle` of `None` or `0` waits indefinitely, so a stream that has
        disabled keepalives does not wake up just to go back to sleep.
        """
        if self.lagging:
            raise SubscriberLagging
        if self._closed and self._queue.empty():
            raise SessionGone
        try:
            if not idle:
                item = await self._queue.get()
            else:
                item = await asyncio.wait_for(self._queue.get(), timeout=idle)
        except TimeoutError:
            return None
        if item is _CLOSED or self._closed:
            raise SessionGone
        if self.lagging:
            raise SubscriberLagging
        return item  # type: ignore[return-value]


class EventBus:
    """Live events, keyed by session, each subscriber on its own queue."""

    def __init__(self, *, maxsize: int = DEFAULT_QUEUE_SIZE) -> None:
        self._maxsize = maxsize
        self._subs: dict[UUID, set[Subscription]] = {}

    @asynccontextmanager
    async def subscribe(self, session_id: UUID) -> AsyncIterator[Subscription]:
        subscription = Subscription(self._maxsize)
        self._subs.setdefault(session_id, set()).add(subscription)
        try:
            yield subscription
        finally:
            group = self._subs.get(session_id)
            if group is not None:
                group.discard(subscription)
                if not group:
                    del self._subs[session_id]

    def publish(self, event: Event) -> None:
        """Fan an already-persisted event out to whoever is watching.

        Persistence has to happen first. A subscriber that joins between
        publish and commit would query the database, miss the row, miss the
        bus event, and have a gap that replay cannot fill.
        """
        for subscription in list(self._subs.get(event.session_id, ())):
            subscription.push(event)

    def close(self, session_id: UUID) -> None:
        """End every live tail for a session, e.g. because it was deleted."""
        for subscription in list(self._subs.pop(session_id, ())):
            subscription.close()

    def close_all(self) -> None:
        for session_id in list(self._subs):
            self.close(session_id)

    def subscriber_count(self, session_id: UUID) -> int:
        return len(self._subs.get(session_id, ()))
