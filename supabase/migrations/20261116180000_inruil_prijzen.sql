-- Inruilprijzen per model, opslag en staat, per winkel.
--
-- Waarom: de inruilmodule op de webshop rekende met één bedrag per model (de staat Goed) en
-- vaste factoren voor de andere staten, en die bedragen stonden in de themabron. De winkelier
-- wilde zelf per staat de prijs bepalen, zoals Odido die per antwoord een vast bedrag noemt.
-- Daarom een echte tabel die Storvo schrijft (Inruil en inname > Inruilprijzen) en die de
-- webshop leest via de Edge Function inruil-aanvraag (GET).
--
-- De vijf staten, in de volgorde van de vragen op de webshop:
--   nieuw     Als nieuw: geen krasjes, alles werkt
--   goed      Goed: lichte krasjes, alles werkt
--   gebruikt  Gebruikt: duidelijke krassen of deukjes, alles werkt
--   kapot     Gaat aan, maar er is iets kapot (scherm, achterkant, camera, ...)
--   dood      Gaat niet meer aan
-- Een lege prijs betekent: daar noemen we online geen bedrag, de klant kan wel een aanvraag
-- doen en hoort de prijs na controle.
--
-- merk is de groep zoals de klant hem kiest ("Apple iPhone", "Windows-laptop"). opslag is
-- leeg bij toestellen zonder opslagkeuze (horloges, Windows-laptops).
-- nagekeken: de winkelier heeft deze rij bevestigd. De eerste vulling hieronder is een
-- voorstel (de bedragen die al online stonden), zodat de webshop blijft werken tot hij ze
-- heeft nagelopen.
create table if not exists public.inruil_prijzen (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.klanten(id) on delete cascade,
  soort text not null check (soort in ('telefoon','tablet','laptop','smartwatch')),
  merk text not null check (length(trim(merk)) between 1 and 60),
  model text not null check (length(trim(model)) between 1 and 120),
  opslag text not null default '' check (opslag = '' or opslag ~ '^[0-9.]+(GB|TB)$'),
  prijs_nieuw integer check (prijs_nieuw is null or prijs_nieuw between 0 and 9999),
  prijs_goed integer check (prijs_goed is null or prijs_goed between 0 and 9999),
  prijs_gebruikt integer check (prijs_gebruikt is null or prijs_gebruikt between 0 and 9999),
  prijs_kapot integer check (prijs_kapot is null or prijs_kapot between 0 and 9999),
  prijs_dood integer check (prijs_dood is null or prijs_dood between 0 and 9999),
  nagekeken boolean not null default false,
  actief boolean not null default true,
  volgorde integer not null default 0,
  bijgewerkt_op timestamptz not null default now(),
  constraint inruil_prijzen_uniek unique (team_id, soort, merk, model, opslag)
);
create index if not exists inruil_prijzen_team on public.inruil_prijzen (team_id, soort, volgorde);

-- Alleen de eigen winkel. De webshop leest via de Edge Function met service_role, en krijgt
-- alleen de actieve rijen van de winkel die bij de webshop hoort.
alter table public.inruil_prijzen enable row level security;
drop policy if exists inruil_prijzen_lezen on public.inruil_prijzen;
create policy inruil_prijzen_lezen on public.inruil_prijzen for select to authenticated
  using (team_id = public.my_team_id());
drop policy if exists inruil_prijzen_toevoegen on public.inruil_prijzen;
create policy inruil_prijzen_toevoegen on public.inruil_prijzen for insert to authenticated
  with check (team_id = public.my_team_id());
drop policy if exists inruil_prijzen_wijzigen on public.inruil_prijzen;
create policy inruil_prijzen_wijzigen on public.inruil_prijzen for update to authenticated
  using (team_id = public.my_team_id()) with check (team_id = public.my_team_id());
drop policy if exists inruil_prijzen_weg on public.inruil_prijzen;
create policy inruil_prijzen_weg on public.inruil_prijzen for delete to authenticated
  using (team_id = public.my_team_id());

