-- تحقق ترحيل 20261115210000 (المبادرة ملك قائدها) على القاعدة الحية. قراءة فقط.
-- يُشغَّل بسير migrate.yml في الوضع verify: كل فحص يعيد صفًا واحدًا (ok، detail)، وأي ok = false يُفشل السير.

-- 1) الترحيل في السجل، ونسخة ما قبل التعديل محفوظة
select exists (select 1 from leaders.schema_migrations where name = '20261115210000_leaders_initiative_owner_context')
   and to_regclass('leaders.backup_20261115_owner_context') is not null as ok,
       'السجل: ' || (select count(*) from leaders.schema_migrations) || ' ترحيلًا · صفوف النسخة: '
       || coalesce((select count(*)::text from leaders.backup_20261115_owner_context), 'لا جدول') as detail;

-- 2) حقلا السياق والجهة المستضيفة في البطاقة، بعد اسم المبادرة مباشرة وبترتيبهما، واختياريان
with f as (select e.f->>'key' k, e.ord from leaders.learning_models m, jsonb_array_elements(m.fields) with ordinality e(f, ord) where m.key = 'initiative-charter')
select (select ord from f where k = 'context') = (select ord from f where k = 'title') + 1
   and (select ord from f where k = 'host') = (select ord from f where k = 'title') + 2
   and (select bool_and(coalesce(x->>'required', 'false') = 'false') from leaders.learning_models m, jsonb_array_elements(m.fields) x
         where m.key = 'initiative-charter' and x->>'key' in ('context', 'host')) as ok,
       'ترتيب الحقول: ' || (select string_agg(k, ' ← ' order by ord) from f where ord <= (select ord from f where k = 'title') + 3) as detail;

-- 3) خيارات حقل السياق الخمسة بنصها وترتيبها (مصدرها anatomy.json contexts)
select (x->'options') = '["في جهة أعمل فيها", "في جهة أخرى", "مبادرة ريادية أو مستقلة", "مبادرة مجتمعية أو تطوعية", "افتراضية في سياق واقعي"]'::jsonb as ok,
       'context: ' || (x->>'label') || ' · ' || (x->'options')::text as detail
  from leaders.learning_models m, jsonb_array_elements(m.fields) x where m.key = 'initiative-charter' and x->>'key' = 'context';

-- 4) العناوين والتلميحات التسعة بنصها الجديد. «قديم» = بقيت القيمة الأصلية، «محرَّر» = حرّرته الإدارة فلم يُمس (مقبول)
with want(mkey, fkey, prop, old, new) as (values
  ('initiative-charter', 'objective', 'label', 'الهدف الاستراتيجي الذي تخدمه في جهتك', 'الهدف الأعلى الذي تخدمه مبادرتك'),
  ('initiative-charter', 'reality', 'label', 'هل المشكلة قائمة في جهتك اليوم؟', 'هل المشكلة قائمة اليوم في سياق تنفيذ مبادرتك؟'),
  ('initiative-charter', 'trade_off', 'label', 'ما تتنازل عنه الجهة لأجل هذه المبادرة: الموارد والفرص التي تُحجز لها، ومن يتحمل كلفة ذلك', 'ما يتنازل عنه صاحب القرار لأجل هذه المبادرة: الموارد والفرص التي تُحجز لها، ومن يتحمل كلفة ذلك'),
  ('initiative-charter', 'sponsor', 'hint', 'المبادرة قد تكون افتراضية: اذكر المنصب الذي يرعاها في جهتك وما يقرره (مثل: وكيل الخدمات، يعتمد الموازنة ويحسم التصعيد). لا يلزم اسم شخص', 'المبادرة قد تكون افتراضية: اذكر منصب من يرعاها أو صفته وما يقرره (مثل: وكيل الخدمات يعتمد الموازنة ويحسم التصعيد، أو مستثمر يموّل المرحلة الأولى). لا يلزم اسم شخص'),
  ('cost-plan', 'envelope', 'hint', 'رقم فقط: المبلغ الذي تتوقع أن ترصده الجهة لمثل هذه المبادرة، ولو تقديرًا', 'رقم فقط: المبلغ المتاح أو المتوقع للمبادرة، من جهة أو مموّل أو تمويل ذاتي، ولو تقديرًا'),
  ('procurement', 'contract', 'hint', 'ما يتحمله المورد، وما تتحمله الجهة، ومتى يُدفع له', 'ما يتحمله المورد، وما يتحمله صاحب المبادرة أو الجهة المستضيفة، ومتى يُدفع له'),
  ('raid', 'appetite', 'label', 'شهية المخاطرة: ما الذي تقبله الجهة وما لا تقبله', 'شهية المخاطرة: ما الذي يقبله صاحب القرار وما لا يقبله'),
  ('transformation-story', 'system_change', 'label', 'ما بقي في الجهة بعدك: ممارسة أو قاعدة أو أداة صارت تعمل دون أن تتدخل، ودليل ذلك', 'ما بقي بعدك: ممارسة أو قاعدة أو أداة صارت تعمل دون أن تتدخل، ودليل ذلك'),
  ('learning-agreement', 'sponsor', 'help', 'اختياري ومستحسن: راعٍ من جهتك يفتح الأبواب ويحمي المبادرة عند القرار.', 'اختياري ومستحسن: راعٍ يفتح الأبواب ويحمي المبادرة عند القرار.')),
