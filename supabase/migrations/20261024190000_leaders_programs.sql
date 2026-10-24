-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة: البرامج (القوالب) ونسخها، والدفعات
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل. يُشغَّل بعد 20261024170000_leaders_activity_modes.
--
-- ثلاث طبقات لا تتداخل:
--   • البرنامج: ماذا يمر به القائد. المراحل والمتطلبات وإعداد كل نشاط.
--     يُبنى مرة، ويُحفظ بنسخ مرقمة تُسترجع متى شئت.
--   • الدفعة: كيف ومتى ولمن. الجهة، والبرنامج، والنسخة المثبتة، والتواريخ،
--     وطريقة التنفيذ لكل نشاط (حضوري أو أونلاين، وطريقة إثبات الحضور).
--   • المشارك: يتبع دفعته؛ صراحة بالتسجيل، أو تلقائيًا بدفعة جهته الجارية،
--     أو بالدفعة المفتوحة الافتراضية لمن ليس له جهة.
-- المراحل والمتطلبات القائمة تصبح «البرنامج الافتراضي» كما هي، والدفعة
-- الافتراضية تتبع آخر تعديل، فلا يتغير شيء على أي مشارك.

-- ── 1. البرامج ──
create table if not exists leaders.programs (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 120),
  description_ar text check (char_length(description_ar) <= 2000),
  is_default     boolean not null default false,
  archived_at    timestamptz,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (not (is_default and archived_at is not null))
);
create unique index if not exists programs_one_default on leaders.programs ((true)) where is_default;

insert into leaders.programs (name, description_ar, is_default)
select 'برنامج القادة', 'البرنامج الأساسي. يسري على كل من ليس في دفعة برنامج آخر.', true
where not exists (select 1 from leaders.programs where is_default);

-- ── 2. المراحل والمتطلبات تنتمي إلى برنامج ──
alter table leaders.journey_stages     add column if not exists program_id uuid references leaders.programs(id) on delete cascade;
alter table leaders.stage_requirements add column if not exists program_id uuid references leaders.programs(id) on delete cascade;
update leaders.journey_stages     set program_id = (select id from leaders.programs where is_default) where program_id is null;
update leaders.stage_requirements set program_id = (select id from leaders.programs where is_default) where program_id is null;
alter table leaders.journey_stages     alter column program_id set not null;
alter table leaders.stage_requirements alter column program_id set not null;

-- مفتاح المرحلة صار (البرنامج، المفتاح)، فيتكرر profile وtraining في كل برنامج.
-- تُزال المراجع القديمة إلى المفتاح وحده، ثم يُربط المتطلب بمرحلة برنامجه.
do $$
declare c record;
begin
  for c in select conname, conrelid::regclass as tbl from pg_constraint
           where contype = 'f' and confrelid = 'leaders.journey_stages'::regclass
             and array_length(conkey, 1) = 1 loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
  if exists (select 1 from pg_constraint where conname = 'journey_stages_pkey'
             and conrelid = 'leaders.journey_stages'::regclass and array_length(conkey, 1) = 1) then
    alter table leaders.journey_stages drop constraint journey_stages_pkey;
    alter table leaders.journey_stages add constraint journey_stages_pkey primary key (program_id, key);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stage_requirements_stage_fk') then
    alter table leaders.stage_requirements add constraint stage_requirements_stage_fk
      foreign key (program_id, stage_key) references leaders.journey_stages (program_id, key) on update cascade on delete cascade;
  end if;
  -- رمز المتطلب فريد داخل البرنامج، فتحمل النسخة المكررة الرموز نفسها
  for c in select conname from pg_constraint
           where contype = 'u' and conrelid = 'leaders.stage_requirements'::regclass and array_length(conkey, 1) = 1 loop
    execute format('alter table leaders.stage_requirements drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'stage_requirements_program_code_key') then
    alter table leaders.stage_requirements add constraint stage_requirements_program_code_key unique (program_id, code);
  end if;
end $$;

create index if not exists stage_requirements_program_idx on leaders.stage_requirements (program_id, stage_key, sort);

-- ── 3. نسخ البرنامج ──
-- لقطة كاملة (المراحل والمتطلبات بمعرفاتها) لا تتغير بعد حفظها. معرف المتطلب
-- ثابت بين النسخ، فتقدم المشارك وأدلته تبقى معه إن رُقّيت دفعته.
create table if not exists leaders.program_versions (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references leaders.programs(id) on delete cascade,
  number     int not null check (number > 0),
  label      text not null check (char_length(label) between 1 and 160),
  data       jsonb not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (program_id, number)
);

-- ── 4. الدفعات ──
-- جدول cohorts موجود منذ البداية؛ يُكمَّل هنا.
alter table leaders.cohorts add column if not exists program_id         uuid references leaders.programs(id) on delete restrict;
alter table leaders.cohorts add column if not exists program_version_id uuid references leaders.program_versions(id) on delete set null;
alter table leaders.cohorts add column if not exists is_default         boolean not null default false;
-- طريقة التنفيذ لكل نشاط في هذه الدفعة: { "<رمز المتطلب>": { "mode": "online", "verify": "join" } }
alter table leaders.cohorts add column if not exists delivery           jsonb not null default '{}'::jsonb;
alter table leaders.cohorts add column if not exists notes_ar           text check (char_length(notes_ar) <= 2000);
update leaders.cohorts set program_id = (select id from leaders.programs where is_default) where program_id is null;
alter table leaders.cohorts alter column program_id set not null;
create unique index if not exists cohorts_one_default on leaders.cohorts ((true)) where is_default;
create index if not exists cohorts_org_idx on leaders.cohorts (organization_id, status);

insert into leaders.cohorts (name, program_id, is_default, status)
select 'الدفعة المفتوحة', (select id from leaders.programs where is_default), true, 'running'
where not exists (select 1 from leaders.cohorts where is_default);

-- الطريقة المعتادة للجهة، تُقترح لكل دفعة جديدة لها
alter table leaders.organizations add column if not exists delivery_default text
  check (delivery_default is null or delivery_default in ('in_person', 'online'));

-- جلسات الورش تخص دفعة؛ الفارغ يسري على كل الدفعات (السلوك الحالي)
alter table leaders.workshop_sessions add column if not exists cohort_id uuid references leaders.cohorts(id) on delete cascade;
create index if not exists workshop_sessions_cohort_idx on leaders.workshop_sessions (cohort_id);

-- ── الحماية ──
alter table leaders.programs         enable row level security;
alter table leaders.program_versions enable row level security;
revoke all on leaders.programs, leaders.program_versions from public, anon, authenticated;
grant all on leaders.programs, leaders.program_versions to service_role;
