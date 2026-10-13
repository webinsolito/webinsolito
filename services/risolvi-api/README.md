# RISOLVI API v0.14

Case Engine privacy-first di WEBINSOLITO per il pilot supervisionato di RISOLVI. La v0.14 mantiene il gate di pilot-readiness fail-closed della v0.13 e aggiunge un **benchmark documentale separato dal benchmark legale**, provenance pagina-per-pagina e maggiore parità tra extractor browser e backend.

## Principio operativo

L'estrazione comprende i documenti; le regole deterministiche decidono il percorso; le fonti supportano la raccomandazione; il reviewer umano controlla l'Action Card durante il Wizard-of-Oz. Nessun invio automatico al venditore.

Il B2C resta **gratuito end-to-end**: niente account obbligatorio, abbonamenti, crediti o paywall.

## Sicurezza e privacy di base

- `POST /v1/cases` restituisce una capability una sola volta; il server conserva solo l'HMAC.
- Endpoint pratica: `X-Case-Token`.
- Endpoint reviewer: `X-Reviewer-Id` + `X-Reviewer-Token` distinti per reviewer in production.
- Reviewer ID pseudonimo: `a-z`, `0-9`, `.`, `_`, `-`, 3–64 caratteri; non usare nome/email.
- Originali: allow-list + signature sniffing + malware scan prima di parsing/persistenza.
- Production richiede PostgreSQL, private S3-compatible storage e ClamAV.
- Risposte API: `Cache-Control: no-store`, `nosniff`, no-referrer, frame deny; HSTS in production.
- Retention pilot default: originali 24 ore, pratica 7 giorni.

## Extraction: fatti espliciti, provenance e documenti non fidati

`ExtractionBundle` conserva `prefill` per compatibilità e `structured_facts`: ogni fatto critico è presente con valore estratto oppure `null`. Un conflitto produce `null`, non una scelta arbitraria.

I fatti documentali coperti dal prototipo includono, quando supportati dall'evidenza:

- tipo di problema;
- venditore;
- data ordine;
- riferimento ordine;
- prodotto;
- data di consegna e consegna promessa;
- indicatori di acquisto a distanza, venditore professionale e bene fisico.

Ogni candidato mantiene provenance (`document_id`, filename, pagina, span, metodo). Gli input client possono conservare pagine separate e il metodo effettivo per pagina, per esempio `CLIENT_PDF_TEXT` sulla pagina 1 e `CLIENT_OCR` sulla pagina 2. I fatti mancanti non vengono inventati e i conflitti non vengono precompilati.

L'extractor browser conserva la struttura a righe di testo/OCR e, per i PDF, usa i separatori pagina/linea disponibili prima di applicare le euristiche. Stringhe che assomigliano a prompt (`ignore previous instructions`, `system prompt`, varianti italiane, ecc.) restano **contenuto del documento**, non istruzioni: non possono creare diritti, route o fatti non supportati.

## Evaluation documentale

Il benchmark documentale è volutamente separato dai 200 casi di routing legale. Usa fixture sintetiche/de-identificate e verifica fatti, `null` espliciti, conflitti e provenance.

```bash
python -m app.document_evaluation --strict
# oppure, dopo l'installazione del package
document-evaluation --strict
```

Il gate fallisce se anche un solo caso non corrisponde al gold oppure se provenance, missing facts o conflitti non raggiungono il 100% richiesto dal dataset corrente. Il report include il digest SHA-256 del dataset per rendere il risultato riproducibile.

La parità minima del parser locale/browser è verificata senza rete:

```bash
node risolvi/extractor-benchmark.mjs
```

Questo benchmark **non dimostra ancora la qualità su fotografie/PDF reali eterogenei**. La chiusura completa di #81 richiede ancora un corpus de-identificato controllato e una verifica manuale dei casi OCR difficili.

## Build identity

La readiness deve provare che preflight e smoke appartengono allo stesso deploy. Impostare:

```bash
RISOLVI_BUILD_SHA=<sha-git-esatto-del-deploy>
```

Il valore non è un segreto ed è esposto da `/v1/config` insieme a `environment` e `service_version`. `unknown` mantiene l'app avviabile, ma il report finale resta `NO-GO`.

Build container consigliata:

```bash
docker build \
  --build-arg RISOLVI_BUILD_SHA="$(git rev-parse HEAD)" \
  -t webinsolito-risolvi-api:0.14.0 .
```

## Preflight production

Con intake chiuso:

```bash
RISOLVI_PILOT_ENABLED=true
RISOLVI_PILOT_INTAKE_ENABLED=false
python -m app.preflight --output preflight.json
```

Il preflight verifica:

- configurazione production fail-closed;
- DB raggiungibile;
- schema/migrazioni;
- ClamAV, sia percorso clean sia rilevazione EICAR;
- private storage con `put → get → delete → get=not-found`.

