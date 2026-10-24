"""Operational metadata for bounded imports; no resume text or files.

Revision ID: a52d71ef4309
Revises: 84ac7d2e19f0
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a52d71ef4309"  # pragma: allowlist secret
down_revision = "84ac7d2e19f0"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "resume_import_attempts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "owner_id",
            sa.String(128),
            sa.ForeignKey("portfolio_owners.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_resume_import_attempts_owner_id", "resume_import_attempts", ["owner_id"])
    op.create_index(
        "ix_resume_import_attempts_created_at", "resume_import_attempts", ["created_at"]
    )
    op.create_table(
        "resume_import_receipts",
        sa.Column(
            "owner_id",
            sa.String(128),
            sa.ForeignKey("portfolio_owners.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("key", sa.String(36), primary_key=True),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("counts", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_resume_import_receipts_created_at", "resume_import_receipts", ["created_at"]
    )


def downgrade():
    op.drop_table("resume_import_receipts")
    op.drop_table("resume_import_attempts")
