"""add stego_method to settings

Revision ID: d1f3a5b2e8c6
Revises: c8d4e2f1a9b7
Create Date: 2026-07-23 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "d1f3a5b2e8c6"
down_revision = "c8d4e2f1a9b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(
            sa.Column("stego_method", sa.String(length=16), nullable=False, server_default="lsb")
        )


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("stego_method")
