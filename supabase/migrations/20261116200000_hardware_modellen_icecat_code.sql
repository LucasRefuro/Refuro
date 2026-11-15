-- Fabrieksfoto's van een laptop die je in de winkelapp toevoegt.
--
-- Waarom: Icecat vindt een laptop alleen op de artikelcode van de fabrikant (bij Lenovo
-- bijvoorbeeld 81AH0011MH) of de streepjescode, niet op de modelnaam ("V320-17IKB"). Aan de werkbank
-- komt die code uit de Windows-uitlezing; in de winkelapp heb je hem niet. Vindt Icecat niets, dan
-- zoekt de edge-functie productfotos één keer per model een paar artikelcodes op het web op,
-- probeert die bij Icecat, en onthoudt hier de code die werkte. Elk volgend toestel van dit model
-- (van elke winkel) heeft hem dan meteen. De foto's van een model zijn hetzelfde voor elke
-- uitvoering, dus een code van een andere uitvoering van hetzelfde model is goed.
--
--   icecat_code        de artikelcode waarmee Icecat foto's van dit model gaf
--   icecat_gezocht_op  wanneer we voor het laatst op het web zochten. Hooguit eens per dertig
--                      dagen, en het is ook het slot als twee mensen tegelijk vragen.
--
-- Alleen de service-rol schrijft hier (zoals de rest van hardware_modellen via model-specs).
alter table public.hardware_modellen add column if not exists icecat_code text;
alter table public.hardware_modellen add column if not exists icecat_gezocht_op timestamptz;
