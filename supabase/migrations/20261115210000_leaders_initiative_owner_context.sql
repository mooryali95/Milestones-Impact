-- deploy-gate: tolerant محتوى نماذج فقط: الدوال تقرأ النماذج كما هي في القاعدة، والحقلان الجديدان اختياريان
-- ════════════════════════════════════════════════════════════════
-- المبادرة ملك قائدها، والجهة سياق مساعد (اعتمده المالك 2026-11-15)
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-15-تصور-المبادرة-ملك-قائدها-v1.md
-- 1) عناوين حقول البطاقة وتلميحاتها وخطواتها ومساعدة متطلب البطاقة: لا تفترض أن للمشارك جهة، ولا أن لها استراتيجية،
--    ولا أن المبادرة مبادرتها. «الهدف الاستراتيجي في جهتك» صار «الهدف الأعلى» بمصادره البديلة.
-- 2) حقلان اختياريان في البطاقة بعد اسمها: «أين تُنفَّذ مبادرتك؟» و«الجهة المستضيفة إن وُجدت»، فتتكيف بهما الأمثلة والتلميحات.
-- 3) خيار الواقعية القديم «في سياق جهتي» يُنقل في إجابات المشاركين إلى نصه الجديد، فلا تبقى إجابة خارج الخيارات.
-- ما حرّرته الإدارة لا يُمس: كل تعديل مشروط بالقيمة الأصلية، وكل إضافة لا تقع إلا إن غابت. آمن لإعادة التشغيل.

-- نسخة لما يتغير، تُؤخذ مرة واحدة قبل أول تشغيل
create table if not exists leaders.backup_20261115_owner_context as
  select 'model' kind, key ref, coalesce(steps_ar, '') || E'\n||\n' || fields::text body
    from leaders.learning_models where key in ('initiative-charter', 'cost-plan', 'procurement', 'learning-agreement', 'raid', 'transformation-story')
  union all select 'req', code, coalesce(help_ar, '') from leaders.stage_requirements where code = 'CP-CARD';
alter table leaders.backup_20261115_owner_context enable row level security;

create or replace function pg_temp.patch_if(mkey text, fkey text, guard_key text, guard_val text, patch jsonb)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(case when f->>'key' = fkey and coalesce(f->>guard_key, '') = guard_val then f || patch else f end order by ord)
                     from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
   where m.key = mkey and m.fields @> jsonb_build_array(jsonb_build_object('key', fkey));
$f$;

-- يضيف حقلًا بعد حقل بعينه إن غاب
create or replace function pg_temp.add_after(mkey text, after_key text, field jsonb)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(x.f order by x.ord) from (
                     select f, ord * 10 ord from jsonb_array_elements(m.fields) with ordinality as e(f, ord)
                     union all
                     select field, coalesce((select ord * 10 + 5 from jsonb_array_elements(m.fields) with ordinality as e2(f2, ord) where f2->>'key' = after_key), 100000)) x)
   where m.key = mkey and not m.fields @> jsonb_build_array(jsonb_build_object('key', field->>'key'));
$f$;

-- ════════════ 1) صياغة البطاقة: المبادرة لقائدها ════════════
select pg_temp.patch_if('initiative-charter', 'objective', 'label', 'الهدف الاستراتيجي الذي تخدمه في جهتك',
  $j${"label": "الهدف الأعلى الذي تخدمه مبادرتك", "hint": "من استراتيجية جهة، أو خطة قطاع، أو رؤية وطنية، أو حاجة سوق مثبتة. انقله بنصه واذكر مصدره"}$j$::jsonb);
select pg_temp.patch_if('initiative-charter', 'reality', 'label', 'هل المشكلة قائمة في جهتك اليوم؟',
  $j${"label": "هل المشكلة قائمة اليوم في سياق تنفيذ مبادرتك؟", "options": ["نعم، قائمة وأراها", "افتراضية لكنها واقعية في سياقها"], "hint": "المبادرة الافتراضية مقبولة إن كانت واقعية في سياقها وتستطيع تنفيذها"}$j$::jsonb);
select pg_temp.patch_if('initiative-charter', 'sponsor', 'hint', 'المبادرة قد تكون افتراضية: اذكر المنصب الذي يرعاها في جهتك وما يقرره (مثل: وكيل الخدمات، يعتمد الموازنة ويحسم التصعيد). لا يلزم اسم شخص',
  $j${"hint": "المبادرة قد تكون افتراضية: اذكر منصب من يرعاها أو صفته وما يقرره (مثل: وكيل الخدمات يعتمد الموازنة ويحسم التصعيد، أو مستثمر يموّل المرحلة الأولى). لا يلزم اسم شخص"}$j$::jsonb);
select pg_temp.patch_if('cost-plan', 'envelope', 'hint', 'رقم فقط: المبلغ الذي تتوقع أن ترصده الجهة لمثل هذه المبادرة، ولو تقديرًا',
  $j${"hint": "رقم فقط: المبلغ المتاح أو المتوقع للمبادرة، من جهة أو مموّل أو تمويل ذاتي، ولو تقديرًا"}$j$::jsonb);
