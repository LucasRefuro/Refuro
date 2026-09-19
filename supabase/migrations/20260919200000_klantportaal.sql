-- Klantportaal: organisaties van wie een winkel IT opkoopt volgen hun partij.
--
-- ALLEEN NIEUWE DINGEN. Deze migratie wijzigt geen enkele bestaande tabel, functie of
-- policy van Storvo. Alles staat in eigen tabellen met het voorvoegsel klantportaal_.
-- Een opdracht kan verwijzen naar een bestaande inkoopbatch (refurbish_batches) om de
-- toestellen te tonen; die verwijzing staat in klantportaal_opdrachten, niet op de batch.
-- Wis-status en bestemming per toestel staan in klantportaal_apparaten, niet op het
-- toestel. Weghalen kan dus altijd met alleen drop table klantportaal_* en de functies.
--
-- Beveiliging, waarom het zo zit:
-- 1. Portaalgebruikers krijgen GEEN rij in accounts. my_team_id() leest accounts; een
--    portaalgebruiker met een team_id daar zou via alle bestaande policies de hele
--    winkel kunnen lezen, inclusief inkoopprijzen en marges.
-- 2. Portaalgebruikers krijgen geen policies op tabellen. Ze lezen uitsluitend via de
--    security-definer-functies hieronder, die alleen veilige velden teruggeven (geen
--    inkoop, marge, kosten of notities), net als reparatie-status.

-- ═══ organisaties ═══
create table if not exists public.klantportaal_organisaties (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.klanten(id) on delete cascade,
  naam          text not null,
  kvk           text,
  contact_naam  text,
  contact_email text,
  telefoon      text,
  adres         text,
  aangemaakt_op timestamptz not null default now()
);
create index if not exists klantportaal_organisaties_team on public.klantportaal_organisaties(team_id);
alter table public.klantportaal_organisaties enable row level security;
drop policy if exists klantportaal_organisaties_team on public.klantportaal_organisaties;
create policy klantportaal_organisaties_team on public.klantportaal_organisaties
  for all to authenticated using (team_id = my_team_id()) with check (team_id = my_team_id());

-- ═══ gebruikers van het portaal ═══
create table if not exists public.klantportaal_gebruikers (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  organisatie_id uuid not null references public.klantportaal_organisaties(id) on delete cascade,
  team_id        uuid not null references public.klanten(id) on delete cascade,
  naam           text,
  email          text not null,
  rol            text not null default 'lezer' check (rol in ('beheerder','lezer')),
  actief         boolean not null default true,
  uitgenodigd_op timestamptz not null default now(),
  laatst_gezien  timestamptz,
  inloglink_op   timestamptz          -- tegen het volspammen van iemands mailbox
);
create index if not exists klantportaal_gebruikers_org on public.klantportaal_gebruikers(organisatie_id);
alter table public.klantportaal_gebruikers enable row level security;
drop policy if exists klantportaal_gebruikers_team_lezen on public.klantportaal_gebruikers;
create policy klantportaal_gebruikers_team_lezen on public.klantportaal_gebruikers
  for select to authenticated using (team_id = my_team_id());
drop policy if exists klantportaal_gebruikers_team_wijzigen on public.klantportaal_gebruikers;
create policy klantportaal_gebruikers_team_wijzigen on public.klantportaal_gebruikers
  for update to authenticated using (team_id = my_team_id()) with check (team_id = my_team_id());
drop policy if exists klantportaal_gebruikers_team_verwijderen on public.klantportaal_gebruikers;
create policy klantportaal_gebruikers_team_verwijderen on public.klantportaal_gebruikers
  for delete to authenticated using (team_id = my_team_id());
-- Toevoegen gaat alleen via de Edge Function klantportaal (die maakt ook de login aan).

