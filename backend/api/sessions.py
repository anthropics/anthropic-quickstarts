"""Session lifecycle endpoints.

No agent is involved yet: these create, read, and remove rows. Sending a prompt
to a session and watching it work arrive with the session manager.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response, status

from backend.api.dependencies import Sessions
from backend.api.schemas import SessionCreate, SessionRead

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_session(
    sessions: Sessions, body: SessionCreate | None = None
) -> SessionRead:
    """Start a session. The body is optional; a session needs no input to exist."""
    return SessionRead.model_validate(
        await sessions.create(title=body.title if body else None)
    )


@router.get("")
async def list_sessions(
    sessions: Sessions,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[SessionRead]:
    rows = await sessions.list_all(limit=limit, offset=offset)
    return [SessionRead.model_validate(row) for row in rows]


@router.get("/{session_id}")
async def read_session(session_id: UUID, sessions: Sessions) -> SessionRead:
    return SessionRead.model_validate(await sessions.get(session_id))


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID, sessions: Sessions, request: Request
) -> Response:
    """Removes the session and, by cascade, its event history."""
    await request.app.state.allocator.release(session_id)
    await sessions.delete(session_id)
    request.app.state.event_bus.close(session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
