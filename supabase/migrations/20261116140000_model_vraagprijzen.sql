-- De vraagprijs per model, opslag en grade, per winkel.
--
-- Waarom: de winkelier typte bij elke telefoon opnieuw wat hij ervoor vraagt, terwijl een iPhone
-- 12 mini met 128 GB in grade A elke keer hetzelfde kost. De kleur telt niet mee, net als bij de
-- nieuwprijs (model_nieuwprijzen): een witte en een zwarte kosten hetzelfde.
--
-- Online zetten onthield al prijzen per advertentie (webshop_grade_prijzen), maar daar zit de
-- kleur in de sleutel, want een advertentie is per kleur. Daardoor kreeg een witte iPhone niet
-- de prijs van de zwarte. En de winkelapp vulde de vraagprijs helemaal niet in. Daarom een eigen
-- tabel zonder kleur, die beide apps lezen en schrijven.
--
-- Alleen telefoons en tablets: bij een laptop hangt de prijs van processor, geheugen en opslag
-- af, en dat onthoudt Online zetten al per advertentie (bij laptops speelt kleur geen rol).
--
-- opslag staat genormaliseerd: "128GB", "1TB". prijs in euro inclusief btw.
create table if not exists public.model_vraagprijzen (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.klanten(id) on delete cascade,
  merk text not null,
  model text not null,
  opslag text not null check (opslag ~ '^[0-9.]+(GB|TB)$'),
  grade text not null check (grade in ('A','B','C')),
  prijs numeric(10,2) not null check (prijs > 0 and prijs < 10000),
  bijgewerkt_op timestamptz not null default now(),
  constraint model_vraagprijzen_uniek unique (team_id, merk, model, opslag, grade)
);
create index if not exists model_vraagprijzen_zoek on public.model_vraagprijzen (team_id, lower(merk), lower(model));

-- Alleen de eigen winkel: wat een ander vraagt, gaat niemand iets aan.
alter table public.model_vraagprijzen enable row level security;
drop policy if exists model_vraagprijzen_lezen on public.model_vraagprijzen;
create policy model_vraagprijzen_lezen on public.model_vraagprijzen for select to authenticated
  using (team_id = public.my_team_id());
drop policy if exists model_vraagprijzen_toevoegen on public.model_vraagprijzen;
create policy model_vraagprijzen_toevoegen on public.model_vraagprijzen for insert to authenticated
  with check (team_id = public.my_team_id());
drop policy if exists model_vraagprijzen_wijzigen on public.model_vraagprijzen;
create policy model_vraagprijzen_wijzigen on public.model_vraagprijzen for update to authenticated
  using (team_id = public.my_team_id()) with check (team_id = public.my_team_id());
drop policy if exists model_vraagprijzen_weg on public.model_vraagprijzen;
create policy model_vraagprijzen_weg on public.model_vraagprijzen for delete to authenticated
  using (team_id = public.my_team_id());

-- Meteen vullen met wat de winkels al vroegen: per model, opslag en grade de laatst gebruikte
-- vraagprijs uit hardware. Zo werkt het direct voor modellen die al in de voorraad staan.
insert into public.model_vraagprijzen (team_id, merk, model, opslag, grade, prijs, bijgewerkt_op)
select distinct on (team_id, lower(merk), lower(model), opslag, staat)
  team_id, merk, model, opslag, staat, verkoop, bijgewerkt_op
from (
  select h.team_id, trim(h.merk) as merk, trim(h.model) as model, h.staat, h.verkoop, h.bijgewerkt_op,
         (select replace(m[1], ',', '.') || upper(m[2])
            from regexp_match(coalesce(h.specs->>'Opslag',''), '(\d+(?:[.,]\d+)?)\s*(GB|TB)', 'i') as m) as opslag
  from public.hardware h
  where h.categorie in ('Telefoon','Tablet')
    and h.verkoop > 0 and h.verkoop < 10000
    and h.staat in ('A','B','C')
    and coalesce(trim(h.merk),'') <> '' and coalesce(trim(h.model),'') <> ''
) x
where opslag is not null
order by team_id, lower(merk), lower(model), opslag, staat, bijgewerkt_op desc
on conflict (team_id, merk, model, opslag, grade) do nothing;
