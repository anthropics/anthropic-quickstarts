"""Claim a desktop for a session, and refuse a second run while one is in flight."""

from typing import Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from backend.database import (
    PoolExhausted,
    SessionNotFound,
    SessionRepository,
    SessionStatus,
    Worker,
    WorkerRepository,
)


class WorkerAllocator(Protocol):
    """What the session manager needs from the pool, so tests can substitute one."""

    async def bind(self, session_id: UUID) -> Worker: ...

    async def mark_idle(self, session_id: UUID) -> None: ...

    async def release(self, session_id: UUID) -> None: ...


class PoolAllocator:
    """A fixed set of worker rows, claimed for the life of a session.

    The worker stays bound after a run finishes so the next prompt on the same
    session talks to the same desktop — the conversation lives on that worker.
    `RUNNING` is the in-flight lock; `ACTIVE` with a `session_id` on the worker
    is an idle, still-held desktop.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._factory = session_factory

    async def bind(self, session_id: UUID) -> Worker:
        """Mark the session running and return the worker it holds or just claimed."""
        async with self._factory() as db:
            await SessionRepository(db).try_begin_run(session_id)
            workers = WorkerRepository(db)
            worker = await workers.for_session(session_id)
            if worker is None:
                worker = await workers.claim(session_id)
            if worker is None:
                await SessionRepository(db).set_status(session_id, SessionStatus.ACTIVE)
                await db.commit()
                raise PoolExhausted()
            await db.commit()
            return worker

    async def mark_idle(self, session_id: UUID) -> None:
        """The run ended; keep the desktop, allow another prompt."""
        async with self._factory() as db:
            try:
                await SessionRepository(db).set_status(session_id, SessionStatus.ACTIVE)
            except SessionNotFound:
                await db.rollback()
                return
            await db.commit()

    async def release(self, session_id: UUID) -> None:
        """Return the desktop to the pool. Called when the session is deleted."""
        async with self._factory() as db:
            await WorkerRepository(db).release(session_id)
            await db.commit()
