"""Initial RISOLVI pilot schema.

Revision ID: 20261013_0001
Revises:
Create Date: 2026-10-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261013_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("jurisdiction", sa.String(length=8), nullable=False),
        sa.Column("capability_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cases_status", "cases", ["status"], unique=False)
    op.create_index("ix_cases_expires_at", "cases", ["expires_at"], unique=False)

    op.create_table(
        "facts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_facts_case_id", "facts", ["case_id"], unique=False)

    op.create_table(
        "documents",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("filename", sa.String(length=180), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=False),
        sa.Column("storage_key", sa.String(length=280), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index("ix_documents_case_id", "documents", ["case_id"], unique=False)
    op.create_index("ix_documents_expires_at", "documents", ["expires_at"], unique=False)

    op.create_table(
        "recommendations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recommendations_case_id", "recommendations", ["case_id"], unique=False)

    op.create_table(
        "actions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("action_type", sa.String(length=40), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_actions_case_id", "actions", ["case_id"], unique=False)

    op.create_table(
        "outcomes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("outcome_type", sa.String(length=60), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_outcomes_case_id", "outcomes", ["case_id"], unique=False)

    op.create_table(
        "pilot_participations",
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("notice_version", sa.String(length=80), nullable=False),
        sa.Column("consented_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("case_id"),
    )

    op.create_table(
        "pilot_reviews",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("original_recommendation", sa.JSON(), nullable=False),
        sa.Column("classification", sa.String(length=40), nullable=True),
        sa.Column("error_severity", sa.String(length=4), nullable=True),
        sa.Column("final_recommendation", sa.JSON(), nullable=True),
        sa.Column("reviewer_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pilot_reviews_case_id", "pilot_reviews", ["case_id"], unique=False)
    op.create_index("ix_pilot_reviews_classification", "pilot_reviews", ["classification"], unique=False)
    op.create_index("ix_pilot_reviews_error_severity", "pilot_reviews", ["error_severity"], unique=False)
    op.create_index("ix_pilot_reviews_created_at", "pilot_reviews", ["created_at"], unique=False)

    op.create_table(
        "rules",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("version", sa.String(length=40), nullable=False),
        sa.Column("jurisdiction", sa.String(length=8), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_status", sa.String(length=32), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "sources",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("authority", sa.String(length=180), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=True),
        sa.Column("event", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_events_case_id", "audit_events", ["case_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_events_case_id", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_table("sources")
    op.drop_table("rules")
    op.drop_index("ix_pilot_reviews_created_at", table_name="pilot_reviews")
    op.drop_index("ix_pilot_reviews_error_severity", table_name="pilot_reviews")
    op.drop_index("ix_pilot_reviews_classification", table_name="pilot_reviews")
    op.drop_index("ix_pilot_reviews_case_id", table_name="pilot_reviews")
    op.drop_table("pilot_reviews")
    op.drop_table("pilot_participations")
    op.drop_index("ix_outcomes_case_id", table_name="outcomes")
    op.drop_table("outcomes")
    op.drop_index("ix_actions_case_id", table_name="actions")
    op.drop_table("actions")
    op.drop_index("ix_recommendations_case_id", table_name="recommendations")
    op.drop_table("recommendations")
    op.drop_index("ix_documents_expires_at", table_name="documents")
    op.drop_index("ix_documents_case_id", table_name="documents")
    op.drop_table("documents")
    op.drop_index("ix_facts_case_id", table_name="facts")
    op.drop_table("facts")
    op.drop_index("ix_cases_expires_at", table_name="cases")
    op.drop_index("ix_cases_status", table_name="cases")
    op.drop_table("cases")
