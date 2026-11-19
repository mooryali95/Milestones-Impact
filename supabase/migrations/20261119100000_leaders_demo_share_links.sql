-- ════════════════════════════════════════════════════════════════
-- روابط تجربة حساب العرض، وقيد «حساب العرض بلا جهة» (تصور الحساب التجريبي 2026-11-19، المرحلة 0 وميزة الرابط)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله ترد أفعال روابط التجربة not_migrated وتعرض اللوحة «لم تُفعَّل بعد»، وفتح حساب العرض من اللوحة يبطل جلساته كلها كما كان (demo.ts)
-- 1) leaders.demo_links: رابط باسم مستلمه (اسم أو صفة يكتبها المدير، بلا بريد ولا جوال)، برمز عشوائي لا تُحفظ منه إلا
--    بصمته، وله انتهاء وإلغاء وآخر استعمال. لا يفتح إلا جلسة مشارك لحساب العرض، ولا يقرؤه إلا دور الخدمة.
-- 2) leaders.auth_sessions.demo_link_id: الجلسة التي بدأها رابط، فلا تبطلها جلسة المدير ولا تبطلها هي، وتُبطل بإلغاء رابطها.
--    عمود فارغ على جدول قائم: الدوال قبله لا تقرؤه. بلا فهرس: يُقرأ دائمًا مع participant_id لحساب العرض وحده.
-- 3) participants_demo_no_org: حساب العرض لا يُربط بجهة أبدًا، فلا يظهر في لوحة جهة ولا مقاعدها ولا بريدها. الصفوف
--    المخالفة إن وُجدت (لا يُتوقع: حساب واحد بقيد participants_one_demo، يُنشأ بلا جهة) تُحفظ في جدول النسخة ثم تُفك.
-- restore: update leaders.participants p set organization_id = b.organization_id, org_via = b.org_via from leaders.backup_20261119_demo_org b where p.id = b.id (بعد alter table leaders.participants drop constraint participants_demo_no_org)
-- آمن لإعادة التشغيل.

create table if not exists leaders.demo_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (char_length(token_hash) = 64),
  label text not null check (char_length(label) between 1 and 80),
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by text,
  last_used_at timestamptz,
  uses integer not null default 0 check (uses >= 0)
);
alter table leaders.demo_links enable row level security;
revoke all on leaders.demo_links from anon, authenticated;

alter table leaders.auth_sessions add column if not exists demo_link_id uuid references leaders.demo_links (id) on delete set null;

create table if not exists leaders.backup_20261119_demo_org as
  select id, organization_id, org_via from leaders.participants where is_demo and organization_id is not null;
alter table leaders.backup_20261119_demo_org enable row level security;
revoke all on leaders.backup_20261119_demo_org from anon, authenticated;
update leaders.participants set organization_id = null, org_via = null where is_demo and organization_id is not null;

-- not valid ثم validate: الإضافة لا تمسح الجدول تحت قفل حصري، والتحقق بعدها يقرأ والكتابة جارية
alter table leaders.participants drop constraint if exists participants_demo_no_org;
alter table leaders.participants add constraint participants_demo_no_org check (not (is_demo and organization_id is not null)) not valid;
alter table leaders.participants validate constraint participants_demo_no_org;

insert into leaders.schema_migrations (name) values ('20261119100000_leaders_demo_share_links') on conflict do nothing;
