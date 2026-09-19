-- De goedkeur-workflow zat alleen in de client: RLS liet een medewerker zijn eigen rijen
-- (inclusief status/beoordeeld_*) vrij wijzigen, dus hij kon zichzelf goedkeuren via de API.
-- Deze trigger dwingt het server-side af: een niet-beheerder mag alleen concept of ingediend
-- zetten en nooit zelf beoordelaar spelen. Een eigenaar/beheerder mag alles (die keurt goed).
create or replace function public.beschikbaarheid_status_bewaken()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_rol() in ('eigenaar','beheerder') then
    return new;
  end if;
  if new.status is null or new.status not in ('concept','ingediend') then
    new.status := 'ingediend';
  end if;
  new.beoordeeld_door := null;
  new.beoordeeld_op := null;
  new.afwijs_reden := null;
  return new;
end $$;

drop trigger if exists t_beschikbaarheid_status on public.beschikbaarheid;
create trigger t_beschikbaarheid_status
  before insert or update on public.beschikbaarheid
  for each row execute function public.beschikbaarheid_status_bewaken();
