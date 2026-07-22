from io import BytesIO

import numpy as np
import pytest
from PIL import Image

from app.core.eof import EofError, eof_embed, eof_extract
from app.core.stego import StegoError, capacity_bytes, embed_message, extract_message


def _cover(size=200) -> bytes:
    arr = (np.random.rand(size, size, 3) * 255).astype("uint8")
    buf = BytesIO()
    Image.fromarray(arr, "RGB").save(buf, "PNG")
    return buf.getvalue()


def test_embed_extract_roundtrip():
    cover = _cover()
    png = embed_message(cover, "the eagle lands at dawn", "pw123")
    assert extract_message(png, "pw123") == "the eagle lands at dawn"


def test_wrong_password_finds_nothing():
    png = embed_message(_cover(), "secret", "right")
    with pytest.raises(StegoError):
        extract_message(png, "wrong")


def test_decoy_channel():
    png = embed_message(
        _cover(),
        "real message",
        "realpw",
        decoy_message="fake message",
        decoy_password="decoypw",
    )
    assert extract_message(png, "realpw") == "real message"
    assert extract_message(png, "decoypw") == "fake message"


def test_decoy_password_must_differ():
    with pytest.raises(StegoError):
        embed_message(
            _cover(),
            "m",
            "same",
            decoy_message="d",
            decoy_password="same",
        )


def test_capacity_enforced():
    tiny = _cover(size=16)  # ~30 byte capacity
    with pytest.raises(StegoError):
        embed_message(tiny, "x" * 5000, "pw")


def test_capacity_reported():
    assert capacity_bytes(_cover(200)) > 4000


def test_eof_file_roundtrip():
    payload = bytes(range(256)) * 4
    stego = eof_embed(_cover(), payload, "data.bin", "application/octet-stream", "pw")
    out, name, mime = eof_extract(stego, "pw")
    assert out == payload and name == "data.bin"


def test_eof_wrong_password():
    stego = eof_embed(_cover(), b"x", "f.bin", "application/octet-stream", "pw")
    with pytest.raises(EofError):
        eof_extract(stego, "nope")
