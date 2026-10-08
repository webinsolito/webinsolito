-- GestionaleJo V1.7.2 — Telegram runtime secrets.
-- Bot token and webhook secret are stored in Supabase Vault, never in frontend/GitHub.

create or replace function public.telegram_runtime_config()
returns jsonb
language sql
security definer
set search_path = vault, pg_temp
as $$
  select jsonb_build_object(
    'bot_token', (select decrypted_secret from vault.decrypted_secrets where name='telegram_bot_token' limit 1),
    'webhook_secret', (select decrypted_secret from vault.decrypted_secrets where name='telegram_webhook_secret' limit 1),
    'bot_configured', exists(select 1 from vault.secrets where name='telegram_bot_token'),
    'webhook_secret_configured', exists(select 1 from vault.secrets where name='telegram_webhook_secret')
  );
$$;

revoke all on function public.telegram_runtime_config() from public, anon, authenticated;
grant execute on function public.telegram_runtime_config() to service_role;

comment on function public.telegram_runtime_config() is
  'Server-only Telegram runtime secrets. EXECUTE restricted to service_role.';

-- Runtime provisioning note:
-- create the webhook verification secret once with vault.create_secret(..., 'telegram_webhook_secret', ...).
-- store the BotFather token separately with vault.create_secret(..., 'telegram_bot_token', ...).
-- Never commit either secret value.
