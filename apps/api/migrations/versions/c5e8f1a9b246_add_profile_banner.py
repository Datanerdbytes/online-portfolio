"""add profile banner columns

Revision ID: c5e8f1a9b246
Revises: a1b2c3d4e5f6
Create Date: 2026-10-22 09:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5e8f1a9b246"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("profile", sa.Column("banner_filename", sa.String(length=255), nullable=True))
    op.add_column("profile", sa.Column("banner_content_type", sa.String(length=100), nullable=True))
    op.add_column(
        "profile", sa.Column("banner_updated_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("profile", "banner_updated_at")
    op.drop_column("profile", "banner_content_type")
    op.drop_column("profile", "banner_filename")
