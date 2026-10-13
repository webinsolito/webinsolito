from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

TECHNICAL_GATES = {
    "build_identity",
    "artifact_consistency",
    "artifact_freshness",
    "production_config",
    "migrations",
    "database",
    "private_storage",
    "malware_scanner",
    "health",
    "ready",
    "synthetic_upload",
    "extraction",
    "consent",
    "human_review",
    "action_hidden_before_review",
    "outcome",
    "delete_db_blob",
}

MANUAL_GATES = {
    "dedicated_infrastructure",
    "legal_signoff",
    "privacy_security",
    "document_pipeline",
}


def _load(path: str) -> dict[str, Any]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("artifact_must_be_object")
    return value


def validate(
    preflight: dict[str, Any],
    smoke: dict[str, Any],
    readiness: dict[str, Any],
    *,
    expected_commit: str | None = None,
    expected_version: str | None = None,
) -> dict[str, Any]:
    errors: list[str] = []

    if preflight.get("status") != "ok":
        errors.append("preflight_not_ok")
    if smoke.get("status") != "ok":
        errors.append("smoke_not_ok")
    if readiness.get("decision") != "NO-GO":
        errors.append("readiness_must_remain_no_go")

    if preflight.get("environment") != "production":
        errors.append("preflight_environment_not_production")
    if smoke.get("environment") != "production":
        errors.append("smoke_environment_not_production")
    if readiness.get("environment") != "production":
        errors.append("readiness_environment_not_production")

    commits = {
        str(preflight.get("commit_sha", "unknown")),
        str(smoke.get("commit_sha", "unknown")),
        str(readiness.get("commit_sha", "unknown")),
    }
    if len(commits) != 1 or "unknown" in commits:
        errors.append("release_commit_identity_mismatch")
    if expected_commit and commits != {expected_commit}:
        errors.append("release_commit_not_expected")

    versions = {
        str(preflight.get("service_version", "unknown")),
        str(smoke.get("service_version", "unknown")),
        str(readiness.get("service_version", "unknown")),
    }
    if len(versions) != 1 or "unknown" in versions:
        errors.append("service_version_identity_mismatch")
    if expected_version and versions != {expected_version}:
        errors.append("service_version_not_expected")

    for artifact_name, artifact in (("preflight", preflight), ("smoke", smoke)):
        checks = artifact.get("checks")
        if not isinstance(checks, list) or not checks:
            errors.append(f"{artifact_name}_checks_missing")
            continue
        failed = [str(item.get("name")) for item in checks if not isinstance(item, dict) or item.get("ok") is not True]
        if failed:
            errors.append(f"{artifact_name}_checks_failed:{','.join(failed)}")

    raw_gates = readiness.get("gates")
    gates: dict[str, str] = {}
    if not isinstance(raw_gates, list):
        errors.append("readiness_gates_missing")
    else:
        for item in raw_gates:
            if isinstance(item, dict) and isinstance(item.get("name"), str):
                gates[item["name"]] = str(item.get("status", "UNKNOWN"))

    missing_technical = sorted(TECHNICAL_GATES - set(gates))
    if missing_technical:
        errors.append("technical_gates_missing:" + ",".join(missing_technical))
    failed_technical = sorted(name for name in TECHNICAL_GATES if gates.get(name) != "PASS")
    if failed_technical:
        errors.append("technical_gates_not_pass:" + ",".join(failed_technical))

    missing_manual = sorted(MANUAL_GATES - set(gates))
    if missing_manual:
        errors.append("manual_gates_missing:" + ",".join(missing_manual))
    manual_not_unknown = sorted(name for name in MANUAL_GATES if gates.get(name) != "UNKNOWN")
    if manual_not_unknown:
        errors.append("manual_gates_must_stay_unknown:" + ",".join(manual_not_unknown))

    any_fail = sorted(name for name, status in gates.items() if status == "FAIL")
    if any_fail:
        errors.append("readiness_contains_fail:" + ",".join(any_fail))

    return {
        "kind": "production_like_evidence_validation",
        "status": "ok" if not errors else "blocked",
        "technical_gates": len(TECHNICAL_GATES),
        "manual_gates": len(MANUAL_GATES),
        "errors": errors,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate disposable production-like RISOLVI evidence")
    parser.add_argument("--preflight", required=True)
    parser.add_argument("--smoke", required=True)
    parser.add_argument("--readiness", required=True)
    parser.add_argument("--expected-commit")
    parser.add_argument("--expected-version")
    args = parser.parse_args()

    report = validate(
        _load(args.preflight),
        _load(args.smoke),
        _load(args.readiness),
        expected_commit=args.expected_commit,
        expected_version=args.expected_version,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    raise SystemExit(0 if report["status"] == "ok" else 1)


if __name__ == "__main__":
    main()
