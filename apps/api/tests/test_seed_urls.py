"""Tests for database-target display in the seed command.

These are pure URL-parsing tests using synthetic credentials; no database is
connected and no real credentials are used.
"""

import pytest
from sqlalchemy.engine.url import make_url

from app.scripts.seed_projects import _display_target


def _display(url: str) -> str:
    return _display_target(make_url(url))


def test_standard_username_password_url():
    result = _display("postgresql+psycopg://dbuser:dbpass@localhost:5432/resume")
    assert result == "localhost:5432/resume"


def test_percent_encoded_credentials():
    assert (
        _display("postgresql+psycopg://db%40user:p%40ss@localhost:5432/resume")
        == "localhost:5432/resume"
    )


def test_credentials_in_query_parameters():
    assert (
        _display("postgresql+psycopg://localhost:5432/resume?user=dbuser&password=dbpass")
        == "localhost:5432/resume"
    )


def test_ipv6_host():
    assert _display("postgresql+psycopg://dbuser:dbpass@[::1]:5432/resume") == "::1:5432/resume"


def test_omitted_port():
    assert _display("postgresql+psycopg://dbuser:dbpass@localhost/resume") == "localhost/resume"


def test_no_password():
    assert _display("postgresql+psycopg://dbuser@localhost:5432/resume") == "localhost:5432/resume"


def test_no_credentials_at_all():
    assert _display("postgresql+psycopg://localhost:5432/resume") == "localhost:5432/resume"


def test_special_characters_in_host_and_db():
    result = _display("postgresql+psycopg://dbuser:dbpass@db-host.local:5432/resume_db")
    assert result == "db-host.local:5432/resume_db"


def test_non_postgresql_url_raises():
    with pytest.raises(ValueError, match="(?i)unsupported"):
        _display("sqlite:///./test.db")


def test_display_excludes_credentials_and_query():
    url = "postgresql+psycopg://dbuser:secret%40pass@localhost:5432/resume?sslmode=require&connect_timeout=10"
    result = _display(url)
    assert "dbuser" not in result
    assert "secret" not in result
    assert "sslmode" not in result
    assert "connect_timeout" not in result
    assert "://" not in result
    assert result == "localhost:5432/resume"


def test_query_values_containing_slashes():
    result = _display(
        "postgresql+psycopg://dbuser:dbpass@localhost:5432/resume?options=--search_path/my%2Fschema"
    )
    assert result == "localhost:5432/resume"


def test_connection_options_preserved_through_set_database():
    from sqlalchemy.engine.url import make_url

    parsed = make_url(
        "postgresql+psycopg://dbuser:secret@db-host.example:5432/resume?sslmode=require&connect_timeout=30"
    )
    test_parsed = parsed.set(database="resume_test")
    assert test_parsed.host == "db-host.example"
    assert test_parsed.port == 5432
    assert test_parsed.database == "resume_test"
    assert test_parsed.username == "dbuser"
    assert test_parsed.password == "secret"
    assert test_parsed.query == {"sslmode": "require", "connect_timeout": "30"}


def test_set_database_preserves_query_with_slashes():
    from sqlalchemy.engine.url import make_url

    parsed = make_url(
        "postgresql+psycopg://dbuser:dbpass@localhost:5432/resume?options=--search_path/my%2Fschema"
    )
    test_parsed = parsed.set(database="resume_test")
    assert test_parsed.query == {"options": "--search_path/my/schema"}
