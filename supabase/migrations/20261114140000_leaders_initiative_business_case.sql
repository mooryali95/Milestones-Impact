-- deploy-gate: tolerant محتوى نماذج فقط: الدوال تقرأ النماذج كما هي في القاعدة، وفحص فصل الشراء يُطبَّق متى وُجد الفصل
-- ════════════════════════════════════════════════════════════════
-- بناء المبادرة: المبرر والتكلفة للتأسيسي، والراعي توضيح لا شرط، وفصل الشراء والتعاقد
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-14-تصور-بناء-المبادرة-وحالة-العمل-v1.md (اعتمده المالك 2026-11-14، الخيار ج).
-- 1) «المبرر والبدائل» و«الموارد والتكلفة» يعودان للتأسيسي بنسخة بسيطة وتوضيحات: لا مشروع بلا مبرر ولا موازنة.
--    الحقول التحليلية الثقيلة تبقى بمستواها (معايير المقارنة للمتقدم، والاسترداد للمتقدم).
-- 2) المبادرة في البرنامج قد تكون افتراضية: الراعي توضيح لدوره في هيكل المبادرة، لا اسم شخص ولا بريد إلزامي.
-- 3) فصل «الشراء والتعاقد» (البعد التجاري في حالة العمل): سؤال واحد لمن لا شراء في مبادرته.
-- 4) سؤال مبرر الاستمرار في ورقة البوابة يحيل إلى حالة العمل.
-- ما حرّرته الإدارة لا يُمس: كل تعديل مشروط بالقيمة الأصلية، وكل إضافة لا تقع إلا إن غابت. آمن لإعادة التشغيل.

-- نسخة لما يتغير، تُؤخذ مرة واحدة قبل أول تشغيل
create table if not exists leaders.backup_20261114_business_case as
  select 'model' kind, key ref, min_level a, title_ar || E'\n||\n' || coalesce(steps_ar, '') || E'\n||\n' || fields::text b
    from leaders.learning_models where key in ('options-analysis', 'cost-plan', 'initiative-charter', 'stage-gate')
  union all select 'req', code, null, coalesce(help_ar, '') from leaders.stage_requirements where code in ('CP-CARD', 'CP-FINAL');
alter table leaders.backup_20261114_business_case enable row level security;

-- يغيّر خصائص حقل بمفتاحه، بشرط أن تكون خاصية الحراسة على قيمتها الأصلية
create or replace function pg_temp.patch_if(mkey text, fkey text, guard_key text, guard_val text, patch jsonb, drop_keys text[] default '{}')
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(case when f->>'key' = fkey and coalesce(f->>guard_key, '') = guard_val then (f || patch) - drop_keys else f end order by ord)
                     from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
   where m.key = mkey and m.fields @> jsonb_build_array(jsonb_build_object('key', fkey));
$f$;

-- ════════════ 1) المبرر والبدائل للتأسيسي ════════════
update leaders.learning_models set min_level = 'beginner' where key = 'options-analysis' and min_level = 'intermediate';

select pg_temp.patch_if('options-analysis', 'evidence', 'hint', '',
  $j${"hint": "رقمان من مصدرين يكفيان. مثال: متوسط إنجاز المعاملة 9 أيام (تقرير الإدارة 2025)، و40% من الشكاوى عن التأخير (نظام الشكاوى)"}$j$::jsonb);
select pg_temp.patch_if('options-analysis', 'options', 'hint', 'البديل الأول: عدم التدخل (الوضع الحالي)',
  $j${"hint": "البديل الأول: عدم التدخل (الوضع الحالي)، ثم بديلان على الأقل. التكلفة تقدير تقريبي بالريال يكفي، والمنفعة والمخاطر جملة قصيرة لكل منها"}$j$::jsonb);
select pg_temp.patch_if('options-analysis', 'recommendation', 'hint', '',
  $j${"hint": "اختر بديلًا واحدًا وقل لماذا يتفوق: منفعة أكبر مقابل تكلفته، أو خطر أقل، أو أسرع أثرًا"}$j$::jsonb);

