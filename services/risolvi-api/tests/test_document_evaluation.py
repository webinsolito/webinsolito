from app.document_evaluation import evaluate_suite


def test_document_extraction_gold_suite_passes_all_gates():
    report = evaluate_suite()
    diagnostic = {
        "dataset_problems": report["dataset_problems"],
        "failures": report["failures"],
        "provenance_percent": report["provenance_percent"],
        "explicit_null_percent": report["explicit_null_percent"],
        "conflict_percent": report["conflict_percent"],
        "methods": report["methods"],
    }
    assert report["gate_pass"] is True, diagnostic
    assert report["failed"] == 0, report["failures"]
    assert report["provenance_percent"] == 100.0, report["failures"]
    assert report["explicit_null_percent"] == 100.0, report["failures"]
    assert report["conflict_percent"] == 100.0, report["failures"]
    assert report["methods"]["CLIENT_OCR"] >= 1
    assert report["methods"]["CLIENT_PDF_TEXT"] >= 1
    assert report["methods"]["PLAIN_TEXT"] >= 1
