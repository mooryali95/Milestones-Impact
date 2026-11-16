-- ════════════════════════════════════════════════════════════════
-- تعليق الخبير من خارج إطاره: وسم يُحفظ لحظة الكتابة، فلا يتغير إن تغيرت المقاعد بعده
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تكتب out_of_seat إن وُجد العمود، وتحفظ التعليق بلا الوسم إن غاب (master-book.ts)
-- المرحلة 1 من تصور «أجزاء الكتاب وخبير المحتوى» (اعتمده المالك 2026-11-16): مقعد عضو لجنة المحتوى أطره (experts.dimensions)،
-- وتعليقه على باب من إطار آخر يظهر موسومًا «خبير من خارج الإطار». عضو القياس نطاقه الكتاب كله، وتعليق الإدارة لا يُوسم. آمن لإعادة التشغيل.
alter table leaders.book_comments add column if not exists out_of_seat boolean not null default false;

insert into leaders.schema_migrations (name) values ('20261116020000_leaders_book_comment_out_of_seat') on conflict do nothing;
