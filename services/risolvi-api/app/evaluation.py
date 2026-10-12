from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from evals.gold_cases import GOLD_CASES

from .models import CaseFacts
from .rule_engine import analyse

ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = ROOT / "evals" / "registry.json"
MANIFEST_PATH = ROOT / "evals" / "manifest.json"


class EvaluationError(RuntimeError):
    pass


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def canonical_dataset_sha256(cases: list[dict[str, Any]] | None = None) -> str:
    cases = cases or GOLD_CASES
    payload = "\n".join(
        json.dumps(case, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        for case in cases
    ) + "\n"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def derive_action(status: str, route: str | None, missing_facts: list[str]) -> str:
    if status == "ACTIONABLE":
        return {
            "LEGAL_GUARANTEE": "prepare_seller_guarantee_request",
            "WITHDRAWAL": "prepare_withdrawal_notice",
            "DELIVERY": "prepare_delivery_notice",
        }.get(route, "manual_review")
    if status == "UNSUPPORTED":
        return "decline_automatic_route"
    if status == "NEEDS_INFORMATION":
        if missing_facts:
            return "ask_missing_fact"
        if route in {
            "LEGAL_GUARANTEE_REVIEW",
            "WITHDRAWAL_EXCEPTION_REVIEW",
            "WITHDRAWAL_LATE_REVIEW",
        }:
            return "manual_review"
        if route == "DELIVERY":
            return "wait_until_promised_date"
    return "manual_review"


def _rule_temporally_valid(rule: dict[str, Any], as_of: date) -> bool:
    start = date.fromisoformat(rule["valid_from"])
    end_raw = rule.get("valid_to")
    end = date.fromisoformat(end_raw) if end_raw else None
    return as_of >= start and (end is None or as_of <= end)


def _validate_dataset_shape(cases: list[dict[str, Any]], manifest: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    if len(cases) != manifest["case_count"]:
        problems.append(f"case_count:{len(cases)}!={manifest['case_count']}")

    ids = [case.get("id") for case in cases]
    if len(ids) != len(set(ids)):
        problems.append("duplicate_case_ids")

    required_top = {
        "id", "dataset_version", "as_of", "category", "severity", "title",
        "facts", "expected", "tags", "review",
    }
    required_expected = {
        "status", "route", "missing_facts", "rule_ids", "source_ids",
        "expected_action", "allowed_claims_contains", "prohibited_claims",
    }
    for case in cases:
        missing_top = required_top - set(case)
        if missing_top:
            problems.append(f"{case.get('id','?')}:missing_top:{','.join(sorted(missing_top))}")
        expected = case.get("expected", {})
        missing_expected = required_expected - set(expected)
        if missing_expected:
            problems.append(
                f"{case.get('id','?')}:missing_expected:{','.join(sorted(missing_expected))}"
            )
        if case.get("severity") not in {"S0", "S1", "S2", "S3", "S4"}:
            problems.append(f"{case.get('id','?')}:invalid_severity")
        if case.get("review", {}).get("technical") != "approved":
            problems.append(f"{case.get('id','?')}:technical_review_not_approved")

    category_counts = Counter(case["category"] for case in cases)
    if dict(category_counts) != manifest["category_distribution"]:
        problems.append(
            f"category_distribution:{dict(category_counts)}!={manifest['category_distribution']}"
        )

    severity_counts = Counter(case["severity"] for case in cases)
    normalized_severity = {level: severity_counts.get(level, 0) for level in ["S0", "S1", "S2", "S3", "S4"]}
    if normalized_severity != manifest["severity_distribution"]:
        problems.append(
            f"severity_distribution:{normalized_severity}!={manifest['severity_distribution']}"
        )

    checksum = canonical_dataset_sha256(cases)
    if checksum != manifest["canonical_sha256"]:
        problems.append(f"checksum:{checksum}!={manifest['canonical_sha256']}")
    return problems


def evaluate_suite() -> dict[str, Any]:
    registry = _load_json(REGISTRY_PATH)
    manifest = _load_json(MANIFEST_PATH)
    cases = GOLD_CASES

    dataset_problems = _validate_dataset_shape(cases, manifest)
    source_registry = registry["sources"]
    rule_registry = registry["rules"]

    failures: list[dict[str, Any]] = []
    by_category: dict[str, dict[str, int]] = defaultdict(lambda: {"passed": 0, "failed": 0})
    by_severity: dict[str, dict[str, int]] = defaultdict(lambda: {"passed": 0, "failed": 0})
    temporal_checks = 0
    temporal_passed = 0
    source_checks = 0
    source_passed = 0

    for case in cases:
        case_id = case["id"]
        as_of = date.fromisoformat(case["as_of"])
        expected = case["expected"]
        facts = CaseFacts(**case["facts"])
        recommendation = analyse(facts, today=as_of)

        actual = {
            "status": recommendation.status.value,
            "route": recommendation.route,
            "missing_facts": recommendation.missing_facts,
            "rule_ids": recommendation.rule_ids,
            "source_ids": recommendation.source_ids,
            "allowed_claims": recommendation.allowed_claims,
            "action": derive_action(
                recommendation.status.value,
                recommendation.route,
                recommendation.missing_facts,
            ),
        }

        mismatches: list[str] = []
        exact_fields = ["status", "route", "missing_facts", "rule_ids", "source_ids"]
        for field in exact_fields:
            if actual[field] != expected[field]:
                mismatches.append(f"{field}: expected={expected[field]!r} actual={actual[field]!r}")

        if actual["action"] != expected["expected_action"]:
            mismatches.append(
                f"action: expected={expected['expected_action']!r} actual={actual['action']!r}"
            )

        missing_allowed = [
            claim for claim in expected["allowed_claims_contains"]
            if claim not in recommendation.allowed_claims
        ]
        if missing_allowed:
            mismatches.append(f"allowed_claims_missing:{missing_allowed}")

        leaked_claims = sorted(
            set(expected["prohibited_claims"]) & set(recommendation.allowed_claims)
        )
        if leaked_claims:
            mismatches.append(f"prohibited_claims_present:{leaked_claims}")

        rendered_text = "\n".join(
            part for part in [recommendation.title, recommendation.explanation, recommendation.draft]
            if part
        )
        forbidden_substrings = expected.get("prohibited_substrings", [])
        for substring in forbidden_substrings:
            if substring in rendered_text:
                mismatches.append(f"prohibited_substring_present:{substring!r}")

        max_draft_chars = expected.get("max_draft_chars")
        if max_draft_chars is not None and len(recommendation.draft or "") > max_draft_chars:
            mismatches.append(
                f"draft_too_long:{len(recommendation.draft or '')}>{max_draft_chars}"
            )

        # Source coverage checks: every actual/expected source must exist.
        for source_id in sorted(set(expected["source_ids"]) | set(recommendation.source_ids)):
            source_checks += 1
            if source_id in source_registry:
                source_passed += 1
            else:
                mismatches.append(f"unknown_source:{source_id}")

        # Temporal checks: every referenced rule must exist, be valid on as_of,
        # and its declared source set must cover the recommendation sources.
        for rule_id in sorted(set(expected["rule_ids"]) | set(recommendation.rule_ids)):
            temporal_checks += 1
            rule = rule_registry.get(rule_id)
            if rule is None:
                mismatches.append(f"unknown_rule:{rule_id}")
                continue
            if not _rule_temporally_valid(rule, as_of):
                mismatches.append(f"rule_outside_validity:{rule_id}@{as_of.isoformat()}")
                continue
            temporal_passed += 1
            undeclared_sources = set(recommendation.source_ids) - set(rule.get("source_ids", []))
            if undeclared_sources:
                mismatches.append(
                    f"rule_source_mismatch:{rule_id}:{sorted(undeclared_sources)}"
                )

        bucket = by_category[case["category"]]
        severity_bucket = by_severity[case["severity"]]
        if mismatches:
            bucket["failed"] += 1
            severity_bucket["failed"] += 1
            failures.append({
                "id": case_id,
                "severity": case["severity"],
                "category": case["category"],
                "mismatches": mismatches,
            })
        else:
            bucket["passed"] += 1
            severity_bucket["passed"] += 1

    critical_failures = sum(
        1 for failure in failures if failure["severity"] in {"S0", "S1"}
    )
    temporal_percent = 100.0 if temporal_checks == 0 else round(
        temporal_passed / temporal_checks * 100, 3
    )
    source_percent = 100.0 if source_checks == 0 else round(
        source_passed / source_checks * 100, 3
    )

    report = {
        "dataset_version": manifest["dataset_version"],
        "dataset_sha256": canonical_dataset_sha256(cases),
        "total": len(cases),
        "passed": len(cases) - len(failures),
        "failed": len(failures),
        "critical_failures_S0_S1": critical_failures,
        "temporal_validity_percent": temporal_percent,
        "source_coverage_percent": source_percent,
        "dataset_problems": dataset_problems,
        "by_category": dict(sorted(by_category.items())),
        "by_severity": dict(sorted(by_severity.items())),
        "failures": failures,
    }
    gate = manifest["gate"]
    report["gate_pass"] = (
        not dataset_problems
        and critical_failures == gate["critical_failures_S0_S1"]
        and temporal_percent == float(gate["temporal_validity_percent"])
        and source_percent == float(gate["source_coverage_percent"])
        and len(failures) == 0
    )
    return report


def dump_jsonl(path: Path) -> None:
    payload = "\n".join(
        json.dumps(case, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        for case in GOLD_CASES
    ) + "\n"
    path.write_text(payload, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the RISOLVI deterministic gold-case evaluation suite")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero unless every gate and every case passes")
    parser.add_argument("--dump-jsonl", type=Path, help="Materialize the versioned generated dataset as JSONL")
    args = parser.parse_args()

    if args.dump_jsonl:
        dump_jsonl(args.dump_jsonl)

    report = evaluate_suite()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.strict and not report["gate_pass"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
