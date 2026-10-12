from datetime import date

from app.models import CaseFacts, CaseStatus, Problem
from app.rule_engine import analyse

TODAY = date(2026, 10, 12)


def base(**kwargs):
    values = dict(problem=Problem.DEFECT,consumer=True,professional_seller=True,seller_country="IT",distance_purchase=True,physical_good=True,delivery_date=date(2026, 9, 4))
    values.update(kwargs)
    return CaseFacts(**values)


def test_defect_within_year_routes_to_guarantee():
    r = analyse(base(), today=TODAY)
    assert r.status == CaseStatus.ACTIONABLE
    assert r.route == "LEGAL_GUARANTEE"
    assert "seller_is_primary_counterparty" in r.allowed_claims
    assert "first_year_presumption_may_apply" in r.allowed_claims


def test_business_purchase_is_unsupported():
    r = analyse(base(consumer=False), today=TODAY)
    assert r.status == CaseStatus.UNSUPPORTED


def test_withdrawal_exception_fails_closed():
    f = base(problem=Problem.WITHDRAWAL, customised=True)
    r = analyse(f, today=TODAY)
    assert r.status == CaseStatus.NEEDS_INFORMATION
    assert r.route == "WITHDRAWAL_EXCEPTION_REVIEW"


def test_withdrawal_after_14_days_is_not_auto_approved():
    f = base(problem=Problem.WITHDRAWAL, delivery_date=date(2026, 9, 1))
    r = analyse(f, today=TODAY)
    assert r.status == CaseStatus.NEEDS_INFORMATION
    assert r.route == "WITHDRAWAL_LATE_REVIEW"


def test_non_delivery_needs_promised_date():
    f = base(problem=Problem.NOT_DELIVERED, delivery_date=None, promised_delivery_date=None)
    r = analyse(f, today=TODAY)
    assert r.status == CaseStatus.NEEDS_INFORMATION
    assert "promised_delivery_date" in r.missing_facts
