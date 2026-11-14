-- Een kleurcode per kleur, per model: de stip bij de kleurkeuze op de webshop.
--
-- Waarom per model: "Blauw" is bij een iPhone 12 een ander blauw dan bij een iPhone 13. De
-- winkelier wilde op de productpagina de echte kleur zien, met de naam erbij (november 2026).
-- Storvo stuurt de code mee als refuro.kleur_hex; het thema tekent er de stip mee.
--
-- Bron: de kleurvakjes op Wikipedia ("List of iPhone models" en de artikelen per model), daar
-- uit Apples productfoto's gehaald. Geen officiele Apple-codes, wel de gangbare. Geschat uit
-- productfoto's (niets gepubliceerd): alle Galaxy S24-kleuren en iPhone Air Lichtgoud.
-- kleur_hex is {kleurnaam: "#RRGGBB"} met precies de namen uit kleuren.
alter table public.model_kleuren add column if not exists kleur_hex jsonb;

update public.model_kleuren m
   set kleur_hex = w.hex
  from (values
    ('Apple','iPhone 11','{"Zwart": "#1F2020", "Wit": "#F9F6EF", "Groen": "#AEE1CD", "Geel": "#FFE681", "Paars": "#D1CDDA", "(PRODUCT)RED": "#BA0C2E"}'::jsonb),
    ('Apple','iPhone 11 Pro','{"Middernachtgroen": "#4E5851", "Zilver": "#EBEBE3", "Spacegrijs": "#535150", "Goud": "#FAD7BD"}'::jsonb),
    ('Apple','iPhone 11 Pro Max','{"Middernachtgroen": "#4E5851", "Zilver": "#EBEBE3", "Spacegrijs": "#535150", "Goud": "#FAD7BD"}'::jsonb),
    ('Apple','iPhone 12','{"Zwart": "#25212B", "Wit": "#F5F5F7", "Blauw": "#023B63", "Groen": "#D8EFD5", "Paars": "#B7AFE6", "(PRODUCT)RED": "#D82E2E"}'::jsonb),
    ('Apple','iPhone 12 mini','{"Zwart": "#25212B", "Wit": "#F5F5F7", "Blauw": "#023B63", "Groen": "#D8EFD5", "Paars": "#B7AFE6", "(PRODUCT)RED": "#D82E2E"}'::jsonb),
    ('Apple','iPhone 12 Pro','{"Grafiet": "#52514D", "Zilver": "#E3E4DF", "Goud": "#FCEBD3", "Oceaanblauw": "#2D4E5C"}'::jsonb),
    ('Apple','iPhone 12 Pro Max','{"Grafiet": "#52514D", "Zilver": "#E3E4DF", "Goud": "#FCEBD3", "Oceaanblauw": "#2D4E5C"}'::jsonb),
    ('Apple','iPhone 13','{"Middernacht": "#232A31", "Sterrenlicht": "#FAF6F2", "Blauw": "#276787", "Roze": "#FADDD7", "Groen": "#394C38", "(PRODUCT)RED": "#BF0013"}'::jsonb),
    ('Apple','iPhone 13 mini','{"Middernacht": "#232A31", "Sterrenlicht": "#FAF6F2", "Blauw": "#276787", "Roze": "#FADDD7", "Groen": "#394C38", "(PRODUCT)RED": "#BF0013"}'::jsonb),
    ('Apple','iPhone 13 Pro','{"Grafiet": "#54524F", "Goud": "#FAE7CF", "Zilver": "#F1F2ED", "Sierrablauw": "#A7C1D9", "Alpengroen": "#576856"}'::jsonb),
    ('Apple','iPhone 13 Pro Max','{"Grafiet": "#54524F", "Goud": "#FAE7CF", "Zilver": "#F1F2ED", "Sierrablauw": "#A7C1D9", "Alpengroen": "#576856"}'::jsonb),
    ('Apple','iPhone 14','{"Middernacht": "#222930", "Sterrenlicht": "#FAF6F2", "Blauw": "#A0B4C7", "Paars": "#E6DDEB", "Geel": "#F9E479", "(PRODUCT)RED": "#FC0324"}'::jsonb),
    ('Apple','iPhone 14 Plus','{"Middernacht": "#222930", "Sterrenlicht": "#FAF6F2", "Blauw": "#A0B4C7", "Paars": "#E6DDEB", "Geel": "#F9E479", "(PRODUCT)RED": "#FC0324"}'::jsonb),
    ('Apple','iPhone 14 Pro','{"Spacezwart": "#403E3D", "Zilver": "#F0F2F2", "Goud": "#F4E8CE", "Dieppaars": "#594F63"}'::jsonb),
    ('Apple','iPhone 14 Pro Max','{"Spacezwart": "#403E3D", "Zilver": "#F0F2F2", "Goud": "#F4E8CE", "Dieppaars": "#594F63"}'::jsonb),
    ('Apple','iPhone 15','{"Zwart": "#35393B", "Blauw": "#CED5D9", "Groen": "#CAD4C5", "Geel": "#E6E0C1", "Roze": "#E3C8CA"}'::jsonb),
    ('Apple','iPhone 15 Plus','{"Zwart": "#35393B", "Blauw": "#CED5D9", "Groen": "#CAD4C5", "Geel": "#E6E0C1", "Roze": "#E3C8CA"}'::jsonb),
    ('Apple','iPhone 15 Pro','{"Naturel titanium": "#BAB4A9", "Blauw titanium": "#3D4555", "Wit titanium": "#F2F1EB", "Zwart titanium": "#3F4042"}'::jsonb),
    ('Apple','iPhone 15 Pro Max','{"Naturel titanium": "#BAB4A9", "Blauw titanium": "#3D4555", "Wit titanium": "#F2F1EB", "Zwart titanium": "#3F4042"}'::jsonb),
    ('Apple','iPhone 16','{"Zwart": "#3C4042", "Wit": "#FAFAFA", "Roze": "#F2ADDA", "Blauwgroen": "#B0D4D2", "Ultramarijn": "#9AADF6"}'::jsonb),
    ('Apple','iPhone 16 Plus','{"Zwart": "#3C4042", "Wit": "#FAFAFA", "Roze": "#F2ADDA", "Blauwgroen": "#B0D4D2", "Ultramarijn": "#9AADF6"}'::jsonb),
    ('Apple','iPhone 16 Pro','{"Woestijntitanium": "#BFA48F", "Naturel titanium": "#C2BCB2", "Wit titanium": "#F2F1ED", "Zwart titanium": "#3C3C3D"}'::jsonb),
    ('Apple','iPhone 16 Pro Max','{"Woestijntitanium": "#BFA48F", "Naturel titanium": "#C2BCB2", "Wit titanium": "#F2F1ED", "Zwart titanium": "#3C3C3D"}'::jsonb),
    ('Apple','iPhone 16e','{"Zwart": "#3C4042", "Wit": "#FAFAFA"}'::jsonb),
    ('Apple','iPhone 17','{"Zwart": "#353839", "Wit": "#F5F5F5", "Nevelblauw": "#96AED1", "Saliegroen": "#A9B689", "Lavendel": "#DFCEEA"}'::jsonb),
    ('Apple','iPhone 17 Pro','{"Kosmisch oranje": "#F77E2D", "Diepblauw": "#32374A", "Zilver": "#F5F5F5"}'::jsonb),
    ('Apple','iPhone 17 Pro Max','{"Kosmisch oranje": "#F77E2D", "Diepblauw": "#32374A", "Zilver": "#F5F5F5"}'::jsonb),
    ('Apple','iPhone 17e','{"Zwart": "#3C4042", "Wit": "#FAFAFA", "Zachtroze": "#FCE7E6"}'::jsonb),
    ('Apple','iPhone 18 Pro','{"Zwart": "#3C3C3C", "Zilver": "#F7F7F7", "Gletsjer": "#E8F1FE", "Bordeauxrood": "#4D1722"}'::jsonb),
    ('Apple','iPhone 18 Pro Max','{"Zwart": "#3C3C3C", "Zilver": "#F7F7F7", "Gletsjer": "#E8F1FE", "Bordeauxrood": "#4D1722"}'::jsonb),
    ('Apple','iPhone 8','{"Goud": "#F7E8DD", "Zilver": "#E2E3E4", "Spacegrijs": "#272729", "(PRODUCT)RED": "#B41325"}'::jsonb),
    ('Apple','iPhone 8 Plus','{"Goud": "#F7E8DD", "Zilver": "#E2E3E4", "Spacegrijs": "#272729", "(PRODUCT)RED": "#B41325"}'::jsonb),
    ('Apple','iPhone Air','{"Spacezwart": "#262631", "Wolkenwit": "#FCFCFC", "Lichtgoud": "#EFE4CF", "Hemelsblauw": "#D3E9F7"}'::jsonb),
    ('Apple','iPhone Duo','{"Sterrenwit": "#F7F6F5", "Nachthemel": "#394452"}'::jsonb),
    ('Apple','iPhone SE (2020)','{"Zwart": "#262529", "Wit": "#F3F3F3", "(PRODUCT)RED": "#B41325"}'::jsonb),
    ('Apple','iPhone SE (2022)','{"Middernacht": "#232A31", "Sterrenlicht": "#FAF6F2", "(PRODUCT)RED": "#BF0013"}'::jsonb),
    ('Apple','iPhone X','{"Zilver": "#E4E4E2", "Spacegrijs": "#262529"}'::jsonb),
    ('Apple','iPhone XR','{"Zwart": "#2E3034", "Wit": "#F3F3F3", "Blauw": "#48AEE6", "Geel": "#F9D045", "Koraal": "#FF6E5A", "(PRODUCT)RED": "#B41325"}'::jsonb),
    ('Apple','iPhone XS','{"Goud": "#FADCC2", "Zilver": "#E4E4E2", "Spacegrijs": "#262529"}'::jsonb),
    ('Apple','iPhone XS Max','{"Goud": "#FADCC2", "Zilver": "#E4E4E2", "Spacegrijs": "#262529"}'::jsonb),
    ('Samsung','Galaxy S24','{"Onyx Black": "#2A2B2E", "Marble Grey": "#C9CACC", "Cobalt Violet": "#9D90C6", "Amber Yellow": "#EFE1A3", "Jade Green": "#B6D2C0", "Sapphire Blue": "#A3BAD8", "Sandstone Orange": "#EDBF98"}'::jsonb)
  ) as w(merk, model, hex)
 where m.merk = w.merk and m.model = w.model;
