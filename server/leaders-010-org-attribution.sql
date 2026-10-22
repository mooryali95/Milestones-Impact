-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة · الترحيل العاشر: نسب المشاركين لجهاتهم تلقائيًا
-- ════════════════════════════════════════════════════════════════
-- يُشغَّل بعد 001 إلى 009. آمن لإعادة التشغيل.
--
-- ثلاث طبقات تنسب المشارك لجهته دون تدخل:
--   1. رابط الجهة:   leaders.sunkvalue.com/j/<رمز>  أو  /j/<رمز>/<حملة>
--   2. نطاق الجهة:   من يصل من موقع مسجل للجهة (مثل mi.manzoma.sa) يُنسب لها
--   3. الذاكرة:      يبقى الانتساب محفوظًا في المتصفح 30 يومًا حتى يسجّل
-- الأولوية: الرابط ثم النطاق، والنقل اليدوي من الإدارة يغلب الكل.

-- النطاقات المرتبطة بالجهة (بأحرف صغيرة، بلا www)
alter table leaders.organizations add column if not exists domains text[] not null default '{}';
create index if not exists organizations_domains_gin on leaders.organizations using gin (domains);

-- كيف انتسب المشارك لجهته، ومن أي حملة، ومن أي موقع وصل
alter table leaders.participants add column if not exists org_via text
  check (org_via is null or org_via in ('link', 'domain', 'admin'));
alter table leaders.participants add column if not exists campaign text
  check (campaign is null or campaign ~ '^[a-z0-9_-]{1,40}$');
alter table leaders.participants add column if not exists referrer_host text
  check (referrer_host is null or char_length(referrer_host) <= 120);

-- من سجّل سابقًا برابط الجهة
update leaders.participants set org_via = 'link' where source = 'invite' and org_via is null;
update leaders.participants set org_via = 'admin' where organization_id is not null and org_via is null;

notify pgrst, 'reload schema';
