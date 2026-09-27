-- Fase 0 van het seriele voorraadsysteem: per grade-variant een FIFO-wachtrij van echte
-- exemplaren, waarvan de front (oudste) zijn eigen A-nummer + accu% toont en bij verkoop
-- roteert. Deze migratie is PUUR ADDITIEF: niets leest deze kolommen/velden nog, dus het
-- gedrag verandert pas in de latere fasen (variant-metafields, webhook-binding).

-- 1. accu% per exemplaar op de verkoopkant. Stond alleen in refurbish_apparaten.accu (via
--    join op hardware_id); de push en de webhook moeten het per grade-front kunnen lezen
--    zonder de werkbank-tabel te raken.
alter table hardware add column if not exists accu int;

-- eenmalig bijvullen uit de werkbank voor de bestaande voorraad.
update hardware h set accu = ra.accu
from refurbish_apparaten ra
where h.accu is null and ra.hardware_id = h.id and ra.accu is not null;

-- 2. indexen voor snelle rotatie: de front per (sleutel, grade) opzoeken.
create index if not exists hardware_voorraad_grade_idx on hardware (team_id, status, staat);
create index if not exists hardware_shopify_sleutel_idx on hardware ((kanalen->'shopify'->>'sleutel'));

-- 3. welk exemplaar NU per grade online staat, expliciet en auditbaar (A/B/C -> hardware_id),
--    i.p.v. impliciet "de oudste". De webhook gebruikt dit later om variant -> exemplaar te
--    binden zonder te gokken.
alter table webshop_producten add column if not exists fronten jsonb not null default '{}'::jsonb;
