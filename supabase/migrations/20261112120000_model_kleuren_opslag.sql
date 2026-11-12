-- model_kleuren wordt de lijst met telefoonmodellen: per model de kleuren én de opslag.
--
-- Waarom: bij los toevoegen kies je Telefoon, Apple, het model, en dan kleur en opslag uit
-- wat er van dat model echt bestaat. De winkelapp leest deze tabel rechtstreeks (iedereen die
-- is ingelogd mag lezen); alleen een model dat er niet in staat gaat nog via de edge-functies.
--   opslag   de opslagvarianten, kleinste eerst ("64 GB" ... "2 TB")
--   volgorde hoger = nieuwer; de keuzelijst toont het nieuwste model bovenaan
--   toon     false = alleen een andere schrijfwijze ("iPhone SE 2020"): die vindt de kleuren
--            van een getypt model, maar staat niet nog een keer in de keuzelijst
alter table public.model_kleuren add column if not exists opslag jsonb not null default '[]'::jsonb;
alter table public.model_kleuren add column if not exists volgorde integer;
alter table public.model_kleuren add column if not exists toon boolean not null default true;
