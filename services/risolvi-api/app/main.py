from __future__ import annotations

import re
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import FastAPI, File, Header, HTTPException, Response, UploadFile
from fastapi.responses import RedirectResponse

from .document_pipeline import (
    DocumentError,
    MAX_FILE_BYTES,
    MAX_FILES,
    build_bundle,
    parse_client_document,
    parse_server_document,
)
from .config import Settings
from .db import Database
from .repository import Repository
from .security import hash_capability, new_capability_token
from .storage import PrivateStorage, build_storage
from .models import (
    Case,
    CaseCreated,
    CaseFacts,
    ClientExtractionRequest,
    DocumentMetadata,
    ExtractionBundle,
    OutcomeRequest,
    Recommendation,
)
from .rule_engine import analyse

CaseToken = Annotated[str | None, Header(alias="X-Case-Token")]


def _safe_filename(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value or "documento")
    return cleaned[:120] or "documento"


def create_app(
    settings: Settings | None = None,
    database: Database | None = None,
    storage: PrivateStorage | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()
    settings.validate()
    settings.ensure_local_dirs()
    database = database or Database(settings.database_url)
    database.create_all()
    storage = storage or build_storage(settings)
    repo = Repository(database, settings.capability_secret)

    app = FastAPI(title="WEBINSOLITO RISOLVI API", version="0.3.0")
    app.state.settings = settings
    app.state.database = database
    app.state.storage = storage
    app.state.repository = repo

    def require_case(case_id: UUID, token: str | None) -> Case:
        case = repo.get_case(case_id, token)
        if case is None:
            raise HTTPException(status_code=404, detail="case_not_found")
        return case

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "risolvi-api", "version": "0.3.0"}

    @app.post("/v1/cases", response_model=CaseCreated)
    def create_case() -> CaseCreated:
        token = new_capability_token()
        case = repo.create_case(
            hash_capability(token, settings.capability_secret),
            settings.case_retention_days,
        )
        return CaseCreated(case=case, capability_token=token)

    @app.get("/v1/cases/{case_id}", response_model=Case)
    def get_case(case_id: UUID, x_case_token: CaseToken = None) -> Case:
        return require_case(case_id, x_case_token)

    @app.put("/v1/cases/{case_id}/facts", response_model=Case)
    def put_facts(case_id: UUID, facts: CaseFacts, x_case_token: CaseToken = None) -> Case:
        require_case(case_id, x_case_token)
        return repo.save_facts(case_id, facts)

    @app.post("/v1/cases/{case_id}/documents/extract", response_model=ExtractionBundle)
    async def extract_documents(
        case_id: UUID,
        files: list[UploadFile] = File(...),
        x_case_token: CaseToken = None,
    ) -> ExtractionBundle:
        require_case(case_id, x_case_token)
        if not files or len(files) > MAX_FILES:
            raise HTTPException(status_code=400, detail="invalid_file_count")
        parsed = []
        for upload in files:
            try:
                data = await upload.read(MAX_FILE_BYTES + 1)
                parsed.append(parse_server_document(upload.filename or "documento", upload.content_type, data))
            except DocumentError as exc:
                raise HTTPException(status_code=422, detail={"filename": upload.filename, "error": str(exc)}) from exc
            finally:
                await upload.close()
        return build_bundle(parsed)

    @app.post("/v1/cases/{case_id}/documents/extract-text", response_model=ExtractionBundle)
    def extract_client_text(
        case_id: UUID,
        request: ClientExtractionRequest,
        x_case_token: CaseToken = None,
    ) -> ExtractionBundle:
        require_case(case_id, x_case_token)
        try:
            parsed = [parse_client_document(document) for document in request.documents]
        except DocumentError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return build_bundle(parsed)

    @app.post("/v1/cases/{case_id}/documents", response_model=DocumentMetadata)
    async def save_document(
        case_id: UUID,
        file: UploadFile = File(...),
        x_case_token: CaseToken = None,
    ) -> DocumentMetadata:
        require_case(case_id, x_case_token)
        data = await file.read(MAX_FILE_BYTES + 1)
        await file.close()
        if not data:
            raise HTTPException(status_code=422, detail="empty_document")
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail="document_too_large")
        mime = (file.content_type or "application/octet-stream").split(";", 1)[0][:120]
        filename = _safe_filename(file.filename or "documento")
        suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        allowed_mimes = {"application/pdf", "message/rfc822", "text/plain", "text/html", "image/png", "image/jpeg", "image/webp", "image/heic"}
        allowed_suffixes = {"pdf", "eml", "txt", "html", "htm", "png", "jpg", "jpeg", "webp", "heic"}
        if mime not in allowed_mimes and suffix not in allowed_suffixes:
            raise HTTPException(status_code=415, detail="unsupported_document_type")
        storage_key = f"cases/{case_id}/{uuid4().hex}"
        storage.put(storage_key, data, mime)
        try:
            return repo.add_document(
                case_id,
                filename,
                mime,
                storage_key,
                data,
                settings.document_retention_hours,
            )
        except Exception:
            storage.delete(storage_key)
            raise

    @app.get("/v1/cases/{case_id}/documents/{document_id}/download")
    def download_document(
        case_id: UUID,
        document_id: str,
        x_case_token: CaseToken = None,
    ) -> Response:
        require_case(case_id, x_case_token)
        document = repo.get_document(case_id, document_id)
        if document is None:
            raise HTTPException(status_code=404, detail="document_not_found")
        signed = storage.signed_get_url(document.storage_key, settings.signed_url_seconds)
        if signed:
            return RedirectResponse(signed, status_code=307)
        try:
            content = storage.get(document.storage_key)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="document_blob_not_found") from exc
        return Response(
            content=content,
            media_type=document.mime_type,
            headers={"Content-Disposition": f'attachment; filename="{_safe_filename(document.filename)}"'},
        )

    @app.post("/v1/cases/{case_id}/analyse", response_model=Recommendation)
    def analyse_case(case_id: UUID, x_case_token: CaseToken = None) -> Recommendation:
        require_case(case_id, x_case_token)
        facts = repo.latest_facts(case_id)
        if facts is None:
            raise HTTPException(status_code=409, detail="facts_not_confirmed")
        recommendation = analyse(facts)
        repo.save_recommendation(case_id, recommendation)
        return recommendation

    @app.post("/v1/cases/{case_id}/outcomes", status_code=204)
    def add_outcome(
        case_id: UUID,
        request: OutcomeRequest,
        x_case_token: CaseToken = None,
    ) -> Response:
        require_case(case_id, x_case_token)
        repo.add_outcome(case_id, request.outcome_type, request.payload)
        return Response(status_code=204)

    @app.get("/v1/cases/{case_id}/export")
    def export_case(case_id: UUID, x_case_token: CaseToken = None) -> dict:
        require_case(case_id, x_case_token)
        return repo.export_case(case_id)

    @app.delete("/v1/cases/{case_id}", status_code=204)
    def delete_case(case_id: UUID, x_case_token: CaseToken = None) -> Response:
        require_case(case_id, x_case_token)
        for document in repo.list_documents(case_id):
            storage.delete(document.storage_key)
        repo.delete_case(case_id)
        return Response(status_code=204)

    return app


app = create_app()
