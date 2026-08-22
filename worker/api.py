"""The worker's HTTP surface, built around any `Runner`.

Both the real worker and the fake are assembled here, so the fake cannot drift
from the contract the backend is written against.
"""

from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from worker.protocol import RunStatusResponse, StartRunRequest, StartRunResponse
from worker.runner import Run, RunInProgress, Runner
from worker.streaming import sse_events

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    # Without this, a reverse proxy may buffer the stream and defeat the point.
    "X-Accel-Buffering": "no",
}


def _require_run(runner: Runner, run_id: UUID) -> Run:
    run = runner.get_run(run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown run {run_id}")
    return run


def _resume_index(request: Request, from_index: int) -> int:
    """`Last-Event-ID` names the last event seen, so resume from the one after it."""
    if from_index:
        return from_index
    last_event_id = request.headers.get("last-event-id")
    if last_event_id is None:
        return 0
    try:
        return int(last_event_id) + 1
    except ValueError:
        return 0


def create_app(build_runner: Callable[[], Runner], *, title: str) -> FastAPI:
    app = FastAPI(title=title, version="0.1.0")
    # Built here rather than in a lifespan hook: the runner needs no async
    # setup, and this keeps the app usable from an ASGI test transport, which
    # does not run lifespan events.
    app.state.runner = build_runner()

    def runner_of(request: Request) -> Runner:
        return request.app.state.runner

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/runs", status_code=status.HTTP_201_CREATED)
    async def start_run(body: StartRunRequest, request: Request) -> StartRunResponse:
        try:
            run = await runner_of(request).start(body.session_id, body.prompt)
        except RunInProgress as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
        return StartRunResponse(run_id=run.run_id, session_id=run.session_id)

    @app.get("/runs/{run_id}")
    async def run_status(run_id: UUID, request: Request) -> RunStatusResponse:
        run = _require_run(runner_of(request), run_id)
        return RunStatusResponse(
            run_id=run.run_id,
            session_id=run.session_id,
            active=run.active,
            event_count=len(run.buffer),
        )

    @app.get("/runs/{run_id}/events")
    async def run_events(
        run_id: UUID,
        request: Request,
        from_index: Annotated[int, Query(alias="from")] = 0,
    ) -> StreamingResponse:
        run = _require_run(runner_of(request), run_id)
        return StreamingResponse(
            sse_events(run.buffer, _resume_index(request, from_index)),
            media_type="text/event-stream",
            headers=SSE_HEADERS,
        )

    @app.post("/runs/{run_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
    async def cancel_run(run_id: UUID, request: Request) -> dict[str, str]:
        runner = runner_of(request)
        _require_run(runner, run_id)
        if not await runner.cancel(run_id):
            raise HTTPException(status.HTTP_409_CONFLICT, "run is no longer active")
        return {"status": "cancelling"}

    return app
