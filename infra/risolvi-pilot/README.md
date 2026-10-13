# RISOLVI dedicated pilot deployment pack

Questo pacchetto porta il release candidate RISOLVI su una **VM UE dedicata** senza trasformare un test tecnico in un falso GO. Il pilot parte con intake chiuso; lo smoke sintetico lo apre solo temporaneamente e lo richiude tramite `trap` anche in caso di errore.

## Architettura

```text
Internet
  |
  v
Caddy :80/:443  ---- TLS automatico
  |
  v
RISOLVI API :8000  (rete Docker privata, nessuna porta host)
  |        |        \
  |        |         +--> ClamAV :3310
  |        +------------> PostgreSQL :5432
  +---------------------> S3-compatible private bucket

Retention worker usa lo stesso Case Engine e applica la retention configurata.
```

Solo Caddy pubblica porte sull'host. PostgreSQL, API e ClamAV restano sulla rete `private` marcata `internal: true`. Lo storage consigliato è un bucket S3-compatible dedicato in regione UE; esiste un profilo `self-hosted-s3` per un pilot su singola VM, ma va usato solo dopo aver pin-nato le immagini per digest e accettato il rischio operativo di avere compute e object storage sullo stesso host.

## Requisiti host

- VM dedicata in regione UE, non condivisa con altri progetti;
- Ubuntu/Debian aggiornato o equivalente;
- Docker Engine + Docker Compose v2;
- DNS `RISOLVI_DOMAIN` puntato alla VM;
- firewall host/provider: ingresso consentito solo su TCP 22 da IP amministrativi, TCP 80/443 e UDP 443; nessuna esposizione di 5432, 8000, 9000 o 3310;
- disco cifrato dal provider se disponibile;
- accesso SSH a chiave, password login disabilitato;
- backup DB cifrato e trasferito off-host secondo una retention approvata.

## 1. Preparazione

```bash
cd infra/risolvi-pilot
cp .env.example .env
chmod 600 .env
```

Compilare `.env` con credenziali **dedicate**. Non riusare secret di altri progetti. Generare valori casuali lunghi per PostgreSQL, capability token e reviewer token. Il bucket S3 deve essere privato e privo di accesso anonimo/pubblico.

La configurazione di esempio è intenzionalmente non distribuibile: `scripts/check-env.py` blocca placeholder, secret corti, dominio di esempio, reviewer incoerenti e intake aperto.

## 2. Deploy con storage S3 esterno

```bash
bash scripts/deploy.sh
```

Il deploy:

1. lega la build al `git rev-parse HEAD` esatto;
2. valida la configurazione;
3. builda il container RISOLVI;
4. avvia PostgreSQL e ClamAV;
5. applica Alembic;
6. avvia API, retention worker e Caddy con intake chiuso;
7. attende `/ready` via HTTPS;
8. esegue il preflight production e salva `evidence/preflight.json`.

Per il profilo S3 self-hosted:

```bash
# in .env:
# RISOLVI_S3_ENDPOINT_URL=http://minio:9000
# RISOLVI_S3_FORCE_PATH_STYLE=true
bash scripts/deploy.sh --self-hosted-s3
```

Prima di usarlo nel pilot, sostituire `latest` con immagini/digest verificati e documentare il riferimento nell'evidenza infrastrutturale.

## 3. Smoke E2E reale

Con il runtime già raggiungibile:

```bash
bash scripts/smoke.sh
```

Lo script apre temporaneamente l'intake soltanto per lo smoke sintetico, verifica il flusso end-to-end e richiude l'intake anche su errore. Dopo lo smoke riesegue il preflight con intake chiuso. Gli artefatti sono in `evidence/` e non devono contenere credenziali o documenti utente.

## 4. Readiness fail-closed

```bash
cp readiness-evidence.example.json readiness-evidence.json
```

I quattro gate manuali restano `UNKNOWN` finché non esiste evidenza vera:

- `dedicated_infrastructure`;
- `legal_signoff` (#79);
- `privacy_security` (#100);
- `document_pipeline` (#81).

Per ogni PASS inserire un `reference_id` verificabile, un reviewer pseudonimo e `reviewed_at` ISO-8601. Non usare nome/email del reviewer.

```bash
bash scripts/readiness.sh
```

`UNKNOWN` e `FAIL` producono entrambi `NO-GO`. Il pilot pubblico non va aperto finché il report non è GO e #101/#111 non sono chiuse con evidenze reali.

## Backup e recovery

Backup DB manuale:

```bash
bash scripts/backup.sh
```

Il file locale è solo una tappa: trasferirlo subito in un archivio cifrato off-host approvato. Per privacy-by-design, gli originali caricati non vengono inclusi automaticamente nei backup: hanno una retention breve e il ripristino di documenti personali scaduti sarebbe contrario alla policy del pilot.

Recovery minima:

1. fermare intake (`RISOLVI_PILOT_INTAKE_ENABLED=false`) e ricreare `api`;
2. ripristinare PostgreSQL su volume/istanza pulita;
3. eseguire `alembic upgrade head` sullo stesso commit del backup o su un percorso di migrazione testato;
4. verificare bucket privato, ClamAV e retention;
5. eseguire `preflight.sh`;
6. solo dopo eseguire uno smoke sintetico.

Non usare un restore come scorciatoia per reintrodurre blob oltre la retention prevista.

## Aggiornamento release

```bash
git fetch origin
git checkout main
git pull --ff-only
cd infra/risolvi-pilot
bash scripts/deploy.sh
bash scripts/smoke.sh
```

Il nuovo container viene identificato dal commit SHA. Non promuovere manualmente un'immagine con SHA diverso dagli artefatti preflight/smoke.

## Rollback

Il rollback applicativo deve puntare a un commit noto e compatibile con lo schema DB corrente. Prima di tornare indietro:

- chiudere intake;
- creare backup DB;
- verificare la compatibilità delle migrazioni;
- fare checkout del commit precedente;
- eseguire `deploy.sh` e poi `smoke.sh`.

Se una migrazione non è reversibile, non eseguire downgrade improvvisati: ripristinare da backup in ambiente isolato e validare prima.

## Evidenza da conservare per #101

Conservare soltanto evidenza normalizzata/secret-free:

- provider/regione e ID ambiente;
- commit SHA distribuito;
- output `preflight.json`;
- output `smoke.json`;
- `readiness.json` e `readiness.md`;
- prova firewall/rete privata;
- prova bucket privato e lifecycle/retention;
- prova backup/recovery testato;
- riferimenti ai sign-off manuali.

Niente token, password, documenti reali o dump DB nelle issue GitHub.
