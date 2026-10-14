# Garage V2 — stato operativo

Questa fase migra il Garage dalla lettura alla gestione reale mantenendo la V1 come fallback.

Incluso:
- creazione e modifica veicolo su Supabase via RLS esistenti;
- completezza scheda esplicita, senza dati inventati;
- foto private tenant-scoped in `dealer-vehicle-media`;
- upload da input camera iPhone/browser con limite 15 MB;
- copertina veicolo, galleria e rimozione foto;
- lavori di preparazione: aggiungi e completa;
- VENDITORE autorizzato al Garage ma ancora hard-blocked dalle tabelle finance;
- E2E Chromium desktop + WebKit profilo iPhone.

Non incluso in questa fase:
- offline write queue V2;
- OCR documenti/spese;
- vendita E2E V2;
- pubblicazione reale AutoScout/Instagram.
