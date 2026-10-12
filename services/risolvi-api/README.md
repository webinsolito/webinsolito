# RISOLVI API v0.3

Case Engine privacy-first di WEBINSOLITO. La v0.3 sostituisce la memoria volatile con persistenza esplicita e introduce capability guest, retention e storage privato.

## Modello di sicurezza

- `POST /v1/cases` crea una pratica e restituisce **una sola volta** `capability_token`.
- Il server conserva solo un HMAC-SHA256 del token; il token originale non viene salvato.
- Tutti gli endpoint della pratica richiedono `X-Case-Token`.
- Il token non viene letto dalla query string e non compare nell'export.
- Un token valido per una pratica non dà accesso a nessun'altra pratica.
- Accesso negato e ID inesistente restituiscono entrambi `404`, riducendo l'enumerazione degli ID.

## Database

In produzione `RISOLVI_DATABASE_URL` deve essere PostgreSQL (`postgresql+psycopg://...`). SQLite è supportato solo per sviluppo e test.

Tabelle: `cases`, `facts`, `documents`, `recommendations`, `actions`, `outcomes`, `rules`, `sources`, `audit_events`.

La v0.3 usa `create_all` per il prototipo: prima di una produzione reale va introdotto Alembic con migration reviewate.

## Documenti

Il flusso browser-local della v0.2 continua a funzionare. Se l'utente decide di salvare una pratica, `POST /v1/cases/{id}/documents` conserva l'originale in storage privato con chiave casuale che non contiene il nome del file.

- sviluppo/test: directory privata fuori dagli asset pubblici;
- produzione: backend S3-compatible privato (`.[storage]` installa boto3);
- download: capability check prima di un presigned URL breve (30–900 s, default 300 s);
- retention documenti: 24 ore di default, configurabile.

## Retention

Default proposto del prototipo:

- originali: 24 ore;
- pratica strutturata: 7 giorni.

Eseguire periodicamente:

```bash
python -m app.retention
```

Il job è idempotente: elimina blob scaduti e record correlati; una seconda esecuzione non deve cambiare lo stato.

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

## Variabili principali

`RISOLVI_ENV`, `RISOLVI_DATABASE_URL`, `RISOLVI_CAPABILITY_SECRET`, `RISOLVI_CASE_RETENTION_DAYS`, `RISOLVI_DOCUMENT_RETENTION_HOURS`, `RISOLVI_STORAGE_BACKEND`, `RISOLVI_S3_BUCKET`, `RISOLVI_S3_REGION`, `RISOLVI_S3_ENDPOINT_URL`, `RISOLVI_SIGNED_URL_SECONDS`.

In `production` il processo rifiuta SQLite, secret di sviluppo e storage locale.
