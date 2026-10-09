"""Authorization and storage checks for group E2EE envelopes."""

import json
from datetime import UTC, datetime, timedelta
from io import BytesIO

import numpy as np
from Crypto.PublicKey import RSA
from PIL import Image

from app.database import SessionLocal
from app.models import DirectMessage, MessageKeyEnvelope


def _register(client, username):
    response = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.test",
            "password": "supersecret1",
        },
    )
    assert response.status_code == 201
    return response.json()["tokens"]["access_token"], response.json()["user"]["id"]


def _key():
    return RSA.generate(3072).public_key().export_key().decode()


def _image():
    stream = BytesIO()
    Image.fromarray(np.zeros((64, 64, 3), dtype=np.uint8), "RGB").save(stream, "PNG")
    return ("encrypted.png", BytesIO(stream.getvalue()), "image/png")


def test_e2ee_envelopes_are_private_and_membership_bound(auth_client):
    tokens = [auth_client.headers["Authorization"].split()[1]]
    sender_id = auth_client.get("/api/user").json()["id"]
    other_tokens = []
    ids = [sender_id]
    for name in ("peerone", "peertwo", "outsider"):
        token, user_id = _register(auth_client, name)
        other_tokens.append(token)
        ids.append(user_id)
    peer_ids = ids[1:3]
    group = auth_client.post(
        "/api/conversations/group", json={"name": "secure", "member_ids": peer_ids}
    ).json()
    for token in tokens + other_tokens[:2]:
        response = auth_client.put(
            "/api/users/e2ee-key",
            json={"public_key": _key()},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200

    envelopes = [{"user_id": user_id, "envelope": f"opaque-envelope-{user_id}"} for user_id in ids[:3]]
    sent = auth_client.post(
        f"/api/conversations/{group['id']}/e2ee-stego",
        data={"envelopes": json.dumps(envelopes)},
        files={"image": _image()},
    )
    assert sent.status_code == 200, sent.text
    message = sent.json()
    assert message["is_e2ee"] is True
    message_id = message["id"]

    own = auth_client.get(f"/api/messages/{message_id}/e2ee-envelope")
    assert own.status_code == 200
    assert own.json()["envelope"] == envelopes[0]["envelope"]
    # A second group member receives only their own envelope.
    member = auth_client.get(
        f"/api/messages/{message_id}/e2ee-envelope",
        headers={"Authorization": f"Bearer {other_tokens[0]}"},
    )
    assert member.status_code == 200
    assert member.json()["envelope"] == envelopes[1]["envelope"]
    left = auth_client.delete(
        f"/api/conversations/{group['id']}",
        headers={"Authorization": f"Bearer {other_tokens[0]}"},
    )
    assert left.status_code == 200
    assert auth_client.get(
        f"/api/messages/{message_id}/e2ee-envelope",
        headers={"Authorization": f"Bearer {other_tokens[0]}"},
    ).status_code == 404

    outsider = auth_client.get(
        f"/api/messages/{message_id}/e2ee-envelope",
        headers={"Authorization": f"Bearer {other_tokens[2]}"},
    )
    assert outsider.status_code == 404
    with SessionLocal() as db:
        row = db.query(DirectMessage).filter_by(id=message_id).one()
        stored = db.query(MessageKeyEnvelope).filter_by(message_id=message_id).all()
        assert row.body is None
        assert len(stored) == 3
        assert all("plaintext" not in envelope.envelope for envelope in stored)
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    expired = auth_client.get(f"/api/messages/{message_id}/e2ee-envelope")
    assert expired.status_code == 410


def test_e2ee_rejects_incomplete_duplicate_and_dm_rosters(auth_client):
    _, peer_id = _register(auth_client, "notready")
    group = auth_client.post(
        "/api/conversations/group", json={"name": "group", "member_ids": [peer_id]}
    ).json()
    auth_client.put("/api/users/e2ee-key", json={"public_key": _key()})
    image = _image()
    incomplete = auth_client.post(
        f"/api/conversations/{group['id']}/e2ee-stego",
        data={"envelopes": "[]"},
        files={"image": image},
    )
    assert incomplete.status_code == 400
    sender_id = auth_client.get("/api/user").json()["id"]
    duplicate = auth_client.post(
        f"/api/conversations/{group['id']}/e2ee-stego",
        data={
            "envelopes": json.dumps(
                [
                    {"user_id": sender_id, "envelope": "a"},
                    {"user_id": sender_id, "envelope": "b"},
                ]
            )
        },
        files={"image": _image()},
    )
    assert duplicate.status_code == 400
    not_ready = auth_client.post(
        f"/api/conversations/{group['id']}/e2ee-stego",
        data={
            "envelopes": json.dumps(
                [
                    {"user_id": sender_id, "envelope": "x"},
                    {"user_id": peer_id, "envelope": "y"},
                ]
            )
        },
        files={"image": _image()},
    )
    assert not_ready.status_code == 409
    dm = auth_client.post("/api/conversations", json={"user_id": peer_id}).json()
    direct = auth_client.post(
        f"/api/conversations/{dm['id']}/e2ee-stego",
        data={"envelopes": "[]"},
        files={"image": _image()},
    )
    assert direct.status_code == 400
