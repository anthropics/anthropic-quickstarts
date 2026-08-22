"""Drives Anthropic's sampling loop and reports it as `shared.events`."""

import asyncio
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID, uuid4

from anthropic.types.beta import BetaMessageParam

from shared.events import (
    AssistantText,
    AssistantThinking,
    EventPayload,
    InlineScreenshot,
    RunCancelled,
    RunFailed,
    RunFinished,
    ToolResult,
    ToolUse,
    WorkerEvent,
)
from worker.config import WorkerConfig
from worker.streaming import EventBuffer
from worker.upstream import UpstreamToolResult, sampling_loop


class RunInProgress(Exception):
    """Raised when a run is requested while the desktop is already busy."""


@dataclass
class Run:
    run_id: UUID
    session_id: UUID
    buffer: EventBuffer
    task: asyncio.Task[None]

    @property
    def active(self) -> bool:
        return not self.task.done()


def finalize_on_completion(
    task: asyncio.Task[None], session_id: UUID, buffer: EventBuffer
) -> None:
    """Guarantee the buffer closes once the task ends, however it ends.

    Finalising inside the coroutine is not enough: a task cancelled before its
    first step never executes its body, so neither an `except CancelledError`
    handler nor a `finally` block runs, and readers of the buffer would wait
    for an end that never comes.
    """

    def on_done(completed: asyncio.Task[None]) -> None:
        if completed.cancelled():
            buffer.append(WorkerEvent(session_id=session_id, payload=RunCancelled()))
        buffer.close()

    task.add_done_callback(on_done)


async def cancel_active_runs(runs: Iterable[Run]) -> None:
    """Stop runs still in flight and wait for them to finish unwinding.

    Cancelling rather than abandoning is what lets `finalize_on_completion` run,
    so a client on the stream is told the run was cancelled instead of waiting
    for an end that is never coming.
    """
    active = [run for run in runs if run.active]
    for run in active:
        run.task.cancel()
    # return_exceptions keeps the cancellations we just asked for from
    # propagating out of a shutdown path.
    await asyncio.gather(*(run.task for run in active), return_exceptions=True)


class Runner(Protocol):
    """What the API needs from a runner, so the fake can stand in for the real one."""

    async def start(self, session_id: UUID, prompt: str) -> Run: ...

    def get_run(self, run_id: UUID) -> Run | None: ...

    async def cancel(self, run_id: UUID) -> bool: ...

    async def shutdown(self) -> None: ...


class EventEmitter:
    """Turns the loop's three callbacks into events on a buffer.

    The callbacks are synchronous and fire from inside the loop, so everything
    here only appends; nothing awaits.
    """

    def __init__(self, session_id: UUID, buffer: EventBuffer) -> None:
        self._session_id = session_id
        self._buffer = buffer
        self.failed = False

    def emit(self, payload: EventPayload) -> None:
        self._buffer.append(WorkerEvent(session_id=self._session_id, payload=payload))

    def on_output(self, block: Any) -> None:
        if not isinstance(block, dict):
            return
        match block.get("type"):
            case "text":
                self.emit(AssistantText(text=block.get("text") or ""))
            case "thinking":
                self.emit(AssistantThinking(thinking=block.get("thinking") or ""))
            case "tool_use":
                self.emit(
                    ToolUse(
                        tool_use_id=block["id"],
                        name=block["name"],
                        input=block.get("input") or {},
                    )
                )

    def on_tool_output(self, result: UpstreamToolResult, tool_use_id: str) -> None:
        screenshot = (
            InlineScreenshot(data=result.base64_image) if result.base64_image else None
        )
        self.emit(
            ToolResult(
                tool_use_id=tool_use_id,
                output=result.output,
                error=result.error,
                system=result.system,
                screenshot=screenshot,
            )
        )

    def on_api_response(
        self, request: Any, response: Any, error: Exception | None
    ) -> None:
        """Only failures surface; successful exchanges are debug detail we drop."""
        if error is None:
            return
        self.failed = True
        self.emit(
            RunFailed(
                message=str(error),
                status_code=getattr(response, "status_code", None),
            )
        )


class AgentWorker:
    """Owns one desktop's conversation and the run currently using it.

    A worker drives a single desktop, so only one run is active at a time. The
    conversation lives here rather than arriving with each request: the worker
    is bound to a session for that session's lifetime, and rebuilding Anthropic
    message params from persisted events is the backend's job later on. Binding
    to a different session resets the conversation, which is what makes a
    recycled worker safe to hand to the next session.
    """

    def __init__(self, config: WorkerConfig) -> None:
        self._config = config
        self._session_id: UUID | None = None
        self._messages: list[BetaMessageParam] = []
        self._runs: dict[UUID, Run] = {}
        self._active: Run | None = None

    @property
    def session_id(self) -> UUID | None:
        return self._session_id

    def get_run(self, run_id: UUID) -> Run | None:
        return self._runs.get(run_id)

    async def start(self, session_id: UUID, prompt: str) -> Run:
        if self._active is not None and self._active.active:
            raise RunInProgress(
                f"run {self._active.run_id} is still using this desktop"
            )
        if session_id != self._session_id:
            self._session_id = session_id
            self._messages = []

        buffer = EventBuffer()
        emitter = EventEmitter(session_id, buffer)
        task = asyncio.create_task(self._drive(prompt, emitter))
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
        """Stop the desktop's work when the process is going away."""
        await cancel_active_runs(self._runs.values())

    async def _drive(self, prompt: str, emitter: EventEmitter) -> None:
        """Cancellation and buffer closure are handled by `finalize_on_completion`."""
        self._messages.append({"role": "user", "content": prompt})
        try:
            await sampling_loop(
                model=self._config.model,
                provider=self._config.provider,
                system_prompt_suffix=self._config.system_prompt_suffix,
                messages=self._messages,
                output_callback=emitter.on_output,
                tool_output_callback=emitter.on_tool_output,
                api_response_callback=emitter.on_api_response,
                api_key=self._config.api_key,
                only_n_most_recent_images=self._config.only_n_most_recent_images,
                max_tokens=self._config.max_tokens,
                tool_version=self._config.tool_version,
                thinking_mode=self._config.thinking_mode,
                thinking_effort=self._config.thinking_effort,
            )
        except Exception as exc:  # noqa: BLE001 - reported, not swallowed
            emitter.emit(RunFailed(message=str(exc)))
        else:
            # A failure reported through api_response_callback already ended the
            # loop; do not also claim it finished.
            if not emitter.failed:
                emitter.emit(RunFinished())
