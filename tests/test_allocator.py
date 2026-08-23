"""Claiming a desktop, and refusing a second run while one is in flight."""

import asyncio

import pytest
from sqlalchemy import update
from sqlalchemy.dialects import postgresql

from backend.database import (
    PoolExhausted,
    SessionBusy,
    SessionNotFound,
    SessionRepository,
    SessionStatus,
    Worker,
    WorkerRepository,
)
from backend.database.repositories import _free_worker_id
from backend.sessions import PoolAllocator


async def _session(db):
    return await SessionRepository(db).create()


async def _worker(db, name="worker-1"):
    return await WorkerRepository(db).register(
        name=name, base_url=f"http://{name}:8000"
    )


class TestBeginRun:
    async def test_an_active_session_becomes_running(self, db):
        session = await _session(db)

        await SessionRepository(db).try_begin_run(session.id)

        assert (await SessionRepository(db).get(session.id)).status is (
            SessionStatus.RUNNING
        )

    async def test_a_second_begin_is_busy(self, db):
        session = await _session(db)
        sessions = SessionRepository(db)
        await sessions.try_begin_run(session.id)

        with pytest.raises(SessionBusy):
            await sessions.try_begin_run(session.id)

    async def test_an_unknown_session_is_not_found(self, db):
        from uuid import uuid4

        with pytest.raises(SessionNotFound):
            await SessionRepository(db).try_begin_run(uuid4())


class TestClaim:
    async def test_a_free_worker_is_bound_to_the_session(self, db):
        session = await _session(db)
        await _worker(db)

        claimed = await WorkerRepository(db).claim(session.id)

        assert claimed is not None
        assert claimed.session_id == session.id
        assert claimed.claimed_at is not None

    async def test_an_empty_pool_returns_nothing(self, db):
        session = await _session(db)

        assert await WorkerRepository(db).claim(session.id) is None

    async def test_two_sessions_do_not_get_the_same_worker(self, db):
        first = await _session(db)
        second = await _session(db)
        await _worker(db)

        workers = WorkerRepository(db)
        one = await workers.claim(first.id)
        other = await workers.claim(second.id)

        assert one is not None
        assert other is None

    async def test_release_returns_the_worker_to_the_pool(self, db):
        session = await _session(db)
        await _worker(db)
        workers = WorkerRepository(db)
        await workers.claim(session.id)

        await workers.release(session.id)
        other = await _session(db)

        assert (await workers.claim(other.id)) is not None


class TestPoolAllocator:
    async def test_bind_claims_a_free_worker_and_marks_the_session_running(
        self, session_factory
    ):
        async with session_factory() as db:
            session = await _session(db)
            worker = await _worker(db)
            await db.commit()
            session_id, worker_id = session.id, worker.id

        bound = await PoolAllocator(session_factory).bind(session_id)

        assert bound.id == worker_id
        async with session_factory() as db:
            assert (await SessionRepository(db).get(session_id)).status is (
                SessionStatus.RUNNING
            )

    async def test_a_later_bind_reuses_the_same_worker(self, session_factory):
        async with session_factory() as db:
            session = await _session(db)
            await _worker(db)
            await db.commit()
            session_id = session.id

        allocator = PoolAllocator(session_factory)
        first = await allocator.bind(session_id)
        await allocator.mark_idle(session_id)
        second = await allocator.bind(session_id)

        assert second.id == first.id

    async def test_a_running_session_cannot_bind_again(self, session_factory):
        async with session_factory() as db:
            session = await _session(db)
            await _worker(db)
            await db.commit()
            session_id = session.id

        allocator = PoolAllocator(session_factory)
        await allocator.bind(session_id)

        with pytest.raises(SessionBusy):
            await allocator.bind(session_id)

    async def test_an_empty_pool_is_exhausted_and_the_session_stays_active(
        self, session_factory
    ):
        async with session_factory() as db:
            session = await _session(db)
            await db.commit()
            session_id = session.id

        with pytest.raises(PoolExhausted):
            await PoolAllocator(session_factory).bind(session_id)

        async with session_factory() as db:
            assert (await SessionRepository(db).get(session_id)).status is (
                SessionStatus.ACTIVE
            )

    async def test_two_sessions_cannot_claim_the_same_worker(self, session_factory):
        async with session_factory() as db:
            first = await _session(db)
            second = await _session(db)
            await _worker(db)
            await db.commit()
            first_id, second_id = first.id, second.id

        allocator = PoolAllocator(session_factory)
        results = await asyncio.gather(
            allocator.bind(first_id),
            allocator.bind(second_id),
            return_exceptions=True,
        )

        bound = [item for item in results if not isinstance(item, Exception)]
        exhausted = [item for item in results if isinstance(item, PoolExhausted)]
        assert len(bound) == 1
        assert len(exhausted) == 1

    async def test_release_makes_the_worker_claimable_again(self, session_factory):
        async with session_factory() as db:
            session = await _session(db)
            other = await _session(db)
            await _worker(db)
            await db.commit()
            session_id, other_id = session.id, other.id

        allocator = PoolAllocator(session_factory)
        await allocator.bind(session_id)
        await allocator.release(session_id)
        await allocator.mark_idle(session_id)

        bound = await allocator.bind(other_id)
        assert bound.session_id == other_id


class TestClaimDialect:
    def test_postgres_skips_locked_rows(self):
        compiled = str(
            update(Worker)
            .where(Worker.id == _free_worker_id(skip_locked=True))
            .values(session_id=None)
            .compile(dialect=postgresql.dialect())
        )

        assert "FOR UPDATE SKIP LOCKED" in compiled

    def test_sqlite_claim_has_no_skip_locked(self):
        compiled = str(
            update(Worker)
            .where(Worker.id == _free_worker_id(skip_locked=False))
            .values(session_id=None)
        )

        assert "SKIP LOCKED" not in compiled
