-- Reserveren, betaal in de winkel: een klant zet online een toestel vast zonder te
-- betalen. Het toestel gaat op hardware.status='gereserveerd' (valt daardoor uit de
-- grade-telling van de webshop-sync), en de klant betaalt later aan de kassa.
create table if not exists public.webshop_reserveringen (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  hardware_id uuid,                       -- het vastgezette exemplaar (kan null worden na opruimen)
  sleutel text,                           -- webshop-sleutel (uitvoering)
  grade text,                             -- A / B / C
  variant_id text,                        -- Shopify grade-variant gid
  product_id text,                        -- Shopify product gid
  toestel text,                           -- leesbare naam voor in de lijst en de mail
  prijs numeric,                          -- vraagprijs van deze grade bij reserveren
  naam text not null,
  email text not null,
  telefoon text,
  status text not null default 'open',    -- open | afgerekend | geannuleerd | vervallen
  vervalt_op timestamptz,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now(),
  afgehandeld_op timestamptz,
  ruwe_json jsonb
);

create index if not exists webshop_reserveringen_team_status_idx
  on public.webshop_reserveringen (team_id, status);
create index if not exists webshop_reserveringen_hardware_idx
  on public.webshop_reserveringen (hardware_id);
create index if not exists webshop_reserveringen_vervalt_idx
  on public.webshop_reserveringen (vervalt_op) where status = 'open';

-- RLS zoals de rest: teamleden mogen hun eigen reserveringen zien. Schrijven gebeurt
-- uitsluitend door de reservering-edge (service_role, omzeilt RLS), zodat de voorraad-
-- en Shopify-logica altijd via de server loopt.
alter table public.webshop_reserveringen enable row level security;

drop policy if exists webshop_reserveringen_lezen on public.webshop_reserveringen;
create policy webshop_reserveringen_lezen on public.webshop_reserveringen
  for select using (team_id = my_team_id());
