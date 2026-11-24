-- Een webshopbestelling waarvan het toestel er niet meer is (24 november 2026, wens eigenaar).
--
-- Aanleiding: A0160 werd in de webshop verkocht terwijl er in de winkel net een EliteBook 840 G8
-- was afgerekend. Vanuit de bestelling kies je dan: hetzelfde toestel met een ander A-nummer, een
-- voorstel met vergelijkbare toestellen naar de klant, of het geld terug.
--
-- toestellen_weg: de toestellen die bij deze bestelling hoorden en er niet meer zijn, met wat er
-- mee gebeurde ({id, code, naam, variant, reden, op, door}). Ze staan bewust NIET meer in
-- toestellen: de melding van Shopify zet bij een annulering alles uit toestellen terug op
-- voorraad, en een toestel dat weg is mag daar nooit terugkomen. De melding telt deze lijst wel
-- mee als "al toegewezen", anders pakt een volgende melding (betaald, verzonden) stilletjes een
-- ander exemplaar van dezelfde variant.
--
-- voorstellen: welke mails met vergelijkbare toestellen er naar de klant gingen ({op, naar, codes, door}).
alter table public.webshop_bestellingen
  add column if not exists toestellen_weg jsonb not null default '[]'::jsonb,
  add column if not exists voorstellen jsonb not null default '[]'::jsonb;
