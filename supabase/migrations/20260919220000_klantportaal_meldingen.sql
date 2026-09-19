-- Klantportaal: e-mailmeldingen.
-- De functie klantportaal (actie 'melding') stuurt een mail bij een nieuwe aanmelding
-- (naar de winkel) en bij elke stap (naar de beheerders van de organisatie). Hier
-- houden we bij wat al verstuurd is, zodat Terugzetten en opnieuw Vandaag niet
-- twee keer mailt. Alleen de service-rol schrijft; de winkel mag meelezen.
create table if not exists public.klantportaal_meldingen (
  opdracht_id uuid not null references public.klantportaal_opdrachten(id) on delete cascade,
  soort text not null check (soort in ('aanvraag','aangenomen','opgehaald','gewist','getest','afgerond')),
  team_id uuid not null,
  verstuurd_op timestamptz not null default now(),
  aantal integer not null default 0,
  primary key (opdracht_id, soort)
);
alter table public.klantportaal_meldingen enable row level security;
drop policy if exists klantportaal_meldingen_team on public.klantportaal_meldingen;
create policy klantportaal_meldingen_team on public.klantportaal_meldingen
  for select to authenticated using (team_id = public.my_team_id());
