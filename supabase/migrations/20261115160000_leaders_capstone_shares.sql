-- deploy-gate: tolerant الدالة تتحمل غياب الجدولين (share.ts): قبلهما تقول لوحة المشاركة إن الميزة لم تُفعَّل بعد، ولا يتعطل شيء
-- ════════════════════════════════════════════════════════════════
-- مشاركة وثيقة المبادرة برابط خاص، وملاحظات من يفتحه (اعتمده المالك 2026-11-15)
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-15-تصور-تصدير-المبادرة-ومشاركتها-v1.md
-- لكل رابط تسميته (لمن أُعطي)، ومدته، وما يُسمح لقارئه: كتابة ملاحظة، وتحميل PDF، ورؤية المستوى والمسار (D18: الافتراضي لا).
-- صاحب الوثيقة يغيّر ذلك متى شاء، ويلغي الرابط فورًا. الرمز لا يُحفظ، بل بصمته (sha-256) كرابط الراعي.
-- الملاحظات خاصة بصاحب الوثيقة: لا يراها قارئ آخر ولا المستشار. اسم كاتبها وصفته كما كتبهما، وبصمة عنوانه للحد من الإغراق لا لتعريفه.
-- لا يقرأ الجدولين إلا دور الخدمة. آمن لإعادة التشغيل. لا تعديل على جدول قائم.

create table if not exists leaders.capstone_shares (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  token_hash text not null unique,
  label text not null check (char_length(label) between 1 and 80),
  allow_notes boolean not null default false,
  allow_download boolean not null default true,
  show_levels boolean not null default false,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  views integer not null default 0,
  last_viewed_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists capstone_shares_participant on leaders.capstone_shares (participant_id, created_at desc);
alter table leaders.capstone_shares enable row level security;
revoke all on leaders.capstone_shares from anon, authenticated;

create table if not exists leaders.capstone_share_notes (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references leaders.capstone_shares(id) on delete cascade,
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 2 and 80),
  author_role text check (author_role is null or char_length(author_role) <= 80),
  section_key text check (section_key is null or char_length(section_key) <= 60),
  body text not null check (char_length(body) between 2 and 2000),
  ip_hash text,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists capstone_share_notes_owner on leaders.capstone_share_notes (participant_id, created_at desc);
create index if not exists capstone_share_notes_share on leaders.capstone_share_notes (share_id, created_at desc);
alter table leaders.capstone_share_notes enable row level security;
revoke all on leaders.capstone_share_notes from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261115160000_leaders_capstone_shares') on conflict do nothing;
