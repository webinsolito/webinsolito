from __future__ import annotations

from datetime import date, datetime, timezone
from enum import StrEnum
from typing import Any, Literal
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


class PilotClassification(StrEnum):
    PASS_AUTONOMOUS = "PASS_AUTONOMOUS"
    MINOR_EDIT = "MINOR_EDIT"
    MATERIAL_EDIT = "MATERIAL_EDIT"
    WRONG_ROUTE = "WRONG_ROUTE"
    UNSUPPORTED_MISSED = "UNSUPPORTED_MISSED"
    LEGAL_REVIEW_REQUIRED = "LEGAL_REVIEW_REQUIRED"


class ErrorSeverity(StrEnum):
    S0 = "S0"
    S1 = "S1"
    S2 = "S2"
    S3 = "S3"
    S4 = "S4"


class EvidenceRef(BaseModel):
    document_id: str
    filename: str
    document_sha256: str | None = None
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
    content_trust: Literal["UNTRUSTED"] = "UNTRUSTED"
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


class ClientExtractedPage(BaseModel):
    page: int = Field(ge=1, le=100)
    text: str = Field(max_length=120_000)
    method: ExtractionMethod


class ClientExtractedDocument(BaseModel):
    filename: str
    mime_type: str
    text: str = Field(default="", max_length=120_000)
    method: ExtractionMethod
    sha256: str | None = None
    pages: list[ClientExtractedPage] = Field(default_factory=list, max_length=20)


class ClientExtractionRequest(BaseModel):
    documents: list[ClientExtractedDocument] = Field(min_length=1, max_length=8)


class CaseFacts(BaseModel):
    problem: Problem
    consumer: bool | None = None
    professional_seller: bool | None = None
    seller_country: str | None = None
    distance_purchase: bool | None = None
    physical_good: bool | None = None
    order_number: str | None = Field(default=None, max_length=80)
    product_name: str | None = Field(default=None, max_length=180)
    order_date: date | None = None
    delivery_date: date | None = None
    promised_delivery_date: date | None = None
    defect_manifested_date: date | None = None
    withdrawal_notified_at: date | None = None
    returned_or_proof_sent: bool | None = None
    seller_offered_collection: bool = False
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


class PilotConsentRequest(BaseModel):
    notice_version: Literal["pilot-2026-10-v1"] = "pilot-2026-10-v1"


class PilotSubmitResponse(BaseModel):
    review_id: int
    status: Literal["PENDING_REVIEW"] = "PENDING_REVIEW"


class PilotReviewDecisionRequest(BaseModel):
    classification: PilotClassification
    error_severity: ErrorSeverity | None = None
    final_recommendation: Recommendation | None = None
    reviewer_note: str | None = Field(default=None, max_length=2000)


class PilotReviewView(BaseModel):
    id: int
    case_id: UUID
    created_at: datetime
    decided_at: datetime | None = None
    delivered_at: datetime | None = None
    facts: CaseFacts
    original_recommendation: Recommendation
    classification: PilotClassification | None = None
    error_severity: ErrorSeverity | None = None
    final_recommendation: Recommendation | None = None
    reviewer_id: str | None = None
    reviewer_note: str | None = None
    document_metadata: list[DocumentMetadata] = Field(default_factory=list)


class PilotActionResponse(BaseModel):
    status: Literal["PENDING_REVIEW", "APPROVED"]
    recommendation: Recommendation | None = None


class PilotMetrics(BaseModel):
    consented_cases: int
    submitted_reviews: int
    decided_reviews: int
    delivered_actions: int
    classifications: dict[str, int] = Field(default_factory=dict)
    outcomes: dict[str, int] = Field(default_factory=dict)
    material_or_worse_rate: float | None = None
    median_seconds_case_to_action: float | None = None
    s0_s1_errors: int = 0
