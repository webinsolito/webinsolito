# MALÙ23 Dealer Platform — Core V0.2

Piattaforma multi-concessionaria offline-first: la stessa app gira come PWA su PC/iPhone e come Telegram Mini App.

## Architettura

```text
Telegram Bot
   │
Cloudflare Worker
   │
   ▼
Dealer App
- Telegram Mini App = stessa PWA
- iPhone PWA         = stessa PWA
- PC                 = stessa PWA
   │
   ├─ IndexedDB locale + mutation queue (offline)
   │
   ▼
Supabase
Auth + PostgreSQL + RLS
   │
   ├─ R2: foto / PDF / documenti
   └─ GitHub: codice / CI
```

## V0.2 implementato

- UI data-driven: non usa più dati hardcoded come fonte principale
- login username + concessionaria tramite Worker
- login email + password tramite Supabase Auth
- PWA installabile e responsive
- app shell disponibile offline
- IndexedDB locale per veicoli, clienti, costi, eventi, documenti e coda sync
- nuove auto/clienti/eventi salvabili senza Internet
- UUID generati sul dispositivo per retry idempotenti
- sync automatico quando torna la rete
- OGGI / Garage / Clienti / Inbox / Admin
- schema PostgreSQL tenant-aware
- RLS su tutte le tabelle esposte
- riferimenti composti `(dealer_id, entity_id)` contro relazioni cross-tenant
- username unico per concessionaria, non globale
- dati economici sensibili separati in `vehicle_financials`
- Inbox documenti anche non ancora assegnati
- activation key salvata solo come hash
- finalizzazione activation key in transazione DB
- Telegram linking account ↔ user ↔ dealer
- `/start` Telegram contestuale per utenti collegati
- validazione server-side di `Telegram.WebApp.initData`
- script per `setWebhook`, menu Mini App e comando `/start`
- GitHub Action: syntax check + manifest check + secret guard

## Offline: cosa significa davvero

La PWA continua ad aprirsi senza rete e legge i dati già sincronizzati dal database locale. Le modifiche vengono prima salvate in IndexedDB e poi accodate. Quando la connessione ritorna, la coda tenta la sincronizzazione automaticamente.

Telegram stesso richiede Internet. Se l'utente perde la rete dopo aver usato la Mini App, deve continuare dalla PWA installata sul dispositivo per avere il comportamento offline completo.

## Sicurezza

Il frontend non contiene service role, bot token o chiavi amministrative. Il browser usa solo la publishable key Supabase e l'autorizzazione reale avviene tramite RLS. Le operazioni privilegiate passano dal Worker.

Il Worker si aspetta questi secret/vars:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET_TOKEN`
- `APP_URL`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Nessuno di questi valori sensibili va committato.

## Stato live

Il frontend V0.2 può essere pubblicato subito in modalità demo/offline. Il backend reale resta intenzionalmente scollegato fino alla creazione del nuovo progetto Supabase dedicato: AutoBid Inspector non viene riutilizzato.

## Prossimo collegamento live

1. creare Supabase dedicato;
2. applicare `supabase/schema.sql`;
3. eseguire Security + Performance Advisors;
4. creare MALÙ23 + primo admin;
5. configurare `config.js` con URL/publishable key/Worker e `demoMode:false`;
6. deploy Worker Cloudflare;
7. creare bot Telegram e inserire token come secret;
8. eseguire `worker/setup-telegram.mjs`;
9. test `/start` → Mini App → login → collega Telegram → `/start` personalizzato;
10. aggiungere R2 per foto/PDF privati e signed URL.
