from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_points_at_entry_points():
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "Online Resume API"
    assert body["docs"] == "/docs"
    assert body["health"] == "/api/v1/health"
    assert body["web"].startswith("http")


def test_root_does_not_change_health_contract():
    assert client.get("/api/v1/health").json() == {"status": "ok"}
