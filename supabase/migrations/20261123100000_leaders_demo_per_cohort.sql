-- ════════════════════════════════════════════════════════════════
-- حساب تجريبي لكل دفعة (تصور الحساب التجريبي 2026-11-19، المرحلة 2)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله كل شيء كما كان بالحساب التجريبي الواحد وروابطه، وفتح حساب دفعة يُرد بـnot_migrated واللوحة تعرض «غير مفعّلة بعد» (demo-cohort.ts: demoCohortReady يسأل عن demo_links.cohort_id في كل طلب حتى يوجد)، وبعده تُفعَّل بلا نشر
-- 1) participants.demo_cohort_id: دفعة الحساب التجريبي. فارغ للحساب العام القائم (يبقى كما هو ويعرض الدفعة المفتوحة)
--    ولكل مشارك حقيقي. دفعة الحساب من هذا العمود وحده: لا صف له في enrollments، فكل قراءة بالدفعة لا تجده.
--    حذف الدفعة يحذف حسابها التجريبي (on delete cascade)، والقيد 3 يضمن أن العمود لا يحمله إلا حساب تجريبي.
-- 2) demo_links.cohort_id: رابط التجربة يفتح حساب دفعته. فارغ للروابط القائمة: تبقى تفتح الحساب العام كما كانت.
-- 3) participants_demo_cohort_is_demo: لا يحمل الدفعة التجريبية إلا صف بعلامة is_demo، فلا يُحذف مشارك حقيقي بحذف دفعة.
-- 4) participants_demo_identity: بريد الحساب التجريبي مشتق من دفعته (demo-<الدفعة>@...)، والعام demo@...، ومع فهرس
--    البريد الفريد participants_email_uniq يكون للدفعة حساب واحد وللمنصة حساب عام واحد. يحل محل participants_one_demo
--    (حساب تجريبي واحد للمنصة كلها) الذي يُحذف فهرسه هنا. التحقق من القيد يفشل الترحيل كله (بلا أثر) إن وُجد صف
--    تجريبي ببريد آخر، ولا يُتوقع: القيد المحذوف يسمح بصف واحد، وهو حساب demo@ الذي ينشئه الفتح من اللوحة.
-- 5) بلا جهة: القيد القائم participants_demo_no_org (الترحيل 20261119100000) يسري على حساب الدفعة كما يسري على العام.
-- لا صف قائم يتغير ولا يُحذف. عمودان فارغان على جدولين قائمين: الدوال قبل الترحيل لا تقرؤهما. بلا فهرس جديد على
-- participants: العمود يُقرأ مع is_demo لصفوف تُعد على الأصابع. آمن لإعادة التشغيل.

alter table leaders.participants add column if not exists demo_cohort_id uuid references leaders.cohorts (id) on delete cascade;
alter table leaders.demo_links add column if not exists cohort_id uuid references leaders.cohorts (id) on delete cascade;

-- not valid ثم validate: الإضافة لا تمسح الجدول تحت قفل حصري، والتحقق بعدها يقرأ والكتابة جارية
alter table leaders.participants drop constraint if exists participants_demo_cohort_is_demo;
alter table leaders.participants add constraint participants_demo_cohort_is_demo check (demo_cohort_id is null or is_demo) not valid;
alter table leaders.participants validate constraint participants_demo_cohort_is_demo;

alter table leaders.participants drop constraint if exists participants_demo_identity;
alter table leaders.participants add constraint participants_demo_identity check (
  not is_demo or lower(email) = 'demo' || coalesce('-' || demo_cohort_id::text, '') || '@demo.milestone-impact.org'
) not valid;
alter table leaders.participants validate constraint participants_demo_identity;

drop index if exists leaders.participants_one_demo;

insert into leaders.schema_migrations (name) values ('20261123100000_leaders_demo_per_cohort') on conflict do nothing;