-- ════════════ 2) الموارد والتكلفة للتأسيسي ════════════
update leaders.learning_models set min_level = 'beginner' where key = 'cost-plan' and min_level = 'intermediate';

update leaders.learning_models
   set steps_ar = replace(steps_ar, 'قدّر تكلفة كل حزمة بندًا بندًا، واكتب رمز الحزمة من هيكل التجزئة.',
                          'قدّر تكلفة كل بند، واكتب رمز الحزمة من هيكل التجزئة إن كان في وثيقتك، وإلا فرقمًا تسلسليًا (1، 2، 3).')
 where key = 'cost-plan';

select pg_temp.patch_if('cost-plan', 'items', 'hint', 'المبالغ بالريال، أرقام فقط',
  $j${"hint": "المبالغ بالريال، أرقام فقط. إن لم يكن في وثيقتك هيكل تجزئة فاكتب في العمود الأول رقمًا تسلسليًا. اترك الإجمالي فارغًا يُحسب من الكمية وسعر الوحدة", "min_rows_beginner": 3}$j$::jsonb);
select pg_temp.patch_if('cost-plan', 'envelope', 'hint', 'رقم فقط',
  $j${"hint": "رقم فقط: المبلغ الذي تتوقع أن ترصده الجهة لمثل هذه المبادرة، ولو تقديرًا"}$j$::jsonb);
select pg_temp.patch_if('cost-plan', 'contingency', 'hint', 'رقم من 0 إلى 50',
  $j${"hint": "رقم من 0 إلى 50: مبلغ للطوارئ نسبةً من التكلفة، والشائع 10"}$j$::jsonb);
select pg_temp.patch_if('cost-plan', 'funding', 'hint', '',
  $j${"hint": "مثال: الميزانية التشغيلية للإدارة، ويعتمدها مدير الشؤون المالية"}$j$::jsonb);

-- ════════════ 3) الراعي توضيح لا شرط ════════════
select pg_temp.patch_if('initiative-charter', 'sponsor', 'label', 'الراعي: الاسم والمنصب',
  $j${"label": "الراعي: منصبه ودوره في هيكل المبادرة", "required": false, "hint": "المبادرة قد تكون افتراضية: اذكر المنصب الذي يرعاها في جهتك وما يقرره (مثل: وكيل الخدمات، يعتمد الموازنة ويحسم التصعيد). لا يلزم اسم شخص"}$j$::jsonb, '{help}');
select pg_temp.patch_if('initiative-charter', 'sponsor_email', 'label', 'بريد الراعي',
  $j${"label": "بريد الراعي (إن كان للمبادرة راعٍ فعلي)", "required": false, "hint": "اختياري تمامًا. إن كتبته وصله طلب تأييد الوثيقة بعد قبول المستشار، وإلا اعتُمدت بقبول المستشار وحده"}$j$::jsonb, '{help}');

update leaders.learning_models
   set steps_ar = replace(replace(steps_ar,
         'اختر مبادرة حقيقية تقودها أو ستقودها في جهتك خلال البرنامج.',
         'اختر مبادرة تقودها أو يمكن أن تقودها في جهتك: حقيقية، أو افتراضية واقعية في سياقها.'),
         'سمِّ راعيها من الجهة، فهو من يؤيد الوثيقة قبل اعتمادها.',
         'وضّح من يرعاها في هيكل جهتك وما يقرره، ولا يلزم اسم شخص ولا بريده.')
 where key = 'initiative-charter';

update leaders.stage_requirements
   set help_ar = $q$اختر مبادرة في جهتك، حقيقية أو افتراضية واقعية، واكتب بطاقتها وسلّمها. يعتمد مستشارك اختيارها عادةً خلال يومي عمل، ومنها يبدأ مشروع تخرجك وتأخذ نماذجك اسمها.$q$
 where code = 'CP-CARD'
   and help_ar = $q$اختر مبادرة حقيقية في جهتك واكتب بطاقتها وسلّمها. يعتمد مستشارك اختيارها عادةً خلال يومي عمل، ومنها يبدأ مشروع تخرجك وتأخذ نماذجك اسمها.$q$;

