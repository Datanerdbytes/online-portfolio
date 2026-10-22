"""add skill item idempotency key

Revision ID: d7f8a9b0c1d2
Revises: c5e8f1a9b246
Create Date: 2026-10-22 10:20:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7f8a9b0c1d2"
down_revision: Union[str, None] = "c5e8f1a9b246"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "skill_items",
        sa.Column("idempotency_key", sa.String(length=36), nullable=True),
    )
    op.create_unique_constraint(
        "uq_skill_items_idempotency_key",
        "skill_items",
        ["idempotency_key"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_skill_items_idempotency_key",
        "skill_items",
        type_="unique",
    )
    op.drop_column("skill_items", "idempotency_key")
