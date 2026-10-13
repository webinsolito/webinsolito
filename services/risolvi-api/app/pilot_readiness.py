from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from enum import StrEnum
from pathlib import Path
from typing import Any


REPORT_SCHEMA = 1
DEFAULT_MAX_ARTIFACT_AGE_HOURS = 24
SAFE_ID = re.compile(r"^[A-Za-z0-9._:#/-]{3,160}$")
SAFE_ACTOR = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")
HEX_SHA = re.compile(r"^[0-9a-f]{7,64}$")


class GateStatus(StrEnum):
    PASS = "PASS"
    FAIL = "FAIL"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True, slots=True)
class Gate:
    name: str
    status: GateStatus
    detail: str


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _digest(value: dict[str, Any] | None) -> str | None:
    if value is None:
        return None
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _load_optional(path: str | None) -> dict[str, Any] | None:
    if not path:
        return None
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("readiness_input_must_be_json_object")
    return value


def _checks(report: dict[str, Any] | None) -> dict[str, bool]:
    if not report:
        return {}
    result: dict[str, bool] = {}
    raw = report.get("checks")
    if not isinstance(raw, list):
        return result
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if isinstance(name, str):
            if "ok" in item:
                result[name] = bool(item.get("ok"))
            elif item.get("status") in {"PASS", "FAIL"}:
                result[name] = item.get("status") == "PASS"
    return result


def _technical_gate(
    name: str,
    report: dict[str, Any] | None,
    required_checks: tuple[str, ...],
    *,
    success_detail: str,
) -> Gate:
    if report is None:
        return Gate(name, GateStatus.UNKNOWN, "artifact_missing")
    if report.get("status") not in {"ok", "GO"}:
        return Gate(name, GateStatus.FAIL, "artifact_blocked")
    checks = _checks(report)
    missing = [check for check in required_checks if check not in checks]
    if missing:
        return Gate(name, GateStatus.UNKNOWN, "required_check_missing")
    if not all(checks[check] for check in required_checks):
        return Gate(name, GateStatus.FAIL, "required_check_failed")
    return Gate(name, GateStatus.PASS, success_detail)


def _manual_gate(manifest: dict[str, Any] | None, key: str) -> Gate:
    if manifest is None:
        return Gate(key, GateStatus.UNKNOWN, "evidence_manifest_missing")
    gates = manifest.get("gates")
    if not isinstance(gates, dict) or not isinstance(gates.get(key), dict):
        return Gate(key, GateStatus.UNKNOWN, "evidence_missing")
    item = gates[key]
    raw_status = item.get("status")
    if raw_status not in {status.value for status in GateStatus}:
        return Gate(key, GateStatus.FAIL, "evidence_status_invalid")
    status = GateStatus(raw_status)
    if status is GateStatus.UNKNOWN:
        return Gate(key, status, "not_attested")
    if status is GateStatus.FAIL:
        return Gate(key, status, "attested_failed")

    reference_id = item.get("reference_id")
    reviewed_by = item.get("reviewed_by")
    reviewed_at = _parse_timestamp(item.get("reviewed_at"))
    if not isinstance(reference_id, str) or not SAFE_ID.fullmatch(reference_id):
        return Gate(key, GateStatus.FAIL, "pass_evidence_reference_invalid")
    if not isinstance(reviewed_by, str) or not SAFE_ACTOR.fullmatch(reviewed_by):
        return Gate(key, GateStatus.FAIL, "pass_evidence_reviewer_invalid")
    if reviewed_at is None:
        return Gate(key, GateStatus.FAIL, "pass_evidence_timestamp_invalid")
    if reviewed_at > _utcnow() + timedelta(minutes=5):
        return Gate(key, GateStatus.FAIL, "pass_evidence_timestamp_in_future")
    return Gate(key, GateStatus.PASS, f"attested:{reference_id}:{reviewed_by}:{_iso(reviewed_at)}")


def _artifact_freshness(
    preflight: dict[str, Any] | None,
    smoke: dict[str, Any] | None,
    *,
    now: datetime,
    max_age_hours: int,
) -> Gate:
    if preflight is None or smoke is None:
        return Gate("artifact_freshness", GateStatus.UNKNOWN, "technical_artifact_missing")
    timestamps = [_parse_timestamp(preflight.get("generated_at")), _parse_timestamp(smoke.get("generated_at"))]
    if any(item is None for item in timestamps):
        return Gate("artifact_freshness", GateStatus.UNKNOWN, "generated_at_missing_or_invalid")
    assert all(item is not None for item in timestamps)
    max_age = timedelta(hours=max_age_hours)
    if any(item > now + timedelta(minutes=5) for item in timestamps):
        return Gate("artifact_freshness", GateStatus.FAIL, "artifact_timestamp_in_future")
    if any(now - item > max_age for item in timestamps):
        return Gate("artifact_freshness", GateStatus.FAIL, "artifact_stale")
    return Gate("artifact_freshness", GateStatus.PASS, f"artifacts_within_{max_age_hours}h")


