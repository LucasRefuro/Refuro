-- Elke titel van een toestel wordt de kale modelnaam: "iPhone 11", "Dell Latitude 7420".
--
-- Waarom: de AI schreef de titels, en zo stonden er dingen online als "Apple iPhone 11 -,64GB"
-- en "Apple iPhone XR wit - betrouwbare smartphone voor dagelijks gebruik". De winkelier wil
-- alleen de modelnaam; kleur en opslag zet de webshop als labels direct onder de titel.
--
-- Dezelfde regel als toestelTitel() in de winkelapp, de werkbank en de webshopkoppeling:
-- het merk valt weg als de modelnaam het al zegt (iPhone, iPad, MacBook, Galaxy, Pixel...),
-- en een model dat al met het merk begint krijgt het merk niet dubbel.
--
-- Eenmalig. Nieuwe toestellen krijgen de titel vanzelf uit de apps. Een rij zonder model
-- (een los onderdeel bijvoorbeeld) blijft zoals hij is.
create or replace function pg_temp.toestel_titel(merk text, model text) returns text
language sql immutable as $$
  with x as (
    select regexp_replace(trim(coalesce(merk,'')), '\s+', ' ', 'g') as mk,
           regexp_replace(trim(coalesce(model,'')), '\s+', ' ', 'g') as md0
  ), y as (
    select mk, case when mk <> '' and lower(md0) like lower(mk) || ' %'
                    then trim(substr(md0, length(mk) + 2)) else md0 end as md
    from x
  )
  select case
    when md = '' then null
    when md ~* '^(iphone|ipad|ipod|macbook|imac|mac\s?mini|mac\s?studio|mac\s?pro|apple\s?watch|airpods|galaxy|pixel)\M' then md
    else trim(mk || ' ' || md)
  end
  from y
$$;

update public.hardware h
   set titel = pg_temp.toestel_titel(h.merk, h.model)
 where pg_temp.toestel_titel(h.merk, h.model) is not null
   and h.titel is distinct from pg_temp.toestel_titel(h.merk, h.model);

-- De opgeslagen advertentie per uitvoering: dezelfde titel als het toestel dat erbij hoort.
update public.webshop_grade_prijzen g
   set titel = t.titel
  from (
    select distinct on (team_id, kanalen->'shopify'->>'sleutel')
           team_id, kanalen->'shopify'->>'sleutel' as sleutel, titel
      from public.hardware
     where kanalen->'shopify'->>'sleutel' is not null and titel is not null
     order by team_id, kanalen->'shopify'->>'sleutel', bijgewerkt_op desc
  ) t
 where g.team_id = t.team_id and g.sleutel = t.sleutel
   and g.titel is distinct from t.titel;
