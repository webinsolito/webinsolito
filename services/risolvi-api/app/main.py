from __future__ import annotations

from uuid import UUID

from fastapi import FastAPI, File, HTTPException, UploadFile

from .document_pipeline import (
    DocumentError,
    MAX_FILES,
    build_bundle,
    parse_client_document,
    parse_server_document,
)
from .models import (
    Case,
    CaseFacts,
    ClientExtractionRequest,
    ExtractionBundle,
    Recommendation,
)
from .rule_engine import analyse

app = FastAPI(title="WEBINSOLITO RISOLVI API", version="0.2.0")
_cases: dict[UUID, Case] = {}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "risolvi-api", "version": "0.2.0"}


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


@app.post("/v1/cases/{case_id}/documents/extract", response_model=ExtractionBundle)
async def extract_documents(case_id: UUID, files: list[UploadFile] = File(...)) -> ExtractionBundle:
    if case_id not in _cases:
        raise HTTPException(status_code=404, detail="case_not_found")
    if not files or len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail="invalid_file_count")

    parsed = []
    for upload in files:
        try:
            data = await upload.read()
            parsed.append(parse_server_document(upload.filename or "documento", upload.content_type, data))
        except DocumentError as exc:
            raise HTTPException(status_code=422, detail={"filename": upload.filename, "error": str(exc)}) from exc
        finally:
            await upload.close()
    return build_bundle(parsed)


@app.post("/v1/cases/{case_id}/documents/extract-text", response_model=ExtractionBundle)
def extract_client_text(case_id: UUID, request: ClientExtractionRequest) -> ExtractionBundle:
    if case_id not in _cases:
        raise HTTPException(status_code=404, detail="case_not_found")
    try:
        parsed = [parse_client_document(document) for document in request.documents]
    except DocumentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return build_bundle(parsed)


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
