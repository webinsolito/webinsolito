# RISOLVI — operational privacy & pilot safety checklist

Questa checklist è un gate operativo per il Wizard-of-Oz. Non sostituisce DPIA, privacy notice o revisione legale specialistica.

## Principio di lancio

Il deploy production-like parte con:

- `RISOLVI_PILOT_ENABLED=true`
- `RISOLVI_PILOT_INTAKE_ENABLED=false`

In questa modalità reviewer, metriche e pratiche già esistenti restano accessibili, ma il motore rifiuta nuove pratiche e nuove scritture utente con `503 pilot_intake_paused`.

L'intake viene aperto **solo** dopo migrazioni, preflight, smoke test sintetico, verifica privacy operativa e gate legale applicabile.

## Pre-pilot obbligatorio

- [ ] Database PostgreSQL dedicato a RISOLVI; nessun riuso di DB di altri prodotti.
- [ ] `alembic upgrade head` eseguito con `RISOLVI_MIGRATION_DATABASE_URL` su endpoint adatto alle migrazioni.
- [ ] Migrazione `20261013_0002_reviewer_audit` applicata e colonne reviewer/audit presenti.
- [ ] `python -m app.preflight` restituisce `status=ok` mentre intake è chiuso.
- [ ] Bucket object storage dedicato e **privato**.
- [ ] Access key storage solo nel runtime server; assente da HTML/JS, GitHub, log e analytics.
- [ ] Round-trip sintetico storage (put/get/delete) riuscito.
- [ ] ClamAV supera sia percorso CLEAN sia self-test EICAR senza persistere il payload di test.
- [ ] `/health` e `/ready` entrambi verdi.
- [ ] CORS limitato esclusivamente alle origini previste; nessun `*`; `X-Reviewer-Id`/`X-Reviewer-Token` ammessi solo dove necessario.
- [ ] `RISOLVI_CAPABILITY_SECRET` casuale e distinto dalle credenziali reviewer.
- [ ] `RISOLVI_REVIEWER_CREDENTIALS_JSON` contiene una credenziale distinta per ciascun reviewer autorizzato.
- [ ] Nessun reviewer ID contiene nome, cognome, email o altro PII libero: usare alias come `rev-01`.
- [ ] Console reviewer protetta e non indicizzata pubblicamente.
- [ ] Nessun invio automatico verso venditore, marketplace, corriere o autorità.

## Retention e cancellazione

Default pilot:

- originali: 24 ore;
- pratica strutturata: 7 giorni.

Checklist:

- [ ] Job `python -m app.retention` schedulato almeno ogni ora durante il pilot.
- [ ] Il job è monitorato: un fallimento non deve restare invisibile.
- [ ] Cancellazione manuale di una pratica di test elimina record DB, consenso/review pilot, audit collegato e blob.
- [ ] Un secondo passaggio del retention job è idempotente.
- [ ] Backup e snapshot sono configurati in modo coerente con la retention dichiarata; non devono trasformarsi in un archivio permanente degli originali.
- [ ] Log applicativi non contengono corpo documenti, capability token, reviewer token o testo OCR integrale.
- [ ] Audit reviewer contiene solo alias pseudonimo e metadati minimali della decisione, non note/documenti/testo caso.

## Accesso reviewer

- [ ] Ogni reviewer riceve un **ID pseudonimo + token personale**; niente secret condiviso in production pilot.
- [ ] Token non inseriti nel bundle statico e non persistiti oltre `sessionStorage` nella console.
- [ ] Revoca testata rimuovendo la singola coppia ID/token senza cambiare le credenziali degli altri reviewer.
- [ ] Rotazione di una singola credenziale testata prima del pilot.
- [ ] Richiesta con reviewer ID corretto ma token di un altro reviewer restituisce `404`.
- [ ] Richiesta con token corretto ma reviewer ID assente/errato restituisce `404`.
- [ ] Ogni decisione persiste `pilot_reviews.reviewer_id`.
- [ ] Ogni decisione genera `audit_events.event=pilot.review.decided` con `actor_type=REVIEWER` e stesso `actor_id`.
- [ ] Nessuna Action Card è visibile all'utente prima della decisione umana.

## Incident severity e stop-pilot

### S0 — stop immediato

Esempi: accesso non autorizzato a documenti/casi, leak di secret, dati di una pratica visibili in un'altra, cancellazione non effettiva, Action Card bypassando la review, raccomandazione potenzialmente dannosa rilasciata senza controllo, decisione attribuita al reviewer sbagliato.

Azione: impostare `RISOLVI_PILOT_INTAKE_ENABLED=false`, bloccare nuova acquisizione, preservare evidenze tecniche minimali e avviare incident review. Non riaprire l'intake finché causa e remediation non sono verificate.

### S1 — pausa intake

Esempi: errori di routing materiali ripetuti, storage/DB instabile, retention job non affidabile, source/rule pack non aggiornato, aumento inatteso dei casi `UNSUPPORTED_MISSED`, audit reviewer incompleto.

Azione: chiudere intake, completare le pratiche già in review solo se sicuro, correggere e rieseguire benchmark + smoke test.

### S2 — correggere prima di scalare

Esempi: problemi UX, edit reviewer frequenti ma non pericolosi, incompletezza di estrazione che non altera la decisione grazie alla conferma utente.

Azione: mantenere pilot limitato, correggere e misurare trend.

## Sequenza di apertura

1. Deploy con intake chiuso.
2. Migrazioni.
3. `python -m app.preflight`.
4. Smoke test end-to-end con reviewer ID dedicato `rev-smoke` e dati sintetici.
5. Verifica che lo smoke ritorni lo stesso `reviewer_id` usato per autenticare la decisione.
6. Verifica cancellazione + retention.
7. Verifica revoca/rotazione di una credenziale reviewer.
8. Verifica rule/source pack e stato del gate legale (#79).
9. Aprire `RISOLVI_PILOT_INTAKE_ENABLED=true` per coorte limitata.
10. Monitorare giornalmente errori S0/S1, classificazioni reviewer, action usage e outcome.

## Sequenza di chiusura

La chiusura intake non deve interrompere pratiche già accettate:

1. impostare `RISOLVI_PILOT_INTAKE_ENABLED=false`;
2. verificare che `POST /v1/cases` restituisca `503 pilot_intake_paused`;
3. mantenere disponibili review umana, `pilot/action`, outcome e cancellazione;
4. completare o chiudere in modo controllato le pratiche pendenti;
5. eseguire retention e verificare cancellazioni.

## Gate ancora esterni al codice

- sign-off specialistico consumer-law (#79);
- provisioning cloud dedicato;
- smoke test reale production-like (#101);
- 50–100 casi reali supervisionati (#83);
- revisione privacy/DPIA e testi informativi prima dell'apertura pubblica.
