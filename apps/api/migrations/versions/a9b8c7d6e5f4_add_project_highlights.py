"""add project highlights

Revision ID: a9b8c7d6e5f4
Revises: b63e52ca7801
Create Date: 2026-11-11 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a9b8c7d6e5f4"  # pragma: allowlist secret
down_revision: Union[str, None] = "b63e52ca7801"  # pragma: allowlist secret
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "highlights",
            postgresql.ARRAY(sa.String(length=500)),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
    )


def downgrade() -> None:
    op.drop_column("projects", "highlights")
