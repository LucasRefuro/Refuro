-- De nieuwprijs per model en opslag.
--
-- Waarom: op het A6-kaartje en in de webshop staat "Nieuwprijs: €909,-", en die moest de winkelier
-- elke keer zelf opzoeken en typen. De prijs hangt af van model en opslag, niet van de kleur: een
-- groene en een blauwe iPhone 13 met 128 GB kostten allebei €909.
--
-- Eén tabel, twee soorten rijen:
--   team_id leeg   de vaste lijst voor iedereen. De iPhones staan er hieronder in; een ander model
--                  zoekt de edge-functie model-nieuwprijs één keer op en zet het erbij.
--   team_id gevuld wat deze winkel zelf invulde of verbeterde. Die wint van de lijst.
-- Een eigen tabel en geen kolom in model_kleuren: daar schrijft alleen de service-rol, en een winkel
-- moet zijn eigen prijs kunnen bewaren.
--
-- opslag staat genormaliseerd: "128GB", "1TB" (de app schrijft "128 GB", een getypt toestel "128gb").
-- prijs is in euro inclusief btw.
-- bron: 'apple' (de lijst hieronder), 'opgezocht' (model-nieuwprijs, met bron_url), 'winkel'.
create table if not exists public.model_nieuwprijzen (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.klanten(id) on delete cascade,
  merk text not null,
  model text not null,
  opslag text not null check (opslag ~ '^[0-9.]+(GB|TB)$'),
  prijs numeric(10,2) not null check (prijs > 0 and prijs < 10000),
  bron text,
  bron_url text,
  bijgewerkt_op timestamptz not null default now(),
  -- nulls not distinct: anders kan de lijst (team_id leeg) dezelfde maat twee keer hebben
  constraint model_nieuwprijzen_uniek unique nulls not distinct (team_id, merk, model, opslag)
);
create index if not exists model_nieuwprijzen_zoek on public.model_nieuwprijzen (lower(merk), lower(model));

-- Iedereen die is ingelogd leest de lijst en de prijzen van zijn eigen winkel. Schrijven alleen in
-- de eigen winkel: de lijst (team_id leeg) is alleen voor de service-rol, want een team_id die leeg
-- is, is nooit gelijk aan my_team_id().
alter table public.model_nieuwprijzen enable row level security;
drop policy if exists model_nieuwprijzen_lezen on public.model_nieuwprijzen;
create policy model_nieuwprijzen_lezen on public.model_nieuwprijzen for select to authenticated
  using (team_id is null or team_id = public.my_team_id());
drop policy if exists model_nieuwprijzen_eigen_toevoegen on public.model_nieuwprijzen;
create policy model_nieuwprijzen_eigen_toevoegen on public.model_nieuwprijzen for insert to authenticated
  with check (team_id = public.my_team_id());
drop policy if exists model_nieuwprijzen_eigen_wijzigen on public.model_nieuwprijzen;
create policy model_nieuwprijzen_eigen_wijzigen on public.model_nieuwprijzen for update to authenticated
  using (team_id = public.my_team_id()) with check (team_id = public.my_team_id());
drop policy if exists model_nieuwprijzen_eigen_weg on public.model_nieuwprijzen;
create policy model_nieuwprijzen_eigen_weg on public.model_nieuwprijzen for delete to authenticated
  using (team_id = public.my_team_id());

-- Wanneer model-nieuwprijs voor het laatst voor dit model op het web zocht. Hooguit eens per dertig
-- dagen, en het is ook het slot als twee mensen tegelijk vragen.
alter table public.model_kleuren add column if not exists nieuwprijs_gezocht_op timestamptz;

