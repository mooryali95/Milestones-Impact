-- ════════════════════════════════════════════════════════════════
-- مقترحات تعديل الكتاب الأم: التعديل على قسم من باب يمر بالمراجعة والاعتماد قبل أن يدخل إصدارًا
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله يُقرأ الكتاب بلا مقترحات (book-proposals.ts: proposalRows يرجع null)، والاقتراح يُرفض برسالة
-- المرحلة 4 (الخطوة 1) من تصور «الكتاب الأم» (اعتمدها المالك 2026-11-15).
-- section: مفتاح القسم وقت الاقتراح (headingsOf)، وsection_id هويته الثابتة من sections.json، فيتبع المقترح قسمه إن تغيّر عنوانه.
-- base_md: نص القسم كما كان وقت الاقتراح، فيُعرف أن القسم تغيّر بعده (متقادم) ولا يُعتمد حتى يُحدَّث.
-- status: draft ← review ← approved | rejected، وwithdrawn بيد كاتبه، وreleased حين يدخل إصدارًا (الخطوة 2).
-- الاعتماد والرد للمدير العام وحده (decided_by). لا يقرؤه إلا دور الخدمة عبر leaders-api. آمن لإعادة التشغيل.
create table if not exists leaders.book_proposals (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references leaders.handbook_modules(id) on delete cascade,
  section text not null default '' check (char_length(section) <= 200),
  section_id text,
  base_md text not null default '',
  proposed_md text not null check (char_length(proposed_md) between 1 and 20000),
  reason text not null check (char_length(reason) between 10 and 2000),
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'rejected', 'withdrawn', 'released')),
  author_ref text not null,
  author_name text not null default '',
  decided_by text,
  decided_at timestamptz,
  decision_note text not null default '' check (char_length(decision_note) <= 2000),
  release_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists book_proposals_module_idx on leaders.book_proposals (module_id, status);
create index if not exists book_proposals_status_idx on leaders.book_proposals (status, updated_at desc);
alter table leaders.book_proposals enable row level security;
revoke all on leaders.book_proposals from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261116000000_leaders_book_proposals') on conflict do nothing;
