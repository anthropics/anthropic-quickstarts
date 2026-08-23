"""Turns domain errors into HTTP responses."""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from backend.database import PoolExhausted, SessionBusy, SessionNotFound


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(SessionNotFound)
    async def session_not_found(_: Request, exc: SessionNotFound) -> JSONResponse:
        """Saves every route that touches a session the same try/except."""
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)}
        )

    @app.exception_handler(SessionBusy)
    async def session_busy(_: Request, exc: SessionBusy) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc)}
        )

    @app.exception_handler(PoolExhausted)
    async def pool_exhausted(request: Request, exc: PoolExhausted) -> JSONResponse:
        retry_after = str(request.app.state.settings.pool_retry_after_seconds)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": str(exc)},
            headers={"Retry-After": retry_after},
        )
