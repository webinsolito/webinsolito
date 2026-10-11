# MALÙ23 Dealer Platform — Pre-release matrix

Questa matrice va eseguita prima di ogni rilascio operativo. Nessun test deve usare dati reali irreversibili o inviare annunci/messaggi esterni senza esplicita conferma.

## Gate automatici obbligatori

Ogni modifica Dealer Platform deve passare entrambi i gate GitHub Actions:

1. **Dealer Platform PR Check** — sintassi, unit/regression, lifecycle, privacy, offline, backup, manifest e secret guard.
2. **Dealer Platform Browser Gate** — browser reale Playwright su desktop Chromium e profilo iPhone, con test su shell mobile, isolamento preview, ruoli, IndexedDB, offline→reload e recovery conflitti.

Il Browser Gate gira sia sulle PR sia sui push a `main`, così viene verificato anche il commit realmente integrato. Usa solo server locale e risposte backend simulate: non pubblica AutoScout/Instagram e non invia messaggi Telegram.

## Ruoli

| Scenario | ADMIN | VENDITORE | Gate |
| --- | --- | --- | --- |
| Login / logout / sessione | Verificare | Verificare | Unit + browser cache/logout |
| Cambio account o ruolo | Cache precedente eliminata | Nessun dato finanziario disponibile | Browser IndexedDB raw count |
| Garage / Clienti / Calendario | Lettura e scrittura previste | Solo permessi previsti | Unit/regression |
| Costi / margini / fatture / finanze | Visibili se autorizzato | Mai visibili, inclusi offline/cache/queue/API | RLS live + browser request gate + unit |
| Backup / restore | Disponibile solo ADMIN | Non disponibile | Unit/regression |

## Dispositivi e PWA

- Windows desktop: shell, navigazione e moduli principali verificati dal progetto Playwright `desktop-chromium`.
- iPhone Safari/PWA: bottom nav **Oggi / Garage / Clienti / Calendario / Altro**, overflow orizzontale e tap target verificati dal progetto `iphone`.
- Manifest: `start_url` deve aprire `index.html?source=pwa`, mai `preview.html`.
- Icona PWA: asset same-origin presente nel manifest e nella cache statica.
- PWA offline: prima apertura online, service worker attivo, passaggio offline, reload shell e rilettura dati IndexedDB.
- Offline → online: retry visibile, conflitto senza overwrite automatico, scelta **Usa server / Mantieni locale**.

## Anteprima

`preview.html` deve restare una demo statica completamente isolata:

- nessuna scrittura/lettura `dealer-platform-session`;
- nessun IndexedDB / OfflineDB;
- nessuna chiamata Supabase/API/Telegram;
- nessun service worker;
- nessun import dei moduli runtime di produzione.

Il browser gate verifica anche che una visita alla preview non crei il database locale del gestionale.

## Garage e pubblicazione

Prima della prima transizione verso uno stato commerciale (`IN_VENDITA`, `PRENOTATA`, `VENDUTA`, `DA_CONSEGNARE`, `CONSEGNATA`) verificare:

- targa presente;
- VIN valido di 17 caratteri, senza I/O/Q;
- nessun duplicato attivo di targa/VIN;
- almeno una riga `vehicle_media` `PHOTO` con `object_key` valorizzato.

Il controllo foto deve essere attivo sia lato client sia tramite trigger live `malu23_require_photo_on_publish`. Le auto già in stato commerciale prima della migrazione sono grandfathered e non vanno bloccate da normali aggiornamenti.

Le spese richiedono importo positivo, categoria valorizzata e veicolo dello stesso dealer.

## Ciclo vendita

- Stock → Prenotata → Venduta → Da consegnare → Consegnata.
- Contratto firmato e congelato prima della consegna.
- Fattura vendita coerente con auto, cliente e prezzo.
- Saldo pagato e finanziamento liquidato quando previsto.
- Checklist consegna 7/7.
- `delivered_at` obbligatorio.
- Ricavo e margine riconosciuti soltanto con consegna fisica **e `integrity_state = VERIFIED`**.
- `LEGACY_UNVERIFIED` e altre consegne fisiche non verificate devono essere conteggiate separatamente, mai nei ricavi/margini riconosciuti.
- Auto/contratto consegnati non tornano indietro.
- Trigger live lifecycle e terminal-lock devono risultare presenti prima del rilascio.

## Recupero e dati

- Backup v2 non contiene la coda `mutations`.
- Restore dello stesso dealer soltanto; righe di altri tenant rifiutate.
- Restore conserva la versione locale più recente.
- Backup v1 legacy importabile, ma la vecchia coda mutazioni viene ignorata.
- Logout/cambio ruolo elimina fisicamente cache finanziaria e mutazioni economiche non autorizzate.
- Startup sloggato elimina anche eventuali cache finance-only lasciate da build precedenti.
- Il browser gate verifica la pulizia usando IndexedDB direttamente, senza affidarsi ai metodi che nascondono i dati al VENDITORE.
- Conflitto sync conserva entrambe le scelte: server oppure locale.

## Backend live / privacy

Prima del rilascio verificare sul progetto Supabase configurato:

- migrazioni previste applicate, incluso `0018_publish_photo_gate_v197.sql` per runtime 1.9.7;
- RLS su `vehicle_financials`, `vehicle_costs` e `invoices` limitata ai ruoli autorizzati;
- VENDITORE escluso server-side da costi, margini e fatture;
- account con `force_password_change` bloccati dalle policy operative;
- trigger terminali attivi su contratti/veicoli consegnati;
- trigger foto attivo e verificato con probe transazionale rollback-only;
- nessuna modifica involontaria allo stock reale durante i probe.

## Integrazioni

- AutoScout: validare readiness e collegamenti senza pubblicare annunci di test.
- Instagram: validare readiness/contenuti senza pubblicare post di test.
- Telegram: validare firma/initData, membership e visibilità per ruolo; il VENDITORE non riceve finanze.
- Nessun canale vendita aggiuntivo oltre AutoScout e Instagram; Telegram resta supporto operativo/Mini App.

## Esito release

La release è pronta solo con:

- CI unit/regression verde;
- browser gate desktop + iPhone verde sulla PR;
- browser gate verde anche sul commit integrato in `main`;
- build/deploy statico senza errori;
- nessun secret nel client;
- backend live coerente con le migrazioni previste;
- nessuna regressione Admin/Venditore, offline→online, vendita→consegna, preview isolation e recovery.

Le verifiche che richiedono hardware fisico — installazione reale su iPhone, tastiera, safe-area e comportamento specifico del dispositivo — restano smoke test manuali prima dell'uso operativo, ma non sostituiscono i gate automatici.
