# RISOLVI API v0.12

Case Engine privacy-first di WEBINSOLITO. La v0.12 mantiene persistenza, capability, retention, benchmark da 200 casi, migrazioni Alembic, PostgreSQL/S3, human review obbligatoria, kill switch intake, type sniffing, malware gate ClamAV, response hardening e preflight attivo; aggiunge **identità reviewer pseudonime, credenziali distinte per reviewer e audit minimale delle decisioni umane**.

## Modello di sicurezza

- `POST /v1/cases` crea una pratica e restituisce **una sola volta** `capability_token`.
- Il server conserva solo un HMAC-SHA256 del token; il token originale non viene salvato.
- Gli endpoint della pratica richiedono `X-Case-Token`.
- Gli endpoint reviewer richiedono **entrambi** `X-Reviewer-Id` e `X-Reviewer-Token`.
- In production pilot ogni reviewer ha una credenziale distinta configurata in `RISOLVI_REVIEWER_CREDENTIALS_JSON`; il vecchio secret condiviso resta solo come fallback development/test.
- Il reviewer ID è un alias pseudonimo ristretto a `a-z`, `0-9`, `.`, `_`, `-`, lungo 3–64 caratteri: non usare nome, cognome o email.
- I token non vengono letti dalla query string e non compaiono nell'export.
- Accesso negato e risorsa inesistente restituiscono entrambi `404`, riducendo l'enumerazione.
- Reviewer ID e token non vanno incorporati nel bundle statico: la console li chiede a runtime e li conserva soltanto in `sessionStorage`.

### Attribution delle decisioni umane

Quando un reviewer conferma una decisione:

1. il server autentica la coppia `reviewer_id + token`;
2. `pilot_reviews.reviewer_id` conserva l'alias che ha deciso;
3. viene scritto `audit_events.event = pilot.review.decided` con `actor_type=REVIEWER`, `actor_id=<reviewer_id>` e soli metadati minimali (`review_id`, classificazione, severity);
4. token, note reviewer, documenti e testo della pratica **non** vengono copiati nell'audit event.

Le review storiche precedenti alla v0.12 restano valide con `reviewer_id = NULL`. La migrazione è `20261013_0002_reviewer_audit.py`.

## Privacy e header HTTP

Tutte le risposte HTTP dell'API, inclusi errori gestiti ed export, ricevono:

- `Cache-Control: no-store, max-age=0`;
- `Pragma: no-cache`;
- `Expires: 0`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- `X-Frame-Options: DENY`;
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

In ambiente `production` viene aggiunto HSTS (`Strict-Transport-Security`). Gli originali restano `attachment`; con storage S3 il backend può restituire un redirect temporaneo firmato, mentre con storage locale/proxy il contenuto passa direttamente dall'API. In entrambi i casi l'accesso iniziale richiede la capability o la credenziale reviewer.

## Sicurezza documenti

Gli originali non vengono accettati soltanto in base a estensione o `Content-Type` dichiarato dal browser. Il server verifica un allow-list di formati e la coerenza dei byte:

- PDF: signature `%PDF-`;
- PNG/JPEG/WEBP/HEIC: header/brand attesi;
- TXT/HTML: payload prevalentemente testuale e senza NUL;
- EML: payload testuale con header email riconoscibile.

Metadati e contenuto incoerenti vengono rifiutati. Il limite di **8 originali per pratica** è applicato server-side.

Prima di parsing server-side o persistenza, i byte passano dal malware gate. In produzione `RISOLVI_MALWARE_SCANNER=clamav` è obbligatorio. Il client usa ClamAV `INSTREAM`, senza scrivere il file su disco locale. Malware rilevato restituisce `422`; scanner non raggiungibile o scan indeterminato restituisce `503` e il file non viene scritto nello storage.

`clamd` deve essere raggiungibile soltanto sulla rete privata del runtime.

## Pilot e kill switch intake

`RISOLVI_PILOT_ENABLED` abilita l'infrastruttura Wizard-of-Oz. `RISOLVI_PILOT_INTAKE_ENABLED` controlla separatamente l'accettazione di nuove pratiche/scritture utente.

Deploy sicuro:

