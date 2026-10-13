from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

from .document_pipeline import build_bundle, parse_client_document
from .models import ClientExtractedDocument, FactStatus

ROOT = Path(__file__).resolve().parent.parent
DATASET_PATH = ROOT / "evals" / "document_gold.json"


def _load_cases() -> list[dict[str, Any]]:
    data = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("document_gold_must_be_array")
    return data


def dataset_sha256(cases: list[dict[str, Any]]) -> str:
    canonical = json.dumps(cases, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _candidate_for(bundle, key: str, expected_value: Any):
    for candidate in bundle.candidates:
        if candidate.key == key and candidate.value == expected_value:
            return candidate
    return None


def evaluate_suite() -> dict[str, Any]:
    cases = _load_cases()
    failures: list[dict[str, Any]] = []
    provenance_checks = 0
    provenance_passed = 0
    null_checks = 0
    null_passed = 0
    conflict_checks = 0
    conflict_passed = 0
    method_counts: Counter[str] = Counter()

    ids = [case.get("id") for case in cases]
    dataset_problems: list[str] = []
    if any(not isinstance(case_id, str) or not case_id for case_id in ids):
        dataset_problems.append("case_id_missing")
    if len(ids) != len(set(ids)):
        dataset_problems.append("duplicate_case_ids")

    required = {"id", "documents", "expected_facts", "expected_null", "expected_conflicts", "expected_warnings", "provenance"}
    for case in cases:
        missing = required - set(case)
        if missing:
            dataset_problems.append(f"{case.get('id', '?')}:missing:{','.join(sorted(missing))}")

    for case in cases:
        case_id = case.get("id", "?")
        mismatches: list[str] = []
        try:
            documents = [ClientExtractedDocument(**item) for item in case["documents"]]
            parsed = [parse_client_document(document) for document in documents]
            bundle = build_bundle(parsed)
        except Exception as exc:
            failures.append({"id": case_id, "mismatches": [f"exception:{type(exc).__name__}:{exc}"]})
            continue

        for document in documents:
            if document.pages:
                method_counts.update(page.method.value for page in document.pages)
            else:
                method_counts[document.method.value] += 1

        for key, expected in case["expected_facts"].items():
            actual = bundle.structured_facts.get(key)
            if actual != expected:
                mismatches.append(f"fact:{key}:expected={expected!r}:actual={actual!r}")

        for key in case["expected_null"]:
            null_checks += 1
            if bundle.structured_facts.get(key) is None:
                null_passed += 1
            else:
                mismatches.append(f"expected_null:{key}:actual={bundle.structured_facts.get(key)!r}")

        actual_conflicts = sorted(bundle.conflicts)
        expected_conflicts = sorted(case["expected_conflicts"])
        conflict_checks += 1
        if actual_conflicts == expected_conflicts:
            conflict_passed += 1
        else:
            mismatches.append(f"conflicts:expected={expected_conflicts!r}:actual={actual_conflicts!r}")

        for key in expected_conflicts:
            if key in bundle.prefill:
                mismatches.append(f"conflict_prefilled:{key}")
            conflict_candidates = [candidate for candidate in bundle.candidates if candidate.key == key]
            if not conflict_candidates:
                mismatches.append(f"conflict_candidates_missing:{key}")
            elif any(candidate.status is not FactStatus.CONFLICT for candidate in conflict_candidates):
                mismatches.append(f"conflict_status_not_marked:{key}")

        for warning in case["expected_warnings"]:
            if warning not in bundle.warnings:
                mismatches.append(f"warning_missing:{warning}")

        for key in case.get("forbidden_prefill", []):
            if key in bundle.prefill:
                mismatches.append(f"forbidden_prefill:{key}")

        for key, expected_evidence in case["provenance"].items():
            provenance_checks += 1
            expected_value = case["expected_facts"].get(key)
            candidate = _candidate_for(bundle, key, expected_value)
            if candidate is None:
                mismatches.append(f"provenance_candidate_missing:{key}")
                continue
            matched = False
            for evidence in candidate.evidence:
                if (
                    evidence.filename == expected_evidence["filename"]
                    and evidence.page == expected_evidence["page"]
                    and evidence.method.value == expected_evidence["method"]
                    and bool(evidence.document_id)
                    and bool(evidence.span)
                ):
                    matched = True
                    break
            if matched:
                provenance_passed += 1
            else:
                mismatches.append(
                    f"provenance:{key}:expected={expected_evidence!r}:actual="
                    f"{[item.model_dump(mode='json') for item in candidate.evidence]!r}"
                )

        if mismatches:
            failures.append({"id": case_id, "mismatches": mismatches})

    total = len(cases)
    passed = total - len(failures)
    provenance_percent = 100.0 if provenance_checks == 0 else round(provenance_passed / provenance_checks * 100, 3)
    null_percent = 100.0 if null_checks == 0 else round(null_passed / null_checks * 100, 3)
    conflict_percent = 100.0 if conflict_checks == 0 else round(conflict_passed / conflict_checks * 100, 3)

    gate_pass = (
        not dataset_problems
        and not failures
        and provenance_percent == 100.0
        and null_percent == 100.0
        and conflict_percent == 100.0
    )
    return {
        "dataset": "document_gold",
        "dataset_sha256": dataset_sha256(cases),
        "total": total,
        "passed": passed,
        "failed": len(failures),
        "provenance_checks": provenance_checks,
        "provenance_percent": provenance_percent,
        "explicit_null_checks": null_checks,
        "explicit_null_percent": null_percent,
        "conflict_cases_checked": conflict_checks,
        "conflict_percent": conflict_percent,
        "methods": dict(sorted(method_counts.items())),
        "dataset_problems": dataset_problems,
        "failures": failures,
        "gate_pass": gate_pass,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the RISOLVI structured document extraction gold suite")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero unless every document extraction gate passes")
    args = parser.parse_args()

    report = evaluate_suite()
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    if args.strict and not report["gate_pass"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
