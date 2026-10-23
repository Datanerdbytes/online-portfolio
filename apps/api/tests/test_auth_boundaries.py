"""Managed-auth transport and fail-closed configuration boundaries."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings, validate_auth_configuration
from app.main import app
from tests.neon_support import configure_neon


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/auth",
        "https://user:password@example.com/auth",  # pragma: allowlist secret
        "https://example.com/auth?secret=bad",
    ],
)
def test_bad_provider_config(monkeypatch, url):
    monkeypatch.setattr(settings, "NEON_AUTH_BASE_URL", url)
    assert validate_auth_configuration()
    assert TestClient(app).get("/api/v1/auth/me").status_code == 503


def test_backend_does_not_trust_browser_cookies(monkeypatch):
    configure_neon(monkeypatch)
    client = TestClient(app)
    client.cookies.set("portfolio-admin", "forged")
    assert client.get("/api/v1/auth/me").status_code == 401
