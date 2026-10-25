# DesignBox 1.3 — PWA offline

Grafica più curata, ricerca e filtri modelli, barra rapida per modificare, duplicare, riordinare ed eliminare elementi. Compatibile con la struttura offline esistente; nessun backend o API esterna.

La logica editor rimane nel pacchetto locale `payload/`, caricato da `loader.js`. Gli aggiornamenti visuali sono isolati in `polish.css` e `polish.js`. Il service worker versione 1.3 salva anche questi file, senza cancellare i progetti IndexedDB durante l'aggiornamento.

**Uso:** aprire `https://webinsolito.github.io/webinsolito/designbox/` in Safari e scegliere Aggiungi alla schermata Home. Dopo il primo caricamento completo i file sono disponibili offline. Esportare periodicamente un backup `.designbox` dalla sezione Progetti.
