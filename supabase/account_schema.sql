-- cad2d account-based licensing — run in the Supabase SQL Editor.
-- Requires Supabase Auth (email/password) enabled: Authentication → Providers → Email.
--
-- Customers self-register via Supabase Auth. You grant a license by inserting a
-- row here after purchase. Revoke by setting active = false (or deleting the row).

create table if not exists entitlements (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  product    text        not null default 'cad2d',
  seats      int         not null default 1 check (seats >= 1),
  active     boolean     not null default true,
  note       text,                                   -- e.g. invoice id / customer name
  created_at timestamptz not null default now(),
  primary key (user_id, product)
);

-- The license API reads/writes this with the SERVICE ROLE key (bypasses RLS).
-- Enable RLS and add ONE policy: a signed-in user may READ their own row (handy
-- for a future self-serve account page). No insert/update from the client.
alter table entitlements enable row level security;

drop policy if exists "read own entitlement" on entitlements;
create policy "read own entitlement" on entitlements
  for select to authenticated
  using (user_id = auth.uid());

-- Seat tracking reuses the license_activations table from license_schema.sql
-- (license_id column holds the user's uuid in the account model). If you are
-- using ONLY the account model, run license_schema.sql too — it creates that
-- table (the license_revocations table it also makes is simply unused here).
