"""Multi-image split embedding round-trip and error handling."""

from io import BytesIO

import numpy as np
import pytest
from PIL import Image

from app.core.stego import (
    StegoError,
    embed_message_split,
    extract_message_split,
)


def _cover_bytes(size=140):
    arr = (np.random.rand(size, size, 3) * 255).astype("uint8")
    buf = BytesIO()
    Image.fromarray(arr, "RGB").save(buf, "PNG")
    return buf.getvalue()


def test_split_roundtrip_core():
    covers = [_cover_bytes() for _ in range(3)]
    message = "This is a longer secret spread across several innocuous images." * 3
    parts = embed_message_split(covers, message, "pw")
    assert len(parts) == 3
    # Order should not matter on extraction.
    assert extract_message_split(list(reversed(parts)), "pw") == message


def test_split_missing_part_errors():
    covers = [_cover_bytes() for _ in range(3)]
    parts = embed_message_split(covers, "hello world split", "pw")
    with pytest.raises(StegoError, match="Incomplete set"):
        extract_message_split(parts[:2], "pw")


def _upload(data, name):
    return (name, BytesIO(data), "image/png")


def test_split_api_roundtrip(auth_client):
    covers = [_cover_bytes() for _ in range(3)]
    files = [("images", _upload(c, f"c{i}.png")) for i, c in enumerate(covers)]
    res = auth_client.post(
        "/api/embed-split",
        data={"message": "distributed secret message", "password": "pw"},
        files=files,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 3

    # Download all parts and reassemble via the API.
    downloaded = [auth_client.get(p["stego_url"]).content for p in body["parts"]]
    ex_files = [("images", _upload(d, f"p{i}.png")) for i, d in enumerate(downloaded)]
    ext = auth_client.post("/api/extract-split", data={"password": "pw"}, files=ex_files)
    assert ext.status_code == 200, ext.text
    assert ext.json()["message"] == "distributed secret message"


def test_split_api_requires_two_images(auth_client):
    res = auth_client.post(
        "/api/embed-split",
        data={"message": "x", "password": "pw"},
        files=[("images", _upload(_cover_bytes(), "one.png"))],
    )
    assert res.status_code == 400