update leaders.stage_requirements
   set help_ar = $q$تسلّم الوثيقة حين تكتمل فصولها وتبلغ جاهزيتها 80%، فيقيّمها المستشار ويعتمدها. وإن كتبت بريد راعٍ فعلي في بطاقة المبادرة، أيّدها قبل الاعتماد.$q$
 where code = 'CP-FINAL'
   and help_ar = $q$تسلّم الوثيقة حين تكتمل فصولها وتبلغ جاهزيتها 80%، فيقيّمها المستشار ويؤيدها راعيها في جهتك.$q$;

-- ════════════ 4) فصل الشراء والتعاقد ════════════
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, capstone_sort, scopes, fields) values
('milestone', 'procurement', 16, $q$الشراء والتعاقد$q$, $q$⧉$q$,
 $q$هل تحتاج المبادرة شراء أو تعاقدًا، وما الذي يُشترى، وبأي طريقة طرح، ومتى. هو البعد التجاري في حالة العمل.$q$,
 $q$بعد الموارد والتكلفة، وقبل الجدول النهائي: مدد الطرح والترسية تؤخر التنفيذ إن لم تُحسب.$q$,
 $q$اسأل: هل تُنفّذ المبادرة بموارد الجهة وحدها، أم تحتاج موردًا أو مقاولًا أو ترخيصًا؟
إن لم تحتج شراء، فاختر ذلك ويكتمل الفصل.
إن احتجت، فاكتب كل ما يُشترى وقيمته التقديرية وطريقة طرحه وموعد الحاجة إليه.
احسب مدة الطرح والترسية في جدولك، فهي من أكثر أسباب التأخير شيوعًا.$q$,
 $q$مستلهم من البعد التجاري في نموذج الحالات الخمس (HM Treasury Green Book) ونظام المنافسات والمشتريات الحكومية$q$,
 'beginner', 20, 105, '{}',
 $q$[
  {"key": "need", "label": "هل تحتاج المبادرة شراء أو تعاقدًا؟", "type": "select", "options": ["لا، تُنفَّذ بموارد الجهة", "نعم، تحتاج شراء أو تعاقدًا"], "hint": "", "required": true},
  {"key": "items", "label": "ما يُشترى أو يُتعاقد عليه", "type": "table", "columns": ["البند", "القيمة التقديرية (ريال)", "طريقة الطرح", "موعد الحاجة إليه"], "min_rows": 1, "hint": "إن اخترت «نعم» فاكتب بندًا واحدًا على الأقل. طريقة الطرح مثل: منافسة عامة، شراء مباشر، اتفاقية إطارية", "required": false},
  {"key": "lead_time", "label": "مدة الطرح والترسية وأثرها على الجدول", "type": "textarea", "hint": "من إعداد كراسة الشروط إلى توقيع العقد، وأي نشاط في جدولك ينتظرها", "required": false, "min_level": "intermediate"},
  {"key": "contract", "label": "توزيع المخاطر في العقد: شروط القبول والدفع والغرامات", "type": "textarea", "hint": "ما يتحمله المورد، وما تتحمله الجهة، ومتى يُدفع له", "required": false, "min_level": "advanced"}
 ]$q$::jsonb)
on conflict (key) do nothing;

-- ════════════ 5) مبرر الاستمرار عند البوابة ════════════
select pg_temp.patch_if('stage-gate', 'justification', 'hint', '',
  $j${"hint": "ارجع إلى «حالة العمل» في وثيقتك: هل ما زالت المنافع تفوق التكلفة والمخاطر؟ وما الذي تغيّر منذ بطاقة المبادرة؟"}$j$::jsonb);

insert into leaders.schema_migrations (name) values ('20261114140000_leaders_initiative_business_case') on conflict do nothing;
