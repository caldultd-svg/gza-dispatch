-- =====================================================================
--  Gza Dispatch — reminders every 10 minutes
--  Run AFTER the app is live on Vercel. Replace APP_URL with your address,
--  for example https://gza-dispatch.vercel.app
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('gza-tick') where exists (select 1 from cron.job where jobname = 'gza-tick');

select cron.schedule(
  'gza-tick',
  '*/10 * * * *',
  $$ select net.http_get(url := 'APP_URL/api/cron') $$
);
