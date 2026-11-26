-- deploy-gate: tolerant محتوى نماذج فقط، كالترحيل 20261129140000: خاصيتان لا تقرؤهما الدوال الأقدم، فتعرض الجدول كاملًا.
-- ════════════════════════════════════════════════════════════════
-- تخفيف وثيقة المبادرة للتأسيسي: سجل المنافع، الجدول الثاني عشر
-- ════════════════════════════════════════════════════════════════
-- الترحيل 20261129140000 اشترط لسجل المنافع 6 أعمدة، والجدول في المستودع والإنتاج 8 منذ 20261030150000
-- (أضاف «تاريخ التحقق» و«تكرار القياس» في آخره)، فتخطاه. أظهره scripts/db/verify-beginner-columns-detail.sql.
-- الأعمدة الأربعة الأولى لم تتغير، فالخاصية نفسها المعتمدة في التصور §5 تنطبق كما هي. الشرط هنا بأسماء الأعمدة
-- الأربعة لا بعددها، فلا يمس جدولًا أعادت الإدارة صياغة أوله. آمن لإعادة التشغيل.
-- restore: update leaders.learning_models m set fields = b.b::jsonb from leaders.backup_20261130_beginner_benefits b where m.key = b.ref
create table if not exists leaders.backup_20261130_beginner_benefits as
  select key ref, fields::text b from leaders.learning_models where key = 'benefits-register';
alter table leaders.backup_20261130_beginner_benefits enable row level security;
revoke all on leaders.backup_20261130_beginner_benefits from anon, authenticated;

update leaders.learning_models m
   set fields = (select jsonb_agg(case
       when f->>'key' = 'benefits' and f->>'type' = 'table' and not (f ? 'columns_beginner')
        and f->'columns'->>0 = 'المنفعة' and f->'columns'->>2 = 'خط الأساس' and f->'columns'->>3 = 'المستهدف'
       then f || '{"columns_beginner": [0, 1, 2, 3], "labels_beginner": ["المنفعة", "كيف تقيسها", "الرقم اليوم", "المستهدف"], "min_rows_beginner": 2}'::jsonb
       else f end order by ord) from jsonb_array_elements(m.fields) with ordinality e(f, ord))
 where m.key = 'benefits-register'
   and exists (select 1 from jsonb_array_elements(m.fields) f
                where f->>'key' = 'benefits' and f->>'type' = 'table' and not (f ? 'columns_beginner')
                  and f->'columns'->>0 = 'المنفعة' and f->'columns'->>2 = 'خط الأساس' and f->'columns'->>3 = 'المستهدف');

insert into leaders.schema_migrations (name) values ('20261130000000_leaders_beginner_benefits') on conflict do nothing;
