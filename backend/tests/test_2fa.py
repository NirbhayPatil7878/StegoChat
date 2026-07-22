"""TOTP two-factor auth: enroll, login challenge, verify, recovery codes."""

import pyotp


def test_2fa_enroll_and_login(client):
    # Register + authenticate.
    reg = client.post(
        "/api/auth/register",
        json={"username": "twofa", "email": "twofa@example.com", "password": "supersecret1"},
    )
    token = reg.json()["tokens"]["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    # Begin setup -> get a secret.
    setup = client.post("/api/auth/2fa/setup", headers=auth)
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    assert setup.json()["otpauth_uri"].startswith("otpauth://")

    # Enable with a valid code -> receive recovery codes.
    code = pyotp.TOTP(secret).now()
    enable = client.post("/api/auth/2fa/enable", headers=auth, json={"code": code})
    assert enable.status_code == 200, enable.text
    recovery = enable.json()["recovery_codes"]
    assert len(recovery) == 10

    # Now a plain login returns a challenge, not tokens.
    login = client.post(
        "/api/auth/login",
        json={"identifier": "twofa", "password": "supersecret1"},
    )
    assert login.status_code == 200
    assert login.json().get("two_factor_required") is True
    challenge = login.json()["challenge_token"]

    # Wrong code is rejected.
    bad = client.post(
        "/api/auth/2fa/verify",
        json={"challenge_token": challenge, "code": "000000"},
    )
    assert bad.status_code == 401

    # Correct TOTP code exchanges the challenge for real tokens.
    good = client.post(
        "/api/auth/2fa/verify",
        json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
    )
    assert good.status_code == 200, good.text
    assert "access_token" in good.json()["tokens"]
    assert good.json()["user"]["totp_enabled"] is True


def test_2fa_recovery_code_login(client):
    reg = client.post(
        "/api/auth/register",
        json={"username": "recov", "email": "recov@example.com", "password": "supersecret1"},
    )
    auth = {"Authorization": f"Bearer {reg.json()['tokens']['access_token']}"}
    secret = client.post("/api/auth/2fa/setup", headers=auth).json()["secret"]
    recovery = client.post(
        "/api/auth/2fa/enable", headers=auth, json={"code": pyotp.TOTP(secret).now()}
    ).json()["recovery_codes"]

    challenge = client.post(
        "/api/auth/login", json={"identifier": "recov", "password": "supersecret1"}
    ).json()["challenge_token"]

    # A recovery code works once...
    ok = client.post(
        "/api/auth/2fa/verify", json={"challenge_token": challenge, "code": recovery[0]}
    )
    assert ok.status_code == 200, ok.text

    # ...and cannot be reused.
    challenge2 = client.post(
        "/api/auth/login", json={"identifier": "recov", "password": "supersecret1"}
    ).json()["challenge_token"]
    reused = client.post(
        "/api/auth/2fa/verify", json={"challenge_token": challenge2, "code": recovery[0]}
    )
    assert reused.status_code == 401


def test_2fa_disable_requires_password(client):
    reg = client.post(
        "/api/auth/register",
        json={"username": "disable", "email": "disable@example.com", "password": "supersecret1"},
    )
    auth = {"Authorization": f"Bearer {reg.json()['tokens']['access_token']}"}
    secret = client.post("/api/auth/2fa/setup", headers=auth).json()["secret"]
    client.post("/api/auth/2fa/enable", headers=auth, json={"code": pyotp.TOTP(secret).now()})

    assert (
        client.post("/api/auth/2fa/disable", headers=auth, json={"password": "wrong"}).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/2fa/disable", headers=auth, json={"password": "supersecret1"}
        ).status_code
        == 200
    )

    # Login no longer needs a second factor.
    login = client.post(
        "/api/auth/login", json={"identifier": "disable", "password": "supersecret1"}
    )
    assert "tokens" in login.json()
