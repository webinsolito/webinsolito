# Calendario V0.5

- Agenda giorno / settimana / mese.
- Eventi manuali: appuntamento, richiamo, test drive, consegna, pagamento, documento, lavoro, altro.
- Collegamento opzionale a cliente e veicolo.
- Promemoria memorizzato per futura consegna Telegram/push.
- Richiami CRM derivati automaticamente da `customers.next_contact_at`.
- Scadenze lavori Garage derivate automaticamente da `vehicle_work_items.due_date`.
- Offline-first tramite IndexedDB + mutation queue.
- RLS e foreign key composite tenant-safe lato Supabase.
