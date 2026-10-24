"""Apply committed migrations using only the API project's pulled production URL."""

import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from sqlalchemy.engine import make_url


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
    values = dotenv_values(api / ".vercel" / ".env.production.local")
    url = make_url(values.get("DATABASE_URL") or "")
    if (
        url.drivername != "postgresql+psycopg"
        or url.database != "onlineportfoliodb"
        or not url.host
        or not url.host.endswith(".neon.tech")
    ):
        raise RuntimeError(
            "Expected the configured production application PostgreSQL database"
        )
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
