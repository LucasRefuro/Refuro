-- Verlopen webshopreserveringen elk uur vrijgeven.
--
-- Tot nu toe liep het vervallen alleen als iemand in de winkelapp de lijst met reserveringen
-- opende. Deed niemand dat, dan bleef een toestel na drie dagen gewoon vastzitten en noemde de
-- webshop hem uitverkocht (zo bleef de test-reservering van A0084 twee dagen te lang open).
--
-- Zelfde patroon als mail-sync en rooster-herinnering: de edge reservering accepteert 'verval'
-- met X-Cron-Secret gelijk aan MAIL_CRON_SECRET. Het geheim komt uit de vault en staat dus
-- nergens in deze tekst. Minuut 7, zodat hij niet samenvalt met de andere taken op het hele uur.

select cron.unschedule(jobid) from cron.job where jobname = 'reservering-verval-uur';

select cron.schedule(
  'reservering-verval-uur',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://ugilfxqolemxwssbpdwu.supabase.co/functions/v1/reservering',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'mail_cron_secret')
    ),
    body := '{"actie":"verval"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