-- ═══ instellingen en huisstijl per winkel ═══
create table if not exists public.klantportaal_instellingen (
  team_id           uuid primary key references public.klanten(id) on delete cascade,
  actief            boolean not null default true,
  merknaam          text not null,
  logo_url          text,
  kleur             text not null default '#0F6B4B',
  accent            text not null default '#C6F36B',
  inkt              text not null default '#10231B',
  contact_naam      text,
  contact_email     text,
  contact_telefoon  text,
  domein            text unique,          -- bijv. portaal.reloopit.nl
  afzender          text,                 -- bijv. Reloop it <portaal@reloopit.nl>
  wismethode        text not null default 'Blancco, NIST 800-88 Purge',
  -- Vermeden uitstoot en gewicht per categorie bij hergebruik. Indicatief.
  impactfactoren    jsonb not null default '{
    "laptop":{"co2_kg":200,"kg":2.0},
    "desktop":{"co2_kg":300,"kg":7.5},
    "monitor":{"co2_kg":250,"kg":5.0},
    "telefoon":{"co2_kg":60,"kg":0.2},
    "tablet":{"co2_kg":90,"kg":0.5},
    "server":{"co2_kg":900,"kg":20},
    "overig":{"co2_kg":40,"kg":1.0}
  }'::jsonb,
  bijgewerkt_op     timestamptz not null default now()
);
alter table public.klantportaal_instellingen enable row level security;
drop policy if exists klantportaal_instellingen_team on public.klantportaal_instellingen;
create policy klantportaal_instellingen_team on public.klantportaal_instellingen
  for all to authenticated using (team_id = my_team_id()) with check (team_id = my_team_id());

-- ═══ opdrachten ═══
-- Een aanvraag uit het portaal is meteen een opdracht met status 'aanvraag'. De winkel
-- zet hem op 'actief' of 'afgewezen'. Een afgewezen opdracht ziet de klant niet meer.
create table if not exists public.klantportaal_opdrachten (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.klanten(id) on delete cascade,
  organisatie_id  uuid not null references public.klantportaal_organisaties(id) on delete cascade,
  batch_id        uuid unique references public.refurbish_batches(id) on delete set null,
  nummer          text,
  status          text not null default 'actief' check (status in ('aanvraag','actief','afgewezen')),
  titel           text not null,
  locatie         text,
  gepland         text,                 -- "Ophaling 24 september"
  aantal_verwacht integer,
  omschrijving    text,                 -- wat de klant bij de aanvraag opgaf
  ophaaladres     text,
  aangemeld_op    date not null default current_date,
  opgehaald_op    date,
  gewist_op       date,
  getest_op       date,
  afgerond_op     date,
  bod_indicatief  numeric(12,2),
  bod_definitief  numeric(12,2),
  uitbetaald      numeric(12,2),
  aangemaakt_door uuid references auth.users(id) on delete set null,
  aangemaakt_op   timestamptz not null default now(),
  unique (team_id, nummer)
);
create index if not exists klantportaal_opdrachten_org on public.klantportaal_opdrachten(organisatie_id);
create index if not exists klantportaal_opdrachten_team on public.klantportaal_opdrachten(team_id, status);
alter table public.klantportaal_opdrachten enable row level security;
drop policy if exists klantportaal_opdrachten_team on public.klantportaal_opdrachten;
create policy klantportaal_opdrachten_team on public.klantportaal_opdrachten
  for all to authenticated using (team_id = my_team_id()) with check (team_id = my_team_id());

-- Opdrachtnummer P0001, P0002 ... per winkel, als er geen is opgegeven.
create or replace function public.klantportaal_nummer()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.nummer is null or new.nummer = '' then
    perform pg_advisory_xact_lock(hashtext('klantportaal_nummer' || new.team_id::text));
    select coalesce(max(nullif(regexp_replace(nummer, '\D', '', 'g'), '')::int), 0) + 1 into n
      from klantportaal_opdrachten where team_id = new.team_id;
    new.nummer := 'P' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists klantportaal_nummer on public.klantportaal_opdrachten;
