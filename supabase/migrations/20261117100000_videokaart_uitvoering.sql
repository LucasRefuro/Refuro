-- Een losse videokaart als eigen uitvoering (17 november 2026, wens eigenaar: een ZBook met een
-- NVIDIA erin).
--
-- Net als touch: een laptop met een losse videokaart kost meer dan dezelfde zonder, dus de
-- vraagprijs onthouden we apart. De uitvoering wordt dan processor|geheugen|opslag|gpu t1000,
-- met daarachter eventueel |touch. De code is de kaart zonder merk en geheugen (videokaartCode in
-- de winkelapp, de werkbank en _gedeeld/shopify.ts), zodat "NVIDIA Quadro T1000 4GB" en
-- "NVIDIA T1000" dezelfde prijs vinden. Een ingebouwde videokaart telt niet mee: de bestaande
-- rijen blijven zoals ze zijn.
alter table public.model_vraagprijzen drop constraint if exists model_vraagprijzen_uitvoering_vorm;
alter table public.model_vraagprijzen add constraint model_vraagprijzen_uitvoering_vorm
  check (uitvoering = '' or uitvoering ~ '^[a-z0-9 ]+\|[0-9.]+(GB|TB)\|[0-9.]+(GB|TB)(\|gpu [a-z0-9]+)?(\|touch)?$');
