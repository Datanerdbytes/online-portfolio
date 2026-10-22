import base64
from pathlib import Path
from typing import ClassVar

from argon2 import Type, extract_parameters
from argon2.exceptions import InvalidHashError
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DATABASE_URL: str = "postgresql+psycopg://resume:resume@localhost:5432/resume"
    WEB_APP_URL: str = "http://localhost:3000"

    # Directory that holds stored avatars. parents[2] resolves to apps/api.
    MEDIA_ROOT: Path = Path(__file__).resolve().parents[2] / "media"
    MAX_AVATAR_BYTES: int = 2097152

    # Optional so missing/invalid admin configuration never prevents public startup.
    API_ACCESS_SECRET: str | None = None
    OWNER_ID: str | None = None
    OWNER_USERNAME: str | None = None
    OWNER_PASSWORD_HASH: str | None = None

    ACCESS_TOKEN_EXPIRE_SECONDS: ClassVar[int] = 900
    LOGIN_RATE_LIMIT_ATTEMPTS: ClassVar[int] = 5
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: ClassVar[int] = 300

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()


def validate_auth_configuration() -> str | None:
    values = {
        "API_ACCESS_SECRET": settings.API_ACCESS_SECRET,
        "OWNER_ID": settings.OWNER_ID,
        "OWNER_USERNAME": settings.OWNER_USERNAME,
        "OWNER_PASSWORD_HASH": settings.OWNER_PASSWORD_HASH,
    }
    if not any(values.values()):
        return None
    missing = [name for name, value in values.items() if not value or not value.strip()]
    if missing:
        return f"Admin auth partially configured; missing: {', '.join(missing)}"
    secret = settings.API_ACCESS_SECRET
    hashed = settings.OWNER_PASSWORD_HASH
    assert secret is not None and hashed is not None
    if len(secret.encode("utf-8")) < 32 or secret != secret.strip():
        return "API_ACCESS_SECRET must contain at least 32 bytes (32 characters for ASCII)"
    if len(settings.OWNER_USERNAME or "") > 200:
        return "OWNER_USERNAME exceeds the login input limit"
    try:
        params = extract_parameters(hashed)
        for encoded in hashed.split("$")[-2:]:
            base64.b64decode(encoded + "=" * (-len(encoded) % 4), validate=True)
        if params.type is not Type.ID or params.version != 19:
            return "OWNER_PASSWORD_HASH must be an Argon2id hash"
        if params.salt_len < 8 or params.hash_len < 16:
            return "OWNER_PASSWORD_HASH must be a valid Argon2id hash"
        if (
            params.parallelism < 1
            or params.time_cost < 1
            or params.memory_cost < 8 * params.parallelism
        ):
            return "OWNER_PASSWORD_HASH must be a valid Argon2id hash"
    except (InvalidHashError, ValueError, TypeError):
        return "OWNER_PASSWORD_HASH must be a valid Argon2id hash"
    return None


def is_auth_configured() -> bool:
    return bool(
        settings.API_ACCESS_SECRET
        and settings.OWNER_ID
        and settings.OWNER_USERNAME
        and settings.OWNER_PASSWORD_HASH
        and validate_auth_configuration() is None
    )
