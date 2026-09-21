-- Een historische (backfill) Clover-order mag de winkelapp WEL als omzet boeken, maar
-- NIET de huidige voorraad afboeken: die verkopen zijn al lang geleden gebeurd, de
-- voorraad van vandaag klopt al. Live-orders (poll/webhook) houden historisch=false en
-- lopen door het normale pad (omzet + voorraad). Zo halen we een jaar terminal-omzet
-- binnen zonder de aantallen scheef te trekken.
alter table public.clover_bestellingen
  add column if not exists historisch boolean not null default false;
