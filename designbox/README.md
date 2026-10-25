# DesignBox 1.5 — Product Studio PWA

DesignBox non è un clone di Canva: il percorso principale è scegliere un oggetto reale (adesivo, etichetta, confezione, biglietto o shopper), personalizzare la grafica e generare una simulazione del risultato.

- Elaborazione, mockup e salvataggio completamente locali, senza account o API a consumo.
- Editor grafico originale mantenuto per le modifiche di precisione.
- Pulsante «Anteprima oggetto» con cinque superfici e download PNG.
- Le anteprime sono simulazioni 2D, **non** modelli 3D o file tecnici fustella.
- Progetti esistenti conservati con IndexedDB; esportare regolarmente un backup.
- PWA offline tramite service worker `designbox-static-v1.5.0`.

La prima visita richiede HTTPS/Internet per salvare gli asset. Poi il motore di editing e le anteprime funzionano offline. I browser possono rimuovere dati locali: il backup esportato è raccomandato.