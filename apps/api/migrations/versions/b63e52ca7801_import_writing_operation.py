"""Separate AI-writing quotas from document-analysis quotas.

Revision ID: b63e52ca7801
Revises: a52d71ef4309
"""

import sqlalchemy as sa
from alembic import op

revision = "b63e52ca7801"  # pragma: allowlist secret
down_revision = "a52d71ef4309"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "resume_import_attempts",
        sa.Column("operation", sa.String(16), nullable=False, server_default="analyze"),
    )


def downgrade():
    op.drop_column("resume_import_attempts", "operation")
