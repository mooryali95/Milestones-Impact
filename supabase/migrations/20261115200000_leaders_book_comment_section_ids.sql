-- ════════════════════════════════════════════════════════════════
-- تعليقات الكتاب الأم بهوية القسم: يتبع التعليق قسمه إن تغيّر عنوانه
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تكتب section_id إن وُجد العمود، وتقرأ التعليق بعنوانه المحفوظ إن غاب (master-book.ts)
-- المرحلة 2 من «الكتاب الأم»: section_id هوية القسم من سجل الأقسام (supabase/content/handbook/sections.json).
-- section يبقى عنوان القسم وقت التعليق، وsection_id يقود إلى عنوانه الحالي. فارغ للباب كله وللمسودات. آمن لإعادة التشغيل.
alter table leaders.book_comments add column if not exists section_id text check (section_id is null or section_id ~ '^[MIL]-[A-Z0-9]{2,10}-[0-9]{2,3}$');

insert into leaders.schema_migrations (name) values ('20261115200000_leaders_book_comment_section_ids') on conflict do nothing;
