# RISOLVI — pilot-readiness runbook

Data baseline: 2026-10-13. Questo runbook descrive il processo tecnico per produrre un'evidenza GO/NO-GO del pilot; non sostituisce review legale, privacy o sicurezza.

## Regola di fondo

Un ambiente è `GO` solo quando **tutti** i gate risultano `PASS`. `UNKNOWN` e `FAIL` bloccano entrambi l'apertura del pilot. CI verde, benchmark tecnico o smoke locale non sono sufficienti.

Usare esclusivamente un ambiente RISOLVI dedicato. Non cancellare, riusare o riconfigurare progetti cloud condivisi per ottenere un PASS.

## 1. Preparare il release candidate

Costruire e distribuire un commit preciso, passando la SHA al container:

```bash
SHA="$(git rev-parse HEAD)"
docker build --build-arg RISOLVI_BUILD_SHA="$SHA" -t webinsolito-risolvi-api:"$SHA" services/risolvi-api
```

In production:

```bash
RISOLVI_ENV=production
RISOLVI_BUILD_SHA=<sha-esatta>
RISOLVI_PILOT_ENABLED=true
RISOLVI_PILOT_INTAKE_ENABLED=false
RISOLVI_AUTO_CREATE_SCHEMA=false
```

L'intake deve essere **chiuso** durante deploy e preflight.

## 2. Migrazioni

Eseguire Alembic con la connessione dedicata:

```bash
cd services/risolvi-api
alembic upgrade head
```

Non usare `create_all()` in production. Se runtime e migrazioni hanno endpoint diversi, configurare `RISOLVI_MIGRATION_DATABASE_URL`.

## 3. Preflight fail-closed

```bash
python -m app.preflight --output preflight.json
```

Il preflight deve attestare:

- configurazione production valida;
- pilot attivo ma intake chiuso;
- database raggiungibile;
- schema/migrazioni presenti;
- ClamAV raggiungibile e capace sia di accettare un payload pulito sia di rilevare EICAR;
- storage privato capace di `put`, `get`, `delete` e successivo `get=not-found`.

Se il comando esce non-zero, **non aprire l'intake**.

## 4. Smoke sintetico controllato

Lo smoke richiede temporaneamente intake aperto perché usa le stesse API di un utente. Farlo solo in ambiente pilot protetto e senza traffico reale.

1. Aprire l'intake per la finestra di smoke.
2. Verificare che `/v1/config` mostri il commit SHA atteso.
3. Usare un reviewer pseudonimo dedicato al test.
4. Eseguire:

```bash
export RISOLVI_SMOKE_BASE_URL='https://api-risolvi.example'
export RISOLVI_SMOKE_REVIEWER_ID='rev-smoke'
export RISOLVI_SMOKE_REVIEWER_SECRET='<credenziale-dedicata>'
python -m app.remote_smoke --output smoke.json
```

5. Richiudere immediatamente l'intake.

Lo smoke verifica con soli dati sintetici:

- health e ready;
- versione/commit del deploy;
- creazione pratica e facts;
- extraction server-side e provenance (`document_id`, pagina, span);
- consenso pilot;
- upload originale sintetico;
- submit in review;
- assenza di Action Card prima della review;
- decisione umana e reviewer attribution;
- Action Card solo dopo review;
- outcome;
- export senza capability/reviewer secret;
- cancellazione e pratica non più accessibile.

Il report non contiene i token usati durante lo smoke.

## 5. Evidenze manuali

Copiare il template senza alterare prematuramente gli stati:

```bash
cp readiness-evidence.example.json readiness-evidence.json
```

I gate manuali sono:

- `dedicated_infrastructure`: conferma che DB/storage/runtime siano dedicati al pilot RISOLVI;
- `legal_signoff`: evidenza collegata a #79;
- `privacy_security`: evidenza collegata a #100;
- `document_pipeline`: evidenza collegata a #81.

Per dichiarare `PASS` servono `reference_id`, `reviewed_by` pseudonimo e `reviewed_at` timezone-aware. Non usare nome, email, note del caso o dati personali nel manifest.

## 6. Aggregare il report

```bash
pilot-readiness \
  --preflight preflight.json \
  --smoke smoke.json \
  --evidence readiness-evidence.json \
  --json-out readiness.json \
  --markdown-out readiness.md
```

Per default preflight e smoke devono essere più recenti di 24 ore. Il comando verifica anche che abbiano stesso commit SHA, stessa service version e ambiente `production`.

Gli input vengono rappresentati nel report con digest SHA-256: il report non copia documenti, credenziali o contenuto grezzo degli artefatti.

## 7. Interpretazione

- `GO`: tutti i gate sono `PASS`.
- `NO-GO` + `FAIL`: esiste un controllo esplicitamente fallito o un'attestazione PASS invalida.
- `NO-GO` + `UNKNOWN`: manca evidenza sufficiente; non è consentito trattarlo come successo.

Non trasformare manualmente `UNKNOWN` in `PASS` per “sbloccare” il pilot.

## 8. Evidenza GitHub

Allegare o riportare i risultati normalizzati a:

- #101 per il vero smoke production-like;
- #79 per il sign-off consumer-law;
- #100 per privacy/security operativa;
- #81 per pipeline documentale;
- #111 per l'aggregazione finale;
- #83 solo quando #111 è realmente `GO`.

L'implementazione del comando `pilot-readiness` non chiude da sola #111.

## 9. Stop-pilot

Se dopo il GO emerge un incidente S0/S1, un errore giuridico materiale, un problema di cancellazione/retention, un bypass della review umana o indisponibilità del malware scanner:

1. impostare `RISOLVI_PILOT_INTAKE_ENABLED=false`;
2. non interrompere l'accesso a pratiche già accettate se ciò impedirebbe cancellazione/follow-up;
3. conservare soltanto audit minimali consentiti;
4. aprire/aggiornare l'incidente e riportare il gate pertinente a `FAIL` o `UNKNOWN`;
5. rieseguire l'intero readiness flow prima di riaprire.

## Vincoli

- Nessun dato personale nello smoke.
- Nessun invio automatico verso venditori.
- Nessun bucket pubblico.
- Nessun bypass ClamAV in production.
- Nessun progetto cloud condiviso usato come scorciatoia.
- Nessuna dichiarazione di validazione legale basata sul benchmark tecnico.
