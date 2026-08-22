import asyncio
import os
from unittest import mock
from uuid import uuid4

import pytest
from anthropic.types import TextBlock, ToolUseBlock
from anthropic.types.beta import BetaMessage

from shared.events import (
    AssistantText,
    AssistantThinking,
    EventType,
    InlineScreenshot,
    ToolResult,
    ToolUse,
)
from worker.config import WorkerConfig
from worker.runner import AgentWorker, EventEmitter, RunInProgress
from worker.streaming import EventBuffer
from worker.upstream import UpstreamToolResult


def emitter_for() -> tuple[EventEmitter, EventBuffer]:
    buffer = EventBuffer()
    return EventEmitter(uuid4(), buffer), buffer


def payloads(buffer: EventBuffer):
    return [event.payload for event in buffer.snapshot()]


class TestCallbackMapping:
    """The loop reports through three callbacks; these are the only translation."""

    def test_text_block_becomes_assistant_text(self):
        emitter, buffer = emitter_for()

        emitter.on_output({"type": "text", "text": "working on it"})

        assert payloads(buffer) == [AssistantText(text="working on it")]

    def test_thinking_block_becomes_assistant_thinking(self):
        emitter, buffer = emitter_for()

        emitter.on_output({"type": "thinking", "thinking": "consider the screen"})

        assert payloads(buffer) == [AssistantThinking(thinking="consider the screen")]

    def test_tool_use_block_carries_id_name_and_input(self):
        emitter, buffer = emitter_for()

        emitter.on_output(
            {
                "type": "tool_use",
                "id": "tu_1",
                "name": "computer",
                "input": {"action": "screenshot"},
            }
        )

        assert payloads(buffer) == [
            ToolUse(tool_use_id="tu_1", name="computer", input={"action": "screenshot"})
        ]

    def test_unknown_block_types_are_ignored(self):
        emitter, buffer = emitter_for()

        emitter.on_output({"type": "redacted_thinking", "data": "..."})
        emitter.on_output("not a block")

        assert payloads(buffer) == []

    def test_tool_result_screenshot_crosses_the_boundary_inline(self):
        emitter, buffer = emitter_for()

        emitter.on_tool_output(
            UpstreamToolResult(output="ok", base64_image="aGVsbG8="), "tu_1"
        )

        (payload,) = payloads(buffer)
        assert isinstance(payload, ToolResult)
        assert payload.screenshot == InlineScreenshot(data="aGVsbG8=")
        assert not payload.is_error

    def test_tool_error_is_reported_as_an_error(self):
        emitter, buffer = emitter_for()

        emitter.on_tool_output(UpstreamToolResult(error="no such file"), "tu_1")

        (payload,) = payloads(buffer)
        assert payload.error == "no such file"
        assert payload.is_error

    def test_successful_api_exchanges_produce_nothing(self):
        emitter, buffer = emitter_for()

        emitter.on_api_response(mock.Mock(), mock.Mock(), None)

        assert payloads(buffer) == []
        assert not emitter.failed

    def test_api_failure_is_reported_with_its_status(self):
        emitter, buffer = emitter_for()

        emitter.on_api_response(
            mock.Mock(), mock.Mock(status_code=529), RuntimeError("overloaded")
        )

        (payload,) = payloads(buffer)
        assert payload.type is EventType.RUN_FAILED
        assert payload.status_code == 529
        assert emitter.failed


async def drain(run):
    """Wait for a run to settle, ignoring how it ended."""
    await asyncio.gather(run.task, return_exceptions=True)
    # Finalisation runs in a done callback, scheduled for the next iteration.
    await asyncio.sleep(0)
    return [event.payload.type for event in run.buffer.snapshot()]


