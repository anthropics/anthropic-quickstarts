"""Assembles the backend application."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from backend.api.errors import install_error_handlers
from backend.api.events import router as events_router
from backend.api.messages import router as messages_router
from backend.api.sessions import router as sessions_router
from backend.config import Settings
from backend.database import (
    FilesystemBlobStore,
    WorkerRepository,
    create_engine,
    create_schema,
    create_session_factory,
)
from backend.sessions import PoolAllocator, SessionManager
from backend.streaming import EventBus, EventPublisher


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the app, taking settings so tests can point it at their own database."""
    resolved = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # The engine owns a connection pool, so it belongs to the running app
        # rather than to import time.
        engine = create_engine(resolved.database_url)
        await create_schema(engine)
        factory = create_session_factory(engine)
        blobs = FilesystemBlobStore(
            resolved.blob_dir, url_prefix=resolved.blob_url_prefix
        )
        bus = EventBus()
        allocator = PoolAllocator(factory)
        if resolved.worker_urls:
            async with factory() as db:
                workers = WorkerRepository(db)
                for index, url in enumerate(resolved.worker_urls, start=1):
                    await workers.register(name=f"worker-{index}", base_url=url)
                await db.commit()
        publisher = EventPublisher(factory, blobs, bus)
        http = httpx.AsyncClient(timeout=httpx.Timeout(None, connect=5.0))
        manager = SessionManager(allocator, publisher, http)
        app.state.settings = resolved
        app.state.session_factory = factory
        app.state.blobs = blobs
        app.state.event_bus = bus
        app.state.event_publisher = publisher
        app.state.allocator = allocator
        app.state.session_manager = manager
        try:
            yield
        finally:
            await manager.shutdown()
            bus.close_all()
            await engine.dispose()

    app = FastAPI(
        title="Computer Use Agent Service", version="0.1.0", lifespan=lifespan
    )
    install_error_handlers(app)
    app.include_router(sessions_router)
    app.include_router(events_router)
    app.include_router(messages_router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        """Liveness only: it must answer before the database is reachable."""
        return {"status": "ok"}

    return app