def _build_identity(preflight: dict[str, Any] | None, smoke: dict[str, Any] | None) -> tuple[Gate, str]:
    if preflight is None or smoke is None:
        return Gate("build_identity", GateStatus.UNKNOWN, "technical_artifact_missing"), "unknown"
    left = str(preflight.get("commit_sha", "")).strip().lower()
    right = str(smoke.get("commit_sha", "")).strip().lower()
    if not left or left == "unknown" or not right or right == "unknown":
        return Gate("build_identity", GateStatus.UNKNOWN, "commit_sha_unknown"), "unknown"
    if not HEX_SHA.fullmatch(left) or not HEX_SHA.fullmatch(right):
        return Gate("build_identity", GateStatus.FAIL, "commit_sha_invalid"), "unknown"
    if left != right:
        return Gate("build_identity", GateStatus.FAIL, "preflight_smoke_commit_mismatch"), "unknown"
    return Gate("build_identity", GateStatus.PASS, "same_commit_preflight_and_smoke"), left


def _artifact_consistency(preflight: dict[str, Any] | None, smoke: dict[str, Any] | None) -> tuple[Gate, str, str]:
    if preflight is None or smoke is None:
        return Gate("artifact_consistency", GateStatus.UNKNOWN, "technical_artifact_missing"), "unknown", "unknown"
    preflight_version = str(preflight.get("service_version", "unknown"))
    smoke_version = str(smoke.get("service_version", "unknown"))
    preflight_env = str(preflight.get("environment", "unknown"))
    smoke_env = str(smoke.get("environment", "unknown"))
    if "unknown" in {preflight_version, smoke_version, preflight_env, smoke_env}:
        return Gate("artifact_consistency", GateStatus.UNKNOWN, "version_or_environment_unknown"), preflight_env, preflight_version
    if preflight_version != smoke_version:
        return Gate("artifact_consistency", GateStatus.FAIL, "service_version_mismatch"), preflight_env, preflight_version
    if preflight_env != smoke_env:
        return Gate("artifact_consistency", GateStatus.FAIL, "environment_mismatch"), preflight_env, preflight_version
    if preflight_env != "production":
        return Gate("artifact_consistency", GateStatus.FAIL, "environment_not_production"), preflight_env, preflight_version
    return Gate("artifact_consistency", GateStatus.PASS, "same_production_release"), preflight_env, preflight_version


def build_report(
    *,
    preflight: dict[str, Any] | None,
    smoke: dict[str, Any] | None,
    evidence: dict[str, Any] | None,
    now: datetime | None = None,
    max_age_hours: int = DEFAULT_MAX_ARTIFACT_AGE_HOURS,
) -> dict[str, Any]:
    if max_age_hours < 1 or max_age_hours > 168:
        raise ValueError("max_age_hours_must_be_between_1_and_168")
    now = (now or _utcnow()).astimezone(timezone.utc)

    identity_gate, commit_sha = _build_identity(preflight, smoke)
    consistency_gate, environment, service_version = _artifact_consistency(preflight, smoke)

    gates: list[Gate] = [
        identity_gate,
        consistency_gate,
        _artifact_freshness(preflight, smoke, now=now, max_age_hours=max_age_hours),
        _manual_gate(evidence, "dedicated_infrastructure"),
        _technical_gate("production_config", preflight, ("config",), success_detail="production_config_valid"),
        _technical_gate("migrations", preflight, ("database_schema",), success_detail="alembic_schema_present"),
        _technical_gate("database", preflight, ("database_ping",), success_detail="database_reachable"),
        _technical_gate("private_storage", preflight, ("private_storage",), success_detail="storage_roundtrip_delete_verified"),
        _technical_gate("malware_scanner", preflight, ("malware_scanner",), success_detail="clean_and_detection_paths_verified"),
        _technical_gate("health", smoke, ("health",), success_detail="health_200"),
        _technical_gate("ready", smoke, ("ready",), success_detail="ready_200"),
        _technical_gate("synthetic_upload", smoke, ("upload_document",), success_detail="synthetic_original_accepted"),
        _technical_gate(
            "extraction",
            smoke,
            ("extract_document", "extraction_provenance"),
            success_detail="structured_extraction_with_provenance",
        ),
        _technical_gate("consent", smoke, ("pilot_consent",), success_detail="pilot_consent_recorded"),
        _technical_gate(
            "human_review",
            smoke,
            ("review_decision", "reviewer_attribution"),
            success_detail="reviewer_decision_attributed",
        ),
        _technical_gate(
            "action_hidden_before_review",
            smoke,
            ("action_hidden_before_review",),
            success_detail="no_action_before_review",
        ),
        _technical_gate("outcome", smoke, ("record_outcome",), success_detail="synthetic_outcome_recorded"),
    ]

    delete_smoke = _technical_gate(
        "delete_db_blob",
        smoke,
        ("delete_case", "deleted_case_unreachable"),
        success_detail="case_delete_verified",
    )
    storage_delete = next((gate for gate in gates if gate.name == "private_storage"), None)
    if delete_smoke.status is GateStatus.PASS and storage_delete and storage_delete.status is GateStatus.PASS:
        gates.append(Gate("delete_db_blob", GateStatus.PASS, "case_delete_plus_storage_delete_semantics_verified"))
    elif delete_smoke.status is GateStatus.FAIL or (storage_delete and storage_delete.status is GateStatus.FAIL):
        gates.append(Gate("delete_db_blob", GateStatus.FAIL, "delete_verification_failed"))
    else:
        gates.append(Gate("delete_db_blob", GateStatus.UNKNOWN, "delete_verification_incomplete"))

    gates.extend(
        [
            _manual_gate(evidence, "legal_signoff"),
            _manual_gate(evidence, "privacy_security"),
            _manual_gate(evidence, "document_pipeline"),
        ]
    )

    decision = "GO" if gates and all(gate.status is GateStatus.PASS for gate in gates) else "NO-GO"
    environment_id = "unknown"
    if isinstance(evidence, dict):
        candidate = evidence.get("environment_id")
        if isinstance(candidate, str) and SAFE_ID.fullmatch(candidate):
            environment_id = candidate

    return {
        "schema": REPORT_SCHEMA,
        "kind": "pilot_readiness",
        "generated_at": _iso(now),
        "decision": decision,
        "environment": environment,
        "environment_id": environment_id,
        "service_version": service_version,
        "commit_sha": commit_sha,
        "inputs": {
            "preflight_sha256": _digest(preflight),
            "smoke_sha256": _digest(smoke),
            "evidence_sha256": _digest(evidence),
        },
        "gates": [asdict(gate) for gate in gates],
    }


