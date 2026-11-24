-- Het magazijn: de stellingkast achter in de winkel, met planken, bakken en vakken. Een vak is
-- het stuk tussen twee schotjes in een bak, meestal één per model (iPhone 16 Pro).
--
-- Waarom een eigen tabel: nieuwe dingen gaan in echte tabellen (CLAUDE.md), en de indeling is
-- van het hele team.
--
-- Hoeveel er van een product in een vak ligt staat NIET hier, maar bij het product in de
-- winkeldata-blob: producten[].plekken = [{id, n}], de eerste is de vaste plek. Dat is bewust.
-- Het aantal dat achter ligt (voorraad min winkel) staat daar al. Twee plekken voor hetzelfde
-- getal lopen uit de pas; zo reizen aantal en plek samen mee met de sync van dat ene product.
--
-- kort: de letter of het nummer op het label (kast A, plank 2, bak 3, samen A2-3). Wordt bij het
--   aanmaken vastgezet en schuift niet op als er later iets tussen komt. Anders klopt een label
--   dat al op de kast zit opeens niet meer.
-- code: wat de barcode op het label zegt (PL-XXXXXX). Vast en los van de plek, zodat je een bak
--   kunt hernoemen zonder opnieuw te stickeren.
create table if not exists public.magazijn_plekken (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.klanten(id) on delete cascade,
  soort text not null check (soort in ('kast', 'plank', 'bak', 'vak')),
  ouder_id uuid references public.magazijn_plekken(id) on delete cascade,
  kort text not null default '',
  naam text not null default '',
  sub text not null default '',
  volgorde integer not null default 0,
  code text not null check (code ~ '^PL-[A-Z0-9]{4,10}$'),
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now(),
  constraint magazijn_plekken_code unique (team_id, code),
  -- Alleen een kast staat los; al het andere hangt ergens onder.
  constraint magazijn_plekken_ouder check ((soort = 'kast') = (ouder_id is null))
);
create index if not exists magazijn_plekken_team on public.magazijn_plekken (team_id);
create index if not exists magazijn_plekken_ouder_idx on public.magazijn_plekken (ouder_id);

alter table public.magazijn_plekken enable row level security;
drop policy if exists magazijn_plekken_lezen on public.magazijn_plekken;
create policy magazijn_plekken_lezen on public.magazijn_plekken for select using (team_id = my_team_id());
drop policy if exists magazijn_plekken_toevoegen on public.magazijn_plekken;
create policy magazijn_plekken_toevoegen on public.magazijn_plekken for insert with check (team_id = my_team_id());
drop policy if exists magazijn_plekken_wijzigen on public.magazijn_plekken;
create policy magazijn_plekken_wijzigen on public.magazijn_plekken for update using (team_id = my_team_id()) with check (team_id = my_team_id());
drop policy if exists magazijn_plekken_weg on public.magazijn_plekken;
create policy magazijn_plekken_weg on public.magazijn_plekken for delete using (team_id = my_team_id());
