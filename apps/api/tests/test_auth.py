"""Neon's signed identities replace local passwords and token issuance."""

import time
from unittest.mock import patch

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core import auth
from app.core.config import is_auth_configured, settings
from app.main import app
from tests.neon_support import BASE_URL, PRIVATE_KEY, configure_neon, create_access_token


@pytest.fixture(autouse=True)
def neon(monkeypatch):
    configure_neon(monkeypatch)


def test_multiple_neon_users_are_valid():
    for subject in ("user-a", "user-b"):
        claims = auth.verify_owner_token("Bearer " + create_access_token(subject))
        assert claims.sub == subject


@pytest.mark.parametrize(
    "changes",
    [
        {"exp": 1},
        {"sub": ""},
        {"sub": 42},
        {"iat": "now"},
        {"exp": True},
        {"iss": "https://wrong.example"},
        {"aud": "another-app"},
        {"iat": int(time.time()) + 100},
    ],
)
def test_bad_claims(changes):
    with pytest.raises(HTTPException) as exc:
        auth.verify_owner_token("Bearer " + create_access_token("user", **changes))
    assert exc.value.status_code == 401


def test_wrong_signature():
    with pytest.raises(HTTPException) as exc:
        auth.verify_owner_token("Bearer " + create_access_token("user", "foreign"))
    assert exc.value.status_code == 401


def test_symmetric_token_rejected():
    token = jwt.encode(
        {"sub": "user"}, "test-only-key-32-characters-long-enough", algorithm="HS256"
    )
    with pytest.raises(HTTPException):
        auth.verify_owner_token("Bearer " + token)


def test_missing_required_claim():
    token = jwt.encode({"sub": "user"}, PRIVATE_KEY, algorithm="EdDSA", headers={"kid": "test"})
    with pytest.raises(HTTPException):
        auth.verify_owner_token("Bearer " + token)


@pytest.mark.parametrize("header", [None, "Basic abc", "Bearer ", "Bearer bad "])
def test_missing_or_invalid_bearer(header):
    with pytest.raises(HTTPException) as exc:
        auth.verify_owner_token(header)
    assert exc.value.status_code == 401


def test_jwks_outage_returns_503():
    with patch.object(
        auth, "jwks_client", side_effect=jwt.PyJWKClientConnectionError("private detail")
    ):
        with pytest.raises(HTTPException) as exc:
            auth.verify_owner_token("Bearer " + create_access_token("user"))
    assert exc.value.status_code == 503
    assert "private detail" not in exc.value.detail


def test_old_password_settings_cannot_enable_auth(monkeypatch):
    monkeypatch.setattr(settings, "NEON_AUTH_BASE_URL", None)
    monkeypatch.setattr(settings, "API_ACCESS_SECRET", "unused-old-key-with-at-least-32-bytes")
    assert not is_auth_configured()
    assert TestClient(app).get("/api/v1/auth/me").status_code == 503
    assert TestClient(app).get("/api/v1/health").json() == {"status": "ok"}


def test_backend_no_longer_accepts_password_login():
    assert TestClient(app).post("/api/v1/auth/login", json={}).status_code == 404
    assert TestClient(app).post("/api/v1/auth/register", json={}).status_code == 404


def test_jwks_endpoint_is_derived_only_from_configuration():
    client = auth.jwks_client(BASE_URL)
    assert client.get_signing_key_from_jwt
