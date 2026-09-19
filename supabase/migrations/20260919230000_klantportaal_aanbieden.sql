-- Partij aanbieden via de website, met een slim bod.
-- De website (bijv. reloopit.nl/pages/aanbieden) vraagt via de functie klantportaal
-- (acties 'bod' en 'aanbieden') een prijsindicatie op en stuurt de aanbieding in.
-- Alleen toevoegingen; Storvo-tabellen worden alleen gelezen (hardware.verkoop).

-- Welk deel van de doorverkoopwaarde we bieden, per groep, als [min, max] procent.
alter table public.klantportaal_instellingen
  add column if not exists bod_pct jsonb not null default '{"mobiel":[60,60],"overig":[70,80]}'::jsonb;

-- Marktschattingen bewaren we 30 dagen: scheelt AI-kosten en geeft dezelfde prijs bij dezelfde vraag.
create table if not exists public.klantportaal_prijscache (
  team_id uuid not null,
  sleutel text not null,
  laag numeric, advies numeric, hoog numeric,
  uitleg text,
  gemaakt_op timestamptz not null default now(),
  primary key (team_id, sleutel)
);
alter table public.klantportaal_prijscache enable row level security;
drop policy if exists klantportaal_prijscache_team on public.klantportaal_prijscache;
create policy klantportaal_prijscache_team on public.klantportaal_prijscache
  for select to authenticated using (team_id = public.my_team_id());

-- Aanbiedingen van de website. Aannemen in portaalbeheer maakt er een organisatie en
-- opdracht van en nodigt de contactpersoon uit voor het portaal.
create table if not exists public.klantportaal_aanbiedingen (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  status text not null default 'nieuw' check (status in ('nieuw','aangenomen','afgewezen')),
  bedrijf text not null,
  naam text,
  email text not null,
  telefoon text,
  ophaaladres text,
  periode text,
  dataverwijdering text,
  opmerking text,
  regels jsonb not null default '[]'::jsonb,
  bod_min numeric,
  bod_max numeric,
  organisatie_id uuid references public.klantportaal_organisaties(id) on delete set null,
  opdracht_id uuid references public.klantportaal_opdrachten(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);
create index if not exists klantportaal_aanbiedingen_team on public.klantportaal_aanbiedingen(team_id, aangemaakt_op desc);
alter table public.klantportaal_aanbiedingen enable row level security;
drop policy if exists klantportaal_aanbiedingen_team on public.klantportaal_aanbiedingen;
create policy klantportaal_aanbiedingen_team on public.klantportaal_aanbiedingen
  for all to authenticated using (team_id = public.my_team_id()) with check (team_id = public.my_team_id());
