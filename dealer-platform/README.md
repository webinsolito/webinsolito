# MALÙ23 Dealer Platform — Runtime 1.9.7

Gestionale concessionaria offline-first per MALÙ23 CARS. La stessa applicazione è utilizzabile da browser desktop, come PWA su iPhone/PC e come Telegram Mini App per i percorsi supportati.

## Stato produzione

La piattaforma è collegata al backend Supabase di produzione `jnofezlhptbrkoxhdenx` in `eu-central-1`.

Il client usa:

- Supabase Auth + PostgreSQL + RLS;
- Supabase Edge Function `gestionalejo-router` per i flussi server-side esposti al gestionale;
- IndexedDB locale per dati offline e coda di sincronizzazione;
- service worker same-origin che memorizza esclusivamente asset statici;
- GitHub Pages per il frontend statico e GitHub Actions per i gate di rilascio.

`config.js` contiene soltanto valori pubblici del client, inclusa la publishable key. Service role, token Telegram e altri secret non devono mai essere presenti nel repository/client.

## Architettura operativa

```text
Windows browser / iPhone PWA / Telegram Mini App
                    │
                    ▼
              Dealer Platform
          static shell same-origin
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
 IndexedDB offline        Supabase backend
 cache + mutations       Auth / RLS / Edge Functions
        │                       │
        └──── sync/recovery ────┘
```

Il service worker non memorizza risposte API, Supabase, Telegram, autenticazione o richieste con header sensibili. Le navigazioni usano rete-first con fallback della shell statica.

## Ruoli e privacy finanziaria

Il ruolo `VENDITORE` non deve ricevere né leggere:

- prezzi di acquisto;
- costi veicolo;
- margini;
- fatture e dati finanziari sensibili;
- mutazioni economiche lasciate in cache/queue da sessioni privilegiate.

La separazione è applicata su più livelli: RLS/server, API client, IndexedDB, cambio ruolo/logout, backup, UI, report e Telegram. `ADMIN`/`AMMINISTRAZIONE` vedono i dati economici solo se autorizzati.

## Ciclo vendita e contabilità

Il ciclo canonico operativo è:

`stock → prenotata → venduta → da consegnare → consegnata`

La consegna richiede:

- contratto vendita firmato e congelato;
- fattura coerente con auto, cliente e prezzo;
- saldo interamente pagato;
- finanziamento liquidato quando previsto;
- checklist consegna 7/7;
- `delivered_at` reale.

Una vendita entra nei ricavi e nei margini riconosciuti solo quando è fisicamente consegnata **e** il contratto ha `integrity_state = VERIFIED`.

Le consegne storiche marcate `LEGACY_UNVERIFIED` restano visibili come storico operativo, ma sono escluse dai ricavi/margini riconosciuti finché non vengono verificate. Le vendite/auto già consegnate sono terminali e non possono essere riportate indietro.

## Garage e qualità dati

Per la prima pubblicazione commerciale di un veicolo sono richiesti:

- targa;
- VIN valido di 17 caratteri, senza I/O/Q;
- almeno una foto reale in `vehicle_media`;
- nessun duplicato attivo di targa o VIN.

Il controllo foto è applicato sia nel client sia dal trigger server-side `malu23_require_photo_on_publish`. Le auto che erano già in uno stato commerciale prima dell'introduzione del trigger sono grandfathered, così gli aggiornamenti dello stock storico non vengono bloccati.

Le spese devono avere importo positivo, categoria valorizzata e veicolo dello stesso dealer.

## Offline, conflitti e recovery

La PWA può riaprire shell e dati già sincronizzati senza rete. Le modifiche offline vengono accodate e sincronizzate quando la connessione ritorna.

Il sync conserva una baseline server e non sovrascrive in modo cieco una modifica remota più recente. In caso di conflitto l'utente sceglie esplicitamente:

- **Usa server**;
- **Mantieni locale**.

Gli errori sono ritentabili e lo stato di recovery è visibile.

Il backup v2 non esporta la coda `mutations`, non consente restore cross-tenant e ignora la vecchia queue quando importa backup legacy v1.

## PWA e anteprima

`manifest.webmanifest` installa la **piattaforma reale** tramite `index.html?source=pwa` e include shortcut per Oggi, Garage e Clienti.

`preview.html` è invece una demo statica completamente isolata:

- nessuna sessione `dealer-platform-session`;
- nessun IndexedDB;
- nessuna chiamata Supabase/API;
- nessun service worker;
- nessun import dei moduli di produzione.

La preview non deve mai essere usata come entrypoint della PWA installata.

## Integrazioni

- **AutoScout**: readiness/collegamenti gestiti dal modulo dedicato; i test automatici non pubblicano annunci reali.
- **Instagram**: readiness/contenuti gestiti dal modulo dedicato; i test automatici non pubblicano post reali.
- **Telegram**: initData validato server-side, membership ricontrollata e visibilità filtrata per ruolo. Il Venditore non riceve dati finanziari.

Non sono previsti ulteriori canali di vendita oltre AutoScout e Instagram; Telegram resta supporto operativo/Mini App.

## Migrazioni produzione rilevanti

Il runtime 1.9.7 presuppone almeno queste migrazioni applicate:

- `0013_security_hardening_v18.sql`;
- `0014_session_revocation_v181.sql`;
- `0015_history_integrity_v192.sql`;
- `0016_operational_quality_v193.sql`;
- `0017_sale_terminal_lock_v194.sql`;
- `0018_publish_photo_gate_v197.sql`.

Le migrazioni successive restano la fonte di verità se aggiunte in futuro.

## Gate di rilascio

Ogni modifica deve passare:

1. **Dealer Platform PR Check** — syntax, unit/regression, manifest, invarianti e secret guard;
2. **Dealer Platform Browser Gate** — Chromium desktop + profilo iPhone, isolamento preview, ruoli, purge IndexedDB, PWA offline e recovery conflitti.

Il Browser Gate viene eseguito anche su push a `main`, quindi viene validato il commit realmente integrato e non soltanto il branch della PR.

La matrice completa è in `PRE_RELEASE_CHECKLIST.md`.
