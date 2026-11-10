-- ════════════════════════════════════════════════════════════════
-- طلبات حذف البيانات من المشارك نفسه (خدمة ذاتية، بوابة م4)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تتحمل غياب الجدول (privacy.ts: pendingErase وcloseOnDelete وpendingList)، فقبله يُعرض للمشارك بريد التواصل بدل الطلب، والتصدير يعمل قبله وبعده
-- لم يُطبَّق على الإنتاج بعد: يطبّقه المالك بسير migrate.yml باسمه (20261110150000_leaders_erasure_requests).
-- سطر لكل طلب: قائم حتى ينفذه المدير العام بمسار الحذف القائم (فيصير done) أو يسحبه صاحبه (cancelled) أو يُرفض بسببه.
-- صف المشارك يُحذف عند التنفيذ فيصير participant_id فارغًا ويبقى أثر الطلب وتاريخه دليلًا على الالتزام بالمهلة.
-- لا يقرؤه إلا دور الخدمة. آمن لإعادة التشغيل.
create table if not exists leaders.erasure_requests (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references leaders.participants (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled', 'rejected')),
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text check (decided_by is null or char_length(decided_by) <= 200),
  note text check (note is null or char_length(note) <= 1000)
);
-- طلب قائم واحد لكل مشارك
create unique index if not exists erasure_requests_one_pending on leaders.erasure_requests (participant_id) where status = 'pending';
create index if not exists erasure_requests_status on leaders.erasure_requests (status, created_at);
alter table leaders.erasure_requests enable row level security;
revoke all on leaders.erasure_requests from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261110150000_leaders_erasure_requests') on conflict do nothing;
