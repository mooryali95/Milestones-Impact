-- ════════════════════════════════════════════════════════════════
-- الشهادة المعلّقة (D05 في سجل قرارات لجنة الخبراء)
-- ════════════════════════════════════════════════════════════════
-- الشهادة تصدر من تقييم ختامي معتمد بقرار اجتاز أو اجتاز بملاحظات. إعادة فتح التقييم تعلّقها (suspended)،
-- ثم تُعاد أو تُلغى بالاعتماد الجديد. صفحة التحقق تعرض «معلّقة» بلا تفاصيل شخصية. آمن لإعادة التشغيل.

alter table leaders.certificates drop constraint if exists certificates_status_check;
alter table leaders.certificates add constraint certificates_status_check
  check (status = any (array['valid', 'suspended', 'revoked', 'replaced']));

insert into leaders.schema_migrations (name) values ('20261107140000_leaders_certificate_suspended') on conflict do nothing;