-- Eerste vulling voor de winkel achter refuro.nl (de enige met een inruilmodule op de
-- webshop): de bedragen uit refuro-inruil-data.js, per model de lijst [opslag, Goed-bedrag].
-- Goed is het bedrag dat er stond; de andere staten zijn de oude factoren (als nieuw x1,06,
-- gebruikt x0,72, kapot de helft, gaat niet aan een kwart met een plafond van 150). Afgerond
-- op 5 euro, kapot en gaat-niet-aan naar beneden met minimaal 10. De volgorde is die van de
-- lijst: nieuwste modellen eerst.
with bron as (
  select e.x, e.i from jsonb_array_elements($json$[["telefoon","Apple iPhone","iPhone 17 Pro Max",[["256GB",845],["512GB",980],["1TB",1030],["2TB",1175]]],["telefoon","Apple iPhone","iPhone 17 Pro",[["256GB",765],["512GB",875],["1TB",970]]],["telefoon","Apple iPhone","iPhone 17",[["256GB",545],["512GB",680]]],["telefoon","Apple iPhone","iPhone Air",[["256GB",460],["512GB",510],["1TB",565]]],["telefoon","Apple iPhone","iPhone 16e",[["128GB",255],["256GB",320],["512GB",365]]],["telefoon","Apple iPhone","iPhone 16 Pro Max",[["256GB",600],["512GB",680],["1TB",710]]],["telefoon","Apple iPhone","iPhone 16 Pro",[["128GB",505],["256GB",520],["512GB",625],["1TB",660]]],["telefoon","Apple iPhone","iPhone 16 Plus",[["128GB",420],["256GB",520],["512GB",550]]],["telefoon","Apple iPhone","iPhone 16",[["128GB",405],["256GB",435],["512GB",490]]],["telefoon","Apple iPhone","iPhone 15 Pro Max",[["256GB",450],["512GB",475],["1TB",510]]],["telefoon","Apple iPhone","iPhone 15 Pro",[["128GB",350],["256GB",390],["512GB",425],["1TB",465]]],["telefoon","Apple iPhone","iPhone 15 Plus",[["128GB",280],["256GB",340],["512GB",365]]],["telefoon","Apple iPhone","iPhone 15",[["128GB",285],["256GB",320],["512GB",355]]],["telefoon","Apple iPhone","iPhone 14 Pro Max",[["128GB",295],["256GB",315],["512GB",380],["1TB",385]]],["telefoon","Apple iPhone","iPhone 14 Pro",[["128GB",290],["256GB",320],["512GB",355],["1TB",380]]],["telefoon","Apple iPhone","iPhone 14 Plus",[["128GB",195],["256GB",235],["512GB",295]]],["telefoon","Apple iPhone","iPhone 14",[["128GB",170],["256GB",220],["512GB",255]]],["telefoon","Apple iPhone","iPhone 13 Pro Max",[["128GB",225],["256GB",260],["512GB",280],["1TB",305]]],["telefoon","Apple iPhone","iPhone 13 Pro",[["128GB",200],["256GB",230],["512GB",260],["1TB",260]]],["telefoon","Apple iPhone","iPhone 13",[["128GB",140],["256GB",165],["512GB",220]]],["telefoon","Apple iPhone","iPhone 13 mini",[["128GB",130],["256GB",150],["512GB",230]]],["telefoon","Apple iPhone","iPhone 12 Pro Max",[["128GB",150],["256GB",165],["512GB",185]]],["telefoon","Apple iPhone","iPhone 12 Pro",[["128GB",130],["256GB",150],["512GB",170]]],["telefoon","Apple iPhone","iPhone 12",[["64GB",80],["128GB",95],["256GB",95]]],["telefoon","Apple iPhone","iPhone 12 mini",[["64GB",40],["128GB",50],["256GB",60]]],["telefoon","Apple iPhone","iPhone 11 Pro Max",[["64GB",90],["256GB",110],["512GB",140]]],["telefoon","Apple iPhone","iPhone 11 Pro",[["64GB",60],["256GB",75],["512GB",135]]],["telefoon","Apple iPhone","iPhone 11",[["64GB",50],["128GB",70],["256GB",95]]],["telefoon","Apple iPhone","iPhone SE (3e gen)",[["64GB",75],["128GB",90],["256GB",105]]],["telefoon","Apple iPhone","iPhone SE (2e gen)",[["64GB",40],["128GB",45],["256GB",55]]],["telefoon","Samsung Galaxy","Galaxy S25 Ultra",[["256GB",405],["512GB",455],["1TB",500]]],["telefoon","Samsung Galaxy","Galaxy S25+",[["256GB",355],["512GB",385]]],["telefoon","Samsung Galaxy","Galaxy S25",[["128GB",280],["256GB",320],["512GB",375]]],["telefoon","Samsung Galaxy","Galaxy S25 Edge",[["256GB",255],["512GB",315]]],["telefoon","Samsung Galaxy","Galaxy S25 FE",[["128GB",230],["256GB",270],["512GB",300]]],["telefoon","Samsung Galaxy","Galaxy S24 Ultra",[["256GB",315],["512GB",355],["1TB",420]]],["telefoon","Samsung Galaxy","Galaxy S24+",[["256GB",260],["512GB",290]]],["telefoon","Samsung Galaxy","Galaxy S24",[["128GB",240],["256GB",250],["512GB",270]]],["telefoon","Samsung Galaxy","Galaxy S24 FE",[["128GB",190],["256GB",235],["512GB",260]]],["telefoon","Samsung Galaxy","Galaxy S23 Ultra",[["256GB",250],["512GB",270],["1TB",335]]],["telefoon","Samsung Galaxy","Galaxy S23+",[["256GB",205],["512GB",235]]],["telefoon","Samsung Galaxy","Galaxy S23",[["128GB",170],["256GB",200]]],["telefoon","Samsung Galaxy","Galaxy S22 Ultra",[["128GB",155],["256GB",170],["512GB",195],["1TB",240]]],["telefoon","Samsung Galaxy","Galaxy S22+",[["128GB",130],["256GB",150]]],["telefoon","Samsung Galaxy","Galaxy S22",[["128GB",100],["256GB",120]]],["telefoon","Samsung Galaxy","Galaxy A56",[["128GB",140],["256GB",160]]],["telefoon","Samsung Galaxy","Galaxy A55",[["128GB",120],["256GB",135]]],["telefoon","Samsung Galaxy","Galaxy A54",[["128GB",100],["256GB",115]]],["telefoon","Google Pixel","Pixel 10 Pro XL",[["256GB",400],["512GB",440],["1TB",470]]],["telefoon","Google Pixel","Pixel 10 Pro",[["128GB",330],["256GB",370],["512GB",410],["1TB",440]]],["telefoon","Google Pixel","Pixel 10 Pro Fold",[["256GB",560],["512GB",620],["1TB",680]]],["telefoon","Google Pixel","Pixel 10",[["128GB",270],["256GB",300]]],["telefoon","Google Pixel","Pixel 9 Pro XL",[["128GB",270],["256GB",325],["512GB",370],["1TB",370]]],["telefoon","Google Pixel","Pixel 9 Pro Fold",[["256GB",500],["512GB",560]]],["telefoon","Google Pixel","Pixel 9 Pro",[["128GB",325],["256GB",410],["512GB",435],["1TB",460]]],["telefoon","Google Pixel","Pixel 9",[["128GB",235],["256GB",310]]],["telefoon","Google Pixel","Pixel 9a",[["128GB",200],["256GB",230]]],["telefoon","Google Pixel","Pixel 8 Pro",[["128GB",175],["256GB",245],["512GB",260],["1TB",280]]],["telefoon","Google Pixel","Pixel 8",[["128GB",140],["256GB",175]]],["telefoon","Google Pixel","Pixel 8a",[["128GB",125],["256GB",170]]],["telefoon","Google Pixel","Pixel 7 Pro",[["128GB",110],["256GB",155],["512GB",175]]],["telefoon","Google Pixel","Pixel 7",[["128GB",90],["256GB",120]]],["telefoon","Google Pixel","Pixel 7a",[["128GB",100]]],["telefoon","Google Pixel","Pixel 6 Pro",[["128GB",90],["256GB",105],["512GB",120]]],["telefoon","Google Pixel","Pixel 6",[["128GB",70],["256GB",85]]],["telefoon","Google Pixel","Pixel 6a",[["128GB",65]]],["telefoon","OnePlus","OnePlus 13",[["256GB",380],["512GB",430],["1TB",470]]],["telefoon","OnePlus","OnePlus 12",[["256GB",280],["512GB",320],["1TB",360]]],["telefoon","OnePlus","OnePlus 11",[["128GB",180],["256GB",210],["512GB",240]]],["telefoon","OnePlus","OnePlus 10 Pro",[["128GB",140],["256GB",160],["512GB",180]]],["telefoon","OnePlus","OnePlus 9 Pro",[["128GB",110],["256GB",130]]],["telefoon","OnePlus","OnePlus 9",[["128GB",80],["256GB",95]]],["laptop","Apple MacBook","MacBook Pro 14\"/16\" (M4/M4 Pro/M4 Max, 2024)",[["512GB",1300],["1TB",1450],["2TB",1650],["4TB",1950],["8TB",2300]]],["laptop","Apple MacBook","MacBook Pro 14\"/16\" (M3/M3 Pro/M3 Max, 2023)",[["512GB",1050],["1TB",1180],["2TB",1350],["4TB",1600],["8TB",1900]]],["laptop","Apple MacBook","MacBook Pro 14\"/16\" (M2 Pro/M2 Max, 2023)",[["512GB",900],["1TB",1020],["2TB",1180],["4TB",1400],["8TB",1650]]],["laptop","Apple MacBook","MacBook Pro 14\"/16\" (M1 Pro/M1 Max, 2021)",[["512GB",720],["1TB",820],["2TB",950],["4TB",1150],["8TB",1400]]],["laptop","Apple MacBook","MacBook Pro 13\" (M2, 2022)",[["256GB",520],["512GB",580],["1TB",640],["2TB",720]]],["laptop","Apple MacBook","MacBook Pro 13\" (M1, 2020)",[["256GB",420],["512GB",480],["1TB",540],["2TB",620]]],["laptop","Apple MacBook","MacBook Air 13\"/15\" (M4, 2025)",[["256GB",780],["512GB",850],["1TB",920],["2TB",1000]]],["laptop","Apple MacBook","MacBook Air 13\"/15\" (M3, 2024)",[["256GB",650],["512GB",720],["1TB",790],["2TB",870]]],["laptop","Apple MacBook","MacBook Air 15\" (M2, 2023)",[["256GB",560],["512GB",620],["1TB",680],["2TB",760]]],["laptop","Apple MacBook","MacBook Air 13\" (M2, 2022)",[["256GB",480],["512GB",540],["1TB",600],["2TB",680]]],["laptop","Apple MacBook","MacBook Air 13\" (M1, 2020)",[["256GB",330],["512GB",380],["1TB",430],["2TB",500]]],["laptop","Windows-laptop","Windows-laptop Core i7",[["",150]]],["laptop","Windows-laptop","Windows-laptop Core i5 (recent)",[["",95]]],["laptop","Windows-laptop","Windows-laptop Core i5 (ouder)",[["",45]]],["laptop","Windows-laptop","Windows-laptop Core i3",[["",35]]],["tablet","Apple iPad","iPad Pro 11\"/13\" (M5, 2025)",[["256GB",850],["512GB",960],["1TB",1150],["2TB",1330]]],["tablet","Apple iPad","iPad Pro 11\"/13\" (M4, 2024)",[["256GB",680],["512GB",780],["1TB",950],["2TB",1120]]],["tablet","Apple iPad","iPad Pro 11\"/12.9\" (M2, 2022)",[["128GB",420],["256GB",480],["512GB",560],["1TB",680],["2TB",820]]],["tablet","Apple iPad","iPad Pro 11\"/12.9\" (M1, 2021)",[["128GB",330],["256GB",380],["512GB",450],["1TB",560],["2TB",680]]],["tablet","Apple iPad","iPad Air 11\"/13\" (M3, 2025)",[["128GB",450],["256GB",520],["512GB",600],["1TB",710]]],["tablet","Apple iPad","iPad Air 11\"/13\" (M2, 2024)",[["128GB",370],["256GB",430],["512GB",510],["1TB",620]]],["tablet","Apple iPad","iPad Air (M1, 2022)",[["64GB",220],["256GB",290]]],["tablet","Apple iPad","iPad mini (7e gen, A17 Pro, 2024)",[["128GB",330],["256GB",400],["512GB",490]]],["tablet","Apple iPad","iPad mini (6e gen, 2021)",[["64GB",200],["256GB",280]]],["tablet","Apple iPad","iPad (11e gen, A16, 2025)",[["128GB",230],["256GB",290],["512GB",360]]],["tablet","Apple iPad","iPad (10e gen, 2022)",[["64GB",150],["256GB",220]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S11 Ultra (2025)",[["256GB",620],["512GB",700],["1TB",820]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S11 (2025)",[["128GB",350],["256GB",400],["512GB",470]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S10 Ultra (2024)",[["256GB",560],["512GB",630],["1TB",740]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S10+ (2024)",[["256GB",450],["512GB",510]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S10 FE / FE+ (2025)",[["128GB",250],["256GB",290]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S9 Ultra (2023)",[["256GB",450],["512GB",520],["1TB",620]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S9+ (2023)",[["256GB",380],["512GB",440]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S9 (2023)",[["128GB",280],["256GB",320]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S9 FE+ (2023)",[["128GB",260],["256GB",300]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S9 FE (2023)",[["128GB",200],["256GB",240]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S8 Ultra (2022)",[["128GB",300],["256GB",340],["512GB",400]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S8+ (2022)",[["128GB",230],["256GB",270]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S8 (2022)",[["128GB",180],["256GB",210]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S7 FE (2021)",[["64GB",110],["128GB",130],["256GB",160]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S7+ (2020)",[["128GB",180],["256GB",210],["512GB",250]]],["tablet","Samsung Galaxy Tab","Galaxy Tab S7 (2020)",[["128GB",130],["256GB",160]]],["smartwatch","Apple Watch","Apple Watch Ultra 3 (2025)",[["",480]]],["smartwatch","Apple Watch","Apple Watch Series 11 (2025)",[["",320]]],["smartwatch","Apple Watch","Apple Watch SE 3 (2025)",[["",150]]],["smartwatch","Apple Watch","Apple Watch Series 10 (2024)",[["",250]]],["smartwatch","Apple Watch","Apple Watch Ultra 2 (2023)",[["",380]]],["smartwatch","Apple Watch","Apple Watch Series 9 (2023)",[["",170]]],["smartwatch","Apple Watch","Apple Watch Ultra (2022)",[["",260]]],["smartwatch","Apple Watch","Apple Watch Series 8 (2022)",[["",120]]],["smartwatch","Apple Watch","Apple Watch SE (2e gen, 2022)",[["",90]]],["smartwatch","Apple Watch","Apple Watch Series 7 (2021)",[["",90]]],["smartwatch","Apple Watch","Apple Watch Series 6 (2020)",[["",60]]],["smartwatch","Apple Watch","Apple Watch SE (1e gen, 2020)",[["",40]]]]$json$::jsonb) with ordinality as e(x, i)
), rij as (
  select b.x->>0 as soort, b.x->>1 as merk, b.x->>2 as model, o.y->>0 as opslag,
         (o.y->>1)::numeric as goed, (b.i * 10 + o.j)::int as volgorde
  from bron b, jsonb_array_elements(b.x->3) with ordinality as o(y, j)
)
insert into public.inruil_prijzen
  (team_id, soort, merk, model, opslag, prijs_nieuw, prijs_goed, prijs_gebruikt, prijs_kapot, prijs_dood, volgorde)
select 'ce975142-a7d9-4fb2-9cb5-9cc1fe1d7f65'::uuid, soort, merk, model, opslag,
       (round(goed * 1.06 / 5) * 5)::int,
       goed::int,
       (round(goed * 0.72 / 5) * 5)::int,
       greatest(10, floor(goed * 0.5 / 5) * 5)::int,
       greatest(10, floor(least(goed * 0.25, 150) / 5) * 5)::int,
       volgorde
from rij
where exists (select 1 from public.klanten k where k.id = 'ce975142-a7d9-4fb2-9cb5-9cc1fe1d7f65'::uuid)
on conflict (team_id, soort, merk, model, opslag) do nothing;