create trigger klantportaal_nummer before insert on public.klantportaal_opdrachten
  for each row execute function public.klantportaal_nummer();

-- ═══ wissen en bestemming per toestel ═══
create table if not exists public.klantportaal_apparaten (
  apparaat_id uuid primary key references public.refurbish_apparaten(id) on delete cascade,
  team_id     uuid not null references public.klanten(id) on delete cascade,
  wis_status  text not null default 'open' check (wis_status in ('open','gewist','vernietigd','mislukt','nvt')),
  wis_methode text,
  wis_op      timestamptz,
  bestemming  text check (bestemming is null or bestemming in ('hergebruik','recycling','vernietigd')),
  bijgewerkt_op timestamptz not null default now()
);
alter table public.klantportaal_apparaten enable row level security;
drop policy if exists klantportaal_apparaten_team on public.klantportaal_apparaten;
create policy klantportaal_apparaten_team on public.klantportaal_apparaten
  for all to authenticated using (team_id = my_team_id()) with check (team_id = my_team_id());

-- ═══ hulpjes ═══
create or replace function public.klantportaal_mijn_org()
returns uuid language sql stable security definer set search_path = public as $$
  select organisatie_id from klantportaal_gebruikers where user_id = auth.uid() and actief limit 1;
$$;

-- Welke organisatie mag de beller zien? Een portaalgebruiker zijn eigen; de eigenaar of
-- beheerder van de winkel elke organisatie van zijn team (meekijken). Anders null.
create or replace function public.klantportaal_org_voor_beller(p_organisatie uuid default null)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare o uuid;
begin
  if p_organisatie is not null then
    select id into o from klantportaal_organisaties
     where id = p_organisatie and team_id = my_team_id()
       and my_rol() in ('eigenaar','beheerder');
    if o is not null then return o; end if;
  end if;
  return klantportaal_mijn_org();
end $$;

create or replace function public.klantportaal_cat(c text)
returns text language sql immutable set search_path = public as $$
  select case
    when lower(coalesce(c,'')) ~ 'laptop|notebook|macbook' then 'laptop'
    when lower(coalesce(c,'')) ~ 'desktop|pc|mini|imac' then 'desktop'
    when lower(coalesce(c,'')) ~ 'monitor|scherm|beeld' then 'monitor'
    when lower(coalesce(c,'')) ~ 'telefoon|phone|smartphone' then 'telefoon'
    when lower(coalesce(c,'')) ~ 'tablet|ipad' then 'tablet'
    when lower(coalesce(c,'')) ~ 'server|netwerk|switch' then 'server'
    else 'overig' end;
$$;

-- Bestemming: wat de winkel koos, anders afgeleid zodra de partij getest is.
create or replace function public.klantportaal_bestemming(p_status text, p_wis text, p_gekozen text, p_getest date)
returns text language sql immutable set search_path = public as $$
  select coalesce(p_gekozen,
    case when p_getest is null then null
         when p_status in ('geblokkeerd','repurpose') then 'recycling'
         when p_wis = 'vernietigd' then 'vernietigd'
         else 'hergebruik' end);
$$;

-- De toestellen van een opdracht, met de klantportaal-gegevens erbij.
create or replace function public.klantportaal_toestellen(p_opdracht uuid)
returns table(apparaat_id uuid, sn text, model text, categorie text, grade text,
              wis text, wis_methode text, wis_op timestamptz, bestemming text)
language sql stable security definer set search_path = public as $$
  select a.id, coalesce(a.serienummer, a.code), nullif(trim(concat_ws(' ', a.merk, a.model)), ''),
         a.categorie, a.grade, coalesce(k.wis_status, 'open'), k.wis_methode, k.wis_op,
         klantportaal_bestemming(a.status, k.wis_status, k.bestemming, o.getest_op)
    from klantportaal_opdrachten o
    join refurbish_apparaten a on a.batch_id = o.batch_id and a.team_id = o.team_id
    left join klantportaal_apparaten k on k.apparaat_id = a.id
   where o.id = p_opdracht;
