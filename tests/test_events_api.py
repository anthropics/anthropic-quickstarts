"""GET /sessions/{id}/events, driven by a synthetic producer.

The producer is `EventPublisher` — persist, then fan out — which is the same
path a worker will use. Reconnect cases are reachable because the producer
can emit while no client is connected, and again after one has left.

Streaming tests go through a real HTTP server: httpx's ASGI transport does
not yield from an open-ended stream, so reading N frames and leaving the
connection open is otherwise impossible.
"""

from uuid import UUID, uuid4

import pytest

from shared.events import AssistantText, EventType, WorkerEvent
from tests.sse import SSEReader, parse_sse, read_sse_frames


async def create_session(client) -> UUID:
    response = await client.post("/sessions", json={"title": "streamed"})
    assert response.status_code == 201
    return UUID(response.json()["id"])


async def produce(app, session_id: UUID, *texts: str):
    """The synthetic producer: one persist-then-publish per call."""
    return await app.state.event_publisher.publish(
        [
            WorkerEvent(session_id=session_id, payload=AssistantText(text=text))
            for text in texts
        ]
    )


@pytest.fixture
def app(live_backend):
    return live_backend[0]


@pytest.fixture
def client(live_backend):
    return live_backend[1]


class TestReplay:
    async def test_stored_events_are_replayed_in_order(self, app, client):
        session_id = await create_session(client)
        await produce(app, session_id, "one", "two", "three")

        async with client.stream("GET", f"/sessions/{session_id}/events") as response:
            frames = await read_sse_frames(response, 3)

        assert response.headers["content-type"].startswith("text/event-stream")
        assert [frame["id"] for frame in frames] == [0, 1, 2]
        assert [frame["event"] for frame in frames] == [
            EventType.ASSISTANT_TEXT,
            EventType.ASSISTANT_TEXT,
            EventType.ASSISTANT_TEXT,
        ]
        assert [frame["data"]["payload"]["text"] for frame in frames] == [
            "one",
            "two",
            "three",
        ]

    @pytest.mark.parametrize(
        ("query", "headers"),
        [
            ({"from": 2}, {}),
            ({}, {"Last-Event-ID": "1"}),
        ],
        ids=["from-query", "last-event-id-header"],
    )
    async def test_a_reader_can_resume_instead_of_replaying_everything(
        self, app, client, query, headers
    ):
        session_id = await create_session(client)
        await produce(app, session_id, "zero", "one", "two", "three")

        async with client.stream(
            "GET", f"/sessions/{session_id}/events", params=query, headers=headers
        ) as response:
            frames = await read_sse_frames(response, 2)

        assert [frame["id"] for frame in frames] == [2, 3]
        assert [frame["data"]["payload"]["text"] for frame in frames] == [
            "two",
            "three",
        ]


class TestLiveTail:
    async def test_events_published_after_connect_arrive(self, app, client):
        session_id = await create_session(client)

        async with client.stream("GET", f"/sessions/{session_id}/events") as response:
            assert response.status_code == 200
            await produce(app, session_id, "live")
            frames = await read_sse_frames(response, 1)

        assert frames[0]["data"]["payload"]["text"] == "live"

    async def test_replay_hands_off_to_the_live_tail(self, app, client):
        session_id = await create_session(client)
        await produce(app, session_id, "stored")

        async with client.stream("GET", f"/sessions/{session_id}/events") as response:
            reader = SSEReader(response)
            first = await reader.take(1)
            await produce(app, session_id, "live")
            second = await reader.take(1)

        assert first[0]["data"]["payload"]["text"] == "stored"
        assert second[0]["id"] == 1
        assert second[0]["data"]["payload"]["text"] == "live"

    async def test_two_subscribers_see_the_same_live_event(self, app, client):
        session_id = await create_session(client)

        async with (
            client.stream("GET", f"/sessions/{session_id}/events") as first,
            client.stream("GET", f"/sessions/{session_id}/events") as second,
        ):
            await produce(app, session_id, "broadcast")
            assert (await read_sse_frames(first, 1))[0]["data"]["payload"]["text"] == (
                "broadcast"
            )
            assert (await read_sse_frames(second, 1))[0]["data"]["payload"]["text"] == (
                "broadcast"
            )


class TestReconnect:
    async def test_events_missed_while_disconnected_are_replayed(self, app, client):
        """Leave, produce, come back from the last seq seen — no gap, no repeat."""
        session_id = await create_session(client)
        await produce(app, session_id, "a", "b")

        async with client.stream("GET", f"/sessions/{session_id}/events") as response:
            first = await read_sse_frames(response, 2)
        last_id = first[-1]["id"]

        await produce(app, session_id, "c", "d")

        async with client.stream(
            "GET",
            f"/sessions/{session_id}/events",
            headers={"Last-Event-ID": str(last_id)},
        ) as response:
            second = await read_sse_frames(response, 2)

        assert [frame["data"]["payload"]["text"] for frame in first] == ["a", "b"]
        assert [frame["data"]["payload"]["text"] for frame in second] == ["c", "d"]
        assert [frame["id"] for frame in first + second] == [0, 1, 2, 3]


class TestErrors:
    async def test_an_unknown_session_is_not_found(self, api_client):
        response = await api_client.get(f"/sessions/{uuid4()}/events")

        assert response.status_code == 404

    async def test_a_negative_from_is_rejected(self, api_client):
        session_id = await create_session(api_client)

        response = await api_client.get(
            f"/sessions/{session_id}/events", params={"from": -1}
        )

        assert response.status_code == 422


class TestDeletion:
    async def test_deleting_a_session_ends_its_stream(self, app, client):
        session_id = await create_session(client)
        await produce(app, session_id, "bye")

        async with client.stream("GET", f"/sessions/{session_id}/events") as response:
            reader = SSEReader(response)
            await reader.take(1)
            deleted = await client.delete(f"/sessions/{session_id}")
            assert deleted.status_code == 204
            body = await reader.rest()

        assert parse_sse(body) == []
        assert app.state.event_bus.subscriber_count(session_id) == 0
