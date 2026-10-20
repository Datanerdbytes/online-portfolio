"""Authentication tests: database-free.

Covers token issuance/verification, login throttling, configuration
fail-closed behavior, and public endpoint independence from admin auth.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.auth import (
    ALGORITHM,
    AUDIENCE,
    ISSUER,
    create_access_token,
    hash_password,
    secret_or_fail,
    verify_password,
)
from app.core.config import is_auth_configured, settings, validate_auth_configuration
from app.main import app


def _configure_auth(monkeypatch):
    """Set throwaway test auth configuration on the settings singleton."""
    monkeypatch.setattr(settings, "API_ACCESS_SECRET", "test-secret-key-at-least-32-chars-long!")
    monkeypatch.setattr(settings, "OWNER_ID", "portfolio-owner")
    monkeypatch.setattr(settings, "OWNER_USERNAME", "owner-login")
    monkeypatch.setattr(
        settings,
        "OWNER_PASSWORD_HASH",
        hash_password("test-password"),
    )


def _unconfigure_auth(monkeypatch):
    monkeypatch.setattr(settings, "API_ACCESS_SECRET", None)
    monkeypatch.setattr(settings, "OWNER_ID", None)
    monkeypatch.setattr(settings, "OWNER_USERNAME", None)
    monkeypatch.setattr(settings, "OWNER_PASSWORD_HASH", None)


def _reset_rate_limiter(monkeypatch):
    from app.core import auth

    monkeypatch.setattr(auth, "_rate_limiter", auth.LoginRateLimiter(clock=lambda: 0))


@pytest.fixture(autouse=True)
def _isolate_rate_limiter(monkeypatch):
    _reset_rate_limiter(monkeypatch)
    yield
    _reset_rate_limiter(monkeypatch)


class TestLogin:
    def test_login_valid_credentials_returns_token(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "owner-login", "password": "test-password"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["token_type"] == "bearer"
        assert isinstance(body["access_token"], str) and len(body["access_token"]) > 0
        assert body["owner_id"] == "portfolio-owner"
        assert isinstance(body["expires_at"], int)
        assert body["expires_at"] > int(time.time())

    def test_login_never_returns_token_in_error(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "owner-login", "password": "wrong-password"},
        )
        assert response.status_code == 401
        body = response.json()
        assert "access_token" not in str(body).lower()

    def test_login_invalid_credentials_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "owner-login", "password": "wrong-password"},
        )
        assert response.status_code == 401
        assert response.headers.get("WWW-Authenticate") == "Bearer"

    def test_login_unknown_username_generic_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "no-such-user", "password": "anything"},
        )
        assert response.status_code == 401

    def test_login_empty_password_400(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "owner-login", "password": ""},
        )
        assert response.status_code == 400

    def test_login_missing_body_400(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        response = client.post("/api/v1/auth/login", json={})
        assert response.status_code == 400

    def test_login_unconfigured_503(self, monkeypatch):
        _unconfigure_auth(monkeypatch)
        client = TestClient(app)
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "owner-login", "password": "test-password"},
        )
        assert response.status_code == 503

    def test_login_rate_limit_429(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        # 5 attempts: first with wrong password consumes budget, all count.
        for _ in range(settings.LOGIN_RATE_LIMIT_ATTEMPTS):
            client.post(
                "/api/v1/auth/login",
                json={"username": "owner-login", "password": "wrong-password"},
            )
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "owner-login", "password": "test-password"},
        )
        assert response.status_code == 429
        assert "Retry-After" in response.headers

    def test_login_rate_limit_global_not_per_username(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        # Exhaust budget with different usernames.
        for i in range(settings.LOGIN_RATE_LIMIT_ATTEMPTS):
            client.post(
                "/api/v1/auth/login",
                json={"username": f"user-{i}", "password": "wrong"},
            )
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "owner-login", "password": "test-password"},
        )
        assert response.status_code == 429

    def test_login_rate_limit_concurrent(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)

        def attempt(_):
            return client.post(
                "/api/v1/auth/login",
                json={"username": "owner-login", "password": "wrong-password"},
            )

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(attempt, i) for i in range(20)]
            results = [f.result() for f in as_completed(futures)]

        statuses = [r.status_code for r in results]
        # Exactly settings.LOGIN_RATE_LIMIT_ATTEMPTS should succeed (401),
        # the rest should be 429.
        assert statuses.count(401) == settings.LOGIN_RATE_LIMIT_ATTEMPTS
        assert statuses.count(429) == 20 - settings.LOGIN_RATE_LIMIT_ATTEMPTS


class TestAuthMe:
    def test_me_valid_token_200(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        login_resp = client.post(
            "/api/v1/auth/login",
            json={"username": "owner-login", "password": "test-password"},
        )
        token = login_resp.json()["access_token"]
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body == {
            "owner_id": "portfolio-owner",
            "authenticated": True,
            "expires_at": login_resp.json()["expires_at"],
        }

    def test_me_missing_token_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 401
        assert response.headers.get("WWW-Authenticate") == "Bearer"

    def test_me_bad_scheme_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Basic abc123"},
        )
        assert response.status_code == 401

    def test_me_tampered_token_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert response.status_code == 401

    def test_me_wrong_algorithm_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        token = jwt.encode(
            {
                "iss": ISSUER,
                "aud": AUDIENCE,
                "sub": "portfolio-owner",
                "iat": 1,
                "exp": 9999999999,
                "jti": "x",
            },
            key=None,
            algorithm="none",
        )
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401

    def test_me_wrong_secret_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        token = create_access_token("portfolio-owner", "wrong-secret-key-at-least-32-chars-long!")
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401

    def test_me_wrong_issuer_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        secret = settings.API_ACCESS_SECRET or ""
        now = int(time.time())
        token = jwt.encode(
            {
                "iss": "wrong-issuer",
                "aud": AUDIENCE,
                "sub": "portfolio-owner",
                "iat": now,
                "exp": now + 900,
                "jti": "x",
            },
            secret,
            algorithm=ALGORITHM,
        )
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401

    def test_me_wrong_audience_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        secret = settings.API_ACCESS_SECRET or ""
        now = int(time.time())
        token = jwt.encode(
            {
                "iss": ISSUER,
                "aud": "wrong-audience",
                "sub": "portfolio-owner",
                "iat": now,
                "exp": now + 900,
                "jti": "x",
            },
            secret,
            algorithm=ALGORITHM,
        )
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401

    def test_me_missing_claims_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        secret = settings.API_ACCESS_SECRET or ""
        now = int(time.time())
        # Missing jti
        token = jwt.encode(
            {
                "iss": ISSUER,
                "aud": AUDIENCE,
                "sub": "portfolio-owner",
                "iat": now,
                "exp": now + 900,
            },
            secret,
            algorithm=ALGORITHM,
        )
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401

    def test_me_expired_token_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        secret = settings.API_ACCESS_SECRET or ""
        token = jwt.encode(
            {
                "iss": ISSUER,
                "aud": AUDIENCE,
                "sub": "portfolio-owner",
                "iat": 1,
                "exp": 1,
                "jti": "x",
            },
            secret,
            algorithm=ALGORITHM,
        )
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401

    def test_me_non_owner_token_403(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        secret = settings.API_ACCESS_SECRET or ""
        now = int(time.time())
        token = jwt.encode(
            {
                "iss": ISSUER,
                "aud": AUDIENCE,
                "sub": "someone-else",
                "iat": now,
                "exp": now + 900,
                "jti": "x",
            },
            secret,
            algorithm=ALGORITHM,
        )
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403

    def test_me_token_lifetime_exceeds_900_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        secret = settings.API_ACCESS_SECRET or ""
        now = int(time.time())
        token = jwt.encode(
            {
                "iss": ISSUER,
                "aud": AUDIENCE,
                "sub": "portfolio-owner",
                "iat": now,
                "exp": now + 1800,
                "jti": "x",
            },
            secret,
            algorithm=ALGORITHM,
        )
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401

    def test_me_token_issued_in_future_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        secret = settings.API_ACCESS_SECRET or ""
        token = jwt.encode(
            {
                "iss": ISSUER,
                "aud": AUDIENCE,
                "sub": "portfolio-owner",
                "iat": int(time.time()) + 100,
                "exp": int(time.time()) + 1000,
                "jti": "x",
            },
            secret,
            algorithm=ALGORITHM,
        )
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401

    def test_me_unconfigured_503(self, monkeypatch):
        _unconfigure_auth(monkeypatch)
        client = TestClient(app)
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 503


class TestNoBackendLogout:
    def test_logout_not_exposed(self, monkeypatch):
        _configure_auth(monkeypatch)
        client = TestClient(app)
        response = client.post("/api/v1/auth/logout")
        assert response.status_code == 404

    def test_logout_unconfigured_not_exposed(self, monkeypatch):
        _unconfigure_auth(monkeypatch)
        client = TestClient(app)
        response = client.post("/api/v1/auth/logout")
        assert response.status_code == 404


class TestConfiguration:
    def test_auth_unconfigured_is_acceptable(self, monkeypatch):
        _unconfigure_auth(monkeypatch)
        assert not is_auth_configured()
        assert validate_auth_configuration() is None

    def test_auth_partial_config_reports_missing(self, monkeypatch):
        _unconfigure_auth(monkeypatch)
        monkeypatch.setattr(
            settings,
            "API_ACCESS_SECRET",
            "test-secret-key-at-least-32-chars-long!",
        )
        monkeypatch.setattr(settings, "OWNER_ID", "portfolio-owner")
        # OWNER_USERNAME and OWNER_PASSWORD_HASH still missing
        problem = validate_auth_configuration()
        assert problem is not None
        assert "OWNER_USERNAME" in problem
        assert "OWNER_PASSWORD_HASH" in problem

    def test_auth_weak_secret_rejected(self, monkeypatch):
        _configure_auth(monkeypatch)
        monkeypatch.setattr(settings, "API_ACCESS_SECRET", "short")
        problem = validate_auth_configuration()
        assert problem is not None
        assert "32 characters" in problem

    def test_auth_non_argon2_hash_rejected(self, monkeypatch):
        _configure_auth(monkeypatch)
        monkeypatch.setattr(settings, "OWNER_PASSWORD_HASH", "not-an-argon2-hash")
        problem = validate_auth_configuration()
        assert problem is not None
        assert "Argon2id" in problem


class TestPublicEndpointsIndependent:
    def test_health_works_without_auth_config(self, monkeypatch):
        _unconfigure_auth(monkeypatch)
        client = TestClient(app)
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_projects_works_without_auth_config(self, monkeypatch):
        _unconfigure_auth(monkeypatch)
        client = TestClient(app)
        from unittest.mock import MagicMock

        from app.db.session import get_db

        db = MagicMock()
        db.query.return_value.order_by.return_value.all.return_value = []
        app.dependency_overrides[get_db] = lambda: db
        try:
            response = client.get("/api/v1/projects")
            assert response.status_code == 200
            assert response.json() == {"items": []}
        finally:
            app.dependency_overrides.pop(get_db, None)


class TestArgon2:
    def test_hash_and_verify(self):
        hashed = hash_password("test-password")
        assert hashed.startswith("$argon2id$")
        assert verify_password("test-password", hashed)
        assert not verify_password("wrong-password", hashed)

    def test_secret_or_fail_raises_when_unconfigured(self, monkeypatch):
        _unconfigure_auth(monkeypatch)

        with pytest.raises(HTTPException) as exc:
            secret_or_fail()
        assert exc.value.status_code == 503
