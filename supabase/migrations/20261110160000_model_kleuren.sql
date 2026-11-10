-- De kleuren die van een model bestaan, gedeeld door alle winkels.
--
-- Waarom: een telefoon zoekt zijn fabrieksfoto's op kleur en de webshop zet de kleur in de
-- sleutel van de advertentie. De winkelier moest de kleurnaam zelf opzoeken en overtypen.
-- Nu kiest hij hem uit een lijst. De edge-functie model-kleuren vult deze tabel: wat er al
-- in staat komt direct terug, een nieuw model vraagt hij één keer op en bewaart hij hier.
--
-- Een eigen tabel en niet in hardware_modellen.opties: model_opties_bewaren vervangt die
-- hele kolom, dus de kleuren zouden bij het volgende specs-antwoord stil verdwijnen.
-- Lezen mag iedereen die is ingelogd (openbare modelfeiten, niets van een winkel).
-- Schrijven alleen via de edge-functie met de service-rol: geen schrijfregel.
create table if not exists public.model_kleuren (
  id uuid primary key default gen_random_uuid(),
  merk text not null,
  model text not null,
  kleuren jsonb not null default '[]'::jsonb,
  bijgewerkt_op timestamptz not null default now()
);
create unique index if not exists model_kleuren_uniek on public.model_kleuren (lower(merk), lower(model));
alter table public.model_kleuren enable row level security;
drop policy if exists model_kleuren_lezen on public.model_kleuren;
create policy model_kleuren_lezen on public.model_kleuren for select to authenticated using (true);
