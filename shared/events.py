"""The event contract between the agent worker and the backend.

The worker emits a `WorkerEvent` for each thing the agent does. The backend
assigns a per-session sequence number, persists the result as an `Event`, and
republishes it to clients. Both sides import this module, so it is copied into
both container images.

Two asymmetries are deliberate:

- Only `Event` carries `seq`. Ordering belongs to the backend, which is the one
  writer per session; a worker has no way to know where its output falls in the
  session's history.
- Screenshots cross the worker boundary inline as base64 and reach clients as a
  reference, because the worker has no access to the blob store. `Screenshot`
  models both states so the handover is explicit rather than implied.
"""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class EventType(StrEnum):
    """Wire values for the event discriminator."""

    ASSISTANT_TEXT = "assistant_text"
    ASSISTANT_THINKING = "assistant_thinking"
    TOOL_USE = "tool_use"
    TOOL_RESULT = "tool_result"
    RUN_FINISHED = "run_finished"
    RUN_FAILED = "run_failed"
    RUN_CANCELLED = "run_cancelled"


class InlineScreenshot(BaseModel):
    """A screenshot as the worker produces it."""

    kind: Literal["inline"] = "inline"
    media_type: str = "image/png"
    data: str


class ScreenshotRef(BaseModel):
    """A screenshot the backend has written to the blob store."""

    kind: Literal["ref"] = "ref"
    url: str


Screenshot = Annotated[
    InlineScreenshot | ScreenshotRef,
    Field(discriminator="kind"),
]


class AssistantText(BaseModel):
    type: Literal[EventType.ASSISTANT_TEXT] = EventType.ASSISTANT_TEXT
    text: str


class AssistantThinking(BaseModel):
    type: Literal[EventType.ASSISTANT_THINKING] = EventType.ASSISTANT_THINKING
    thinking: str


class ToolUse(BaseModel):
    type: Literal[EventType.TOOL_USE] = EventType.TOOL_USE
    tool_use_id: str
    name: str
    input: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    """Mirrors the fields of the upstream `ToolResult` dataclass."""

    type: Literal[EventType.TOOL_RESULT] = EventType.TOOL_RESULT
    tool_use_id: str
    output: str | None = None
    error: str | None = None
    system: str | None = None
    screenshot: Screenshot | None = None

    @property
    def is_error(self) -> bool:
        return self.error is not None


class RunFinished(BaseModel):
    """The loop returned because the model stopped requesting tools."""

    type: Literal[EventType.RUN_FINISHED] = EventType.RUN_FINISHED


class RunFailed(BaseModel):
    """The loop returned early because an API call failed."""

    type: Literal[EventType.RUN_FAILED] = EventType.RUN_FAILED
    message: str
    status_code: int | None = None


class RunCancelled(BaseModel):
    """The run was cancelled from outside; the loop has no cancellation of its own."""

    type: Literal[EventType.RUN_CANCELLED] = EventType.RUN_CANCELLED


EventPayload = Annotated[
    AssistantText
    | AssistantThinking
    | ToolUse
    | ToolResult
    | RunFinished
    | RunFailed
    | RunCancelled,
    Field(discriminator="type"),
]

TERMINAL_EVENT_TYPES = frozenset(
    {EventType.RUN_FINISHED, EventType.RUN_FAILED, EventType.RUN_CANCELLED}
)


def _utcnow() -> datetime:
    return datetime.now(tz=UTC)


class WorkerEvent(BaseModel):
    """An event as the worker emits it, before the backend orders it."""

    session_id: UUID
    payload: EventPayload
    ts: datetime = Field(default_factory=_utcnow)

    @property
    def is_terminal(self) -> bool:
        return self.payload.type in TERMINAL_EVENT_TYPES


class Event(WorkerEvent):
    """A worker event placed in its session's order and persisted."""

    seq: int

    @classmethod
    def from_worker(cls, event: WorkerEvent, seq: int) -> "Event":
        return cls(seq=seq, **event.model_dump())
