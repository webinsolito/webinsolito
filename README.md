# Webinsolito Apps

Hub gratuito con 12 app web mobile-first pubblicate su GitHub Pages.

## App V1 funzionali
- **AutoBuddy** — Garage, scadenze, spese, manutenzione e parcheggio.
- **DealerFlow** — Stock, lead, pipeline e agenda commerciale.
- **TableSync** — Prenotazioni, tavoli, coperti e stato servizio.
- **BresciaGo** — Eventi reali salvati con filtri, preferiti e fonte.
- **FrigoChef** — Dispensa e motore ricette per ingredienti disponibili.
- **StyleMatch** — Profilo misure e stima taglia per categoria.
- **Splitly** — Spese di gruppo, saldi e rimborsi automatici.
- **ParkMemo** — GPS, posto auto, timer, mappa e cronologia.
- **ScreenSort** — Archivio locale di screenshot con categorie e ricerca.
- **Packr** — Checklist viaggio intelligente e storico destinazioni.
- **DocPocket** — Archivio locale PDF/immagini con scadenze.
- **SafeBuy** — Controllo euristico locale dei segnali di rischio.

## Architettura
- hosting: GitHub Pages;
- costi ricorrenti del progetto: €0;
- storage: localStorage / IndexedDB sul dispositivo;
- PWA: manifest per ogni app + service worker root;
- nessun backend attivo: i dati non si sincronizzano automaticamente fra dispositivi;
- nessuna funzione AI o rete esterna viene simulata.

Ogni app mantiene anche la propria brand board.