```bash
RISOLVI_PILOT_ENABLED=true
RISOLVI_PILOT_INTAKE_ENABLED=false
```

Con intake chiuso, nuove pratiche ricevono `503 pilot_intake_paused`, ma review umana, Action Card di pratiche già inviate, outcome e cancellazione restano disponibili.

## Reviewer credentials

Production pilot richiede una mappa JSON server-side:

```bash
export RISOLVI_REVIEWER_CREDENTIALS_JSON='{"rev-01":"<token-casuale-1>","rev-02":"<token-casuale-2>"}'
```

Vincoli:

- ogni ID deve essere pseudonimo e rispettare il pattern previsto;
- ogni token deve essere distinto;
- in production ogni token deve essere lungo almeno 32 caratteri;
- rimuovere una coppia dalla mappa revoca l'accesso di quel reviewer al successivo deploy/config reload;
- `/v1/config` non espone IDs, token o conteggio delle credenziali.

## Configurazione pubblica e CORS

`GET /v1/config` espone solo versione servizio, stato pilot/intake, versione del consenso, retention e limiti upload.

Se frontend e API sono su origini diverse:

```bash
export RISOLVI_ALLOWED_ORIGINS='https://www.webinsolito.it,https://review.webinsolito.it'
```

CORS ammette esplicitamente `X-Reviewer-Id` e `X-Reviewer-Token`; wildcard `*` e origini HTTP non-localhost vengono rifiutate.

## Database, migrazioni e storage

In produzione `RISOLVI_DATABASE_URL` deve essere PostgreSQL (`postgresql+psycopg://...`). SQLite è supportato soltanto per sviluppo e test.

Tabelle principali: `cases`, `facts`, `documents`, `recommendations`, `actions`, `outcomes`, `rules`, `sources`, `audit_events`, `pilot_participations`, `pilot_reviews`.

La produzione usa Alembic:

```bash
alembic upgrade head
```

`RISOLVI_AUTO_CREATE_SCHEMA` deve essere `false` in produzione. Per endpoint DB separati:

- `RISOLVI_DATABASE_URL` per runtime;
- `RISOLVI_MIGRATION_DATABASE_URL` per Alembic.

Retention pilot di default:

- originali: 24 ore;
- pratica: 7 giorni.

```bash
python -m app.retention
```

Il job è idempotente. La cancellazione del caso elimina anche consenso/review/audit collegati alla pratica.

## Preflight production

Prima di aprire l'intake, con `RISOLVI_PILOT_INTAKE_ENABLED=false`:

```bash
python -m app.preflight
```

Il comando fallisce chiuso se configurazione, DB, schema/migrazioni, malware scanner o private storage non sono pronti. Il malware self-test verifica sia un payload sintetico pulito sia il test EICAR standard. EICAR viene inviato a `clamd` in memoria via `INSTREAM`, non viene scritto nello storage e la signature del motore non viene esposta.

## Smoke test remoto

Su ambiente production-like protetto, con intake temporaneamente aperto:

```bash
pip install -e '.[dev]'
export RISOLVI_SMOKE_BASE_URL='https://api-risolvi.example'
export RISOLVI_SMOKE_REVIEWER_ID='rev-smoke'
export RISOLVI_SMOKE_REVIEWER_SECRET='<la-credenziale-associata-a-rev-smoke>'
python -m app.remote_smoke
```

Lo smoke crea una pratica sintetica, verifica consenso, upload, `PENDING_REVIEW`, decisione umana, **reviewer attribution**, Action Card, outcome, export senza segreti e cancellazione finale. Capability e credenziale reviewer non vengono stampate.

## Probe operativi

- `GET /health`: liveness;
- `GET /ready`: readiness con query DB;
- `GET /v1/config`: configurazione pubblica non sensibile.

Un deploy non deve ricevere traffico utente finché `/ready` non è verde e il preflight non passa.

## Benchmark e legal cutover

La suite contiene 200 casi sintetici/de-identificati:

```bash
python -m app.evaluation --strict
```

Il benchmark è un **gold tecnico**, non una validazione legale. Le fonti/regole sono versionate in `evals/registry.json`.

