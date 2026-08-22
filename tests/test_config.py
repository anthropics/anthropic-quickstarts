from pathlib import Path

from backend.config import Settings


def test_defaults_need_no_environment(monkeypatch):
    """A checkout should run against SQLite without any setup."""
    for name in ("DATABASE_URL", "BLOB_DIR", "BLOB_URL_PREFIX"):
        monkeypatch.delenv(name, raising=False)

    settings = Settings.from_env()

    assert settings.database_url.startswith("sqlite+aiosqlite://")
    assert settings.blob_dir == Path("./data/blobs")


def test_the_environment_wins(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user@db/app")
    monkeypatch.setenv("BLOB_DIR", "/srv/blobs")
    monkeypatch.setenv("BLOB_URL_PREFIX", "/media")

    settings = Settings.from_env()

    assert settings.database_url == "postgresql+asyncpg://user@db/app"
    assert settings.blob_dir == Path("/srv/blobs")
    assert settings.blob_url_prefix == "/media"
