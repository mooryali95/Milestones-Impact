-- ════════════════════════════════════════════════════════════════
-- تذكير المشاركين أسبوعيًا (23 أكتوبر 2026)
-- ════════════════════════════════════════════════════════════════
-- 1) عمود آخر تذكير، فلا يصل أحدًا أكثر من تذكير في الأسبوع.
-- 2) جدولة أسبوعية (الأحد 9 صباحًا بتوقيت الرياض = 06:00 UTC) تنادي
--    leaders-api بالإجراء cron.reminders.
--
-- قبل التشغيل:
--   • اضبط السر LEADERS_CRON_SECRET في أسرار دوال الحافة.
--   • احفظ السر نفسه في Vault باسم leaders_cron_secret:
--       select vault.create_secret('<السر>', 'leaders_cron_secret');
--   • فعّل الإضافتين pg_cron و pg_net من لوحة Supabase.

alter table leaders.participants add column if not exists reminded_at timestamptz;

select cron.schedule(
  'leaders-weekly-reminders',
  '0 6 * * 0',
  $$
  select net.http_post(
    url     := 'https://eormhcupwgwpllhrfxxg.supabase.co/functions/v1/leaders-api',
    -- المفتاح العام (anon) لبوابة الدوال، وهو منشور في الواجهة أصلًا
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvcm1oY3Vwd2d3cGxsaHJmeHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3OTY2OTksImV4cCI6MjA4NjM3MjY5OX0.xbZtLH9R9mE3ogfNToojrtzQUK799y5rZrj29ggB1f0'),
    body    := jsonb_build_object(
      'action', 'cron.reminders',
      'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'leaders_cron_secret')
    )
  );
  $$
);
