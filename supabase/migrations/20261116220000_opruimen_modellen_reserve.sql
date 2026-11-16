-- Opruimen (16 november 2026, op verzoek van de eigenaar: "ruim lekker alles op").
--
-- 1. De reservetabellen van 15 november naar een eigen schema archief. Niet weggegooid: het zijn de
--    enige kopieën van de 74 laptops die toen uit Storvo gingen. In archief staan ze niet meer tussen
--    de echte tabellen en kan de app er niet bij (het schema hangt niet aan de API). Weggooien kan
--    later met drop table archief.<naam>.
--
-- 2. De modellenlijst (hardware_modellen) rechtgezet. Tikfouten van vroeger ("Palvilion",
--    "idealpad") samengevoegd met de juiste naam, merknamen met de goede hoofdletters (EliteBook,
--    ProBook, ThinkPad, IdeaPad), telefoons met "iPhone" als merk en de kleur in de modelnaam
--    ("12 - Blauw") naar Apple iPhone 12, en rommel weg ("[Geen sticker met naam]", "xxxxxx",
--    "test", "yoga"). Samenvoegen houdt van de juiste rij alles wat er stond en vult alleen aan;
--    de tellers tellen op. Een kleur hoort niet bij een model, dus die gaat uit de specs.
--
-- 3. Toestellen op voorraad met zo'n fout in de naam: die stond zo op de webshop ("HP Palvilion").
--    Hoofdletters veranderen de webshopsleutel niet (die is in kleine letters). Palvilion wel: daar
--    gaan de sleutel in hardware, webshop_producten en webshop_grade_prijzen mee, zodat de
--    advertentie hetzelfde product houdt (de link krijgt een doorverwijzing bij de volgende sync).

