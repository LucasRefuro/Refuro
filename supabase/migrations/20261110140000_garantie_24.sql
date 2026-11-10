-- Standaard 24 maanden garantie (10 nov 2026). Dat belooft de webshop bovenaan elke
-- pagina; de werkbank gaf 12 en de online-pagina begon op 6. De apps zetten de garantie
-- zelf, dit is de terugval voor een rij die zonder garantie wordt aangemaakt.
alter table public.hardware alter column garantie set default 24;
