"""The worker's HTTP contract, exercised through the fake.

The fake is assembled by the same `create_app` as the real worker, so these
also pin the shapes the backend will be written against.
"""

import json
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from shared.events import AssistantText, EventType, RunFinished, ToolUse
from worker.fake import create_fake_worker

SCRIPT = [
    AssistantText(text="looking at the screen"),
    ToolUse(tool_use_id="tu_1", name="computer", input={"action": "screenshot"}),
    AssistantText(text="all done"),
]


@asynccontextmanager
async def client_for(app):
    """A client that also runs the app's lifespan.

    The ASGI transport does not send lifespan events by itself, so without this
    the shutdown path would go untested — and a test that leaves a run in flight
    would abandon its task when the loop closes.
    """
    async with (
        LifespanManager(app) as manager,
        AsyncClient(
            transport=ASGITransport(app=manager.app), base_url="http://worker"
        ) as client,
    ):
        yield client


def parse_sse(body: str) -> list[dict]:
    """Pull `id` and decoded `data` out of an SSE body."""
    frames = []
    for block in body.strip().split("\n\n"):
        if not block.strip():
            continue
        fields = dict(
            line.split(": ", 1) for line in block.splitlines() if ": " in line
        )
        frames.append(
            {
                "id": int(fields["id"]),
                "event": fields["event"],
                "data": json.loads(fields["data"]),
            }
        )
    return frames


async def start_run(client, session_id=None):
    response = await client.post(
        "/runs", json={"session_id": str(session_id or uuid4()), "prompt": "do a thing"}
    )
    assert response.status_code == 201
    return response.json()["run_id"]


async def test_health_reports_ok():
    async with client_for(create_fake_worker(SCRIPT)) as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_starting_a_run_returns_its_identifiers():
    session_id = uuid4()
    async with client_for(create_fake_worker(SCRIPT)) as client:
        response = await client.post(
            "/runs", json={"session_id": str(session_id), "prompt": "do a thing"}
        )

    assert response.status_code == 201
    assert response.json()["session_id"] == str(session_id)


async def test_empty_prompt_is_rejected():
    async with client_for(create_fake_worker(SCRIPT)) as client:
        response = await client.post(
            "/runs", json={"session_id": str(uuid4()), "prompt": ""}
        )

    assert response.status_code == 422


async def test_stream_carries_the_run_and_ends_with_a_terminal_event():
    app = create_fake_worker(SCRIPT)
    async with client_for(app) as client:
        run_id = await start_run(client)
        response = await client.get(f"/runs/{run_id}/events")

    frames = parse_sse(response.text)

    assert response.headers["content-type"].startswith("text/event-stream")
    assert [frame["event"] for frame in frames] == [
        EventType.ASSISTANT_TEXT,
        EventType.TOOL_USE,
        EventType.ASSISTANT_TEXT,
        EventType.RUN_FINISHED,
    ]
    assert [frame["id"] for frame in frames] == [0, 1, 2, 3]
    assert frames[0]["data"]["payload"]["text"] == "looking at the screen"


async def test_script_ending_in_a_terminal_event_is_not_given_another():
    app = create_fake_worker([AssistantText(text="done"), RunFinished()])
    async with client_for(app) as client:
        run_id = await start_run(client)
        response = await client.get(f"/runs/{run_id}/events")

    assert [frame["event"] for frame in parse_sse(response.text)] == [
        EventType.ASSISTANT_TEXT,
        EventType.RUN_FINISHED,
    ]


@pytest.mark.parametrize(
    ("query", "headers"),
    [
        ({"from": 2}, {}),
        ({}, {"Last-Event-ID": "1"}),
    ],
    ids=["from-query", "last-event-id-header"],
)
async def test_a_reader_can_resume_instead_of_replaying_everything(query, headers):
    """A backend that reconnects mid-run must not be handed the events it already has."""
    app = create_fake_worker(SCRIPT)
    async with client_for(app) as client:
        run_id = await start_run(client)
        response = await client.get(
            f"/runs/{run_id}/events", params=query, headers=headers
        )

    frames = parse_sse(response.text)

    assert [frame["id"] for frame in frames] == [2, 3]


async def test_run_status_reports_progress():
    app = create_fake_worker(SCRIPT)
    async with client_for(app) as client:
        run_id = await start_run(client)
        await client.get(f"/runs/{run_id}/events")
        response = await client.get(f"/runs/{run_id}")

    body = response.json()
    assert body["active"] is False
    assert body["event_count"] == 4


async def test_a_second_run_is_refused_while_the_desktop_is_busy():
    app = create_fake_worker(SCRIPT, delay=0.05)
    async with client_for(app) as client:
        await start_run(client)
        response = await client.post(
            "/runs", json={"session_id": str(uuid4()), "prompt": "second"}
        )

    assert response.status_code == 409


async def test_cancelling_a_run_reports_it_as_cancelled():
    app = create_fake_worker(SCRIPT, delay=0.05)
    async with client_for(app) as client:
        run_id = await start_run(client)
        cancel = await client.post(f"/runs/{run_id}/cancel")
        response = await client.get(f"/runs/{run_id}/events")

    assert cancel.status_code == 202
    assert parse_sse(response.text)[-1]["event"] == EventType.RUN_CANCELLED


async def test_shutdown_ends_a_run_still_in_flight():
    """A worker going away has to end its run rather than abandon it."""
    app = create_fake_worker(SCRIPT, delay=0.05)
    async with client_for(app) as client:
        run_id = await start_run(client)
        run = app.state.runner.get_run(UUID(run_id))
        assert run.active

    assert not run.active
    assert run.buffer.closed
    assert run.buffer.snapshot()[-1].payload.type == EventType.RUN_CANCELLED


async def test_cancelling_a_finished_run_conflicts():
    app = create_fake_worker(SCRIPT)
    async with client_for(app) as client:
        run_id = await start_run(client)
        await client.get(f"/runs/{run_id}/events")
        response = await client.post(f"/runs/{run_id}/cancel")

    assert response.status_code == 409


@pytest.mark.parametrize(
    "path", ["/runs/{run_id}", "/runs/{run_id}/events", "/runs/{run_id}/cancel"]
)
async def test_unknown_runs_are_not_found(path):
    app = create_fake_worker(SCRIPT)
    url = path.format(run_id=uuid4())
    async with client_for(app) as client:
        response = (
            await client.post(url) if url.endswith("cancel") else await client.get(url)
        )

    assert response.status_code == 404
