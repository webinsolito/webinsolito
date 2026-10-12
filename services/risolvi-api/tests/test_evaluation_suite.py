from collections import Counter

from app.evaluation import canonical_dataset_sha256, evaluate_suite
from evals.gold_cases import GOLD_CASES


EXPECTED_SHA256 = "541edb3632a273239735e9cd1e04c589b1ab5a0097298aaac0a0a7f29b288d9e"


def test_gold_dataset_is_versioned_and_has_exactly_200_unique_cases():
    assert len(GOLD_CASES) == 200
    assert len({case["id"] for case in GOLD_CASES}) == 200
    assert canonical_dataset_sha256() == EXPECTED_SHA256
    assert Counter(case["category"] for case in GOLD_CASES) == {
        "guarantee": 70,
        "delivery": 40,
        "withdrawal": 45,
        "out-of-scope": 25,
        "adversarial": 20,
    }


def test_gold_cases_are_synthetic_and_not_legal_signoff():
    for case in GOLD_CASES:
        assert case["review"]["technical"] == "approved"
        assert case["review"]["legal"] == "pending"
        assert case["dataset_version"] == "1.0"


def test_rule_engine_passes_entire_gold_suite():
    report = evaluate_suite()
    assert report["dataset_problems"] == []
    assert report["total"] == 200
    assert report["passed"] == 200
    assert report["failed"] == 0
    assert report["failures"] == []
    assert report["gate_pass"] is True


def test_critical_temporal_and_source_gates_are_strict():
    report = evaluate_suite()
    assert report["critical_failures_S0_S1"] == 0
    assert report["temporal_validity_percent"] == 100.0
    assert report["source_coverage_percent"] == 100.0
