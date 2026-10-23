"""add project screenshot metadata

Revision ID: 14042dfb6872
Revises: d7f8a9b0c1d2
Create Date: 2026-10-23 12:06:29.635178

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "14042dfb6872"  # pragma: allowlist secret
down_revision: Union[str, None] = "d7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "projects", sa.Column("screenshot_filename", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "projects", sa.Column("screenshot_content_type", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "projects", sa.Column("screenshot_updated_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("projects", "screenshot_updated_at")
    op.drop_column("projects", "screenshot_content_type")
    op.drop_column("projects", "screenshot_filename")
