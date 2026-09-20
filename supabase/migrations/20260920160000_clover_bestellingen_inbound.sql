-- Verkopen die op de Clover-terminal gebeuren, landen hier als ruwe bon (idempotent op
-- de Clover-order-id). De winkelapp leest deze tabel bij het laden, matcht de regels op
-- barcode/sku tegen de eigen producten, boekt de verkoop (betaalwijze pin) en verlaagt de
-- voorraad. Bewust een echte tabel en NIET de winkeldata-blob vanuit de edge patchen: de
-- blob is last-write-wins, dus een edge-write zou door de volgende app-save overschreven
-- kunnen worden (valkuil-blob-lost-update). De edge (service_role) schrijft; het team leest.
create table if not exists public.clover_bestellingen (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  clover_order_id text not null,
  bedrag numeric,
  besteld_op timestamptz,
  betaald boolean not null default false,
  regels jsonb not null default '[]'::jsonb,
  aangemaakt_op timestamptz not null default now(),
  unique (team_id, clover_order_id)
);
alter table public.clover_bestellingen enable row level security;
drop policy if exists "team ziet clover bestellingen" on public.clover_bestellingen;
create policy "team ziet clover bestellingen" on public.clover_bestellingen
  for select to public using (team_id = public.my_team_id());
-- Geen insert/update/delete policy: alleen de service_role (de edge-functie) schrijft.
create index if not exists idx_clover_bestellingen_team on public.clover_bestellingen (team_id, aangemaakt_op desc);
