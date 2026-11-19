-- ════════════════════════════════════════════════════════════════
-- تحديثات الدفعة: آخر زيارة المدير، واللقطة اليومية، ووقت التسليم (تصور تشغيل الدفعة 2026-11-19، المرحلة 3)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله يعرض شريط «منذ آخر زيارة» آخر سبعة أيام بجملة واضحة ولا يحفظ وقت الزيارة (cohort-visits.ts)، ولا لقطة فلا تنبيه متأخرين ولا سطر في الملخص اليومي ولا ملخص أسبوعي (cohort-pulse.ts)، والتسليم يُحفظ بلا وقته (participant.ts)
-- 1) leaders.admin_cohort_visits: وقت آخر زيارة لكل مدير ولكل دفعة (القرار 12)، فيعمل «منذ آخر زيارة» من أي جهاز.
--    since_at ما تُعرض التغيّرات منذه في الزيارة الجارية، وseen_at آخر لحظة قراءة عُرض شريطها، وtouched_at آخر عرض.
--    بيانات عن المدير لا عن المشارك: بريده ومعرّف الدفعة وثلاثة أوقات.
-- 2) leaders.cohort_snapshots: لقطة يومية لكل دفعة جارية (القرار 13)، أعداد وحدها بلا اسم ولا معرّف مشارك: الأعضاء، من
--    في كل مرحلة، المتأخرون ومن صار متأخرًا منذ اللقطة السابقة، ما ينتظر القرار، النشطون، والأنشطة المكتملة منذ اللقطة
--    السابقة. يقرؤها تنبيه «نظرة عامة» وسطر الملخص اليومي والملخص الأسبوعي. وweekly_sent_at علامة إرسال الملخص الأسبوعي.
-- 3) leaders.participant_requirements.submitted_at: وقت تسليم البند للمراجعة، لسطر «سلّموا ما ينتظر مراجعتك». عمود فارغ
--    بلا قيمة افتراضية على جدول قائم: لا إعادة كتابة للجدول، والدوال قبله لا تقرؤه. الصفوف القائمة تبقى بلا وقت.
-- الجدولان لا يقرؤهما إلا دور الخدمة: RLS مفعّل بلا سياسة، وبلا صلاحية لـanon ولا authenticated. آمن لإعادة التشغيل.

create table if not exists leaders.admin_cohort_visits (
  admin_email text not null check (char_length(admin_email) between 3 and 320),
  cohort_id uuid not null references leaders.cohorts (id) on delete cascade,
  since_at timestamptz,
  seen_at timestamptz not null,
  touched_at timestamptz not null default now(),
  primary key (admin_email, cohort_id)
);
alter table leaders.admin_cohort_visits enable row level security;
revoke all on leaders.admin_cohort_visits from anon, authenticated;

create table if not exists leaders.cohort_snapshots (
  cohort_id uuid not null references leaders.cohorts (id) on delete cascade,
  day date not null,
  taken_at timestamptz not null default now(),
  since_at timestamptz not null,
  members integer not null default 0 check (members >= 0),
  finished integer not null default 0 check (finished >= 0),
  late integer not null default 0 check (late >= 0),
  late_new integer not null default 0 check (late_new >= 0),
  waiting integer not null default 0 check (waiting >= 0),
  active_week integer not null default 0 check (active_week >= 0),
  done_items integer not null default 0 check (done_items >= 0),
  done_people integer not null default 0 check (done_people >= 0),
  entered integer not null default 0 check (entered >= 0),
  joined integer not null default 0 check (joined >= 0),
  stages jsonb not null default '[]'::jsonb,
  weekly_sent_at timestamptz,
  primary key (cohort_id, day)
);
create index if not exists cohort_snapshots_day_idx on leaders.cohort_snapshots (day desc);
alter table leaders.cohort_snapshots enable row level security;
revoke all on leaders.cohort_snapshots from anon, authenticated;

alter table leaders.participant_requirements add column if not exists submitted_at timestamptz;

insert into leaders.schema_migrations (name) values ('20261119120000_leaders_cohort_updates') on conflict do nothing;
