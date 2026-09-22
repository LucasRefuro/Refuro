-- Foto's met de telefoon aanleveren voor een product in het partner-dashboard, zonder
-- dat er op die telefoon iemand hoeft in te loggen. De partner maakt op de pc een code
-- (30 min geldig, in een QR), de telefoon opent die link en stuurt de foto's met de code.
-- Zelfde idee als de refurbish-foto-companion, maar voor partner-producten.

-- De koppelcode: welke partner + welk product hoort erbij, en tot wanneer hij geldig is.
create table if not exists partner_fotocodes (
  code text primary key,
  partner_id uuid not null,
  product_id text not null,
  vervalt timestamptz not null,
  aangemaakt_op timestamptz not null default now()
);
alter table partner_fotocodes enable row level security;
-- De partner maakt en leest zijn eigen codes; de companion-edge valideert met service_role.
drop policy if exists partner_fotocodes_eigen on partner_fotocodes;
create policy partner_fotocodes_eigen on partner_fotocodes
  for all using (partner_id = auth.uid()) with check (partner_id = auth.uid());

-- De aangeleverde foto's (URL in de gedeelde foto-opslag). De companion-edge schrijft
-- hierin met service_role; de partner leest ze om ze in zijn advertentie te zetten.
create table if not exists partner_fotos (
  id uuid primary key default gen_random_uuid(),
  code text,
  partner_id uuid not null,
  product_id text not null,
  url text not null,
  aangemaakt_op timestamptz not null default now()
);
alter table partner_fotos enable row level security;
drop policy if exists partner_fotos_select on partner_fotos;
create policy partner_fotos_select on partner_fotos
  for select using (partner_id = auth.uid());
drop policy if exists partner_fotos_del on partner_fotos;
create policy partner_fotos_del on partner_fotos
  for delete using (partner_id = auth.uid());
create index if not exists idx_partner_fotos_product on partner_fotos (partner_id, product_id);
