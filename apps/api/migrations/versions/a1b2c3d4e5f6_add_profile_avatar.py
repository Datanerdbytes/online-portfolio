"""add profile avatar columns

Revision ID: a1b2c3d4e5f6
Revises: 977ea8ea2a16
Create Date: 2026-10-22 04:20:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "977ea8ea2a16"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("profile", sa.Column("avatar_filename", sa.String(length=255), nullable=True))
    op.add_column("profile", sa.Column("avatar_content_type", sa.String(length=100), nullable=True))
    op.add_column(
        "profile", sa.Column("avatar_updated_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("profile", "avatar_updated_at")
    op.drop_column("profile", "avatar_content_type")
    op.drop_column("profile", "avatar_filename")
