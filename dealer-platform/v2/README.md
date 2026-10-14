# MALÙ23 Dealer Cockpit V2

Frontend parallelo per la migrazione architetturale di MALÙ23. Non sostituisce ancora il gestionale corrente.

## Principi

- Backend, Supabase, RLS e lifecycle esistenti restano la fonte di verità.
- `VENDITORE` non richiede mai tabelle finanziarie.
- La V2 nasce in parallelo: nessun override CSS/DOM della V1.
- OGGI mostra eccezioni operative; Garage è il cuore.
- Mobile-first, PWA e iPhone sono requisiti del core, non extra.

## Stato foundation

- Login reale via `gestionalejo-router` e refresh sessione Supabase.
- Data access tipizzato con finance hard-gated per ruolo.
- OGGI con eccezioni prezzo/foto/stock/lavori/calendario/consegna.
- Garage reale, ricerca, stato, missing-data badges e scheda auto.
- Clienti essenziali con telefono/WhatsApp.
- Calendario essenziale.
- Shell desktop + bottom navigation iPhone.
- PWA static-only service worker che non intercetta traffico Supabase.
- Test dominio per priorità e confine finanze.

## Non ancora migrato

Vendite complete, contratti, fatture, documenti/OCR, modifica Garage, photo uploader, sync offline V2 e moduli AutoScout/Instagram/Report. Finché i relativi gate non sono verdi, la V1 resta il fallback operativo.