$$;

-- Eén opdracht als json. Met p_apparaten ook de toestellen (alleen veilige velden).
create or replace function public.klantportaal_opdracht_json(p_opdracht uuid, p_apparaten boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  o klantportaal_opdrachten;
  f jsonb;
  tot int; herg int; recy int; vern int; gewist int;
  co2 numeric; kg numeric;
  cats jsonb; devs jsonb; docs jsonb;
begin
  select * into o from klantportaal_opdrachten where id = p_opdracht;
  if o.id is null then return null; end if;
  select coalesce(impactfactoren, '{}'::jsonb) into f from klantportaal_instellingen where team_id = o.team_id;
  f := coalesce(f, '{}'::jsonb);

  select count(*),
         count(*) filter (where t.bestemming = 'hergebruik'),
         count(*) filter (where t.bestemming = 'recycling'),
         count(*) filter (where t.bestemming = 'vernietigd'),
         count(*) filter (where t.wis in ('gewist','vernietigd','nvt')),
         coalesce(sum(case when t.bestemming = 'hergebruik' then coalesce((f -> klantportaal_cat(t.categorie) ->> 'co2_kg')::numeric, 0) end), 0),
         coalesce(sum(case when t.bestemming = 'hergebruik' then coalesce((f -> klantportaal_cat(t.categorie) ->> 'kg')::numeric, 0) end), 0)
    into tot, herg, recy, vern, gewist, co2, kg
    from klantportaal_toestellen(o.id) t;

  select coalesce(jsonb_agg(jsonb_build_object('naam', c, 'aantal', n) order by n desc), '[]'::jsonb) into cats
    from (select coalesce(nullif(t.categorie,''),'Overig') c, count(*) n from klantportaal_toestellen(o.id) t group by 1) x;

  docs := jsonb_build_array(
    jsonb_build_object('type','ophaalbon','naam','Ophaalbon','formaat','PDF','datum',o.opgehaald_op,'beschikbaar',o.opgehaald_op is not null,'verwacht','na ophaling'),
    jsonb_build_object('type','wiscertificaat','naam','Wiscertificaten, '||gewist||' apparaten','formaat','PDF','datum',o.gewist_op,'beschikbaar',o.gewist_op is not null and gewist > 0,'verwacht','na het wissen'),
    jsonb_build_object('type','verwerkingsrapport','naam','Verwerkingsrapport','formaat','PDF','datum',o.getest_op,'beschikbaar',o.getest_op is not null,'verwacht','na het testen'),
    jsonb_build_object('type','apparatenlijst','naam','Apparatenlijst','formaat','CSV','beschikbaar',tot > 0,'verwacht','na ophaling'),
    jsonb_build_object('type','impactrapport','naam','Impactrapport','formaat','PDF','datum',o.afgerond_op,'beschikbaar',o.afgerond_op is not null,'verwacht','na afronding')
  );

  if p_apparaten then
    select coalesce(jsonb_agg(jsonb_build_object(
             'sn', t.sn, 'model', t.model, 'categorie', t.categorie, 'wis', t.wis,
             'wis_methode', t.wis_methode, 'wis_op', t.wis_op,
             'grade', case when o.getest_op is not null then t.grade end,
             'bestemming', t.bestemming) order by t.model, t.sn), '[]'::jsonb) into devs
      from klantportaal_toestellen(o.id) t;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'id', o.id, 'nummer', o.nummer, 'titel', o.titel, 'locatie', o.locatie,
    'gepland', coalesce(o.gepland, case when o.status = 'aanvraag' then 'Wij nemen contact met je op' end),
    'tijdlijn', jsonb_build_object('aangemeld', o.aangemeld_op, 'opgehaald', o.opgehaald_op,
      'gewist', o.gewist_op, 'getest', o.getest_op, 'afgerond', o.afgerond_op),
    'aantallen', jsonb_build_object('totaal', case when tot > 0 then tot else coalesce(o.aantal_verwacht, 0) end, 'gewist', gewist,
      'hergebruik', case when o.getest_op is not null then herg end,
      'recycling',  case when o.getest_op is not null then recy end,
      'vernietigd', case when o.getest_op is not null then vern end),
    'categorieen', cats,
    'bod', jsonb_build_object('indicatief', o.bod_indicatief, 'definitief', o.bod_definitief, 'uitbetaald', o.uitbetaald),
    'impact', case when o.getest_op is not null then jsonb_build_object('co2_kg', round(co2), 'ewaste_kg', round(kg)) end,
    'documenten', docs,
    'apparaten', devs
  ));
