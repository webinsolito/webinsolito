# RISOLVI API v0.5

Case Engine privacy-first di WEBINSOLITO. La v0.5 mantiene persistenza/capability/retention della v0.3, il benchmark da 200 casi della v0.4 e aggiunge il **Wizard-of-Oz con review umana obbligatoria**, più hardening temporale del rule pack.

## Modello di sicurezza

- `POST /v1/cases` crea una pratica e restituisce **una sola volta** `capability_token`.
- Il server conserva solo un HMAC-SHA256 del token; il token originale non viene salvato.
- Gli endpoint della pratica richiedono `X-Case-Token`.
- Il token non viene letto dalla query string e non compare nell'export.
- Un token valido per una pratica non dà accesso a nessun'altra pratica.
- Accesso negato e ID inesistente restituiscono entrambi `404`, riducendo l'enumerazione degli ID.

## Database e storage

In produzione `RISOLVI_DATABASE_URL` deve essere PostgreSQL (`postgresql+psycopg://...`). SQLite è supportato solo per sviluppo e test.

Tabelle principali: `cases`, `facts`, `documents`, `recommendations`, `actions`, `outcomes`, `rules`, `sources`, `audit_events`, `pilot_participations`, `pilot_reviews`.

Il prototipo usa ancora `create_all`: **prima di produzione reale servono Alembic/migration reviewate**. Non considerare `create_all` una strategia di migrazione.

Gli originali salvati usano storage privato:

- sviluppo/test: directory privata fuori dagli asset pubblici;
- produzione: backend S3-compatible privato (`.[storage]` installa boto3);
- download: capability/reviewer check prima di un URL firmato breve;
- retention documenti: 24 ore di default, configurabile.

## Retention

Default prototipo:

- originali: 24 ore;
- pratica strutturata: 7 giorni.

```bash
python -m app.retention
```

Il job è idempotente. La cancellazione del caso elimina esplicitamente anche consenso e review del pilot.

## Benchmark

La suite contiene 200 casi sintetici/de-identificati. Eseguire:

```bash
python -m app.evaluation --strict
```

Il benchmark è un **gold tecnico**, non una validazione legale. Le fonti/regole sono versionate in `evals/registry.json`.

## Legal preflight e cutover 22/10/2026

Il registry distingue `effective_from/effective_to`, `temporal_basis`, fonti ufficiali e stato di review.

Il D.Lgs. 25 settembre 2026 n. 176 è pubblicato il 7/10/2026 ed entra in vigore il **22/10/2026**. La v0.5 non attiva in anticipo le regole future: dal cutover i casi garanzia entrano in `LEGAL_RULEPACK_REVIEW_2026_10_22` finché il rule pack v1 non riceve sign-off specialistico.

Vedi `docs/risolvi-legal-preflight-2026-10-13.md`.

## Wizard-of-Oz

Il pilot è **disabilitato di default**. Quando `RISOLVI_PILOT_ENABLED=true`:

1. l'utente registra il consenso con `POST /v1/cases/{id}/pilot/consent`;
2. `POST /v1/cases/{id}/pilot/submit` calcola la candidata ma non la mostra;
3. il reviewer usa la coda `/v1/pilot/reviews/pending` e decide con `/decision`;
4. solo dopo la review `GET /v1/cases/{id}/pilot/action` restituisce l'Action Card;
5. il normale `/analyse` viene bloccato in pilot mode per impedire bypass della review.

Gli endpoint reviewer richiedono `X-Reviewer-Token`. In produzione il processo rifiuta il secret reviewer di sviluppo.

Classificazioni: `PASS_AUTONOMOUS`, `MINOR_EDIT`, `MATERIAL_EDIT`, `WRONG_ROUTE`, `UNSUPPORTED_MISSED`, `LEGAL_REVIEW_REQUIRED`. Le metriche aggregate sono disponibili a `/v1/pilot/metrics`.

Vedi `docs/risolvi-pilot-wizard-of-oz.md`.

## Avvio locale

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload
```

Per storage S3-compatible:

```bash
pip install -e '.[dev,storage]'
```

Per provare il pilot in sviluppo:

```bash
export RISOLVI_PILOT_ENABLED=true
export RISOLVI_REVIEWER_SECRET='usa-un-secret-lungo-e-casuale'
uvicorn app.main:app --reload
```

## Variabili principali

`RISOLVI_ENV`, `RISOLVI_DATABASE_URL`, `RISOLVI_CAPABILITY_SECRET`, `RISOLVI_CASE_RETENTION_DAYS`, `RISOLVI_DOCUMENT_RETENTION_HOURS`, `RISOLVI_STORAGE_BACKEND`, `RISOLVI_S3_BUCKET`, `RISOLVI_S3_REGION`, `RISOLVI_S3_ENDPOINT_URL`, `RISOLVI_SIGNED_URL_SECONDS`, `RISOLVI_PILOT_ENABLED`, `RISOLVI_REVIEWER_SECRET`.

## Gate ancora aperti

- legal review specialistica del rule pack (#79);
- split autonomo `REFUND` vs esercizio del recesso;
- migrazioni Alembic e hardening infrastrutturale già tracciati;
- pilot reale da 50–100 casi con consenso e decisione GO/RESCOPE/KILL (#83).

Il servizio B2C RISOLVI resta progettato come **gratuito end-to-end**: nessun account obbligatorio, credito, abbonamento o paywall per ottenere l'azione e il follow-up.
