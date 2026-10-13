from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass, field
from datetime import date
from email import policy
from email.parser import BytesParser
from html.parser import HTMLParser
from typing import Iterable
from uuid import uuid4

from pypdf import PdfReader

from .models import (
    ClientExtractedDocument,
    DocumentExtraction,
    EvidenceRef,
    ExtractionBundle,
    ExtractionMethod,
    FactCandidate,
    FactStatus,
)

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_FILES = 8
MAX_TEXT_CHARS = 120_000
ALLOWED_CLIENT_METHODS = {
    ExtractionMethod.CLIENT_OCR,
    ExtractionMethod.CLIENT_PDF_TEXT,
    ExtractionMethod.PLAIN_TEXT,
    ExtractionMethod.EMAIL_TEXT,
}
CRITICAL_FACT_KEYS = (
    "problem",
    "seller_name",
    "order_date",
    "order_reference",
    "product_name",
    "delivery_date",
    "promised_delivery_date",
    "consumer",
    "professional_seller",
    "seller_country",
    "distance_purchase",
    "physical_good",
)
PROMPT_INJECTION_MARKERS = (
    "ignore previous instructions",
    "ignore all previous instructions",
    "ignora le istruzioni precedenti",
    "ignora tutte le istruzioni precedenti",
    "system prompt",
    "developer message",
    "you are chatgpt",
    "sei chatgpt",
)


class DocumentError(ValueError):
    pass


class _TextOnlyHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.parts.append(data.strip())

    def text(self) -> str:
        return "\n".join(self.parts)


@dataclass(slots=True)
class ParsedDocument:
    document_id: str
    filename: str
    mime_type: str
    method: ExtractionMethod
    pages: list[str]
    sha256: str | None = None
    warnings: list[str] = field(default_factory=list)
    page_methods: list[ExtractionMethod] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n\n".join(self.pages)[:MAX_TEXT_CHARS]

    def method_for_page(self, page_no: int) -> ExtractionMethod:
        index = page_no - 1
        if 0 <= index < len(self.page_methods):
            return self.page_methods[index]
        return self.method


_MONTHS = {
    "gennaio": 1,
    "febbraio": 2,
    "marzo": 3,
    "aprile": 4,
    "maggio": 5,
    "giugno": 6,
    "luglio": 7,
    "agosto": 8,
    "settembre": 9,
    "ottobre": 10,
    "novembre": 11,
    "dicembre": 12,
}
_DATE_TOKEN = r"(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})"
_ORDER_REFERENCE_PATTERN = re.compile(
    r"(?:numero\s+(?:ordine|order)|(?:ordine|order)\s*(?:n\.?|numero|#|id|codice))\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,40})",
    flags=re.IGNORECASE,
)
_PRODUCT_PATTERN = re.compile(
    r"(?:prodotto|articolo|product|item)\s*[:\-]\s*([^\n\r]{2,120})",
    flags=re.IGNORECASE,
)