end $$;

-- Het hele portaal van de beller in één keer.
create or replace function public.klantportaal_overzicht(p_organisatie uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  org_id uuid := klantportaal_org_voor_beller(p_organisatie);
  org klantportaal_organisaties;
  ins klantportaal_instellingen;
  gb klantportaal_gebruikers;
  lijst jsonb;
begin
  if org_id is null then return null; end if;
  select * into org from klantportaal_organisaties where id = org_id;
  select * into ins from klantportaal_instellingen where team_id = org.team_id;
  if ins.team_id is null or not ins.actief then return null; end if;
  select * into gb from klantportaal_gebruikers where user_id = auth.uid();

  select coalesce(jsonb_agg(klantportaal_opdracht_json(o.id, false) order by o.aangemeld_op desc, o.aangemaakt_op desc), '[]'::jsonb)
    into lijst from klantportaal_opdrachten o where o.organisatie_id = org_id and o.status <> 'afgewezen';

  return jsonb_strip_nulls(jsonb_build_object(
    'organisatie_id', org.id, 'bedrijf', org.naam, 'naam', gb.naam, 'rol', coalesce(gb.rol, 'winkel'),
    'huisstijl', jsonb_build_object('merknaam', ins.merknaam, 'logo_url', ins.logo_url, 'kleur', ins.kleur,
                                    'accent', ins.accent, 'inkt', ins.inkt, 'wismethode', ins.wismethode,
                                    'contact_email', ins.contact_email),
    'accountmanager', jsonb_build_object('naam', ins.contact_naam, 'telefoon', ins.contact_telefoon, 'email', ins.contact_email),
    'opdrachten', lijst
  ));
end $$;

-- Eén opdracht met alle toestellen, alleen als hij bij de beller hoort.
create or replace function public.klantportaal_opdracht(p_id uuid, p_organisatie uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare org_id uuid := klantportaal_org_voor_beller(p_organisatie);
begin
  if org_id is null then return null; end if;
  if not exists (select 1 from klantportaal_opdrachten where id = p_id and organisatie_id = org_id and status <> 'afgewezen') then
    return null;
  end if;
  return klantportaal_opdracht_json(p_id, true);
end $$;

-- Een nieuwe partij aanmelden vanuit het portaal: wordt een opdracht met status aanvraag.
create or replace function public.klantportaal_aanmelden(p_omschrijving text, p_aantal integer default null,
  p_ophaaladres text default null, p_periode text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  gb klantportaal_gebruikers;
  nieuw uuid;
begin
  select * into gb from klantportaal_gebruikers where user_id = auth.uid() and actief;
  if gb.user_id is null then raise exception 'geen toegang'; end if;
  if coalesce(trim(p_omschrijving), '') = '' then raise exception 'omschrijving ontbreekt'; end if;
  insert into klantportaal_opdrachten(team_id, organisatie_id, status, titel, omschrijving, aantal_verwacht,
                                      ophaaladres, locatie, gepland, aangemaakt_door)
  values (gb.team_id, gb.organisatie_id, 'aanvraag', left(trim(p_omschrijving), 80), left(p_omschrijving, 4000),
          case when p_aantal between 0 and 100000 then p_aantal end, left(p_ophaaladres, 500), left(p_ophaaladres, 120),
          case when coalesce(trim(p_periode),'') <> '' then 'Gewenst: ' || left(p_periode, 120) end, gb.user_id)
  returning id into nieuw;
  return nieuw;
end $$;

create or replace function public.klantportaal_collegas()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', g.user_id, 'naam', g.naam, 'email', g.email,
           'rol', g.rol, 'ik', g.user_id = auth.uid()) order by g.naam), '[]'::jsonb)
    from klantportaal_gebruikers g
   where g.actief and g.organisatie_id = klantportaal_mijn_org();
