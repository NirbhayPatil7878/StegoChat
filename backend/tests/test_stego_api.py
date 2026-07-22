from io import BytesIO

import numpy as np
from PIL import Image


def _cover_upload():
    arr = (np.random.rand(180, 180, 3) * 255).astype("uint8")
    buf = BytesIO()
    Image.fromarray(arr, "RGB").save(buf, "PNG")
    buf.seek(0)
    return ("cover.png", buf, "image/png")


def test_embed_extract_flow(auth_client):
    res = auth_client.post(
        "/api/embed",
        data={"message": "midnight at the docks", "password": "pw"},
        files={"image": _cover_upload()},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["stego_url"].startswith("/api/files/")

    # Download the generated stego image and extract from it.
    img = auth_client.get(body["stego_url"])
    assert img.status_code == 200

    ext = auth_client.post(
        "/api/extract",
        data={"password": "pw"},
        files={"image": ("stego.png", BytesIO(img.content), "image/png")},
    )
    assert ext.status_code == 200
    assert ext.json()["message"] == "midnight at the docks"


def test_extract_wrong_password(auth_client):
    emb = auth_client.post(
        "/api/embed",
        data={"message": "hidden", "password": "right"},
        files={"image": _cover_upload()},
    ).json()
    img = auth_client.get(emb["stego_url"]).content
    ext = auth_client.post(
        "/api/extract",
        data={"password": "wrong"},
        files={"image": ("stego.png", BytesIO(img), "image/png")},
    )
    assert ext.status_code == 422


def test_history_records_embed(auth_client):
    auth_client.post(
        "/api/embed",
        data={"message": "logme", "password": "pw"},
        files={"image": _cover_upload()},
    )
    hist = auth_client.get("/api/history")
    assert hist.status_code == 200
    assert len(hist.json()) >= 1


def test_dashboard_stats(auth_client):
    auth_client.post(
        "/api/embed",
        data={"message": "x", "password": "pw"},
        files={"image": _cover_upload()},
    )
    dash = auth_client.get("/api/dashboard").json()
    assert dash["stats"]["total_embeds"] >= 1
    assert 0 <= dash["stats"]["security_score"] <= 100


def test_dead_drop_burns(auth_client):
    created = auth_client.post(
        "/api/dead-drop",
        json={"message": "self destruct", "password": "dd", "ttl_hours": 1},
    ).json()
    token = created["token"]
    first = auth_client.post(f"/api/dead-drop/{token}", json={"password": "dd"})
    assert first.status_code == 200
    assert first.json()["message"] == "self destruct"
    # Second read is gone (burned).
    second = auth_client.post(f"/api/dead-drop/{token}", json={"password": "dd"})
    assert second.status_code in (404, 410)
