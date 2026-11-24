-- deploy-gate: tolerant محتوى نماذج فقط (تلميحات وتسميات): الدوال تقبل التاريخ و«الأسبوع N» قبله وبعده (المرحلة 1)
-- ════════════════════════════════════════════════════════════════
-- الزمن النسبي، المرحلة 2: الخانات الزمنية تُكتب بالأسبوع أو بالتاريخ
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-24-تصور-موائمة-نموذج-سفراء-والزمن-النسبي-v2.md (اعتمده المالك 2026-11-24).
-- لا عمود يُضاف ولا يُحذف ولا يُعاد ترتيبه: الإجابات المخزنة صفوف بمواضع أعمدتها، فتبقى كما هي.
-- 1) تلميحات الجدول والمخرجات والدفعات: «الأسبوع 3» أولًا، والتاريخ مقبول.
-- 2) تاريخ البدء في البطاقة اختياري (يحدد لاحقًا)، والانتهاء بالأسبوع أو بالتاريخ.
-- إرخاء لا تشديد: لا يصير حقل مطلوبًا لم يكن، فلا تتغير جاهزية أحد إلى الأسوأ.
-- ما حرّرته الإدارة لا يُمس: كل تعديل مشروط بالقيمة الأصلية. آمن لإعادة التشغيل.

-- restore: update leaders.learning_models m set fields = b.b::jsonb from leaders.backup_20261128_relative_time b where m.key = b.ref
create table if not exists leaders.backup_20261128_relative_time as
  select key ref, fields::text b from leaders.learning_models
   where exists (select 1 from jsonb_array_elements(fields) f where f->>'key' in ('activities', 'deliverables', 'tranches', 'start', 'end'));
alter table leaders.backup_20261128_relative_time enable row level security;

create or replace function pg_temp.patch_if(fkey text, guard_key text, guard_val text, patch jsonb)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(case when f->>'key' = fkey and coalesce(f->>guard_key, '') = guard_val then f || patch else f end order by ord)
                     from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
   where m.fields @> jsonb_build_array(jsonb_build_object('key', fkey));
$f$;

-- 1) الجدول الزمني
select pg_temp.patch_if('activities', 'hint', 'التاريخ بصيغة 2026-03-15، والاعتماديات رموز مفصولة بفاصلة',
  $j${"hint": "البداية والنهاية بالأسبوع من انطلاق المبادرة: «الأسبوع 2» و«الأسبوع 4». التاريخ مقبول أيضًا (2026-03-15). والاعتماديات رموز مفصولة بفاصلة"}$j$::jsonb);
-- المخرجات والدفعات: موعدها بالأسبوع
select pg_temp.patch_if('deliverables', 'hint', '',
  $j${"hint": "الموعد بالأسبوع من انطلاق المبادرة («الأسبوع 6»)، أو بالتاريخ"}$j$::jsonb);
select pg_temp.patch_if('tranches', 'hint', '',
  $j${"hint": "البداية والنهاية بالأسبوع من انطلاق البرنامج («الأسبوع 1» إلى «الأسبوع 20»)، أو بالتاريخ"}$j$::jsonb);

-- 2) البطاقة: البدء اختياري، والانتهاء بالأسبوع أو التاريخ
select pg_temp.patch_if('start', 'hint', 'بصيغة 2026-03-15',
  $j${"label": "تاريخ البدء (اختياري)", "hint": "اتركه فارغًا إن لم يُحدد بعد. إن كتبته (2026-03-15) تُحسب منه أسابيع الجدول تواريخَ", "required": false}$j$::jsonb);
select pg_temp.patch_if('end', 'hint', 'بصيغة 2026-12-31',
  $j${"label": "الانتهاء المستهدف", "hint": "بالأسبوع من الانطلاق («الأسبوع 12»)، أو بالتاريخ (2026-12-31)"}$j$::jsonb);

insert into leaders.schema_migrations (name) values ('20261128110000_leaders_relative_time_hints') on conflict do nothing;
