# MALÙ23 Dealer Platform — Core V0.1

Base reale del progetto multi-concessionaria definito nella chat di progetto.

## Architettura

```text
Telegram Bot
   │
Cloudflare Worker
   │
   ▼
Dealer App
- Telegram Mini App = stessa PWA
- iPhone PWA = stessa PWA
- PC = stessa PWA
   │
   ▼
Supabase
Auth + PostgreSQL + RLS
   │
   ├─ R2: foto / PDF / documenti
   └─ GitHub: codice / CI
```

## Stato implementato

- PWA navigabile e responsive
- runtime Telegram Mini App rilevato automaticamente
- OGGI / Garage / Clienti / Inbox / Admin
- Service Worker offline shell
- schema PostgreSQL tenant-aware
- RLS su tutte le tabelle esposte
- riferimenti composti `(dealer_id, entity_id)` contro relazioni cross-tenant
- dati economici sensibili separati in `vehicle_financials`
- activation key salvata solo come hash
- Telegram linking table
- audit log non modificabile dal client normale
- Worker bootstrap con `/health`, `/telegram/validate`, `/telegram/webhook`
- validazione server-side di `Telegram.WebApp.initData`

## Sicurezza

Il frontend non deve mai contenere service role, bot token o chiavi amministrative. Le operazioni privilegiate (activation, creazione utenti/dealer, Telegram linking, Super Admin) passeranno dal Worker. Il browser parlerà direttamente al Data API solo con credenziali pubbliche e RLS attivo.

## Non collegato intenzionalmente

Il database Supabase non è ancora creato: l'unico progetto Supabase attualmente collegato è AutoBid Inspector e non deve essere riutilizzato. Prima della creazione del nuovo progetto serve conferma esplicita dell'organizzazione Supabase.

## Milestone successiva

1. creare progetto Supabase dedicato;
2. applicare e verificare `supabase/schema.sql`;
3. eseguire Security + Performance Advisors;
4. implementare activation transaction monouso;
5. collegare Auth username/email + password temporanea;
6. collegare la PWA ai dati reali MALÙ23;
7. configurare Worker + webhook Telegram;
8. aggiungere R2 con URL firmati per i documenti privati.
