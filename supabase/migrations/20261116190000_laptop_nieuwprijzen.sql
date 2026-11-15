-- De nieuwprijs van een laptop of desktop, per uitvoering.
--
-- Waarom: laptops voeg je sinds november 2026 ook in de winkelapp toe (zonder de controle aan de
-- werkbank). Je vult processor, geheugen, opslag en scherm in, en Storvo zoekt de nieuwprijs op.
-- Bij een telefoon hangt die prijs alleen van model en opslag af (model_nieuwprijzen). Bij een
-- laptop van de uitvoering: een EliteBook 840 G10 met een i5 en 8 GB kostte iets anders dan met
-- een i7 en 32 GB. Daarom een eigen tabel, met een sleutel per uitvoering.
--
-- Twee soorten rijen, net als model_nieuwprijzen:
--   team_id leeg   de gedeelde lijst. Alleen de edge-functie model-nieuwprijs schrijft hier (de
--                  service-rol). prijs leeg = gezocht en niets gevonden; gezocht_op is dan ook het
--                  slot, zodat we hooguit eens per dertig dagen per uitvoering zoeken.
--   team_id gevuld wat deze winkel zelf invulde of verbeterde. Die wint van de lijst.
--
-- uitvoering is de sleutel "processor|geheugen|opslag", zo geschreven dat "Intel Core i5-1335U" en
-- "i5-1335U" hetzelfde zijn ("i5 1335u|16GB|512GB"). De rekenregel staat twee keer: in
-- model-nieuwprijs/prijzen.ts (uitvoeringSleutel) en in de winkelapp (nwlSleutel). tests/laptop-toevoegen.js legt ze
-- naast elkaar. processor, geheugen en opslag staan er ook leesbaar bij, om na te kijken.
create table if not exists public.laptop_nieuwprijzen (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.klanten(id) on delete cascade,
  merk text not null,
  model text not null,
  uitvoering text not null check (uitvoering ~ '^[a-z0-9 ]+\|[0-9.]+(GB|TB)\|[0-9.]+(GB|TB)$'),
  processor text,
  geheugen text,
  opslag text,
  prijs numeric(10,2) check (prijs is null or (prijs > 0 and prijs < 20000)),
  bron text,
  bron_url text,
  gezocht_op timestamptz,
  bijgewerkt_op timestamptz not null default now(),
  -- Een eigen prijs heeft altijd een bedrag; alleen de gedeelde lijst kent "gezocht, niets gevonden".
  constraint laptop_nieuwprijzen_eigen_prijs check (team_id is null or prijs is not null),
  -- nulls not distinct: anders kan de lijst (team_id leeg) dezelfde uitvoering twee keer hebben
  constraint laptop_nieuwprijzen_uniek unique nulls not distinct (team_id, merk, model, uitvoering)
);
create index if not exists laptop_nieuwprijzen_zoek on public.laptop_nieuwprijzen (lower(merk), lower(model));

-- Iedereen die is ingelogd leest de lijst en de prijzen van zijn eigen winkel. Schrijven alleen in
-- de eigen winkel: een lege team_id is nooit gelijk aan my_team_id(), dus de lijst blijft van de
-- service-rol.
alter table public.laptop_nieuwprijzen enable row level security;
drop policy if exists laptop_nieuwprijzen_lezen on public.laptop_nieuwprijzen;
create policy laptop_nieuwprijzen_lezen on public.laptop_nieuwprijzen for select to authenticated
  using (team_id is null or team_id = public.my_team_id());
drop policy if exists laptop_nieuwprijzen_eigen_toevoegen on public.laptop_nieuwprijzen;
create policy laptop_nieuwprijzen_eigen_toevoegen on public.laptop_nieuwprijzen for insert to authenticated
  with check (team_id = public.my_team_id());
drop policy if exists laptop_nieuwprijzen_eigen_wijzigen on public.laptop_nieuwprijzen;
create policy laptop_nieuwprijzen_eigen_wijzigen on public.laptop_nieuwprijzen for update to authenticated
  using (team_id = public.my_team_id()) with check (team_id = public.my_team_id());
drop policy if exists laptop_nieuwprijzen_eigen_weg on public.laptop_nieuwprijzen;
create policy laptop_nieuwprijzen_eigen_weg on public.laptop_nieuwprijzen for delete to authenticated
  using (team_id = public.my_team_id());
