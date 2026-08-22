"""Request and response bodies of the worker API.

The real worker and the fake serve these same shapes, so anything written
against one works against the other.
"""

from uuid import UUID

from pydantic import BaseModel, Field


class StartRunRequest(BaseModel):
    session_id: UUID
    prompt: str = Field(min_length=1)


class StartRunResponse(BaseModel):
    run_id: UUID
    session_id: UUID


class RunStatusResponse(BaseModel):
    run_id: UUID
    session_id: UUID
    active: bool
    event_count: int
