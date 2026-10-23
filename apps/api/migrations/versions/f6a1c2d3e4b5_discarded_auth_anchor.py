"""Compatibility anchor for databases that ran the discarded auth implementation.

Fresh databases perform no SQL here. The next revision inspects and adopts any
existing ownership columns without dropping content or previous account records.
"""

revision = "f6a1c2d3e4b5"  # pragma: allowlist secret
down_revision = "e4b3179c820a"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
