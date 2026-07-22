import os

import pytest

# Use an isolated in-memory-ish sqlite file for tests before importing the app.
os.environ["STEGOCHAT_DATABASE_URL"] = "sqlite:///./test_stegochat.db"
os.environ["STEGOCHAT_SECRET_KEY"] = "test-secret-key-for-pytest-only-000000000000"
# Never call the HaveIBeenPwned network API from the test suite.
os.environ["STEGOCHAT_PWNED_CHECK_ENABLED"] = "false"

from fastapi.testclient import TestClient  # noqa: E402

from app.core.rate_limit import limiter  # noqa: E402
from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

# Rate limiting is keyed by client IP with a process-wide in-memory store, so
# it accumulates across the whole suite (all requests share 127.0.0.1). That is
# irrelevant to functional correctness — disable enforcement for tests.
limiter.enabled = False


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_client(client):
    """A TestClient with a registered + authenticated user's bearer token set."""
    res = client.post(
        "/api/auth/register",
        json={"username": "tester", "email": "tester@example.com", "password": "supersecret1"},
    )
    assert res.status_code == 201, res.text
    token = res.json()["tokens"]["access_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client