class TestRunLifecycle:
    """`sampling_loop` is stubbed here; only the worker's own behaviour is under test."""

    async def test_completed_run_ends_with_run_finished(self):
        worker = AgentWorker(WorkerConfig(api_key="test"))

        async def loop(*, output_callback, **_):
            output_callback({"type": "text", "text": "done"})

        with mock.patch("worker.runner.sampling_loop", loop):
            run = await worker.start(uuid4(), "do a thing")
            types = await drain(run)

        assert types == [EventType.ASSISTANT_TEXT, EventType.RUN_FINISHED]
        assert run.buffer.closed

    async def test_api_failure_does_not_also_report_success(self):
        """The loop returns normally after a failed call, so both could be emitted."""
        worker = AgentWorker(WorkerConfig(api_key="test"))

        async def loop(*, api_response_callback, **_):
            api_response_callback(mock.Mock(), None, RuntimeError("boom"))

        with mock.patch("worker.runner.sampling_loop", loop):
            run = await worker.start(uuid4(), "do a thing")
            types = await drain(run)

        assert types == [EventType.RUN_FAILED]

    async def test_unexpected_error_is_reported_not_swallowed(self):
        worker = AgentWorker(WorkerConfig(api_key="test"))

        async def loop(**_):
            raise ValueError("something broke")

        with mock.patch("worker.runner.sampling_loop", loop):
            run = await worker.start(uuid4(), "do a thing")
            types = await drain(run)

        assert types == [EventType.RUN_FAILED]

    async def test_cancelling_reports_run_cancelled(self):
        """The loop has no cancellation of its own; the worker imposes it."""
        worker = AgentWorker(WorkerConfig(api_key="test"))

        async def loop(**_):
            await asyncio.sleep(60)

        with mock.patch("worker.runner.sampling_loop", loop):
            run = await worker.start(uuid4(), "do a thing")
            await asyncio.sleep(0)
            assert await worker.cancel(run.run_id)
            types = await drain(run)

        assert types == [EventType.RUN_CANCELLED]
        assert run.buffer.closed

    async def test_cancelling_before_the_loop_starts_still_ends_the_stream(self):
        """The coroutine of a task cancelled before its first step never runs.

        Nothing inside it can close the buffer, so a reader would wait forever
        for an end that never arrives.
        """
        worker = AgentWorker(WorkerConfig(api_key="test"))

        async def loop(**_):
            await asyncio.sleep(60)

        with mock.patch("worker.runner.sampling_loop", loop):
            run = await worker.start(uuid4(), "do a thing")
            # No await in between, so the run coroutine has not begun.
            assert await worker.cancel(run.run_id)
            types = await drain(run)

        assert types == [EventType.RUN_CANCELLED]
        assert run.buffer.closed

    async def test_one_desktop_means_one_run_at_a_time(self):
        worker = AgentWorker(WorkerConfig(api_key="test"))

        async def loop(**_):
            await asyncio.sleep(60)

        with mock.patch("worker.runner.sampling_loop", loop):
            run = await worker.start(uuid4(), "first")
            await asyncio.sleep(0)
            with pytest.raises(RunInProgress):
                await worker.start(uuid4(), "second")
            await worker.cancel(run.run_id)
            await drain(run)

    async def test_rebinding_to_a_new_session_resets_the_conversation(self):
        """A recycled worker must not hand the next session the previous one's history."""
        worker = AgentWorker(WorkerConfig(api_key="test"))
        seen: list[int] = []

        async def loop(*, messages, **_):
            seen.append(len(messages))

        with mock.patch("worker.runner.sampling_loop", loop):
            first = uuid4()
            await drain(await worker.start(first, "one"))
            await drain(await worker.start(first, "two"))
            await drain(await worker.start(uuid4(), "three"))

        assert seen == [1, 2, 1]


async def test_seam_holds_against_the_real_sampling_loop():
    """Runs upstream's loop for real, with only the API client and tools stubbed.

    This is the check that matters: if upstream changes how it reports progress,
    the callback wiring breaks here rather than in production.
    """
    client = mock.Mock()
    client.beta.messages.with_raw_response.create.return_value = mock.Mock()
    client.beta.messages.with_raw_response.create.return_value.parse.side_effect = [
        mock.Mock(
            spec=BetaMessage,
            content=[
                TextBlock(type="text", text="Taking a look"),
                ToolUseBlock(
                    type="tool_use",
                    id="tu_1",
                    name="computer",
                    input={"action": "screenshot"},
                ),
            ],
        ),
        mock.Mock(spec=BetaMessage, content=[TextBlock(type="text", text="All done")]),
    ]

    # Mock rather than AsyncMock: the loop awaits `run` but calls `to_params`
    # synchronously, and a fully async mock leaves that coroutine un-awaited.
    tool_collection = mock.Mock()
    tool_collection.to_params.return_value = []
    tool_collection.run = mock.AsyncMock(
        return_value=UpstreamToolResult(
            output="screenshot taken", base64_image="aGVsbG8="
        )
    )

    worker = AgentWorker(
        WorkerConfig(api_key="test", tool_version="computer_use_20250124")
    )

    with (
        # Patching ToolCollection does not stop the tool classes being built as
        # its arguments, and ComputerTool asserts on the display environment.
        mock.patch.dict(
            os.environ, {"WIDTH": "1024", "HEIGHT": "768", "DISPLAY_NUM": "1"}
        ),
        mock.patch("computer_use_demo.loop.Anthropic", return_value=client),
        mock.patch(
            "computer_use_demo.loop.ToolCollection", return_value=tool_collection
        ),
    ):
        run = await worker.start(uuid4(), "take a screenshot")
        types = await drain(run)

    assert types == [
        EventType.ASSISTANT_TEXT,
        EventType.TOOL_USE,
        EventType.TOOL_RESULT,
        EventType.ASSISTANT_TEXT,
        EventType.RUN_FINISHED,
    ]

    tool_result = run.buffer.snapshot()[2].payload
    assert tool_result.tool_use_id == "tu_1"
    assert tool_result.screenshot == InlineScreenshot(data="aGVsbG8=")
