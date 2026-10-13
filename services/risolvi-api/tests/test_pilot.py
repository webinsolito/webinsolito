from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database
from app.main import create_app
from app.storage import LocalPrivateStorage


def make_client(tmp_path, *, pilot_enabled: bool = True, intake_enabled: bool | None = None):
    if intake_enabled is None:
        intake_enabled = pilot_enabled
    settings = Settings(
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'pilot.db'}",
        capability_secret="test-capability-secret-that-is-long-enough",
        case_retention_days=7,
        document_retention_hours=24,
        storage_backend="local",
        local_storage_dir=str(tmp_path / "private"),
        signed_url_seconds=60,
        pilot_enabled=pilot_enabled,
        pilot_intake_enabled=intake_enabled,
        reviewer_secret="r" * 40,
    )
    database = Database(settings.database_url)
    storage = LocalPrivateStorage(settings.local_storage_dir)
    return TestClient(create_app(settings, database, storage)), database


def create_case(client: TestClient):
    payload = client.post("/v1/cases").json()
    return payload["case"]["id"], payload["capability_token"]


def case_auth(token: str):
    return {"X-Case-Token": token}


def reviewer_auth():
    return {"X-Reviewer-Token": "r" * 40}


def valid_facts():
    return {
        "problem": "defect",
        "consumer": True,
        "professional_seller": True,
        "seller_country": "IT",
        "distance_purchase": True,
        "physical_good": True,
        "delivery_date": "2026-10-01",
        "defect_manifested_date": "2026-10-10",
        "seller_name": "Negozio Pilot S.r.l.",
    }


def test_pilot_requires_consent_and_human_decision_before_action(tmp_path):
    client, _ = make_client(tmp_path)
    case_id, token = create_case(client)
    assert client.put(
        f"/v1/cases/{case_id}/facts", headers=case_auth(token), json=valid_facts()
    ).status_code == 200

    no_consent = client.post(f"/v1/cases/{case_id}/pilot/submit", headers=case_auth(token))
    assert no_consent.status_code == 409
    assert no_consent.json()["detail"] == "pilot_consent_required"

    assert client.post(
        f"/v1/cases/{case_id}/pilot/consent",
        headers=case_auth(token),
        json={"notice_version": "pilot-2026-10-v1"},
    ).status_code == 204

    submitted = client.post(f"/v1/cases/{case_id}/pilot/submit", headers=case_auth(token))
    assert submitted.status_code == 200
    review_id = submitted.json()["review_id"]

    # The raw engine output is not released through the pilot action endpoint.
    pending = client.get(f"/v1/cases/{case_id}/pilot/action", headers=case_auth(token))
    assert pending.status_code == 200
    assert pending.json() == {"status": "PENDING_REVIEW", "recommendation": None}

    # In pilot mode the legacy direct-analysis route is blocked to prevent bypass.
    bypass = client.post(f"/v1/cases/{case_id}/analyse", headers=case_auth(token))
    assert bypass.status_code == 409
    assert bypass.json()["detail"] == "pilot_review_required_use_pilot_submit"

    assert client.get("/v1/pilot/reviews/pending", headers={"X-Reviewer-Token": "wrong"}).status_code == 404
    queue = client.get("/v1/pilot/reviews/pending", headers=reviewer_auth())
    assert queue.status_code == 200
    assert [item["id"] for item in queue.json()] == [review_id]

    decided = client.post(
        f"/v1/pilot/reviews/{review_id}/decision",
        headers=reviewer_auth(),
        json={"classification": "PASS_AUTONOMOUS", "reviewer_note": "Nessuna modifica"},
    )
    assert decided.status_code == 200
    assert decided.json()["classification"] == "PASS_AUTONOMOUS"
    assert decided.json()["final_recommendation"]["route"] == "LEGAL_GUARANTEE"

    approved = client.get(f"/v1/cases/{case_id}/pilot/action", headers=case_auth(token))
    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED"
    assert approved.json()["recommendation"]["route"] == "LEGAL_GUARANTEE"

    metrics = client.get("/v1/pilot/metrics", headers=reviewer_auth())
    assert metrics.status_code == 200
    data = metrics.json()
    assert data["consented_cases"] == 1
    assert data["submitted_reviews"] == 1
    assert data["decided_reviews"] == 1
    assert data["delivered_actions"] == 1
    assert data["classifications"]["PASS_AUTONOMOUS"] == 1
    assert data["s0_s1_errors"] == 0


