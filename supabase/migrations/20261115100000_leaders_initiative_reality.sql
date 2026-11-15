-- deploy-gate: tolerant محتوى نماذج فقط: حقول اختيارية تُضاف إلى بطاقة المبادرة، والدوال تقرأ الحقول كما هي في القاعدة
-- ════════════════════════════════════════════════════════════════
-- اختبار الواقعية في بطاقة المبادرة (مرافق بناء المبادرة 4ج)
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md (اعتمده المالك). الغاية أن يخرج كل مشارك بمبادرة
-- ينفذها فعلًا: حقيقية، أو افتراضية واقعية في سياق جهته، ولها خطوة أولى خلال 30 يومًا ومن يشغّلها بعد انتهائها.
-- الحقول اختيارية عمدًا: بطاقة اعتمدها المستشار مقفلة، وحقل إلزامي جديد كان سيحرم صاحبها من تسليم وثيقته.
-- تظهر في الوثيقة وفي صفحة الميثاق المولّدة، ويراها المستشار عند اعتماد البطاقة.
-- لا تُضاف إلا إن غابت، ولا يُمس ما حرّرته الإدارة. آمن لإعادة التشغيل.

create or replace function pg_temp.add_field(mkey text, field jsonb)
returns void language sql as $f$
  update leaders.learning_models m set fields = m.fields || jsonb_build_array(field)
   where m.key = mkey and not m.fields @> jsonb_build_array(jsonb_build_object('key', field->>'key'));
$f$;

select pg_temp.add_field('initiative-charter', $j${"key": "reality", "label": "هل المشكلة قائمة في جهتك اليوم؟", "type": "select", "options": ["نعم، قائمة وأراها", "افتراضية لكنها واقعية في سياق جهتي"], "hint": "المبادرة الافتراضية مقبولة إن كانت واقعية في سياق جهتك وتستطيع تنفيذها", "required": false}$j$::jsonb);
select pg_temp.add_field('initiative-charter', $j${"key": "first_step", "label": "خطوتك الأولى خلال 30 يومًا: ما هي، ومع من", "type": "textarea", "hint": "خطوة تستطيعها دون إذن جديد، مثل: اجتماع مع مالك البيانات لاستخراج أرقام الربع الماضي", "required": false}$j$::jsonb);
select pg_temp.add_field('initiative-charter', $j${"key": "operator", "label": "من سيشغّل الحل بعد انتهاء المبادرة؟", "type": "text", "hint": "المنصب أو الإدارة، لا اسم شخص", "required": false}$j$::jsonb);

insert into leaders.schema_migrations (name) values ('20261115100000_leaders_initiative_reality') on conflict do nothing;
