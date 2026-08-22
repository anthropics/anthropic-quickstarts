"""The session endpoints, over a real database."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from backend.api.dependencies import Sessions
from backend.app import create_app
from tests.conftest import client_for


async def create(client, **body):
    response = await client.post("/sessions", json=body or None)
    assert response.status_code == 201
    return response.json()


class TestCreating:
    async def test_a_new_session_is_active_and_identified(self, api_client):
        body = await create(api_client, title="book a flight")

        assert body["status"] == "active"
        assert body["title"] == "book a flight"
        assert body["id"]

    async def test_a_session_needs_no_body(self, api_client):
        response = await api_client.post("/sessions")

        assert response.status_code == 201
        assert response.json()["title"] is None

    async def test_timestamps_carry_a_timezone(self, api_client):
        """A timestamp without an offset is ambiguous to every client that reads it."""
        body = await create(api_client)

        created = datetime.fromisoformat(body["created_at"])

        assert created.tzinfo is not None
        assert abs((datetime.now(tz=UTC) - created).total_seconds()) < 60

    async def test_an_overlong_title_is_rejected(self, api_client):
        response = await api_client.post("/sessions", json={"title": "x" * 201})

        assert response.status_code == 422


class TestReading:
    async def test_a_session_can_be_fetched_by_id(self, api_client):
        created = await create(api_client, title="one")

        response = await api_client.get(f"/sessions/{created['id']}")

        assert response.status_code == 200
        assert response.json() == created

    async def test_an_unknown_session_is_not_found(self, api_client):
        session_id = uuid4()

        response = await api_client.get(f"/sessions/{session_id}")

        assert response.status_code == 404
        assert str(session_id) in response.json()["detail"]

    async def test_an_unparseable_id_is_rejected(self, api_client):
        response = await api_client.get("/sessions/not-a-uuid")

        assert response.status_code == 422


class TestListing:
    async def test_an_empty_service_lists_nothing(self, api_client):
        response = await api_client.get("/sessions")

        assert response.status_code == 200
        assert response.json() == []

    async def test_every_session_is_listed(self, api_client):
        created = {(await create(api_client, title=str(n)))["id"] for n in range(3)}

        response = await api_client.get("/sessions")

        assert {session["id"] for session in response.json()} == created

    async def test_the_newest_session_comes_first(self, api_client):
        for n in range(4):
            await create(api_client, title=str(n))

        timestamps = [
            session["created_at"]
            for session in (await api_client.get("/sessions")).json()
        ]

        assert timestamps == sorted(timestamps, reverse=True)

    async def test_a_page_can_be_requested(self, api_client):
        for n in range(5):
            await create(api_client, title=str(n))

        response = await api_client.get("/sessions", params={"limit": 2, "offset": 1})

        assert len(response.json()) == 2

    @pytest.mark.parametrize(
        "params", [{"limit": 0}, {"limit": 101}, {"offset": -1}], ids=str
    )
    async def test_nonsense_paging_is_rejected(self, api_client, params):
        response = await api_client.get("/sessions", params=params)

        assert response.status_code == 422


class TestDeleting:
    async def test_a_deleted_session_is_gone(self, api_client):
        created = await create(api_client)

        deleted = await api_client.delete(f"/sessions/{created['id']}")

        assert deleted.status_code == 204
        assert (await api_client.get(f"/sessions/{created['id']}")).status_code == 404

    async def test_deleting_an_unknown_session_is_not_found(self, api_client):
        response = await api_client.delete(f"/sessions/{uuid4()}")

        assert response.status_code == 404


class TestTransactions:
    async def test_a_session_outlives_the_app_that_made_it(self, settings):
        """The point of the database: a restart must not lose the session."""
        async with client_for(create_app(settings)) as client:
            created = await create(client, title="survivor")

        async with client_for(create_app(settings)) as client:
            response = await client.get(f"/sessions/{created['id']}")

        assert response.status_code == 200
        assert response.json()["title"] == "survivor"

    async def test_a_failed_request_leaves_nothing_behind(self, settings):
        """A request is one transaction, so a handler that raises writes nothing."""
        app = create_app(settings)

        @app.post("/boom")
        async def boom(sessions: Sessions) -> None:
            await sessions.create(title="should not survive")
            raise RuntimeError("boom")

        async with client_for(app) as client:
            with pytest.raises(RuntimeError, match="boom"):
                await client.post("/boom")

            assert (await client.get("/sessions")).json() == []
