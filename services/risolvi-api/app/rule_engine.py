from __future__ import annotations

from datetime import date

from .models import CaseFacts, CaseStatus, Problem, Recommendation


def _months_between(a: date, b: date) -> float:
    return (b - a).days / 30.4375


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
        return Recommendation(status=CaseStatus.NEEDS_INFORMATION,title="Manca un fatto decisivo",explanation="Il motore non applica una regola finché mancano fatti materiali.",missing_facts=missing)
    if not f.consumer or not f.professional_seller:
        return Recommendation(status=CaseStatus.UNSUPPORTED,title="Caso fuori perimetro",explanation="La v0 copre soltanto rapporti consumatore-professionista.")
    if f.seller_country not in {"IT", "EU"}:
        return Recommendation(status=CaseStatus.UNSUPPORTED,title="Venditore extra-UE non supportato",explanation="Il rule pack v0 non applica automaticamente il percorso italiano/UE a venditori extra-UE.")
    if not f.physical_good:
        return Recommendation(status=CaseStatus.UNSUPPORTED,title="Oggetto non supportato",explanation="La v0 copre beni fisici ordinari, non servizi o contenuti digitali.")
    if f.problem in {Problem.DEFECT, Problem.REDIRECT}:
        if f.delivery_date is None:
            return Recommendation(status=CaseStatus.NEEDS_INFORMATION,title="Serve la data di consegna",explanation="La data di consegna determina il percorso temporale della garanzia.",missing_facts=["delivery_date"])
        months = _months_between(f.delivery_date, today)
        if months < 0:
            return Recommendation(status=CaseStatus.NEEDS_INFORMATION,title="Data non valida",explanation="La consegna risulta futura.",missing_facts=["delivery_date"])
        if months > 24:
            return Recommendation(status=CaseStatus.NEEDS_INFORMATION,route="LEGAL_GUARANTEE_REVIEW",title="Copertura ordinaria non affermata automaticamente",explanation="La consegna risulta oltre 24 mesi fa; la v0 richiede revisione invece di dedurre un diritto certo.",rule_ids=["IT-GUARANTEE-SELLER-001:v0"],source_ids=["MIMIT-GARANZIA"])
        seller = f.seller_name or "il venditore"
        claims = ["seller_is_primary_counterparty", "legal_guarantee_route_candidate"]
        if months <= 12:
            claims.append("first_year_presumption_may_apply")
        return Recommendation(status=CaseStatus.ACTIONABLE,route="LEGAL_GUARANTEE",title="Prepara una richiesta al venditore",explanation="I fatti confermati rientrano nel percorso di garanzia legale gestito dalla v0.",rule_ids=["IT-GUARANTEE-SELLER-001:v0"],source_ids=["MIMIT-GARANZIA"],allowed_claims=claims,draft=f"Gentili {seller},\n\nsegnalo un problema di conformità/difetto relativo al bene consegnato il {f.delivery_date.isoformat()}. Chiedo di gestire la pratica nell'ambito della garanzia legale e di indicarmi il percorso per il ripristino della conformità.\n\nCordiali saluti")
    if f.problem in {Problem.WITHDRAWAL, Problem.REFUND}:
        if f.distance_purchase is not True:
            return Recommendation(status=CaseStatus.UNSUPPORTED,title="Recesso a distanza non applicabile nel rule pack",explanation="La v0 tratta il recesso degli acquisti online/a distanza.")
        if f.customised or f.perishable or f.sealed_hygiene_opened:
            return Recommendation(status=CaseStatus.NEEDS_INFORMATION,route="WITHDRAWAL_EXCEPTION_REVIEW",title="Possibile eccezione al recesso",explanation="È presente una caratteristica che può richiedere una verifica specifica prima di applicare il termine standard.",rule_ids=["IT-WITHDRAWAL-001:v0"],source_ids=["MIMIT-RECESSO"])
        if f.delivery_date is None:
            return Recommendation(status=CaseStatus.NEEDS_INFORMATION,title="Serve la data di consegna",explanation="La data di consegna è necessaria per il controllo del termine standard usato dalla v0.",missing_facts=["delivery_date"])
        days = (today - f.delivery_date).days
        if days < 0:
            return Recommendation(status=CaseStatus.NEEDS_INFORMATION,title="Data non valida",explanation="La consegna risulta futura.",missing_facts=["delivery_date"])
        if days > 14:
            return Recommendation(status=CaseStatus.NEEDS_INFORMATION,route="WITHDRAWAL_LATE_REVIEW",title="Termine standard superato",explanation="La v0 non applica automaticamente estensioni o eccezioni informative oltre il termine standard.",rule_ids=["IT-WITHDRAWAL-001:v0"],source_ids=["MIMIT-RECESSO"])
        return Recommendation(status=CaseStatus.ACTIONABLE,route="WITHDRAWAL",title="Prepara la comunicazione di recesso",explanation="Sui fatti confermati il caso rientra nel percorso standard di recesso a distanza usato dalla v0.",rule_ids=["IT-WITHDRAWAL-001:v0"],source_ids=["MIMIT-RECESSO"],allowed_claims=["withdrawal_standard_route_candidate"],draft="Comunico la mia volontà di recedere dall'acquisto online e chiedo le istruzioni operative per la restituzione.")
    if f.problem is Problem.NOT_DELIVERED:
        if f.distance_purchase is not True:
            return Recommendation(status=CaseStatus.UNSUPPORTED,title="Percorso consegna online non applicabile",explanation="La v0 tratta la mancata consegna negli acquisti a distanza.")
        if f.promised_delivery_date is None:
            return Recommendation(status=CaseStatus.NEEDS_INFORMATION,route="DELIVERY",title="Serve il termine di consegna promesso",explanation="Il motore non qualifica il ritardo senza la data/termine promesso.",missing_facts=["promised_delivery_date"])
        if f.promised_delivery_date > today:
            return Recommendation(status=CaseStatus.NEEDS_INFORMATION,route="DELIVERY",title="Il termine non è ancora trascorso",explanation="La data promessa risulta futura.")
        return Recommendation(status=CaseStatus.ACTIONABLE,route="DELIVERY",title="Prepara una contestazione della mancata consegna",explanation="Il termine promesso risulta trascorso; la v0 prepara una richiesta al venditore senza dedurre automaticamente un rimborso immediato.",rule_ids=["IT-NONDELIVERY-001:v0"],source_ids=["MIMIT-GARANZIA"],allowed_claims=["delivery_deadline_passed", "contact_seller"],draft="L'ordine non risulta consegnato nonostante il termine indicato sia trascorso. Chiedo stato effettivo e un termine certo per la consegna.")
    return Recommendation(status=CaseStatus.UNSUPPORTED,title="Caso non supportato",explanation="Nessuna regola v0 corrisponde al problema selezionato.")
