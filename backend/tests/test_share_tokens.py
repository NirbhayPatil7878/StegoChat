"""Share tokens: create, redeem, reveal, access password, expiry, limits."""

from datetime import UTC, datetime, timedelta
from io import BytesIO

import numpy as np
from PIL import Image

from app.database import SessionLocal
from app.models import ShareToken


def _cover_upload():
    arr = (np.random.rand(220, 220, 3) * 255).astype("uint8")
    buf = BytesIO()
    Image.fromarray(arr, "RGB").save(buf, "PNG")
    buf.seek(0)
    return ("cover.png", buf, "image/png")


def _embed(auth_client, message="top secret", password="pw"):
    res = auth_client.post(
        "/api/embed",
        data={"message": message, "password": password},
        files={"image": _cover_upload()},
    )
    assert res.status_code == 200, res.text
    return res.json()["stego_filename"]


def test_create_list_redeem_reveal(auth_client):
    stego = _embed(auth_client, "the launch codes", "realpw")

    created = auth_client.post("/api/tokens", json={"stego_filename": stego, "label": "For Bob"})
    assert created.status_code == 201, created.text
    token = created.json()["token"]
    assert created.json()["share_path"] == f"/t/{token}"
    assert created.json()["protected"] is False

    # Owner sees it in their list.
    listing = auth_client.get("/api/tokens").json()
    assert any(t["token"] == token and t["label"] == "For Bob" for t in listing)

    # Public info (no auth header needed, but auth header is harmless).
    info = auth_client.get(f"/api/tokens/redeem/{token}")
    assert info.status_code == 200
    assert info.json()["protected"] is False
    assert info.json()["status"] == "active"

    # Redeem returns the carrier image URL and counts a read.
    red = auth_client.post(f"/api/tokens/redeem/{token}", json={})
    assert red.status_code == 200
    assert red.json()["stego_url"].endswith(stego)

    # Reveal the hidden message with the stego password.
    rev = auth_client.post(f"/api/tokens/redeem/{token}/reveal", json={"password": "realpw"})
    assert rev.status_code == 200
    assert rev.json()["message"] == "the launch codes"

    # Wrong stego password fails.
    bad = auth_client.post(f"/api/tokens/redeem/{token}/reveal", json={"password": "nope"})
    assert bad.status_code == 422


def test_access_password_gate(auth_client):
    stego = _embed(auth_client)
    token = auth_client.post(
        "/api/tokens",
        json={"stego_filename": stego, "access_password": "letmein"},
    ).json()["token"]

    assert auth_client.get(f"/api/tokens/redeem/{token}").json()["protected"] is True

    # Missing / wrong access password is rejected.
    assert auth_client.post(f"/api/tokens/redeem/{token}", json={}).status_code == 401
    assert (
        auth_client.post(
            f"/api/tokens/redeem/{token}", json={"access_password": "wrong"}
        ).status_code
        == 401
    )
    # Correct access password works.
    ok = auth_client.post(f"/api/tokens/redeem/{token}", json={"access_password": "letmein"})
    assert ok.status_code == 200


def test_max_reads_exhausts(auth_client):
    stego = _embed(auth_client)
    token = auth_client.post("/api/tokens", json={"stego_filename": stego, "max_reads": 1}).json()[
        "token"
    ]

    assert auth_client.post(f"/api/tokens/redeem/{token}", json={}).status_code == 200
    # Second open is gone.
    second = auth_client.post(f"/api/tokens/redeem/{token}", json={})
    assert second.status_code == 410


def test_revoke(auth_client):
    stego = _embed(auth_client)
    created = auth_client.post("/api/tokens", json={"stego_filename": stego}).json()
    token = created["token"]
    token_id = auth_client.get("/api/tokens").json()[0]["id"]

    assert auth_client.delete(f"/api/tokens/{token_id}").status_code == 200
    assert auth_client.get(f"/api/tokens/redeem/{token}").status_code == 410
    assert auth_client.post(f"/api/tokens/redeem/{token}", json={}).status_code == 410


def test_expired_token(auth_client):
    stego = _embed(auth_client)
    token = auth_client.post("/api/tokens", json={"stego_filename": stego, "ttl_hours": 1}).json()[
        "token"
    ]

    with SessionLocal() as db:
        row = db.query(ShareToken).filter(ShareToken.token == token).first()
        row.expires_at = datetime.now(UTC) - timedelta(hours=2)
        db.commit()

    assert auth_client.get(f"/api/tokens/redeem/{token}").status_code == 410


def test_cannot_tokenize_unowned_file(auth_client):
    # A random filename the user never produced must be rejected.
    res = auth_client.post("/api/tokens", json={"stego_filename": "stego_deadbeef.png"})
    assert res.status_code == 404


def test_embed_no_longer_returns_dead_drop(auth_client):
    res = auth_client.post(
        "/api/embed",
        data={"message": "hi", "password": "pw"},
        files={"image": _cover_upload()},
    ).json()
    assert "dead_drop_token" not in res
