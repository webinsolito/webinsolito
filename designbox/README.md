# DesignBox Product Studio 1.5.1 — PWA locale

DesignBox è uno studio per personalizzare oggetti (adesivi, etichette, confezioni, biglietti e shopper) partendo dall'anteprima del prodotto, **non un clone di Canva**.

## Come si usa

1. Scegli l'oggetto nella Home Product Studio.
2. Guarda l'anteprima grafica locale; puoi esportarla come PNG.
3. Apri «Personalizza grafica» solo se vuoi modificare testi, immagini, colori o formato.
4. Torna alla Home con «← Oggetti», senza cancellare il progetto.

## Funzionamento

- Il core 1.1 è conservato nei sei file `payload/*.txt`, decompressi localmente da `loader.js`.
- `object-studio.js` genera i mockup 2D nel Canvas; non sono file di stampa o modelli 3D realistici.
- `studio-home.css` e la pagina iniziale in `object-studio.js` realizzano il percorso product-first.
- Le funzioni principali non richiedono login, crediti, backend o API esterne.
- I progetti sono salvati in IndexedDB quando disponibile; è consigliato esportare backup `.designbox`.
- Dopo un primo caricamento HTTPS online, il service worker conserva l'app per l'utilizzo offline.

Per pubblicare su GitHub Pages, mantenere tutti i file della cartella `designbox/` e aprire il percorso `https://webinsolito.github.io/webinsolito/designbox/`.