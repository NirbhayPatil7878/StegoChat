"""Chat message self-destruct timers and stego decoy channel."""

from datetime import UTC, datetime, timedelta
from io import BytesIO

import numpy as np
from PIL import Image

from app.database import SessionLocal
from app.models import DirectMessage


def _cover_upload():
    arr = (np.random.rand(200, 200, 3) * 255).astype("uint8")
    buf = BytesIO()
    Image.fromarray(arr, "RGB").save(buf, "PNG")
    buf.seek(0)
    return ("cover.png", buf, "image/png")


def _register(client, username):
    res = client.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@ex.com", "password": "supersecret1"},
    )
    assert res.status_code == 201, res.text
    return res.json()["tokens"]["access_token"], res.json()["user"]["id"]


def _conversation(auth_client, other_id):
    res = auth_client.post("/api/conversations", json={"user_id": other_id})
    assert res.status_code == 200, res.text
    return res.json()["id"]


def test_text_message_expiry(auth_client):
    # auth_client is "tester"; create a peer to talk to.
    _, other_id = _register(auth_client, "peer")
    conv_id = _conversation(auth_client, other_id)

    res = auth_client.post(
        f"/api/conversations/{conv_id}/messages",
        json={"body": "self destruct", "expire_minutes": 5},
    )
    assert res.status_code == 200, res.text
    msg = res.json()
    assert msg["expires_at"] is not None
    msg_id = msg["id"]

    # Visible now.
    listed = auth_client.get(f"/api/conversations/{conv_id}/messages").json()
    assert any(m["id"] == msg_id for m in listed)

    # Force it into the past, then confirm it is filtered + purged.
    with SessionLocal() as db:
        row = db.query(DirectMessage).filter(DirectMessage.id == msg_id).first()
        row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        db.commit()

    listed = auth_client.get(f"/api/conversations/{conv_id}/messages").json()
    assert all(m["id"] != msg_id for m in listed)
    with SessionLocal() as db:
        assert db.query(DirectMessage).filter(DirectMessage.id == msg_id).first() is None


def test_stego_decoy_reveal(auth_client):
    _, other_id = _register(auth_client, "peer")
    conv_id = _conversation(auth_client, other_id)

    res = auth_client.post(
        f"/api/conversations/{conv_id}/stego",
        data={
            "message": "the real plan",
            "password": "realpw",
            "decoy_message": "just holiday photos",
            "decoy_password": "decoypw",
        },
        files={"image": _cover_upload()},
    )
    assert res.status_code == 200, res.text
    msg = res.json()
    # The decoy must not be advertised in the API response.
    assert "has_decoy" not in msg
    msg_id = msg["id"]

    real = auth_client.post(f"/api/messages/{msg_id}/reveal", json={"password": "realpw"})
    assert real.status_code == 200
    assert real.json()["message"] == "the real plan"

    decoy = auth_client.post(f"/api/messages/{msg_id}/reveal", json={"password": "decoypw"})
    assert decoy.status_code == 200
    assert decoy.json()["message"] == "just holiday photos"


def test_decoy_password_must_differ(auth_client):
    _, other_id = _register(auth_client, "peer")
    conv_id = _conversation(auth_client, other_id)
    res = auth_client.post(
        f"/api/conversations/{conv_id}/stego",
        data={
            "message": "hi",
            "password": "same",
            "decoy_message": "decoy",
            "decoy_password": "same",
        },
        files={"image": _cover_upload()},
    )
    assert res.status_code == 400


def test_expired_stego_reveal_gone(auth_client):
    _, other_id = _register(auth_client, "peer")
    conv_id = _conversation(auth_client, other_id)
    msg = auth_client.post(
        f"/api/conversations/{conv_id}/stego",
        data={"message": "boom", "password": "pw", "expire_minutes": 10},
        files={"image": _cover_upload()},
    ).json()

    with SessionLocal() as db:
        row = db.query(DirectMessage).filter(DirectMessage.id == msg["id"]).first()
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()

    gone = auth_client.post(f"/api/messages/{msg['id']}/reveal", json={"password": "pw"})
    assert gone.status_code == 410
