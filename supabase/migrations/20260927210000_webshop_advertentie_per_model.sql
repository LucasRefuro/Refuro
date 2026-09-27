-- De advertentie per model bewaren, niet alleen per exemplaar.
--
-- webshop_grade_prijzen was de per-model opslag van de grade-prijzen. We breiden
-- hem uit met de rest van de advertentie (titel, tekst, zoekwoorden, nieuwprijs,
-- garantie), zodat "online zetten" niet elke keer met een leeg scherm begint: je
-- kunt de advertentie aanpassen en die blijft bewaard, en zodra er weer een
-- exemplaar van hetzelfde model op voorraad komt pakt hij de oude advertentie erbij.
--
-- RLS blijft zoals hij was (via my_team_id()); we voegen alleen kolommen toe.

alter table webshop_grade_prijzen
  add column if not exists titel text,
  add column if not exists tekst text,
  add column if not exists zoekwoorden jsonb,
  add column if not exists nieuwprijs numeric,
  add column if not exists garantie integer;
