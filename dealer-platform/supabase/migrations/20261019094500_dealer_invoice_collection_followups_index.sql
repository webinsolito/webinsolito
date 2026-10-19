-- Modifica 11 · Copertura indice per la FK autore dei solleciti.
create index invoice_collection_followups_created_by_idx on public.invoice_collection_followups(created_by);
