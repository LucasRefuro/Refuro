-- Nieuwe producten en touch-laptops (16 november 2026, wens eigenaar).
--
-- Staat N = nieuw: geen A, B of C, op de webshop een eigen advertentie met alleen "Nieuw". De
-- vraagprijs onthouden we ook voor N.
--
-- Touch: een touch-laptop is een andere uitvoering dan dezelfde zonder touch (hij kost meer). De
-- uitvoering van de vraagprijs krijgt dan "|touch" achter processor|geheugen|opslag. De nieuwprijs
-- (laptop_nieuwprijzen) laten we per processor|geheugen|opslag: die zoekt model-nieuwprijs op.
alter table public.model_vraagprijzen drop constraint if exists model_vraagprijzen_grade_check;
alter table public.model_vraagprijzen add constraint model_vraagprijzen_grade_check
  check (grade in ('A','B','C','N'));
alter table public.model_vraagprijzen drop constraint if exists model_vraagprijzen_uitvoering_vorm;
alter table public.model_vraagprijzen add constraint model_vraagprijzen_uitvoering_vorm
  check (uitvoering = '' or uitvoering ~ '^[a-z0-9 ]+\|[0-9.]+(GB|TB)\|[0-9.]+(GB|TB)(\|touch)?$');