$$;

create or replace function public.klantportaal_collega_uit(p_user uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare ik klantportaal_gebruikers;
begin
  select * into ik from klantportaal_gebruikers where user_id = auth.uid() and actief;
  if ik.user_id is null or ik.rol <> 'beheerder' or p_user = ik.user_id then return false; end if;
  update klantportaal_gebruikers set actief = false
   where user_id = p_user and organisatie_id = ik.organisatie_id;
  return found;
end $$;

create or replace function public.klantportaal_gezien()
returns void language sql volatile security definer set search_path = public as $$
  update klantportaal_gebruikers set laatst_gezien = now() where user_id = auth.uid();
$$;

-- Huisstijl voor het inlogscherm: openbaar, alleen de merkvelden.
create or replace function public.klantportaal_huisstijl(p_domein text default null, p_slug text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object('merknaam', i.merknaam, 'logo_url', i.logo_url, 'kleur', i.kleur,
           'accent', i.accent, 'inkt', i.inkt, 'contact_email', i.contact_email, 'contact_telefoon', i.contact_telefoon,
           'slug', k.slug))
    from klantportaal_instellingen i join klanten k on k.id = i.team_id
   where i.actief and ((p_domein is not null and lower(i.domein) = lower(p_domein))
                    or (p_slug is not null and k.slug = p_slug))
   limit 1;
$$;

-- Rechten: alles dicht, dan precies openzetten wat nodig is.
revoke all on function public.klantportaal_nummer() from public, anon, authenticated;
revoke all on function public.klantportaal_mijn_org() from public, anon;
revoke all on function public.klantportaal_org_voor_beller(uuid) from public, anon;
revoke all on function public.klantportaal_toestellen(uuid) from public, anon, authenticated;
revoke all on function public.klantportaal_opdracht_json(uuid, boolean) from public, anon, authenticated;
revoke all on function public.klantportaal_overzicht(uuid) from public, anon;
revoke all on function public.klantportaal_opdracht(uuid, uuid) from public, anon;
revoke all on function public.klantportaal_aanmelden(text, integer, text, text) from public, anon;
revoke all on function public.klantportaal_collegas() from public, anon;
revoke all on function public.klantportaal_collega_uit(uuid) from public, anon;
revoke all on function public.klantportaal_gezien() from public, anon;
grant execute on function public.klantportaal_overzicht(uuid) to authenticated;
grant execute on function public.klantportaal_opdracht(uuid, uuid) to authenticated;
grant execute on function public.klantportaal_aanmelden(text, integer, text, text) to authenticated;
grant execute on function public.klantportaal_collegas() to authenticated;
grant execute on function public.klantportaal_collega_uit(uuid) to authenticated;
grant execute on function public.klantportaal_gezien() to authenticated;
grant execute on function public.klantportaal_huisstijl(text, text) to anon, authenticated;

-- Interne hulpjes: niet direct aanroepbaar door ingelogde gebruikers.
revoke all on function public.klantportaal_mijn_org() from authenticated;
revoke all on function public.klantportaal_org_voor_beller(uuid) from authenticated;
