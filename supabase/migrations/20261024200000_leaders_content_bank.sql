-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة: بنك المحتوى ومنهج المسار
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل. يُشغَّل بعد 20261024190000_leaders_programs.
--
-- الرحلة التشغيلية (البرنامج والدفعة) تحدد كيف ومتى. المنهج يحدد ماذا
-- يتعلم صاحب كل مسار من المسارات الـ27، ويتركب وحده من بنك المحتوى:
--   • كل مقطع أو ملف أو رابط يُرفع مرة، ويُوسم لمن هو: للجميع، أو لبُعد
--     من مستوى معين فأعلى، أو لمستوى واحد فقط.
--   • استثناءات اختيارية: مسارات بعينها فقط، أو استبعاد مسارات.
--   • نشاط «منهج المسار» (kind = curriculum) في أي مرحلة يعرض لكل مشارك
--     محتوى مساره هو، ويكتمل بمشاهدته وفتحه فعلًا.
-- أبواب الكتيب تبقى كما هي (نشاط القراءة)؛ البنك لما سواها.

create table if not exists leaders.content_items (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('video', 'file', 'link')),
  title_ar       text not null check (char_length(title_ar) between 1 and 200),
  description_ar text check (char_length(description_ar) <= 2000),
  url            text not null check (url ~ '^https://' and char_length(url) <= 1000),
  minutes        smallint check (minutes is null or minutes between 0 and 600),
  -- الجمهور: بلا بُعد = للجميع. ببُعد: min_level فأعلى، أو only_level وحده.
  dimension      text check (dimension is null or dimension in ('milestone', 'impact', 'leadership')),
  min_level      text check (min_level is null or min_level in ('beginner', 'intermediate', 'advanced')),
  only_level     text check (only_level is null or only_level in ('beginner', 'intermediate', 'advanced')),
  -- استثناءات بمفاتيح المسارات (M1I2L3...)
  track_keys     text[] not null default '{}',
  exclude_tracks text[] not null default '{}',
  required       boolean not null default true,
  min_pct        smallint not null default 90 check (min_pct between 10 and 100),
  sort           int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (not (min_level is not null and only_level is not null)),
  check (dimension is not null or (min_level is null and only_level is null))
);
create index if not exists content_items_order_idx on leaders.content_items (dimension, sort);

-- التقدم لكل مادة: المقاطع المشاهدة للفيديو، ووقت الفتح للملف والرابط
create table if not exists leaders.content_progress (
  participant_id  uuid not null references leaders.participants(id) on delete cascade,
  item_id         uuid not null references leaders.content_items(id) on delete cascade,
  duration        real,
  ranges          jsonb not null default '[]'::jsonb,
  watched_seconds real not null default 0,
  opened_at       timestamptz,
  completed_at    timestamptz,
  last_ping_at    timestamptz,
  primary key (participant_id, item_id)
);

alter table leaders.stage_requirements drop constraint if exists stage_requirements_kind_check;
alter table leaders.stage_requirements add constraint stage_requirements_kind_check
  check (kind in ('check', 'upload', 'form', 'meeting', 'reading', 'auto', 'video', 'workshop', 'coaching', 'curriculum'));

alter table leaders.content_items    enable row level security;
alter table leaders.content_progress enable row level security;
revoke all on leaders.content_items, leaders.content_progress from public, anon, authenticated;
grant all on leaders.content_items, leaders.content_progress to service_role;
