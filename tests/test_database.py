import base64
from uuid import uuid4

import pytest
from sqlalchemy import select, update
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError
from sqlalchemy.schema import CreateTable

from backend.database import (
    AgentSession,
    Base,
    EventRepository,
    SessionEvent,
    SessionNotFound,
    SessionRepository,
    SessionStatus,
    WorkerRepository,
    create_engine,
    create_schema,
)
from shared.events import (
    AssistantText,
    EventType,
    InlineScreenshot,
    RunFinished,
    ScreenshotRef,
    ToolResult,
    ToolUse,
    WorkerEvent,
)

PNG = b"\x89PNG\r\n\x1a\nfake image bytes"


def worker_event(session_id, payload):
    return WorkerEvent(session_id=session_id, payload=payload)


class TestSessions:
    async def test_a_new_session_starts_active_and_empty(self, db):
        sessions = SessionRepository(db)

        session = await sessions.create(title="first task")

        assert session.status is SessionStatus.ACTIVE
        assert session.next_seq == 0
        assert session.title == "first task"

    async def test_a_session_survives_a_new_database_session(self, session_factory):
        """Persistence is the point; a fresh connection must see the same row."""
        async with session_factory() as db:
            created = await SessionRepository(db).create()
            await db.commit()

        async with session_factory() as db:
            found = await SessionRepository(db).get(created.id)

        assert found.id == created.id

    async def test_listing_returns_newest_first(self, db):
        sessions = SessionRepository(db)
        first = await sessions.create(title="one")
        second = await sessions.create(title="two")

        listed = await sessions.list_all()

        assert {session.id for session in listed} == {first.id, second.id}
        # Asserted as an ordering rather than an exact sequence: two sessions
        # created in the same microsecond tie, and the tiebreak is by id.
        timestamps = [session.created_at for session in listed]
        assert timestamps == sorted(timestamps, reverse=True)

    async def test_status_changes_are_kept(self, db):
        sessions = SessionRepository(db)
        session = await sessions.create()

        await sessions.set_status(session.id, SessionStatus.CLOSED)

        assert (await sessions.get(session.id)).status is SessionStatus.CLOSED

    async def test_unknown_sessions_are_reported(self, db):
        with pytest.raises(SessionNotFound):
            await SessionRepository(db).get(uuid4())

    async def test_deleting_a_session_takes_its_events(self, db, blobs):
        sessions = SessionRepository(db)
        events = EventRepository(db, blobs)
        session = await sessions.create()
        await events.append([worker_event(session.id, AssistantText(text="hello"))])

        await sessions.delete(session.id)

        assert await events.count_for_session(session.id) == 0


class TestEventOrdering:
    async def test_positions_start_at_zero_and_run_consecutively(self, db, blobs):
        session = await SessionRepository(db).create()
        events = EventRepository(db, blobs)

        stored = await events.append(
            [
                worker_event(session.id, AssistantText(text="one")),
                worker_event(session.id, ToolUse(tool_use_id="tu_1", name="bash")),
                worker_event(session.id, RunFinished()),
            ]
        )

        assert [event.seq for event in stored] == [0, 1, 2]

    async def test_a_later_append_continues_where_the_last_stopped(self, db, blobs):
        session = await SessionRepository(db).create()
        events = EventRepository(db, blobs)

        await events.append([worker_event(session.id, AssistantText(text="one"))])
        second = await events.append(
            [
                worker_event(session.id, AssistantText(text="two")),
                worker_event(session.id, AssistantText(text="three")),
            ]
        )

        assert [event.seq for event in second] == [1, 2]

    async def test_separate_transactions_get_disjoint_ranges(
        self, session_factory, blobs
    ):
        """Numbering is a property of the row, not of one unit of work.

        Sequential here because SQLite serialises writers anyway; that the
        reservation holds under real contention is a Postgres question, and
        belongs with the session manager that will actually contend.
        """
        async with session_factory() as db:
            session = await SessionRepository(db).create()
            await db.commit()
            session_id = session.id

        ranges = []
        for _ in range(3):
            async with session_factory() as db:
                stored = await EventRepository(db, blobs).append(
                    [
                        worker_event(session_id, AssistantText(text="a")),
                        worker_event(session_id, AssistantText(text="b")),
                    ]
                )
                await db.commit()
                ranges.append([event.seq for event in stored])

        assert ranges == [[0, 1], [2, 3], [4, 5]]

    async def test_two_events_cannot_share_a_position(self, db, blobs):
        """The unique constraint backs up the reservation rather than trusting it."""
        session = await SessionRepository(db).create()
        await EventRepository(db, blobs).append(
            [worker_event(session.id, AssistantText(text="one"))]
        )

        db.add(
            SessionEvent(
                session_id=session.id,
                seq=0,
                event_type=EventType.ASSISTANT_TEXT,
                ts=worker_event(session.id, AssistantText(text="x")).ts,
                payload={"type": "assistant_text", "text": "duplicate"},
            )
        )

        with pytest.raises(IntegrityError):
            await db.flush()

    async def test_appending_to_an_unknown_session_is_rejected(self, db, blobs):
        with pytest.raises(SessionNotFound):
            await EventRepository(db, blobs).append(
                [worker_event(uuid4(), AssistantText(text="hello"))]
            )

    async def test_events_from_different_sessions_cannot_be_appended_together(
        self, db, blobs
    ):
        with pytest.raises(ValueError, match="one session"):
            await EventRepository(db, blobs).append(
                [
                    worker_event(uuid4(), AssistantText(text="a")),
                    worker_event(uuid4(), AssistantText(text="b")),
                ]
            )

    async def test_appending_nothing_does_nothing(self, db, blobs):
        assert await EventRepository(db, blobs).append([]) == []


