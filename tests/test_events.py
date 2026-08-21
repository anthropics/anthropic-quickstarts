from uuid import uuid4

import pytest
from pydantic import TypeAdapter, ValidationError

from shared.events import (
    AssistantText,
    Event,
    EventPayload,
    EventType,
    InlineScreenshot,
    RunFailed,
    RunFinished,
    ScreenshotRef,
    ToolResult,
    ToolUse,
    WorkerEvent,
)

payload_adapter = TypeAdapter(EventPayload)


def test_event_type_wire_values_are_stable():
    """These strings are the contract; renaming a member must not change them."""
    assert {member.value for member in EventType} == {
        "assistant_text",
        "assistant_thinking",
        "tool_use",
        "tool_result",
        "run_finished",
        "run_failed",
        "run_cancelled",
    }


@pytest.mark.parametrize(
    "payload",
    [
        AssistantText(text="hello"),
        ToolUse(tool_use_id="tu_1", name="computer", input={"action": "screenshot"}),
        ToolResult(tool_use_id="tu_1", output="done"),
        RunFinished(),
        RunFailed(message="overloaded", status_code=529),
    ],
)
def test_payload_round_trips_through_json(payload):
    restored = payload_adapter.validate_json(payload_adapter.dump_json(payload))

    assert restored == payload
    assert type(restored) is type(payload)


def test_payload_is_selected_by_discriminator():
    restored = payload_adapter.validate_python(
        {"type": "tool_use", "tool_use_id": "tu_1", "name": "bash"}
    )

    assert isinstance(restored, ToolUse)
    assert restored.input == {}


def test_unknown_payload_type_is_rejected():
    with pytest.raises(ValidationError):
        payload_adapter.validate_python({"type": "nonsense"})


def test_screenshot_discriminates_inline_from_reference():
    inline = ToolResult(
        tool_use_id="tu_1",
        screenshot=InlineScreenshot(data="aGVsbG8="),
    )
    stored = ToolResult(
        tool_use_id="tu_1",
        screenshot=ScreenshotRef(url="/blobs/abc.png"),
    )

    assert isinstance(
        payload_adapter.validate_json(payload_adapter.dump_json(inline)).screenshot,
        InlineScreenshot,
    )
    assert isinstance(
        payload_adapter.validate_json(payload_adapter.dump_json(stored)).screenshot,
        ScreenshotRef,
    )


def test_tool_result_reports_error_state():
    assert not ToolResult(tool_use_id="tu_1", output="fine").is_error
    assert ToolResult(tool_use_id="tu_1", error="boom").is_error


def test_worker_event_has_no_sequence_number():
    """Ordering belongs to the backend, so `seq` must not be part of the worker's output."""
    assert "seq" not in WorkerEvent.model_fields


def test_from_worker_adds_sequence_and_preserves_the_rest():
    worker_event = WorkerEvent(
        session_id=uuid4(),
        payload=ToolResult(
            tool_use_id="tu_1",
            output="done",
            screenshot=InlineScreenshot(data="aGVsbG8="),
        ),
    )

    event = Event.from_worker(worker_event, seq=7)

    assert event.seq == 7
    assert event.session_id == worker_event.session_id
    assert event.ts == worker_event.ts
    assert event.payload == worker_event.payload


def test_terminal_events_are_marked():
    session_id = uuid4()

    assert WorkerEvent(session_id=session_id, payload=RunFinished()).is_terminal
    assert not WorkerEvent(
        session_id=session_id, payload=AssistantText(text="working")
    ).is_terminal
