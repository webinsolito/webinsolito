from __future__ import annotations

from datetime import date, timedelta
from typing import Any

CASE_AS_OF = date(2026, 10, 12)
DATASET_VERSION = "1.0"
LEGAL_REVIEW_NOTE = (
    "Synthetic technical benchmark; legal ground truth requires counsel review "
    "before unsupervised public launch."
)


def _base(problem: str, **overrides: Any) -> dict[str, Any]:
    facts: dict[str, Any] = {
        "problem": problem,
        "consumer": True,
        "professional_seller": True,
        "seller_country": "IT",
        "distance_purchase": True,
        "physical_good": True,
        "delivery_date": None,
        "promised_delivery_date": None,
        "seller_name": "Negozio Demo S.r.l.",
        "customised": False,
        "perishable": False,
        "sealed_hygiene_opened": False,
    }
    facts.update(overrides)
    return facts


def _expected(
    status: str,
    route: str | None = None,
    *,
    missing: list[str] | None = None,
    rules: list[str] | None = None,
    sources: list[str] | None = None,
    action: str | None = None,
    allowed: list[str] | None = None,
    prohibited: list[str] | None = None,
    prohibited_substrings: list[str] | None = None,
    max_draft_chars: int | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "status": status,
        "route": route,
        "missing_facts": missing or [],
        "rule_ids": rules or [],
        "source_ids": sources or [],
        "expected_action": action,
        "allowed_claims_contains": allowed or [],
        "prohibited_claims": prohibited or [],
    }
    if prohibited_substrings:
        result["prohibited_substrings"] = prohibited_substrings
    if max_draft_chars is not None:
        result["max_draft_chars"] = max_draft_chars
    return result


def _case(
    case_id: str,
    category: str,
    severity: str,
    title: str,
    facts: dict[str, Any],
    expected: dict[str, Any],
    tags: list[str],
) -> dict[str, Any]:
    return {
        "id": case_id,
        "dataset_version": DATASET_VERSION,
        "as_of": CASE_AS_OF.isoformat(),
        "category": category,
        "severity": severity,
        "title": title,
        "facts": facts,
        "expected": expected,
        "tags": tags,
        "review": {
            "technical": "approved",
            "legal": "pending",
            "note": LEGAL_REVIEW_NOTE,
        },
    }


