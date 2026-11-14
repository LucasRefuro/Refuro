-- Zit er een nieuwe accu bij deze webshopbestelling?
--
-- De klant kan op de productpagina een nieuwe accu kiezen (telefoon 45 euro, laptop 89 euro).
-- Dan moet het toestel eerst langs de werkbank. De melding van Shopify (shopify-webhook) zet het
-- toestel bij Te repareren en zet deze vlag; de winkelapp toont hem groot bij de bestelling en in
-- de pop-up, zodat niemand de telefoon zonder nieuwe accu verstuurt.
alter table public.webshop_bestellingen add column if not exists nieuwe_accu boolean not null default false;
