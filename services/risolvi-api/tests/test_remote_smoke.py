from __future__ import annotations

from fastapi.testclient import TestClient

import app.remote_smoke as remote_smoke
from app.config import SERVICE_VERSION, Settings
from app.db import Database
from app.main import create_app
from app.storage import LocalPrivateStorage


class CleanScanner:
    def scan(self, data: bytes) -> None:
        return None


class ClientAdapter:
    def __init__(self, client: TestClient):
        self.client = client

    def __enter__(self):
        self.client.__enter__()
        return self

    def __exit__(self, exc_type, exc, tb):
        return self.client.__exit__(exc_type, exc, tb)

    def get(self, *args, **kwargs):
        return self.client.get(*args, **kwargs)

    def post(self, *args, **kwargs):
        return self.client.post(*args, **kwargs)

    def put(self, *args, **kwargs):
        return self.client.put(*args, **kwargs)

    def delete(self, *args, **kwargs):
        return self.client.delete(*args, **kwargs)


def test_remote_smoke_emits_granular_secret_free_artifact(tmp_path, monkeypatch):
    reviewer_id = "rev-smoke"
    reviewer_secret = "r" * 40
    build_sha = "a" * 40
    settings = Settings(
        environment="test",
        build_sha=build_sha,
        database_url=f"sqlite+pysqlite:///{tmp_path / 'smoke.db'}",
        capability_secret="c" * 40,
        storage_backend="local",
        local_storage_dir=str(tmp_path / "private"),
        pilot_enabled=True,
        pilot_intake_enabled=True,
        reviewer_secret=reviewer_secret,
        reviewer_credentials=((reviewer_id, reviewer_secret),),
    )
    database = Database(settings.database_url)
    storage = LocalPrivateStorage(settings.local_storage_dir)
    test_client = TestClient(create_app(settings, database, storage, CleanScanner()))

    def client_factory(*args, **kwargs):
        return ClientAdapter(test_client)

    monkeypatch.setattr(remote_smoke.httpx, "Client", client_factory)
    report = remote_smoke.run("https://risolvi.test", reviewer_id, reviewer_secret)

    assert report["status"] == "ok", report
    assert report["environment"] == "test"
    assert report["service_version"] == SERVICE_VERSION
    assert report["commit_sha"] == build_sha
    checks = {item["name"]: item for item in report["checks"]}
    for required in {
        "health",
        "ready",
        "extract_document",
        "extraction_provenance",
        "pilot_consent",
        "upload_document",
        "action_hidden_before_review",
        "review_decision",
        "reviewer_attribution",
        "action_after_review",
        "record_outcome",
        "export_no_secrets",
        "delete_case",
        "deleted_case_unreachable",
    }:
        assert checks[required]["ok"] is True

    serialized = str(report)
    assert reviewer_secret not in serialized
    assert "capability_token" not in serialized
    assert not any(path.is_file() for path in (tmp_path / "private").rglob("*"))
