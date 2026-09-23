# Webinsolito

Portale gratuito di strumenti digitali quotidiani pubblicato su GitHub Pages.

## Stato reale del catalogo

Stato verificato su `apps.json` il 23 settembre 2026:

- elementi totali registrati: **218**;
- categorie: **12**;
- app attive con percorso reale (`MVP`, `BETA`, `STABLE`): **187**;
- app consolidate in prodotti più forti (`MERGED`): **13**;
- idee future non pubblicate (`PLANNED`): **18**;
- hosting: GitHub Pages;
- costo ricorrente: €0;
- dati utente: locali al browser salvo le app che leggono fonti pubbliche documentate;
- PWA: manifest + service worker root.

`apps.json` è la fonte di verità del catalogo. I numeri nel README non devono essere aggiornati a mano senza verificare prima quel file.

## App attive per categoria

| Categoria | Attive |
| --- | ---: |
| Auto & mobilità | 12 |
| Food & spesa | 15 |
| Soldi & risparmio | 16 |
| Eventi & tempo libero | 20 |
| Documenti & organizzazione | 16 |
| Casa | 19 |
| Viaggi | 19 |
| Persona & stile | 14 |
| Shopping & sicurezza | 16 |
| Territorio & ambiente | 3 |
| Lavoro & business | 19 |
| Studio & produttività | 18 |
| **Totale** | **187** |

## Prodotti principali

Le app evidenziate come `featured` nel catalogo reale sono:

- **AutoBuddy** — garage, scadenze, bollo, revisione, pneumatici, manutenzione, spese, documenti e parcheggio;
- **FuelGo** — prezzi ufficiali carburante, distanza e percorso;
- **BresciaGo** — eventi a Brescia e provincia con fonti originali;
- **FrigoChef** — ricette costruite su ciò che hai davvero in casa;
- **Splitly** — spese condivise, saldi e rimborsi;
- **Packr** — checklist di viaggio adattive e storico destinazioni;
- **DocPocket** — documenti, scadenze e ricerca locale;
- **SafeBuy** — segnali spiegabili per acquisti online più consapevoli;
- **FuelSaver** — confronto tra prezzo carburante e costo deviazione;
- **CarCost** — costo reale dell’auto;
- **TripCost** — costo reale di un viaggio.

Questa lista non sostituisce il catalogo completo: serve a indicare i prodotti principali su cui concentrare qualità, UX e QA.

## Consolidamenti attivi

Le app `MERGED` restano registrate per compatibilità, redirect e migrazione dati, ma non devono essere contate come prodotti attivi autonomi.

- `bollo-check` → `autobuddy`
- `revisione-memo` → `autobuddy`
- `tyre-memo` → `autobuddy`
- `service-book` → `autobuddy`
- `damage-log` → `accident-kit`
- `expiry-food` → `pantry`
- `freezer-memo` → `pantry`
- `daily-spend` → `home-budget`
- `budget-lite` → `home-budget`
- `receipt-box` → `receipt-pocket`
- `home-docs` → `docpocket`
- `car-docs` → `docpocket`
- `booking-lite` → `appointment`

## Regole di stato

- `STABLE`, `BETA`, `MVP`: app utilizzabile con `path` reale;
- `MERGED`: funzione consolidata in un prodotto principale; il vecchio percorso può restare come redirect;
- `PLANNED`: idea futura, non presentata come funzione disponibile.

Una voce attiva senza `path`, una voce `PLANNED` con percorso pubblico o un `MERGED` senza destinazione valida è considerata incoerente.

## Architettura

- `apps.json` è la fonte centrale per homepage, categorie e stato delle app;
- la navigazione principale segue `Home → Categoria → App`;
- ogni macro-categoria ha un URL reale: `/auto/`, `/food/`, `/soldi/`, `/eventi/`, `/documenti/`, `/casa/`, `/viaggi/`, `/persona/`, `/shopping/`, `/territorio/`, `/business/`, `/studio/`;
- `categorie.html` reindirizza alla Home;
- `assets/webinsolito-core.js` contiene funzioni comuni leggere;
- `docs/github-audit.md` documenta l’audit GitHub-first;
- `docs/reuse-register.md` registra dipendenze, licenze e pattern riutilizzati.

## Dipendenze e fonti

- **Tesseract.js**: Apache-2.0, usato per lettura testo da immagini;
- **OpenStreetMap**: usato da ParkMemo per la mappa;
- **MIMIT**: dati ufficiali carburanti per FuelGo, IODL 2.0;
- **BresciaGo**: fonti pubbliche selezionate con URL originale conservato;
- **Web Crypto nativo**: AES-GCM + PBKDF2 per copie protette di DocPocket.

## Automazioni

I workflow periodici non devono essere riattivati automaticamente. Restano manuali (`workflow_dispatch`) finché non viene deciso esplicitamente diversamente.

### BresciaGo
- workflow: `.github/workflows/bresciago-events.yml`;
- collector: `automation/bresciago/update_events.py`;
- feed: `bresciago/data/events.json`.

### FuelGo
- workflow: `.github/workflows/fuelgo-data.yml`;
- collector: `automation/fuelgo/update_fuel.py`;
- feed diviso per provincia in `fuelgo/data/provinces/`.

## QA

GitHub Pages pubblicato non equivale a QA superato.

Il test `tests/e2e/quality-final.spec.js` verifica, tra le altre cose:

- Home e ricerca;
- percorsi categoria;
- app ricostruite;
- redirect delle app consolidate;
- stato reale del catalogo;
- qualità mobile a 360 / 390 / 430 px;
- budget prestazionali per gli asset statici.

## Limiti reali

- nessuna sincronizzazione cloud/account;
- lettura testo può richiedere rete al primo caricamento;
- lo storage browser può essere cancellato dal sistema;
- DocPocket offre backup e richiesta di storage persistente;
- le funzioni che richiederebbero servizi a pagamento non vengono simulate.

## Ambito

Questo README descrive **solo Webinsolito**. Eventuali cartelle o commit relativi ad altri progetti presenti nello stesso repository non fanno parte del catalogo Webinsolito e non devono alterarne conteggi o decisioni di prodotto.