cur as (select w.*, x->>w.prop val from want w
          left join leaders.learning_models m on m.key = w.mkey
          left join lateral jsonb_array_elements(m.fields) x on x->>'key' = w.fkey)
select bool_and(val is distinct from old and val is not null) as ok,
       string_agg(mkey || '.' || fkey || '.' || prop || ': ' || case when val = new then 'جديد' when val = old then 'قديم' when val is null then 'غائب' else 'محرَّر' end, ' · ') as detail
  from cur;

-- 5) لا إجابة واقعية بالنص القديم، وكل إجابة واقعية من الخيارين الجديدين
select count(*) filter (where s.answers->>'reality' = 'افتراضية لكنها واقعية في سياق جهتي') = 0 as ok,
       'إجابات الواقعية: ' || coalesce(string_agg(distinct s.answers->>'reality', ' | '), 'لا إجابات') || ' · العدد ' || count(*) filter (where s.answers ? 'reality') as detail
  from leaders.model_submissions s join leaders.learning_models m on m.id = s.model_id where m.key = 'initiative-charter';

-- 6) خطوات البطاقة بلا «جهتك»، ومساعدة متطلب CP-CARD في كل برنامج: لا يبقى النص القديم (المحرَّر من الإدارة لم يُمس، ويُعدّ)
with r as (select help_ar,
            case when help_ar like 'اختر مبادرة تقودها أنت، في جهة أو مجتمع أو سوق%' then 'new'
                 when help_ar like 'اختر مبادرة في جهتك، حقيقية أو افتراضية واقعية%' then 'old' else 'edited' end st
             from leaders.stage_requirements where code = 'CP-CARD')
select (select steps_ar from leaders.learning_models where key = 'initiative-charter') !~ 'في جهتك|هيكل جهتك'
   and not exists (select 1 from r where st = 'old') as ok,
       'خطوات البطاقة: ' || case when (select steps_ar from leaders.learning_models where key = 'initiative-charter') ~ 'اختر مبادرة تقودها أنت، في جهة أو مجتمع أو سوق' then 'جديدة' else 'غير متوقعة' end
       || ' · CP-CARD في ' || (select count(*) from r) || ' برامج: جديد ' || (select count(*) from r where st = 'new')
       || '، قديم ' || (select count(*) from r where st = 'old') || '، محرَّر ' || (select count(*) from r where st = 'edited')
       || coalesce(' · ما بقي فيه «جهتك»: ' || (select string_agg(x[1], ' | ') from leaders.learning_models m, regexp_matches(m.steps_ar, '([^.\n]*(?:في جهتك|هيكل جهتك)[^.\n]*)', 'g') x where m.key = 'initiative-charter'), '') as detail;

-- 7) مسح شامل: كل نص في فصول وثيقة المبادرة (نماذجها كاملة) ومتطلبات CP-* بلا صياغة تفترض جهة (قاعدة anatomy.json writing_rules)
with t as (
  select m.key src, v.k fld, v.val txt from leaders.learning_models m,
    lateral (select key k, value val from jsonb_each_text(to_jsonb(m) - 'fields' - 'id')
             union all select (f->>'key') || '.' || p.key, p.value from jsonb_array_elements(m.fields) f, jsonb_each_text(f) p) v
   where m.capstone_sort is not null
  union all select 'req:' || code || ':' || left(program_id::text, 8), 'help_ar', help_ar from leaders.stage_requirements where code like 'CP-%'),
hits as (select distinct src, fld, case when src like 'req:%' then txt else substring(txt from '[^.\n،]*(?:جهتك|جهته|هيكل الجهة|استراتيجية الجهة|خطة الجهة|يقنع الجهة|تكلّف الجهة|من الجهة نفسها)[^.\n،]*') end snip
           from t where txt ~ 'جهتك|جهته|هيكل الجهة|استراتيجية الجهة|خطة الجهة|يقنع الجهة|تكلّف الجهة|من الجهة نفسها')
select not exists (select 1 from hits) as ok,
       'نماذج الوثيقة: ' || (select count(*) from leaders.learning_models where capstone_sort is not null) || ' · مواضع: ' || (select count(*) from hits)
       || coalesce(' · ' || (select string_agg(src || '.' || fld || ': «' || trim(snip) || '»', ' | ' order by src, fld) from hits), '') as detail;
