# MALÙ23 Dealer Platform — Pre-release matrix

Questa matrice va eseguita prima di ogni rilascio operativo. Nessun test deve usare dati reali irreversibili o inviare annunci/messaggi esterni senza esplicita conferma.

## Ruoli

| Scenario | ADMIN | VENDITORE |
| --- | --- | --- |
| Login / logout / sessione scaduta | Verificare | Verificare |
| Cambio account o ruolo | Cache precedente eliminata | Nessun dato finanziario disponibile |
| Garage / Clienti / Calendario | Lettura e scrittura previste | Solo permessi previsti |
| Costi / margini / fatture / finanze | Visibili se autorizzato | Mai visibili, inclusi offline/cache/queue |
| Backup / restore | Disponibile solo ADMIN | Non disponibile |

## Dispositivi

- Windows desktop: login, navigazione completa, creazione/modifica auto e cliente, vendita, documenti, sync.
- iPhone Safari/PWA: installazione, bottom nav Oggi/Garage/Clienti/Calendario/Altro, tap target, drawer, modali, tastiera, safe area.
- PWA offline: apertura shell, lettura dati consentiti, nuova modifica locale, stato coda visibile.
- Offline → online: retry automatico, errore visibile, conflitto senza overwrite automatico, scelta Usa server / Mantieni locale.

## Ciclo vendita

- Stock → Prenotata → Venduta → Da consegnare → Consegnata.
- Contratto firmato e congelato prima della consegna.
- Fattura vendita coerente con auto, cliente e prezzo.
- Saldo pagato e finanziamento liquidato quando previsto.
- Checklist consegna 7/7.
- `delivered_at` obbligatorio.
- Ricavo e margine riconosciuti solo dopo consegna fisica.
- Auto/contratto consegnati non tornano indietro.

## Recupero e dati

- Backup v2 non contiene la coda `mutations`.
- Restore dello stesso dealer soltanto; righe di altri tenant rifiutate.
- Restore conserva la versione locale più recente.
- Backup v1 legacy importabile, ma la vecchia coda mutazioni viene ignorata.
- Logout/cambio ruolo elimina cache finanziaria e mutazioni economiche non autorizzate.
- Conflitto sync conserva entrambe le scelte: server oppure locale.

## Integrazioni

- AutoScout: validare readiness e collegamenti senza pubblicare annunci di test.
- Instagram: validare readiness/contenuti senza pubblicare post di test.
- Telegram: validare firma/initData, membership e visibilità per ruolo; il VENDITORE non riceve finanze.
- Nessun canale vendita aggiuntivo oltre AutoScout e Instagram; Telegram resta supporto operativo/mini app.

## Esito release

La release è pronta solo con CI verde, nessun conflitto irrisolto nel branch, nessun secret nel client e nessuna regressione nei test Admin/Venditore, offline→online, vendita→consegna e recovery.
