from fastapi.testclient import TestClient

from app.document_pipeline import build_bundle, parse_client_document, parse_server_document
from app.main import app
from app.models import ClientExtractedDocument, ExtractionMethod


def test_email_extracts_problem_seller_and_delivery_date():
    raw = (
        b"From: support@example.test\n"
        b"Subject: Garanzia ordine 123\n"
        b"Content-Type: text/plain; charset=utf-8\n\n"
        b"Venditore: Negozio X S.r.l.\n"
        b"Prodotto consegnato il 04/09/2026. Non si accende. "
        b"Per assistenza devi contattare il produttore."
    )
    parsed = parse_server_document("risposta.eml", "message/rfc822", raw)
    bundle = build_bundle([parsed])
    assert bundle.prefill["problem"] == "redirect"
    assert bundle.prefill["seller_name"] == "Negozio X S.r.l"
    assert bundle.prefill["delivery_date"] == "2026-09-04"
    assert bundle.prefill["professional_seller"] is True


def test_missing_facts_are_not_invented():
    parsed = parse_server_document("nota.txt", "text/plain", b"Il prodotto non funziona e si spegne subito.")
    bundle = build_bundle([parsed])
    assert bundle.prefill["problem"] == "defect"
    assert "seller_name" not in bundle.prefill
    assert "consumer" not in bundle.prefill
    assert "seller_country" not in bundle.prefill


def test_conflicting_dates_are_marked_and_not_prefilled():
    first = parse_client_document(ClientExtractedDocument(
        filename="ordine.txt",
        mime_type="text/plain",
        method=ExtractionMethod.PLAIN_TEXT,
        text="Data di consegna: 04/09/2026",
    ))
    second = parse_client_document(ClientExtractedDocument(
        filename="mail.txt",
        mime_type="text/plain",
        method=ExtractionMethod.PLAIN_TEXT,
        text="Consegnato il 05/09/2026",
    ))
    bundle = build_bundle([first, second])
    assert "delivery_date" in bundle.conflicts
    assert "delivery_date" not in bundle.prefill
    statuses = {candidate.status.value for candidate in bundle.candidates if candidate.key == "delivery_date"}
    assert statuses == {"CONFLICT"}


def test_client_ocr_endpoint_returns_structured_provenance():
    client = TestClient(app)
    created = client.post("/v1/cases").json()
    case_id = created["case"]["id"]
    token = created["capability_token"]
    response = client.post(
        f"/v1/cases/{case_id}/documents/extract-text",
        headers={"X-Case-Token": token},
        json={
            "documents": [{
                "filename": "screenshot.png",
                "mime_type": "image/png",
                "method": "CLIENT_OCR",
                "text": "Venditore: Shop Demo S.r.l.\nConsegna prevista 20/10/2026\nIl pacco non e' arrivato",
            }]
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["prefill"]["seller_name"] == "Shop Demo S.r.l"
    seller = next(item for item in payload["candidates"] if item["key"] == "seller_name")
    assert seller["evidence"][0]["filename"] == "screenshot.png"
    assert seller["evidence"][0]["method"] == "CLIENT_OCR"
