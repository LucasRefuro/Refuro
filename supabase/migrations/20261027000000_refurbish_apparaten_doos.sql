-- "Doos erbij" per toestel (telefoon/tablet/watch). Intern veld, geen productspec:
-- het komt op de sticker en levert een extra genummerd dooslabel, zodat een toestel en
-- zijn doos in de opslag aan elkaar gekoppeld blijven. Bewust een eigen kolom en NIET in
-- specs, want specs worden wholesale op de webshop en in overzichten getoond.
alter table public.refurbish_apparaten
  add column if not exists doos boolean not null default false;

comment on column public.refurbish_apparaten.doos is
  'Is er een doos bij (telefoon/tablet/watch): komt op de sticker + een extra genummerd dooslabel.';
