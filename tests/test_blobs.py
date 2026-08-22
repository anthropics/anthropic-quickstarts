import hashlib

import pytest

from backend.database import FilesystemBlobStore

PNG = b"\x89PNG\r\n\x1a\nfake image bytes"


async def test_stored_bytes_come_back_unchanged(blobs):
    key = await blobs.put(PNG)

    assert await blobs.get(key) == PNG


async def test_key_is_the_content_digest(blobs):
    key = await blobs.put(PNG)

    assert key == f"{hashlib.sha256(PNG).hexdigest()}.png"


async def test_identical_screenshots_are_stored_once(tmp_path):
    """Runs produce the same screen repeatedly; content addressing collapses it."""
    root = tmp_path / "blobs"
    store = FilesystemBlobStore(root)

    first = await store.put(PNG)
    second = await store.put(PNG)

    assert first == second
    assert [path.name for path in root.iterdir()] == [first]


async def test_different_bytes_get_different_keys(blobs):
    assert await blobs.put(PNG) != await blobs.put(b"other bytes")


async def test_media_type_decides_the_suffix(blobs):
    assert (await blobs.put(PNG, suffix=".jpg")).endswith(".jpg")


async def test_url_is_built_from_the_prefix(tmp_path):
    store = FilesystemBlobStore(tmp_path, url_prefix="/media/")

    assert store.url_for("abc.png") == "/media/abc.png"


async def test_missing_blob_reads_as_none(blobs):
    assert await blobs.get("deadbeef.png") is None


@pytest.mark.parametrize(
    "key", ["../secret", "nested/path.png", "", ".hidden", "..\\windows"]
)
async def test_keys_cannot_escape_the_blob_directory(blobs, key):
    assert await blobs.get(key) is None
