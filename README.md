# Webinsolito

Portale gratuito di strumenti digitali quotidiani pubblicato su GitHub Pages.

## Stato
- hosting: GitHub Pages;
- costo ricorrente: €0;
- catalogo centrale: `apps.json`;
- categorie: 12;
- app pubblicate in questa candidate: 14;
- app future registrate come `PLANNED`: non vengono mostrate come funzionanti;
- dati utente: locali al browser salvo le app che leggono fonti pubbliche documentate;
- PWA: manifest per le app + service worker root;
- test browser: Chromium desktop + WebKit/iPhone.

## App pubblicate
### Auto & mobilità
- **AutoBuddy** — garage, scadenze, spese, manutenzione, documenti e parcheggio.
- **FuelGo** — prezzi carburante MIMIT, distanza, freschezza e navigazione.
- **ParkMemo** — posizione parcheggio, timer, foto, cronologia e luoghi frequenti.
- **CarCost** — costo reale auto al mese, all’anno e per km.
- **TripCost** — costo viaggio, carburante, pedaggi e quota per persona.

### Lavoro
- **DealerFlow** — auto, clienti, trattative e agenda.

### Eventi
- **BresciaGo** — eventi reali con fonte originale e selezione personale.

### Food
- **FrigoChef** — dispensa, ricette, scadenze e lista spesa.

### Persona
- **StyleMatch** — misure guidate, vestibilità e stima taglia.

### Soldi
- **Splitly** — spese condivise, quote e trasferimenti semplificati.

### Documenti
- **ScreenSort** — screenshot, raccolte, ricerca testo e azioni multiple.
- **DocPocket** — documenti, scadenze, preferiti, lettura testo e backup protetti.

### Viaggi
- **Packr** — checklist adattiva e storico destinazioni.

### Shopping
- **SafeBuy** — segnali spiegabili e livelli di attenzione, senza falso punteggio di precisione.

## Architettura
- `apps.json` è la fonte centrale per homepage, categorie e stato delle app.
- Le app possono essere `PLANNED`, `MVP`, `BETA` o `STABLE`.
- Solo MVP/BETA/STABLE con percorso reale vengono mostrate come utilizzabili.
- `assets/webinsolito-core.js` contiene funzioni comuni leggere.
- `docs/github-audit.md` documenta l’audit GitHub-first.
- `docs/reuse-register.md` registra dipendenze, licenze e pattern riutilizzati.

## Dipendenze e fonti
- **Tesseract.js**: Apache-2.0, usato per lettura testo da immagini.
- **OpenStreetMap**: usato da ParkMemo per la mappa.
- **MIMIT**: dati ufficiali carburanti per FuelGo, IODL 2.0.
- **BresciaGo**: fonti pubbliche selezionate con URL originale conservato.
- **Web Crypto nativo**: AES-GCM + PBKDF2 per copie protette di DocPocket.

## Automazioni
### BresciaGo
- workflow: `.github/workflows/bresciago-events.yml`;
- collector: `automation/bresciago/update_events.py`;
- feed: `bresciago/data/events.json`.

### FuelGo
- workflow: `.github/workflows/fuelgo-data.yml`;
- collector: `automation/fuelgo/update_fuel.py`;
- feed diviso per provincia in `fuelgo/data/provinces/`.

## Limiti reali
- nessuna sincronizzazione cloud/account;
- lettura testo può richiedere rete al primo caricamento;
- lo storage browser può essere cancellato dal sistema: DocPocket offre backup e richiesta di storage persistente;
- le funzioni che richiederebbero servizi a pagamento non vengono simulate.

## Rollback
- `rollback/pre-ecosystem-expansion-2026-09-18`

## Candidate
- `candidate/ecosystem-phase1-2026-09-18`
