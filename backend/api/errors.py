"""Turns domain errors into HTTP responses."""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from backend.database import SessionNotFound


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(SessionNotFound)
    async def session_not_found(_: Request, exc: SessionNotFound) -> JSONResponse:
        """Saves every route that touches a session the same try/except."""
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)}
        )
