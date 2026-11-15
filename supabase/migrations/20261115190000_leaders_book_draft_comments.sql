-- ════════════════════════════════════════════════════════════════
-- تعليقات مسودات الكتاب الأم: التعليق على باب من الكتاب أو على مسودة معروضة على اللجنة
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله تُقرأ المسودة في الكتاب الأم ويُرفض التعليق عليها برسالة (master-book.ts)، وتعليقات الأبواب كما هي
-- draft_key: مفتاح المسودة في master-book-drafts.js (مولّد من وثيقتها في docs/content). التعليق على باب أو على مسودة، لا الاثنين.
-- آمن لإعادة التشغيل.
alter table leaders.book_comments alter column module_id drop not null;
alter table leaders.book_comments add column if not exists draft_key text check (draft_key is null or draft_key ~ '^[a-z0-9-]{2,60}$');
alter table leaders.book_comments drop constraint if exists book_comments_target;
alter table leaders.book_comments add constraint book_comments_target check (num_nonnulls(module_id, draft_key) = 1);
create index if not exists book_comments_draft_idx on leaders.book_comments (draft_key, created_at) where draft_key is not null;

insert into leaders.schema_migrations (name) values ('20261115190000_leaders_book_draft_comments') on conflict do nothing;
