import os
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings


def normalize_no_proxy_env() -> None:
    # httpx 0.27 turns bracketed IPv6 NO_PROXY entries into invalid
    # "all://*[::1]" mount patterns; the bare address is the valid form.
    for key in ("NO_PROXY", "no_proxy"):
        value = os.environ.get(key)
        if not value:
            continue
        hosts: list[str] = []
        for host in value.split(","):
            host = host.strip()
            if host.startswith("[") and host.endswith("]"):
                host = host[1:-1]
            if host and host not in hosts:
                hosts.append(host)
        os.environ[key] = ",".join(hosts)


normalize_no_proxy_env()


class Settings(BaseSettings):
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DATABASE_URL: str = "postgresql+psycopg://resume:resume@localhost:5432/resume"
    WEB_APP_URL: str = "http://localhost:3000"

    # Directory that holds stored avatars. parents[2] resolves to apps/api.
    MEDIA_ROOT: Path = Path(__file__).resolve().parents[2] / "media"
    MAX_AVATAR_BYTES: int = 2097152
    MEDIA_STORAGE: Literal["local", "database"] = "local"
    LOGIN_RATE_LIMIT_STORAGE: Literal["local", "database"] = "local"
    DATABASE_POOL_MODE: Literal["local", "external"] = "local"

    NEON_AUTH_BASE_URL: str | None = None
    PUBLIC_PORTFOLIO_USER_ID: str = "00000000-0000-0000-0000-000000000001"
    LEGACY_NEON_USER_ID: str | None = None

    # Deprecated fields remain parseable in old .env files, but never authenticate anyone.
    API_ACCESS_SECRET: str | None = None
    OWNER_ID: str | None = None
    OWNER_USERNAME: str | None = None
    OWNER_PASSWORD_HASH: str | None = None

    # Resume import remains off until the hosted model passes evaluation.
    RESUME_IMPORT_ENABLED: bool = False
    RESUME_IMPORT_LOCAL_PREVIEW: bool = False
    NVIDIA_API_KEY: str | None = None
    NVIDIA_MODEL: str = "nvidia/nemotron-3-ultra-550b-a55b"

    # GitHub README sync
    GITHUB_PAT: str | None = None
    GITHUB_USERNAME: str | None = None

    model_config = {
        "env_file": (
            Path(__file__).resolve().parents[3] / ".env",
            Path(__file__).resolve().parents[2] / ".env",
            ".env",
        ),
        "env_file_encoding": "utf-8",
    }


settings = Settings()


def validate_auth_configuration() -> str | None:
    from urllib.parse import urlsplit

    value = settings.NEON_AUTH_BASE_URL
    if not value:
        return None
    try:
        parsed = urlsplit(value)
    except ValueError:
        return "NEON_AUTH_BASE_URL must be an HTTPS managed-auth URL"
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        return "NEON_AUTH_BASE_URL must be an HTTPS managed-auth URL"
    return None


def is_auth_configured() -> bool:
    return bool(settings.NEON_AUTH_BASE_URL and validate_auth_configuration() is None)
