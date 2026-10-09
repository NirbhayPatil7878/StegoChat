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


def test_registration_fails_when_otp_delivery_fails(client, monkeypatch):
    from app.routers import auth

    delivered_code = None

    def fail_delivery(_email, code, _ttl_minutes):
        nonlocal delivered_code
        delivered_code = code
        return False

    monkeypatch.setattr(auth, "send_otp_email", fail_delivery)
    response = client.post(
        "/api/auth/register",
        json={
            "username": "undelivered",
            "email": "undelivered@example.com",
            "password": "supersecret1",
        },
    )

    assert response.status_code == 503
    assert delivered_code is not None
    assert delivered_code not in response.text


def test_registration_without_provider_returns_actionable_error(client, monkeypatch):
    from app.config import settings
    from app.routers import auth
    from app.services import mail

    for name, value in {
        "environment": "production",
        "dev_mail_enabled": False,
        "gmail_client_id": None,
        "gmail_client_secret": None,
        "gmail_refresh_token": None,
        "smtp_host": None,
        "smtp_user": None,
        "smtp_password": None,
        "mail_from": None,
    }.items():
        monkeypatch.setattr(settings, name, value)
    monkeypatch.setattr(auth, "send_otp_email", mail.send_otp_email)

    response = client.post(
        "/api/auth/register",
        json={"username": "no_mail", "email": "no_mail@example.com", "password": "supersecret1"},
    )

    assert response.status_code == 503
    assert "server mail configuration" in response.json()["detail"].lower()
    assert "otp" not in response.text.lower()


def test_signup_resend_reports_otp_delivery_failure(auth_client, monkeypatch):
    from app.routers import auth

    monkeypatch.setattr(auth, "send_otp_email", lambda *_args: False)
    response = auth_client.post("/api/auth/signup-resend-otp")

    assert response.status_code == 503
    assert "email delivery" in response.json()["detail"].lower()


def test_signup_otp_is_six_digits_hashed_expires_and_is_single_use(client, monkeypatch):
    import re

    from app.database import SessionLocal
    from app.models.token import OneTimeToken
    from app.routers import auth

    sent_codes = []
    monkeypatch.setattr(
        auth,
        "send_otp_email",
        lambda _email, code, _ttl: sent_codes.append(code) or True,
    )
    registration = client.post(
        "/api/auth/register",
        json={"username": "otpuser", "email": "otpuser@example.com", "password": "supersecret1"},
    )
    assert registration.status_code == 201
    assert len(sent_codes) == 1
    code = sent_codes[0]
    assert re.fullmatch(r"\d{6}", code)
    assert code not in registration.text

    with SessionLocal() as db:
        record = db.query(OneTimeToken).filter_by(user_id=registration.json()["user"]["id"]).one()
        assert record.token_hash != code
        assert record.purpose == "signup_verify"

    headers = {"Authorization": f"Bearer {registration.json()['tokens']['access_token']}"}
    verified = client.post("/api/auth/signup-verify-otp", headers=headers, json={"code": code})
    assert verified.status_code == 200
    replay = client.post("/api/auth/signup-verify-otp", headers=headers, json={"code": code})
    assert replay.status_code == 409


def test_login_otp_delivery_failure_does_not_return_challenge(client, monkeypatch):
    from app.database import SessionLocal
    from app.models import User
    from app.routers import auth

    registration = client.post(
        "/api/auth/register",
        json={
            "username": "otp_login",
            "email": "otp_login@example.com",
            "password": "supersecret1",
        },
    )
    assert registration.status_code == 201
    with SessionLocal() as db:
        user = db.query(User).filter_by(username="otp_login").one()
        user.email_verified = True
        user.email_otp_enabled = True
        db.commit()

    monkeypatch.setattr(auth, "send_otp_email", lambda *_args: False)
    response = client.post(
        "/api/auth/login",
        json={"identifier": "otp_login", "password": "supersecret1"},
    )
    assert response.status_code == 503
    assert "challenge_token" not in response.text


def test_expired_signup_otp_is_rejected(client, monkeypatch):
    from datetime import UTC, datetime, timedelta

    from app.database import SessionLocal
    from app.models.token import OneTimeToken
    from app.routers import auth

    sent_codes = []
    monkeypatch.setattr(
        auth,
        "send_otp_email",
        lambda _email, code, _ttl: sent_codes.append(code) or True,
    )
    registration = client.post(
        "/api/auth/register",
        json={
            "username": "otp_expired",
            "email": "otp_expired@example.com",
            "password": "supersecret1",
        },
    )
    assert registration.status_code == 201
    with SessionLocal() as db:
        record = db.query(OneTimeToken).filter_by(user_id=registration.json()["user"]["id"]).one()
        record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()

    headers = {"Authorization": f"Bearer {registration.json()['tokens']['access_token']}"}
    response = client.post(
        "/api/auth/signup-verify-otp", headers=headers, json={"code": sent_codes[0]}
    )
    assert response.status_code == 400
    assert "expired" in response.json()["detail"].lower()


def test_failed_email_verification_never_returns_token(auth_client, monkeypatch):
    from app.routers import auth

    observed_url = []
    monkeypatch.setattr(
        auth,
        "send_verification_email",
        lambda _email, url: observed_url.append(url) or False,
    )
    response = auth_client.post("/api/auth/request-verification")

    assert response.status_code == 503
    assert len(observed_url) == 1
    assert observed_url[0].split("token=", 1)[1] not in response.text
    assert response.json()["dev_token"] is None


def test_forgot_password_never_returns_reset_token(client, monkeypatch):
    from app.routers import auth

    observed_url = []
    monkeypatch.setattr(
        auth,
        "send_reset_email",
        lambda _email, url: observed_url.append(url) or False,
    )
    registration = client.post(
        "/api/auth/register",
        json={
            "username": "reset_token",
            "email": "reset_token@example.com",
            "password": "supersecret1",
        },
    )
    assert registration.status_code == 201

    response = client.post("/api/auth/forgot-password", json={"email": "reset_token@example.com"})

    assert response.status_code == 200
    assert len(observed_url) == 1
    assert observed_url[0].split("token=", 1)[1] not in response.text
    assert response.json()["dev_token"] is None
