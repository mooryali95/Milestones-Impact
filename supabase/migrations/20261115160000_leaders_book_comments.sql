-- ════════════════════════════════════════════════════════════════
-- تعليقات الكتاب الأم: الخبراء والإدارة يعلّقون على قسم من باب بعينه
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant القارئ يعرض الكتاب بلا تعليقات إن غاب الجدول (master-book.ts: commentRows يرجع null فتُعرض قائمة فارغة)، والتعليق يُرفض برسالة
-- المرحلة 1 من تصور «الكتاب الأم» (اعتمده المالك 2026-11-15).
-- module_id: الباب، وsection: عنوان القسم (## في المتن) أو فارغ للباب كله، وquote: النص المحدد إن وُجد.
-- fingerprint: بصمة الباب وقت التعليق (sha256 للمتن والاختبار والتأمل)، فيُعرف أن التعليق على نص تغيّر بعده.
-- author_kind: expert (من لجنتي المحتوى والقياس) أو admin. author_ref: معرّف الخبير أو بريد المدير.
-- parent_id: الرد على تعليق. status: open أو resolved، والحسم للإدارة وحدها.
-- لا يقرؤه إلا دور الخدمة عبر leaders-api. آمن لإعادة التشغيل.
create table if not exists leaders.book_comments (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references leaders.handbook_modules(id) on delete cascade,
  section text not null default '' check (char_length(section) <= 200),
  quote text not null default '' check (char_length(quote) <= 600),
  body text not null check (char_length(body) between 2 and 4000),
  fingerprint text not null default '',
  author_kind text not null check (author_kind in ('expert', 'admin')),
  author_ref text not null,
  author_name text not null default '',
  author_role text not null default '',
  parent_id uuid references leaders.book_comments(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by text,
  resolved_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists book_comments_module_idx on leaders.book_comments (module_id, created_at);
create index if not exists book_comments_parent_idx on leaders.book_comments (parent_id);
alter table leaders.book_comments enable row level security;
revoke all on leaders.book_comments from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261115160000_leaders_book_comments') on conflict do nothing;