select pg_temp.patch_if('procurement', 'contract', 'hint', 'ما يتحمله المورد، وما تتحمله الجهة، ومتى يُدفع له',
  $j${"hint": "ما يتحمله المورد، وما يتحمله صاحب المبادرة أو الجهة المستضيفة، ومتى يُدفع له"}$j$::jsonb);

select pg_temp.patch_if('initiative-charter', 'trade_off', 'label', 'ما تتنازل عنه الجهة لأجل هذه المبادرة: الموارد والفرص التي تُحجز لها، ومن يتحمل كلفة ذلك',
  $j${"label": "ما يتنازل عنه صاحب القرار لأجل هذه المبادرة: الموارد والفرص التي تُحجز لها، ومن يتحمل كلفة ذلك"}$j$::jsonb);
select pg_temp.patch_if('raid', 'appetite', 'label', 'شهية المخاطرة: ما الذي تقبله الجهة وما لا تقبله',
  $j${"label": "شهية المخاطرة: ما الذي يقبله صاحب القرار وما لا يقبله"}$j$::jsonb);
select pg_temp.patch_if('transformation-story', 'system_change', 'label', 'ما بقي في الجهة بعدك: ممارسة أو قاعدة أو أداة صارت تعمل دون أن تتدخل، ودليل ذلك',
  $j${"label": "ما بقي بعدك: ممارسة أو قاعدة أو أداة صارت تعمل دون أن تتدخل، ودليل ذلك"}$j$::jsonb);

-- إجابة الواقعية القديمة إلى نصها الجديد، في المسودات وما بعدها (اللقطات المعتمدة سجل لا يتغير)
update leaders.model_submissions s
   set answers = jsonb_set(s.answers, '{reality}', '"افتراضية لكنها واقعية في سياقها"'::jsonb)
  from leaders.learning_models m
 where s.model_id = m.id and m.key = 'initiative-charter' and s.answers->>'reality' = 'افتراضية لكنها واقعية في سياق جهتي';

update leaders.learning_models
   set steps_ar = replace(replace(steps_ar,
         'اختر مبادرة تقودها أو يمكن أن تقودها في جهتك: حقيقية، أو افتراضية واقعية في سياقها.',
         'اختر مبادرة تقودها أنت، في جهة أو مجتمع أو سوق: حقيقية، أو افتراضية واقعية في سياقها.'),
         'وضّح من يرعاها في هيكل جهتك وما يقرره، ولا يلزم اسم شخص ولا بريده.',
         'وضّح من يرعاها وما يقرره، منصبًا أو صفة، ولا يلزم اسم شخص ولا بريده.')
 where key = 'initiative-charter';

update leaders.stage_requirements
   set help_ar = $q$اختر مبادرة تقودها أنت، في جهة أو مجتمع أو سوق، حقيقية أو افتراضية واقعية، واكتب بطاقتها وسلّمها. يعتمد مستشارك اختيارها عادةً خلال يومي عمل، ومنها يبدأ مشروع تخرجك وتأخذ نماذجك اسمها.$q$
 where code = 'CP-CARD'
   and help_ar = $q$اختر مبادرة في جهتك، حقيقية أو افتراضية واقعية، واكتب بطاقتها وسلّمها. يعتمد مستشارك اختيارها عادةً خلال يومي عمل، ومنها يبدأ مشروع تخرجك وتأخذ نماذجك اسمها.$q$;

select pg_temp.patch_if('learning-agreement', 'sponsor', 'help', 'اختياري ومستحسن: راعٍ من جهتك يفتح الأبواب ويحمي المبادرة عند القرار.',
  $j${"help": "اختياري ومستحسن: راعٍ يفتح الأبواب ويحمي المبادرة عند القرار."}$j$::jsonb);

-- ════════════ 2) سياق المبادرة: أين تُنفَّذ، والجهة المستضيفة إن وُجدت ════════════
-- الخيارات نصوصها في anatomy.json (contexts)، ويحرس اختبار تطابقها
select pg_temp.add_after('initiative-charter', 'title', $j${"key": "context", "label": "أين تُنفَّذ مبادرتك؟", "type": "select", "options": ["في جهة أعمل فيها", "في جهة أخرى", "مبادرة ريادية أو مستقلة", "مبادرة مجتمعية أو تطوعية", "افتراضية في سياق واقعي"], "hint": "المبادرة مبادرتك أيًا كان مكانها. اختيارك يكيّف الأمثلة والتلميحات لسياقك", "required": false}$j$::jsonb);
select pg_temp.add_after('initiative-charter', 'context', $j${"key": "host", "label": "الجهة المستضيفة (إن وُجدت)", "type": "text", "hint": "اسمها أو وصفها، مثل: إدارة العيادات الخارجية في تجمع صحي. اتركه فارغًا للمبادرة الريادية أو المستقلة", "required": false}$j$::jsonb);

insert into leaders.schema_migrations (name) values ('20261115210000_leaders_initiative_owner_context') on conflict do nothing;
