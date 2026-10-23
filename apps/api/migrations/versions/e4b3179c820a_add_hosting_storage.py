"""Add persistent image storage and a shared owner login bucket.

Revision ID: e4b3179c820a
Revises: 14042dfb6872
"""

import sqlalchemy as sa
from alembic import op

revision = "e4b3179c820a"  # pragma: allowlist secret
down_revision = "14042dfb6872"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stored_images",
        sa.Column("filename", sa.String(255), primary_key=True),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
    )
    op.create_table(
        "login_buckets",
        sa.Column("scope", sa.String(100), primary_key=True),
        sa.Column("window", sa.BigInteger(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("login_buckets")
    op.drop_table("stored_images")
