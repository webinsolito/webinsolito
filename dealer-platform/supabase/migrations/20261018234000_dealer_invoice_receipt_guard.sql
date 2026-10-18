-- Modifica 10: tutti gli aggiornamenti manuali del saldo fattura passano dal registro incassi.
-- I processi server-side già esistenti restano compatibili.
create or replace function private.prevent_direct_invoice_payment_edit()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('authenticated','anon') and
     (new.paid_amount is distinct from old.paid_amount
      or new.payment_status is distinct from old.payment_status
      or new.paid_at is distinct from old.paid_at
      or new.payment_method is distinct from old.payment_method)
  then raise exception 'invoice_payment_use_receipt_rpc' using errcode='42501'; end if;
  return new;
end $$;
create trigger invoices_payment_ledger_guard before update on public.invoices
for each row execute function private.prevent_direct_invoice_payment_edit();
revoke all on function private.prevent_direct_invoice_payment_edit() from public,anon,authenticated;
