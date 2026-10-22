-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة — الترحيل الثالث: الملف الشخصي، الاعتماد، متطلبات المراحل
-- ════════════════════════════════════════════════════════════════
-- يُشغَّل بعد leaders.sql وleaders-002-assessment.sql. آمن لإعادة التشغيل.
--
-- الرحلة كاملة كما يراها المشارك (عشر مراحل):
--   1 الملف الشخصي ← 2 تحديد المستوى ← 3 اعتماد الإدارة
--   ← 4..9 مراحل التأهيل الست ← 10 التقرير النهائي
-- لكل مرحلة متطلبات (قائمة تحقق) عامة أو خاصة ببُعد ومستوى،
-- وكلها تُدار من لوحة الإدارة: إضافة، حذف، ترتيب، تفعيل.

-- ── 1. الملف الشخصي ──
alter table leaders.participants add column if not exists sector               text check (char_length(sector) <= 120);
alter table leaders.participants add column if not exists years_experience     smallint check (years_experience between 0 and 60);
alter table leaders.participants add column if not exists bio                  text check (char_length(bio) <= 2000);
alter table leaders.participants add column if not exists cv_path              text;   -- Supabase Storage، خاص
alter table leaders.participants add column if not exists linkedin_url         text check (char_length(linkedin_url) <= 300);
alter table leaders.participants add column if not exists profile_completed_at timestamptz;

-- حالة جديدة: أنهى القياس وينتظر اعتماد الإدارة
alter table leaders.participants drop constraint if exists participants_status_check;
alter table leaders.participants add constraint participants_status_check
  check (status in ('registered', 'profiled', 'assessing', 'pending_approval',
                    'placed', 'enrolled', 'completed', 'withdrawn', 'suspended'));

-- ── 2. اعتماد المستوى ──
-- القياس يكتب مستوى مبدئيًا (approved_at فارغ)، والإدارة تعتمده أو تعدّله.
-- البرنامج والكتيب لا يُفتحان إلا بعد اعتماد الأبعاد الثلاثة.
alter table leaders.placements add column if not exists approved_at timestamptz;
alter table leaders.placements add column if not exists approved_by text;   -- بريد المدير
alter table leaders.placements add column if not exists admin_note  text;

-- ── 3. مراحل الرحلة العشر ──
-- مراحل التأهيل الست من الترحيل الثاني تُزاح إلى 4..9.
insert into leaders.journey_stages (key, sort, title_ar, duration_label, duration_days, description_ar) values
  ('profile',    1,  'الملف الشخصي',     'دقائق',   0, 'بياناتك الأساسية وسيرتك المهنية.'),
  ('assessment', 2,  'تحديد المستوى',    '12 دقيقة', 0, 'القياس المبدئي في الأبعاد الثلاثة.'),
  ('approval',   3,  'اعتماد المستوى',   '3 أيام عمل', 3, 'يراجع المستشار نتيجتك ويعتمد مسارك.'),
  ('report',     10, 'التقرير النهائي',  'أسبوع',   7, 'تقرير مفصل لك أو للجهة التي رشحتك.')
on conflict (key) do update set sort = excluded.sort, title_ar = excluded.title_ar,
  duration_label = excluded.duration_label, duration_days = excluded.duration_days,
  description_ar = excluded.description_ar;

update leaders.journey_stages set sort = 4 where key = 'training';
update leaders.journey_stages set sort = 5 where key = 'ojt_coaching';
update leaders.journey_stages set sort = 6 where key = 'consulting';
update leaders.journey_stages set sort = 7 where key = 'leadership_coaching';
update leaders.journey_stages set sort = 8 where key = 'support';
update leaders.journey_stages set sort = 9 where key = 'evaluation';

-- كل ما يظهر للمشارك في بطاقة المرحلة يُحرَّر من اللوحة: الاسم، المدة،
-- ماذا يحدث فيها، وماذا يخرج منها، والترتيب والتفعيل.
alter table leaders.journey_stages add column if not exists active        boolean not null default true;
alter table leaders.journey_stages add column if not exists activities_ar text;   -- ماذا يتم في المرحلة
alter table leaders.journey_stages add column if not exists outcome_ar    text;   -- الإنجاز المتوقع منها
alter table leaders.journey_stages add column if not exists phase         text check (phase in ('admission', 'qualification', 'impact'));

update leaders.journey_stages set phase = 'admission'     where key in ('profile', 'assessment', 'approval') and phase is null;
update leaders.journey_stages set phase = 'qualification' where key in ('training', 'ojt_coaching', 'consulting', 'leadership_coaching') and phase is null;
update leaders.journey_stages set phase = 'impact'        where key in ('support', 'evaluation', 'report') and phase is null;

update leaders.journey_stages set outcome_ar = v.o from (values
  ('training',            'فهم الأطر الثلاثة بعمق يناسب مستواك'),
  ('ojt_coaching',        'سجل معالم وسجل منافع لمشروع حقيقي من عملك'),
  ('consulting',          'توصيات متخصصة لمشروعك'),
  ('leadership_coaching', 'خطة تطوير قيادي شخصية'),
  ('support',             'تطبيق مستقل بمتابعة الموجّه'),
  ('evaluation',          'قياس التطور في الأبعاد الثلاثة'),
  ('report',              'تقرير نهائي لك أو لجهتك')
) as v(k, o) where key = v.k and outcome_ar is null;

-- تقدّم المشارك في كل مرحلة
create table if not exists leaders.participant_stages (
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  stage_key      text not null references leaders.journey_stages(key),
  status         text not null default 'locked' check (status in ('locked', 'active', 'done')),
  started_at     timestamptz,
  completed_at   timestamptz,
  primary key (participant_id, stage_key)
);

