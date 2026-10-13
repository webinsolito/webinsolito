# RISOLVI API v0.7

Case Engine privacy-first di WEBINSOLITO. La v0.7 mantiene persistenza, capability, retention, benchmark da 200 casi e review umana obbligatoria; aggiunge il pacchetto di deploy del pilot: migrazioni Alembic, container production-ready, readiness probe e guardrail che impedisce `create_all()` in produzione.

## Modello di sicurezza

- `POST /v1/cases` crea una pratica e restituisce **una sola volta** `capability_token`.
- Il server conserva solo un HMAC-SHA256 del token; il token originale non viene salvato.
- Gli endpoint della pratica richiedono `X-Case-Token`; gli endpoint reviewer richiedono `X-Reviewer-Token`.
- I token non vengono letti dalla query string e non compaiono nell'export.
- Accesso negato e ID inesistente restituiscono entrambi `404`, riducendo l'enumerazione.
- Il reviewer token non va mai incorporato in HTML/JS statico: la console lo chiede a runtime e lo conserva solo in `sessionStorage`.

## Configurazione pubblica e CORS

`GET /v1/config` espone solo configurazione non sensibile necessaria al client: versione servizio, stato pilot, versione del consenso, retention e limiti upload.

Se frontend e API sono su origini diverse, impostare esplicitamente:

```bash
export RISOLVI_ALLOWED_ORIGINS='https://www.webinsolito.it,https://review.webinsolito.it'
```

Wildcard `*` e origini HTTP non-localhost vengono rifiutate. Se frontend e API sono same-origin, lasciare la variabile vuota.

## Database, migrazioni e storage

In produzione `RISOLVI_DATABASE_URL` deve essere PostgreSQL (`postgresql+psycopg://...`). SQLite è supportato soltanto per sviluppo e test.

Tabelle principali: `cases`, `facts`, `documents`, `recommendations`, `actions`, `outcomes`, `rules`, `sources`, `audit_events`, `pilot_participations`, `pilot_reviews`.

La produzione usa Alembic:

```bash
alembic upgrade head
```

`RISOLVI_AUTO_CREATE_SCHEMA` deve essere `false` in produzione. L'app rifiuta di avviarsi in configurazione production se si tenta di riabilitare `create_all()`.

Originali salvati:

- sviluppo/test: directory privata fuori dagli asset pubblici;
- produzione: backend S3-compatible privato;
- retention documenti: 24 ore di default, configurabile;
- retention pratica: 7 giorni di default, configurabile.

```bash
python -m app.retention
```

Il job è idempotente. La cancellazione del caso elimina esplicitamente anche consenso e review del pilot.

## Probe operativi

- `GET /health`: liveness del processo;
- `GET /ready`: readiness con query al database;
- `GET /v1/config`: configurazione pubblica non sensibile.

Un deploy non deve ricevere traffico utente finché `/ready` non restituisce `200`.

## Benchmark e legal cutover

La suite contiene 200 casi sintetici/de-identificati:

```bash
python -m app.evaluation --strict
```

Il benchmark è un **gold tecnico**, non una validazione legale. Le fonti/regole sono versionate in `evals/registry.json`.

Il D.Lgs. 25 settembre 2026 n. 176 è pubblicato il 7/10/2026 ed entra in vigore il **22/10/2026**. La v0.7 non attiva in anticipo le regole future: dal cutover i casi garanzia entrano in `LEGAL_RULEPACK_REVIEW_2026_10_22` finché il rule pack v1 non riceve sign-off specialistico.

Vedi `docs/risolvi-legal-preflight-2026-10-13.md`.

## Wizard-of-Oz

Il pilot è **disabilitato di default**. Quando `RISOLVI_PILOT_ENABLED=true`:

1. il client crea una pratica e salva i fatti confermati;
2. l'utente registra il consenso con `POST /v1/cases/{id}/pilot/consent`;
3. solo dopo il consenso gli eventuali originali vengono caricati;
4. `POST /v1/cases/{id}/pilot/submit` calcola la candidata ma non la mostra;
5. il reviewer usa `/v1/pilot/reviews/pending`, ispeziona fatti/documenti e decide con `/decision`;
6. solo dopo la review `GET /v1/cases/{id}/pilot/action` restituisce l'Action Card;
7. il normale `/analyse` è bloccato in pilot mode, quindi non esiste un bypass client-side della review.

Classificazioni: `PASS_AUTONOMOUS`, `MINOR_EDIT`, `MATERIAL_EDIT`, `WRONG_ROUTE`, `UNSUPPORTED_MISSED`, `LEGAL_REVIEW_REQUIRED`.

`/v1/pilot/metrics` include anche i contatori degli outcome registrati dal client (`action_copied`, `action_sent`, `case_resolved`, ecc.), per misurare utilizzo reale e non solo output generati.

Vedi `docs/risolvi-pilot-wizard-of-oz.md`.

## Avvio locale

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
export RISOLVI_PILOT_ENABLED=true
export RISOLVI_REVIEWER_SECRET='usa-un-secret-lungo-e-casuale'
uvicorn app.main:app --reload
```

Per storage S3-compatible:

```bash
pip install -e '.[dev,storage]'
```

## Container

```bash
docker build -t webinsolito-risolvi-api:0.7.0 .
```

L'immagine gira come utente non-root e include un healthcheck su `/health`. Le migrazioni **non** vengono eseguite automaticamente dal container: vanno lanciate come release/pre-deploy step con `alembic upgrade head`.

Per il deploy controllato completo: `docs/risolvi-pilot-deploy.md`.

## Variabili principali

`RISOLVI_ENV`, `RISOLVI_DATABASE_URL`, `RISOLVI_CAPABILITY_SECRET`, `RISOLVI_CASE_RETENTION_DAYS`, `RISOLVI_DOCUMENT_RETENTION_HOURS`, `RISOLVI_STORAGE_BACKEND`, `RISOLVI_S3_BUCKET`, `RISOLVI_S3_REGION`, `RISOLVI_S3_ENDPOINT_URL`, `RISOLVI_SIGNED_URL_SECONDS`, `RISOLVI_PILOT_ENABLED`, `RISOLVI_REVIEWER_SECRET`, `RISOLVI_ALLOWED_ORIGINS`, `RISOLVI_PILOT_NOTICE_VERSION`, `RISOLVI_AUTO_CREATE_SCHEMA`.

Vedi `.env.production.example` per un template senza segreti.

## Gate ancora aperti

- legal review specialistica del rule pack (#79);
- split autonomo `REFUND` vs esercizio del recesso;
- provisioning effettivo delle risorse cloud dedicate e smoke test dell'ambiente pilot;
- pilot reale da 50–100 casi con consenso e decisione GO/RESCOPE/KILL (#83).

Il servizio B2C RISOLVI resta progettato come **gratuito end-to-end**: nessun account obbligatorio, credito, abbonamento o paywall per ottenere l'azione e il follow-up.
