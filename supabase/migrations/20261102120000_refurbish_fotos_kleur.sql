-- Fabrieksfoto's van een telefoon horen bij model én kleur.
--
-- Een modelfoto (apparaat_id leeg) werd tot nu toe alleen op model gevonden. Voor
-- een laptop klopt dat: elke EliteBook 840 G9 ziet er hetzelfde uit. Een telefoon
-- niet: een iPhone 13 in roze is op de webshop iets anders dan in zwart, en de koper
-- moet krijgen wat hij op de foto zag. Met deze kolom krijgt een modelset van een
-- telefoon zijn kleur erbij; de werkbank toont dan alleen de set in de kleur van het
-- toestel (fotosInKleur in refurbish/index.html).
--
-- Leeg betekent "geldt voor elke kleur". Zo blijven alle bestaande foto's, en alle
-- laptopfoto's, precies werken zoals ze deden. De bestaande RLS-policies gelden per
-- rij, dus voor een nieuwe kolom hoeft daar niets aan te veranderen.
alter table public.refurbish_fotos add column if not exists kleur text;

comment on column public.refurbish_fotos.kleur is
  'Alleen bij een modelfoto van een telefoon: de kleur waar de set bij hoort. Leeg = elke kleur.';
