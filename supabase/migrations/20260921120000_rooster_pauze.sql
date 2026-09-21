-- Voor het professionele rooster: een dienst kan een pauze hebben (in minuten), en we
-- leggen vast wie de dienst inplande. Zo kan de netto-urenberekening kloppen.
alter table public.rooster
  add column if not exists pauze_min int not null default 0,
  add column if not exists gemaakt_door uuid default auth.uid();
