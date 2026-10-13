# RISOLVI — legal preflight del rule pack

Data di verifica tecnica/fonti: **13 ottobre 2026**.

> Questo documento non è un parere legale e non sostituisce la revisione di uno specialista in diritto dei consumatori. Serve a rendere verificabile ciò che il software assume, ciò che le fonti ufficiali supportano e ciò che deve restare bloccato o sottoposto a review.

## Stato

- **Fonti primarie/istituzionali:** verificate tecnicamente il 13/10/2026.
- **Traduzione delle fonti in regole software:** implementata in forma prudenziale/fail-closed.
- **Legal review specialistica:** **PENDING**.
- **Lancio pubblico non supervisionato:** **BLOCKED** fino al sign-off e alla chiusura dei blocker indicati sotto.

## Perimetro del rule pack v0

RISOLVI v0 tratta esclusivamente casi consumer-professionista relativi a beni fisici, con venditore in Italia/UE e, per i percorsi di recesso/consegna, acquisti a distanza. Restano fuori dal routing automatico: B2B, venditore privato, extra-UE, servizi/contenuti digitali, telecom/energia, banking/chargeback, assicurazioni, contenzioso e richieste risarcitorie complesse.

## Punti verificati e traduzione tecnica

### 1. Garanzia legale di conformità

Fonti:

- MIMIT — Garanzia legale: https://www.mimit.gov.it/it/mercato-e-consumatori/tutela-del-consumatore/diritti-del-consumatore/garanzia-legale
- D.Lgs. 4 novembre 2021 n. 170 — Normattiva: https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:DECRETO.LEGISLATIVO:2021-11-04;170!vig=

Punti usati dal software:

- per i beni nuovi, la responsabilità ordinaria del venditore copre difetti di conformità che si manifestano entro due anni dalla consegna;
- il venditore è la controparte del consumatore per il percorso della garanzia legale;
- se il difetto si manifesta entro un anno dalla consegna opera la presunzione prevista dall'art. 135, salvo le eccezioni di legge;
- il motore non promette automaticamente rimborso, risoluzione o uno specifico rimedio finale: prepara il percorso verso il venditore e lascia i casi ambigui alla review.

Hardening introdotto in v0.5:

- i confini di uno e due anni sono calcolati per **anniversario di calendario**, non con mesi medi o 365 giorni fissi;
- può essere registrata la data di manifestazione del difetto separatamente dalla data di consegna;
- date incoerenti o oltre il perimetro ordinario fanno fallire chiuso il percorso.

### 2. Recesso nei contratti a distanza

Fonti:

- MIMIT — Diritto di recesso: https://www.mimit.gov.it/it/mercato-e-consumatori/tutela-del-consumatore/diritti-del-consumatore/diritto-di-recesso
- D.Lgs. 21 febbraio 2014 n. 21 — Normattiva: https://www.normattiva.it/atto/caricaDettaglioAtto?atto.codiceRedazionale=14G00033&atto.dataPubblicazioneGazzetta=2014-03-11
- D.Lgs. 7 marzo 2023 n. 26 — Normattiva: https://www.normattiva.it/atto/caricaDettaglioAtto?atto.codiceRedazionale=23G00033&atto.dataPubblicazioneGazzetta=2023-03-18

Punti usati dal software:

- per i beni acquistati a distanza, il periodo standard di recesso è normalmente 14 giorni dalla consegna;
- esistono eccezioni all'art. 59 e casi in cui la mancata informazione sul recesso modifica il termine;
- per questo il motore non applica automaticamente il percorso standard quando rileva personalizzazione, deteriorabilità o bene sigillato per ragioni igieniche aperto, e non afferma automaticamente che un recesso oltre 14 giorni sia definitivamente escluso.

### 3. Rimborso dopo il recesso — blocker da separare dal recesso

La pagina MIMIT indica che il professionista deve rimborsare senza indebito ritardo e comunque entro 14 giorni dalla comunicazione di recesso. Il Codice del consumo contiene inoltre condizioni rilevanti per la possibilità del professionista di trattenere il rimborso fino alla ricezione dei beni o alla prova della spedizione, salvo i casi previsti dalla legge.

**Blocker v0:** `Problem.REFUND` condivide ancora il routing tecnico del semplice esercizio del recesso. Questo non è sufficiente per un lancio non supervisionato: la valutazione del rimborso richiede almeno fatti separati quali `withdrawal_notified_at`, `returned_or_proof_sent` e `seller_offered_collection`, già aggiunti al modello dati v0.5 ma non ancora trasformati in una regola autonoma approvata.