class TestReadingHistory:
    async def test_history_comes_back_in_order(self, db, blobs):
        session = await SessionRepository(db).create()
        events = EventRepository(db, blobs)
        await events.append(
            [worker_event(session.id, AssistantText(text=str(n))) for n in range(5)]
        )

        history = await events.list_for_session(session.id)

        assert [event.seq for event in history] == [0, 1, 2, 3, 4]
        assert [event.payload.text for event in history] == ["0", "1", "2", "3", "4"]

    async def test_a_reader_can_resume_from_a_position(self, db, blobs):
        session = await SessionRepository(db).create()
        events = EventRepository(db, blobs)
        await events.append(
            [worker_event(session.id, AssistantText(text=str(n))) for n in range(5)]
        )

        history = await events.list_for_session(session.id, from_seq=3)

        assert [event.seq for event in history] == [3, 4]

    async def test_history_can_be_limited(self, db, blobs):
        session = await SessionRepository(db).create()
        events = EventRepository(db, blobs)
        await events.append(
            [worker_event(session.id, AssistantText(text=str(n))) for n in range(5)]
        )

        history = await events.list_for_session(session.id, limit=2)

        assert [event.seq for event in history] == [0, 1]

    async def test_timestamps_come_back_as_utc(self, db, blobs):
        """SQLite drops the timezone; a naive datetime downstream would be a bug."""
        session = await SessionRepository(db).create()
        events = EventRepository(db, blobs)
        await events.append([worker_event(session.id, AssistantText(text="one"))])

        (event,) = await events.list_for_session(session.id)

        assert event.ts.tzinfo is not None


