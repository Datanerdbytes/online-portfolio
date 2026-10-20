"""Tests for the sample-project seed command.

Database-free tests (run by default, no PostgreSQL):
- seed refuses without ``--allow-sample-data``

Integration tests (require ``--run-integration`` and ``TEST_DATABASE_ADMIN_URL``):
- insert three samples, repeatability, preservation of existing rows
"""

import pytest

from app.scripts.seed_projects import seed_projects


def test_seed_requires_allow_sample_data():
    with pytest.raises(ValueError, match="--allow-sample-data"):
        seed_projects(None, allow_sample_data=False)


def test_seed_inserts_three_samples(db_session):
    inserted, skipped = seed_projects(db_session, allow_sample_data=True)
    assert inserted == 3
    assert skipped == 0

    from app.models.project import Project

    rows = db_session.query(Project).all()
    assert len(rows) == 3
    for row in rows:
        assert row.title.startswith("Sample:")
        assert row.is_sample is True
        assert row.repository_url is None
        assert row.demo_url is None
        assert isinstance(row.technologies, list)
        assert len(row.technologies) > 0


def test_seed_repeatable_no_duplicates(db_session):
    assert seed_projects(db_session, allow_sample_data=True) == (3, 0)
    assert seed_projects(db_session, allow_sample_data=True) == (0, 3)

    from app.models.project import Project

    assert db_session.query(Project).count() == 3


def test_seed_preserves_existing_rows(db_session):
    from app.models.project import Project

    existing = Project(
        slug="sample-task-board",
        title="Real Task Board",
        summary="A real portfolio project.",
        technologies=["React"],
        repository_url="https://example.com/real",
        demo_url=None,
        display_order=5,
        is_sample=False,
    )
    db_session.add(existing)
    db_session.flush()

    inserted, skipped = seed_projects(db_session, allow_sample_data=True)
    assert inserted == 2
    assert skipped == 1

    row = db_session.query(Project).filter_by(slug="sample-task-board").one()
    assert row.title == "Real Task Board"  # existing row is never modified
    assert row.is_sample is False
    assert row.repository_url == "https://example.com/real"

    assert db_session.query(Project).count() == 3  # 1 existing + 2 new samples
