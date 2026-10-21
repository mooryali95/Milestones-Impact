-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة — الترحيل الأول (يُشغَّل مرّة في Supabase SQL Editor)
-- ════════════════════════════════════════════════════════════════
-- كل الجداول في مخطط مستقل leaders، فلا تتعارض مع جداول المصفوفة
-- أو SSPDF أو طلبات التواصل في public مهما تشابهت الأسماء.
--
-- الوصول للخادم وحده: دالة الحافة leaders-api وadmin-api بمفتاح
-- service_role. المفتاح العام لا يملك أي صلاحية على المخطط، وRLS
-- مفعّل على كل جدول بلا سياسات، فلا قراءة ولا كتابة من المتصفح.
--
-- بعد التشغيل: Project Settings ← API ← Exposed schemas ← أضف leaders
-- (لازم ليصل إليه supabase-js من دوال الحافة؛ الحماية من المنح أدناه).
--
-- آمن لإعادة التشغيل: كل أمر محروس بـ if not exists أو or replace.

create schema if not exists leaders;

revoke all on schema leaders from public, anon, authenticated;
grant usage on schema leaders to service_role;

-- ── أدوات ──────────────────────────────────────────────────────

create or replace function leaders.touch_updated_at()
returns trigger
language plpgsql
set search_path = leaders
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ════════════════════════════════════════════════════════════════
-- 1. شبكة المستويات 3×3
-- ════════════════════════════════════════════════════════════════
-- الأعمدة: الأبعاد الثلاثة. الصفوف: المستويات الثلاثة.
-- المشارك يأخذ مستوى مستقلًا في كل بُعد، فقد يكون مبتدئًا في
-- milestone ومتقدّمًا في leadership. هذا أساس رحلته كلها.

create table if not exists leaders.dimensions (
  key        text primary key check (key in ('milestone', 'impact', 'leadership')),
  title_ar   text not null,
  title_en   text not null,
  sort       smallint not null
);

create table if not exists leaders.levels (
  key        text primary key check (key in ('beginner', 'intermediate', 'advanced')),
  title_ar   text not null,
  title_en   text not null,
  sort       smallint not null
);

insert into leaders.dimensions (key, title_ar, title_en, sort) values
  ('milestone',  'المعالم',  'Milestone',  1),
  ('impact',     'الأثر',    'Impact',     2),
  ('leadership', 'القيادة',  'Leadership', 3)
on conflict (key) do nothing;

insert into leaders.levels (key, title_ar, title_en, sort) values
  ('beginner',     'مبتدئ',  'Beginner',     1),
  ('intermediate', 'متوسط',  'Intermediate', 2),
  ('advanced',     'متقدم',  'Advanced',     3)
on conflict (key) do nothing;

-- الخلايا التسع: وصف كل خلية وحدود درجتها. الحدود تحدد المستوى
-- آليًا من نتيجة القياس، وتُعدَّل من لوحة الإدارة لا من الكود.
create table if not exists leaders.grid_cells (
  dimension      text not null references leaders.dimensions(key),
  level          text not null references leaders.levels(key),
  description_ar text,
  min_score      numeric(5,2),          -- من 0 إلى 100، شامل
  max_score      numeric(5,2),          -- شامل
  updated_at     timestamptz not null default now(),
  primary key (dimension, level),
  check (min_score is null or max_score is null or min_score <= max_score)
);

insert into leaders.grid_cells (dimension, level, min_score, max_score)
select d.key, l.key,
       case l.key when 'beginner' then 0 when 'intermediate' then 40 else 70 end,
       case l.key when 'beginner' then 39.99 when 'intermediate' then 69.99 else 100 end
from leaders.dimensions d cross join leaders.levels l
on conflict (dimension, level) do nothing;

drop trigger if exists grid_cells_touch on leaders.grid_cells;
create trigger grid_cells_touch before update on leaders.grid_cells
  for each row execute function leaders.touch_updated_at();


-- ════════════════════════════════════════════════════════════════
-- 2. الجهات والمشاركون
-- ════════════════════════════════════════════════════════════════

