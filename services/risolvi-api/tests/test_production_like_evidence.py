from app.production_like_evidence import MANUAL_GATES, TECHNICAL_GATES, validate


def technical_checks(names):
    return [{"name": name, "ok": True, "detail": "ok"} for name in names]


def make_artifacts():
    preflight = {
        "status": "ok",
        "environment": "production",
        "service_version": "0.15.0",
        "commit_sha": "a" * 40,
        "checks": technical_checks(["config", "database_ping", "database_schema", "malware_scanner", "private_storage"]),
    }
    smoke = {
        "status": "ok",
        "environment": "production",
        "service_version": "0.15.0",
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
        "service_version": "0.15.0",
        "commit_sha": "a" * 40,
        "gates": gates,
    }
    storage_cleanup = {
        "kind": "storage_cleanup",
        "status": "ok",
        "remaining_objects": 0,
        "public_access_block": True,
    }
    return preflight, smoke, readiness, storage_cleanup


def test_disposable_stack_requires_technical_pass_manual_unknown_and_clean_private_storage():
    preflight, smoke, readiness, storage_cleanup = make_artifacts()
    report = validate(
        preflight,
        smoke,
        readiness,
        storage_cleanup,
        expected_commit="a" * 40,
        expected_version="0.15.0",
    )
    assert report == {
        "kind": "production_like_evidence_validation",
        "status": "ok",
        "technical_gates": len(TECHNICAL_GATES),
        "manual_gates": len(MANUAL_GATES),
        "storage_cleanup_verified": True,
        "errors": [],
    }


def test_validator_blocks_if_manual_gate_is_falsely_promoted():
    preflight, smoke, readiness, storage_cleanup = make_artifacts()
    for gate in readiness["gates"]:
        if gate["name"] == "legal_signoff":
            gate["status"] = "PASS"
    report = validate(preflight, smoke, readiness, storage_cleanup)
    assert report["status"] == "blocked"
    assert "manual_gates_must_stay_unknown:legal_signoff" in report["errors"]


def test_validator_blocks_release_identity_mismatch():
    preflight, smoke, readiness, storage_cleanup = make_artifacts()
    smoke["commit_sha"] = "b" * 40
    report = validate(preflight, smoke, readiness, storage_cleanup)
    assert report["status"] == "blocked"
    assert "release_commit_identity_mismatch" in report["errors"]


def test_validator_blocks_technical_unknown_even_with_no_go():
    preflight, smoke, readiness, storage_cleanup = make_artifacts()
    for gate in readiness["gates"]:
        if gate["name"] == "malware_scanner":
            gate["status"] = "UNKNOWN"
    report = validate(preflight, smoke, readiness, storage_cleanup)
    assert report["status"] == "blocked"
    assert "technical_gates_not_pass:malware_scanner" in report["errors"]


def test_validator_blocks_if_storage_cleanup_leaves_objects():
    preflight, smoke, readiness, storage_cleanup = make_artifacts()
    storage_cleanup["remaining_objects"] = 1
    report = validate(preflight, smoke, readiness, storage_cleanup)
    assert report["status"] == "blocked"
    assert report["storage_cleanup_verified"] is False
    assert "storage_cleanup_objects_remaining" in report["errors"]


def test_validator_blocks_if_bucket_privacy_is_not_verified():
    preflight, smoke, readiness, storage_cleanup = make_artifacts()
    storage_cleanup["public_access_block"] = False
    report = validate(preflight, smoke, readiness, storage_cleanup)
    assert report["status"] == "blocked"
    assert report["storage_cleanup_verified"] is False
    assert "storage_public_access_block_not_verified" in report["errors"]
