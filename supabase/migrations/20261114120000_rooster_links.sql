-- Het rooster delen via een link in de groep.
--
-- Twee vaste links per winkel, die je elke week opnieuw in de groep zet:
--   token_beschikbaarheid  daar geeft je team door wanneer ze kunnen (altijd de komende week)
--   token_rooster          daar ziet je team het rooster, maar alleen van gedeelde weken
-- Vaste links en niet elke week een nieuwe: een oude link kwijtraken of de verkeerde week
-- openen kan dan niet. Lekt een link uit, dan maak je in Storvo nieuwe aan.
-- inloggen_verplicht: de eerste weken uit (iedereen met de link tikt zijn naam aan), later aan.
--
-- De links werken zonder inloggen via de edge-functie rooster-link (service-rol). In de
-- browser mag alleen de eigenaar of een beheerder ze zien en aanpassen.
create table if not exists public.rooster_links (
  team_id uuid primary key,
  token_beschikbaarheid text not null unique default replace(gen_random_uuid()::text, '-', ''),
  token_rooster text not null unique default replace(gen_random_uuid()::text, '-', ''),
  inloggen_verplicht boolean not null default false,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now()
);
alter table public.rooster_links enable row level security;
drop policy if exists rooster_links_beheer on public.rooster_links;
create policy rooster_links_beheer on public.rooster_links for all to authenticated
  using (team_id = my_team_id() and my_rol() in ('eigenaar','beheerder'))
  with check (team_id = my_team_id() and my_rol() in ('eigenaar','beheerder'));

-- Welke weken het team mag zien. Een half rooster deel je niet: pas als je op "Rooster
-- delen" drukt staat die week achter de rooster-link.
create table if not exists public.rooster_weken (
  team_id uuid not null,
  maandag date not null,
  gedeeld boolean not null default false,
  gedeeld_op timestamptz,
  primary key (team_id, maandag)
);
alter table public.rooster_weken enable row level security;
drop policy if exists rooster_weken_lezen on public.rooster_weken;
create policy rooster_weken_lezen on public.rooster_weken for select to authenticated
  using (team_id = my_team_id());
drop policy if exists rooster_weken_beheer on public.rooster_weken;
create policy rooster_weken_beheer on public.rooster_weken for all to authenticated
  using (team_id = my_team_id() and my_rol() in ('eigenaar','beheerder'))
  with check (team_id = my_team_id() and my_rol() in ('eigenaar','beheerder'));
