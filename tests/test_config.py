from pathlib import Path

from backend.config import Settings


def test_defaults_need_no_environment(monkeypatch):
    """A checkout should run against SQLite without any setup."""
    for name in (
        "DATABASE_URL",
        "BLOB_DIR",
        "BLOB_URL_PREFIX",
        "SSE_KEEPALIVE_SECONDS",
        "WORKER_URLS",
        "POOL_RETRY_AFTER_SECONDS",
    ):
        monkeypatch.delenv(name, raising=False)

    settings = Settings.from_env()

    assert settings.database_url.startswith("sqlite+aiosqlite://")
    assert settings.blob_dir == Path("./data/blobs")
    assert settings.sse_keepalive_seconds == 15.0
    assert settings.worker_urls == ()
    assert settings.pool_retry_after_seconds == 5


def test_the_environment_wins(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user@db/app")
    monkeypatch.setenv("BLOB_DIR", "/srv/blobs")
    monkeypatch.setenv("BLOB_URL_PREFIX", "/media")
    monkeypatch.setenv("SSE_KEEPALIVE_SECONDS", "30")
    monkeypatch.setenv("WORKER_URLS", "http://w1:8000, http://w2:8000")
    monkeypatch.setenv("POOL_RETRY_AFTER_SECONDS", "12")

    settings = Settings.from_env()

    assert settings.database_url == "postgresql+asyncpg://user@db/app"
    assert settings.blob_dir == Path("/srv/blobs")
    assert settings.blob_url_prefix == "/media"
    assert settings.sse_keepalive_seconds == 30.0
    assert settings.worker_urls == ("http://w1:8000", "http://w2:8000")
    assert settings.pool_retry_after_seconds == 12
