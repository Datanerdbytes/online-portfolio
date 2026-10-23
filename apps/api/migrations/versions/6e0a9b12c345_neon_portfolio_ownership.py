"""Neon identity mapping; preserve fresh and previously migrated portfolios."""

import sqlalchemy as sa
from alembic import op

revision = "6e0a9b12c345"  # pragma: allowlist secret
down_revision = "f6a1c2d3e4b5"  # pragma: allowlist secret
branch_labels = None
depends_on = None

TABLES = (
    "profile",
    "contact",
    "skill_groups",
    "skill_items",
    "experience",
    "experience_highlights",
    "education",
    "contact_links",
    "projects",
)
CHILDREN = (
    ("skill_items", "group_id", "skill_groups"),
    ("experience_highlights", "experience_id", "experience"),
    ("contact_links", "contact_id", "contact"),
)
LEGACY = "00000000-0000-0000-0000-000000000001"


def upgrade():
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    op.create_table(
        "portfolio_owners",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("neon_user_id", sa.String(128), unique=True, nullable=True),
    )
    op.bulk_insert(
        sa.table("portfolio_owners", sa.column("id"), sa.column("neon_user_id")),
        [{"id": LEGACY, "neon_user_id": None}],
    )
    # Remove old direct/composite ownership FKs before widening IDs. Preserve all rows.
    for table, _col, parent in CHILDREN:
        for fk in inspector.get_foreign_keys(table):
            if fk["referred_table"] == parent:
                op.drop_constraint(fk["name"], table, type_="foreignkey")
    for table in TABLES:
        columns = {col["name"] for col in inspector.get_columns(table)}
        if "user_id" in columns:
            connection.execute(
                sa.text(
                    f"INSERT INTO portfolio_owners (id) SELECT DISTINCT user_id FROM {table} "
                    "ON CONFLICT (id) DO NOTHING"
                )
            )
            for fk in inspector.get_foreign_keys(table):
                if fk["constrained_columns"] == ["user_id"]:
                    op.drop_constraint(fk["name"], table, type_="foreignkey")
            op.alter_column(table, "user_id", type_=sa.String(128))
        else:
            op.add_column(
                table, sa.Column("user_id", sa.String(128), nullable=False, server_default=LEGACY)
            )
            op.alter_column(table, "user_id", server_default=None)
        op.create_foreign_key(
            f"fk_{table}_user", table, "portfolio_owners", ["user_id"], ["id"], ondelete="CASCADE"
        )
        indexes = {index["name"] for index in inspector.get_indexes(table)}
        if f"ix_{table}_user_id" not in indexes:
            op.create_index(f"ix_{table}_user_id", table, ["user_id"])
        unique = {constraint["name"] for constraint in inspector.get_unique_constraints(table)}
        if table != "projects" and f"uq_{table}_id_user" not in unique:
            op.create_unique_constraint(f"uq_{table}_id_user", table, ["id", "user_id"])
        if table in {"profile", "contact"} and f"uq_{table}_user" not in unique:
            op.create_unique_constraint(f"uq_{table}_user", table, ["user_id"])
        if (
            table in {"projects", "experience", "education"}
            and f"uq_{table}_user_slug" not in unique
        ):
            op.drop_index(f"ix_{table}_slug", table_name=table)
            op.create_index(f"ix_{table}_slug", table, ["slug"])
            op.create_unique_constraint(f"uq_{table}_user_slug", table, ["user_id", "slug"])
    unique = {constraint["name"] for constraint in inspector.get_unique_constraints("skill_items")}
    if "uq_skill_items_idempotency_key" in unique:
        op.drop_constraint("uq_skill_items_idempotency_key", "skill_items", type_="unique")
    if "uq_skill_items_user_idempotency_key" not in unique:
        op.create_unique_constraint(
            "uq_skill_items_user_idempotency_key", "skill_items", ["user_id", "idempotency_key"]
        )
    for table, col, parent in CHILDREN:
        op.create_foreign_key(
            f"fk_{table}_parent_user",
            table,
            parent,
            [col, "user_id"],
            ["id", "user_id"],
            ondelete="CASCADE",
        )
    # Old users/auth_sessions tables, if present, remain untouched for reviewed export.
    # They are not read, written or trusted by the new authentication implementation.


def downgrade():
    raise RuntimeError(
        "Ownership downgrade requires a reviewed export/restore to preserve user data"
    )
