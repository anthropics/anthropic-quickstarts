"""Ordered event buffering for a run, and the SSE framing used to serve it."""

import asyncio
from collections.abc import AsyncIterator

from shared.events import WorkerEvent


class EventBuffer:
    """The events of a single run, in order, readable while still being written.

    A consumer can join at any index, so a backend that drops its connection
    mid-run resumes exactly where it left off instead of losing what it missed
    while away.
    """

    def __init__(self) -> None:
        self._events: list[WorkerEvent] = []
        self._updated = asyncio.Event()
        self._closed = False

    def __len__(self) -> int:
        return len(self._events)

    @property
    def closed(self) -> bool:
        return self._closed

    def append(self, event: WorkerEvent) -> None:
        self._events.append(event)
        self._updated.set()

    def close(self) -> None:
        """Mark the run complete so readers finish instead of waiting forever."""
        self._closed = True
        self._updated.set()

    def snapshot(self) -> list[WorkerEvent]:
        return list(self._events)

    async def stream(
        self, from_index: int = 0
    ) -> AsyncIterator[tuple[int, WorkerEvent]]:
        index = max(from_index, 0)
        while True:
            # Cleared before draining so an append that lands mid-drain still
            # leaves the flag set and the next wait returns immediately.
            self._updated.clear()
            while index < len(self._events):
                yield index, self._events[index]
                index += 1
            if self._closed:
                return
            await self._updated.wait()


def format_sse(index: int, event: WorkerEvent) -> str:
    """Frame one event, using the buffer index as the SSE id so readers can resume."""
    return (
        f"id: {index}\n"
        f"event: {event.payload.type}\n"
        f"data: {event.model_dump_json()}\n\n"
    )


async def sse_events(buffer: EventBuffer, from_index: int = 0) -> AsyncIterator[str]:
    async for index, event in buffer.stream(from_index):
        yield format_sse(index, event)
