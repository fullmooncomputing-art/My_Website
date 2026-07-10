-- cad2d paid-key model — run in the Supabase SQL Editor.
-- A license key is a long random string you issue AFTER a payment; it's stored
-- here and confirmed server-side on activation. Seat count + an active flag give
-- you device limits and a kill switch. Reuses license_activations (from
-- license_schema.sql) for per-device seat tracking, keyed by this row's id.

create table if not exists license_keys (
  id         uuid        primary key default gen_random_uuid(),
  key        text        unique not null,            -- the 65-char passkey emailed to the customer
  email      text,                                   -- who it was issued to
  seats      int         not null default 1 check (seats >= 1),
  active     boolean     not null default true,      -- set false to revoke
  note       text,                                   -- your own record: invoice id, name, etc.
  created_at timestamptz not null default now()
);
create index if not exists license_keys_by_key on license_keys (key);

-- Written/read only by the API using the SERVICE ROLE key (bypasses RLS). No
-- anon policies -> the keys table is never exposed through the public anon key.
alter table license_keys enable row level security;
