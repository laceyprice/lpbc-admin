-- Small key/value store for secrets the admin can change at runtime without
-- redeploying. First use: the Account Vault's encryption key (lib/vault-crypto.ts)
-- unless VAULT_ENCRYPTION_KEY is set in the environment.
-- Service role only; RLS blocks everyone else.

create table if not exists app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_secrets enable row level security;
drop policy if exists "app_secrets_no_anon" on app_secrets;
create policy "app_secrets_no_anon" on app_secrets for all using (false);
