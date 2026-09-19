-- Partij aanmelden in het klantportaal met modelregels en het slimme bod.
-- De functie klantportaal (actie 'aanmelden') rekent het bod zelf uit en bewaart de
-- regels en de bandbreedte bij de aanvraag. Alleen toevoegingen aan de eigen tabel.
alter table public.klantportaal_opdrachten
  add column if not exists regels jsonb,
  add column if not exists bod_bandbreedte jsonb;
