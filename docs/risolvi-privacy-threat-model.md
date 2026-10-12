# RISOLVI v0.3 — privacy & threat model

## Asset

Documenti originali, fatti estratti/confermati, bozze di azione, outcome e capability token. Il token guest equivale all'accesso alla pratica e va trattato come una credenziale.

## Trust boundary

Il browser può elaborare documenti localmente. Quando l'utente sceglie di salvare una pratica, dati strutturati e — solo tramite endpoint esplicito — originali passano al backend. I documenti sono dati non fidati: non sono istruzioni per il rule engine o per eventuali modelli AI.

## Minacce e controlli

| Minaccia | Controllo v0.3 |
| --- | --- |
| IDOR / accesso a pratica altrui | capability casuale 256-bit circa, HMAC server-side, controllo su ogni endpoint, test cross-case |
| Token in log/URL/referrer | solo header `X-Case-Token`; query string ignorata; token mai serializzato nell'export |
| DB leak | nel DB c'è soltanto hash HMAC del token; produzione richiede PostgreSQL e secret forte |
| Bucket pubblico | produzione richiede backend S3 privato; chiavi casuali; download solo dopo auth con presigned URL breve |
| URL firmato troppo longevo | limite 30–900 secondi, default 300 |
| PII nei log | audit contiene solo `case_id`, nome evento e timestamp; nessun payload/documento |
| Retention indefinita | `expires_at` su casi e documenti + sweep idempotente |
| Delete incompleto | cancellazione pratica elimina blob e record facts/documents/recommendations/actions/outcomes/audit |
| Traversal storage locale | storage key validata dentro root privata |
| File enorme | limite 8 MB/file e lettura limitata a `MAX_FILE_BYTES + 1` |
| Prompt injection da documento | extraction e regole restano separate; testo documento non controlla il motore |

## Rischi ancora aperti prima del pubblico non supervisionato

- malware scanning sugli originali persistiti;
- rate limiting/abuse protection;
- KMS/SSE-KMS e policy bucket verificate in infrastruttura;
- Alembic migrations e backup/restore drill;
- CSP/CORS/deployment hardening;
- DPIA e revisione GDPR dei periodi reali di conservazione;
- incident response e rotazione del capability secret;
- autenticazione admin separata e RBAC.

Questi punti sono release gate, non dettagli da rimandare dopo il lancio.
