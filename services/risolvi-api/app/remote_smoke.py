from __future__ import annotations

import argparse
import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import httpx

SYNTHETIC_FACTS_BASE = {
    "problem": "withdrawal",
    "consumer": True,
    "professional_seller": True,
    "seller_country": "IT",
    "distance_purchase": True,
    "physical_good": True,
    "seller_name": "RISOLVI Smoke Test Merchant",
}
SYNTHETIC_EXTRACTION_BYTES = (
    b"Venditore: RISOLVI Smoke Test Merchant\n"
    b"Ordine numero 123\n"
    b"Acquisto online. Diritto di recesso. Prodotto fisico."
)


def _expect(response: httpx.Response, status: int, label: str) -> Any:
    if response.status_code != status:
        raise RuntimeError(f"{label}:expected_{status}:got_{response.status_code}")
    if status == 204:
        return None
    content_type = response.headers.get("content-type", "")
    return response.json() if "application/json" in content_type else response.text


def _safe_error(exc: Exception) -> str:
    if isinstance(exc, RuntimeError):
        return str(exc)[:200]
    return type(exc).__name__


def _mark(checks: list[dict[str, object]], name: str, detail: str = "ok") -> None:
    checks.append({"name": name, "ok": True, "detail": detail})


def run(base_url: str, reviewer_id: str, reviewer_secret: str) -> dict[str, object]:
    """Run a destructive synthetic E2E against a protected pilot environment.

    The function creates and deletes one synthetic case. It never prints or
    returns the capability token or reviewer credential. The returned report is
    intentionally limited to normalized checks and non-secret release identity.
    """

    base_url = base_url.rstrip("/")
    case_id: str | None = None
    case_token: str | None = None
    checks: list[dict[str, object]] = []
    report: dict[str, object] = {
        "schema": 1,
        "kind": "remote_smoke",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "status": "blocked",
        "environment": "unknown",
        "service_version": "unknown",
        "commit_sha": "unknown",
        "checks": checks,
    }

    with httpx.Client(base_url=base_url, timeout=20.0, follow_redirects=False) as client:
        try:
            health = _expect(client.get("/health"), 200, "health")
            if health.get("status") != "ok":
                raise RuntimeError("health_payload_invalid")
            _mark(checks, "health", "health_200")

            ready = _expect(client.get("/ready"), 200, "ready")
            if ready.get("status") != "ready":
                raise RuntimeError("ready_payload_invalid")
            _mark(checks, "ready", "ready_200")

            config = _expect(client.get("/v1/config"), 200, "config")
            if not config.get("pilot_enabled"):
                raise RuntimeError("pilot_not_enabled")
            if not config.get("pilot_intake_enabled"):
                raise RuntimeError("pilot_intake_not_enabled_for_smoke")
            report["environment"] = str(config.get("environment", "unknown"))
            report["service_version"] = str(config.get("service_version", "unknown"))
            report["commit_sha"] = str(config.get("build_sha", "unknown"))
            if health.get("version") != report["service_version"] or ready.get("version") != report["service_version"]:
                raise RuntimeError("release_version_mismatch")
            _mark(checks, "config", "pilot_config_loaded")

            created = _expect(client.post("/v1/cases"), 200, "create_case")
            case_id = created["case"]["id"]
            case_token = created["capability_token"]
            case_headers = {"X-Case-Token": case_token}
            reviewer_headers = {
                "X-Reviewer-Id": reviewer_id,
                "X-Reviewer-Token": reviewer_secret,
            }
            _mark(checks, "create_case", "synthetic_case_created")

            facts = {**SYNTHETIC_FACTS_BASE, "delivery_date": date.today().isoformat()}
            _expect(
                client.put(f"/v1/cases/{case_id}/facts", headers=case_headers, json=facts),
                200,
                "save_facts",
            )
            _mark(checks, "save_facts", "synthetic_facts_confirmed")

            extracted = _expect(
                client.post(
                    f"/v1/cases/{case_id}/documents/extract",
                    headers=case_headers,
                    files={"files": ("smoke-extract.txt", SYNTHETIC_EXTRACTION_BYTES, "text/plain")},
                ),
                200,
                "extract_document",
            )
            _mark(checks, "extract_document", "server_extraction_200")
            seller = next((item for item in extracted.get("candidates", []) if item.get("key") == "seller_name"), None)
            if not seller or seller.get("value") != "RISOLVI Smoke Test Merchant":
                raise RuntimeError("extraction_seller_missing")
            evidence = seller.get("evidence") or []
            if not evidence:
                raise RuntimeError("extraction_provenance_missing")
            first_evidence = evidence[0]
            if not first_evidence.get("document_id") or first_evidence.get("page") != 1 or not first_evidence.get("span"):
                raise RuntimeError("extraction_provenance_incomplete")
            _mark(checks, "extraction_provenance", "seller_fact_has_document_page_span")

            _expect(
                client.post(
                    f"/v1/cases/{case_id}/pilot/consent",
                    headers=case_headers,
                    json={"notice_version": config["pilot_notice_version"]},
                ),
                204,
                "pilot_consent",
            )
            _mark(checks, "pilot_consent", "pilot_consent_recorded")

            uploaded = _expect(
                client.post(
                    f"/v1/cases/{case_id}/documents",
                    headers=case_headers,
                    files={"file": ("smoke.txt", b"RISOLVI synthetic smoke document", "text/plain")},
                ),
                200,
                "upload_document",
            )
            if not uploaded.get("id"):
                raise RuntimeError("uploaded_document_id_missing")
            _mark(checks, "upload_document", "synthetic_original_persisted")

            submitted = _expect(
                client.post(f"/v1/cases/{case_id}/pilot/submit", headers=case_headers),
                200,
                "pilot_submit",
            )
            review_id = submitted["review_id"]
            _mark(checks, "pilot_submit", "review_created")

            pending = _expect(
                client.get(f"/v1/cases/{case_id}/pilot/action", headers=case_headers),
                200,
                "action_pending",
            )
            if pending.get("status") != "PENDING_REVIEW" or pending.get("recommendation") is not None:
                raise RuntimeError("action_exposed_before_review")
            _mark(checks, "action_hidden_before_review", "pending_review_has_no_recommendation")

            decided = _expect(
                client.post(
                    f"/v1/pilot/reviews/{review_id}/decision",
                    headers=reviewer_headers,
                    json={"classification": "PASS_AUTONOMOUS", "reviewer_note": "synthetic smoke"},
                ),
                200,
                "review_decision",
            )
            _mark(checks, "review_decision", "human_review_decision_recorded")
            if decided.get("reviewer_id") != reviewer_id:
                raise RuntimeError("reviewer_attribution_mismatch")
            _mark(checks, "reviewer_attribution", "pseudonymous_reviewer_attributed")

            approved = _expect(
                client.get(f"/v1/cases/{case_id}/pilot/action", headers=case_headers),
                200,
                "action_approved",
            )
            if approved.get("status") != "APPROVED" or not approved.get("recommendation"):
                raise RuntimeError("approved_action_missing")
            _mark(checks, "action_after_review", "approved_action_released")

            _expect(
                client.post(
                    f"/v1/cases/{case_id}/outcomes",
                    headers=case_headers,
                    json={"outcome_type": "smoke_test_completed", "payload": {"synthetic": True}},
                ),
                204,
                "record_outcome",
            )
            _mark(checks, "record_outcome", "synthetic_outcome_recorded")

            exported = _expect(
                client.get(f"/v1/cases/{case_id}/export", headers=case_headers),
                200,
                "export_case",
            )
            serialized = json.dumps(exported).lower()
            if "capability" in serialized or case_token.lower() in serialized:
                raise RuntimeError("secret_material_in_export")
            if reviewer_secret.lower() in serialized:
                raise RuntimeError("reviewer_credential_in_export")
            _mark(checks, "export_no_secrets", "export_contains_no_runtime_credentials")

            _expect(client.delete(f"/v1/cases/{case_id}", headers=case_headers), 204, "delete_case")
            _mark(checks, "delete_case", "case_delete_204")
            deleted = client.get(f"/v1/cases/{case_id}", headers=case_headers)
            if deleted.status_code != 404:
                raise RuntimeError(f"deleted_case_still_accessible:{deleted.status_code}")
            _mark(checks, "deleted_case_unreachable", "deleted_case_404")
            case_id = None
            case_token = None
            report["status"] = "ok"
        except Exception as exc:
            report["error"] = _safe_error(exc)
        finally:
            if case_id and case_token:
                try:
                    cleanup = client.delete(f"/v1/cases/{case_id}", headers={"X-Case-Token": case_token})
                    if cleanup.status_code in {204, 404}:
                        _mark(checks, "cleanup_after_failure", "best_effort_cleanup_completed")
                except Exception:
                    pass

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the synthetic RISOLVI production-like pilot smoke test")
    parser.add_argument("--output", help="Write the JSON artifact to this path in addition to stdout")
    args = parser.parse_args()

    base_url = os.getenv("RISOLVI_SMOKE_BASE_URL", "").strip()
    reviewer_id = os.getenv("RISOLVI_SMOKE_REVIEWER_ID", "").strip()
    reviewer_secret = os.getenv("RISOLVI_SMOKE_REVIEWER_SECRET", "") or os.getenv("RISOLVI_REVIEWER_SECRET", "")
    if not base_url:
        raise SystemExit("RISOLVI_SMOKE_BASE_URL is required")
    if not reviewer_id:
        raise SystemExit("RISOLVI_SMOKE_REVIEWER_ID is required")
    if len(reviewer_secret) < 24:
        raise SystemExit("RISOLVI_SMOKE_REVIEWER_SECRET is required")

    report = run(base_url, reviewer_id, reviewer_secret)
    encoded = json.dumps(report, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    raise SystemExit(0 if report["status"] == "ok" else 1)


if __name__ == "__main__":
    main()
