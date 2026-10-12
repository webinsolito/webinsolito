from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
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
    created_at: datetime = Field(default_factory=datetime.utcnow)
    facts: CaseFacts | None = None


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