def test_material_decision_requires_explicit_final_recommendation(tmp_path):
    client, _ = make_client(tmp_path)
    case_id, token = create_case(client)
    client.put(f"/v1/cases/{case_id}/facts", headers=case_auth(token), json=valid_facts())
    client.post(
        f"/v1/cases/{case_id}/pilot/consent",
        headers=case_auth(token),
        json={"notice_version": "pilot-2026-10-v1"},
    )
    review_id = client.post(
        f"/v1/cases/{case_id}/pilot/submit", headers=case_auth(token)
    ).json()["review_id"]

    response = client.post(
        f"/v1/pilot/reviews/{review_id}/decision",
        headers=reviewer_auth(),
        json={"classification": "MATERIAL_EDIT", "error_severity": "S2"},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "final_recommendation_required"


def test_case_delete_removes_pilot_rows(tmp_path):
    client, database = make_client(tmp_path)
    case_id, token = create_case(client)
    client.put(f"/v1/cases/{case_id}/facts", headers=case_auth(token), json=valid_facts())
    client.post(
        f"/v1/cases/{case_id}/pilot/consent",
        headers=case_auth(token),
        json={"notice_version": "pilot-2026-10-v1"},
    )
    client.post(f"/v1/cases/{case_id}/pilot/submit", headers=case_auth(token))
    assert client.delete(f"/v1/cases/{case_id}", headers=case_auth(token)).status_code == 204

    from sqlalchemy import func, select
    from app.db import PilotParticipationRecord, PilotReviewRecord

    with database.session() as session:
        assert session.scalar(select(func.count()).select_from(PilotParticipationRecord)) == 0
        assert session.scalar(select(func.count()).select_from(PilotReviewRecord)) == 0


def test_pilot_routes_are_hidden_when_disabled(tmp_path):
    client, _ = make_client(tmp_path, pilot_enabled=False)
    case_id, token = create_case(client)
    response = client.post(
        f"/v1/cases/{case_id}/pilot/consent",
        headers=case_auth(token),
        json={"notice_version": "pilot-2026-10-v1"},
    )
    assert response.status_code == 404
    assert client.get("/v1/pilot/reviews/pending", headers=reviewer_auth()).status_code == 404


def test_intake_pause_blocks_new_user_writes_but_not_existing_review_delivery(tmp_path):
    open_client, database = make_client(tmp_path, intake_enabled=True)
    case_id, token = create_case(open_client)
    assert open_client.put(
        f"/v1/cases/{case_id}/facts", headers=case_auth(token), json=valid_facts()
    ).status_code == 200
    assert open_client.post(
        f"/v1/cases/{case_id}/pilot/consent",
        headers=case_auth(token),
        json={"notice_version": "pilot-2026-10-v1"},
    ).status_code == 204
    review_id = open_client.post(
        f"/v1/cases/{case_id}/pilot/submit", headers=case_auth(token)
    ).json()["review_id"]

    paused_settings = Settings(
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'pilot.db'}",
        capability_secret="test-capability-secret-that-is-long-enough",
        case_retention_days=7,
        document_retention_hours=24,
        storage_backend="local",
        local_storage_dir=str(tmp_path / "private"),
        signed_url_seconds=60,
        pilot_enabled=True,
        pilot_intake_enabled=False,
        reviewer_secret="r" * 40,
    )
    paused = TestClient(create_app(paused_settings, database, LocalPrivateStorage(paused_settings.local_storage_dir)))

    blocked = paused.post("/v1/cases")
    assert blocked.status_code == 503
    assert blocked.json()["detail"] == "pilot_intake_paused"
    blocked_facts = paused.put(
        f"/v1/cases/{case_id}/facts", headers=case_auth(token), json=valid_facts()
    )
    assert blocked_facts.status_code == 503

    # Pause intake without stranding cases already submitted for human review.
    decided = paused.post(
        f"/v1/pilot/reviews/{review_id}/decision",
        headers=reviewer_auth(),
        json={"classification": "PASS_AUTONOMOUS"},
    )
    assert decided.status_code == 200
    delivered = paused.get(f"/v1/cases/{case_id}/pilot/action", headers=case_auth(token))
    assert delivered.status_code == 200
    assert delivered.json()["status"] == "APPROVED"


def test_intake_cannot_be_enabled_without_pilot():
    settings = Settings(pilot_enabled=False, pilot_intake_enabled=True)
    try:
        settings.validate()
    except ValueError as exc:
        assert str(exc) == "pilot_intake_requires_pilot"
    else:
        raise AssertionError("intake must not be enabled without pilot mode")
