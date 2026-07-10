-- cad2d activation state — run this in the Supabase SQL Editor.
--
-- These tables are written ONLY by the license API functions, which use the
-- SERVICE ROLE key (bypasses RLS). We enable RLS and add NO anon policies, so
-- the tables are invisible to the public anon key used by the website — the
-- activation records (customer machine bindings) are never web-readable.

create table if not exists license_activations (
  license_id   text        not null,
  machine      text        not null,
  lease_expiry bigint      not null,          -- unix epoch seconds
  updated_at   timestamptz not null default now(),
  primary key (license_id, machine)           -- one seat row per (key, device)
);
create index if not exists license_activations_by_key on license_activations (license_id);

create table if not exists license_revocations (
  license_id text        primary key,
  revoked_at timestamptz not null default now()
);

-- Lock both tables down: RLS on, no anon/authenticated policies.
-- (The service role key used by the API bypasses RLS by design.)
alter table license_activations enable row level security;
alter table license_revocations enable row level security;