-- De iPhones: de prijs op apple.com/nl op de dag van de introductie (opgehaald uit het Web Archive,
-- 14 november 2026, en vergeleken met iCulture). Niet de prijs van nu: Apple verhoogde op
-- 9 september 2026 de prijzen van toestellen die nog te koop waren (een iPhone 17 kost nu €1.119).
-- Let op twee dingen die vreemd lijken maar kloppen:
--   iPhone 8 en 8 Plus met 128 GB kwamen pas in september 2019, toen al goedkoper (€589 en €709)
--   dan de 64 GB bij de introductie in 2017 (€809 en €919).
--   iCulture noemt bij een paar toestellen een andere prijs (11 Pro 512 GB €1.599, XR 128 GB €909);
--   de Apple-pagina zelf zegt €1.559 en €919, en die houden we aan.
insert into public.model_nieuwprijzen (team_id, merk, model, opslag, prijs, bron)
select null, 'Apple', v.model, v.opslag, v.prijs, 'apple'
from (values
  ('iPhone 8', '64GB', 809), ('iPhone 8', '128GB', 589), ('iPhone 8', '256GB', 979),
  ('iPhone 8 Plus', '64GB', 919), ('iPhone 8 Plus', '128GB', 709), ('iPhone 8 Plus', '256GB', 1089),
  ('iPhone X', '64GB', 1159), ('iPhone X', '256GB', 1329),
  ('iPhone XR', '64GB', 859), ('iPhone XR', '128GB', 919), ('iPhone XR', '256GB', 1029),
  ('iPhone XS', '64GB', 1159), ('iPhone XS', '256GB', 1329), ('iPhone XS', '512GB', 1559),
  ('iPhone XS Max', '64GB', 1259), ('iPhone XS Max', '256GB', 1429), ('iPhone XS Max', '512GB', 1659),
  ('iPhone 11', '64GB', 809), ('iPhone 11', '128GB', 859), ('iPhone 11', '256GB', 979),
  ('iPhone 11 Pro', '64GB', 1159), ('iPhone 11 Pro', '256GB', 1329), ('iPhone 11 Pro', '512GB', 1559),
  ('iPhone 11 Pro Max', '64GB', 1259), ('iPhone 11 Pro Max', '256GB', 1429), ('iPhone 11 Pro Max', '512GB', 1659),
  ('iPhone SE (2020)', '64GB', 489), ('iPhone SE (2020)', '128GB', 539), ('iPhone SE (2020)', '256GB', 659),
  ('iPhone 12 mini', '64GB', 809), ('iPhone 12 mini', '128GB', 859), ('iPhone 12 mini', '256GB', 979),
  ('iPhone 12', '64GB', 909), ('iPhone 12', '128GB', 959), ('iPhone 12', '256GB', 1079),
  ('iPhone 12 Pro', '128GB', 1159), ('iPhone 12 Pro', '256GB', 1279), ('iPhone 12 Pro', '512GB', 1509),
  ('iPhone 12 Pro Max', '128GB', 1259), ('iPhone 12 Pro Max', '256GB', 1379), ('iPhone 12 Pro Max', '512GB', 1609),
  ('iPhone 13 mini', '128GB', 809), ('iPhone 13 mini', '256GB', 929), ('iPhone 13 mini', '512GB', 1159),
  ('iPhone 13', '128GB', 909), ('iPhone 13', '256GB', 1029), ('iPhone 13', '512GB', 1259),
  ('iPhone 13 Pro', '128GB', 1159), ('iPhone 13 Pro', '256GB', 1279), ('iPhone 13 Pro', '512GB', 1509), ('iPhone 13 Pro', '1TB', 1739),
  ('iPhone 13 Pro Max', '128GB', 1259), ('iPhone 13 Pro Max', '256GB', 1379), ('iPhone 13 Pro Max', '512GB', 1609), ('iPhone 13 Pro Max', '1TB', 1839),
  ('iPhone SE (2022)', '64GB', 529), ('iPhone SE (2022)', '128GB', 579), ('iPhone SE (2022)', '256GB', 699),
  ('iPhone 14', '128GB', 1019), ('iPhone 14', '256GB', 1149), ('iPhone 14', '512GB', 1409),
  ('iPhone 14 Plus', '128GB', 1169), ('iPhone 14 Plus', '256GB', 1299), ('iPhone 14 Plus', '512GB', 1559),
  ('iPhone 14 Pro', '128GB', 1329), ('iPhone 14 Pro', '256GB', 1459), ('iPhone 14 Pro', '512GB', 1719), ('iPhone 14 Pro', '1TB', 1979),
  ('iPhone 14 Pro Max', '128GB', 1479), ('iPhone 14 Pro Max', '256GB', 1609), ('iPhone 14 Pro Max', '512GB', 1869), ('iPhone 14 Pro Max', '1TB', 2129),
  ('iPhone 15', '128GB', 969), ('iPhone 15', '256GB', 1099), ('iPhone 15', '512GB', 1349),
  ('iPhone 15 Plus', '128GB', 1119), ('iPhone 15 Plus', '256GB', 1249), ('iPhone 15 Plus', '512GB', 1499),
  ('iPhone 15 Pro', '128GB', 1229), ('iPhone 15 Pro', '256GB', 1359), ('iPhone 15 Pro', '512GB', 1609), ('iPhone 15 Pro', '1TB', 1859),
  ('iPhone 15 Pro Max', '256GB', 1479), ('iPhone 15 Pro Max', '512GB', 1729), ('iPhone 15 Pro Max', '1TB', 1979),
  ('iPhone 16', '128GB', 969), ('iPhone 16', '256GB', 1099), ('iPhone 16', '512GB', 1349),
  ('iPhone 16 Plus', '128GB', 1119), ('iPhone 16 Plus', '256GB', 1249), ('iPhone 16 Plus', '512GB', 1499),
  ('iPhone 16 Pro', '128GB', 1229), ('iPhone 16 Pro', '256GB', 1359), ('iPhone 16 Pro', '512GB', 1609), ('iPhone 16 Pro', '1TB', 1859),
  ('iPhone 16 Pro Max', '256GB', 1479), ('iPhone 16 Pro Max', '512GB', 1729), ('iPhone 16 Pro Max', '1TB', 1979),
  ('iPhone 16e', '128GB', 719), ('iPhone 16e', '256GB', 849), ('iPhone 16e', '512GB', 1099),
  ('iPhone 17', '256GB', 969), ('iPhone 17', '512GB', 1219),
  ('iPhone Air', '256GB', 1229), ('iPhone Air', '512GB', 1479), ('iPhone Air', '1TB', 1729),
  ('iPhone 17 Pro', '256GB', 1329), ('iPhone 17 Pro', '512GB', 1579), ('iPhone 17 Pro', '1TB', 1829),
  ('iPhone 17 Pro Max', '256GB', 1479), ('iPhone 17 Pro Max', '512GB', 1729), ('iPhone 17 Pro Max', '1TB', 1979), ('iPhone 17 Pro Max', '2TB', 2479),
  ('iPhone 17e', '256GB', 719), ('iPhone 17e', '512GB', 969),
  ('iPhone 18 Pro', '256GB', 1479), ('iPhone 18 Pro', '512GB', 1729), ('iPhone 18 Pro', '1TB', 2229), ('iPhone 18 Pro', '2TB', 2979),
  ('iPhone 18 Pro Max', '256GB', 1629), ('iPhone 18 Pro Max', '512GB', 1879), ('iPhone 18 Pro Max', '1TB', 2379), ('iPhone 18 Pro Max', '2TB', 3129),
  ('iPhone Duo', '256GB', 2339), ('iPhone Duo', '512GB', 2589), ('iPhone Duo', '1TB', 3089), ('iPhone Duo', '2TB', 3839)
) as v(model, opslag, prijs)
on conflict on constraint model_nieuwprijzen_uniek do nothing;

-- De andere schrijfwijzen uit de modellenlijst (toon = false) krijgen dezelfde prijzen, zodat een
-- getypte "iPhone SE 2020" ook zijn nieuwprijs vindt.
insert into public.model_nieuwprijzen (team_id, merk, model, opslag, prijs, bron)
select null, p.merk, a.alias, p.opslag, p.prijs, p.bron
from (values ('iPhone SE 2020', 'iPhone SE (2020)'), ('iPhone SE 2022', 'iPhone SE (2022)'), ('iPhone 17 Air', 'iPhone Air'))
  as a(alias, model)
join public.model_nieuwprijzen p on p.team_id is null and p.merk = 'Apple' and p.model = a.model
on conflict on constraint model_nieuwprijzen_uniek do nothing;

-- De iPhone Duo had nog geen opslag in de modellenlijst (hij was net aangekondigd).
update public.model_kleuren set opslag = '["256 GB","512 GB","1 TB","2 TB"]'::jsonb
where lower(merk) = 'apple' and lower(model) = 'iphone duo' and opslag = '[]'::jsonb;
