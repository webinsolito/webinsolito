from __future__ import annotations

from datetime import date, datetime, timezone
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class CaseStatus(StrEnum):
    DRAFT = "DRAFT"
    NEEDS_INFORMATION = "NEEDS_INFORMATION"
    ACTIONABLE = "ACTIONABLE"
    UNSUPPORTED = "UNSUPPORTED"


class Problem(StrEnum):
    DEFECT = "defect"
    REDIRECT = "redirect"
    NOT_DELIVERED = "not-delivered"
    WITHDRAWAL = "withdrawal"
    REFUND = "refund"
    OTHER = "other"


class FactStatus(StrEnum):
    EXTRACTED = "EXTRACTED"
    USER_ASSERTED = "USER_ASSERTED"
    CONFIRMED = "CONFIRMED"
    CONFLICT = "CONFLICT"


class ExtractionMethod(StrEnum):
    PLAIN_TEXT = "PLAIN_TEXT"
    EMAIL_TEXT = "EMAIL_TEXT"
    PDF_TEXT = "PDF_TEXT"
    CLIENT_OCR = "CLIENT_OCR"
    CLIENT_PDF_TEXT = "CLIENT_PDF_TEXT"
    HEURISTIC = "HEURISTIC"


class EvidenceRef(BaseModel):
    document_id: str
    filename: str
    page: int | None = None
    span: str | None = None
    method: ExtractionMethod


class FactCandidate(BaseModel):
    key: str
    value: Any
    status: FactStatus = FactStatus.EXTRACTED
    confidence: str = "medium"
    evidence: list[EvidenceRef] = Field(default_factory=list)


class DocumentExtraction(BaseModel):
    document_id: str
    filename: str
    mime_type: str
    method: ExtractionMethod
    text_chars: int
    sha256: str | None = None
    warnings: list[str] = Field(default_factory=list)


class DocumentMetadata(BaseModel):
    id: str
    filename: str
    mime_type: str
    sha256: str
    size_bytes: int
    created_at: datetime
    expires_at: datetime


class ExtractionBundle(BaseModel):
    documents: list[DocumentExtraction] = Field(default_factory=list)
    candidates: list[FactCandidate] = Field(default_factory=list)
    prefill: dict[str, Any] = Field(default_factory=dict)
    conflicts: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ClientExtractedDocument(BaseModel):
    filename: str
    mime_type: str
    text: str = Field(max_length=120_000)
    method: ExtractionMethod
    sha256: str | None = None


class ClientExtractionRequest(BaseModel):
    documents: list[ClientExtractedDocument] = Field(min_length=1, max_length=8)


class CaseFacts(BaseModel):
    problem: Problem
    consumer: bool | None = None
    professional_seller: bool | None = None
    seller_country: str | None = None
    distance_purchase: bool | None = None
    physical_good: bool | None = None
    delivery_date: date | None = None
    promised_delivery_date: date | None = None
    seller_name: str | None = None
    customised: bool = False
    perishable: bool = False
    sealed_hygiene_opened: bool = False


class Case(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    status: CaseStatus = CaseStatus.DRAFT
    jurisdiction: str = "IT"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime | None = None
    facts: CaseFacts | None = None


class CaseCreated(BaseModel):
    case: Case
    capability_token: str


class Recommendation(BaseModel):
    status: CaseStatus
    route: str | None = None
    title: str
    explanation: str
    missing_facts: list[str] = Field(default_factory=list)
    rule_ids: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    allowed_claims: list[str] = Field(default_factory=list)
    draft: str | None = None


class OutcomeRequest(BaseModel):
    outcome_type: str = Field(min_length=1, max_length=60)
    payload: dict[str, Any] = Field(default_factory=dict)
