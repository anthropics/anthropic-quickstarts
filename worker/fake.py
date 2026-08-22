"""A stand-in worker that replays a scripted run.

Later steps test the backend against this instead of against a real desktop and
a real API key. It is assembled by the same `create_app` as the real worker, so
a test that passes here exercises the production request and response shapes,
and the fake cannot quietly drift from the contract.
"""

import asyncio
from collections.abc import Sequence
from uuid import UUID, uuid4

from fastapi import FastAPI

from shared.events import (
    TERMINAL_EVENT_TYPES,
    EventPayload,
    RunFinished,
    WorkerEvent,
)
from worker.api import create_app
from worker.runner import (
    Run,
    RunInProgress,
    cancel_active_runs,
    finalize_on_completion,
)
from worker.streaming import EventBuffer


class FakeRunner:
    """Replays a fixed list of payloads as though an agent had produced them.

    `delay` spaces the events out; leave it at zero for tests that only care
    about the final history, and raise it for tests that need to observe a run
    in progress.
    """

    def __init__(self, script: Sequence[EventPayload], *, delay: float = 0.0) -> None:
        self._script = list(script)
        self._delay = delay
        self._runs: dict[UUID, Run] = {}
        self._active: Run | None = None
        self.prompts: list[str] = []

    def get_run(self, run_id: UUID) -> Run | None:
        return self._runs.get(run_id)

    async def start(self, session_id: UUID, prompt: str) -> Run:
        if self._active is not None and self._active.active:
            raise RunInProgress(
                f"run {self._active.run_id} is still using this desktop"
            )
        self.prompts.append(prompt)
        buffer = EventBuffer()
        task = asyncio.create_task(self._replay(session_id, buffer))
        finalize_on_completion(task, session_id, buffer)
        run = Run(run_id=uuid4(), session_id=session_id, buffer=buffer, task=task)
        self._runs[run.run_id] = run
        self._active = run
        return run

    async def cancel(self, run_id: UUID) -> bool:
        run = self._runs.get(run_id)
        if run is None or not run.active:
            return False
        run.task.cancel()
        return True

    async def shutdown(self) -> None:
        await cancel_active_runs(self._runs.values())

    async def _replay(self, session_id: UUID, buffer: EventBuffer) -> None:
        """Cancellation and buffer closure are handled by `finalize_on_completion`."""

        def append(payload: EventPayload) -> None:
            buffer.append(WorkerEvent(session_id=session_id, payload=payload))

        for payload in self._script:
            if self._delay:
                await asyncio.sleep(self._delay)
            append(payload)
        if not self._script or self._script[-1].type not in TERMINAL_EVENT_TYPES:
            append(RunFinished())


def create_fake_worker(
    script: Sequence[EventPayload], *, delay: float = 0.0
) -> FastAPI:
    return create_app(
        lambda: FakeRunner(script, delay=delay),
        title="Fake Computer Use Agent Worker",
    )
