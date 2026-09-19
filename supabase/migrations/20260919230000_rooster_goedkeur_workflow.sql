-- Goedkeur-workflow op beschikbaarheid: concept -> ingediend -> goedgekeurd/afgekeurd.
alter table public.beschikbaarheid
  add column if not exists status text not null default 'concept',
  add column if not exists beoordeeld_op timestamptz,
  add column if not exists beoordeeld_door uuid,
  add column if not exists afwijs_reden text;

-- Bestaande beschikbaarheid was al doorgegeven en gebruikt voor de planning; behandel
-- die als goedgekeurd zodat ze niet ineens als 'wacht op goedkeuring' verschijnen.
update public.beschikbaarheid set status='goedgekeurd' where status='concept';

-- Een beheerder/eigenaar mag de beschikbaarheid van teamleden beoordelen (status zetten).
-- Naast de bestaande 'eigen beschikbaarheid wijzigen'-policy; RLS combineert met OR.
create policy "beheer keurt beschikbaarheid goed" on public.beschikbaarheid
  for update to public
  using (team_id = public.my_team_id() and public.my_rol() in ('eigenaar','beheerder'))
  with check (team_id = public.my_team_id() and public.my_rol() in ('eigenaar','beheerder'));

-- Escalatie-cadans van de herinneringen: onthoud de laatste herinnerdag.
alter table public.rooster_instelling
  add column if not exists laatst_herinnerd_op date;