Il report contiene timestamp UTC, ambiente, versione, commit SHA e soli esiti normalizzati. Non contiene hostname di errore provider, token o dati utente.

## Smoke test sintetico

Solo su ambiente pilot dedicato/protetto. L'intake può essere aperto temporaneamente per il test e va richiuso subito dopo.

```bash
export RISOLVI_SMOKE_BASE_URL='https://api-risolvi.example'
export RISOLVI_SMOKE_REVIEWER_ID='rev-smoke'
export RISOLVI_SMOKE_REVIEWER_SECRET='<credenziale-dedicata>'
python -m app.remote_smoke --output smoke.json
```

Lo smoke usa soltanto dati sintetici e verifica: health/ready, release identity, pratica, fatti, extraction server-side + provenance, consenso, upload originale, submit, Action Card assente prima della review, decisione umana e attribution, Action Card dopo review, outcome, export senza credenziali, delete e pratica non più raggiungibile. Il cleanup è best-effort anche su errore.

## Pilot-readiness GO / NO-GO

Il comando aggrega evidenze tecniche e sign-off manuali senza copiare contenuto o segreti nel report:

```bash
cp readiness-evidence.example.json readiness-evidence.json
# compilare con evidenze REALI; non trasformare UNKNOWN in PASS senza review

pilot-readiness \
  --preflight preflight.json \
  --smoke smoke.json \
  --evidence readiness-evidence.json \
  --json-out readiness.json \
  --markdown-out readiness.md
```

Gate principali:

- stesso commit/versione/ambiente production tra preflight e smoke;
- artefatti recenti (24h di default);
- infrastruttura dedicata;
- migrazioni, DB, storage privato, ClamAV;
- health, ready, upload, extraction+provenance, consenso;
- review umana e Action Card nascosta prima della review;
- outcome e cancellazione;
- sign-off legale (#79);
- checklist privacy/security (#100);
- validazione pipeline documentale (#81).

**`UNKNOWN` blocca il GO esattamente come `FAIL`.** Il comando esce con codice 0 solo se ogni gate è `PASS`. Gli input sono rappresentati nel report tramite digest SHA-256, non incorporati integralmente.

La presenza del comando o di test CI verdi **non chiude #111**: per il vero GO servono un run sull'infrastruttura dedicata e i sign-off reali.

Runbook completo: `docs/risolvi-pilot-readiness.md`.

## Pilot Wizard-of-Oz

1. Il client crea una pratica e salva solo fatti confermati.
2. Registra il consenso pilot.
3. Gli originali vengono validati/scansionati.
4. `/pilot/submit` calcola la candidata senza mostrarla.
5. Il reviewer autenticato esamina caso e documenti.
6. `/decision` persiste decisione, reviewer ID pseudonimo e audit minimale.
7. Solo dopo review `/pilot/action` rilascia l'Action Card.
8. `/analyse` resta bloccato in pilot mode.

Classificazioni: `PASS_AUTONOMOUS`, `MINOR_EDIT`, `MATERIAL_EDIT`, `WRONG_ROUTE`, `UNSUPPORTED_MISSED`, `LEGAL_REVIEW_REQUIRED`.

## Database e migrazioni

Production usa PostgreSQL e Alembic:

```bash
alembic upgrade head
```

`RISOLVI_AUTO_CREATE_SCHEMA=false` è obbligatorio in production. Si possono separare:

- `RISOLVI_DATABASE_URL` per runtime;
- `RISOLVI_MIGRATION_DATABASE_URL` per Alembic.

Il job retention è idempotente:

```bash
python -m app.retention
```

## Evaluation del routing

```bash
python -m app.evaluation --strict
```

I 200 casi sono gold **tecnico sintetico/de-identificato**, non validazione legale. Il D.Lgs. 25 settembre 2026 n. 176, pubblicato il 7/10/2026, entra in vigore il **22/10/2026**: il rule pack corrente non anticipa il cutover e deve restare fail-closed dove previsto finché non riceve il sign-off specialistico.

## Avvio locale

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
export RISOLVI_PILOT_ENABLED=true
export RISOLVI_PILOT_INTAKE_ENABLED=true
export RISOLVI_REVIEWER_SECRET='secret-locale-lungo-e-casuale'
uvicorn app.main:app --reload
```

Per S3-compatible storage:

```bash
pip install -e '.[dev,storage]'
```

## Gate ancora aperti

- sign-off consumer-law del rule pack (#79);
- corpus documentale reale/de-identificato e verifica OCR/PDF difficile (#81);
- privacy/security operativa su ambiente reale (#100);
- provisioning dedicato + smoke production-like (#101);
- report #111 con tutti i gate realmente PASS;
- solo dopo: pilot da 50–100 casi reali (#83).
