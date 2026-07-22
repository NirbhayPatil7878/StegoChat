def test_register_and_login(client):
    r = client.post(
        "/api/auth/register",
        json={"username": "alice", "email": "alice@x.io", "password": "supersecret1"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["username"] == "alice"
    assert body["tokens"]["access_token"]

    r2 = client.post(
        "/api/auth/login", json={"identifier": "alice@x.io", "password": "supersecret1"}
    )
    assert r2.status_code == 200
    assert r2.json()["tokens"]["refresh_token"]


def test_duplicate_username_conflict(client):
    payload = {"username": "bob", "email": "bob@x.io", "password": "supersecret1"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    dup = client.post(
        "/api/auth/register",
        json={"username": "bob", "email": "other@x.io", "password": "supersecret1"},
    )
    assert dup.status_code == 409


def test_bad_login_rejected(client):
    client.post(
        "/api/auth/register",
        json={"username": "carol", "email": "carol@x.io", "password": "supersecret1"},
    )
    r = client.post("/api/auth/login", json={"identifier": "carol", "password": "wrongpass"})
    assert r.status_code == 401


def test_protected_route_requires_token(client):
    assert client.get("/api/user").status_code == 401


def test_refresh_rotation(client):
    reg = client.post(
        "/api/auth/register",
        json={"username": "dave", "email": "dave@x.io", "password": "supersecret1"},
    ).json()
    refresh = reg["tokens"]["refresh_token"]

    r = client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200
    # Old refresh token is now revoked (rotation).
    again = client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert again.status_code == 401


def test_password_too_short(client):
    r = client.post(
        "/api/auth/register",
        json={"username": "eve", "email": "eve@x.io", "password": "short"},
    )
    assert r.status_code == 422
