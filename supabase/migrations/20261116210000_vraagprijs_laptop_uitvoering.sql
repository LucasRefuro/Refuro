-- De vraagprijs van een laptop of desktop onthouden, per uitvoering.
--
-- Waarom: model_vraagprijzen onthield alleen telefoons en tablets (model, opslag, grade). Bij een
-- laptop hangt wat je vraagt af van wat erin zit: een Latitude 3410 met 8 GB vraag je minder voor
-- dan dezelfde met 16 GB. Eerst onthield alleen Online zetten het, per advertentie; de winkelapp,
-- waar de eigenaar nu laptops toevoegt, vulde niets in (november 2026: "vraagprijzen onthouden van
-- de laptops graag").
--
-- uitvoering is dezelfde sleutel als in laptop_nieuwprijzen: processor|geheugen|opslag, zoals
-- nwlSleutel in beide apps hem maakt ("i5 10210u|8GB|256GB"). Leeg bij telefoons en tablets, dus
-- die rijen blijven precies zoals ze waren. opslag staat er bij een laptop ook in (dezelfde als in
-- de sleutel), zodat de bestaande controle op opslag gewoon blijft gelden.
alter table public.model_vraagprijzen add column if not exists uitvoering text not null default '';
alter table public.model_vraagprijzen drop constraint if exists model_vraagprijzen_uitvoering_vorm;
alter table public.model_vraagprijzen add constraint model_vraagprijzen_uitvoering_vorm
  check (uitvoering = '' or uitvoering ~ '^[a-z0-9 ]+\|[0-9.]+(GB|TB)\|[0-9.]+(GB|TB)$');
alter table public.model_vraagprijzen drop constraint if exists model_vraagprijzen_uniek;
alter table public.model_vraagprijzen add constraint model_vraagprijzen_uniek
  unique (team_id, merk, model, opslag, grade, uitvoering);

-- Meteen vullen met wat de winkels al vroegen voor laptops: per model, uitvoering en grade de
-- laatst gebruikte vraagprijs uit hardware. De rekenregel van de sleutel is die van nwlSleutel
-- (merknamen en "core" eruit, alles behalve letters en cijfers wordt een spatie), hier in SQL.
insert into public.model_vraagprijzen (team_id, merk, model, opslag, grade, uitvoering, prijs, bijgewerkt_op)
select distinct on (team_id, lower(merk), lower(model), opslag, staat, uitvoering)
  team_id, merk, model, opslag, staat, uitvoering, verkoop, bijgewerkt_op
from (
  select y.*, case when proc <> '' and geh is not null and opslag is not null
                   then proc || '|' || geh || '|' || opslag end as uitvoering
  from (
    select h.team_id, trim(h.merk) as merk, trim(h.model) as model, h.staat, h.verkoop, h.bijgewerkt_op,
           trim(regexp_replace(regexp_replace(regexp_replace(
             lower(coalesce(nullif(h.specs->>'Processor',''), h.specs->>'Chip', '')),
             '®|™|\((r|tm)\)', ' ', 'g'),
             '\m(intel|amd|apple|qualcomm|core|processor)\M', ' ', 'g'),
             '[^a-z0-9]+', ' ', 'g')) as proc,
           (select replace(m[1], ',', '.') || upper(m[2])
              from regexp_match(coalesce(nullif(h.specs->>'Geheugen',''), h.specs->>'Werkgeheugen', ''),
                                '(\d+(?:[.,]\d+)?)\s*(GB|TB)\M', 'i') as m) as geh,
           (select replace(m[1], ',', '.') || upper(m[2])
              from regexp_match(coalesce(h.specs->>'Opslag',''), '(\d+(?:[.,]\d+)?)\s*(GB|TB)\M', 'i') as m) as opslag
    from public.hardware h
    where h.categorie in ('Laptop','Desktop')
      and h.verkoop > 0 and h.verkoop < 10000
      and h.staat in ('A','B','C')
      and coalesce(trim(h.merk),'') <> '' and coalesce(trim(h.model),'') <> ''
  ) y
) x
where uitvoering is not null
order by team_id, lower(merk), lower(model), opslag, staat, uitvoering, bijgewerkt_op desc
on conflict (team_id, merk, model, opslag, grade, uitvoering) do nothing;
