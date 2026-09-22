-- Meldingen aan een partner (bijv. "je laptop is teruggetrokken"). Bewust een ECHTE
-- tabel en niet in partners.data: die JSON wordt door meerdere kanten geschreven
-- (winkel-edge, partner-app), allemaal met "data:{products,settings}", dus een melding
-- die alleen in de blob zou leven, zou door de eerstvolgende write worden overschreven
-- (zie de blob-lost-update-valkuil). De partner leest en markeert ze in deze tabel.

create table if not exists partner_meldingen (
  id uuid primary key default gen_random_uuid(),
  team_id uuid,                                  -- de winkel die de melding stuurde
  partner_id uuid not null,                      -- het partner-account (accounts.id = auth.uid)
  hardware_id uuid,
  toestel text,
  soort text not null default 'teruggetrokken',
  tekst text,
  gelezen boolean not null default false,
  aangemaakt_op timestamptz not null default now()
);

alter table partner_meldingen enable row level security;

-- De partner ziet zijn eigen meldingen en mag ze op "gelezen" zetten. Insert doet de
-- winkel-edge met de service_role (die de RLS omzeilt), dus daar is geen policy voor nodig.
drop policy if exists partner_meldingen_select on partner_meldingen;
create policy partner_meldingen_select on partner_meldingen
  for select using (partner_id = auth.uid());

drop policy if exists partner_meldingen_update on partner_meldingen;
create policy partner_meldingen_update on partner_meldingen
  for update using (partner_id = auth.uid()) with check (partner_id = auth.uid());

create index if not exists idx_partner_meldingen_open
  on partner_meldingen (partner_id) where not gelezen;
