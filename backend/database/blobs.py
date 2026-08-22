"""Storage for screenshot bytes, kept out of the event rows.

A computer-use conversation produces a screenshot on most turns. Inlining them
in the rows would make reading history expensive for the one thing a client
usually wants cheaply — the text of the conversation — so the bytes live here
and the rows carry a reference.
"""

import asyncio
import hashlib
from pathlib import Path
from typing import Protocol


class BlobStore(Protocol):
    async def put(self, data: bytes, *, suffix: str = ".png") -> str: ...

    async def get(self, key: str) -> bytes | None: ...

    def url_for(self, key: str) -> str: ...


class FilesystemBlobStore:
    """Content-addressed files under a directory.

    Addressing by digest means the many identical screenshots a run produces —
    the screen often does not change between steps — are stored once.
    """

    def __init__(self, root: Path, *, url_prefix: str = "/blobs") -> None:
        self._root = Path(root)
        self._url_prefix = url_prefix.rstrip("/")

    async def put(self, data: bytes, *, suffix: str = ".png") -> str:
        key = f"{hashlib.sha256(data).hexdigest()}{suffix}"
        await asyncio.to_thread(self._write, key, data)
        return key

    async def get(self, key: str) -> bytes | None:
        path = self._safe_path(key)
        if path is None or not path.is_file():
            return None
        return await asyncio.to_thread(path.read_bytes)

    def url_for(self, key: str) -> str:
        return f"{self._url_prefix}/{key}"

    def _write(self, key: str, data: bytes) -> None:
        self._root.mkdir(parents=True, exist_ok=True)
        path = self._root / key
        if path.exists():
            # Same digest, same bytes; rewriting would only cost IO.
            return
        # Write beside the target and move, so a reader never sees half a file.
        temporary = path.with_suffix(path.suffix + ".part")
        temporary.write_bytes(data)
        temporary.replace(path)

    def _safe_path(self, key: str) -> Path | None:
        """Reject anything that is not a plain file name in the blob directory."""
        if not key or "/" in key or "\\" in key or key.startswith("."):
            return None
        return self._root / key
