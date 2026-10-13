from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import create_app
from app.config import Settings
from app.db import Database
from app.retention import run_retention
from app.storage import LocalPrivateStorage


def make_stack(tmp_path, *, case_days: int = 7, doc_hours: int = 24):
    settings = Settings(
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'risolvi.db'}",
        capability_secret="test-secret-that-is-long-enough-for-tests-only",
        case_retention_days=case_days,
        document_retention_hours=doc_hours,
        storage_backend="local",
        local_storage_dir=str(tmp_path / "private"),
        signed_url_seconds=60,
    )
    database = Database(settings.database_url)
    storage = LocalPrivateStorage(settings.local_storage_dir)
    app = create_app(settings, database, storage)
    return settings, database, storage, TestClient(app)


def create_case(client: TestClient):
    response = client.post("/v1/cases")
    assert response.status_code == 200
    payload = response.json()
    return payload["case"]["id"], payload["capability_token"]


def auth(token: str) -> dict[str, str]:
    return {"X-Case-Token": token}


def test_guest_capability_and_cross_case_isolation(tmp_path):
    _, _, _, client = make_stack(tmp_path)
    case_a, token_a = create_case(client)
    case_b, token_b = create_case(client)

    assert client.get(f"/v1/cases/{case_a}", headers=auth(token_a)).status_code == 200
    assert client.get(f"/v1/cases/{case_a}", headers=auth(token_b)).status_code == 404
    assert client.get(f"/v1/cases/{case_a}?token={token_a}").status_code == 404

    facts = {
        "problem": "defect",
        "consumer": True,
        "professional_seller": True,
        "seller_country": "IT",
        "distance_purchase": True,
        "physical_good": True,
        "delivery_date": date.today().isoformat(),
        "seller_name": "Negozio Test",
    }
    assert client.put(f"/v1/cases/{case_b}/facts", headers=auth(token_a), json=facts).status_code == 404
    assert client.put(f"/v1/cases/{case_b}/facts", headers=auth(token_b), json=facts).status_code == 200


def test_case_persists_across_app_recreation(tmp_path):
    settings, _, storage, client = make_stack(tmp_path)
    case_id, token = create_case(client)

    app2 = create_app(settings, Database(settings.database_url), storage)
    with TestClient(app2) as client2:
        response = client2.get(f"/v1/cases/{case_id}", headers=auth(token))
        assert response.status_code == 200
        assert response.json()["id"] == case_id


def test_facts_analysis_export_and_outcome_do_not_export_secret(tmp_path):
    _, _, _, client = make_stack(tmp_path)
    case_id, token = create_case(client)
    # This persistence test intentionally uses withdrawal rather than the guarantee
    # route so it remains stable across the scheduled 22/10/2026 guarantee cutover.
    facts = {
        "problem": "withdrawal",
        "consumer": True,
        "professional_seller": True,
        "seller_country": "IT",
        "distance_purchase": True,
        "physical_good": True,
        "delivery_date": date.today().isoformat(),
        "seller_name": "Negozio Test",
    }
    assert client.put(f"/v1/cases/{case_id}/facts", headers=auth(token), json=facts).status_code == 200
    analysed = client.post(f"/v1/cases/{case_id}/analyse", headers=auth(token))
    assert analysed.status_code == 200
    assert analysed.json()["route"] == "WITHDRAWAL"
    assert client.post(
        f"/v1/cases/{case_id}/outcomes",
        headers=auth(token),
        json={"outcome_type": "merchant_replied", "payload": {"resolved": False}},
    ).status_code == 204

    exported = client.get(f"/v1/cases/{case_id}/export", headers=auth(token))
    assert exported.status_code == 200
    body = exported.text.lower()
    assert "capability" not in body
    assert token.lower() not in body
    payload = exported.json()
    assert payload["facts"]
    assert payload["recommendations"]
    assert payload["actions"]
    assert payload["outcomes"]


def test_private_document_roundtrip_and_delete(tmp_path):
    _, _, _, client = make_stack(tmp_path)
    case_id, token = create_case(client)
    saved = client.post(
        f"/v1/cases/{case_id}/documents",
        headers=auth(token),
        files={"file": ("ricevuta.txt", b"ordine 123", "text/plain")},
    )
    assert saved.status_code == 200
    doc_id = saved.json()["id"]

    assert client.get(
        f"/v1/cases/{case_id}/documents/{doc_id}/download",
        headers=auth("wrong-token"),
    ).status_code == 404
    downloaded = client.get(
        f"/v1/cases/{case_id}/documents/{doc_id}/download",
        headers=auth(token),
    )
    assert downloaded.status_code == 200
    assert downloaded.content == b"ordine 123"

    assert client.delete(f"/v1/cases/{case_id}", headers=auth(token)).status_code == 204
    assert client.get(f"/v1/cases/{case_id}", headers=auth(token)).status_code == 404
    assert not any(path.is_file() for path in (tmp_path / "private").rglob("*"))


def test_retention_sweep_is_idempotent(tmp_path):
    settings, database, storage, client = make_stack(tmp_path, case_days=0, doc_hours=0)
    case_id, token = create_case(client)
    saved = client.post(
        f"/v1/cases/{case_id}/documents",
        headers=auth(token),
        files={"file": ("prova.txt", b"dato temporaneo", "text/plain")},
    )
    assert saved.status_code == 200

    later = datetime.now(timezone.utc) + timedelta(minutes=1)
    first = run_retention(settings, database, storage, now=later)
    second = run_retention(settings, database, storage, now=later)
    assert first.documents_deleted == 1
    assert first.cases_deleted == 1
    assert second.documents_deleted == 0
    assert second.cases_deleted == 0


def test_production_settings_fail_closed_without_postgres_secret_and_s3():
    settings = Settings(environment="production")
    try:
        settings.validate()
    except ValueError as exc:
        assert str(exc) == "production_requires_postgresql"
    else:
        raise AssertionError("production settings must fail closed")
