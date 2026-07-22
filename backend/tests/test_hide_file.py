"""Universal append file-hiding: any payload inside any carrier."""

from io import BytesIO


def _carrier():
    # Pretend-MP4 carrier: arbitrary bytes, not an image.
    return (
        "clip.mp4",
        BytesIO(b"\x00\x00\x00\x18ftypmp42" + b"\xde\xad\xbe\xef" * 64),
        "video/mp4",
    )


def _payload():
    return ("secret.txt", BytesIO(b"top secret dossier contents"), "text/plain")


def test_hide_and_reveal_roundtrip(auth_client):
    res = auth_client.post(
        "/api/hide-file",
        data={"password": "pw"},
        files={"carrier": _carrier(), "payload": _payload()},
    )
    assert res.status_code == 200, res.text
    out = res.json()
    # Output preserves the carrier extension so it still opens as a video.
    assert out["stego_filename"].endswith(".mp4")

    stego = auth_client.get(out["stego_url"]).content
    rev = auth_client.post(
        "/api/reveal-file",
        data={"password": "pw"},
        files={"carrier": ("clip.mp4", BytesIO(stego), "video/mp4")},
    )
    assert rev.status_code == 200, rev.text
    body = rev.json()
    assert body["kind"] == "file"
    assert body["filename"] == "secret.txt"
    payload = auth_client.get(body["payload_url"]).content
    assert payload == b"top secret dossier contents"


def test_reveal_wrong_password(auth_client):
    out = auth_client.post(
        "/api/hide-file",
        data={"password": "right"},
        files={"carrier": _carrier(), "payload": _payload()},
    ).json()
    stego = auth_client.get(out["stego_url"]).content
    rev = auth_client.post(
        "/api/reveal-file",
        data={"password": "wrong"},
        files={"carrier": ("clip.mp4", BytesIO(stego), "video/mp4")},
    )
    assert rev.status_code == 422


def test_unsafe_extension_neutralised(auth_client):
    res = auth_client.post(
        "/api/hide-file",
        data={"password": "pw"},
        files={
            "carrier": ("evil.exe", BytesIO(b"MZ" + b"\x00" * 128), "application/octet-stream"),
            "payload": _payload(),
        },
    )
    assert res.status_code == 200
    assert res.json()["stego_filename"].endswith(".bin")
