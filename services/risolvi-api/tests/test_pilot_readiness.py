from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone

from app.pilot_readiness import build_report, render_markdown


NOW = datetime(2026, 10, 13, 13, 0, tzinfo=timezone.utc)
SHA = "a" * 40


def preflight_report() -> dict:
    return {
        "schema": 1,
        "kind": "preflight",
        "generated_at": "2026-10-13T12:30:00Z",
        "status": "ok",
        "environment": "production",
        "service_version": "0.13.0",
        "commit_sha": SHA,
        "checks": [
            {"name": "config", "ok": True, "detail": "configuration_valid"},
            {"name": "database_ping", "ok": True, "detail": "database_reachable"},
            {"name": "database_schema", "ok": True, "detail": "schema_present"},
            {"name": "malware_scanner", "ok": True, "detail": "malware_scanner_clean_and_detection_paths_ok"},
            {"name": "private_storage", "ok": True, "detail": "storage_roundtrip_delete_ok"},
        ],
    }


def smoke_report() -> dict:
    checks = [
        "health",
        "ready",
        "upload_document",
        "extract_document",
        "extraction_provenance",
        "pilot_consent",
        "review_decision",
        "reviewer_attribution",
        "action_hidden_before_review",
        "record_outcome",
        "delete_case",
        "deleted_case_unreachable",
    ]
    return {
        "schema": 1,
        "kind": "remote_smoke",
        "generated_at": "2026-10-13T12:45:00Z",
        "status": "ok",
        "environment": "production",
        "service_version": "0.13.0",
        "commit_sha": SHA,
        "checks": [{"name": name, "ok": True, "detail": "ok"} for name in checks],
        "secret_like_field_that_must_not_leak": "super-secret-token-value",
    }


def evidence_manifest() -> dict:
    return {
        "schema": 1,
        "environment_id": "risolvi-pilot-eu-01",
        "gates": {
            "dedicated_infrastructure": {
                "status": "PASS",
                "reference_id": "ops:dedicated-infra-01",
                "reviewed_by": "ops-01",
                "reviewed_at": "2026-10-13T12:20:00Z",
            },
            "legal_signoff": {
                "status": "PASS",
                "reference_id": "github:#79",
                "reviewed_by": "legal-01",
                "reviewed_at": "2026-10-13T12:25:00Z",
            },
            "privacy_security": {
                "status": "PASS",
                "reference_id": "github:#100",
                "reviewed_by": "privacy-01",
                "reviewed_at": "2026-10-13T12:26:00Z",
            },
            "document_pipeline": {
                "status": "PASS",
                "reference_id": "github:#81",
                "reviewed_by": "qa-01",
                "reviewed_at": "2026-10-13T12:27:00Z",
            },
        },
    }


def gate(report: dict, name: str) -> dict:
    return next(item for item in report["gates"] if item["name"] == name)


def test_all_required_evidence_produces_go_without_echoing_secrets():
    report = build_report(
        preflight=preflight_report(),
        smoke=smoke_report(),
        evidence=evidence_manifest(),
        now=NOW,
    )

    assert report["decision"] == "GO"
    assert report["commit_sha"] == SHA
    assert report["environment"] == "production"
    assert report["environment_id"] == "risolvi-pilot-eu-01"
    assert all(item["status"] == "PASS" for item in report["gates"])
    serialized = str(report)
    assert "super-secret-token-value" not in serialized
    assert report["inputs"]["smoke_sha256"]
    markdown = render_markdown(report)
    assert "**GO**" in markdown
    assert "super-secret-token-value" not in markdown


def test_unknown_manual_gate_blocks_go():
    evidence = evidence_manifest()
    evidence["gates"]["legal_signoff"] = {"status": "UNKNOWN"}
    report = build_report(
        preflight=preflight_report(),
        smoke=smoke_report(),
        evidence=evidence,
        now=NOW,
    )

    assert report["decision"] == "NO-GO"
    assert gate(report, "legal_signoff")["status"] == "UNKNOWN"


def test_missing_technical_artifact_is_unknown_and_blocks_go():
    report = build_report(
        preflight=preflight_report(),
        smoke=None,
        evidence=evidence_manifest(),
        now=NOW,
    )

    assert report["decision"] == "NO-GO"
    assert gate(report, "health")["status"] == "UNKNOWN"
    assert gate(report, "build_identity")["status"] == "UNKNOWN"


def test_stale_artifact_fails_closed():
    preflight = preflight_report()
    preflight["generated_at"] = (NOW - timedelta(hours=25)).isoformat()
    report = build_report(
        preflight=preflight,
        smoke=smoke_report(),
        evidence=evidence_manifest(),
        now=NOW,
        max_age_hours=24,
    )

    assert report["decision"] == "NO-GO"
    assert gate(report, "artifact_freshness") == {
        "name": "artifact_freshness",
        "status": "FAIL",
        "detail": "artifact_stale",
    }


def test_commit_mismatch_fails_closed():
    smoke = smoke_report()
    smoke["commit_sha"] = "b" * 40
    report = build_report(
        preflight=preflight_report(),
        smoke=smoke,
        evidence=evidence_manifest(),
        now=NOW,
    )

    assert report["decision"] == "NO-GO"
    assert gate(report, "build_identity")["status"] == "FAIL"
    assert report["commit_sha"] == "unknown"


def test_claimed_pass_without_attestation_metadata_is_failure_not_unknown():
    evidence = evidence_manifest()
    evidence["gates"]["privacy_security"] = {"status": "PASS"}
    report = build_report(
        preflight=preflight_report(),
        smoke=smoke_report(),
        evidence=evidence,
        now=NOW,
    )

    assert report["decision"] == "NO-GO"
    assert gate(report, "privacy_security")["status"] == "FAIL"
    assert gate(report, "privacy_security")["detail"] == "pass_evidence_reference_invalid"


def test_failed_low_level_delete_or_storage_gate_blocks_combined_delete_gate():
    smoke = smoke_report()
    failed = next(item for item in smoke["checks"] if item["name"] == "delete_case")
    failed["ok"] = False
    report = build_report(
        preflight=preflight_report(),
        smoke=smoke,
        evidence=evidence_manifest(),
        now=NOW,
    )

    assert report["decision"] == "NO-GO"
    assert gate(report, "delete_db_blob")["status"] == "FAIL"


def test_non_production_artifacts_cannot_go():
    preflight = preflight_report()
    smoke = smoke_report()
    preflight["environment"] = "staging"
    smoke["environment"] = "staging"
    report = build_report(preflight=preflight, smoke=smoke, evidence=evidence_manifest(), now=NOW)

    assert report["decision"] == "NO-GO"
    assert gate(report, "artifact_consistency")["detail"] == "environment_not_production"
