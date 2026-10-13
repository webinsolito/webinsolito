from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database
from app.main import create_app
from app.malware import MalwareDetected, MalwareScanError
from app.storage import LocalPrivateStorage
from app.upload_security import validate_upload_type
from app.document_pipeline import DocumentError, MAX_FILES


class CleanScanner:
    def __init__(self):
        self.calls = 0

    def scan(self, data: bytes) -> None:
        self.calls += 1


class InfectedScanner:
    def scan(self, data: bytes) -> None:
        raise MalwareDetected("malware_detected")


class BrokenScanner:
    def scan(self, data: bytes) -> None:
        raise MalwareScanError("malware_scanner_unavailable")


def make_client(tmp_path, scanner):
    settings = Settings(
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'upload-security.db'}",
        capability_secret="test-capability-secret-that-is-long-enough",
        storage_backend="local",
        local_storage_dir=str(tmp_path / "private"),
    )
    database = Database(settings.database_url)
    storage = LocalPrivateStorage(settings.local_storage_dir)
    client = TestClient(create_app(settings, database, storage, scanner))
    created = client.post("/v1/cases").json()
    return client, created["case"]["id"], created["capability_token"], storage


def auth(token: str) -> dict[str, str]:
    return {"X-Case-Token": token}


def test_signature_validation_rejects_renamed_binary():
    try:
        validate_upload_type("fattura.pdf", "application/pdf", b"MZ-not-a-pdf")
    except DocumentError as exc:
        assert str(exc) == "document_signature_mismatch"
    else:
        raise AssertionError("renamed binary must be rejected")


def test_signature_validation_accepts_expected_image_headers():
    assert validate_upload_type("screen.png", "image/png", b"\x89PNG\r\n\x1a\nrest") == "image/png"
    assert validate_upload_type("screen.jpg", "image/jpeg", b"\xff\xd8\xff\xe0rest") == "image/jpeg"
    assert validate_upload_type("screen.webp", "image/webp", b"RIFF\x04\x00\x00\x00WEBPrest") == "image/webp"


def test_upload_is_scanned_before_private_storage(tmp_path):
    scanner = CleanScanner()
    client, case_id, token, storage = make_client(tmp_path, scanner)
    response = client.post(
        f"/v1/cases/{case_id}/documents",
        headers=auth(token),
        files={"file": ("nota.txt", b"testo sintetico", "text/plain")},
    )
    assert response.status_code == 200
    assert scanner.calls == 1
    assert len(list(storage.root.rglob("*"))) >= 1


def test_infected_file_never_reaches_storage(tmp_path):
    client, case_id, token, storage = make_client(tmp_path, InfectedScanner())
    response = client.post(
        f"/v1/cases/{case_id}/documents",
        headers=auth(token),
        files={"file": ("nota.txt", b"testo sintetico", "text/plain")},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "malware_detected"
    assert not any(path.is_file() for path in storage.root.rglob("*"))


def test_scanner_failure_fails_closed_without_storage(tmp_path):
    client, case_id, token, storage = make_client(tmp_path, BrokenScanner())
    response = client.post(
        f"/v1/cases/{case_id}/documents",
        headers=auth(token),
        files={"file": ("nota.txt", b"testo sintetico", "text/plain")},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "malware_scan_unavailable"
    assert not any(path.is_file() for path in storage.root.rglob("*"))


def test_persisted_originals_are_capped_server_side(tmp_path):
    scanner = CleanScanner()
    client, case_id, token, _ = make_client(tmp_path, scanner)
    for index in range(MAX_FILES):
        response = client.post(
            f"/v1/cases/{case_id}/documents",
            headers=auth(token),
            files={"file": (f"nota-{index}.txt", f"documento {index}".encode(), "text/plain")},
        )
        assert response.status_code == 200

    rejected = client.post(
        f"/v1/cases/{case_id}/documents",
        headers=auth(token),
        files={"file": ("extra.txt", b"documento extra", "text/plain")},
    )
    assert rejected.status_code == 409
    assert rejected.json()["detail"] == "max_documents_per_case"
    assert scanner.calls == MAX_FILES


def test_server_extraction_scans_before_parser(tmp_path):
    client, case_id, token, _ = make_client(tmp_path, InfectedScanner())
    response = client.post(
        f"/v1/cases/{case_id}/documents/extract",
        headers=auth(token),
        files={"files": ("sample.pdf", b"%PDF-1.4\nsynthetic", "application/pdf")},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "malware_detected"
