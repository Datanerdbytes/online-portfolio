import time

import jwt
import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient

from app.core.auth import ALGORITHM, AUDIENCE, ISSUER
from app.core.config import settings
from app.main import app


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "API_ACCESS_SECRET", "isolated-review-key-at-least-32-bytes!")
    monkeypatch.setattr(settings, "OWNER_ID", "review-owner")
    monkeypatch.setattr(settings, "OWNER_USERNAME", "review-owner")
    monkeypatch.setattr(
        settings, "OWNER_PASSWORD_HASH", PasswordHasher().hash("test-only-password")
    )
    return TestClient(app)


@pytest.mark.parametrize(
    "field,value", [("API_ACCESS_SECRET", "short"), ("OWNER_PASSWORD_HASH", "$argon2id$broken")]
)
def test_bad_configuration_returns_503(configured, monkeypatch, field, value):
    monkeypatch.setattr(settings, field, value)
    assert configured.get("/api/v1/auth/me").status_code == 503
    assert (
        configured.post(
            "/api/v1/auth/login",
            json={"username": "review-owner", "password": "test-only-password"},
        ).status_code
        == 503
    )


@pytest.mark.parametrize(
    "override",
    [
        {"iat": str(int(time.time()))},
        {"exp": str(int(time.time()) + 100)},
        {"jti": ""},
        {"iat": True},
        {"exp": float(int(time.time()) + 100)},
    ],
)
def test_claim_types_fail_closed(configured, override):
    now = int(time.time())
    claims = dict(iss=ISSUER, aud=AUDIENCE, sub="review-owner", iat=now, exp=now + 100, jti="test")
    claims.update(override)
    token = jwt.encode(claims, settings.API_ACCESS_SECRET, algorithm=ALGORITHM)
    assert (
        configured.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code
        == 401
    )


def test_schema_error_is_sanitized(configured):
    response = configured.post("/api/v1/auth/login", json={"password": "never-echo-this-password"})
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid request"}
    assert "never-echo" not in response.text


@pytest.mark.parametrize("claim,value", [("iat", 1.5), ("iat", "now"), ("jti", " "), ("exp", True)])
def test_additional_claim_types(configured, claim, value):
    now = int(time.time())
    claims = dict(iss=ISSUER, aud=AUDIENCE, sub="review-owner", iat=now, exp=now + 100, jti="x")
    claims[claim] = value
    token = jwt.encode(claims, settings.API_ACCESS_SECRET, algorithm=ALGORITHM)
    assert (
        configured.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code
        == 401
    )


def test_expiry_is_absolute_and_key_rotation_revokes(configured, monkeypatch):
    from app.core import auth

    clock = [1_800_000_000]
    monkeypatch.setattr(auth.time, "time", lambda: clock[0])
    token = auth.create_access_token("review-owner", settings.API_ACCESS_SECRET)
    headers = {"Authorization": f"Bearer {token}"}
    for advance in (0, 300, 899):
        clock[0] = 1_800_000_000 + advance
        response = configured.get("/api/v1/auth/me", headers=headers)
        assert response.status_code == 200
        assert response.json()["expires_at"] == 1_800_000_900
    clock[0] = 1_800_000_900
    assert configured.get("/api/v1/auth/me", headers=headers).status_code == 401
    clock[0] = 1_800_000_001
    monkeypatch.setattr(settings, "API_ACCESS_SECRET", "rotated-test-key-with-more-than-32-bytes!")
    assert configured.get("/api/v1/auth/me", headers=headers).status_code == 401


def test_rate_limit_uses_monotonic_window(monkeypatch):
    from fastapi import HTTPException

    from app.core.auth import LoginRateLimiter

    clock = [299.5]
    limiter = LoginRateLimiter(clock=lambda: clock[0])
    monkeypatch.setattr(time, "time", lambda: -1_000_000)
    for _ in range(5):
        limiter.check_and_record()
    with pytest.raises(HTTPException) as exc:
        limiter.check_and_record()
    assert exc.value.status_code == 429
    assert exc.value.headers == {"Retry-After": "1"}
    clock[0] = 300
    limiter.check_and_record()


@pytest.mark.parametrize("username", ["review-owner", "unknown-owner"])
def test_each_failed_login_performs_one_verification(configured, monkeypatch, username):
    from app.api.v1 import auth as routes
    from app.core import auth

    monkeypatch.setattr(auth, "_rate_limiter", auth.LoginRateLimiter())
    calls = []
    monkeypatch.setattr(
        routes, "verify_password", lambda password, hashed: calls.append(hashed) or False
    )
    response = configured.post(
        "/api/v1/auth/login", json={"username": username, "password": "wrong"}
    )
    assert response.status_code == 401
    assert len(calls) == 1
    assert calls[0] == (
        settings.OWNER_PASSWORD_HASH if username == "review-owner" else auth.DUMMY_PASSWORD_HASH
    )


@pytest.mark.parametrize(
    "body",
    [
        None,
        [],
        {"username": 12, "password": "hidden"},
        {"username": "x", "password": "hidden", "extra": True},
    ],
)
def test_invalid_login_shape_is_generic(configured, body):
    response = configured.post("/api/v1/auth/login", json=body)
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid request"}
    assert response.headers["cache-control"] == "no-store"


def test_forwarded_identity_headers_and_cookies_are_not_authentication(configured):
    response = configured.get(
        "/api/v1/auth/me", headers={"X-Owner-ID": "review-owner", "Cookie": "portfolio-admin=fake"}
    )
    assert response.status_code == 401


@pytest.mark.parametrize(
    "overrides", [{"nbf": {}}, {"iat": int(time.time()) + 20, "exp": int(time.time()) + 10}]
)
def test_invalid_optional_claims_and_date_order(configured, overrides):
    now = int(time.time())
    claims = dict(iss=ISSUER, aud=AUDIENCE, sub="review-owner", iat=now, exp=now + 100, jti="x")
    claims.update(overrides)
    token = jwt.encode(claims, settings.API_ACCESS_SECRET, algorithm=ALGORITHM)
    response = configured.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_invalid_hash_encoding_fails_closed(configured, monkeypatch):
    encoded = settings.OWNER_PASSWORD_HASH.split("$")
    encoded[-1] = "!" * len(encoded[-1])
    monkeypatch.setattr(settings, "OWNER_PASSWORD_HASH", "$".join(encoded))
    assert configured.get("/api/v1/auth/me").status_code == 503


def test_invalid_unicode_password_is_a_generic_400(configured):
    response = configured.post(
        "/api/v1/auth/login", json={"username": "review-owner", "password": "\ud800"}
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid credentials"}
