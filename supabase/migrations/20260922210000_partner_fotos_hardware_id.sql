-- QR-foto's koppelen we op de blob-product-id, maar die wisselt als partner-sync een product
-- na een sync-race opnieuw aanmaakt -> foto's raken los van hun toestel. hardware_id is stabiel
-- (echte kolom, gezet door de winkel bij toewijzen). We stempelen die op de fotocode en de foto,
-- en reconcileFotos matcht er ook op terug. Nullable: partner-eigen producten hebben geen
-- hardware_id, en bestaande rijen blijven werken via product_id.
alter table partner_fotocodes add column if not exists hardware_id uuid;
alter table partner_fotos     add column if not exists hardware_id uuid;
create index if not exists partner_fotos_hardware_id_idx on partner_fotos (hardware_id);
