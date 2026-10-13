# RISOLVI — Supabase production-like pilot

Questo runbook descrive un ambiente **dedicato** a RISOLVI per il Wizard-of-Oz. Non riusare database o bucket di altri prodotti WEBINSOLITO.

## 1. Principi

- un progetto Supabase dedicato a RISOLVI;
- un bucket privato dedicato agli originali;
- credenziali S3 solo server-side;
- database e storage separati dal frontend pubblico;
- nessun documento personale nei log applicativi;
- Action Card sempre dietro review umana durante il pilot;
- servizio B2C gratuito end-to-end.

## 2. Connessione PostgreSQL

Usare due URL distinti quando il provider/runtime lo richiede:

- `RISOLVI_DATABASE_URL`: connessione runtime del container;
- `RISOLVI_MIGRATION_DATABASE_URL`: connessione diretta usata da Alembic.

Per un backend persistente:

- preferire la connessione diretta se il runtime dispone di IPv6 o dell'opzione IPv4 del provider;
- su runtime IPv4-only usare il shared pooler in **session mode** per l'API;
- non usare transaction mode per un backend SQLAlchemy persistente senza una configurazione specifica del driver;
- per Alembic, dump/restore e operazioni amministrative usare la connessione diretta quando disponibile.

Entrambi gli URL devono richiedere TLS (`sslmode=require`). La password del database va percent-encoded nella connection string quando contiene caratteri riservati.

Eseguire le migrazioni come release step separato:

```bash
cd services/risolvi-api
alembic upgrade head
```

L'app production deve avere `RISOLVI_AUTO_CREATE_SCHEMA=false`.

## 3. Supabase Storage via protocollo S3

Creare un bucket privato dedicato, ad esempio `risolvi-originals`.

Generare le S3 access keys dalle impostazioni Storage del progetto. Queste chiavi hanno privilegi server-side elevati sullo storage del progetto: non vanno mai inserite nel frontend, in `risolvi/config.js`, nella console reviewer o nel repository.

Configurazione runtime:

```bash
RISOLVI_STORAGE_BACKEND=s3
RISOLVI_S3_BUCKET=risolvi-originals
RISOLVI_S3_REGION=<regione mostrata da Supabase>
RISOLVI_S3_ENDPOINT_URL=https://<project-ref>.storage.supabase.co/storage/v1/s3
RISOLVI_S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=<server-only>
AWS_SECRET_ACCESS_KEY=<server-only>
```

L'adapter RISOLVI usa path-style addressing quando `RISOLVI_S3_FORCE_PATH_STYLE=true`.

Non invia `x-amz-server-side-encryption`: il protocollo S3 di Supabase non supporta quell'header per `PutObject`. La cifratura a riposo va verificata/configurata a livello di provider e inclusa nella checklist privacy dell'ambiente, non presunta dal client S3.

## 4. Retention e cancellazione

Default pilot:

- originali: 24 ore;
- pratica guest: 7 giorni.

Eseguire periodicamente:

```bash
python -m app.retention
```

Prima di aprire il pilot, verificare con un caso sintetico che:

1. l'upload finisca nel bucket privato;
2. il reviewer possa accedere solo dopo autenticazione reviewer;
3. la cancellazione della pratica rimuova sia record DB sia blob;
4. il retention job sia idempotente;
5. nessun capability token o reviewer token compaia nell'export o nei log.

## 5. Smoke test obbligatorio

Dopo ogni provisioning o modifica infrastrutturale:

1. `GET /health` -> `200`;
2. `GET /ready` -> `200`;
3. crea una pratica anonima;
4. salva fatti sintetici;
5. registra consenso pilot;
6. carica un documento sintetico non personale;
7. submit: l'utente **non** deve ancora vedere l'Action Card;
8. reviewer approva/modifica;
9. l'utente riceve l'Action Card;
10. registra un outcome;
11. export: nessun token;
12. delete: DB + blob rimossi.

Se un controllo fallisce, il pilot resta chiuso.

## 6. Gate non tecnici

Il provisioning non sostituisce i gate già aperti:

- legal sign-off del rule pack (#79);
- checklist privacy/operativa (#100);
- smoke test ambiente dedicato (#101);
- 50–100 casi reali controllati e decisione GO/RESCOPE/KILL (#83).
