# MALÙ23 Dealer Platform — Pre-release matrix

Questa matrice va eseguita prima di ogni rilascio operativo. Nessun test deve usare dati reali irreversibili o inviare annunci/messaggi esterni senza esplicita conferma.

## Gate automatici obbligatori

Ogni modifica Dealer Platform deve passare entrambi i gate GitHub Actions:

1. **Dealer Platform PR Check** — sintassi, unit/regression, lifecycle, privacy, offline, backup, secret guard.
2. **Dealer Platform Browser Gate** — browser reale Playwright su desktop Chromium e profilo iPhone, con test mirati a shell mobile, isolamento preview, ruoli, IndexedDB, offline→reload e recovery conflitti.

Il browser gate usa solo server locale e risposte backend simulate: non pubblica AutoScout/Instagram e non invia messaggi Telegram.

## Ruoli

| Scenario | ADMIN | VENDITORE | Gate |
| --- | --- | --- | --- |
| Login / logout / sessione | Verificare | Verificare | Unit + browser cache/logout |
| Cambio account o ruolo | Cache precedente eliminata | Nessun dato finanziario disponibile | Browser IndexedDB raw count |
| Garage / Clienti / Calendario | Lettura e scrittura previste | Solo permessi previsti | Unit/regression |
| Costi / margini / fatture / finanze | Visibili se autorizzato | Mai visibili, inclusi offline/cache/queue/API | RLS live + browser request gate + unit |
| Backup / restore | Disponibile solo ADMIN | Non disponibile | Unit/regression |

## Dispositivi

- Windows/desktop browser: shell, navigazione, dati simulati e moduli principali verificati dal progetto Playwright `desktop-chromium`.
- iPhone Safari/PWA: layout, bottom nav Oggi/Garage/Clienti/Calendario/Altro, overflow orizzontale e tap target verificati dal progetto Playwright `iphone`.
- PWA offline: prima apertura online, installazione service worker, passaggio offline, reload della shell e rilettura dati IndexedDB.
- Offline → online: retry automatico, errore visibile, conflitto senza overwrite automatico, scelta **Usa server / Mantieni locale**.

## Ciclo vendita

- Stock → Prenotata → Venduta → Da consegnare → Consegnata.
- Contratto firmato e congelato prima della consegna.
- Fattura vendita coerente con auto, cliente e prezzo.
- Saldo pagato e finanziamento liquidato quando previsto.
- Checklist consegna 7/7.
- `delivered_at` obbligatorio.
- Ricavo e margine riconosciuti solo dopo consegna fisica.
- Auto/contratto consegnati non tornano indietro.
- Trigger live Supabase `malu23_guard_sale_lifecycle` e `malu23_guard_vehicle_delivery` devono risultare presenti prima del rilascio.

## Recupero e dati

- Backup v2 non contiene la coda `mutations`.
- Restore dello stesso dealer soltanto; righe di altri tenant rifiutate.
- Restore conserva la versione locale più recente.
- Backup v1 legacy importabile, ma la vecchia coda mutazioni viene ignorata.
- Logout/cambio ruolo elimina fisicamente cache finanziaria e mutazioni economiche non autorizzate.
- Il browser gate verifica la pulizia usando IndexedDB direttamente, senza affidarsi ai metodi che nascondono i dati al VENDITORE.
- Conflitto sync conserva entrambe le scelte: server oppure locale.

## Backend live / privacy

Prima del rilascio verificare in sola lettura sul progetto Supabase configurato:

- migrazioni di sicurezza/lifecycle presenti fino all'ultima migrazione prevista;
- RLS su `vehicle_financials`, `vehicle_costs` e `invoices` limitata a ADMIN/AMMINISTRAZIONE autorizzati;
- VENDITORE escluso server-side da costi, margini e fatture;
- account con `force_password_change` bloccati dalle policy operative;
- trigger terminali attivi su contratti e veicoli consegnati.

## Integrazioni

- AutoScout: validare readiness e collegamenti senza pubblicare annunci di test.
- Instagram: validare readiness/contenuti senza pubblicare post di test.
- Telegram: validare firma/initData, membership e visibilità per ruolo; il VENDITORE non riceve finanze.
- Nessun canale vendita aggiuntivo oltre AutoScout e Instagram; Telegram resta supporto operativo/mini app.

## Esito release

La release è pronta solo con:

- CI unit/regression verde;
- browser gate desktop + iPhone verde;
- nessun conflitto irrisolto nel branch;
- nessun secret nel client;
- backend live coerente con le migrazioni previste;
- nessuna regressione Admin/Venditore, offline→online, vendita→consegna e recovery.

Le verifiche che richiedono hardware fisico (installazione reale su iPhone e comportamento tastiera/safe-area specifico del dispositivo) restano smoke test manuali prima dell'uso operativo, ma non sostituiscono i gate automatici.
