"""Pytest configuration for the backend test suite.

Default mode (no ``--run-integration``) does not connect to, create, modify, or
drop any PostgreSQL database. Database-free tests run with test doubles.

Integration mode (``--run-integration``) requires ``TEST_DATABASE_ADMIN_URL``
and creates a uniquely named disposable PostgreSQL database for the run. Only
the database created by the current run is dropped at teardown; pre-existing
databases are never reused or removed.
"""

import logging
import os
import uuid

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url

from app.db.tenant import TenantSession
from app.db.tenant import get_content_db as get_db
from app.main import app
from app.models.owner import LEGACY_OWNER_ID


def pytest_addoption(parser):
    parser.addoption(
        "--run-integration",
        action="store_true",
        default=False,
        help="Run integration tests against a disposable PostgreSQL database.",
    )


def _is_integration_requested(config) -> bool:
    return bool(config.getoption("--run-integration"))


def _require_integration(config) -> None:
    """Gate all PostgreSQL access behind both --run-integration and an
    explicit TEST_DATABASE_ADMIN_URL.  Raises UsageError if either is missing.
    """
    if not _is_integration_requested(config):
        raise pytest.UsageError("PostgreSQL access requires --run-integration.")
    admin_url = os.environ.get("TEST_DATABASE_ADMIN_URL")
    if not admin_url:
        raise pytest.UsageError(
            "--run-integration requires TEST_DATABASE_ADMIN_URL to be set to a "
            "PostgreSQL test-server admin connection string.  DATABASE_URL is "
            "intentionally not used as a fallback."
        )
    _parse_admin_url(admin_url)


def _parse_admin_url(admin_url):
    if not admin_url:
        raise pytest.UsageError(
            "--run-integration requires TEST_DATABASE_ADMIN_URL to be set to a "
            "PostgreSQL test-server admin connection string (e.g. "
            "postgresql+psycopg://user:pass@localhost:5432/postgres). "
            "DATABASE_URL is intentionally not used as a fallback."
        )
    try:
        parsed = make_url(admin_url)
    except Exception:  # noqa: BLE001 - never echo credential-bearing input
        raise pytest.UsageError(
            "TEST_DATABASE_ADMIN_URL is not a valid PostgreSQL connection URL."
        ) from None
    if parsed.drivername != "postgresql+psycopg":
        raise pytest.UsageError("TEST_DATABASE_ADMIN_URL must use the postgresql+psycopg driver.")
    return parsed


def _drop_database_with_report(admin_engine, db_name):
    """Terminate connections to and drop ``db_name``.

    Logs cleanup failures without masking the original
    exception and without exposing credentials or complete connection URLs.
    """
    try:
        with admin_engine.connect() as connection:
            connection.execute(
                text(
                    """
                    SELECT pg_terminate_backend(pid)
                    FROM pg_stat_activity
                    WHERE datname = :name AND pid <> pg_backend_pid()
                    """
                ),
                {"name": db_name},
            )
            connection.execute(text(f'DROP DATABASE IF EXISTS "{db_name}"'))
    except Exception as exc:  # noqa: BLE001 - report without replacing the original failure
        logging.getLogger(__name__).warning(
            "Database cleanup failed for owned database %s (%s).", db_name, type(exc).__name__
        )


@pytest.fixture(scope="session")
def integration_db(pytestconfig):
    """Create and teardown a uniquely named disposable test database.

    Only active when ``--run-integration`` is passed. Otherwise yields ``None``
    and performs no database operations.

    All post-creation setup (config, migration, yield) is inside one
    ownership-aware cleanup boundary.  The owned database is dropped on
    configuration failure, migration failure, test failure, and normal
    completion.  It is never dropped when creation failed or ownership was
    not established.  The admin engine is always disposed.
    """
    if not _is_integration_requested(pytestconfig):
        yield None
        return

    _require_integration(pytestconfig)

    admin_url = os.environ.get("TEST_DATABASE_ADMIN_URL")
    parsed_admin = _parse_admin_url(admin_url)
    assert parsed_admin is not None  # narrowed by _parse_admin_url above

    db_name = f"resume_integration_{uuid.uuid4().hex[:16]}"
    parsed_test = parsed_admin.set(database=db_name)
    admin_engine = create_engine(parsed_admin, isolation_level="AUTOCOMMIT")
    db_created = False
    try:
        with admin_engine.connect() as connection:
            exists = connection.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": db_name},
            ).scalar()
            if exists:
                raise RuntimeError(f"Refusing to reuse pre-existing database {db_name!r}.")
            connection.execute(text(f'CREATE DATABASE "{db_name}"'))
            db_created = True

        alembic_cfg = Config("alembic.ini")
        # URL objects preserve encoded credentials and options without ConfigParser.
        alembic_cfg.attributes["sqlalchemy.url"] = parsed_test
        command.upgrade(alembic_cfg, "head")
        yield parsed_test
    finally:
        # One ownership boundary covers configuration, migrations, and test teardown.
        try:
            if db_created:
                _drop_database_with_report(admin_engine, db_name)
        finally:
            admin_engine.dispose()


@pytest.fixture
def db_session(integration_db):
    """Provide a SQLAlchemy session bound to the integration test database.

    Skips the test when integration mode is not active.
    """
    if integration_db is None:
        pytest.skip("requires --run-integration and TEST_DATABASE_ADMIN_URL")

    engine = create_engine(integration_db)
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                with TenantSession(bind=connection, user_id=LEGACY_OWNER_ID) as session:
                    yield session
            finally:
                transaction.rollback()
    finally:
        engine.dispose()


@pytest.fixture
def client(db_session):
    """TestClient overriding ``get_db`` with the integration session."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)
