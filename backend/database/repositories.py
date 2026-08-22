"""Persistence for sessions, their event history, and the worker pool."""

import base64
from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.blobs import BlobStore
from backend.database.models import AgentSession, SessionEvent, SessionStatus, Worker
from shared.events import (
    Event,
    EventPayload,
    InlineScreenshot,
    ScreenshotRef,
    ToolResult,
    WorkerEvent,
)

_SUFFIX_BY_MEDIA_TYPE = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


class SessionNotFound(Exception):
    def __init__(self, session_id: UUID) -> None:
        super().__init__(f"unknown session {session_id}")
        self.session_id = session_id


def _as_utc(value: datetime) -> datetime:
    """SQLite discards timezones on write, so restore UTC on the way out."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


class SessionRepository:
    """Sessions, without the events that belong to them."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, *, title: str | None = None) -> AgentSession:
        session = AgentSession(title=title)
        self._db.add(session)
        await self._db.flush()
        return session

    async def get(self, session_id: UUID) -> AgentSession:
        session = await self._db.get(AgentSession, session_id)
        if session is None:
            raise SessionNotFound(session_id)
        return session

    async def list_all(self, *, limit: int = 50, offset: int = 0) -> list[AgentSession]:
        result = await self._db.execute(
            select(AgentSession)
            .order_by(AgentSession.created_at.desc(), AgentSession.id)
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars())

    async def set_status(self, session_id: UUID, status: SessionStatus) -> AgentSession:
        session = await self.get(session_id)
        session.status = status
        await self._db.flush()
        return session

    async def delete(self, session_id: UUID) -> None:
        session = await self.get(session_id)
        await self._db.delete(session)
        await self._db.flush()


class EventRepository:
    """Places worker events in their session's order and reads them back."""

    def __init__(self, db: AsyncSession, blobs: BlobStore) -> None:
        self._db = db
        self._blobs = blobs

    async def append(self, events: Sequence[WorkerEvent]) -> list[Event]:
        """Persist worker events, assigning each its position in the session.

        This is where the inline form of a screenshot stops existing: the bytes
        go to the blob store and the stored payload keeps only a reference, so
        nothing downstream has to carry base64 around.
        """
        if not events:
            return []
        session_ids = {event.session_id for event in events}
        if len(session_ids) != 1:
            raise ValueError("events appended together must share one session")
        session_id = session_ids.pop()

        first_seq = await self._reserve(session_id, len(events))

        stored: list[Event] = []
        for offset, worker_event in enumerate(events):
            payload = await self._externalise_screenshot(worker_event.payload)
            event = Event(
                session_id=session_id,
                seq=first_seq + offset,
                ts=worker_event.ts,
                payload=payload,
            )
            self._db.add(
                SessionEvent(
                    session_id=session_id,
                    seq=event.seq,
                    event_type=payload.type,
                    ts=event.ts,
                    payload=payload.model_dump(mode="json"),
                )
            )
            stored.append(event)

        await self._db.flush()
        return stored

    async def list_for_session(
        self, session_id: UUID, *, from_seq: int = 0, limit: int | None = None
    ) -> list[Event]:
        query = (
            select(SessionEvent)
            .where(SessionEvent.session_id == session_id, SessionEvent.seq >= from_seq)
            .order_by(SessionEvent.seq)
        )
        if limit is not None:
            query = query.limit(limit)
        result = await self._db.execute(query)
        return [
            Event(
                session_id=row.session_id,
                seq=row.seq,
                ts=_as_utc(row.ts),
                payload=row.payload,
            )
            for row in result.scalars()
        ]

    async def count_for_session(self, session_id: UUID) -> int:
        result = await self._db.execute(
            select(func.count())
            .select_from(SessionEvent)
            .where(SessionEvent.session_id == session_id)
        )
        return int(result.scalar_one())

    async def _reserve(self, session_id: UUID, count: int) -> int:
        """Claim `count` consecutive positions with a single atomic increment.

        Reading the current maximum and adding to it would let two writers pick
        the same position; incrementing in the UPDATE itself hands each writer a
        disjoint range. The unique constraint on (session_id, seq) is the
        backstop if that ever fails.
        """
        result = await self._db.execute(
            update(AgentSession)
            .where(AgentSession.id == session_id)
            .values(next_seq=AgentSession.next_seq + count)
            .returning(AgentSession.next_seq)
        )
        row = result.first()
        if row is None:
            raise SessionNotFound(session_id)
        return int(row[0]) - count

    async def _externalise_screenshot(self, payload: EventPayload) -> EventPayload:
        if not isinstance(payload, ToolResult) or not isinstance(
            payload.screenshot, InlineScreenshot
        ):
            return payload
        inline = payload.screenshot
        key = await self._blobs.put(
            base64.b64decode(inline.data),
            suffix=_SUFFIX_BY_MEDIA_TYPE.get(inline.media_type, ".png"),
        )
        return payload.model_copy(
            update={"screenshot": ScreenshotRef(url=self._blobs.url_for(key))}
        )


class WorkerRepository:
    """The pool's registry. Claiming a worker arrives with the session manager."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def register(
        self, *, name: str, base_url: str, vnc_url: str | None = None
    ) -> Worker:
        """Record a worker, or update where it can be reached.

        Keyed on name so restarting the pool refreshes the existing rows rather
        than accumulating duplicates.
        """
        result = await self._db.execute(select(Worker).where(Worker.name == name))
        worker = result.scalar_one_or_none()
        if worker is None:
            worker = Worker(name=name, base_url=base_url, vnc_url=vnc_url)
            self._db.add(worker)
        else:
            worker.base_url = base_url
            worker.vnc_url = vnc_url
        await self._db.flush()
        return worker

    async def list_all(self) -> list[Worker]:
        result = await self._db.execute(select(Worker).order_by(Worker.name))
        return list(result.scalars())

    async def for_session(self, session_id: UUID) -> Worker | None:
        result = await self._db.execute(
            select(Worker).where(Worker.session_id == session_id)
        )
        return result.scalar_one_or_none()