-- ── 4. متطلبات المراحل (قائمة التحقق) ──
-- dimension وlevel فارغان = للجميع. محددان = يظهر فقط لمن مستواه كذلك في ذلك البُعد.
create table if not exists leaders.stage_requirements (
  id          uuid primary key default gen_random_uuid(),
  stage_key   text not null references leaders.journey_stages(key),
  dimension   text references leaders.dimensions(key),
  level       text references leaders.levels(key),
  code        text not null unique,
  sort        smallint not null default 0,
  title_ar    text not null,
  help_ar     text,
  kind        text not null default 'check'
              check (kind in ('check', 'upload', 'form', 'meeting', 'reading', 'auto')),
  required    boolean not null default true,
  needs_review boolean not null default false,   -- يعتمده المستشار بعد إنجاز المشارك
  active      boolean not null default true,
  check (level is null or dimension is not null)
);

create index if not exists stage_requirements_stage_idx on leaders.stage_requirements (stage_key, sort);

create table if not exists leaders.participant_requirements (
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  requirement_id uuid not null references leaders.stage_requirements(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'submitted', 'done', 'returned')),
  evidence_path  text,
  note           text,
  completed_at   timestamptz,
  reviewed_by    text,
  reviewed_at    timestamptz,
  primary key (participant_id, requirement_id)
);

-- متطلبات أولية (تُعدَّل من اللوحة). kind=auto يُنجزه النظام تلقائيًا.
insert into leaders.stage_requirements (stage_key, dimension, level, code, sort, title_ar, kind, required, needs_review) values
  ('profile',    null, null, 'P-INFO',   1, 'إكمال البيانات الأساسية',              'form',    true,  false),
  ('profile',    null, null, 'P-CV',     2, 'رفع السيرة الذاتية',                   'upload',  false, false),
  ('assessment', null, null, 'A-DONE',   1, 'إكمال القياس المبدئي',                 'auto',    true,  false),
  ('approval',   null, null, 'AP-OK',    1, 'اعتماد المستوى من المستشار',           'auto',    true,  false),
  ('training',   null, null, 'T-ATTEND', 1, 'حضور الأيام التدريبية الأربعة',       'check',   true,  true),
  ('training',   null, null, 'T-HB',     2, 'قراءة كتيبك الشخصي',                   'reading', true,  false),
  ('ojt_coaching', 'milestone', null, 'O-MREG', 1, 'بناء سجل معالم لمشروع من عملك', 'upload', true, true),
  ('ojt_coaching', 'impact',    null, 'O-BREG', 2, 'بناء سجل منافع لنفس المشروع',   'upload', true, true),
  ('ojt_coaching', 'milestone', 'advanced', 'O-GATE', 3, 'إدارة جلسة بوابة مرحلة موثقة', 'upload', true, true),
  ('consulting', null, null, 'C-MEET',   1, 'حضور الجلسة الاستشارية',               'meeting', true,  false),
  ('leadership_coaching', 'leadership', null, 'L-PLAN', 1, 'خطة التطوير القيادي الشخصية', 'upload', true, true),
  ('leadership_coaching', 'leadership', 'beginner', 'L-MAP', 2, 'خريطة أصحاب المصلحة لمشروعك', 'upload', true, true),
  ('leadership_coaching', 'leadership', 'advanced', 'L-DIRECT', 2, 'تطبيق أداة DIRECT على تحدٍّ حقيقي', 'upload', true, true),
  ('support',    null, null, 'S-CHECK',  1, 'متابعة شهرية مع الموجّه (3 جلسات)',    'meeting', true,  false),
  ('evaluation', null, null, 'E-POST',   1, 'إكمال القياس البعدي',                  'auto',    true,  false),
  ('report',     null, null, 'R-ISSUE',  1, 'استلام التقرير النهائي',               'auto',    true,  false)
on conflict (code) do nothing;

-- ── 5. سجل قراءة الكتيب (حماية وتتبع) ──
create table if not exists leaders.handbook_views (
  id             bigint generated always as identity primary key,
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  module_id      uuid references leaders.handbook_modules(id) on delete set null,
  page_no        smallint,
  ip             inet,
  user_agent     text,
  viewed_at      timestamptz not null default now()
);

create index if not exists handbook_views_participant_idx on leaders.handbook_views (participant_id, viewed_at desc);

-- ── 6. ترتيب الأسئلة وإصداراتها ──
-- تعديل سؤال بعد أن أجاب عليه مشاركون يُنشئ إصدارًا جديدًا من الأداة
-- (instruments) حتى تبقى النتائج القديمة صحيحة؛ اللوحة تتولى ذلك.
alter table leaders.instruments add column if not exists version     smallint not null default 1;
alter table leaders.instruments add column if not exists intro_ar    text;
alter table leaders.instruments add column if not exists est_minutes smallint;
update leaders.instruments set est_minutes = 12 where key = 'baseline-v1' and est_minutes is null;

-- ── الحماية ──
alter table leaders.participant_stages       enable row level security;
alter table leaders.stage_requirements       enable row level security;
alter table leaders.participant_requirements enable row level security;
alter table leaders.handbook_views           enable row level security;

revoke all on all tables    in schema leaders from public, anon, authenticated;
revoke all on all sequences in schema leaders from public, anon, authenticated;
grant  all on all tables    in schema leaders to service_role;
grant  all on all sequences in schema leaders to service_role;
