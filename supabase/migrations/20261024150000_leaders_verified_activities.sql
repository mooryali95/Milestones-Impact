-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة: أنشطة موثقة بدل التأشير اليدوي
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل. يُشغَّل بعد leaders-011.
--
-- كل متطلب في الرحلة له نوع، وصار لبعض الأنواع دليل يجمعه النظام نفسه:
--   reading   قراءة أبواب الكتاب: وقت قراءة فعلي لكل جزء من الباب، واختبار الباب
--   video     فيديو: المقاطع المشاهدة فعلًا، فالتقديم السريع لا يُحتسب
--   workshop  ورشة حضورية: تسجيل الحضور بمسح رمز QR متغير يعرضه المدرب
--   coaching  جلسات توجيه: حجز عبر Cal.com أو Calendly، أو اتصال فوري، ويؤكد الموجّه الحضور
-- إعداد كل نشاط في config (jsonb) ويُحرَّر من لوحة الإدارة.

-- ── 1. أنواع المتطلبات وإعدادها ──
alter table leaders.stage_requirements drop constraint if exists stage_requirements_kind_check;
alter table leaders.stage_requirements add constraint stage_requirements_kind_check
  check (kind in ('check', 'upload', 'form', 'meeting', 'reading', 'auto', 'video', 'workshop', 'coaching'));
alter table leaders.stage_requirements add column if not exists config jsonb not null default '{}'::jsonb;

-- ── 2. قراءة الكتاب ──
-- الباب صفحة طويلة تُقسم إلى شرائح متساوية؛ لكل شريحة ثوانٍ قضاها القارئ
-- وهي أمامه والنافذة ظاهرة وهو نشط. words من نص الباب المصفّى بمستواه.
create table if not exists leaders.reading_progress (
  participant_id  uuid not null references leaders.participants(id) on delete cascade,
  module_id       uuid not null references leaders.handbook_modules(id) on delete cascade,
  words           integer not null default 0,
  active_seconds  integer not null default 0,
  slices          smallint[] not null default '{}',
  first_at        timestamptz not null default now(),
  last_ping_at    timestamptz,
  primary key (participant_id, module_id)
);

-- ── 3. الفيديو ──
-- ranges: مقاطع مشاهدة مدمجة [[من، إلى]، ...] بالثواني.
create table if not exists leaders.video_progress (
  participant_id  uuid not null references leaders.participants(id) on delete cascade,
  requirement_id  uuid not null references leaders.stage_requirements(id) on delete cascade,
  duration        numeric not null default 0,
  ranges          jsonb not null default '[]'::jsonb,
  watched_seconds numeric not null default 0,
  last_ping_at    timestamptz,
  completed_at    timestamptz,
  primary key (participant_id, requirement_id)
);

-- ── 4. الورش الحضورية ──
-- secret يولده الخادم ويُشتق منه رمز QR يتغير كل 30 ثانية، ولا يغادر الخادم.
create table if not exists leaders.workshop_sessions (
  id             uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references leaders.stage_requirements(id) on delete cascade,
  title_ar       text not null check (char_length(title_ar) <= 200),
  location_ar    text check (char_length(location_ar) <= 300),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  secret         text not null,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists workshop_sessions_req_idx on leaders.workshop_sessions (requirement_id, starts_at);

create table if not exists leaders.workshop_attendance (
  session_id     uuid not null references leaders.workshop_sessions(id) on delete cascade,
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  checked_in_at  timestamptz not null default now(),
  method         text not null check (method in ('qr', 'manual')),
  recorded_by    text,
  ip             inet,
  user_agent     text,
  primary key (session_id, participant_id)
);
create index if not exists workshop_attendance_participant_idx on leaders.workshop_attendance (participant_id);

-- ── 5. جلسات التوجيه ──
-- booked: حجز من منصة المواعيد (external_id من webhook). instant: اتصال فوري.
-- لا تُحتسب الجلسة إلا حين يؤكد الموجّه حضورها (attended).
create table if not exists leaders.coaching_sessions (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  requirement_id uuid not null references leaders.stage_requirements(id) on delete cascade,
  kind           text not null check (kind in ('booked', 'instant', 'manual')),
  provider       text check (provider in ('calcom', 'calendly', 'instant', 'manual')),
  external_id    text unique,
  starts_at      timestamptz,
  ends_at        timestamptz,
  join_url       text,
  status         text not null default 'booked'
                 check (status in ('requested', 'booked', 'attended', 'no_show', 'cancelled')),
  coach          text,
  note           text check (char_length(note) <= 2000),
  confirmed_by   text,
  confirmed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists coaching_sessions_participant_idx on leaders.coaching_sessions (participant_id, requirement_id);
create index if not exists coaching_sessions_status_idx on leaders.coaching_sessions (status, starts_at);

-- ── 6. تحويل البنود القائمة إلى أنشطة موثقة ──
-- فقط حيث بقي البند كما زُرع، فلا يُلغى تعديل من اللوحة.
update leaders.stage_requirements set kind = 'workshop', needs_review = false,
  config = '{"sessions_required": 4}'::jsonb,
  help_ar = 'امسح رمز الحضور الذي يعرضه المدرب في بداية كل يوم بكاميرا جوالك.'
  where code = 'T-ATTEND' and kind = 'check' and config = '{}'::jsonb;

update leaders.stage_requirements set config = '{"scope": "all", "quiz": true}'::jsonb,
  help_ar = 'اقرأ أبواب كتابك كاملة وأجب عن أسئلة كل باب. يُحتسب الباب حين تقرؤه فعلًا لا حين تتصفحه.'
  where code = 'T-HB' and kind = 'reading' and config = '{}'::jsonb;
update leaders.stage_requirements set config = '{"scope": "first", "quiz": true}'::jsonb
  where code = 'T-PRE' and kind = 'reading' and config = '{}'::jsonb;

update leaders.stage_requirements r set kind = 'coaching', config = v.cfg::jsonb
from (values
  ('O-SESS', '{"sessions_required": 4, "minutes": 60}'),
  ('C-MEET', '{"sessions_required": 1, "minutes": 90}'),
  ('L-SESS', '{"sessions_required": 3, "minutes": 60}'),
  ('S-CHECK', '{"sessions_required": 3, "minutes": 45}'),
  ('AP-INT', '{"sessions_required": 1, "minutes": 20}')
) as v(c, cfg)
where r.code = v.c and r.kind = 'meeting' and r.config = '{}'::jsonb;

-- ── الحماية ──
alter table leaders.reading_progress    enable row level security;
alter table leaders.video_progress      enable row level security;
alter table leaders.workshop_sessions   enable row level security;
alter table leaders.workshop_attendance enable row level security;
alter table leaders.coaching_sessions   enable row level security;

revoke all on leaders.reading_progress, leaders.video_progress, leaders.workshop_sessions,
  leaders.workshop_attendance, leaders.coaching_sessions from public, anon, authenticated;
grant all on leaders.reading_progress, leaders.video_progress, leaders.workshop_sessions,
  leaders.workshop_attendance, leaders.coaching_sessions to service_role;
