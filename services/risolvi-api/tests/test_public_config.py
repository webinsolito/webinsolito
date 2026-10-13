from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import SERVICE_VERSION, Settings
from app.db import Database
from app.main import create_app
from app.storage import LocalPrivateStorage


def make_client(tmp_path, *, origins: tuple[str, ...] = ("https://webinsolito.example",)) -> TestClient:
    settings = Settings(
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'public-config.db'}",
        capability_secret="test-capability-secret-that-is-long-enough",
        case_retention_days=7,
        document_retention_hours=24,
        storage_backend="local",
        local_storage_dir=str(tmp_path / "private"),
        signed_url_seconds=60,
        pilot_enabled=True,
        pilot_intake_enabled=True,
        reviewer_secret="r" * 40,
        allowed_origins=origins,
    )
    return TestClient(create_app(settings, Database(settings.database_url), LocalPrivateStorage(settings.local_storage_dir)))


def case_auth(token: str) -> dict[str, str]:
    return {"X-Case-Token": token}


def reviewer_auth() -> dict[str, str]:
    return {"X-Reviewer-Token": "r" * 40}


def test_public_config_exposes_only_non_secret_runtime_contract(tmp_path):
    client = make_client(tmp_path)
    response = client.get("/v1/config")
    assert response.status_code == 200
    data = response.json()
    assert data == {
        "service_version": SERVICE_VERSION,
        "pilot_enabled": True,
        "pilot_intake_enabled": True,
        "pilot_notice_version": "pilot-2026-10-v1",
        "case_retention_days": 7,
        "document_retention_hours": 24,
        "max_files": 8,
        "max_file_bytes": 8 * 1024 * 1024,
    }
    body = response.text.lower()
    assert "secret" not in body
    assert "reviewer" not in body


def test_cors_allows_only_explicit_configured_origin(tmp_path):
    client = make_client(tmp_path)
    allowed = client.options(
        "/v1/config",
        headers={
            "Origin": "https://webinsolito.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://webinsolito.example"

    denied = client.options(
        "/v1/config",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert denied.headers.get("access-control-allow-origin") is None


def test_outcome_events_appear_in_pilot_metrics(tmp_path):
    client = make_client(tmp_path)
    created = client.post("/v1/cases").json()
    case_id = created["case"]["id"]
    token = created["capability_token"]
    facts = {
        "problem": "defect",
        "consumer": True,
        "professional_seller": True,
        "seller_country": "IT",
        "distance_purchase": True,
        "physical_good": True,
        "delivery_date": "2026-10-01",
        "defect_manifested_date": "2026-10-10",
        "seller_name": "Negozio Test",
    }
    assert client.put(f"/v1/cases/{case_id}/facts", headers=case_auth(token), json=facts).status_code == 200
    assert client.post(
        f"/v1/cases/{case_id}/pilot/consent",
        headers=case_auth(token),
        json={"notice_version": "pilot-2026-10-v1"},
    ).status_code == 204
    review_id = client.post(f"/v1/cases/{case_id}/pilot/submit", headers=case_auth(token)).json()["review_id"]
    assert client.post(
        f"/v1/pilot/reviews/{review_id}/decision",
        headers=reviewer_auth(),
        json={"classification": "PASS_AUTONOMOUS"},
    ).status_code == 200
    assert client.get(f"/v1/cases/{case_id}/pilot/action", headers=case_auth(token)).json()["status"] == "APPROVED"
    assert client.post(
        f"/v1/cases/{case_id}/outcomes",
        headers=case_auth(token),
        json={"outcome_type": "action_copied", "payload": {}},
    ).status_code == 204
    assert client.post(
        f"/v1/cases/{case_id}/outcomes",
        headers=case_auth(token),
        json={"outcome_type": "action_sent", "payload": {}},
    ).status_code == 204

    metrics = client.get("/v1/pilot/metrics", headers=reviewer_auth()).json()
    assert metrics["outcomes"] == {"action_copied": 1, "action_sent": 1}


def test_wildcard_cors_is_rejected():
    settings = Settings(allowed_origins=("*",))
    try:
        settings.validate()
    except ValueError as exc:
        assert str(exc) == "allowed_origins_must_be_explicit_http_origins"
    else:
        raise AssertionError("wildcard origin must be rejected")
