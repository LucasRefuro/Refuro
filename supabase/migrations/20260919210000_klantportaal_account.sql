-- Klantportaal: een eigen account met wachtwoord.
-- Na de uitnodigingslink maakt de klant een account aan (naam + wachtwoord). Daarna
-- logt hij altijd in met e-mail en wachtwoord; de inloglink blijft als reserve.
-- Alleen toevoegingen aan de eigen klantportaal_-tabellen; Storvo verandert niet.

alter table public.klantportaal_gebruikers add column if not exists account_op timestamptz;

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
    'organisatie_id', org.id, 'bedrijf', org.naam, 'naam', gb.naam, 'email', gb.email, 'rol', coalesce(gb.rol, 'winkel'),
    'account_klaar', gb.account_op is not null,
    'huisstijl', jsonb_build_object('merknaam', ins.merknaam, 'logo_url', ins.logo_url, 'kleur', ins.kleur,
                                    'accent', ins.accent, 'inkt', ins.inkt, 'wismethode', ins.wismethode,
                                    'contact_email', ins.contact_email),
    'accountmanager', jsonb_build_object('naam', ins.contact_naam, 'telefoon', ins.contact_telefoon, 'email', ins.contact_email),
    'opdrachten', lijst
  ));
end $$;

revoke all on function public.klantportaal_overzicht(uuid) from public, anon;
grant execute on function public.klantportaal_overzicht(uuid) to authenticated;
