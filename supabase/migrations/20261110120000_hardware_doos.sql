-- Doos erbij, per toestel. Bij los toevoegen in de winkelapp vink je het aan; komt het
-- toestel van de werkbank, dan gaat refurbish_apparaten.doos mee bij naarVoorraad.
-- Een echte kolom en niet in specs: specs zijn wat erin zit, en alles in specs
-- verschijnt in de tabel "Wat erin zit".
alter table public.hardware add column if not exists doos boolean not null default false;
comment on column public.hardware.doos is 'Er zit een doos bij het toestel. Bij los toevoegen aangevinkt, of meegenomen van refurbish_apparaten.doos.';
