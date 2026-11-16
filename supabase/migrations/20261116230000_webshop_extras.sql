-- Extra's bij een toestel op de webshop: stekker, glas, hoesje, beschermset, muis, sleeve, en de
-- dienst "klaar voor gebruik".
--
-- Waarom een eigen tabel: de eigenaar wil één voorraad voor winkel en webshop (november 2026). De
-- voorraad zelf blijft bij de producten van de winkelapp (barcode). Deze tabel zegt alleen welke
-- extra er is, wat hij online kost, bij welk soort toestel hij hoort, en per uitvoering welke
-- producten erin zitten. Een beschermset is glas plus hoesje: twee barcodes, en hij is er zolang
-- van allebei iets ligt.
--
-- varianten: [{label, modellen: [modelnamen], barcodes: [barcode van het product], prijs?, categorie?}]
--   modellen leeg = past bij elk toestel van die soort. categorie gebruikt alleen een dienst die per
--   soort toestel een andere prijs heeft (klaar voor gebruik: telefoon of laptop).
-- shopify_varianten: {label: {id, sku}}, zodat de webhook een verkochte regel terugvindt.
create table if not exists public.webshop_extras (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.klanten(id) on delete cascade,
  sleutel text not null check (sleutel ~ '^[a-z0-9-]+$'),
  naam text not null,
  omschrijving text not null default '',
  soort text not null default 'artikel' check (soort in ('artikel', 'dienst')),
  voor text[] not null default '{}',
  alleen_ophalen boolean not null default false,
  prijs numeric(10,2) not null check (prijs >= 0),
  actief boolean not null default true,
  volgorde integer not null default 0,
  varianten jsonb not null default '[]'::jsonb check (jsonb_typeof(varianten) = 'array'),
  shopify_product_id text,
  shopify_varianten jsonb not null default '{}'::jsonb,
  bijgewerkt_op timestamptz not null default now(),
  constraint webshop_extras_uniek unique (team_id, sleutel)
);

alter table public.webshop_extras enable row level security;
drop policy if exists webshop_extras_lezen on public.webshop_extras;
create policy webshop_extras_lezen on public.webshop_extras for select using (team_id = my_team_id());
drop policy if exists webshop_extras_toevoegen on public.webshop_extras;
create policy webshop_extras_toevoegen on public.webshop_extras for insert with check (team_id = my_team_id());
drop policy if exists webshop_extras_wijzigen on public.webshop_extras;
create policy webshop_extras_wijzigen on public.webshop_extras for update using (team_id = my_team_id()) with check (team_id = my_team_id());
drop policy if exists webshop_extras_weg on public.webshop_extras;
create policy webshop_extras_weg on public.webshop_extras for delete using (team_id = my_team_id());

-- Wat er bij een webshopbestelling aan extra's mee kwam, en of de winkelapp dat al van de
-- voorraad heeft gehaald. Waarom hier en niet in de winkeldata-blob: de blob is "laatste
-- schrijver wint", dus een vinkje "al afgeboekt" dat alleen daar leeft kan verdwijnen, en dan
-- haal je het nog een keer van de voorraad af. Hier claimt één apparaat de boeking met een
-- voorwaardelijke update (extras_boeking is null -> 'af'); een tweede apparaat krijgt niets terug.
--   null    = nog niet afgeboekt
--   'af'    = van de voorraad gehaald
--   'terug' = geannuleerd en weer op de voorraad gezet
alter table public.webshop_bestellingen add column if not exists extras jsonb not null default '[]'::jsonb;
alter table public.webshop_bestellingen add column if not exists extras_boeking text;
alter table public.webshop_bestellingen drop constraint if exists webshop_bestellingen_extras_boeking;
alter table public.webshop_bestellingen add constraint webshop_bestellingen_extras_boeking
  check (extras_boeking is null or extras_boeking in ('af', 'terug'));