class TestScreenshotHandover:
    async def test_an_inline_screenshot_becomes_a_reference(self, db, blobs):
        session = await SessionRepository(db).create()
        events = EventRepository(db, blobs)

        (stored,) = await events.append(
            [
                worker_event(
                    session.id,
                    ToolResult(
                        tool_use_id="tu_1",
                        output="took a screenshot",
                        screenshot=InlineScreenshot(
                            data=base64.b64encode(PNG).decode()
                        ),
                    ),
                )
            ]
        )

        assert isinstance(stored.payload.screenshot, ScreenshotRef)
        assert stored.payload.output == "took a screenshot"

    async def test_the_bytes_are_retrievable_from_the_store(self, db, blobs):
        session = await SessionRepository(db).create()
        events = EventRepository(db, blobs)

        (stored,) = await events.append(
            [
                worker_event(
                    session.id,
                    ToolResult(
                        tool_use_id="tu_1",
                        screenshot=InlineScreenshot(
                            data=base64.b64encode(PNG).decode()
                        ),
                    ),
                )
            ]
        )

        key = stored.payload.screenshot.url.rsplit("/", 1)[-1]
        assert await blobs.get(key) == PNG

    async def test_no_base64_reaches_the_row(self, db, blobs):
        """The point of the handover: rows stay small enough to query cheaply."""
        session = await SessionRepository(db).create()
        encoded = base64.b64encode(PNG).decode()
        await EventRepository(db, blobs).append(
            [
                worker_event(
                    session.id,
                    ToolResult(
                        tool_use_id="tu_1", screenshot=InlineScreenshot(data=encoded)
                    ),
                )
            ]
        )

        result = await db.execute(select(SessionEvent))
        (row,) = result.scalars()

        assert encoded not in str(row.payload)
        assert row.payload["screenshot"]["kind"] == "ref"

    async def test_payloads_without_screenshots_pass_through(self, db, blobs):
        session = await SessionRepository(db).create()
        events = EventRepository(db, blobs)

        (stored,) = await events.append(
            [worker_event(session.id, ToolResult(tool_use_id="tu_1", output="text"))]
        )

        assert stored.payload.screenshot is None

    async def test_history_reads_back_the_reference(self, db, blobs):
        session = await SessionRepository(db).create()
        events = EventRepository(db, blobs)
        await events.append(
            [
                worker_event(
                    session.id,
                    ToolResult(
                        tool_use_id="tu_1",
                        screenshot=InlineScreenshot(
                            data=base64.b64encode(PNG).decode()
                        ),
                    ),
                )
            ]
        )

        (event,) = await events.list_for_session(session.id)

        assert isinstance(event.payload.screenshot, ScreenshotRef)


class TestEngineSetup:
    async def test_a_missing_database_directory_is_created(self, tmp_path):
        """The default config puts the file under ./data, absent on a fresh checkout."""
        target = tmp_path / "not" / "yet" / "app.db"
        engine = create_engine(f"sqlite+aiosqlite:///{target}")

        try:
            await create_schema(engine)
        finally:
            await engine.dispose()

        assert target.is_file()

    async def test_an_in_memory_database_needs_no_directory(self):
        engine = create_engine("sqlite+aiosqlite://")

        try:
            await create_schema(engine)
        finally:
            await engine.dispose()


class TestPostgresDialect:
    """The tests run on SQLite but deployment is Postgres, so check it compiles.

    Cheaper than a server, and it catches the mistakes that matter here: a type
    or a RETURNING clause that only one dialect understands.
    """

    def test_the_schema_compiles(self):
        dialect = postgresql.dialect()

        statements = [
            str(CreateTable(table).compile(dialect=dialect))
            for table in Base.metadata.sorted_tables
        ]

        assert any("payload JSONB" in statement for statement in statements)
        assert all("UUID" in statement for statement in statements)

    def test_the_reservation_still_returns_the_new_position(self):
        statement = (
            update(AgentSession)
            .where(AgentSession.id == uuid4())
            .values(next_seq=AgentSession.next_seq + 2)
            .returning(AgentSession.next_seq)
        )

        compiled = str(statement.compile(dialect=postgresql.dialect()))

        assert "RETURNING sessions.next_seq" in compiled


class TestWorkerRegistry:
    async def test_a_worker_starts_unclaimed(self, db):
        worker = await WorkerRepository(db).register(
            name="worker-1", base_url="http://worker-1:8000"
        )

        assert worker.session_id is None
        assert worker.claimed_at is None

    async def test_registering_again_refreshes_rather_than_duplicates(self, db):
        workers = WorkerRepository(db)
        first = await workers.register(name="worker-1", base_url="http://old:8000")

        second = await workers.register(name="worker-1", base_url="http://new:8000")

        assert second.id == first.id
        assert second.base_url == "http://new:8000"
        assert len(await workers.list_all()) == 1

    async def test_the_worker_holding_a_session_can_be_found(self, db):
        session = await SessionRepository(db).create()
        workers = WorkerRepository(db)
        worker = await workers.register(
            name="worker-1", base_url="http://worker-1:8000"
        )
        worker.session_id = session.id
        await db.flush()

        assert (await workers.for_session(session.id)).id == worker.id

    async def test_no_worker_for_an_unheld_session(self, db):
        assert await WorkerRepository(db).for_session(uuid4()) is None
