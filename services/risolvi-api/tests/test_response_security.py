from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database
from app.main import create_app
from app.malware import DisabledMalwareScanner
from app.storage import LocalPrivateStorage


def make_test_client(tmp_path) -> TestClient:
    settings = Settings(
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'headers.db'}",
        capability_secret="test-capability-secret-that-is-long-enough",
        storage_backend="local",
        local_storage_dir=str(tmp_path / "private"),
        auto_create_schema=True,
    )
    database = Database(settings.database_url)
    storage = LocalPrivateStorage(settings.local_storage_dir)
    return TestClient(create_app(settings, database, storage, DisabledMalwareScanner()))


def assert_privacy_headers(response) -> None:
    assert response.headers["cache-control"] == "no-store, max-age=0"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["expires"] == "0"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["permissions-policy"] == "camera=(), microphone=(), geolocation=()"


def test_privacy_headers_apply_to_normal_and_error_responses(tmp_path):
    client = make_test_client(tmp_path)

    healthy = client.get("/health")
    assert healthy.status_code == 200
    assert_privacy_headers(healthy)
    assert "strict-transport-security" not in healthy.headers

    missing = client.get("/v1/cases/00000000-0000-0000-0000-000000000000")
    assert missing.status_code == 404
    assert_privacy_headers(missing)


def test_private_document_download_is_attachment_and_no_store(tmp_path):
    client = make_test_client(tmp_path)
    created = client.post("/v1/cases").json()
    case_id = created["case"]["id"]
    headers = {"X-Case-Token": created["capability_token"]}

    saved = client.post(
        f"/v1/cases/{case_id}/documents",
        headers=headers,
        files={"file": ("ricevuta.txt", b"ordine sintetico 123", "text/plain")},
    )
    assert saved.status_code == 200

    downloaded = client.get(
        f"/v1/cases/{case_id}/documents/{saved.json()['id']}/download",
        headers=headers,
    )
    assert downloaded.status_code == 200
    assert downloaded.content == b"ordine sintetico 123"
    assert downloaded.headers["content-disposition"] == 'attachment; filename="ricevuta.txt"'
    assert_privacy_headers(downloaded)


def test_production_adds_hsts_even_when_runtime_dependencies_are_injected(tmp_path):
    settings = Settings(
        environment="production",
        database_url="postgresql+psycopg://user:password@example.invalid:5432/risolvi",
        capability_secret="c" * 40,
        storage_backend="s3",
        s3_bucket="risolvi-private",
        malware_scanner="clamav",
        clamav_host="clamav.internal",
        pilot_enabled=False,
        reviewer_secret="r" * 40,
        auto_create_schema=False,
    )
    database = Database(f"sqlite+pysqlite:///{tmp_path / 'injected.db'}")
    storage = LocalPrivateStorage(str(tmp_path / "private-production"))
    client = TestClient(create_app(settings, database, storage, DisabledMalwareScanner()))

    response = client.get("/health")
    assert response.status_code == 200
    assert_privacy_headers(response)
    assert response.headers["strict-transport-security"] == "max-age=31536000"
