-- Een uitnodiging draagt nu de rechten en het uurloon mee, zodat een collega meteen
-- goed staat zodra hij zich aanmeldt. tabs is dezelfde vorm als accounts.tabs (jsonb).
-- account_id wordt door redeem-invite ingevuld met het nieuwe account, zodat de winkelapp
-- het uurloon (dat in de blob leeft, niet in accounts) achteraf op het juiste id kan zetten.
alter table public.invites
  add column if not exists tabs jsonb,
  add column if not exists uurloon numeric,
  add column if not exists account_id uuid;
