# RISOLVI — protocollo Wizard-of-Oz

Versione: `pilot-2026-10-v1`

Obiettivo: validare con **50–100 casi reali in-scope** utilità, correttezza e capacità di preparare un'azione senza lasciare che una raccomandazione non revisionata raggiunga l'utente.

## Principio di sicurezza

Durante il pilot:

1. l'utente conferma i fatti e presta consenso esplicito alla partecipazione al pilot;
2. il Case Engine produce una raccomandazione candidata **solo lato server**;
3. la candidata entra nella coda umana;
4. il reviewer legge fatti, provenance/documenti strettamente necessari e output candidato;
5. il reviewer classifica il risultato e, quando necessario, inserisce una raccomandazione corretta;
6. soltanto dopo la decisione il relativo endpoint `pilot/action` restituisce l'Action Card all'utente.

Con `RISOLVI_PILOT_ENABLED=true` l'endpoint ordinario `/analyse` è bloccato, così una Action Card del pilot non può aggirare la review.

## Minimizzazione e consenso

Il pilot usa le stesse regole privacy-first della pratica: originali con retention breve, dati strutturati separati, capability guest, cancellazione completa del caso. La partecipazione al pilot va registrata con la versione dell'informativa/consenso; non va usato un consenso generico per finalità ulteriori.

Raccogliere solo documenti necessari al caso. Non copiare reclami pubblici, non importare PII per costruire dataset e non conservare originali oltre la retention solo per addestramento o analytics.

## Flusso API

Utente:

```text
POST /v1/cases
PUT  /v1/cases/{id}/facts
POST /v1/cases/{id}/pilot/consent
POST /v1/cases/{id}/pilot/submit
GET  /v1/cases/{id}/pilot/action
```

Reviewer:

```text
GET  /v1/pilot/reviews/pending
GET  /v1/pilot/reviews/{review_id}
GET  /v1/pilot/reviews/{review_id}/documents/{document_id}/download
POST /v1/pilot/reviews/{review_id}/decision
GET  /v1/pilot/metrics
```

Gli endpoint reviewer richiedono `X-Reviewer-Token`. In produzione il pilot non si avvia con secret di sviluppo.

## Tassonomia review

- `PASS_AUTONOMOUS`: l'output candidato può essere mostrato senza modifica sostanziale.
- `MINOR_EDIT`: modifica editoriale/non sostanziale che non cambia il percorso o il diritto rappresentato.
- `MATERIAL_EDIT`: modifica sostanziale a spiegazione, richiesta, rimedio o fatti necessari.
- `WRONG_ROUTE`: il Case Engine ha scelto il percorso sbagliato.
- `UNSUPPORTED_MISSED`: il sistema avrebbe dovuto fermarsi come fuori perimetro ma non l'ha fatto.
- `LEGAL_REVIEW_REQUIRED`: il caso non è sicuro da risolvere con il rule pack corrente e richiede interpretazione specialistica.

Per ogni decisione diversa da `PASS_AUTONOMOUS`, l'API richiede una `final_recommendation` esplicita. Non è ammesso correggere soltanto con una nota invisibile all'utente.

## Severity

- `S0`: rischio catastrofico/azione chiaramente dannosa o diritto inventato con potenziale conseguenza rilevante.
- `S1`: errore legale/procedurale materiale che può far perdere un diritto, termine o indirizzare alla controparte sbagliata.
- `S2`: errore materiale correggibile senza perdita immediata di diritto.
- `S3`: difetto minore di chiarezza/completezza.
- `S4`: solo stile/forma.

Target pilot: **0 S0/S1**.

## KPI e gate

Misurare almeno:

- mediana `case.created_at → Action Card approvata/consegnata`, target < 3 minuti per il flusso operativo del pilot;
- percentuale `PASS_AUTONOMOUS + MINOR_EDIT` sul totale deciso, target ≥ 90%;
- `MATERIAL_EDIT`, `WRONG_ROUTE`, `UNSUPPORTED_MISSED`, `LEGAL_REVIEW_REQUIRED` separatamente;
- S0/S1, target 0;
- percentuale di utenti che copiano/usano davvero la bozza;
- risposta del venditore e tempo alla risposta;
- outcome finale (`resolved`, `partially_resolved`, `not_resolved`, `abandoned`), senza forzare l'utente a dichiarare successo;
- percentuale di casi con documentazione insufficiente o fatti contraddittori.

## Decisione dopo 50–100 casi

**GO** solo se: 0 S0/S1, almeno 90% senza modifica sostanziale, tempi operativi sostenibili e nessun pattern legale ricorrente che renda il perimetro troppo ambiguo.

**RESCOPE** se: i problemi si concentrano in sottocasi identificabili (es. marketplace, refund post-recesso, beni usati), oppure `LEGAL_REVIEW_REQUIRED`/`MATERIAL_EDIT` sono troppo frequenti ma evitabili restringendo il perimetro.

**KILL / non automatizzare il verticale** se: il costo umano cresce quasi linearmente con i casi, il routing necessita interpretazione caso-per-caso, compaiono errori S0/S1 persistenti o gli utenti non usano l'azione preparata.

## Cose da non fare durante il pilot

- nessun invio automatico al venditore;
- nessuna falsa dicitura “validato legalmente”;
- nessuna attivazione automatica del rule pack garanzia v1 del 22/10/2026 senza sign-off;
- nessun uso dei 50–100 casi come dataset di training senza base giuridica/finalità separata;
- nessuna chiusura della issue #83 prima di aver raccolto casi reali e prodotto la decisione GO/RESCOPE/KILL.
