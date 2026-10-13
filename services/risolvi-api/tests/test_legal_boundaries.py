from datetime import date

from app.models import CaseFacts, CaseStatus, Problem
from app.rule_engine import analyse


def base(**kwargs):
    values = dict(
        problem=Problem.DEFECT,
        consumer=True,
        professional_seller=True,
        seller_country="IT",
        distance_purchase=True,
        physical_good=True,
        delivery_date=date(2025, 10, 22),
        seller_name="Negozio Test",
    )
    values.update(kwargs)
    return CaseFacts(**values)


def test_guarantee_rulepack_fails_closed_on_2026_cutover():
    recommendation = analyse(base(), today=date(2026, 10, 22))
    assert recommendation.status == CaseStatus.NEEDS_INFORMATION
    assert recommendation.route == "LEGAL_RULEPACK_REVIEW_2026_10_22"
    assert recommendation.rule_ids == ["IT-GUARANTEE-SELLER-001:v1"]
    assert recommendation.source_ids == ["NORMATTIVA-DLGS176-2026"]
    assert recommendation.draft is None
    assert recommendation.allowed_claims == []


def test_calendar_one_year_boundary_is_not_approximated():
    recommendation = analyse(
        base(
            delivery_date=date(2025, 10, 12),
            defect_manifested_date=date(2026, 10, 12),
        ),
        today=date(2026, 10, 12),
    )
    assert recommendation.status == CaseStatus.ACTIONABLE
    assert "first_year_presumption_may_apply" in recommendation.allowed_claims


def test_leap_day_anniversary_is_guarded_by_calendar():
    recommendation = analyse(
        base(
            delivery_date=date(2024, 2, 29),
            defect_manifested_date=date(2025, 2, 28),
        ),
        today=date(2025, 2, 28),
    )
    assert recommendation.status == CaseStatus.ACTIONABLE
    assert "first_year_presumption_may_apply" in recommendation.allowed_claims


def test_delivery_uses_30_day_fallback_when_no_specific_term_is_known():
    facts = CaseFacts(
        problem=Problem.NOT_DELIVERED,
        consumer=True,
        professional_seller=True,
        seller_country="IT",
        distance_purchase=True,
        physical_good=True,
        order_date=date(2026, 9, 1),
        promised_delivery_date=None,
    )
    recommendation = analyse(facts, today=date(2026, 10, 13))
    assert recommendation.status == CaseStatus.ACTIONABLE
    assert recommendation.route == "DELIVERY"
    assert "additional_period_may_be_required_before_termination" in recommendation.allowed_claims
    assert "rimborso immediato" in recommendation.explanation
    assert "termine supplementare" in (recommendation.draft or "")
