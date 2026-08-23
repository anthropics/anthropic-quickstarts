"""HTTP client for a worker's run API."""

from collections.abc import AsyncIterator
from uuid import UUID

import httpx
from pydantic import BaseModel

from shared.events import WorkerEvent


class StartedRun(BaseModel):
    run_id: UUID
    session_id: UUID


class WorkerUnreachable(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)


class WorkerConflict(Exception):
    """The worker refused the run because its desktop is already busy."""


async def _sse_data(response: httpx.Response) -> AsyncIterator[str]:
    buffer = ""
    async for chunk in response.aiter_text():
        buffer += chunk
        while "\n\n" in buffer:
            block, buffer = buffer.split("\n\n", 1)
            if not block.strip() or block.startswith(":"):
                continue
            for line in block.splitlines():
                if line.startswith("data: "):
                    yield line[6:]


class WorkerClient:
    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    async def start(self, base_url: str, session_id: UUID, prompt: str) -> StartedRun:
        url = f"{base_url.rstrip('/')}/runs"
        try:
            response = await self._http.post(
                url, json={"session_id": str(session_id), "prompt": prompt}
            )
        except httpx.RequestError as exc:
            raise WorkerUnreachable(str(exc)) from exc
        if response.status_code == 409:
            raise WorkerConflict(response.text)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise WorkerUnreachable(str(exc)) from exc
        return StartedRun.model_validate(response.json())

    async def events(self, base_url: str, run_id: UUID) -> AsyncIterator[WorkerEvent]:
        url = f"{base_url.rstrip('/')}/runs/{run_id}/events"
        try:
            async with self._http.stream("GET", url) as response:
                response.raise_for_status()
                async for data in _sse_data(response):
                    yield WorkerEvent.model_validate_json(data)
        except httpx.RequestError as exc:
            raise WorkerUnreachable(str(exc)) from exc
        except httpx.HTTPStatusError as exc:
            raise WorkerUnreachable(str(exc)) from exc

    async def cancel(self, base_url: str, run_id: UUID) -> None:
        url = f"{base_url.rstrip('/')}/runs/{run_id}/cancel"
        try:
            await self._http.post(url)
        except httpx.RequestError:
            return
