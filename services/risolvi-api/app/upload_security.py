from __future__ import annotations

import re

from .document_pipeline import DocumentError

_ALLOWED_SUFFIXES = {
    "pdf": "application/pdf",
    "eml": "message/rfc822",
    "txt": "text/plain",
    "html": "text/html",
    "htm": "text/html",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "heic": "image/heic",
}

_ALLOWED_MIMES = set(_ALLOWED_SUFFIXES.values()) | {"application/octet-stream"}
_EMAIL_HEADER_RE = re.compile(r"(?mi)^(?:from|to|subject|date|message-id|mime-version|content-type):\s*.+$")


def _looks_like_text(data: bytes) -> bool:
    sample = data[:64 * 1024]
    if b"\x00" in sample:
        return False
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = sample.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        return False
    if not text:
        return False
    useful = sum(1 for char in text if char.isprintable() or char in "\r\n\t")
    return useful / len(text) >= 0.90


def _looks_like_heic(data: bytes) -> bool:
    if len(data) < 12 or data[4:8] != b"ftyp":
        return False
    brands = data[8:48]
    return any(brand in brands for brand in (b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1"))


def _matches(expected: str, data: bytes) -> bool:
    if expected == "application/pdf":
        return data.startswith(b"%PDF-")
    if expected == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if expected == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    if expected == "image/webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if expected == "image/heic":
        return _looks_like_heic(data)
    if expected in {"text/plain", "text/html"}:
        return _looks_like_text(data)
    if expected == "message/rfc822":
        if not _looks_like_text(data):
            return False
        text = data[:64 * 1024].decode("latin-1", errors="replace")
        return bool(_EMAIL_HEADER_RE.search(text))
    return False


def validate_upload_type(filename: str, mime_type: str | None, data: bytes) -> str:
    """Return canonical MIME only when extension, claimed MIME and bytes agree.

    This is deliberately small and allow-list based. It is not a malware scanner;
    callers must run the configured malware gate separately before parsing or
    persisting the payload.
    """

    if not data:
        raise DocumentError("empty_document")
    safe_name = (filename or "documento").strip().lower()
    suffix = safe_name.rsplit(".", 1)[-1] if "." in safe_name else ""
    claimed = (mime_type or "application/octet-stream").lower().split(";", 1)[0].strip()
    if claimed not in _ALLOWED_MIMES:
        raise DocumentError("unsupported_document_type")

    expected_from_suffix = _ALLOWED_SUFFIXES.get(suffix)
    expected_from_mime = None if claimed == "application/octet-stream" else claimed

    if expected_from_suffix and expected_from_mime and expected_from_suffix != expected_from_mime:
        # jpg/jpeg normalize to the same canonical MIME above; other disagreement
        # means metadata is inconsistent and should not reach reviewer storage.
        raise DocumentError("document_type_mismatch")

    expected = expected_from_suffix or expected_from_mime
    if expected is None:
        raise DocumentError("unsupported_document_type")
    if not _matches(expected, data):
        raise DocumentError("document_signature_mismatch")
    return expected
