import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models import Project  # noqa: E402, F401  (registers model metadata for autogeneration)
from app.models.resume import (  # noqa: E402, F401
    Contact,
    ContactLink,
    Education,
    Experience,
    ExperienceHighlight,
    Profile,
    SkillGroup,
    SkillItem,
)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to):
    """Autogeneration owns application tables, never provider or retired auth data."""
    if type_ == "table" and reflected and compare_to is None:
        return False
    return True


def _get_database_url(config):
    """Resolve the database URL for Alembic.

    Integration tests set ``config.attributes["sqlalchemy.url"]`` to a
    SQLAlchemy URL object for their unique disposable database.  The default
    CLI path uses ``settings.DATABASE_URL``, ignoring the placeholder value
    left in ``alembic.ini``.
    """
    url = config.attributes.get("sqlalchemy.url")
    if url is not None:
        return url
    return settings.DATABASE_URL


def run_migrations_offline() -> None:
    url = _get_database_url(config)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        include_object=include_object,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = _get_database_url(config)
    connectable = create_engine(url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
