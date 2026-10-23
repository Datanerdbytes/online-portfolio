"""Real Ed25519 signatures with an isolated, injectable JWKS transport."""

import time
from types import SimpleNamespace

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.core import auth
from app.core.config import settings

BASE_URL = "https://test.neonauth.us-east-1.aws.neon.tech/neondb/auth"
ORIGIN = "https://test.neonauth.us-east-1.aws.neon.tech"
PRIVATE_KEY = Ed25519PrivateKey.generate()


def configure_neon(monkeypatch):
    monkeypatch.setattr(settings, "NEON_AUTH_BASE_URL", BASE_URL)
    monkeypatch.setattr(
        auth,
        "jwks_client",
        lambda _: SimpleNamespace(
            get_signing_key_from_jwt=lambda _: SimpleNamespace(key=PRIVATE_KEY.public_key())
        ),
    )


def create_access_token(subject, secret=None, **overrides):
    now = int(time.time())
    payload = dict(sub=subject, iss=ORIGIN, aud=ORIGIN, iat=now, exp=now + 900)
    payload.update(overrides)
    key = Ed25519PrivateKey.generate() if secret == "foreign" else PRIVATE_KEY
    return jwt.encode(payload, key, algorithm="EdDSA", headers={"kid": "test-key"})


def hash_password(_):
    # Compatibility for legacy CRUD fixture configuration, never used to authenticate.
    return "unused-managed-auth-fixture"
