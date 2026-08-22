"""Engine and session-factory wiring."""

from pathlib import Path

from sqlalchemy import event, make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.database.models import Base


def create_engine(url: str, *, echo: bool = False) -> AsyncEngine:
    parsed = make_url(url)
    on_sqlite = parsed.get_backend_name() == "sqlite"
    if on_sqlite:
        _ensure_database_directory(parsed.database)
    engine = create_async_engine(parsed, echo=echo)
    if on_sqlite:
        _enable_sqlite_foreign_keys(engine)
    return engine


def _ensure_database_directory(database: str | None) -> None:
    """SQLite does not create a missing directory, it just fails to open.

    The default configuration puts the file under ./data, so without this a
    first run on a fresh checkout dies during startup.
    """
    if not database or database == ":memory:":
        return
    Path(database).parent.mkdir(parents=True, exist_ok=True)


def _enable_sqlite_foreign_keys(engine: AsyncEngine) -> None:
    """SQLite ignores foreign keys unless asked, including ON DELETE CASCADE."""

    @event.listens_for(engine.sync_engine, "connect")
    def set_pragma(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    # expire_on_commit=False so returned rows stay readable after the request's
    # transaction commits.
    return async_sessionmaker(engine, expire_on_commit=False)


async def create_schema(engine: AsyncEngine) -> None:
    """Create the tables directly.

    Adequate while the schema is still moving; a migration tool is the right
    answer once it settles, and is deliberately not part of this step.
    """
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
