from app.document_evaluation import evaluate_suite


def test_document_extraction_gold_suite_passes_all_gates():
    report = evaluate_suite()
    assert report["gate_pass"] is True, report
    assert report["failed"] == 0
    assert report["provenance_percent"] == 100.0
    assert report["explicit_null_percent"] == 100.0
    assert report["conflict_percent"] == 100.0
    assert report["methods"]["CLIENT_OCR"] >= 1
    assert report["methods"]["CLIENT_PDF_TEXT"] >= 1
    assert report["methods"]["PLAIN_TEXT"] >= 1