-- 1. archief
create schema if not exists archief;
revoke all on schema archief from anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['reserve_laptops_20261115_apparaten','reserve_laptops_20261115_verplaatsingen',
                           'reserve_laptops_20261115_webshop','reserve_omschrijving_20261115','reserve_testbundel_20261115'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I set schema archief', t);
    end if;
  end loop;
end $$;

-- 2. modellenlijst
create or replace function pg_temp.model_samen(m_van text, mo_van text, m_naar text, mo_naar text) returns void
language plpgsql as $$
declare v public.hardware_modellen%rowtype; n public.hardware_modellen%rowtype;
begin
  select * into v from public.hardware_modellen where lower(merk) = lower(m_van) and lower(model) = lower(mo_van);
  if not found then return; end if;
  select * into n from public.hardware_modellen
   where lower(merk) = lower(m_naar) and lower(model) = lower(mo_naar) and id <> v.id;
  if found then
    update public.hardware_modellen set
      specs = (coalesce(v.specs, '{}'::jsonb) - 'Kleur') || coalesce(n.specs, '{}'::jsonb),
      opties = case when n.opties is null or n.opties = '{}'::jsonb then v.opties else n.opties end,
      varianten = coalesce(n.varianten, v.varianten),
      icecat_code = coalesce(n.icecat_code, v.icecat_code),
      keer_gebruikt = coalesce(n.keer_gebruikt, 0) + coalesce(v.keer_gebruikt, 0),
      merk = m_naar, model = mo_naar, bijgewerkt_op = now()
    where id = n.id;
    delete from public.hardware_modellen where id = v.id;
  else
    update public.hardware_modellen set merk = m_naar, model = mo_naar,
      specs = coalesce(specs, '{}'::jsonb) - 'Kleur', bijgewerkt_op = now()
    where id = v.id;
  end if;
end $$;

select pg_temp.model_samen(a, b, c, d) from (values
  ('HP','Palvilion 15-cs0975nd','HP','Pavilion 15-cs0975nd'),
  ('HP','Palvilion 15-cs0852nd','HP','Pavilion 15-cs0852nd'),
  ('HP','Palvilion Power 15-cb001nd','HP','Pavilion Power 15-cb001nd'),
  ('HP','Palvilion x360 convertible','HP','Pavilion x360 convertible'),
  ('hp','elitebook 850 g8','HP','EliteBook 850 G8'),
  ('HP','elitebook 840 g8','HP','EliteBook 840 G8'),
  ('HP','Elitebook 830 G8','HP','EliteBook 830 G8'),
  ('HP','Elitebook 840 G4','HP','EliteBook 840 G4'),
  ('HP','Elitebook 850 G6','HP','EliteBook 850 G6'),
  ('HP','Probook 650 G3','HP','ProBook 650 G3'),
  ('HP','ZBook 15 G6 Mobile','HP','ZBook 15 G6'),
  ('Lenovo','ideal 520-15IKB','Lenovo','IdeaPad 520-15IKB'),
  ('Lenovo','ideapad 520-15IKB','Lenovo','IdeaPad 520-15IKB'),
  ('Lenovo','idealpad 330-15IK8','Lenovo','IdeaPad 330-15IKB'),
  ('Lenovo','idealpad 330-15IKB','Lenovo','IdeaPad 330-15IKB'),
  ('Lenovo','ideapad 330-15IKB','Lenovo','IdeaPad 330-15IKB'),
  ('Lenovo','ideapad S145-15IWL','Lenovo','IdeaPad S145-15IWL'),
  ('Lenovo','ideapad 320S-14IKB','Lenovo','IdeaPad 320S-14IKB'),
  ('Lenovo','ideapad 320-15IKB','Lenovo','IdeaPad 320-15IKB'),
  ('Lenovo','Thinkpad T560','Lenovo','ThinkPad T560'),
  ('Lenovo','Thinkpad x13 Yoga Gen2','Lenovo','ThinkPad X13 Yoga Gen 2'),
  ('Asus','F51UA - AH55','Asus','F510UA - AH55'),
  ('Apple','MacBook Air (M1, 2020)','Apple','MacBook Air M1 2020'),
  ('iPhone','12','Apple','iPhone 12'),
  ('iPhone','12 - Blauw','Apple','iPhone 12'),
  ('iPhone','12 - Groen','Apple','iPhone 12'),
  ('iPhone','13','Apple','iPhone 13'),
  ('iPhone','13 - Zwart','Apple','iPhone 13'),
  ('iPhone','14','Apple','iPhone 14'),
  ('iPhone','14 - Paars','Apple','iPhone 14'),
  ('iPhone','16','Apple','iPhone 16')
) as t(a, b, c, d);

delete from public.hardware_modellen
 where (merk, model) in (('Lenovo','[Geen sticker met naam]'), ('Lenovo','xxxxxx'), ('Onbekend','test'), ('Lenovo','yoga'));

-- 3. toestellen op voorraad met een fout in de naam
update public.hardware set model = 'EliteBook 640 G10', bijgewerkt_op = now()
 where model = 'Elitebook 640 G10' and status in ('voorraad','gereserveerd');
update public.hardware set model = 'ThinkBook 15-IIL 20SM', bijgewerkt_op = now()
 where model = 'Thinkbook 15-IIL 20SM' and status in ('voorraad','gereserveerd');
update public.hardware set model = 'ThinkPad Yoga 370 TP00078B', bijgewerkt_op = now()
 where model = 'Thinkpad yoga 370 tp00078b' and status in ('voorraad','gereserveerd');
update public.refurbish_apparaten r set model = h.model, bijgewerkt_op = now()
  from public.hardware h
 where r.hardware_id = h.id and h.model in ('EliteBook 640 G10','ThinkBook 15-IIL 20SM','ThinkPad Yoga 370 TP00078B')
   and r.model is distinct from h.model;

-- Palvilion: naam en webshopsleutel samen.
update public.webshop_producten set sleutel = replace(sleutel, 'palvilion', 'pavilion'), bijgewerkt_op = now()
 where sleutel like '%palvilion%'
   and not exists (select 1 from public.webshop_producten w2 where w2.team_id = webshop_producten.team_id
                   and w2.sleutel = replace(webshop_producten.sleutel, 'palvilion', 'pavilion'));
update public.webshop_grade_prijzen set sleutel = replace(sleutel, 'palvilion', 'pavilion')
 where sleutel like '%palvilion%'
   and not exists (select 1 from public.webshop_grade_prijzen w2 where w2.team_id = webshop_grade_prijzen.team_id
                   and w2.sleutel = replace(webshop_grade_prijzen.sleutel, 'palvilion', 'pavilion'));
update public.hardware set
  model = replace(model, 'Palvilion', 'Pavilion'),
  kanalen = case when kanalen->'shopify'->>'sleutel' like '%palvilion%'
                 then jsonb_set(kanalen, '{shopify,sleutel}', to_jsonb(replace(kanalen->'shopify'->>'sleutel', 'palvilion', 'pavilion')))
                 else kanalen end,
  bijgewerkt_op = now()
 where model like '%Palvilion%';
update public.refurbish_apparaten set model = replace(model, 'Palvilion', 'Pavilion'), bijgewerkt_op = now()
 where model like '%Palvilion%';
update public.model_vraagprijzen set model = replace(model, 'Palvilion', 'Pavilion'), bijgewerkt_op = now()
 where model like '%Palvilion%'
   and not exists (select 1 from public.model_vraagprijzen m2 where m2.team_id = model_vraagprijzen.team_id
                   and m2.merk = model_vraagprijzen.merk and m2.model = replace(model_vraagprijzen.model, 'Palvilion', 'Pavilion')
                   and m2.opslag = model_vraagprijzen.opslag and m2.grade = model_vraagprijzen.grade
                   and m2.uitvoering = model_vraagprijzen.uitvoering);
-- Nieuwprijzen: hernoemen waar dat kan; een dubbele lege zoekrij (geen prijs) mag weg.
update public.laptop_nieuwprijzen l set model = replace(model, 'Palvilion', 'Pavilion'), bijgewerkt_op = now()
 where model like '%Palvilion%'
   and not exists (select 1 from public.laptop_nieuwprijzen l2 where l2.team_id is not distinct from l.team_id
                   and l2.merk = l.merk and l2.model = replace(l.model, 'Palvilion', 'Pavilion') and l2.uitvoering = l.uitvoering);
delete from public.laptop_nieuwprijzen where model like '%Palvilion%' and prijs is null;
