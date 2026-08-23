"""The session event stream: replay history, then tail live progress."""

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from backend.api.dependencies import Sessions
from backend.database import EventRepository
from backend.streaming.sse import SSE_HEADERS, session_event_stream
from shared.events import Event

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _resume_seq(request: Request, from_seq: int) -> int:
    """`Last-Event-ID` names the last event seen, so resume from the one after it."""
    if from_seq:
        return from_seq
    last_event_id = request.headers.get("last-event-id")
    if last_event_id is None:
        return 0
    try:
        return int(last_event_id) + 1
    except ValueError:
        return 0


def _history_reader(request: Request):
    factory = request.app.state.session_factory
    blobs = request.app.state.blobs

    async def read_history(session_id: UUID, from_seq: int) -> list[Event]:
        # A short transaction: holding the request's connection for the life
        # of the stream would pin a pool slot to every open browser tab.
        async with factory() as db:
            return await EventRepository(db, blobs).list_for_session(
                session_id, from_seq=from_seq
            )

    return read_history


@router.get("/{session_id}/events")
async def stream_session_events(
    session_id: UUID,
    request: Request,
    sessions: Sessions,
    from_seq: Annotated[int, Query(alias="from", ge=0)] = 0,
) -> StreamingResponse:
    """Replay from `from` (or `Last-Event-ID`), then follow new events.

    The stream stays open across runs: a session can be prompted more than
    once, and closing on `run_finished` would force every client to reconnect.
    """
    await sessions.get(session_id)

    async def frames() -> AsyncIterator[str]:
        async for chunk in session_event_stream(
            session_id,
            from_seq=_resume_seq(request, from_seq),
            bus=request.app.state.event_bus,
            read_history=_history_reader(request),
            keepalive=request.app.state.settings.sse_keepalive_seconds,
        ):
            yield chunk

    return StreamingResponse(
        frames(), media_type="text/event-stream", headers=SSE_HEADERS
    )
