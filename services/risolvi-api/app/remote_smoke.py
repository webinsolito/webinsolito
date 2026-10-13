from __future__ import annotations

import json
import os
import sys
from typing import Any

import httpx

SYNTHETIC_FACTS = {
    "problem": "withdrawal",
    "consumer": True,
    "professional_seller": True,
    "seller_country": "IT",
    "distance_purchase": True,
    "physical_good": True,
    "delivery_date": "2026-10-10",
    "seller_name": "RISOLVI Smoke Test Merchant",
}


def _expect(response: httpx.Response, status: int, label: str) -> Any:
    if response.status_code != status:
        detail = response.text[:500]
        raise RuntimeError(f"{label}: expected {status}, got {response.status_code}: {detail}")
    if status == 204:
        return None
    content_type = response.headers.get("content-type", "")
    return response.json() if "application/json" in content_type else response.text


def run(base_url: str, reviewer_secret: str) -> dict[str, str]:
    """Run a destructive synthetic E2E against a protected pilot environment.

    The function creates and deletes one synthetic case. It never prints or
    returns the capability token or reviewer secret.
    """

    base_url = base_url.rstrip("/")
    case_id: str | None = None
    case_token: str | None = None

    with httpx.Client(base_url=base_url, timeout=20.0, follow_redirects=False) as client:
        health = _expect(client.get("/health"), 200, "health")
        ready = _expect(client.get("/ready"), 200, "ready")
        config = _expect(client.get("/v1/config"), 200, "config")
        if not config.get("pilot_enabled"):
            raise RuntimeError("pilot_not_enabled")
        if not config.get("pilot_intake_enabled"):
            raise RuntimeError("pilot_intake_not_enabled_for_smoke")

        try:
            created = _expect(client.post("/v1/cases"), 200, "create_case")
            case_id = created["case"]["id"]
            case_token = created["capability_token"]
            case_headers = {"X-Case-Token": case_token}
            reviewer_headers = {"X-Reviewer-Token": reviewer_secret}

            _expect(
                client.put(f"/v1/cases/{case_id}/facts", headers=case_headers, json=SYNTHETIC_FACTS),
                200,
                "save_facts",
            )
            _expect(
                client.post(
                    f"/v1/cases/{case_id}/pilot/consent",
                    headers=case_headers,
                    json={"notice_version": config["pilot_notice_version"]},
                ),
                204,
                "pilot_consent",
            )
            _expect(
                client.post(
                    f"/v1/cases/{case_id}/documents",
                    headers=case_headers,
                    files={"file": ("smoke.txt", b"RISOLVI synthetic smoke document", "text/plain")},
                ),
                200,
                "upload_document",
            )
            submitted = _expect(
                client.post(f"/v1/cases/{case_id}/pilot/submit", headers=case_headers),
                200,
                "pilot_submit",
            )
            review_id = submitted["review_id"]

            pending = _expect(
                client.get(f"/v1/cases/{case_id}/pilot/action", headers=case_headers),
                200,
                "action_pending",
            )
            if pending.get("status") != "PENDING_REVIEW" or pending.get("recommendation") is not None:
                raise RuntimeError("action_exposed_before_review")

            _expect(
                client.post(
                    f"/v1/pilot/reviews/{review_id}/decision",
                    headers=reviewer_headers,
                    json={"classification": "PASS_AUTONOMOUS", "reviewer_note": "synthetic smoke"},
                ),
                200,
                "review_decision",
            )
            approved = _expect(
                client.get(f"/v1/cases/{case_id}/pilot/action", headers=case_headers),
                200,
                "action_approved",
            )
            if approved.get("status") != "APPROVED" or not approved.get("recommendation"):
                raise RuntimeError("approved_action_missing")

            _expect(
                client.post(
                    f"/v1/cases/{case_id}/outcomes",
                    headers=case_headers,
                    json={"outcome_type": "smoke_test_completed", "payload": {"synthetic": True}},
                ),
                204,
                "record_outcome",
            )

            exported = _expect(
                client.get(f"/v1/cases/{case_id}/export", headers=case_headers),
                200,
                "export_case",
            )
            serialized = json.dumps(exported).lower()
            if "capability" in serialized or case_token.lower() in serialized:
                raise RuntimeError("secret_material_in_export")

            _expect(client.delete(f"/v1/cases/{case_id}", headers=case_headers), 204, "delete_case")
            deleted = client.get(f"/v1/cases/{case_id}", headers=case_headers)
            if deleted.status_code != 404:
                raise RuntimeError(f"deleted_case_still_accessible:{deleted.status_code}")
            case_id = None
            case_token = None
        finally:
            if case_id and case_token:
                try:
                    client.delete(f"/v1/cases/{case_id}", headers={"X-Case-Token": case_token})
                except Exception:
                    pass

    return {
        "status": "ok",
        "health": health.get("status", "unknown"),
        "ready": ready.get("status", "unknown"),
        "service_version": str(config.get("service_version", "unknown")),
    }


def main() -> None:
    base_url = os.getenv("RISOLVI_SMOKE_BASE_URL", "").strip()
    reviewer_secret = os.getenv("RISOLVI_REVIEWER_SECRET", "")
    if not base_url:
        raise SystemExit("RISOLVI_SMOKE_BASE_URL is required")
    if len(reviewer_secret) < 24:
        raise SystemExit("RISOLVI_REVIEWER_SECRET is required")
    try:
        result = run(base_url, reviewer_secret)
    except Exception as exc:
        print(json.dumps({"status": "blocked", "error": str(exc)[:500]}))
        raise SystemExit(1) from exc
    print(json.dumps(result))


if __name__ == "__main__":
    main()
