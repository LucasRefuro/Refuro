-- Het inkoopregister (opkopersregister). Wie gebruikte goederen inkoopt moet per inkoop
-- vastleggen van wie, wat en voor hoeveel (art. 437 Sr, Uitvoeringsbesluit art. 437,
-- APV Gilze en Rijen art. 2:66 tot 2:68). Het Digitaal Opkopers Register (DOR) van de
-- politie vraagt dezelfde gegevens plus geboortedatum en legitimatie. Zie
-- INKOOP-DOR-STAPPENPLAN.md.
--
-- Eén rij per inkoop bij één verkoper. De goederen staan erin als momentopname (merk,
-- type, kleur, serienummer of IMEI, prijs), zodat het register blijft kloppen als een
-- toestel later een andere naam krijgt, wordt gesloopt of verkocht. Een register pas je
-- niet achteraf aan: er is daarom geen verwijder-policy.
--
-- Bewust NIET opgeslagen: een kopie van het legitimatiebewijs en het BSN. Een opkoper
-- mag geen kopie maken (alleen soort en nummer opschrijven), en het BSN mag alleen als
-- een wet dat voorschrijft (art. 46 UAVG).
create table if not exists public.inkoop_registraties (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default my_team_id(),
  volgnummer integer not null,
  datum timestamptz not null default now(),
  inkoper text,                              -- naam van de medewerker die inkocht
  inkoper_id uuid,
  verkoper_soort text not null default 'particulier',   -- particulier | bedrijf
  voornamen text,
  voorvoegsel text,
  achternaam text,
  bedrijfsnaam text,
  geboortedatum date,
  straat text,
  huisnummer text,
  postcode text,
  woonplaats text,
  land text default 'Nederland',
  id_soort text,                             -- paspoort | id-kaart | rijbewijs | verblijfsdocument
  id_nationaliteit text,
  id_nummer text,
  goederen jsonb not null default '[]'::jsonb,  -- [{apparaat_id, code, soort, merk, type, kleur, nummer, prijs}]
  bedrag numeric,
  betaalwijze text,                          -- contant | pin | bank
  verklaring_url text,                       -- de ondertekende inkoopverklaring in bucket inkoopfacturen
  bewaar_tot date,                           -- APV 2:68: vijf werkdagen onveranderd bewaren
  dor_ingevoerd_op timestamptz,              -- zolang er geen DOR-koppeling is: met de hand aangevinkt
  dor_door text,
  aangemaakt_op timestamptz not null default now(),
  unique (team_id, volgnummer)
);

create index if not exists inkoop_registraties_team_datum_idx
  on public.inkoop_registraties (team_id, datum desc);

-- Het volgnummer loopt per winkel door en wordt door de database uitgedeeld. Het slot per
-- team voorkomt dat twee inkopen tegelijk hetzelfde nummer krijgen.
create or replace function public.inkoop_volgnummer() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.volgnummer is null then
    perform pg_advisory_xact_lock(hashtext('inkoop_volgnummer:' || new.team_id::text));
    select coalesce(max(volgnummer), 0) + 1 into new.volgnummer
      from public.inkoop_registraties where team_id = new.team_id;
  end if;
  return new;
end $$;

drop trigger if exists inkoop_volgnummer on public.inkoop_registraties;
create trigger inkoop_volgnummer before insert on public.inkoop_registraties
  for each row execute function public.inkoop_volgnummer();

alter table public.inkoop_registraties enable row level security;

drop policy if exists inkoop_registraties_lezen on public.inkoop_registraties;
create policy inkoop_registraties_lezen on public.inkoop_registraties
  for select using (team_id = my_team_id());
drop policy if exists inkoop_registraties_toevoegen on public.inkoop_registraties;
create policy inkoop_registraties_toevoegen on public.inkoop_registraties
  for insert with check (team_id = my_team_id());
drop policy if exists inkoop_registraties_bijwerken on public.inkoop_registraties;
create policy inkoop_registraties_bijwerken on public.inkoop_registraties
  for update using (team_id = my_team_id()) with check (team_id = my_team_id());

-- Het toestel weet bij welke inkoop het hoort en tot wanneer het in bewaring is, zodat de
-- werkbank kan waarschuwen zonder het register erbij te halen.
alter table public.refurbish_apparaten
  add column if not exists inkoop_registratie_id uuid references public.inkoop_registraties(id) on delete set null,
  add column if not exists bewaar_tot date;
