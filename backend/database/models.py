"""Tables backing sessions, their event history, and the worker pool."""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    DateTime,
    Dialect,
    Enum,
    ForeignKey,
    Integer,
    String,
    TypeDecorator,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from shared.events import EventType


class Base(DeclarativeBase):
    pass


class SessionStatus(StrEnum):
    ACTIVE = "active"
    RUNNING = "running"
    CLOSED = "closed"


def _utcnow() -> datetime:
    return datetime.now(tz=UTC)


class UtcDateTime(TypeDecorator[datetime]):
    """A timestamp that is timezone-aware on the way out, on every backend.

    SQLite has nowhere to keep an offset, so without this a naive datetime
    leaks out of the database and every reader has to remember to repair it —
    including the API, where a timestamp without a zone is simply wrong.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(
        self, value: datetime | None, dialect: Dialect
    ) -> datetime | None:
        if value is None:
            return None
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)

    def process_result_value(
        self, value: datetime | None, dialect: Dialect
    ) -> datetime | None:
        if value is None:
            return None
        return value if value.tzinfo else value.replace(tzinfo=UTC)


def _enum_column(enum_cls: type[StrEnum]) -> Enum:
    """Store the wire value rather than the member name.

    SQLAlchemy defaults to persisting `ACTIVE`; the value is what the API and
    the event schema use, so keeping them identical avoids a translation layer.
    """
    return Enum(
        enum_cls,
        values_callable=lambda enum: [member.value for member in enum],
        native_enum=False,
    )


class AgentSession(Base):
    """A conversation with the agent.

    Named `AgentSession` rather than `Session` to stay distinguishable from
    SQLAlchemy's own session, which appears throughout this package.
    """

    __tablename__ = "sessions"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    status: Mapped[SessionStatus] = mapped_column(
        _enum_column(SessionStatus), default=SessionStatus.ACTIVE, index=True
    )
    title: Mapped[str | None] = mapped_column(String(200), default=None)
    # The next event position to hand out. Reserved by an atomic increment so
    # two writers cannot claim the same one; see EventRepository.append.
    next_seq: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime(), default=_utcnow, onupdate=_utcnow
    )


class SessionEvent(Base):
    """One persisted event, in its session's order."""

    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint("session_id", "seq", name="uq_events_session_seq"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    seq: Mapped[int] = mapped_column(Integer)
    # Duplicated out of the payload so history can be filtered without opening
    # the JSON on every row.
    event_type: Mapped[EventType] = mapped_column(
        "type", _enum_column(EventType), index=True
    )
    ts: Mapped[datetime] = mapped_column(UtcDateTime())
    # JSONB where it exists, so payloads can be queried and indexed; plain JSON
    # keeps SQLite working for tests.
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql")
    )


class Worker(Base):
    """A desktop in the pool, and the session currently holding it.

    `session_id` is the claim marker: a free worker has none. The claim itself
    arrives with the session manager.
    """

    __tablename__ = "workers"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    base_url: Mapped[str] = mapped_column(String(500))
    vnc_url: Mapped[str | None] = mapped_column(String(500), default=None)
    session_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("sessions.id", ondelete="SET NULL"),
        default=None,
        index=True,
    )
    claimed_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), default=None)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=_utcnow)
