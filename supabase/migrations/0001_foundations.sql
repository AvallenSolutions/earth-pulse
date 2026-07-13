-- Earth Pulse migration 0001: foundations
-- Lives in the shared alkatera-lca-verifier Supabase project, fully isolated in
-- its own "earth_pulse" schema (decision: reuse existing project, 13 Jul 2026).
-- Public read-only via RLS; writes happen only through the service role / MCP.
-- Note: to read this schema through the Supabase API, add "earth_pulse" to
-- Settings > API > Exposed schemas in the dashboard (one-off toggle).

create schema if not exists earth_pulse;

grant usage on schema earth_pulse to anon, authenticated;

create table earth_pulse.countries (
  iso3 text primary key check (iso3 ~ '^[A-Z]{3}$'),
  name text not null,
  continent text,
  region text,
  on_map boolean not null default false
);

create table earth_pulse.metrics (
  id text primary key,
  name text not null,
  unit text not null,
  domain text not null check (domain in ('climate','energy','water','pollution','ice_oceans','land_life')),
  source text not null,
  source_url text not null,
  licence text,
  explainer text,
  time_resolution text not null default 'annual' check (time_resolution in ('annual','monthly','daily')),
  first_year int,
  last_year int,
  updated_at timestamptz not null default now()
);

create table earth_pulse.observations (
  metric_id text not null references earth_pulse.metrics(id) on delete cascade,
  iso3 text not null references earth_pulse.countries(iso3),
  date date not null,
  value double precision not null,
  primary key (metric_id, iso3, date)
);

create index observations_iso3_idx on earth_pulse.observations (iso3, metric_id);

create table earth_pulse.ingest_rejects (
  id bigint generated always as identity primary key,
  source text not null,
  entity text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table earth_pulse.countries enable row level security;
alter table earth_pulse.metrics enable row level security;
alter table earth_pulse.observations enable row level security;
alter table earth_pulse.ingest_rejects enable row level security;

grant select on earth_pulse.countries, earth_pulse.metrics, earth_pulse.observations to anon, authenticated;

create policy "public read countries" on earth_pulse.countries for select using (true);
create policy "public read metrics" on earth_pulse.metrics for select using (true);
create policy "public read observations" on earth_pulse.observations for select using (true);
-- ingest_rejects: no grants, no policies; service role only.
