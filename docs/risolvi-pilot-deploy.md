# RISOLVI — runbook pilot controllato

Questa procedura porta RISOLVI v0.7 in un ambiente pilot **supervisionato**, non in rilascio pubblico autonomo. Il requisito funzionale resta: servizio B2C gratuito end-to-end, nessun paywall, nessun credito e nessun invio automatico.

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

Configurazione minima produzione:

```text
RISOLVI_ENV=production
RISOLVI_AUTO_CREATE_SCHEMA=false
RISOLVI_PILOT_ENABLED=true
RISOLVI_DATABASE_URL=postgresql+psycopg://...
RISOLVI_STORAGE_BACKEND=s3
RISOLVI_S3_BUCKET=...
RISOLVI_ALLOWED_ORIGINS=https://<frontend>,https://<reviewer>
```

## 3. Migrazione database

`create_all()` è proibito in produzione. Prima del primo avvio applicativo:

```bash
cd services/risolvi-api
alembic upgrade head
```

Verificare poi:

```bash
alembic current
alembic heads
```

I due comandi devono indicare la stessa revisione head.

## 4. Build e avvio API

Build locale/CI:

```bash
docker build -t webinsolito-risolvi-api:0.7.0 services/risolvi-api
```

Avvio del container con le variabili produzione fornite dal secret manager del provider. Non passare segreti nella command line o nei log di build.

Probe:

- `GET /health` = liveness del processo;
- `GET /ready` = verifica che il database risponda;
- `GET /v1/config` = configurazione pubblica non sensibile.

Il traffico utente non va aperto se `/ready` non restituisce `200`.

## 5. Frontend utente

`risolvi/config.js` contiene l'origine API. Nell'ambiente pilot sostituire `apiBase` con l'HTTPS origin reale dell'API, senza slash finale.

Esempio:

```js
window.RISOLVI_CONFIG = Object.freeze({
  apiBase: 'https://api-pilot.example.it',
});
```

Non inserire token, chiavi o credenziali in questo file.

Smoke test utente:

1. aprire RISOLVI senza account;
2. caricare un documento innocuo di test;
3. verificare che l'estrazione iniziale avvenga nel browser;
4. confermare i fatti e il consenso pilot;
5. verificare che la pratica mostri `PENDING_REVIEW`;
6. verificare che nessuna Action Card sia visibile prima della decisione reviewer.

## 6. Reviewer console

Servire `risolvi-review/` su origine separata e, se possibile, protetta a livello hosting/VPN/identity proxy. `noindex` non è un controllo di accesso.

Il reviewer inserisce a runtime `RISOLVI_REVIEWER_SECRET`; il secret resta in `sessionStorage` e viene inviato solo come `X-Reviewer-Token` verso l'API.

Test minimo:

- token errato → `404`;
- token corretto → coda visibile;
- documento autorizzato scaricabile;
- una decisione `PASS_AUTONOMOUS` rende l'Action Card disponibile all'utente;
- una decisione modificata conserva il candidato originale e consegna soltanto la raccomandazione finale.

## 7. Retention

Eseguire almeno ogni ora:

```bash
python -m app.retention
```

Default pilot:

- originali: 24 ore;
- pratica strutturata: 7 giorni.

Verificare periodicamente che la cancellazione rimuova sia metadata DB sia blob storage. La lifecycle del bucket è solo una protezione aggiuntiva, non sostituisce il job applicativo.

## 8. Checklist prima del primo caso reale

Devono essere veri tutti i punti seguenti:

- CI verde, compreso benchmark da 200 casi, test migrazioni e build container;
- PostgreSQL e bucket dedicati;
- HTTPS su tutte le origini;
- CORS limitato alle origini effettive;
- secret diversi e non presenti nel repository;
- `/ready` verde;
- retention verificata;
- reviewer console accessibile soltanto al team pilot;
- Action Card bloccata fino a review;
- informativa/consenso pilot coerenti con `pilot-2026-10-v1`;
- nessun caso reale fuori dal perimetro definito in #83.

Il pilot pubblico/reclutamento esterno resta subordinato al gate legale #79. Fino a quel momento usare solo casi sintetici o partecipanti controllati con revisione umana obbligatoria.

## 9. Rollback

Se una release degrada sicurezza o routing:

1. bloccare nuovo traffico al frontend;
2. disabilitare `RISOLVI_PILOT_ENABLED` oppure riportare il runtime alla release precedente;
3. non fare downgrade distruttivi del database durante l'incidente;
4. preservare audit/metriche necessarie alla diagnosi, rispettando la retention;
5. aprire un incident log e classificare l'errore S0–S4.

Le migrazioni database devono essere forward-compatible. Un downgrade Alembic va usato solo in ambiente controllato dopo verifica esplicita della perdita dati.
