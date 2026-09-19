-- Lijsten voor handelaren: hele voorraad, per merk, per batch, per bundel.
-- De functie 'lijst' maakt ze als Excel, CSV, printbare pagina of JSON (voor de webshop).
-- Toegang met een sleutel per winkel; die staat in portaalbeheer en in het Shopify-thema.
-- Alleen toevoegingen; de refurbish-tabellen worden alleen gelezen.
alter table public.klantportaal_instellingen
  add column if not exists lijst_sleutel text not null default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists lijst_prijzen boolean not null default false;
