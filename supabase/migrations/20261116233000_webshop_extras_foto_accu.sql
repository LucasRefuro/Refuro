-- Extra's met een foto, en de nieuwe accu in dezelfde tabel.
--
-- foto: de eigenaar wil de extra's als kaartjes met foto op de productpagina (november 2026).
-- De foto gaat bij het aanmaken mee naar Shopify.
--
-- handle en sku_voorvoegsel: de nieuwe accu bestond al als twee producten (nieuwe-accu-telefoon,
-- nieuwe-accu-laptop) met sku NIEUWE-ACCU-...; het thema zoekt ze op die handle en de webhook
-- herkent ze aan die sku. Nu krijgt de telefoonaccu drie prijzen (OEM tot en met iPhone 15, OEM
-- vanaf iPhone 16, origineel). Door de accu hier als rij te zetten met zijn eigen handle en
-- voorvoegsel, past de eigenaar de prijs aan op dezelfde plek als de andere extra's, en blijven
-- het thema en de webhook werken zoals ze werkten. Leeg = extra-<sleutel> en EXTRA-<SLEUTEL>.
alter table public.webshop_extras add column if not exists foto text;
alter table public.webshop_extras add column if not exists handle text check (handle is null or handle ~ '^[a-z0-9-]+$');
alter table public.webshop_extras add column if not exists sku_voorvoegsel text check (sku_voorvoegsel is null or sku_voorvoegsel ~ '^[A-Z0-9-]+$');