create table if not exists leaders.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) <= 200),
  sector        text,
  contact_name  text,
  contact_email text,
  contact_phone text,
  status        text not null default 'active' check (status in ('active', 'inactive')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists organizations_touch on leaders.organizations;
create trigger organizations_touch before update on leaders.organizations
  for each row execute function leaders.touch_updated_at();

-- المشارك. مستقل تمامًا عن مسجلي المصفوفة.
-- person_id وcontact_request_id فارغان اليوم، وهما نقطتا التكامل لاحقًا.
create table if not exists leaders.participants (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null check (char_length(email) <= 254),
  full_name            text not null check (char_length(full_name) <= 120),
  phone                text check (char_length(phone) <= 20),
  job_title            text check (char_length(job_title) <= 120),
  organization_id      uuid references leaders.organizations(id) on delete set null,
  organization_name    text check (char_length(organization_name) <= 200), -- ما كتبه المشارك قبل ربطه بجهة
  status               text not null default 'registered'
                       check (status in ('registered', 'assessing', 'placed', 'enrolled', 'completed', 'withdrawn', 'suspended')),
  email_verified_at    timestamptz,
  -- تنبيه مفتاح المرور: يظهر بعد أول دخول بالبريد حتى يفعّله أو يؤجّله
  passkey_prompted_at  timestamptz,
  passkey_dismissed_at timestamptz,
  last_login_at        timestamptz,
  person_id            uuid,                 -- هوية مشتركة مستقبلية (public.people)
  contact_request_id   text,                 -- إن تحوّل من طلب تواصل MI-LEADERS
  source               text not null default 'self' check (source in ('self', 'admin', 'import', 'contact')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists participants_email_uniq on leaders.participants (lower(email));
create index if not exists participants_status_idx on leaders.participants (status);
create index if not exists participants_org_idx on leaders.participants (organization_id);
create index if not exists participants_person_idx on leaders.participants (person_id) where person_id is not null;

drop trigger if exists participants_touch on leaders.participants;
create trigger participants_touch before update on leaders.participants
  for each row execute function leaders.touch_updated_at();


-- ════════════════════════════════════════════════════════════════
-- 3. الدخول: رابط البريد ورمزه، ثم مفتاح المرور
-- ════════════════════════════════════════════════════════════════
-- رسالة واحدة تحمل رابطًا ورمزًا من 6 أرقام لنفس الطلب؛ أيهما
-- استُخدم أولًا يستهلك الطلب. يُحفظ الهاش فقط، لا الرمز ولا الرابط.

create table if not exists leaders.email_challenges (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  purpose         text not null check (purpose in ('register', 'login')),
  code_hash       text not null,            -- sha256 للرمز مع ملح الخادم
  link_token_hash text not null unique,     -- sha256 لرمز الرابط
  pending_profile jsonb,                    -- بيانات نموذج التسجيل حتى يتحقق البريد
  attempts        smallint not null default 0,
  expires_at      timestamptz not null,
  consumed_at     timestamptz,
  ip              inet,
  created_at      timestamptz not null default now()
);

create index if not exists email_challenges_email_idx
  on leaders.email_challenges (lower(email), created_at desc);

-- جلسة المشارك. التوكن يُعاد للمتصفح مرة واحدة ويُحفظ هاشه فقط.
create table if not exists leaders.auth_sessions (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  token_hash     text not null unique,
  method         text not null check (method in ('email_link', 'email_code', 'passkey')),
  user_agent     text,
  ip             inet,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz
);

create index if not exists auth_sessions_participant_idx on leaders.auth_sessions (participant_id);

-- مفاتيح المرور (WebAuthn). المشارك قد يملك أكثر من مفتاح (جوال وحاسب).
create table if not exists leaders.passkeys (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  credential_id  text not null unique,      -- base64url
  public_key     bytea not null,            -- COSE
  sign_count     bigint not null default 0,
  transports     text[],
  aaguid         text,
  backed_up      boolean not null default false,
  device_label   text check (char_length(device_label) <= 80),
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

create index if not exists passkeys_participant_idx on leaders.passkeys (participant_id);

-- تحديات WebAuthn قصيرة العمر (دقائق). participant_id فارغ عند
-- الدخول بلا اسم مستخدم (discoverable credentials).
create table if not exists leaders.webauthn_challenges (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid references leaders.participants(id) on delete cascade,
  challenge      text not null unique,
  purpose        text not null check (purpose in ('register', 'authenticate')),
  expires_at     timestamptz not null,
  consumed_at    timestamptz,
  created_at     timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════════
-- 4. القياس وتحديد المستوى
-- ════════════════════════════════════════════════════════════════
-- بنك الأسئلة يُبنى من ملفات المشروع ويُدار من اللوحة. كل سؤال ينتمي
-- لبُعد واحد، ونتيجة كل بُعد تحدد مستواه عبر grid_cells.

create table if not exists leaders.instruments (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,          -- مثل baseline-v1
  title_ar    text not null,
  kind        text not null check (kind in ('baseline', 'post', 'final')),
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists leaders.questions (
  id            uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references leaders.instruments(id) on delete cascade,
  dimension     text not null references leaders.dimensions(key),
  code          text not null,               -- M1، I3، L7 …
  text_ar       text not null,
  help_ar       text,
  kind          text not null default 'likert' check (kind in ('likert', 'choice', 'text')),
  options       jsonb,                       -- [{ "label": "...", "score": 0..4 }]
  weight        numeric(5,2) not null default 1,
  sort          smallint not null default 0,
  active        boolean not null default true,
  unique (instrument_id, code)
);

create index if not exists questions_instrument_idx on leaders.questions (instrument_id, dimension, sort);

create table if not exists leaders.assessments (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  instrument_id  uuid not null references leaders.instruments(id),
  status         text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'void')),
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz
);

create index if not exists assessments_participant_idx on leaders.assessments (participant_id, started_at desc);

create table if not exists leaders.assessment_answers (
  assessment_id uuid not null references leaders.assessments(id) on delete cascade,
  question_id   uuid not null references leaders.questions(id),
  value         jsonb not null,
  score         numeric(6,2),
  answered_at   timestamptz not null default now(),
  primary key (assessment_id, question_id)
);

-- نتيجة كل بُعد في قياس واحد (ثلاثة صفوف لكل قياس).
create table if not exists leaders.assessment_results (
  assessment_id uuid not null references leaders.assessments(id) on delete cascade,
  dimension     text not null references leaders.dimensions(key),
  score         numeric(5,2) not null,       -- من 0 إلى 100
  level         text not null references leaders.levels(key),
  primary key (assessment_id, dimension)
);

-- المستوى المعتمد حاليًا لكل بُعد. يقترحه القياس ويعتمده أو يعدّله
-- المستشار. تاريخ التغييرات في audit_log.
create table if not exists leaders.placements (
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  dimension      text not null references leaders.dimensions(key),
  level          text not null references leaders.levels(key),
  source         text not null check (source in ('assessment', 'admin')),
  assessment_id  uuid references leaders.assessments(id) on delete set null,
  decided_by     text,                        -- بريد المدير إن كان المصدر admin
  decided_at     timestamptz not null default now(),
  primary key (participant_id, dimension)
);


-- ════════════════════════════════════════════════════════════════
-- 5. الرحلة
-- ════════════════════════════════════════════════════════════════
-- خطوات كل خلية من الشبكة. رحلة المشارك = خطوات الخلايا الثلاث
-- التي وقع فيها (خلية لكل بُعد)، تُنسخ إلى participant_steps عند الاعتماد.

create table if not exists leaders.step_catalog (
  id             uuid primary key default gen_random_uuid(),
  dimension      text not null references leaders.dimensions(key),
  level          text not null references leaders.levels(key),
  step_no        smallint not null,
  title_ar       text not null,
  description_ar text,
  kind           text not null default 'module'
                 check (kind in ('module', 'workshop', 'coaching', 'consulting', 'assignment', 'assessment')),
  duration_days  smallint,
  active         boolean not null default true,
  unique (dimension, level, step_no)
);

create table if not exists leaders.cohorts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  track       text not null default 'individual' check (track in ('individual', 'institutional')),
  organization_id uuid references leaders.organizations(id) on delete set null,
  starts_on   date,
  ends_on     date,
  capacity    smallint,
  status      text not null default 'planned' check (status in ('planned', 'open', 'running', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists cohorts_touch on leaders.cohorts;
create trigger cohorts_touch before update on leaders.cohorts
  for each row execute function leaders.touch_updated_at();

create table if not exists leaders.enrollments (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  cohort_id      uuid not null references leaders.cohorts(id) on delete restrict,
  status         text not null default 'nominated'
                 check (status in ('nominated', 'accepted', 'active', 'completed', 'withdrawn')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (participant_id, cohort_id)
);

drop trigger if exists enrollments_touch on leaders.enrollments;
create trigger enrollments_touch before update on leaders.enrollments
  for each row execute function leaders.touch_updated_at();

create table if not exists leaders.participant_steps (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  step_id        uuid not null references leaders.step_catalog(id),
  status         text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  due_on         date,
  completed_at   timestamptz,
  note           text,
  unique (participant_id, step_id)
);

create index if not exists participant_steps_participant_idx on leaders.participant_steps (participant_id);

-- جلسات التوجيه والاستشارة (اسمها meetings حتى لا تلتبس بجلسات الدخول).
create table if not exists leaders.meetings (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  kind           text not null check (kind in ('coaching', 'consulting', 'support')),
  consultant     text,
  scheduled_at   timestamptz,
  status         text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled', 'no_show')),
  summary        text,
  created_at     timestamptz not null default now()
);

create index if not exists meetings_participant_idx on leaders.meetings (participant_id, scheduled_at);

create table if not exists leaders.reports (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid references leaders.participants(id) on delete cascade,
  organization_id uuid references leaders.organizations(id) on delete cascade,
  kind            text not null check (kind in ('individual', 'institutional')),
  title_ar        text not null,
  file_path       text,                      -- مسار في Supabase Storage
  issued_at       timestamptz,
  created_at      timestamptz not null default now(),
  check (participant_id is not null or organization_id is not null)
);


-- ════════════════════════════════════════════════════════════════
-- 6. سجل التدقيق
-- ════════════════════════════════════════════════════════════════

create table if not exists leaders.audit_log (
  id          bigint generated always as identity primary key,
  actor_type  text not null check (actor_type in ('admin', 'participant', 'system')),
  actor       text,                          -- بريد المدير أو معرّف المشارك
  action      text not null,                 -- placement.update، participant.create …
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_entity_idx on leaders.audit_log (entity, entity_id, created_at desc);


-- ════════════════════════════════════════════════════════════════
-- 7. الحماية والصلاحيات
-- ════════════════════════════════════════════════════════════════
-- RLS مفعّل بلا سياسات: لا يمر إلا service_role (الذي يتجاوز RLS).

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'leaders' loop
    execute format('alter table leaders.%I enable row level security', t);
  end loop;
end $$;

revoke all on all tables    in schema leaders from public, anon, authenticated;
revoke all on all sequences in schema leaders from public, anon, authenticated;
revoke all on all functions in schema leaders from public, anon, authenticated;

grant all on all tables    in schema leaders to service_role;
grant all on all sequences in schema leaders to service_role;

alter default privileges in schema leaders revoke all on tables    from public, anon, authenticated;
alter default privileges in schema leaders revoke all on functions from public, anon, authenticated;
alter default privileges in schema leaders grant all on tables    to service_role;
alter default privileges in schema leaders grant all on sequences to service_role;

comment on schema leaders is
  'تطبيق القادة (leaders.sunkvalue.com). مستقل عن المصفوفة وSSPDF؛ الوصول عبر leaders-api وadmin-api فقط.';
