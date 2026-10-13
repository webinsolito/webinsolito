from app.production_like_evidence import MANUAL_GATES, TECHNICAL_GATES, validate


def technical_checks(names):
    return [{"name": name, "ok": True, "detail": "ok"} for name in names]


def make_artifacts():
    preflight = {
        "status": "ok",
        "environment": "production",
        "service_version": "0.14.0",
        "commit_sha": "a" * 40,
        "checks": technical_checks(["config", "database_ping", "database_schema", "malware_scanner", "private_storage"]),
    }
    smoke = {
        "status": "ok",
        "environment": "production",
        "service_version": "0.14.0",
        "commit_sha": "a" * 40,
        "checks": technical_checks([
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
        ]),
    }
    gates = [{"name": name, "status": "PASS", "detail": "ok"} for name in sorted(TECHNICAL_GATES)]
    gates += [{"name": name, "status": "UNKNOWN", "detail": "not_attested"} for name in sorted(MANUAL_GATES)]
    readiness = {
        "decision": "NO-GO",
        "environment": "production",
        "service_version": "0.14.0",
        "commit_sha": "a" * 40,
        "gates": gates,
    }
    return preflight, smoke, readiness


def test_disposable_stack_requires_technical_pass_and_manual_unknown():
    preflight, smoke, readiness = make_artifacts()
    report = validate(
        preflight,
        smoke,
        readiness,
        expected_commit="a" * 40,
        expected_version="0.14.0",
    )
    assert report == {
        "kind": "production_like_evidence_validation",
        "status": "ok",
        "technical_gates": len(TECHNICAL_GATES),
        "manual_gates": len(MANUAL_GATES),
        "errors": [],
    }


def test_validator_blocks_if_manual_gate_is_falsely_promoted():
    preflight, smoke, readiness = make_artifacts()
    for gate in readiness["gates"]:
        if gate["name"] == "legal_signoff":
            gate["status"] = "PASS"
    report = validate(preflight, smoke, readiness)
    assert report["status"] == "blocked"
    assert "manual_gates_must_stay_unknown:legal_signoff" in report["errors"]


def test_validator_blocks_release_identity_mismatch():
    preflight, smoke, readiness = make_artifacts()
    smoke["commit_sha"] = "b" * 40
    report = validate(preflight, smoke, readiness)
    assert report["status"] == "blocked"
    assert "release_commit_identity_mismatch" in report["errors"]


def test_validator_blocks_technical_unknown_even_with_no_go():
    preflight, smoke, readiness = make_artifacts()
    for gate in readiness["gates"]:
        if gate["name"] == "malware_scanner":
            gate["status"] = "UNKNOWN"
    report = validate(preflight, smoke, readiness)
    assert report["status"] == "blocked"
    assert "technical_gates_not_pass:malware_scanner" in report["errors"]
