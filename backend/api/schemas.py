"""Request and response shapes for the public API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.database import SessionStatus


class SessionCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)


class MessageCreate(BaseModel):
    prompt: str = Field(min_length=1)


class MessageAccepted(BaseModel):
    session_id: UUID
    run_id: UUID


class SessionRead(BaseModel):
    """A session as clients see it, built straight from the row."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: SessionStatus
    title: str | None
    created_at: datetime
    updated_at: datetime
