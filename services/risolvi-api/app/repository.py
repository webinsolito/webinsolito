from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from uuid import UUID, uuid4

from sqlalchemy import delete, select

from .db import (
    ActionRecord,
    AuditEventRecord,
    CaseRecord,
    Database,
    DocumentRecord,
    FactRecord,
    OutcomeRecord,
    PilotParticipationRecord,
    PilotReviewRecord,
    RecommendationRecord,
)
from .models import Case, CaseFacts, CaseStatus, DocumentMetadata, Recommendation
from .security import verify_capability


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_case(record: CaseRecord, facts: CaseFacts | None = None) -> Case:
    return Case(
        id=UUID(record.id),
        status=CaseStatus(record.status),
        jurisdiction=record.jurisdiction,
        created_at=record.created_at,
        expires_at=record.expires_at,
        facts=facts,
    )


class Repository:
    def __init__(self, database: Database, capability_secret: str):
        self.database = database
        self.capability_secret = capability_secret

    def create_case(self, capability_hash: str, retention_days: int) -> Case:
        now = utcnow()
        record = CaseRecord(
            id=str(uuid4()),
            status=CaseStatus.DRAFT.value,
            jurisdiction="IT",
            capability_hash=capability_hash,
            created_at=now,
            updated_at=now,
            expires_at=now + timedelta(days=retention_days),
        )
        with self.database.session() as session:
            session.add(record)
            session.add(AuditEventRecord(case_id=record.id, event="case.created", created_at=now))
        return _as_case(record)

    def authorized_record(self, case_id: UUID, token: str | None) -> CaseRecord | None:
        with self.database.session() as session:
            record = session.get(CaseRecord, str(case_id))
            if record is None:
                return None
            if not verify_capability(token, record.capability_hash, self.capability_secret):
                return None
            return record

    def get_case(self, case_id: UUID, token: str | None) -> Case | None:
        record = self.authorized_record(case_id, token)
        if record is None:
            return None
        return _as_case(record, self.latest_facts(case_id))

    def latest_facts(self, case_id: UUID) -> CaseFacts | None:
        with self.database.session() as session:
            row = session.scalars(
                select(FactRecord)
                .where(FactRecord.case_id == str(case_id))
                .order_by(FactRecord.id.desc())
                .limit(1)
            ).first()
            return CaseFacts.model_validate(row.payload) if row else None

    def save_facts(self, case_id: UUID, facts: CaseFacts) -> Case:
        now = utcnow()
        with self.database.session() as session:
            record = session.get(CaseRecord, str(case_id))
            if record is None:
                raise KeyError("case_not_found")
            session.add(FactRecord(
                case_id=record.id,
                status="CONFIRMED",
                payload=facts.model_dump(mode="json"),
                created_at=now,
            ))
            record.updated_at = now
            session.add(AuditEventRecord(case_id=record.id, event="facts.confirmed", created_at=now))
        return _as_case(record, facts)

    def save_recommendation(self, case_id: UUID, recommendation: Recommendation) -> None:
        now = utcnow()
        with self.database.session() as session:
            record = session.get(CaseRecord, str(case_id))
            if record is None:
                raise KeyError("case_not_found")
            record.status = recommendation.status.value
            record.updated_at = now
            session.add(RecommendationRecord(
                case_id=record.id,
                payload=recommendation.model_dump(mode="json"),
                created_at=now,
            ))
            if recommendation.draft:
                session.add(ActionRecord(
                    case_id=record.id,
                    action_type="DRAFT_MESSAGE",
                    payload={"text": recommendation.draft, "route": recommendation.route},
                    created_at=now,
                ))
            session.add(AuditEventRecord(case_id=record.id, event="case.analysed", created_at=now))

    def add_outcome(self, case_id: UUID, outcome_type: str, payload: dict) -> None:
        now = utcnow()
        with self.database.session() as session:
            if session.get(CaseRecord, str(case_id)) is None:
                raise KeyError("case_not_found")
            session.add(OutcomeRecord(
                case_id=str(case_id),
                outcome_type=outcome_type[:60],
                payload=payload,
                created_at=now,
            ))
            session.add(AuditEventRecord(case_id=str(case_id), event="outcome.recorded", created_at=now))

    def add_document(
        self,
        case_id: UUID,
        filename: str,
        mime_type: str,
        storage_key: str,
        data: bytes,
        retention_hours: int,
    ) -> DocumentMetadata:
        now = utcnow()
        doc_id = f"doc_{uuid4().hex}"
        digest = sha256(data).hexdigest()
        record = DocumentRecord(
            id=doc_id,
            case_id=str(case_id),
            filename=filename[:180],
            mime_type=mime_type[:120],
            storage_key=storage_key,
            sha256=digest,
            size_bytes=len(data),
            created_at=now,
            expires_at=now + timedelta(hours=retention_hours),
        )
        with self.database.session() as session:
            if session.get(CaseRecord, str(case_id)) is None:
                raise KeyError("case_not_found")
            session.add(record)
            session.add(AuditEventRecord(case_id=str(case_id), event="document.saved", created_at=now))
        return DocumentMetadata(
            id=record.id,
            filename=record.filename,
            mime_type=record.mime_type,
            sha256=record.sha256,
            size_bytes=record.size_bytes,
            created_at=record.created_at,
            expires_at=record.expires_at,
        )

    def get_document(self, case_id: UUID, document_id: str) -> DocumentRecord | None:
        with self.database.session() as session:
            row = session.get(DocumentRecord, document_id)
            if row is None or row.case_id != str(case_id):
                return None
            return row

    def list_documents(self, case_id: UUID) -> list[DocumentRecord]:
        with self.database.session() as session:
            return list(session.scalars(
                select(DocumentRecord).where(DocumentRecord.case_id == str(case_id))
            ).all())

    def delete_document(self, document_id: str) -> None:
        with self.database.session() as session:
            session.execute(delete(DocumentRecord).where(DocumentRecord.id == document_id))

    def delete_case(self, case_id: UUID) -> None:
        cid = str(case_id)
        with self.database.session() as session:
            # Explicit deletion keeps behavior deterministic even on databases where
            # FK cascade configuration is accidentally weakened.
            for model in (
                PilotReviewRecord,
                PilotParticipationRecord,
                FactRecord,
                DocumentRecord,
                RecommendationRecord,
                ActionRecord,
                OutcomeRecord,
                AuditEventRecord,
            ):
                session.execute(delete(model).where(model.case_id == cid))
            session.execute(delete(CaseRecord).where(CaseRecord.id == cid))

    def expired_documents(self, now: datetime) -> list[DocumentRecord]:
        with self.database.session() as session:
            return list(session.scalars(
                select(DocumentRecord).where(DocumentRecord.expires_at <= now)
            ).all())

    def expired_cases(self, now: datetime) -> list[CaseRecord]:
        with self.database.session() as session:
            return list(session.scalars(
                select(CaseRecord).where(CaseRecord.expires_at <= now)
            ).all())

    def export_case(self, case_id: UUID) -> dict:
        cid = str(case_id)
        with self.database.session() as session:
            case = session.get(CaseRecord, cid)
            if case is None:
                raise KeyError("case_not_found")
            facts = list(session.scalars(select(FactRecord).where(FactRecord.case_id == cid).order_by(FactRecord.id)).all())
            recommendations = list(session.scalars(select(RecommendationRecord).where(RecommendationRecord.case_id == cid).order_by(RecommendationRecord.id)).all())
            actions = list(session.scalars(select(ActionRecord).where(ActionRecord.case_id == cid).order_by(ActionRecord.id)).all())
            outcomes = list(session.scalars(select(OutcomeRecord).where(OutcomeRecord.case_id == cid).order_by(OutcomeRecord.id)).all())
            documents = list(session.scalars(select(DocumentRecord).where(DocumentRecord.case_id == cid).order_by(DocumentRecord.created_at)).all())
            return {
                "schema": 1,
                "case": {
                    "id": case.id,
                    "status": case.status,
                    "jurisdiction": case.jurisdiction,
                    "created_at": case.created_at.isoformat(),
                    "expires_at": case.expires_at.isoformat(),
                },
                "facts": [row.payload for row in facts],
                "recommendations": [row.payload for row in recommendations],
                "actions": [row.payload | {"type": row.action_type} for row in actions],
                "outcomes": [row.payload | {"type": row.outcome_type} for row in outcomes],
                "documents": [
                    {
                        "id": row.id,
                        "filename": row.filename,
                        "mime_type": row.mime_type,
                        "sha256": row.sha256,
                        "size_bytes": row.size_bytes,
                        "created_at": row.created_at.isoformat(),
                        "expires_at": row.expires_at.isoformat(),
                    }
                    for row in documents
                ],
            }
