from __future__ import annotations

import re
from datetime import date, timedelta

from .models import CaseFacts, CaseStatus, Problem, Recommendation

REPAIR_DIRECTIVE_RULEPACK_CUTOVER = date(2026, 10, 22)


def _anniversary(value: date, years: int) -> date:
    """Calendar anniversary without approximating a year as a fixed day count."""
    try:
        return value.replace(year=value.year + years)
    except ValueError:
        # 29 February -> 28 February in a non-leap target year.
        return value.replace(month=2, day=28, year=value.year + years)


def _safe_party_label(value: str | None) -> str:
    """Keep user-confirmed party labels safe to interpolate into generated drafts."""
    if not value:
        return "il venditore"
    cleaned = re.sub(r"[\r\n\t]+", " ", value)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:120] or "il venditore"


def _missing_common(f: CaseFacts) -> list[str]:
    missing: list[str] = []
    if f.consumer is None:
        missing.append("consumer")
    if f.professional_seller is None:
        missing.append("professional_seller")
    if f.seller_country is None:
        missing.append("seller_country")
    if f.physical_good is None:
        missing.append("physical_good")
    return missing


def analyse(f: CaseFacts, today: date | None = None) -> Recommendation:
    today = today or date.today()
    missing = _missing_common(f)
    if missing:
        return Recommendation(
            status=CaseStatus.NEEDS_INFORMATION,
            title="Manca un fatto decisivo",
            explanation="Il motore non applica una regola finché mancano fatti materiali.",
            missing_facts=missing,
        )

    if not f.consumer or not f.professional_seller:
        return Recommendation(
            status=CaseStatus.UNSUPPORTED,
            title="Caso fuori perimetro",
            explanation="La v0 copre soltanto rapporti consumatore-professionista.",
        )

    if f.seller_country not in {"IT", "EU"}:
        return Recommendation(
            status=CaseStatus.UNSUPPORTED,
            title="Venditore extra-UE non supportato",
            explanation=(
                "Il rule pack v0 non applica automaticamente il percorso italiano/UE "
                "a venditori extra-UE."
            ),
        )

    if not f.physical_good:
        return Recommendation(
            status=CaseStatus.UNSUPPORTED,
            title="Oggetto non supportato",
            explanation="La v0 copre beni fisici ordinari, non servizi o contenuti digitali.",
        )

    if f.problem in {Problem.DEFECT, Problem.REDIRECT}:
        if f.delivery_date is None:
            return Recommendation(
                status=CaseStatus.NEEDS_INFORMATION,
                title="Serve la data di consegna",
                explanation="La data di consegna determina il percorso temporale della garanzia.",
                missing_facts=["delivery_date"],
            )

        if f.delivery_date > today:
            return Recommendation(
                status=CaseStatus.NEEDS_INFORMATION,
                title="Data non valida",
                explanation="La consegna risulta futura.",
                missing_facts=["delivery_date"],
            )

        # D.Lgs. 176/2026 entra in vigore il 22/10/2026. Finché il rule pack v1
        # non riceve sign-off specialistico, il motore non continua a usare in
        # silenzio la versione precedente oltre il suo intervallo dichiarato.
        if today >= REPAIR_DIRECTIVE_RULEPACK_CUTOVER:
            return Recommendation(
                status=CaseStatus.NEEDS_INFORMATION,
                route="LEGAL_RULEPACK_REVIEW_2026_10_22",
                title="Rule pack garanzia in aggiornamento",
                explanation=(
                    "Dal 22 ottobre 2026 è efficace un nuovo regime normativo rilevante per "
                    "riparazione e garanzia. RISOLVI richiede revisione del rule pack v1 "
                    "prima di produrre automaticamente questa raccomandazione."
                ),
                rule_ids=["IT-GUARANTEE-SELLER-001:v1"],
                source_ids=["NORMATTIVA-DLGS176-2026"],
            )

        manifestation = f.defect_manifested_date or today
        if manifestation < f.delivery_date or manifestation > today:
            return Recommendation(
                status=CaseStatus.NEEDS_INFORMATION,
                route="LEGAL_GUARANTEE_REVIEW",
                title="Data di manifestazione da verificare",
                explanation=(
                    "La data indicata per la manifestazione del difetto non è coerente con "
                    "la consegna o con la data odierna."
                ),
                missing_facts=["defect_manifested_date"],
            )

        if manifestation > _anniversary(f.delivery_date, 2):
            return Recommendation(
                status=CaseStatus.NEEDS_INFORMATION,
                route="LEGAL_GUARANTEE_REVIEW",
                title="Copertura ordinaria non affermata automaticamente",
                explanation=(
                    "Il difetto risulta manifestato oltre il periodo ordinario di due anni; "
                    "la v0 richiede revisione invece di dedurre un diritto certo."
                ),
                rule_ids=["IT-GUARANTEE-SELLER-001:v0"],
                source_ids=["MIMIT-GARANZIA"],
            )

        seller = _safe_party_label(f.seller_name)
        claims = ["seller_is_primary_counterparty", "legal_guarantee_route_candidate"]
        if manifestation <= _anniversary(f.delivery_date, 1):
            claims.append("first_year_presumption_may_apply")

        return Recommendation(
            status=CaseStatus.ACTIONABLE,
            route="LEGAL_GUARANTEE",
            title="Prepara una richiesta al venditore",
            explanation=(
                "I fatti confermati rientrano nel percorso di garanzia legale gestito dalla v0."
            ),
            rule_ids=["IT-GUARANTEE-SELLER-001:v0"],
            source_ids=["MIMIT-GARANZIA"],
            allowed_claims=claims,
            draft=(
                f"Gentili {seller},\n\n"
                "segnalo un problema di conformità/difetto relativo al bene consegnato il "
                f"{f.delivery_date.isoformat()}. Chiedo di gestire la pratica nell'ambito "
                "della garanzia legale e di indicarmi il percorso per il ripristino della "
                "conformità.\n\nCordiali saluti"
            ),
        )

    if f.problem in {Problem.WITHDRAWAL, Problem.REFUND}:
        if f.distance_purchase is not True:
            return Recommendation(
                status=CaseStatus.UNSUPPORTED,
                title="Recesso a distanza non applicabile nel rule pack",
                explanation="La v0 tratta il recesso degli acquisti online/a distanza.",
            )

        if f.customised or f.perishable or f.sealed_hygiene_opened:
            return Recommendation(
                status=CaseStatus.NEEDS_INFORMATION,
                route="WITHDRAWAL_EXCEPTION_REVIEW",
                title="Possibile eccezione al recesso",
                explanation=(
                    "È presente una caratteristica che può richiedere una verifica specifica "
                    "prima di applicare il termine standard."
                ),
                rule_ids=["IT-WITHDRAWAL-001:v0"],
                source_ids=["MIMIT-RECESSO"],
            )

        if f.delivery_date is None:
            return Recommendation(
                status=CaseStatus.NEEDS_INFORMATION,
                title="Serve la data di consegna",
                explanation=(
                    "La data di consegna è necessaria per il controllo del termine standard "
                    "usato dalla v0."
                ),
                missing_facts=["delivery_date"],
            )

        days = (today - f.delivery_date).days
        if days < 0:
            return Recommendation(
                status=CaseStatus.NEEDS_INFORMATION,
                title="Data non valida",
                explanation="La consegna risulta futura.",
                missing_facts=["delivery_date"],
            )

        if days > 14:
            return Recommendation(
                status=CaseStatus.NEEDS_INFORMATION,
                route="WITHDRAWAL_LATE_REVIEW",
                title="Termine standard superato",
                explanation=(
                    "La v0 non applica automaticamente estensioni o eccezioni informative "
                    "oltre il termine standard."
                ),
                rule_ids=["IT-WITHDRAWAL-001:v0"],
                source_ids=["MIMIT-RECESSO"],
            )

        return Recommendation(
            status=CaseStatus.ACTIONABLE,
            route="WITHDRAWAL",
            title="Prepara la comunicazione di recesso",
            explanation=(
                "Sui fatti confermati il caso rientra nel percorso standard di recesso a "
                "distanza usato dalla v0."
            ),
            rule_ids=["IT-WITHDRAWAL-001:v0"],
            source_ids=["MIMIT-RECESSO"],
            allowed_claims=["withdrawal_standard_route_candidate"],
            draft=(
                "Comunico la mia volontà di recedere dall'acquisto online e chiedo le "
                "istruzioni operative per la restituzione."
            ),
        )

    if f.problem is Problem.NOT_DELIVERED:
        if f.distance_purchase is not True:
            return Recommendation(
                status=CaseStatus.UNSUPPORTED,
                title="Percorso consegna online non applicabile",
                explanation="La v0 tratta la mancata consegna negli acquisti a distanza.",
            )

        delivery_deadline = f.promised_delivery_date
        deadline_basis = "promesso"
        if delivery_deadline is None and f.order_date is not None:
            if f.order_date > today:
                return Recommendation(
                    status=CaseStatus.NEEDS_INFORMATION,
                    route="DELIVERY",
                    title="Data ordine non valida",
                    explanation="La data dell'ordine risulta futura.",
                    missing_facts=["order_date"],
                )
            delivery_deadline = f.order_date + timedelta(days=30)
            deadline_basis = "ordinario di 30 giorni"

        if delivery_deadline is None:
            return Recommendation(
                status=CaseStatus.NEEDS_INFORMATION,
                route="DELIVERY",
                title="Serve il termine di consegna o la data dell'ordine",
                explanation=(
                    "Il motore non qualifica il ritardo senza il termine concordato oppure, "
                    "se non ne risulta uno, senza la data dell'ordine."
                ),
                missing_facts=["promised_delivery_date"],
            )

        # A deadline for "today" is not treated as overdue before the day has ended.
        if delivery_deadline >= today:
            return Recommendation(
                status=CaseStatus.NEEDS_INFORMATION,
                route="DELIVERY",
                title="Il termine non è ancora trascorso",
                explanation=f"Il termine {deadline_basis} non risulta ancora trascorso.",
            )

        return Recommendation(
            status=CaseStatus.ACTIONABLE,
            route="DELIVERY",
            title="Prepara una contestazione della mancata consegna",
            explanation=(
                "Il termine di consegna risulta trascorso; la v0 prepara una richiesta al "
                "venditore senza dedurre automaticamente un rimborso immediato o la "
                "risoluzione automatica del contratto."
            ),
            rule_ids=["IT-NONDELIVERY-001:v0"],
            source_ids=["MIMIT-VENDITA-DISTANZA"],
            allowed_claims=[
                "delivery_deadline_passed",
                "contact_seller",
                "additional_period_may_be_required_before_termination",
            ],
            draft=(
                "L'ordine non risulta consegnato nonostante il termine di consegna sia "
                "trascorso. Chiedo di effettuare la consegna entro un termine supplementare "
                "appropriato e di confermarmi per iscritto la nuova data."
            ),
        )

    return Recommendation(
        status=CaseStatus.UNSUPPORTED,
        title="Caso non supportato",
        explanation="Nessuna regola v0 corrisponde al problema selezionato.",
    )
