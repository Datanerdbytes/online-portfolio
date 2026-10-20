"""Exercise the real database fixture, including failure and teardown paths."""

import logging
import os
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


@pytest.fixture
def lifecycle_module(pytestconfig):
    """Use pytest's loaded conftest so patches affect the real fixture globals."""
    path = Path(__file__).with_name("conftest.py").resolve()
    return next(
        plugin
        for plugin in pytestconfig.pluginmanager.get_plugins()
        if getattr(plugin, "__file__", None) and Path(plugin.__file__).resolve() == path
    )


@pytest.fixture
def lifecycle(lifecycle_module, monkeypatch):
    module = lifecycle_module
    admin = MagicMock()
    connection = admin.connect.return_value.__enter__.return_value
    connection.execute.return_value.scalar.return_value = False
    migrate = MagicMock()
    monkeypatch.setenv(
        "TEST_DATABASE_ADMIN_URL",
        "postgresql+psycopg://review:p%40ss@127.0.0.1:1/postgres"
        "?sslmode=require&connect_timeout=3&application_name=review/path",
    )
    monkeypatch.setattr(module, "create_engine", MagicMock(return_value=admin))
    monkeypatch.setattr(module.command, "upgrade", migrate)
    config = SimpleNamespace(getoption=lambda _: True)
    return SimpleNamespace(
        module=module,
        admin=admin,
        connection=connection,
        migrate=migrate,
        start=lambda: module.integration_db.__wrapped__(config),
    )


def statements(lifecycle):
    return [str(call.args[0]) for call in lifecycle.connection.execute.call_args_list]


@pytest.mark.parametrize("stage", ["configuration", "attributes", "migration"])
def test_post_creation_setup_failure_drops_owned_database(lifecycle, monkeypatch, stage):
    original = RuntimeError(f"original {stage} failure")
    if stage == "configuration":
        monkeypatch.setattr(lifecycle.module, "Config", MagicMock(side_effect=original))
    elif stage == "attributes":
        attributes = MagicMock()
        attributes.__setitem__.side_effect = original
        monkeypatch.setattr(
            lifecycle.module, "Config", lambda _: SimpleNamespace(attributes=attributes)
        )
    else:
        lifecycle.migrate.side_effect = original
    with pytest.raises(RuntimeError) as caught:
        next(lifecycle.start())
    assert caught.value is original
    assert sum(sql.startswith("CREATE DATABASE") for sql in statements(lifecycle)) == 1
    assert sum(sql.startswith("DROP DATABASE") for sql in statements(lifecycle)) == 1
    lifecycle.admin.dispose.assert_called_once()


@pytest.mark.parametrize("collision", [True, False])
def test_creation_failure_never_terminates_or_drops_unowned_database(lifecycle, collision):
    if collision:
        lifecycle.connection.execute.return_value.scalar.return_value = True
    else:
        result = MagicMock()
        result.scalar.return_value = False
        lifecycle.connection.execute.side_effect = [result, RuntimeError("create failed")]
    with pytest.raises(RuntimeError):
        next(lifecycle.start())
    sql = statements(lifecycle)
    assert not any(statement.startswith("DROP DATABASE") for statement in sql)
    assert not any("pg_terminate_backend" in statement for statement in sql)
    lifecycle.admin.dispose.assert_called_once()


@pytest.mark.parametrize("test_fails", [False, True])
def test_actual_fixture_teardown_drops_owned_database(lifecycle, test_fails):
    generator = lifecycle.start()
    url = next(generator)
    admin_url = make_url(os.environ["TEST_DATABASE_ADMIN_URL"])
    assert url.database.startswith("resume_integration_")
    assert url.set(database=admin_url.database) == admin_url
    assert lifecycle.migrate.call_args.args[0].attributes["sqlalchemy.url"] == url
    if test_fails:
        original = RuntimeError("test failed")
        with pytest.raises(RuntimeError) as caught:
            generator.throw(original)
        assert caught.value is original
    else:
        generator.close()
    assert sum(sql.startswith("DROP DATABASE") for sql in statements(lifecycle)) == 1
    lifecycle.admin.dispose.assert_called_once()


