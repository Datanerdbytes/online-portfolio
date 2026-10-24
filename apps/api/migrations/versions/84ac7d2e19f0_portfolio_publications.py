"""Private drafts and preserved published copies for existing portfolios."""

from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision = "84ac7d2e19f0"  # pragma: allowlist secret (Alembic revision ID)
down_revision = "6e0a9b12c345"  # pragma: allowlist secret (Alembic revision ID)
branch_labels = None
depends_on = None

TABLES = (
    "profile",
    "contact",
    "skill_groups",
    "experience",
    "education",
    "projects",
    "skill_items",
    "experience_highlights",
    "contact_links",
)
PARENTS = {
    "skill_items": ("group_id", "skill_groups"),
    "experience_highlights": ("experience_id", "experience"),
    "contact_links": ("contact_id", "contact"),
}


def upgrade():
    op.create_table(
        "portfolio_publications",
        sa.Column(
            "owner_id",
            sa.String(128),
            sa.ForeignKey("portfolio_owners.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "snapshot_owner_id",
            sa.String(128),
            sa.ForeignKey("portfolio_owners.id"),
            unique=True,
            nullable=True,
        ),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("draft_revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("published_revision", sa.Integer(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    connection = op.get_bind()
    # Capture a consistent published version while the old application may
    # still be running. Readers continue; content writers wait for this commit.
    connection.execute(
        sa.text("LOCK TABLE portfolio_owners, " + ", ".join(TABLES) + " IN SHARE MODE")
    )
    metadata = sa.MetaData()
    owners = sa.Table("portfolio_owners", metadata, autoload_with=connection)
    publication = sa.Table("portfolio_publications", metadata, autoload_with=connection)
    tables = [sa.Table(name, metadata, autoload_with=connection) for name in TABLES]
    # Snapshot the owner list before adding internal snapshot owners. Existing
    # public content remains published; accounts created later default to private.
    for owner_id in connection.scalars(sa.select(owners.c.id)).all():
        snapshot_id = f"snapshot-{uuid4()}"
        connection.execute(owners.insert().values(id=snapshot_id))
        ids = {}
        for table in tables:
            ids[table.name] = {}
            rows = (
                connection.execute(
                    sa.select(table).where(table.c.user_id == owner_id).order_by(table.c.id)
                )
                .mappings()
                .all()
            )
            for row in rows:
                values = {key: value for key, value in row.items() if key != "id"}
                values["user_id"] = snapshot_id
                if table.name in PARENTS:
                    key, parent = PARENTS[table.name]
                    values[key] = ids[parent][row[key]]
                new_id = connection.execute(
                    table.insert().values(**values).returning(table.c.id)
                ).scalar_one()
                ids[table.name][row["id"]] = new_id
        connection.execute(
            publication.insert().values(
                owner_id=owner_id,
                snapshot_owner_id=snapshot_id,
                is_published=True,
                draft_revision=0,
                published_revision=0,
                published_at=sa.func.now(),
            )
        )


def downgrade():
    raise RuntimeError("Publication downgrade requires reviewed export to preserve private drafts")