def build_gold_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []

    # 70 guarantee cases -----------------------------------------------------
    idx = 1
    within_year = [
        5, 14, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300,
        330, 360, 3, 20, 75, 110, 160, 200, 250, 310, 340, 365,
    ]
    for days_ago in within_year:
        severity = "S0" if days_ago in {5, 365} else (
            "S1" if days_ago in {30, 180, 360} else "S2"
        )
        facts = _base(
            "defect",
            delivery_date=(CASE_AS_OF - timedelta(days=days_ago)).isoformat(),
            seller_name=f"Negozio Demo {idx} S.r.l.",
        )
        expected = _expected(
            "ACTIONABLE",
            "LEGAL_GUARANTEE",
            rules=["IT-GUARANTEE-SELLER-001:v0"],
            sources=["MIMIT-GARANZIA"],
            action="prepare_seller_guarantee_request",
            allowed=[
                "seller_is_primary_counterparty",
                "legal_guarantee_route_candidate",
                "first_year_presumption_may_apply",
            ],
            prohibited=[
                "guaranteed_refund",
                "manufacturer_is_primary_counterparty",
                "automatic_contract_termination",
            ],
        )
        cases.append(_case(
            f"GUA-{idx:03d}", "guarantee", severity,
            f"Difetto entro 12 mesi — {days_ago} giorni",
            facts, expected, ["defect", "within-12-months"],
        ))
        idx += 1

    between_years = [
        370, 390, 420, 450, 480, 510, 540, 570, 600, 630, 660,
        690, 700, 710, 720, 400, 500, 580, 650, 725,
    ]
    for days_ago in between_years:
        severity = "S1" if days_ago in {370, 725} else "S2"
        facts = _base(
            "defect",
            delivery_date=(CASE_AS_OF - timedelta(days=days_ago)).isoformat(),
            seller_name=f"Negozio Demo {idx} S.r.l.",
        )
        expected = _expected(
            "ACTIONABLE",
            "LEGAL_GUARANTEE",
            rules=["IT-GUARANTEE-SELLER-001:v0"],
            sources=["MIMIT-GARANZIA"],
            action="prepare_seller_guarantee_request",
            allowed=[
                "seller_is_primary_counterparty",
                "legal_guarantee_route_candidate",
            ],
            prohibited=[
                "first_year_presumption_may_apply",
                "guaranteed_refund",
                "manufacturer_is_primary_counterparty",
            ],
        )
        cases.append(_case(
            f"GUA-{idx:03d}", "guarantee", severity,
            f"Difetto tra 12 e 24 mesi — {days_ago} giorni",
            facts, expected, ["defect", "12-to-24-months"],
        ))
        idx += 1

    for days_ago in [10, 40, 80, 120, 200, 300, 370, 430, 500, 560, 620, 680, 710, 720, 725]:
        severity = "S0" if days_ago in {10, 725} else "S1"
        facts = _base(
            "redirect",
            delivery_date=(CASE_AS_OF - timedelta(days=days_ago)).isoformat(),
            seller_name=f"Venditore Demo {idx} S.r.l.",
        )
        allowed = [
            "seller_is_primary_counterparty",
            "legal_guarantee_route_candidate",
        ]
        if days_ago <= 365:
            allowed.append("first_year_presumption_may_apply")
        expected = _expected(
            "ACTIONABLE",
            "LEGAL_GUARANTEE",
            rules=["IT-GUARANTEE-SELLER-001:v0"],
            sources=["MIMIT-GARANZIA"],
            action="prepare_seller_guarantee_request",
            allowed=allowed,
            prohibited=["manufacturer_is_primary_counterparty", "guaranteed_refund"],
        )
        cases.append(_case(
            f"GUA-{idx:03d}", "guarantee", severity,
            "Venditore rinvia al produttore",
            facts, expected, ["redirect", "seller-vs-manufacturer"],
        ))
        idx += 1

    for days_ago in [740, 760, 800, 900, 1200]:
        facts = _base(
            "defect",
            delivery_date=(CASE_AS_OF - timedelta(days=days_ago)).isoformat(),
        )
        expected = _expected(
            "NEEDS_INFORMATION",
            "LEGAL_GUARANTEE_REVIEW",
            rules=["IT-GUARANTEE-SELLER-001:v0"],
            sources=["MIMIT-GARANZIA"],
            action="manual_review",
            prohibited=[
                "legal_guarantee_definitely_applies",
                "seller_must_refund_now",
                "first_year_presumption_may_apply",
            ],
        )
        cases.append(_case(
            f"GUA-{idx:03d}", "guarantee", "S1",
            "Consegna oltre 24 mesi",
            facts, expected, ["over-24-months", "review"],
        ))
        idx += 1

    for kind in range(5):
        if kind < 3:
            facts = _base("defect", delivery_date=None)
            title = "Data consegna mancante"
        else:
            facts = _base(
                "defect",
                delivery_date=(CASE_AS_OF + timedelta(days=kind)).isoformat(),
            )
            title = "Data consegna futura"
        expected = _expected(
            "NEEDS_INFORMATION",
            missing=["delivery_date"],
            action="ask_missing_fact",
            prohibited=["legal_guarantee_route_candidate", "guaranteed_refund"],
        )
        cases.append(_case(
            f"GUA-{idx:03d}", "guarantee", "S1", title,
            facts, expected, ["date-guard"],
        ))
        idx += 1

    # 40 delivery cases ------------------------------------------------------
    idx = 1
    for days_ago in [1, 2, 3, 5, 7, 10, 14, 20, 30, 45, 60, 90, 120, 180, 250, 365, 4, 8, 15, 40]:
        severity = "S0" if days_ago in {1, 365} else (
            "S1" if days_ago in {2, 14, 60} else "S2"
        )
        facts = _base(
            "not-delivered",
            promised_delivery_date=(CASE_AS_OF - timedelta(days=days_ago)).isoformat(),
            delivery_date=None,
            seller_name=f"Shop Consegna {idx} S.r.l.",
        )
        expected = _expected(
            "ACTIONABLE",
            "DELIVERY",
            rules=["IT-NONDELIVERY-001:v0"],
            sources=["MIMIT-VENDITA-DISTANZA"],
            action="prepare_delivery_notice",
            allowed=["delivery_deadline_passed", "contact_seller"],
            prohibited=[
                "immediate_refund_always",
                "carrier_is_primary_counterparty",
                "automatic_contract_termination",
            ],
        )
        cases.append(_case(
            f"DEL-{idx:03d}", "delivery", severity,
            f"Termine consegna scaduto da {days_ago} giorni",
            facts, expected, ["not-delivered", "deadline-passed"],
        ))
        idx += 1

    for _ in range(8):
        facts = _base("not-delivered", promised_delivery_date=None, delivery_date=None)
        expected = _expected(
            "NEEDS_INFORMATION",
            "DELIVERY",
            missing=["promised_delivery_date"],
            action="ask_missing_fact",
            prohibited=["delivery_deadline_passed", "immediate_refund_always"],
        )
        cases.append(_case(
            f"DEL-{idx:03d}", "delivery", "S1",
            "Termine di consegna mancante",
            facts, expected, ["missing-deadline"],
        ))
        idx += 1

    for days in [1, 2, 7, 14, 30]:
        facts = _base(
            "not-delivered",
            promised_delivery_date=(CASE_AS_OF + timedelta(days=days)).isoformat(),
            delivery_date=None,
        )
        expected = _expected(
            "NEEDS_INFORMATION",
            "DELIVERY",
            action="wait_until_promised_date",
            prohibited=["delivery_deadline_passed", "immediate_refund_always"],
        )
        cases.append(_case(
            f"DEL-{idx:03d}", "delivery", "S1",
            f"Termine futuro di {days} giorni",
            facts, expected, ["future-deadline"],
        ))
        idx += 1

    for n in range(4):
        facts = _base(
            "not-delivered",
            distance_purchase=False,
            promised_delivery_date=(CASE_AS_OF - timedelta(days=10 + n)).isoformat(),
            delivery_date=None,
        )
        expected = _expected(
            "UNSUPPORTED",
            action="decline_automatic_route",
            prohibited=["delivery_deadline_passed", "route_supported", "immediate_refund_always"],
        )
        cases.append(_case(
            f"DEL-{idx:03d}", "delivery", "S1",
            "Acquisto non a distanza",
            facts, expected, ["not-distance"],
        ))
        idx += 1

    for days_ago in [3, 21, 50]:
        facts = _base(
            "not-delivered",
            seller_country="EU",
            promised_delivery_date=(CASE_AS_OF - timedelta(days=days_ago)).isoformat(),
            delivery_date=None,
        )
        expected = _expected(
            "ACTIONABLE",
            "DELIVERY",
            rules=["IT-NONDELIVERY-001:v0"],
            sources=["MIMIT-VENDITA-DISTANZA"],
            action="prepare_delivery_notice",
            allowed=["delivery_deadline_passed", "contact_seller"],
            prohibited=["immediate_refund_always", "carrier_is_primary_counterparty"],
        )
        cases.append(_case(
            f"DEL-{idx:03d}", "delivery", "S2",
            "Venditore professionale UE, termine scaduto",
            facts, expected, ["eu-seller"],
        ))
        idx += 1

    # 45 withdrawal cases ----------------------------------------------------
    idx = 1
    for days_ago in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 2, 5, 8, 11, 14]:
        problem = "refund" if idx % 5 == 0 else "withdrawal"
        severity = "S0" if days_ago in {0, 14} else (
            "S1" if days_ago in {1, 13} else "S2"
        )
        facts = _base(
            problem,
            delivery_date=(CASE_AS_OF - timedelta(days=days_ago)).isoformat(),
        )
        expected = _expected(
            "ACTIONABLE",
            "WITHDRAWAL",
            rules=["IT-WITHDRAWAL-001:v0"],
            sources=["MIMIT-RECESSO"],
            action="prepare_withdrawal_notice",
            allowed=["withdrawal_standard_route_candidate"],
            prohibited=[
                "free_return_always",
                "refund_immediate_before_return",
                "withdrawal_without_exceptions",
            ],
        )
        cases.append(_case(
            f"WDR-{idx:03d}", "withdrawal", severity,
            f"Recesso standard a {days_ago} giorni",
            facts, expected, ["within-14-days", problem],
        ))
        idx += 1

    for days_ago in [15, 16, 20, 30, 45, 60, 90, 120, 180, 365]:
        facts = _base(
            "withdrawal",
            delivery_date=(CASE_AS_OF - timedelta(days=days_ago)).isoformat(),
        )
        expected = _expected(
            "NEEDS_INFORMATION",
            "WITHDRAWAL_LATE_REVIEW",
            rules=["IT-WITHDRAWAL-001:v0"],
            sources=["MIMIT-RECESSO"],
            action="manual_review",
            prohibited=[
                "withdrawal_standard_route_candidate",
                "withdrawal_definitely_expired",
                "refund_immediate",
            ],
        )
        cases.append(_case(
            f"WDR-{idx:03d}", "withdrawal", "S1",
            f"Termine standard superato — {days_ago} giorni",
            facts, expected, ["late-review"],
        ))
        idx += 1

    exception_fields = [
        "customised", "perishable", "sealed_hygiene_opened",
        "customised", "perishable", "sealed_hygiene_opened",
        "customised", "perishable", "sealed_hygiene_opened", "customised",
    ]
    for field in exception_fields:
        facts = _base(
            "withdrawal",
            delivery_date=(CASE_AS_OF - timedelta(days=3)).isoformat(),
            **{field: True},
        )
        expected = _expected(
            "NEEDS_INFORMATION",
            "WITHDRAWAL_EXCEPTION_REVIEW",
            rules=["IT-WITHDRAWAL-001:v0"],
            sources=["MIMIT-RECESSO"],
            action="manual_review",
            prohibited=[
                "withdrawal_standard_route_candidate",
                "withdrawal_without_exceptions",
                "automatic_refund",
            ],
        )
        severity = "S0" if idx % 3 == 0 else "S1"
        cases.append(_case(
            f"WDR-{idx:03d}", "withdrawal", severity,
            f"Possibile eccezione: {field}",
            facts, expected, ["exception-review", field],
        ))
        idx += 1

    for n in range(5):
        if n < 3:
            facts = _base("withdrawal", delivery_date=None)
            title = "Data consegna mancante"
        else:
            facts = _base(
                "withdrawal",
                delivery_date=(CASE_AS_OF + timedelta(days=n)).isoformat(),
            )
            title = "Data consegna futura"
        expected = _expected(
            "NEEDS_INFORMATION",
            missing=["delivery_date"],
            action="ask_missing_fact",
            prohibited=["withdrawal_standard_route_candidate", "automatic_refund"],
        )
        cases.append(_case(
            f"WDR-{idx:03d}", "withdrawal", "S1", title,
            facts, expected, ["date-guard"],
        ))
        idx += 1

    # 25 out-of-scope cases --------------------------------------------------
    idx = 1
    for n in range(5):
        facts = _base(
            "defect",
            consumer=False,
            delivery_date=(CASE_AS_OF - timedelta(days=30)).isoformat(),
        )
        expected = _expected(
            "UNSUPPORTED",
            action="decline_automatic_route",
            prohibited=[
                "legal_guarantee_route_candidate",
                "route_supported",
                "consumer_right_confirmed",
            ],
        )
        cases.append(_case(
            f"OOS-{idx:03d}", "out-of-scope", "S0" if n == 0 else "S1",
            "Acquisto non consumer/B2B",
            facts, expected, ["b2b"],
        ))
        idx += 1

    for n in range(5):
        facts = _base(
            "defect",
            professional_seller=False,
            delivery_date=(CASE_AS_OF - timedelta(days=30)).isoformat(),
        )
        expected = _expected(
            "UNSUPPORTED",
            action="decline_automatic_route",
            prohibited=[
                "legal_guarantee_route_candidate",
                "route_supported",
                "seller_is_primary_counterparty",
            ],
        )
        cases.append(_case(
            f"OOS-{idx:03d}", "out-of-scope", "S0" if n == 0 else "S1",
            "Venditore non professionale",
            facts, expected, ["private-seller"],
        ))
        idx += 1

    for country in ["US", "CN", "GB", "CH", "ZZ"]:
        facts = _base(
            "defect",
            seller_country=country,
            delivery_date=(CASE_AS_OF - timedelta(days=30)).isoformat(),
        )
        expected = _expected(
            "UNSUPPORTED",
            action="decline_automatic_route",
            prohibited=[
                "legal_guarantee_route_candidate",
                "route_supported",
                "eu_rules_automatically_apply",
            ],
        )
        cases.append(_case(
            f"OOS-{idx:03d}", "out-of-scope", "S1",
            f"Venditore fuori Italia/UE: {country}",
            facts, expected, ["extra-eu"],
        ))
        idx += 1

    for problem in ["defect", "withdrawal", "refund", "not-delivered", "other"]:
        facts = _base(
            problem,
            physical_good=False,
            delivery_date=(CASE_AS_OF - timedelta(days=3)).isoformat(),
            promised_delivery_date=(CASE_AS_OF - timedelta(days=3)).isoformat(),
        )
        expected = _expected(
            "UNSUPPORTED",
            action="decline_automatic_route",
            prohibited=[
                "route_supported",
                "legal_guarantee_route_candidate",
                "withdrawal_standard_route_candidate",
            ],
        )
        cases.append(_case(
            f"OOS-{idx:03d}", "out-of-scope", "S1",
            "Servizio/contenuto digitale non supportato",
            facts, expected, ["non-physical"],
        ))
        idx += 1

    for _ in range(5):
        facts = _base(
            "other",
            delivery_date=(CASE_AS_OF - timedelta(days=3)).isoformat(),
        )
        expected = _expected(
            "UNSUPPORTED",
            action="decline_automatic_route",
            prohibited=["route_supported", "automatic_legal_entitlement"],
        )
        cases.append(_case(
            f"OOS-{idx:03d}", "out-of-scope", "S2",
            "Problema non classificato nel rule pack v0",
            facts, expected, ["other-problem"],
        ))
        idx += 1

    # 20 adversarial/boundary cases -----------------------------------------
    idx = 1
    for field in ["consumer", "professional_seller", "seller_country", "physical_good"]:
        facts = _base(
            "defect",
            delivery_date=(CASE_AS_OF - timedelta(days=30)).isoformat(),
        )
        facts[field] = None
        expected = _expected(
            "NEEDS_INFORMATION",
            missing=[field],
            action="ask_missing_fact",
            prohibited=["legal_guarantee_route_candidate", "route_supported"],
        )
        cases.append(_case(
            f"ADV-{idx:03d}", "adversarial", "S0",
            f"Fatto comune mancante: {field}",
            facts, expected, ["missing-common"],
        ))
        idx += 1

    facts = _base(
        "defect",
        delivery_date=(CASE_AS_OF - timedelta(days=30)).isoformat(),
    )
    for field in ["consumer", "professional_seller", "seller_country", "physical_good"]:
        facts[field] = None
    expected = _expected(
        "NEEDS_INFORMATION",
        missing=["consumer", "professional_seller", "seller_country", "physical_good"],
        action="ask_missing_fact",
        prohibited=["legal_guarantee_route_candidate", "route_supported"],
    )
    cases.append(_case(
        f"ADV-{idx:03d}", "adversarial", "S0",
        "Tutti i fatti comuni mancanti",
        facts, expected, ["missing-common"],
    ))
    idx += 1

    for problem in ["withdrawal", "not-delivered"]:
        facts = _base(
            problem,
            distance_purchase=None,
            delivery_date=(CASE_AS_OF - timedelta(days=3)).isoformat(),
            promised_delivery_date=(CASE_AS_OF - timedelta(days=3)).isoformat(),
        )
        expected = _expected(
            "UNSUPPORTED",
            action="decline_automatic_route",
            prohibited=[
                "route_supported",
                "withdrawal_standard_route_candidate",
                "delivery_deadline_passed",
            ],
        )
        cases.append(_case(
            f"ADV-{idx:03d}", "adversarial", "S1",
            "Canale a distanza non confermato",
            facts, expected, ["distance-unknown"],
        ))
        idx += 1

    for problem in ["defect", "withdrawal"]:
        facts = _base(
            problem,
            delivery_date=(CASE_AS_OF + timedelta(days=1)).isoformat(),
        )
        expected = _expected(
            "NEEDS_INFORMATION",
            missing=["delivery_date"],
            action="ask_missing_fact",
            prohibited=[
                "route_supported",
                "legal_guarantee_route_candidate",
                "withdrawal_standard_route_candidate",
            ],
        )
        cases.append(_case(
            f"ADV-{idx:03d}", "adversarial", "S0",
            "Data consegna futura di un giorno",
            facts, expected, ["future-date"],
        ))
        idx += 1

    facts = _base(
        "not-delivered",
        promised_delivery_date=CASE_AS_OF.isoformat(),
        delivery_date=None,
    )
    expected = _expected(
        "NEEDS_INFORMATION",
        "DELIVERY",
        action="wait_until_promised_date",
        prohibited=["delivery_deadline_passed", "immediate_refund_always"],
    )
    cases.append(_case(
        f"ADV-{idx:03d}", "adversarial", "S0",
        "Termine consegna oggi",
        facts, expected, ["boundary", "delivery"],
    ))
    idx += 1

    boundary_cases = [
        (730, "ACTIONABLE", "LEGAL_GUARANTEE", "prepare_seller_guarantee_request"),
        (731, "NEEDS_INFORMATION", "LEGAL_GUARANTEE_REVIEW", "manual_review"),
    ]
    for days_ago, status, route, action in boundary_cases:
        facts = _base(
            "defect",
            delivery_date=(CASE_AS_OF - timedelta(days=days_ago)).isoformat(),
        )
        if status == "ACTIONABLE":
            expected = _expected(
                status,
                route,
                rules=["IT-GUARANTEE-SELLER-001:v0"],
                sources=["MIMIT-GARANZIA"],
                action=action,
                allowed=[
                    "seller_is_primary_counterparty",
                    "legal_guarantee_route_candidate",
                ],
                prohibited=["first_year_presumption_may_apply", "guaranteed_refund"],
            )
        else:
            expected = _expected(
                status,
                route,
                rules=["IT-GUARANTEE-SELLER-001:v0"],
                sources=["MIMIT-GARANZIA"],
                action=action,
                prohibited=["legal_guarantee_definitely_applies", "guaranteed_refund"],
            )
        cases.append(_case(
            f"ADV-{idx:03d}", "adversarial", "S0",
            f"Confine garanzia a {days_ago} giorni",
            facts, expected, ["boundary", "guarantee"],
        ))
        idx += 1

    facts = _base(
        "defect",
        delivery_date=(CASE_AS_OF - timedelta(days=20)).isoformat(),
        seller_name="Negozio Demo\r\nBCC: attacker@example.test",
    )
    expected = _expected(
        "ACTIONABLE",
        "LEGAL_GUARANTEE",
        rules=["IT-GUARANTEE-SELLER-001:v0"],
        sources=["MIMIT-GARANZIA"],
        action="prepare_seller_guarantee_request",
        allowed=[
            "seller_is_primary_counterparty",
            "legal_guarantee_route_candidate",
            "first_year_presumption_may_apply",
        ],
        prohibited=["guaranteed_refund"],
        prohibited_substrings=["\r", "\nBCC:"],
    )
    cases.append(_case(
        f"ADV-{idx:03d}", "adversarial", "S0",
        "Seller name con newline/header injection",
        facts, expected, ["injection", "seller-name"],
    ))
    idx += 1

    facts = _base(
        "defect",
        delivery_date=(CASE_AS_OF - timedelta(days=20)).isoformat(),
        seller_name="X" * 500,
    )
    expected = _expected(
        "ACTIONABLE",
        "LEGAL_GUARANTEE",
        rules=["IT-GUARANTEE-SELLER-001:v0"],
        sources=["MIMIT-GARANZIA"],
        action="prepare_seller_guarantee_request",
        allowed=[
            "seller_is_primary_counterparty",
            "legal_guarantee_route_candidate",
            "first_year_presumption_may_apply",
        ],
        prohibited=["guaranteed_refund"],
        max_draft_chars=1000,
    )
    cases.append(_case(
        f"ADV-{idx:03d}", "adversarial", "S1",
        "Seller name eccessivamente lungo",
        facts, expected, ["length-guard"],
    ))
    idx += 1

    facts = _base(
        "defect",
        seller_country="EU",
        delivery_date=(CASE_AS_OF - timedelta(days=100)).isoformat(),
    )
    expected = _expected(
        "ACTIONABLE",
        "LEGAL_GUARANTEE",
        rules=["IT-GUARANTEE-SELLER-001:v0"],
        sources=["MIMIT-GARANZIA"],
        action="prepare_seller_guarantee_request",
        allowed=[
            "seller_is_primary_counterparty",
            "legal_guarantee_route_candidate",
            "first_year_presumption_may_apply",
        ],
        prohibited=["guaranteed_refund"],
    )
    cases.append(_case(
        f"ADV-{idx:03d}", "adversarial", "S1",
        "Venditore UE supportato",
        facts, expected, ["eu"],
    ))
    idx += 1

    facts = _base(
        "defect",
        seller_country="",
        delivery_date=(CASE_AS_OF - timedelta(days=100)).isoformat(),
    )
    expected = _expected(
        "UNSUPPORTED",
        action="decline_automatic_route",
        prohibited=["route_supported", "legal_guarantee_route_candidate"],
    )
    cases.append(_case(
        f"ADV-{idx:03d}", "adversarial", "S1",
        "Paese venditore stringa vuota",
        facts, expected, ["country-guard"],
    ))
    idx += 1

    facts = _base(
        "withdrawal",
        customised=True,
        delivery_date=(CASE_AS_OF - timedelta(days=40)).isoformat(),
    )
    expected = _expected(
        "NEEDS_INFORMATION",
        "WITHDRAWAL_EXCEPTION_REVIEW",
        rules=["IT-WITHDRAWAL-001:v0"],
        sources=["MIMIT-RECESSO"],
        action="manual_review",
        prohibited=["withdrawal_standard_route_candidate", "withdrawal_definitely_expired"],
    )
    cases.append(_case(
        f"ADV-{idx:03d}", "adversarial", "S1",
        "Eccezione recesso prioritaria al termine standard",
        facts, expected, ["exception-priority"],
    ))
    idx += 1

    facts = _base(
        "not-delivered",
        distance_purchase=False,
        promised_delivery_date=None,
        delivery_date=None,
    )
    expected = _expected(
        "UNSUPPORTED",
        action="decline_automatic_route",
        prohibited=["delivery_deadline_passed", "route_supported"],
    )
    cases.append(_case(
        f"ADV-{idx:03d}", "adversarial", "S1",
        "Consegna: canale non a distanza prevale su termine mancante",
        facts, expected, ["guard-order"],
    ))
    idx += 1

    facts = _base(
        "refund",
        delivery_date=(CASE_AS_OF - timedelta(days=5)).isoformat(),
    )
    expected = _expected(
        "ACTIONABLE",
        "WITHDRAWAL",
        rules=["IT-WITHDRAWAL-001:v0"],
        sources=["MIMIT-RECESSO"],
        action="prepare_withdrawal_notice",
        allowed=["withdrawal_standard_route_candidate"],
        prohibited=["refund_immediate_before_return", "free_return_always"],
    )
    cases.append(_case(
        f"ADV-{idx:03d}", "adversarial", "S1",
        "Refund recente segue percorso recesso v0",
        facts, expected, ["refund"],
    ))
    idx += 1

    facts = _base(
        "defect",
        seller_country="it",
        delivery_date=(CASE_AS_OF - timedelta(days=20)).isoformat(),
    )
    expected = _expected(
        "UNSUPPORTED",
        action="decline_automatic_route",
        prohibited=["route_supported", "legal_guarantee_route_candidate"],
    )
    cases.append(_case(
        f"ADV-{idx:03d}", "adversarial", "S2",
        "Paese non normalizzato: fail closed",
        facts, expected, ["normalization", "fail-closed"],
    ))

    if len(cases) != 200:
        raise AssertionError(f"gold dataset must contain 200 cases, found {len(cases)}")
    return cases


GOLD_CASES = build_gold_cases()
