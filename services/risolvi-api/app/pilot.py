from __future__ import annotations

from collections import Counter
from statistics import median
from uuid import UUID

from sqlalchemy import func, select

from .db import (
    CaseRecord,
    Database,
    DocumentRecord,
    FactRecord,
    OutcomeRecord,
    PilotParticipationRecord,
    PilotReviewRecord,
)
from .models import (
    CaseFacts,
    DocumentMetadata,
    ErrorSeverity,
    PilotClassification,
    PilotMetrics,
    PilotReviewDecisionRequest,
    PilotReviewView,
    Recommendation,
)
from .repository import utcnow


class PilotError(RuntimeError):
    pass


def _document_metadata(row: DocumentRecord) -> DocumentMetadata:
    return DocumentMetadata(
        id=row.id,
        filename=row.filename,
        mime_type=row.mime_type,
        sha256=row.sha256,
        size_bytes=row.size_bytes,
        created_at=row.created_at,
        expires_at=row.expires_at,
    )


class PilotService:
    """Human-review gate for the controlled Wizard-of-Oz pilot."""

    def __init__(self, database: Database):
        self.database = database

    def consent(self, case_id: UUID, notice_version: str) -> None:
        now = utcnow()
        with self.database.session() as session:
            if session.get(CaseRecord, str(case_id)) is None:
                raise PilotError("case_not_found")
            row = session.get(PilotParticipationRecord, str(case_id))
            if row is None:
                session.add(PilotParticipationRecord(
                    case_id=str(case_id),
                    notice_version=notice_version,
                    consented_at=now,
                ))
            elif row.notice_version != notice_version:
                row.notice_version = notice_version
                row.consented_at = now

    def has_consent(self, case_id: UUID) -> bool:
        with self.database.session() as session:
            return session.get(PilotParticipationRecord, str(case_id)) is not None

    def submit(self, case_id: UUID, recommendation: Recommendation) -> int:
        if not self.has_consent(case_id):
            raise PilotError("pilot_consent_required")
        now = utcnow()
        with self.database.session() as session:
            pending = session.scalars(
                select(PilotReviewRecord)
                .where(
                    PilotReviewRecord.case_id == str(case_id),
                    PilotReviewRecord.classification.is_(None),
                )
                .order_by(PilotReviewRecord.id.desc())
                .limit(1)
            ).first()
            if pending is not None:
                return pending.id
            row = PilotReviewRecord(
                case_id=str(case_id),
                original_recommendation=recommendation.model_dump(mode="json"),
                classification=None,
                error_severity=None,
                final_recommendation=None,
                reviewer_note=None,
                created_at=now,
                decided_at=None,
                delivered_at=None,
            )
            session.add(row)
            session.flush()
            return row.id

    def _view(self, session, row: PilotReviewRecord) -> PilotReviewView:
        fact = session.scalars(
            select(FactRecord)
            .where(FactRecord.case_id == row.case_id)
            .order_by(FactRecord.id.desc())
            .limit(1)
        ).first()
        if fact is None:
            raise PilotError("facts_not_confirmed")
        documents = list(session.scalars(
            select(DocumentRecord)
            .where(DocumentRecord.case_id == row.case_id)
            .order_by(DocumentRecord.created_at)
        ).all())
        return PilotReviewView(
            id=row.id,
            case_id=UUID(row.case_id),
            created_at=row.created_at,
            decided_at=row.decided_at,
            delivered_at=row.delivered_at,
            facts=CaseFacts.model_validate(fact.payload),
            original_recommendation=Recommendation.model_validate(row.original_recommendation),
            classification=PilotClassification(row.classification) if row.classification else None,
            error_severity=ErrorSeverity(row.error_severity) if row.error_severity else None,
            final_recommendation=(
                Recommendation.model_validate(row.final_recommendation)
                if row.final_recommendation else None
            ),
            reviewer_note=row.reviewer_note,
            document_metadata=[_document_metadata(document) for document in documents],
        )

    def get_review(self, review_id: int) -> PilotReviewView | None:
        with self.database.session() as session:
            row = session.get(PilotReviewRecord, review_id)
            return self._view(session, row) if row else None

    def list_pending(self, limit: int = 50) -> list[PilotReviewView]:
        limit = min(max(limit, 1), 100)
        with self.database.session() as session:
            rows = list(session.scalars(
                select(PilotReviewRecord)
                .where(PilotReviewRecord.classification.is_(None))
                .order_by(PilotReviewRecord.created_at)
                .limit(limit)
            ).all())
            return [self._view(session, row) for row in rows]

    def decide(self, review_id: int, request: PilotReviewDecisionRequest) -> PilotReviewView:
        now = utcnow()
        with self.database.session() as session:
            row = session.get(PilotReviewRecord, review_id)
            if row is None:
                raise PilotError("review_not_found")
            if row.classification is not None:
                raise PilotError("review_already_decided")

            final = request.final_recommendation
            if request.classification == PilotClassification.PASS_AUTONOMOUS:
                final = Recommendation.model_validate(row.original_recommendation)
            elif final is None:
                raise PilotError("final_recommendation_required")

            row.classification = request.classification.value
            row.error_severity = request.error_severity.value if request.error_severity else None
            row.final_recommendation = final.model_dump(mode="json") if final else None
            row.reviewer_note = request.reviewer_note
            row.decided_at = now
            session.flush()
            return self._view(session, row)

    def latest_for_case(self, case_id: UUID) -> PilotReviewView | None:
        with self.database.session() as session:
            row = session.scalars(
                select(PilotReviewRecord)
                .where(PilotReviewRecord.case_id == str(case_id))
                .order_by(PilotReviewRecord.id.desc())
                .limit(1)
            ).first()
            return self._view(session, row) if row else None

    def mark_delivered(self, review_id: int) -> None:
        with self.database.session() as session:
            row = session.get(PilotReviewRecord, review_id)
            if row is None:
                raise PilotError("review_not_found")
            if row.delivered_at is None:
                row.delivered_at = utcnow()

    def metrics(self) -> PilotMetrics:
        with self.database.session() as session:
            consented = session.scalar(select(func.count()).select_from(PilotParticipationRecord)) or 0
            reviews = list(session.scalars(select(PilotReviewRecord).order_by(PilotReviewRecord.id)).all())
            cases = {row.id: row for row in session.scalars(select(CaseRecord)).all()}
            outcomes = list(session.scalars(select(OutcomeRecord)).all())

        decided = [row for row in reviews if row.classification]
        delivered = [row for row in reviews if row.delivered_at]
        classifications = Counter(row.classification for row in decided if row.classification)
        outcome_counts = Counter(row.outcome_type for row in outcomes if row.outcome_type)
        material_classes = {
            PilotClassification.MATERIAL_EDIT.value,
            PilotClassification.WRONG_ROUTE.value,
            PilotClassification.UNSUPPORTED_MISSED.value,
            PilotClassification.LEGAL_REVIEW_REQUIRED.value,
        }
        material = sum(1 for row in decided if row.classification in material_classes)
        material_rate = (material / len(decided)) if decided else None

        latencies: list[float] = []
        for row in delivered:
            case = cases.get(row.case_id)
            if case is not None and row.delivered_at is not None:
                latencies.append(max(0.0, (row.delivered_at - case.created_at).total_seconds()))

        s0_s1 = sum(1 for row in decided if row.error_severity in {"S0", "S1"})
        return PilotMetrics(
            consented_cases=int(consented),
            submitted_reviews=len(reviews),
            decided_reviews=len(decided),
            delivered_actions=len(delivered),
            classifications=dict(classifications),
            outcomes=dict(outcome_counts),
            material_or_worse_rate=material_rate,
            median_seconds_case_to_action=median(latencies) if latencies else None,
            s0_s1_errors=s0_s1,
        )
