"""The single write path: persist first, then fan out."""

from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from backend.database import BlobStore, EventRepository
from backend.streaming.bus import EventBus
from shared.events import Event, WorkerEvent


class EventPublisher:
    """Turns worker events into persisted, numbered, live-broadcast events.

    Tests use this as a synthetic producer so reconnect cases exercise the
    same path a real worker will. The session manager will call it too.
    """

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        blobs: BlobStore,
        bus: EventBus,
    ) -> None:
        self._session_factory = session_factory
        self._blobs = blobs
        self._bus = bus

    async def publish(self, events: Sequence[WorkerEvent]) -> list[Event]:
        async with self._session_factory() as db:
            stored = await EventRepository(db, self._blobs).append(events)
            await db.commit()
        for event in stored:
            self._bus.publish(event)
        return stored
