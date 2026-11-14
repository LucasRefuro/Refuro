-- Scherm en netwerk per model, voor het prijskaartje van een telefoon.
--
-- Het A6-kaartje van een telefoon toont "128GB | 6,1 inch | Super Retina XDR OLED" en "5G".
-- Die twee kwamen eerst uit de specs die model-specs met AI ophaalt, en die schrijft het scherm
-- elke keer net anders ("6,1 inch OLED, 2532 x 1170"). Voor iPhones zetten we het hier vast,
-- met de naam die Apple gebruikt. Leeg = onbekend, dan valt het kaartje terug op de specs.
-- De iPhone 18 Pro en de Duo blijven leeg: daar is nog niets van zeker.
alter table public.model_kleuren add column if not exists scherm text;
alter table public.model_kleuren add column if not exists netwerk text;

update public.model_kleuren m set scherm = v.scherm, netwerk = v.netwerk
from (values
  ('iPhone 8',          '4,7 inch Retina HD LCD',         '4G'),
  ('iPhone 8 Plus',     '5,5 inch Retina HD LCD',         '4G'),
  ('iPhone X',          '5,8 inch Super Retina HD OLED',  '4G'),
  ('iPhone XR',         '6,1 inch Liquid Retina HD LCD',  '4G'),
  ('iPhone XS',         '5,8 inch Super Retina HD OLED',  '4G'),
  ('iPhone XS Max',     '6,5 inch Super Retina HD OLED',  '4G'),
  ('iPhone 11',         '6,1 inch Liquid Retina HD LCD',  '4G'),
  ('iPhone 11 Pro',     '5,8 inch Super Retina XDR OLED', '4G'),
  ('iPhone 11 Pro Max', '6,5 inch Super Retina XDR OLED', '4G'),
  ('iPhone SE (2020)',  '4,7 inch Retina HD LCD',         '4G'),
  ('iPhone SE 2020',    '4,7 inch Retina HD LCD',         '4G'),
  ('iPhone 12 mini',    '5,4 inch Super Retina XDR OLED', '5G'),
  ('iPhone 12',         '6,1 inch Super Retina XDR OLED', '5G'),
  ('iPhone 12 Pro',     '6,1 inch Super Retina XDR OLED', '5G'),
  ('iPhone 12 Pro Max', '6,7 inch Super Retina XDR OLED', '5G'),
  ('iPhone 13 mini',    '5,4 inch Super Retina XDR OLED', '5G'),
  ('iPhone 13',         '6,1 inch Super Retina XDR OLED', '5G'),
  ('iPhone 13 Pro',     '6,1 inch Super Retina XDR OLED', '5G'),
  ('iPhone 13 Pro Max', '6,7 inch Super Retina XDR OLED', '5G'),
  ('iPhone SE (2022)',  '4,7 inch Retina HD LCD',         '5G'),
  ('iPhone SE 2022',    '4,7 inch Retina HD LCD',         '5G'),
  ('iPhone 14',         '6,1 inch Super Retina XDR OLED', '5G'),
  ('iPhone 14 Plus',    '6,7 inch Super Retina XDR OLED', '5G'),
  ('iPhone 14 Pro',     '6,1 inch Super Retina XDR OLED', '5G'),
  ('iPhone 14 Pro Max', '6,7 inch Super Retina XDR OLED', '5G'),
  ('iPhone 15',         '6,1 inch Super Retina XDR OLED', '5G'),
  ('iPhone 15 Plus',    '6,7 inch Super Retina XDR OLED', '5G'),
  ('iPhone 15 Pro',     '6,1 inch Super Retina XDR OLED', '5G'),
  ('iPhone 15 Pro Max', '6,7 inch Super Retina XDR OLED', '5G'),
  ('iPhone 16',         '6,1 inch Super Retina XDR OLED', '5G'),
  ('iPhone 16 Plus',    '6,7 inch Super Retina XDR OLED', '5G'),
  ('iPhone 16 Pro',     '6,3 inch Super Retina XDR OLED', '5G'),
  ('iPhone 16 Pro Max', '6,9 inch Super Retina XDR OLED', '5G'),
  ('iPhone 16e',        '6,1 inch Super Retina XDR OLED', '5G'),
  ('iPhone 17',         '6,3 inch Super Retina XDR OLED', '5G'),
  ('iPhone Air',        '6,5 inch Super Retina XDR OLED', '5G'),
  ('iPhone 17 Air',     '6,5 inch Super Retina XDR OLED', '5G'),
  ('iPhone 17 Pro',     '6,3 inch Super Retina XDR OLED', '5G'),
  ('iPhone 17 Pro Max', '6,9 inch Super Retina XDR OLED', '5G'),
  ('iPhone 17e',        '6,1 inch Super Retina XDR OLED', '5G')
) as v(model, scherm, netwerk)
where lower(m.merk) = 'apple' and lower(m.model) = lower(v.model);
