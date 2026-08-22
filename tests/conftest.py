import pytest

from backend.database import (
    FilesystemBlobStore,
    create_engine,
    create_schema,
    create_session_factory,
)


@pytest.fixture
async def engine(tmp_path):
    """A real SQLite file rather than :memory:, so one engine serves many connections."""
    engine = create_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    await create_schema(engine)
    yield engine
    await engine.dispose()


@pytest.fixture
def session_factory(engine):
    return create_session_factory(engine)


@pytest.fixture
async def db(session_factory):
    async with session_factory() as session:
        yield session


@pytest.fixture
def blobs(tmp_path):
    return FilesystemBlobStore(tmp_path / "blobs")
