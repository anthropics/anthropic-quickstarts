"""Backend settings, read from the environment."""

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_DATABASE_URL = "sqlite+aiosqlite:///./data/app.db"
DEFAULT_BLOB_DIR = Path("./data/blobs")
DEFAULT_BLOB_URL_PREFIX = "/blobs"
DEFAULT_SSE_KEEPALIVE_SECONDS = 15.0


@dataclass(frozen=True)
class Settings:
    database_url: str = DEFAULT_DATABASE_URL
    blob_dir: Path = DEFAULT_BLOB_DIR
    blob_url_prefix: str = DEFAULT_BLOB_URL_PREFIX
    sse_keepalive_seconds: float = DEFAULT_SSE_KEEPALIVE_SECONDS

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
            blob_dir=Path(os.environ.get("BLOB_DIR", DEFAULT_BLOB_DIR)),
            blob_url_prefix=os.environ.get("BLOB_URL_PREFIX", DEFAULT_BLOB_URL_PREFIX),
            sse_keepalive_seconds=float(
                os.environ.get(
                    "SSE_KEEPALIVE_SECONDS", str(DEFAULT_SSE_KEEPALIVE_SECONDS)
                )
            ),
        )
