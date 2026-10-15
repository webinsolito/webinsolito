# MALÙ23 Dealer Cockpit V2

Frontend parallelo per la migrazione architetturale di MALÙ23. La V1 resta il fallback operativo finché i moduli V2 successivi non superano i relativi gate.

## Principi

- Backend, Supabase, RLS e lifecycle esistenti restano la fonte di verità.
- `VENDITORE` non richiede mai tabelle finanziarie e non può recuperare costi, margini, `vehicle_financials` o fatture complete.
- La V2 nasce in parallelo: nessun override CSS/DOM della V1.
- OGGI mostra eccezioni operative; Garage è il cuore.
- Mobile-first, PWA e profilo iPhone/WebKit sono requisiti del core, non extra.

## Stato V2

- Login reale via `gestionalejo-router` e refresh sessione Supabase.
- Data access tipizzato con finance hard-gated per ruolo.
- OGGI foundation con eccezioni prezzo/foto/stock/lavori/calendario/consegna.
- Garage V2 operativo: nuova auto, salvataggio, apertura scheda, modifica e completezza dati.
- Foto veicolo private su bucket `dealer-vehicle-media`, path tenant-scoped, upload camera/file, galleria, copertina e rimozione.
- Lavori di preparazione: aggiunta e completamento.
- Scritture Garage tramite JWT utente e RLS; nessun service role nel browser.
- Clienti essenziali con telefono/WhatsApp e Calendario foundation.
- Shell desktop + bottom navigation iPhone.
- PWA static-only service worker che non intercetta traffico Supabase.
- Test dominio, TypeScript/build e browser gate Chromium + WebKit/iPhone.

## Preview produzione

Il workflow V2 genera il bundle Vite verificato e pubblica lo snapshot statico in `dealer-platform/v2-preview/`, separato dalla V1. Il contenuto di questa cartella deriva esclusivamente dal build che ha già superato i gate V2.

## Non ancora migrato / verificato

Vendita completa V2, documenti/OCR, offline write queue V2, AutoScout reale, Instagram reale e test su iPhone fisico. L'automazione WebKit/iPhone non equivale a un test su dispositivo fisico e l'upload foto automatizzato non equivale a un upload manuale con account reale.
