-- Inloggegevens voor leveranciers (Foneday, Mobileparts).
--
-- Die stonden leesbaar in de winkeldata-blob (state.leveranciers), en gingen via de
-- sync mee naar de cloud. Iedereen in het team kon ze daar uitlezen, en elke back-up
-- of databasedump had ze in platte tekst. Nu bewaart de edge-functie 'leveranciers'
-- het wachtwoord versleuteld (AES-GCM met KOPPELING_SLEUTEL), net als de webshoptokens.
--
-- Waarom een eigen tabel en niet winkel_koppelingen: die tabel is gevormd naar een
-- webshop (webhook_pad, domein en token_versleuteld zijn verplicht) en de webshop-
-- functies lezen hem per team. Een rij voor een leverancier ertussen is vragen om een
-- functie die per ongeluk de verkeerde rij pakt.
create table if not exists public.leverancier_inloggegevens (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.klanten(id) on delete cascade,
  leverancier text not null check (leverancier ~ '^[a-z0-9_-]{2,40}$'),
  gebruiker text,                         -- het e-mailadres; geen geheim, de app toont het
  wachtwoord_versleuteld text,            -- iv + versleuteld, base64. Nooit terug naar de browser
  bijgewerkt_door uuid,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now(),
  unique (team_id, leverancier)
);

-- Bewust GEEN policies, zelfde regime als winkel_koppelingen: zonder policy komt geen
-- ingelogde gebruiker erbij, ook niet als er ergens per ongeluk een select op wordt
-- losgelaten. Alleen de service_role (de edge-functie) slaat RLS over. De revoke is
-- een tweede slot op dezelfde deur.
alter table public.leverancier_inloggegevens enable row level security;
revoke all on public.leverancier_inloggegevens from anon, authenticated;

-- De blob mag nooit meer een leverancierswachtwoord bewaren. De nieuwe winkelapp
-- stuurt het niet meer mee, maar een tabblad dat nog met de oude code openstaat doet
-- dat wel, tot het herladen wordt. Deze trigger haalt de sleutel er bij elke opslag
-- af, langs welke weg die ook binnenkomt (de RPC winkeldata_opslaan of een losse
-- update). De versie blijft gelijk, dus de botsingscontrole van de sync merkt niets.
create or replace function public.winkeldata_zonder_leveranciers()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.data ? 'leveranciers' then
    new.data := new.data - 'leveranciers';
  end if;
  return new;
end;
$$;

drop trigger if exists winkeldata_zonder_leveranciers on public.winkeldata;
create trigger winkeldata_zonder_leveranciers
  before insert or update of data on public.winkeldata
  for each row execute function public.winkeldata_zonder_leveranciers();

-- Wat er nu al in de blob staat er één keer uit halen. Op het moment van schrijven
-- stond er niets (gecontroleerd), maar de migratie moet ook kloppen op een database
-- waar dat wel zo is. Het overzetten naar de nieuwe tabel doet de winkelapp zelf,
-- want alleen de edge-functie kan versleutelen.
update public.winkeldata set data = data - 'leveranciers' where data ? 'leveranciers';
