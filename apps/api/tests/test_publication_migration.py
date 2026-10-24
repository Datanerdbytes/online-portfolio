"""Backfill preservation and CI-only production migration safeguards."""

import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, select, text

from app.models.owner import PortfolioOwner, PortfolioPublication
from app.models.resume import Profile, SkillGroup, SkillItem

ROOT = Path(__file__).resolve().parents[3]


def load_module(path):
    spec = importlib.util.spec_from_file_location("migration_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_production_migration_requires_github_main(monkeypatch):
    script = load_module(ROOT / "scripts/migrate-production.py")
    monkeypatch.setenv("GITHUB_ACTIONS", "false")
    with pytest.raises(RuntimeError, match="GitHub Actions"):
        script.main()
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("GITHUB_REF", "refs/heads/feature")
    with pytest.raises(RuntimeError, match="GitHub Actions"):
        script.main()


def test_nonempty_backfill_preserves_source_and_nested_content(integration_db):
    if integration_db is None:
        pytest.skip("requires disposable PostgreSQL integration database")
    engine = create_engine(integration_db)
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                # All DDL is rolled back inside the disposable test DB. Recreate
                # the pre-publication schema to exercise a nonempty backfill.
                connection.execute(text("DROP TABLE portfolio_publications"))
                owner = f"migration-{uuid4()}"
                connection.execute(PortfolioOwner.__table__.insert().values(id=owner))
                connection.execute(
                    Profile.__table__.insert().values(
                        user_id=owner,
                        name="Preserved",
                        headline="Engineer",
                        introduction="Original introduction",
                        about="",
                        avatar_filename="original.webp",
                    )
                )
                group = connection.execute(
                    SkillGroup.__table__.insert()
                    .values(user_id=owner, label="Languages")
                    .returning(SkillGroup.id)
                ).scalar_one()
                connection.execute(
                    SkillItem.__table__.insert().values(
                        user_id=owner, group_id=group, item="Python"
                    )
                )
                migration = load_module(
                    ROOT / "apps/api/migrations/versions/84ac7d2e19f0_portfolio_publications.py"
                )
                with Operations.context(MigrationContext.configure(connection)):
                    migration.upgrade()
                publication = (
                    connection.execute(
                        select(PortfolioPublication.__table__).where(
                            PortfolioPublication.owner_id == owner
                        )
                    )
                    .mappings()
                    .one()
                )
                assert publication["is_published"] is True
                snapshot = publication["snapshot_owner_id"]
                profiles = (
                    connection.execute(
                        select(Profile.__table__).where(Profile.user_id.in_([owner, snapshot]))
                    )
                    .mappings()
                    .all()
                )
                assert len(profiles) == 2
                assert all(row["name"] == "Preserved" for row in profiles)
                assert all(row["avatar_filename"] == "original.webp" for row in profiles)
                copied_group = connection.scalar(
                    select(SkillGroup.id).where(SkillGroup.user_id == snapshot)
                )
                copied_item = (
                    connection.execute(
                        select(SkillItem.__table__).where(SkillItem.user_id == snapshot)
                    )
                    .mappings()
                    .one()
                )
                assert copied_item["group_id"] == copied_group != group
                assert copied_item["item"] == "Python"
            finally:
                transaction.rollback()
    finally:
        engine.dispose()
