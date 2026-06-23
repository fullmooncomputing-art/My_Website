-- Full Moon Computing — Contact Form Schema
-- Run this in Supabase SQL Editor to set up the contacts table

create table contacts (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text not null,
  phone text,
  service text,
  message text not null,
  created_at timestamptz default now()
);

-- Allow anonymous inserts (for contact form submissions)
create policy "Allow inserts" on contacts
for insert to anon
with check (true);

-- Grant INSERT privilege to anon role
GRANT INSERT ON public.contacts TO anon;
