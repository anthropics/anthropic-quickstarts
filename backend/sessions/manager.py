"""Start a run on a bound worker and pump its events into the publisher."""

import asyncio
from uuid import UUID

import httpx

from backend.database import SessionBusy, SessionStatus
from backend.sessions.allocator import WorkerAllocator
from backend.sessions.worker_client import (
    WorkerClient,
    WorkerConflict,
    WorkerUnreachable,
)
from backend.streaming import EventPublisher
from shared.events import RunFailed, WorkerEvent


class SessionManager:
    """The path from a prompt to persisted, live-broadcast events.

    Binds a worker (or reuses the one this session already holds), starts a
    run, and copies each worker event through `EventPublisher` — which is
    where `seq` is assigned and inline screenshots become references.
    """

    def __init__(
        self,
        allocator: WorkerAllocator,
        publisher: EventPublisher,
        http: httpx.AsyncClient,
    ) -> None:
        self._allocator = allocator
        self._publisher = publisher
        self._workers = WorkerClient(http)
        self._http = http
        self._pumps: dict[UUID, asyncio.Task[None]] = {}
        self._runs: dict[UUID, tuple[str, UUID]] = {}

    async def start(self, session_id: UUID, prompt: str) -> UUID:
        worker = await self._allocator.bind(session_id)
        try:
            run = await self._workers.start(worker.base_url, session_id, prompt)
        except WorkerConflict as exc:
            await self._allocator.mark_idle(session_id)
            raise SessionBusy(session_id, SessionStatus.RUNNING) from exc
        except Exception:
            await self._allocator.mark_idle(session_id)
            raise
        task = asyncio.create_task(self._pump(session_id, worker.base_url, run.run_id))
        self._pumps[session_id] = task
        self._runs[session_id] = (worker.base_url, run.run_id)
        task.add_done_callback(lambda _: self._pumps.pop(session_id, None))
        return run.run_id

    async def cancel(self, session_id: UUID) -> bool:
        run = self._runs.get(session_id)
        if run is None:
            return False
        base_url, run_id = run
        await self._workers.cancel(base_url, run_id)
        return True

    async def shutdown(self) -> None:
        for session_id in list(self._runs):
            await self.cancel(session_id)
        pumps = list(self._pumps.values())
        if pumps:
            await asyncio.gather(*pumps, return_exceptions=True)
        await self._http.aclose()

    async def _pump(self, session_id: UUID, base_url: str, run_id: UUID) -> None:
        try:
            async for event in self._workers.events(base_url, run_id):
                await self._publisher.publish([event])
                if event.is_terminal:
                    return
        except WorkerUnreachable as exc:
            await self._publisher.publish(
                [
                    WorkerEvent(
                        session_id=session_id, payload=RunFailed(message=str(exc))
                    )
                ]
            )
        finally:
            self._runs.pop(session_id, None)
            await self._allocator.mark_idle(session_id)
