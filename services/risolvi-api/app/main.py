from __future__ import annotations

from uuid import UUID

from fastapi import FastAPI, HTTPException

from .models import Case, CaseFacts, Recommendation
from .rule_engine import analyse

app = FastAPI(title="WEBINSOLITO RISOLVI API", version="0.1.0")
_cases: dict[UUID, Case] = {}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "risolvi-api", "version": "0.1.0"}


@app.post("/v1/cases", response_model=Case)
def create_case() -> Case:
    case = Case()
    _cases[case.id] = case
    return case


@app.put("/v1/cases/{case_id}/facts", response_model=Case)
def put_facts(case_id: UUID, facts: CaseFacts) -> Case:
    case = _cases.get(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="case_not_found")
    case.facts = facts
    _cases[case.id] = case
    return case


@app.post("/v1/cases/{case_id}/analyse", response_model=Recommendation)
def analyse_case(case_id: UUID) -> Recommendation:
    case = _cases.get(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="case_not_found")
    if case.facts is None:
        raise HTTPException(status_code=409, detail="facts_not_confirmed")
    recommendation = analyse(case.facts)
    case.status = recommendation.status
    _cases[case.id] = case
    return recommendation
