"""Add recipient envelopes and public E2EE identities."""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "7a61c2e49d10"
down_revision: str | None = "c8d4e2f1a9b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("e2ee_public_key", sa.Text(), nullable=True))
    op.add_column("direct_messages", sa.Column("is_e2ee", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_table(
        "message_key_envelopes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("direct_messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("envelope", sa.Text(), nullable=False),
        sa.UniqueConstraint("message_id", "user_id", name="uq_message_envelope_user"),
    )
    op.create_index("ix_message_key_envelopes_message_id", "message_key_envelopes", ["message_id"])
    op.create_index("ix_message_key_envelopes_user_id", "message_key_envelopes", ["user_id"])


def downgrade() -> None:
    op.drop_table("message_key_envelopes")
    op.drop_column("direct_messages", "is_e2ee")
    op.drop_column("users", "e2ee_public_key")