@pytest.mark.parametrize("original_failure", [False, True])
def test_cleanup_failure_reports_without_secrets_or_masking(
    lifecycle, monkeypatch, caplog, original_failure
):
    def execute(statement, *args, **kwargs):
        if str(statement).startswith("DROP DATABASE"):
            raise RuntimeError("postgresql://review:DO_NOT_LOG_THIS@server/db")
        result = MagicMock()
        result.scalar.return_value = False
        return result

    lifecycle.connection.execute.side_effect = execute
    original = RuntimeError("original setup failure")
    if original_failure:
        monkeypatch.setattr(lifecycle.module, "Config", MagicMock(side_effect=original))
    with caplog.at_level(logging.WARNING):
        generator = lifecycle.start()
        if original_failure:
            with pytest.raises(RuntimeError) as caught:
                next(generator)
            assert caught.value is original
        else:
            next(generator)
            generator.close()
    assert "cleanup" in caplog.text.lower()
    assert "resume_integration_" in caplog.text
    assert "DO_NOT_LOG_THIS" not in caplog.text
    assert "postgresql://" not in caplog.text
    lifecycle.admin.dispose.assert_called_once()


@pytest.mark.parametrize("configured", [False, True])
def test_default_fixture_never_creates_engine(lifecycle_module, monkeypatch, configured):
    if configured:
        monkeypatch.setenv(
            "TEST_DATABASE_ADMIN_URL", "postgresql+psycopg://review:synthetic@127.0.0.1:1/postgres"
        )
    else:
        monkeypatch.delenv("TEST_DATABASE_ADMIN_URL", raising=False)
    blocked = MagicMock(side_effect=AssertionError("Database access without opt-in"))
    monkeypatch.setattr(lifecycle_module, "create_engine", blocked)
    generator = lifecycle_module.integration_db.__wrapped__(
        SimpleNamespace(getoption=lambda _: False)
    )
    assert next(generator) is None
    generator.close()
    blocked.assert_not_called()


@pytest.mark.parametrize(
    "admin_url",
    [None, "invalid", "sqlite:///test.db", "postgresql://review:synthetic@localhost/postgres"],
)
def test_explicit_integration_requires_valid_configuration(
    lifecycle_module, monkeypatch, admin_url
):
    if admin_url is None:
        monkeypatch.delenv("TEST_DATABASE_ADMIN_URL", raising=False)
    else:
        monkeypatch.setenv("TEST_DATABASE_ADMIN_URL", admin_url)
    blocked = MagicMock(side_effect=AssertionError("Invalid configuration accessed a database"))
    monkeypatch.setattr(lifecycle_module, "create_engine", blocked)
    with pytest.raises(pytest.UsageError):
        next(lifecycle_module.integration_db.__wrapped__(SimpleNamespace(getoption=lambda _: True)))
    blocked.assert_not_called()


def test_real_fixture_teardown_preserves_existing_sentinel(pytestconfig, lifecycle_module):
    if not pytestconfig.getoption("--run-integration"):
        pytest.skip("requires --run-integration and TEST_DATABASE_ADMIN_URL")
    lifecycle_module._require_integration(pytestconfig)
    admin_url = make_url(os.environ["TEST_DATABASE_ADMIN_URL"])
    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    sentinel_name = f"resume_review_sentinel_{uuid.uuid4().hex[:16]}"
    sentinel_created = False
    sentinel = None
    try:
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{sentinel_name}"'))
            sentinel_created = True
        sentinel = create_engine(admin_url.set(database=sentinel_name))
        with sentinel.begin() as connection:
            connection.execute(text("CREATE TABLE sentinel (id integer PRIMARY KEY)"))
            connection.execute(text("INSERT INTO sentinel VALUES (42)"))

        generator = lifecycle_module.integration_db.__wrapped__(pytestconfig)
        try:
            test_url = next(generator)
            test_engine = create_engine(test_url)
            try:
                with test_engine.connect() as connection:
                    assert connection.execute(text("SELECT current_database()")).scalar_one() == (
                        test_url.database
                    )
            finally:
                test_engine.dispose()
        finally:
            generator.close()

        # The fixture has actually torn down before either assertion is made.
        with admin.connect() as connection:
            assert not connection.execute(
                text("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = :name)"),
                {"name": test_url.database},
            ).scalar_one()
        with sentinel.connect() as connection:
            assert connection.execute(text("SELECT id FROM sentinel")).scalar_one() == 42
    finally:
        if sentinel is not None:
            sentinel.dispose()
        try:
            if sentinel_created:
                lifecycle_module._drop_database_with_report(admin, sentinel_name)
        finally:
            admin.dispose()
