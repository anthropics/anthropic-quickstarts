"""Decode SSE bodies in tests."""

import json


def parse_sse_block(block: str) -> dict:
    fields = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
    return {
        "id": int(fields["id"]),
        "event": fields["event"],
        "data": json.loads(fields["data"]),
    }


def parse_sse(body: str) -> list[dict]:
    """Pull `id` and decoded `data` out of an SSE body, skipping comments."""
    frames = []
    for block in body.strip().split("\n\n"):
        if not block.strip() or block.startswith(":"):
            continue
        frames.append(parse_sse_block(block))
    return frames


class SSEReader:
    """Reads frames from one streaming response, across several waits.

    httpx will not let a response be iterated twice, so a test that replays
    history and then waits for a live event has to keep this reader around.
    """

    def __init__(self, response) -> None:
        self._chunks = response.aiter_text()
        self._buffer = ""

    async def take(self, count: int) -> list[dict]:
        frames: list[dict] = []
        while len(frames) < count:
            while "\n\n" in self._buffer and len(frames) < count:
                block, self._buffer = self._buffer.split("\n\n", 1)
                if not block.strip() or block.startswith(":"):
                    continue
                frames.append(parse_sse_block(block))
            if len(frames) >= count:
                return frames
            try:
                self._buffer += await anext(self._chunks)
            except StopAsyncIteration:
                return frames
        return frames

    async def rest(self) -> str:
        leftover = self._buffer
        async for chunk in self._chunks:
            leftover += chunk
        return leftover


async def read_sse_frames(response, count: int) -> list[dict]:
    """Read until `count` event frames have arrived, ignoring keepalives."""
    return await SSEReader(response).take(count)