Il D.Lgs. 25 settembre 2026 n. 176 è pubblicato il 7/10/2026 ed entra in vigore il **22/10/2026**. La v0.12 non attiva in anticipo le regole future: dal cutover i casi garanzia entrano in `LEGAL_RULEPACK_REVIEW_2026_10_22` finché il rule pack non riceve sign-off specialistico.

Vedi `docs/risolvi-legal-preflight-2026-10-13.md`.

## Wizard-of-Oz

Flusso:

1. il client crea una pratica e salva i fatti confermati;
2. l'utente registra il consenso;
3. eventuali originali vengono validati e scansionati;
4. `/pilot/submit` crea la candidata ma non la mostra;
5. il reviewer autenticato con ID + credenziale esamina il caso;
6. `/decision` persiste decisione e reviewer ID e scrive audit minimale;
7. solo dopo review `pilot/action` rilascia l'Action Card;
8. `/analyse` resta bloccato in pilot mode.

Classificazioni: `PASS_AUTONOMOUS`, `MINOR_EDIT`, `MATERIAL_EDIT`, `WRONG_ROUTE`, `UNSUPPORTED_MISSED`, `LEGAL_REVIEW_REQUIRED`.

## Avvio locale

Il secret condiviso resta disponibile **solo per sviluppo/test**:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
export RISOLVI_PILOT_ENABLED=true
export RISOLVI_PILOT_INTAKE_ENABLED=true
export RISOLVI_REVIEWER_SECRET='usa-un-secret-lungo-e-casuale'
uvicorn app.main:app --reload
```

Anche con fallback locale gli endpoint richiedono un `X-Reviewer-Id` sintatticamente valido; in production pilot la configurazione rifiuta l'avvio se manca `RISOLVI_REVIEWER_CREDENTIALS_JSON`.

Per storage S3-compatible:

```bash
pip install -e '.[dev,storage]'
```

## Container

```bash
docker build -t webinsolito-risolvi-api:0.12.0 .
```

L'immagine gira come utente non-root e include un healthcheck su `/health`. Le migrazioni non vengono eseguite automaticamente dal container.

Per il deploy controllato completo: `docs/risolvi-pilot-deploy.md`.

## Variabili principali

`RISOLVI_ENV`, `RISOLVI_DATABASE_URL`, `RISOLVI_MIGRATION_DATABASE_URL`, `RISOLVI_CAPABILITY_SECRET`, `RISOLVI_CASE_RETENTION_DAYS`, `RISOLVI_DOCUMENT_RETENTION_HOURS`, `RISOLVI_STORAGE_BACKEND`, `RISOLVI_S3_BUCKET`, `RISOLVI_S3_REGION`, `RISOLVI_S3_ENDPOINT_URL`, `RISOLVI_S3_FORCE_PATH_STYLE`, `RISOLVI_SIGNED_URL_SECONDS`, `RISOLVI_MALWARE_SCANNER`, `RISOLVI_CLAMAV_HOST`, `RISOLVI_CLAMAV_PORT`, `RISOLVI_CLAMAV_TIMEOUT_SECONDS`, `RISOLVI_PILOT_ENABLED`, `RISOLVI_PILOT_INTAKE_ENABLED`, `RISOLVI_REVIEWER_CREDENTIALS_JSON`, `RISOLVI_REVIEWER_SECRET` (solo fallback dev/test), `RISOLVI_ALLOWED_ORIGINS`, `RISOLVI_PILOT_NOTICE_VERSION`, `RISOLVI_AUTO_CREATE_SCHEMA`.

## Gate ancora aperti

- legal review specialistica del rule pack (#79);
- split autonomo `REFUND` vs esercizio del recesso;
- provisioning risorse cloud dedicate e smoke test production-like (#101);
- verifica operativa privacy/retention/logging sull'ambiente reale (#100);
- disponibilità reale di ClamAV sulla rete privata;
- pilot reale 50–100 casi con decisione GO/RESCOPE/KILL (#83).

Il servizio B2C RISOLVI resta **gratuito end-to-end**: nessun account obbligatorio, credito, abbonamento o paywall per ottenere azione e follow-up.
