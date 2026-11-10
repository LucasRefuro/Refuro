-- koppel_losse_hardware neemt nu ook de kleur mee (uit hardware.specs.Kleur). De
-- fabrieksfoto's van een telefoon zoek je op kleur; zonder kleur zei Online zetten
-- "vul eerst de kleur in" terwijl je die in de winkelapp al had ingevuld.
create or replace function public.koppel_losse_hardware()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  t uuid := my_team_id();
  nr int;
  h record;
  c text;
  n int := 0;
begin
  if t is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('koppel_losse_hardware:' || t::text));

  select coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int), 0) into nr
    from refurbish_apparaten where team_id = t and code ~ '\d';

  for h in
    select * from hardware x
     where x.team_id = t and x.status <> 'verkocht'
       and not exists (select 1 from refurbish_apparaten a where a.hardware_id = x.id)
     order by x.aangemaakt_op
  loop
    if coalesce(h.code, '') <> '' then
      c := h.code;
    else
      nr := nr + 1;
      c := 'A' || lpad(nr::text, 4, '0');
      update hardware set code = c where id = h.id;
    end if;
    insert into refurbish_apparaten (
      team_id, merk, model, categorie, serienummer, specs, inkoop, status, stap, grade,
      hardware_id, code, accu, nieuwe_accu, doos, locatie_id, plek, marge, nieuwprijs,
      notitie, aangemaakt_op, aangemaakt_door, kleur)
    values (
      t, h.merk, coalesce(nullif(h.model, ''), 'Onbekend'), coalesce(h.categorie, 'Laptop'),
      h.serienummer, coalesce(h.specs, '{}'::jsonb), coalesce(h.inkoop, 0), 'klaar', 'los', h.staat,
      h.id, c, h.accu, coalesce(h.nieuwe_accu, false), coalesce(h.doos, false), h.locatie_id,
      h.plek, h.marge, h.nieuwprijs, 'Los toegevoegd in de winkel', h.aangemaakt_op, h.aangemaakt_door,
      nullif(trim(h.specs->>'Kleur'), ''));
    n := n + 1;
  end loop;
  return n;
end
$$;

grant execute on function public.koppel_losse_hardware() to authenticated;