def render_markdown(report: dict[str, Any]) -> str:
    rows = [
        "# RISOLVI pilot readiness",
        "",
        f"- Decisione: **{report['decision']}**",
        f"- Generato: `{report['generated_at']}`",
        f"- Ambiente: `{report['environment']}` / `{report['environment_id']}`",
        f"- Versione: `{report['service_version']}`",
        f"- Commit: `{report['commit_sha']}`",
        "",
        "| Gate | Stato | Evidenza normalizzata |",
        "| --- | --- | --- |",
    ]
    for gate in report.get("gates", []):
        name = str(gate.get("name", "unknown")).replace("|", "/")
        status = str(gate.get("status", "UNKNOWN")).replace("|", "/")
        detail = str(gate.get("detail", "")).replace("|", "/")
        rows.append(f"| `{name}` | **{status}** | `{detail}` |")
    rows.extend(
        [
            "",
            "> `UNKNOWN` blocca il GO esattamente come `FAIL`. Il report contiene soltanto identificatori controllati e digest SHA-256 degli input; non incorpora token, documenti o testo utente.",
        ]
    )
    return "\n".join(rows) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Aggregate RISOLVI pilot evidence into a fail-closed GO/NO-GO report")
    parser.add_argument("--preflight", help="JSON report emitted by app.preflight")
    parser.add_argument("--smoke", help="JSON report emitted by app.remote_smoke")
    parser.add_argument("--evidence", help="Manual attestation JSON for dedicated infra/legal/privacy/pipeline gates")
    parser.add_argument("--json-out", help="Write canonical readiness JSON to this path")
    parser.add_argument("--markdown-out", help="Write a Markdown summary to this path")
    parser.add_argument("--max-age-hours", type=int, default=DEFAULT_MAX_ARTIFACT_AGE_HOURS)
    args = parser.parse_args()

    try:
        preflight = _load_optional(args.preflight)
        smoke = _load_optional(args.smoke)
        evidence = _load_optional(args.evidence)
        report = build_report(
            preflight=preflight,
            smoke=smoke,
            evidence=evidence,
            max_age_hours=args.max_age_hours,
        )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"schema": REPORT_SCHEMA, "kind": "pilot_readiness", "decision": "NO-GO", "error": type(exc).__name__}))
        raise SystemExit(1) from exc

    encoded = json.dumps(report, indent=2, sort_keys=True)
    markdown = render_markdown(report)
    if args.json_out:
        Path(args.json_out).write_text(encoded + "\n", encoding="utf-8")
    if args.markdown_out:
        Path(args.markdown_out).write_text(markdown, encoding="utf-8")
    print(encoded)
    raise SystemExit(0 if report["decision"] == "GO" else 1)


if __name__ == "__main__":
    main()
