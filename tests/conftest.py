import asyncio
import socket
from contextlib import asynccontextmanager

import pytest
import uvicorn
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
async def _started_app(settings):
    """FastAPI plus the ASGI wrapper that actually runs its lifespan."""
    app = create_app(settings)
    async with LifespanManager(app) as manager:
        yield app, manager.app


@pytest.fixture
def api_app(_started_app):
    """The running app, so tests can reach the event publisher and the bus."""
    return _started_app[0]


@pytest.fixture
async def api_client(_started_app):
    """A client for a fully started app, lifespan included."""
    _app, asgi = _started_app
    async with AsyncClient(
        transport=ASGITransport(app=asgi),
        base_url="http://backend",
        timeout=None,
    ) as client:
        yield client


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture
async def live_backend(settings):
    """A real HTTP server.

    httpx's ASGI transport does not yield from an open-ended `StreamingResponse`
    until the generator finishes, so SSE tests that read N frames and leave the
    connection open have to go through a socket.
    """
    app = create_app(settings)
    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    )
    # Already inside pytest's loop; installing handlers would fail.
    server.install_signal_handlers = False
    task = asyncio.create_task(server.serve())
    for _ in range(100):
        if server.started:
            break
        await asyncio.sleep(0.05)
    else:
        raise RuntimeError("backend did not start")
    async with AsyncClient(base_url=f"http://127.0.0.1:{port}", timeout=None) as client:
        yield app, client
    server.should_exit = True
    await task


@asynccontextmanager
async def client_for(app):
    """Runs the app's lifespan, which is where the database engine is built."""
    async with (
        LifespanManager(app) as manager,
        AsyncClient(
            transport=ASGITransport(app=manager.app),
            base_url="http://backend",
            timeout=None,
        ) as client,
    ):
        yield client
