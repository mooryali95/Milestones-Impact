-- ════════════════════════════════════════════════════════════════
-- الجلسة الجماعية مع المستشار: جدول coaching_groups وعمودا الربط في coaching_sessions (تصور تشغيل الدفعة 2026-11-19، المرحلة 5)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله تقول اللوحة «غير مفعّل بعد» وتُرفض كتابة الجلسة الجماعية بـnot_migrated، والجلسات الفردية وحجزها وتذكيرها وحساب الخبير كما كانت (coaching-groups.ts: groupsReady وgroupCols، وكل قراءة تعمل بلا العمودين)
-- كيان واحد للجلسة الجماعية (القرار 8: ساعات المستشار وتكلفته مرة واحدة أيًا كان العدد)، وتحته صف لكل مشارك في
-- coaching_sessions القائم (group_id)، فالرصيد والتذكير والغياب تعمل لكل مشارك بلا قاعدة ثانية.
-- off_allowance على صف المشارك: خانة «لا تُحسب من الرصيد» (القرار 7). فارغ = تُحسب كما كانت كل الصفوف القائمة.
-- حذف الجلسة الجماعية يحذف صفوفها (لا تصير فردية فتتضاعف ساعات المستشار)، وحذف الدفعة أو الخبير يفرغ العمود ولا يحذف الجلسة.
-- صف الجلسة الجماعية بلا معرّف حجز خارجي أبدًا (القيد أدناه)، فمسار webhook منصة الحجز (upsert بـexternal_id) لا يصل إليه.
-- عضو واحد مرة واحدة في الجلسة (الفهرس الفريد): إعادة المحاولة لا تضيفه مرتين.
-- أعمدة فارغة بلا قيمة افتراضية على جدول قائم: لا إعادة كتابة للجدول، والدوال قبله لا تقرؤها. آمن لإعادة التشغيل.

create table if not exists leaders.coaching_groups (
  id               uuid primary key default gen_random_uuid(),
  cohort_id        uuid references leaders.cohorts (id) on delete set null,
  requirement_id   uuid not null references leaders.stage_requirements (id) on delete cascade,
  expert_id        uuid references leaders.experts (id) on delete set null,
  title_ar         text not null check (char_length(title_ar) between 1 and 200),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  mode             text not null default 'online' check (mode in ('online', 'in_person')),
  location_ar      text check (char_length(location_ar) <= 300),
  join_url         text check (char_length(join_url) <= 500),
  counts_allowance boolean not null default true,
  status           text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_by       text,
  cancelled_by     text,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint coaching_groups_window_check check (ends_at > starts_at)
);
create index if not exists coaching_groups_cohort_idx on leaders.coaching_groups (cohort_id, starts_at);
create index if not exists coaching_groups_expert_idx on leaders.coaching_groups (expert_id, starts_at) where expert_id is not null;

alter table leaders.coaching_sessions add column if not exists group_id uuid references leaders.coaching_groups (id) on delete cascade;
alter table leaders.coaching_sessions add column if not exists off_allowance boolean;
create unique index if not exists coaching_sessions_group_member_uidx on leaders.coaching_sessions (group_id, participant_id) where group_id is not null;
alter table leaders.coaching_sessions drop constraint if exists coaching_sessions_group_no_external_check;
alter table leaders.coaching_sessions add constraint coaching_sessions_group_no_external_check check (group_id is null or external_id is null) not valid;
alter table leaders.coaching_sessions validate constraint coaching_sessions_group_no_external_check;

alter table leaders.coaching_groups enable row level security;
revoke all on leaders.coaching_groups from public, anon, authenticated;
grant all on leaders.coaching_groups to service_role;

insert into leaders.schema_migrations (name) values ('20261121100000_leaders_coaching_groups') on conflict do nothing;
