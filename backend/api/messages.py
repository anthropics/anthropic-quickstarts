"""Send a prompt to a session and let the worker drive it."""

from uuid import UUID

from fastapi import APIRouter, Request, status

from backend.api.dependencies import Sessions
from backend.api.schemas import MessageAccepted, MessageCreate

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/{session_id}/messages", status_code=status.HTTP_202_ACCEPTED)
async def post_message(
    session_id: UUID,
    body: MessageCreate,
    request: Request,
    sessions: Sessions,
) -> MessageAccepted:
    """Start a run. Progress arrives on GET /sessions/{id}/events."""
    await sessions.get(session_id)
    run_id = await request.app.state.session_manager.start(session_id, body.prompt)
    return MessageAccepted(session_id=session_id, run_id=run_id)