Decisione: durante il Wizard-of-Oz il caso può essere raccolto, ma ogni Action Card resta soggetta a review umana. Prima dell'automazione va introdotto un rule ID separato per il rimborso post-recesso con test dedicati.

### 4. Mancata consegna

Fonte primaria:

- D.Lgs. 21 febbraio 2014 n. 21, art. 61 — Normattiva: https://www.normattiva.it/atto/caricaDettaglioAtto?atto.codiceRedazionale=14G00033&atto.dataPubblicazioneGazzetta=2014-03-11

Il rule pack applica in modo prudenziale questi punti:

- salvo diverso accordo, la consegna deve avvenire senza ritardo ingiustificato e al più tardi entro 30 giorni dalla conclusione del contratto;
- se esiste una data/termine concordato, quello ha precedenza nel routing;
- in assenza del termine concordato, v0.5 può usare la data dell'ordine per il fallback dei 30 giorni;
- dopo il mancato rispetto del termine, in via ordinaria il consumatore invita il professionista a consegnare entro un termine supplementare appropriato prima della risoluzione, fermo il regime delle eccezioni dell'art. 61, comma 4;
- RISOLVI non deduce automaticamente rimborso immediato o risoluzione del contratto dal solo superamento della prima data.

### 5. D.Lgs. 25 settembre 2026 n. 176 — nuovo regime dal 22/10/2026

Fonti primarie:

- Normattiva: https://www.normattiva.it/eli/id/2026/10/07/26G00191/ORIGINAL
- Gazzetta Ufficiale, GU Serie Generale n. 233 del 07/10/2026: https://www.gazzettaufficiale.it/atto/serie_generale/caricaDettaglioAtto/originario?atto.codiceRedazionale=26G00191&atto.dataPubblicazioneGazzetta=2026-10-07&elenco30giorni=false

Il decreto è pubblicato il 7 ottobre 2026 e **entra in vigore il 22 ottobre 2026**. Tra le modifiche rilevanti figura la disciplina che, quando la riparazione è effettuata come rimedio ai sensi dell'art. 135-bis, comma 2, estende una volta di dodici mesi il periodo di responsabilità del venditore, oltre ad altre modifiche/informazioni relative alla riparazione.

Decisione tecnica:

- `IT-GUARANTEE-SELLER-001:v0` termina il 21/10/2026 nel registry;
- `IT-GUARANTEE-SELLER-001:v1` e `IT-REPAIR-EXTENSION-001:v1` sono registrate dal 22/10/2026 ma con `activation_status=blocked_pending_legal_review`;
- il runtime ha un **cutover fail-closed**: dal 22/10/2026 i casi garanzia non continuano silenziosamente con v0 ma entrano in `LEGAL_RULEPACK_REVIEW_2026_10_22` finché v1 non viene revisionata e attivata.

## Checklist per lo specialista consumer-law

Lo specialista deve approvare o correggere, con riferimento puntuale alla fonte:

1. perimetro soggettivo B2C e identificazione del venditore nei marketplace;
2. data giuridicamente rilevante per manifestazione del difetto e confini temporali;
3. formulazione dei rimedi in garanzia e condizioni per riduzione prezzo/risoluzione;
4. presunzione del primo anno e relative eccezioni;
5. recesso standard, estensioni informative ed elenco/gestione delle eccezioni rilevanti per il prodotto;
6. nuova regola separata per rimborso post-recesso, inclusa la possibilità di trattenere il rimborso nei casi previsti;
7. art. 61: termine supplementare, casi in cui non è necessario e formulazione sicura della comunicazione;
8. impatto e disciplina transitoria del D.Lgs. 176/2026 sui casi iniziati/conclusi prima e dopo il 22/10/2026;
9. testo delle Action Card e dei messaggi, per evitare affermazioni assolute o rimedi non supportati;
10. matrice `rule_id → effective_from/effective_to → source_id → test` prima di cambiare `legal_review` da `pending_specialist` ad `approved`.

## Sign-off

| Area | Stato tecnico | Stato legal | Reviewer | Data | Note |
|---|---|---|---|---|---|
| Garanzia v0 fino al 21/10/2026 | approved | pending_specialist | — | — | — |
| Garanzia/riparazione v1 dal 22/10/2026 | blocked | pending_specialist | — | — | non attivare automaticamente |
| Recesso standard | approved_guarded | pending_specialist | — | — | — |
| Rimborso post-recesso | blocked_for_split | pending_specialist | — | — | creare rule autonoma |
| Mancata consegna | approved_guarded | pending_specialist | — | — | eccezioni art. 61 da sign-off |

La issue #79 non deve essere chiusa finché questa tabella non contiene un sign-off specialistico effettivo e le correzioni risultanti non sono coperte da test.
