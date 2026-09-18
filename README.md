# Webinsolito Apps V2

Hub gratuito con 12 app web mobile-first pubblicate su GitHub Pages.

## Stato reale
- hosting: GitHub Pages;
- costo ricorrente aggiuntivo del progetto: €0;
- dati: localStorage / IndexedDB sul dispositivo;
- ogni app ha identità, logo, navigazione e flussi propri;
- PWA manifest per ogni app + service worker root;
- backup JSON presente nelle app dove ha senso;
- nessun backend attivo: i dati non si sincronizzano automaticamente fra dispositivi.

## App
- **AutoBuddy** — garage multi-auto, scadenze, spese, manutenzione, documenti e parcheggio.
- **DealerFlow** — stock, pipeline drag/drop, lead, agenda, preventivi e test drive.
- **TableSync** — mappa sala, tavoli, prenotazioni, lista attesa e turni.
- **BresciaGo** — feed eventi reali salvati con fonte, filtri e itinerario personale.
- **FrigoChef** — dispensa, ricette per compatibilità, scadenze ingredienti e lista spesa.
- **StyleMatch** — misure guidate, tabella taglie specifica e stima del fit.
- **Splitly** — quote uguali/personalizzate e calcolo dei trasferimenti netti.
- **ParkMemo** — GPS, mappa OpenStreetMap, timer, foto, condivisione e luoghi frequenti.
- **ScreenSort** — archivio screenshot in IndexedDB, bulk actions, raccolte e OCR browser.
- **Packr** — checklist adattiva, storico destinazioni e memoria degli extra personali.
- **DocPocket** — wallet locale per PDF/immagini, scadenze, preferiti, cestino, backup e OCR immagini.
- **SafeBuy** — analisi euristica locale di link e segnali d’acquisto con spiegazioni.

## Dipendenze esterne
- **Tesseract.js** viene caricato da CDN in ScreenSort e DocPocket per OCR browser; progetto Apache-2.0.
- **OpenStreetMap** viene usato da ParkMemo per la mappa embedded quando è disponibile una posizione GPS.
- BresciaGo collega le fonti ufficiali Comune di Brescia e Visit Brescia; non inventa eventi né fa scraping automatico.

## Limiti noti
- niente sincronizzazione cloud/account;
- OCR richiede rete al primo caricamento del motore ed è più lento su telefoni meno potenti;
- iOS/browser può cancellare storage locale in alcune condizioni: esportare backup per dati importanti;
- il meteo live non è collegato a Packr perché la Free API Open-Meteo è indicata per uso non commerciale e il progetto vuole restare riutilizzabile senza ambiguità di costo/licenza.

Rollback pre-V2: `rollback/pre-v2-deepening-2026-09-18`.


## BresciaGo automatic feed
- GitHub Actions workflow: `.github/workflows/bresciago-events.yml`
- schedule: every 3 hours + manual dispatch;
- collector: `automation/bresciago/update_events.py`;
- public feed: `bresciago/data/events.json`;
- active sources: Comune di Brescia and Visit Brescia;
- the collector preserves original source URLs, removes duplicates, drops expired events and refuses to overwrite the feed if collection returns no valid events;
- BresciaGo fetches the public feed on launch and keeps favorites, itinerary and manually added events local to each device.
