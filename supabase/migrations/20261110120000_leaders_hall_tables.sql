-- ════════════════════════════════════════════════════════════════
-- طاولات القاعة: رقم الطاولة بجانب الفريق في مقعد المشارك
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تقرأ cohort_roles بـ* وتكتب table_no بمحاولة ثانية بلا العمود (hall.ts: seats وsaveSeats)، فتعمل قبله وبعده
-- لم يُطبَّق على الإنتاج بعد: يطبّقه المالك بسير migrate.yml باسمه (20261110120000_leaders_hall_tables).
-- القاعة بخمسين مشاركًا: فريق من خمسة عشر ليس مجموعة نقاش، فيُقسم كل فريق إلى طاولات من خمسة إلى سبعة.
-- المصدر الواحد: مقعد المشارك في القاعة (فريقه وطاولته) صف واحد في cohort_roles. cohort_groups تبقى لمجموعات
-- المشروع ونمط العمل، فلا يختلط المفهومان (جرد 2026-11-10، يصوّب «الطاولة من cohort_groups» في تصور القاعة v2).
-- قبل تطبيقه تُشتق الطاولات عند كل قراءة ولا تُحفظ، فقد يتغير رقم طاولة مشارك حين يُنقل غيره؛ بعده تثبت.
alter table leaders.cohort_roles add column if not exists table_no smallint;
alter table leaders.cohort_roles drop constraint if exists cohort_roles_table_no_check;
alter table leaders.cohort_roles add constraint cohort_roles_table_no_check check (table_no is null or table_no between 1 and 99);

insert into leaders.schema_migrations (name) values ('20261110120000_leaders_hall_tables') on conflict do nothing;
