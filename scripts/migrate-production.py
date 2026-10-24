"""Apply committed migrations using the protected GitHub production secret."""

import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.exc import ArgumentError
from sqlalchemy.engine import make_url


def production_url():
    value = os.environ.get("MIGRATION_DATABASE_URL")
    if not value:
        raise RuntimeError(
            "Set MIGRATION_DATABASE_URL in GitHub production environment secrets"
        )
    try:
        url = make_url(value)
    except ArgumentError:
        raise RuntimeError("MIGRATION_DATABASE_URL must be a PostgreSQL URL") from None
    # Neon issues standard PostgreSQL URLs; migrations use our pinned psycopg driver.
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg")
    if (
        url.drivername != "postgresql+psycopg"
        or url.database != "onlineportfoliodb"
        or not url.host
        or not url.host.endswith(".neon.tech")
    ):
        raise RuntimeError(
            "Expected the configured production application PostgreSQL database"
        )
    return url


def main():
    if (
        os.environ.get("GITHUB_ACTIONS") != "true"
        or os.environ.get("GITHUB_REF") != "refs/heads/main"
    ):
        raise RuntimeError(
            "Production migrations must run through the main GitHub Actions workflow"
        )
    root = Path(__file__).resolve().parents[1]
    api = root / "apps" / "api"
    url = production_url()
    if sys.argv[1:] == ["--check-config"]:
        print("Production migration configuration validated.")
        return
    os.chdir(api)
    config = Config(str(api / "alembic.ini"))
    config.attributes["sqlalchemy.url"] = url
    command.upgrade(config, "head")
    print("Production schema migration completed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Driver exceptions may contain connection strings or credentials.
        print(
            f"Production migration failed ({type(error).__name__}). Check the workflow configuration.",
            file=sys.stderr,
        )
        sys.exit(1)
