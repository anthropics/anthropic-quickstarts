"""Request-scoped database access."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import SessionRepository


async def db_session(request: Request) -> AsyncIterator[AsyncSession]:
    """One transaction per request: committed on success, rolled back on failure.

    Handlers and repositories only flush, so a request that fails part way
    through leaves nothing behind.
    """
    factory = request.app.state.session_factory
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()


DbSession = Annotated[AsyncSession, Depends(db_session)]


async def session_repository(db: DbSession) -> SessionRepository:
    # Async so FastAPI does not send a trivial constructor through its
    # threadpool, which is what it does with synchronous dependencies.
    return SessionRepository(db)


Sessions = Annotated[SessionRepository, Depends(session_repository)]
