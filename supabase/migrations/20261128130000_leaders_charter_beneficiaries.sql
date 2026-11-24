-- deploy-gate: tolerant محتوى نماذج فقط: حقلان اختياريان جديدان، والدوال تقرأ الحقول كما هي في القاعدة قبله وبعده
-- ════════════════════════════════════════════════════════════════
-- بطاقة المبادرة: المستفيدون وعددهم، والوصول إليهم واختيارهم (من نموذج سفراء)
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-24-تصور-موائمة-نموذج-سفراء-والزمن-النسبي-v2.md (اعتمده المالك 2026-11-24)، المرحلة 3.
-- نموذج المنصة هو الأصل، ويأخذ من سفراء أقوى بنديه اللذين لا مقابل لهما في البطاقة:
--   beneficiaries: من سيستفيد مباشرة، وكم عددهم دون تكرار الشخص نفسه.
--   reach: كيف تصل إليهم، وكيف تختار إن زاد العدد عن قدرتك.
-- الفريق والشركاء لا يُضافان هنا: مصدرهما فصل الحوكمة وخريطة أصحاب المصلحة (مصدر واحد لكل معلومة).
-- وقياس النجاح مصدره سجل المنافع (المؤشر وخط الأساس والمستهدف)، فلا يُكرر في البطاقة.
-- الحقلان اختياريان لكل المستويات: لا يتغير اكتمال فصل ولا جاهزية أحد (لا أثر على من يعمل حاليًا).
-- يُدرجان بعد «المشكلة أو الفرصة» مرة واحدة، ولا يُمس ما حرّرته الإدارة. آمن لإعادة التشغيل.

-- restore: update leaders.learning_models m set fields = b.b::jsonb from leaders.backup_20261128_charter_beneficiaries b where m.key = b.ref
create table if not exists leaders.backup_20261128_charter_beneficiaries as
  select key ref, fields::text b from leaders.learning_models where key = 'initiative-charter';
alter table leaders.backup_20261128_charter_beneficiaries enable row level security;

update leaders.learning_models m
   set fields = (
     select jsonb_agg(f order by ord)
       from (
         select e.f, e.ord * 10 as ord from jsonb_array_elements(m.fields) with ordinality as e(f, ord)
         union all
         select x.f, (select p.ord * 10 + x.k from jsonb_array_elements(m.fields) with ordinality as p(f, ord) where p.f->>'key' = 'problem')
           from (values
             (1, $j${"key": "beneficiaries", "label": "من سيستفيد مباشرة، وكم عددهم؟", "type": "textarea", "required": false,
                    "hint": "صفتهم، وعددهم المتوقع دون تكرار الشخص نفسه. مثال: 20 طالبًا من المرحلة الثانوية في الحي. «تقدير أولي» مقبول"}$j$::jsonb),
             (2, $j${"key": "reach", "label": "كيف تصل إليهم، وكيف تختار إن زاد العدد عن قدرتك؟", "type": "textarea", "required": false,
                    "hint": "طريقة الدعوة أو التواصل، ومعيار الاختيار. مثال: التنسيق مع مدرسة لدعوة الطلاب، ثم الأولوية لمن لا خطة لديه"}$j$::jsonb)
           ) as x(k, f)
       ) all_f
   )
 where m.key = 'initiative-charter'
   and m.fields @> '[{"key": "problem"}]'::jsonb
   and not m.fields @> '[{"key": "beneficiaries"}]'::jsonb;

insert into leaders.schema_migrations (name) values ('20261128130000_leaders_charter_beneficiaries') on conflict do nothing;
