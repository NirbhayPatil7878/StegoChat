"""Health, readiness, and metadata endpoints."""


def test_health_reports_build_metadata(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "stegochat"
    # Version, commit, environment and uptime are all surfaced for dashboards.
    assert "version" in body
    assert "commit" in body
    assert "environment" in body
    assert isinstance(body["uptime_seconds"], int | float)


def test_ready_ok_when_db_reachable(client):
    res = client.get("/api/ready")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"] == "ok"


def test_root_lists_endpoints(client):
    res = client.get("/")
    assert res.status_code == 200
    body = res.json()
    assert body["health"] == "/api/health"
    assert body["ready"] == "/api/ready"
