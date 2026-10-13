"""Add reviewer attribution and minimal audit actor metadata.

Revision ID: 20261013_0002
Revises: 20261013_0001
Create Date: 2026-10-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261013_0002"
down_revision: Union[str, None] = "20261013_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pilot_reviews", sa.Column("reviewer_id", sa.String(length=64), nullable=True))
    op.create_index("ix_pilot_reviews_reviewer_id", "pilot_reviews", ["reviewer_id"], unique=False)

    op.add_column("audit_events", sa.Column("actor_type", sa.String(length=32), nullable=True))
    op.add_column("audit_events", sa.Column("actor_id", sa.String(length=64), nullable=True))
    op.add_column("audit_events", sa.Column("payload", sa.JSON(), nullable=True))
    op.execute(sa.text("UPDATE audit_events SET payload = '{}' WHERE payload IS NULL"))
    with op.batch_alter_table("audit_events") as batch_op:
        batch_op.alter_column("payload", existing_type=sa.JSON(), nullable=False)
    op.create_index("ix_audit_events_actor_id", "audit_events", ["actor_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_events_actor_id", table_name="audit_events")
    op.drop_column("audit_events", "payload")
    op.drop_column("audit_events", "actor_id")
    op.drop_column("audit_events", "actor_type")

    op.drop_index("ix_pilot_reviews_reviewer_id", table_name="pilot_reviews")
    op.drop_column("pilot_reviews", "reviewer_id")
