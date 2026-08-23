"""Prompts going through a real fake-worker to persisted, streamed events."""

import asyncio
import base64
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient

from backend.app import create_app
from backend.config import Settings
from shared.events import (
    AssistantText,
    EventType,
    InlineScreenshot,
    ToolResult,
    ToolUse,
)
from tests.conftest import serve_app
from tests.sse import SSEReader, read_sse_frames
from worker.fake import create_fake_worker

PNG = b"\x89PNG\r\n\x1a\nfake image bytes"

SCRIPT = [
    AssistantText(text="looking at the screen"),
    ToolUse(tool_use_id="tu_1", name="computer", input={"action": "screenshot"}),
    ToolResult(
        tool_use_id="tu_1",
        output="screenshot taken",
        screenshot=InlineScreenshot(data=base64.b64encode(PNG).decode()),
    ),
    AssistantText(text="done"),
]


@pytest.fixture
async def worker_url():
    async with serve_app(create_fake_worker(SCRIPT, delay=0.05)) as (url, _app):
        yield url


@pytest.fixture
async def backend(settings: Settings, worker_url: str):
    app = create_app(
        Settings(
            database_url=settings.database_url,
            blob_dir=settings.blob_dir,
            worker_urls=(worker_url,),
        )
    )
    async with serve_app(app) as (url, started):
        async with AsyncClient(base_url=url, timeout=None) as client:
            yield started, client


async def create_session(client) -> UUID:
    response = await client.post("/sessions", json={"title": "prompted"})
    assert response.status_code == 201
    return UUID(response.json()["id"])


async def wait_until_active(client, session_id: UUID) -> None:
    for _ in range(50):
        body = (await client.get(f"/sessions/{session_id}")).json()
        if body["status"] == "active":
            return
        await asyncio.sleep(0.05)
    raise AssertionError("session did not become active")


class TestPrompt:
    async def test_a_prompt_is_accepted_and_the_session_runs(self, backend):
        _app, client = backend
        session_id = await create_session(client)

        response = await client.post(
            f"/sessions/{session_id}/messages", json={"prompt": "take a screenshot"}
        )

        assert response.status_code == 202
        assert response.json()["session_id"] == str(session_id)
        assert (await client.get(f"/sessions/{session_id}")).json()["status"] == (
            "running"
        )

    async def test_worker_events_land_on_the_session_stream(self, backend):
        _app, client = backend
        session_id = await create_session(client)
        await client.post(
            f"/sessions/{session_id}/messages", json={"prompt": "take a screenshot"}
        )

        async with client.stream("GET", f"/sessions/{session_id}/events") as response:
            frames = await read_sse_frames(response, 5)

        assert [frame["event"] for frame in frames] == [
            EventType.ASSISTANT_TEXT,
            EventType.TOOL_USE,
            EventType.TOOL_RESULT,
            EventType.ASSISTANT_TEXT,
            EventType.RUN_FINISHED,
        ]
        assert [frame["id"] for frame in frames] == [0, 1, 2, 3, 4]
        assert frames[0]["data"]["payload"]["text"] == "looking at the screen"

    async def test_an_inline_screenshot_becomes_a_reference(self, backend):
        _app, client = backend
        session_id = await create_session(client)
        await client.post(
            f"/sessions/{session_id}/messages", json={"prompt": "take a screenshot"}
        )

        async with client.stream("GET", f"/sessions/{session_id}/events") as response:
            frames = await read_sse_frames(response, 5)

        screenshot = frames[2]["data"]["payload"]["screenshot"]
        assert screenshot["kind"] == "ref"
        assert screenshot["url"].startswith("/blobs/")

    async def test_a_second_prompt_reuses_the_session_after_the_run(self, backend):
        _app, client = backend
        session_id = await create_session(client)
        first = await client.post(
            f"/sessions/{session_id}/messages", json={"prompt": "first"}
        )
        await wait_until_active(client, session_id)

        second = await client.post(
            f"/sessions/{session_id}/messages", json={"prompt": "second"}
        )

        assert second.status_code == 202
        assert second.json()["run_id"] != first.json()["run_id"]

    async def test_a_second_prompt_while_running_conflicts(self, backend):
        _app, client = backend
        session_id = await create_session(client)
        await client.post(f"/sessions/{session_id}/messages", json={"prompt": "first"})

        response = await client.post(
            f"/sessions/{session_id}/messages", json={"prompt": "second"}
        )

        assert response.status_code == 409

    async def test_an_empty_prompt_is_rejected(self, backend):
        _app, client = backend
        session_id = await create_session(client)

        response = await client.post(
            f"/sessions/{session_id}/messages", json={"prompt": ""}
        )

        assert response.status_code == 422

    async def test_an_unknown_session_is_not_found(self, backend):
        _app, client = backend
        response = await client.post(
            f"/sessions/{uuid4()}/messages", json={"prompt": "hello"}
        )

        assert response.status_code == 404


class TestPoolCapacity:
    async def test_a_full_pool_is_unavailable(
        self, settings: Settings, worker_url: str
    ):
        app = create_app(
            Settings(
                database_url=settings.database_url,
                blob_dir=settings.blob_dir,
                worker_urls=(worker_url,),
                pool_retry_after_seconds=9,
            )
        )
        async with serve_app(app) as (url, _started):
            async with AsyncClient(base_url=url, timeout=None) as client:
                first = await create_session(client)
                second = await create_session(client)
                accepted = await client.post(
                    f"/sessions/{first}/messages", json={"prompt": "one"}
                )
                rejected = await client.post(
                    f"/sessions/{second}/messages", json={"prompt": "two"}
                )

        assert accepted.status_code == 202
        assert rejected.status_code == 503
        assert rejected.headers["retry-after"] == "9"


class TestLiveHandoff:
    async def test_events_arrive_on_a_stream_opened_before_the_prompt(self, backend):
        _app, client = backend
        session_id = await create_session(client)

        async with client.stream("GET", f"/sessions/{session_id}/events") as response:
            reader = SSEReader(response)
            await client.post(f"/sessions/{session_id}/messages", json={"prompt": "go"})
            frames = await reader.take(5)

        assert frames[-1]["event"] == EventType.RUN_FINISHED