def _decode_text(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise DocumentError("text_decode_failed")


def _html_to_text(raw: str) -> str:
    parser = _TextOnlyHTMLParser()
    parser.feed(raw)
    return parser.text()


def _parse_email(data: bytes) -> str:
    msg = BytesParser(policy=policy.default).parsebytes(data)
    chunks: list[str] = []
    for key in ("From", "To", "Date", "Subject"):
        value = msg.get(key)
        if value:
            chunks.append(f"{key}: {value}")
    parts = msg.walk() if msg.is_multipart() else [msg]
    for part in parts:
        if part.get_content_maintype() == "multipart":
            continue
        ctype = part.get_content_type()
        if ctype not in {"text/plain", "text/html"}:
            continue
        try:
            body = part.get_content()
        except Exception:
            payload = part.get_payload(decode=True) or b""
            body = _decode_text(payload)
        if ctype == "text/html":
            body = _html_to_text(str(body))
        chunks.append(str(body))
    return "\n\n".join(chunks)


def _parse_pdf(data: bytes) -> tuple[list[str], list[str]]:
    warnings: list[str] = []
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
    except Exception as exc:
        raise DocumentError("pdf_parse_failed") from exc
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception as exc:
            raise DocumentError("pdf_encrypted") from exc
    pages: list[str] = []
    for page in reader.pages[:12]:
        try:
            pages.append((page.extract_text() or "").strip())
        except Exception:
            pages.append("")
            warnings.append("pdf_page_text_failed")
    if len(reader.pages) > 12:
        warnings.append("pdf_truncated_to_12_pages")
    if sum(len(page) for page in pages) < 20:
        warnings.append("pdf_has_little_text_client_ocr_recommended")
    return pages or [""], warnings


def parse_server_document(filename: str, mime_type: str | None, data: bytes) -> ParsedDocument:
    if not data:
        raise DocumentError("empty_document")
    if len(data) > MAX_FILE_BYTES:
        raise DocumentError("document_too_large")

    filename = (filename or "documento").strip()[:180]
    mime = (mime_type or "application/octet-stream").lower().split(";", 1)[0]
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    digest = hashlib.sha256(data).hexdigest()
    document_id = f"doc_{uuid4().hex[:12]}"

    if mime == "application/pdf" or suffix == "pdf":
        pages, warnings = _parse_pdf(data)
        return ParsedDocument(document_id, filename, "application/pdf", ExtractionMethod.PDF_TEXT, pages, digest, warnings)

    if mime == "message/rfc822" or suffix == "eml":
        text = _parse_email(data)
        return ParsedDocument(document_id, filename, "message/rfc822", ExtractionMethod.EMAIL_TEXT, [text], digest)

    if mime in {"text/plain", "text/html"} or suffix in {"txt", "html", "htm"}:
        raw = _decode_text(data)
        text = _html_to_text(raw) if mime == "text/html" or suffix in {"html", "htm"} else raw
        return ParsedDocument(document_id, filename, mime if mime.startswith("text/") else "text/plain", ExtractionMethod.PLAIN_TEXT, [text], digest)

    if mime.startswith("image/") or suffix in {"png", "jpg", "jpeg", "webp", "heic"}:
        raise DocumentError("image_requires_client_ocr")

    raise DocumentError("unsupported_document_type")


def parse_client_document(document: ClientExtractedDocument) -> ParsedDocument:
    if document.method not in ALLOWED_CLIENT_METHODS:
        raise DocumentError("client_extraction_method_not_allowed")

    if document.pages:
        ordered = sorted(document.pages, key=lambda item: item.page)
        page_numbers = [item.page for item in ordered]
        if page_numbers != list(range(1, len(ordered) + 1)):
            raise DocumentError("client_pages_must_be_contiguous_from_one")
        if any(item.method not in ALLOWED_CLIENT_METHODS for item in ordered):
            raise DocumentError("client_page_method_not_allowed")
        pages = [item.text.strip() for item in ordered]
        if not any(pages):
            raise DocumentError("client_extraction_empty")
        if sum(len(page) for page in pages) > MAX_TEXT_CHARS:
            raise DocumentError("client_extraction_too_large")
        page_methods = [item.method for item in ordered]
    else:
        text = document.text.strip()
        if not text:
            raise DocumentError("client_extraction_empty")
        pages = [text[:MAX_TEXT_CHARS]]
        page_methods = [document.method]

    return ParsedDocument(
        document_id=f"doc_{uuid4().hex[:12]}",
        filename=document.filename[:180],
        mime_type=document.mime_type[:120],
        method=document.method,
        pages=pages,
        sha256=document.sha256,
        page_methods=page_methods,
    )


def _parse_date_token(token: str) -> date | None:
    token = re.sub(r"\s+", " ", token.strip().lower())
    numeric = re.fullmatch(r"(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})", token)
    if numeric:
        day, month, year = map(int, numeric.groups())
        if year < 100:
            year += 2000
        try:
            return date(year, month, day)
        except ValueError:
            return None
    textual = re.fullmatch(r"(\d{1,2})\s+([a-zà]+)\s+(\d{4})", token)
    if textual:
        day = int(textual.group(1))
        month = _MONTHS.get(textual.group(2))
        if month is None:
            return None
        try:
            return date(int(textual.group(3)), month, day)
        except ValueError:
            return None
    return None


def _snippet(text: str, start: int, end: int, radius: int = 70) -> str:
    left = max(0, start - radius)
    right = min(len(text), end + radius)
    return re.sub(r"\s+", " ", text[left:right]).strip()[:240]


def _candidate(
    doc: ParsedDocument,
    page_no: int,
    key: str,
    value: object,
    confidence: str,
    text: str,
    match: re.Match[str] | None = None,
) -> FactCandidate:
    span = _snippet(text, match.start(), match.end()) if match else text[:220]
    return FactCandidate(
        key=key,
        value=value,
        confidence=confidence,
        evidence=[
            EvidenceRef(
                document_id=doc.document_id,
                filename=doc.filename,
                page=page_no,
                span=span,
                method=doc.method_for_page(page_no),
            )
        ],
    )


def _clean_label_value(value: str, limit: int = 120) -> str:
    return re.sub(r"\s+", " ", value).strip(" \t,;.")[:limit]


def _extract_page_candidates(doc: ParsedDocument, page_no: int, text: str) -> list[FactCandidate]:
    out: list[FactCandidate] = []
    lower = text.lower()

    problem_patterns: list[tuple[str, tuple[str, ...], str]] = [
        ("redirect", ("contatta il produttore", "contattare il produttore", "rivolgersi al produttore", "assistenza del produttore"), "high"),
        ("not-delivered", ("non consegnato", "mancata consegna", "mai consegnato", "ordine non arrivato", "pacco non arrivato"), "high"),
        ("withdrawal", ("diritto di recesso", "voglio recedere", "comunico il recesso", "esercitare il recesso"), "high"),
        ("refund", ("rimborso negato", "rimborso non ricevuto", "mancato rimborso"), "high"),
        ("defect", ("difettoso", "non funziona", "non si accende", "guasto", "non conforme"), "medium"),
    ]
    for value, patterns, confidence in problem_patterns:
        found = next((pattern for pattern in patterns if pattern in lower), None)
        if found:
            match = re.search(re.escape(found), text, flags=re.IGNORECASE)
            out.append(_candidate(doc, page_no, "problem", value, confidence, text, match))
            break

    seller_match = re.search(r"(?:venditore|seller|merchant|venduto\s+da|ragione\s+sociale)\s*[:\-]\s*([^\n\r]{2,100})", text, flags=re.IGNORECASE)
    if seller_match:
        seller = _clean_label_value(seller_match.group(1), 100)
        out.append(_candidate(doc, page_no, "seller_name", seller, "high", text, seller_match))

    order_reference_match = _ORDER_REFERENCE_PATTERN.search(text)
    if order_reference_match:
        reference = _clean_label_value(order_reference_match.group(1), 40)
        out.append(_candidate(doc, page_no, "order_reference", reference, "high", text, order_reference_match))

    product_match = _PRODUCT_PATTERN.search(text)
    if product_match:
        product = _clean_label_value(product_match.group(1), 120)
        out.append(_candidate(doc, page_no, "product_name", product, "high", text, product_match))

    order_match = re.search(rf"(?:data\s+(?:ordine|acquisto)|ordinato\s+il|acquistato\s+il)\s*[:\-]?\s*({_DATE_TOKEN})", text, flags=re.IGNORECASE)
    if order_match:
        parsed = _parse_date_token(order_match.group(1))
        if parsed:
            out.append(_candidate(doc, page_no, "order_date", parsed.isoformat(), "high", text, order_match))

    delivery_match = re.search(rf"(?:consegnat[oa]|data\s+di\s+consegna)\s*(?:il|:)?\s*({_DATE_TOKEN})", text, flags=re.IGNORECASE)
    if delivery_match:
        parsed = _parse_date_token(delivery_match.group(1))
        if parsed:
            out.append(_candidate(doc, page_no, "delivery_date", parsed.isoformat(), "high", text, delivery_match))

    promised_match = re.search(rf"(?:consegna\s+(?:prevista|stimata)|da\s+consegnare\s+entro|consegna\s+entro)\s*(?:il|:)?\s*({_DATE_TOKEN})", text, flags=re.IGNORECASE)
    if promised_match:
        parsed = _parse_date_token(promised_match.group(1))
        if parsed:
            out.append(_candidate(doc, page_no, "promised_delivery_date", parsed.isoformat(), "high", text, promised_match))

    if re.search(r"\b(acquisto\s+online|ordine\s+(?:n\.?|numero|#)|e-?commerce|spedizione)\b", lower):
        out.append(_candidate(doc, page_no, "distance_purchase", True, "medium", text))

    if re.search(r"\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|partita\s+iva|p\.?iva)\b", lower):
        out.append(_candidate(doc, page_no, "professional_seller", True, "medium", text))

    if re.search(r"\b(prodotto|articolo|bene|spedizione|pacco|consegna)\b", lower):
        out.append(_candidate(doc, page_no, "physical_good", True, "medium", text))

    if re.search(r"\b(personalizzat[oa]|su\s+misura|incis[oa])\b", lower):
        out.append(_candidate(doc, page_no, "customised", True, "high", text))
    if re.search(r"\b(deperibile|scadenza\s+breve|deteriorarsi\s+rapidamente)\b", lower):
        out.append(_candidate(doc, page_no, "perishable", True, "high", text))
    if re.search(r"\b(sigillat[oa].{0,35}(igiene|igienic|salute).{0,45}(apert[oa]|rimosso|rotto))\b", lower):
        out.append(_candidate(doc, page_no, "sealed_hygiene_opened", True, "high", text))

    return out


def extract_candidates(doc: ParsedDocument) -> list[FactCandidate]:
    candidates: list[FactCandidate] = []
    for page_no, page in enumerate(doc.pages, start=1):
        if page.strip():
            candidates.extend(_extract_page_candidates(doc, page_no, page[:MAX_TEXT_CHARS]))
    return candidates


def _normalise_value(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).strip().casefold()


def _contains_instruction_like_text(text: str) -> bool:
    lower = text.casefold()
    return any(marker in lower for marker in PROMPT_INJECTION_MARKERS)


def build_bundle(documents: Iterable[ParsedDocument]) -> ExtractionBundle:
    docs = list(documents)
    candidates: list[FactCandidate] = []
    warnings: list[str] = []
    extracted_docs: list[DocumentExtraction] = []

    for doc in docs:
        candidates.extend(extract_candidates(doc))
        warnings.extend(doc.warnings)
        if _contains_instruction_like_text(doc.text):
            warnings.append("instruction_like_document_text_ignored_as_instructions")
        extracted_docs.append(
            DocumentExtraction(
                document_id=doc.document_id,
                filename=doc.filename,
                mime_type=doc.mime_type,
                method=doc.method,
                text_chars=len(doc.text),
                sha256=doc.sha256,
                warnings=doc.warnings,
            )
        )

    by_key: dict[str, list[FactCandidate]] = {}
    for candidate in candidates:
        by_key.setdefault(candidate.key, []).append(candidate)

    conflicts: list[str] = []
    prefill: dict[str, object] = {}
    confidence_rank = {"high": 2, "medium": 1, "low": 0}

    for key, values in by_key.items():
        distinct = {_normalise_value(item.value) for item in values}
        if len(distinct) > 1:
            conflicts.append(key)
            for item in values:
                item.status = FactStatus.CONFLICT
            continue
        best = max(values, key=lambda item: confidence_rank.get(item.confidence, 0))
        if best.confidence in {"high", "medium"}:
            prefill[key] = best.value

    if conflicts:
        warnings.append("conflicting_facts_require_user_confirmation")

    structured_facts: dict[str, object | None] = {
        key: prefill.get(key) if key not in conflicts else None for key in CRITICAL_FACT_KEYS
    }

    return ExtractionBundle(
        documents=extracted_docs,
        candidates=candidates,
        prefill=prefill,
        structured_facts=structured_facts,
        conflicts=sorted(conflicts),
        warnings=sorted(set(warnings)),
    )
