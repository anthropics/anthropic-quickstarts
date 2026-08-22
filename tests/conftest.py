from contextlib import asynccontextmanager

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from backend.app import create_app
from backend.config import Settings
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


@pytest.fixture
def settings(tmp_path):
    """Points the app at a throwaway database instead of the configured one."""
    return Settings(
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'api.db'}",
        blob_dir=tmp_path / "blobs",
    )


@pytest.fixture
async def api_client(settings):
    """A client for a fully started app, lifespan included."""
    async with client_for(create_app(settings)) as client:
        yield client


@asynccontextmanager
async def client_for(app):
    """Runs the app's lifespan, which is where the database engine is built."""
    async with (
        LifespanManager(app) as manager,
        AsyncClient(
            transport=ASGITransport(app=manager.app), base_url="http://backend"
        ) as client,
    ):
        yield client
