# RISOLVI — runbook pilot controllato

Questa procedura porta RISOLVI v0.9 in un ambiente pilot **supervisionato**, non in rilascio pubblico autonomo. Il requisito funzionale resta: servizio B2C gratuito end-to-end, nessun paywall, nessun credito e nessun invio automatico.

## 1. Risorse dedicate

Non riusare database o bucket di altri prodotti WEBINSOLITO.

Servono:

- PostgreSQL dedicato in regione UE;
- bucket S3-compatible privato in regione UE;
- runtime container per `services/risolvi-api/`;
- hosting statico per `risolvi/`;
- hosting statico/restritto per `risolvi-review/`.

Il bucket deve essere privato. Nessun file utente deve essere pubblicabile tramite path statico. Configurare, quando il provider lo permette, una lifecycle rule di cancellazione a 24 ore come seconda cintura oltre al job applicativo.

## 2. Segreti e configurazione

Partire da `.env.production.example` senza copiarne valori placeholder.

Generare separatamente:

- `RISOLVI_CAPABILITY_SECRET`;
- `RISOLVI_REVIEWER_SECRET`.

Entrambi devono essere casuali e di almeno 32 caratteri; non devono coincidere. Il reviewer secret non va mai inserito nel frontend statico.

Configurazione minima iniziale, con intake chiuso:

```text
RISOLVI_ENV=production
RISOLVI_AUTO_CREATE_SCHEMA=false
RISOLVI_PILOT_ENABLED=true
RISOLVI_PILOT_INTAKE_ENABLED=false
RISOLVI_DATABASE_URL=postgresql+psycopg://...
RISOLVI_STORAGE_BACKEND=s3
RISOLVI_S3_BUCKET=...
RISOLVI_ALLOWED_ORIGINS=https://<frontend>,https://<reviewer>
```

`RISOLVI_PILOT_INTAKE_ENABLED=false` è il kill switch operativo: blocca nuove pratiche e nuove scritture utente, ma non interrompe review, Action Card di casi già inviati, outcome e cancellazione.

## 3. Migrazione database

`create_all()` è proibito in produzione. Prima del primo avvio applicativo:

```bash
cd services/risolvi-api
alembic upgrade head
```

Quando provider/runtime richiedono endpoint differenti, impostare `RISOLVI_MIGRATION_DATABASE_URL` per Alembic e mantenere `RISOLVI_DATABASE_URL` per l'applicazione.

Verificare poi:

```bash
alembic current
alembic heads
```

I due comandi devono indicare la stessa revisione head.

## 4. Build e avvio API

```bash
docker build -t webinsolito-risolvi-api:0.9.0 services/risolvi-api
```

Avviare il container con variabili fornite dal secret manager del provider. Non passare segreti nella command line o nei log di build.

Probe:

- `GET /health` = liveness del processo;
- `GET /ready` = verifica database;
- `GET /v1/config` = configurazione pubblica non sensibile.

Il traffico utente non va aperto se `/ready` non restituisce `200`.

## 5. Preflight production

Con intake ancora chiuso:

```bash
cd services/risolvi-api
python -m app.preflight
```

Il comando deve terminare con `status: ok`. Verifica configurazione, DB, schema/migrazioni e un round-trip sintetico sul private storage. Non usa documenti reali.

Se fallisce, **non** aprire l'intake.

## 6. Frontend utente

`risolvi/config.js` contiene l'origine API. Nell'ambiente pilot sostituire `apiBase` con l'HTTPS origin reale dell'API, senza slash finale. Non inserire token o chiavi.

Il frontend legge `pilot_enabled` e `pilot_intake_enabled`: se l'intake è chiuso mostra la pausa e impedisce l'invio di nuove pratiche, continuando però a ripristinare pratiche già in review dalla sessione browser.

## 7. Reviewer console

Servire `risolvi-review/` su origine separata e, se possibile, protetta a livello hosting/VPN/identity proxy. `noindex` non è un controllo di accesso.

Il reviewer inserisce a runtime `RISOLVI_REVIEWER_SECRET`; il secret resta in `sessionStorage` e viene inviato solo come `X-Reviewer-Token` verso l'API.

Test minimo:

- token errato → `404`;
- token corretto → coda visibile;
- documento autorizzato scaricabile;
- nessuna Action Card prima della review;
- `PASS_AUTONOMOUS` → Action Card disponibile;
- una decisione modificata conserva il candidato originale e consegna soltanto la raccomandazione finale.

## 8. Smoke test sintetico

Lo smoke remoto va eseguito soltanto su ambiente protetto. Aprire temporaneamente l'intake per il test, quindi:

```bash
pip install -e '.[dev]'
export RISOLVI_SMOKE_BASE_URL='https://api-pilot.example.it'
export RISOLVI_REVIEWER_SECRET='...'
python -m app.remote_smoke
```

Il test crea un caso sintetico e verifica:

- create case;
- facts;
- consenso;
- upload sintetico;
- `PENDING_REVIEW` prima della review;
- decisione reviewer;
- Action Card dopo la review;
- outcome;
- export privo di token;
- delete finale e successivo `404`.

Dopo il test riportare `RISOLVI_PILOT_INTAKE_ENABLED=false` finché non sono chiusi tutti i gate del pilot reale.

## 9. Retention

Eseguire almeno ogni ora:

```bash
python -m app.retention
```

Default pilot:

- originali: 24 ore;
- pratica strutturata: 7 giorni.

Verificare periodicamente che la cancellazione rimuova sia metadata DB sia blob storage. La lifecycle del bucket è solo una protezione aggiuntiva, non sostituisce il job applicativo.

## 10. Checklist prima del primo caso reale

Devono essere veri tutti i punti seguenti:

- CI verde, compreso benchmark da 200 casi, test migrazioni, compile check e build container;
- PostgreSQL e bucket dedicati;
- HTTPS su tutte le origini;
- CORS limitato alle origini effettive;
- secret diversi e non presenti nel repository;
- `/ready` verde;
- `python -m app.preflight` verde;
- smoke sintetico completato;
- retention e cancellazione verificate;
- reviewer console accessibile soltanto al team pilot;
- Action Card bloccata fino a review;
- informativa/consenso coerenti con `pilot-2026-10-v1`;
- gate legale #79 compatibile con l'apertura della coorte.

Solo dopo questi controlli aprire `RISOLVI_PILOT_INTAKE_ENABLED=true` per una coorte limitata.

Vedi anche `docs/risolvi-operational-privacy-checklist.md`.

## 11. Rollback / stop-pilot

In caso di incidente o dubbio materiale:

1. impostare `RISOLVI_PILOT_INTAKE_ENABLED=false`;
2. verificare che nuove `POST /v1/cases` ricevano `503 pilot_intake_paused`;
3. non interrompere automaticamente review/cancellazione dei casi già accettati;
4. non fare downgrade distruttivi del database durante l'incidente;
5. preservare solo audit/metriche necessarie alla diagnosi, rispettando retention;
6. classificare l'errore secondo la checklist operativa S0/S1/S2;
7. riaprire intake solo dopo remediation + benchmark/preflight/smoke.

Le migrazioni database devono essere forward-compatible. Un downgrade Alembic va usato solo in ambiente controllato dopo verifica esplicita della perdita dati.
