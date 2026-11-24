-- deploy-gate: tolerant محتوى نماذج ونصوص ملفات تعريف فقط. كل حقل يصير مطلوبًا بهذا الترحيل مخزّن required: false مع شرط
-- إلزامه (required_from أو required_after)، فالدوال الأقدم تقرؤه اختياريًا: قبل نشر الدوال الجديدة أو بعد التراجع عنها لا ينقص
-- اكتمال فصل ولا جاهزية أحد. ما تفقده الدوال الأقدم: قاعدة «لا فقد» (فصل رُفع مستواه يختفي عمن كتب فيه حتى يُعاد النشر، وإجاباته باقية
-- في القاعدة). إن تُراجع عن الدوال إلى ما قبل هذا الترحيل فشغّل سطر restore أدناه (RUNBOOK.md §2).
-- ════════════════════════════════════════════════════════════════
-- وثيقة المبادرة بحسب المستوى: المرحلتان 2 و3 من المصفوفة المعتمدة
-- ════════════════════════════════════════════════════════════════
-- المصفوفة: docs/content/2026-11-24-مصفوفة-الوثيقة-بحسب-المستوى-v1.md (اعتمدها المالك 2026-11-24: «ألا يكون في الوثيقة
-- فقد أو عجز أو خلل، فتبقى مؤسسية قوية غير ناقصة، ومبسطة وفق المصفوفة»). حالة التنفيذ في v2 من الملف نفسه.
--   1) تقرير الأثر من التأسيسي: يرى البرنامج (مربوط باسم المبادرة) وما تغيّر (جدوله فيه خط الأساس والقيمة الحالية: «بأي رقم»)
--      والدروس. المساهمة وما لم يتحقق من المتوسط. وحقل تعمق المسار للاحترافي (المصفوفة: «✓ + حقل المسار»).
--   2) خطة القياس والأدلة من التأسيسي بحقل واحد جديد: كيف ستعرف أنك نجحت؟ وحقولها القائمة من المتوسط.
--   3) الموارد والتكلفة للتأسيسي: البنود (ما تحتاجه وكلفته) والميزانية ومصدر التمويل (من يوفره)؛ نسبة الاحتياطي من المتوسط.
--   4) الشراء وخريطة الطريق والحوكمة وخطة التطوير القيادي من المتوسط (أسئلتها مُجابة للتأسيسي في الموارد، والمعالم، والبطاقة، وقصة التحول).
--   5) حقلان للاحترافي وحده: المسار الحرج والاعتماديات في سجل المعالم، والتحالفات وتحريك المعارضين في خريطة أصحاب المصلحة.
--   6) بطاقة المبادرة: المطلوب أولًا ثم الاختياري تحت عنوان «تعمّق إن شئت». ترتيب فقط، لا حذف.
--   7) نصوص ثلاثة ملفات تعريف تذكر فصولًا تغيّر ظهورها (التطوير القيادي والحوكمة للتأسيسي، وتقرير الأثر للمتوسط والاحترافي).
-- لا انخفاض في جاهزية أحد، ولا وثيقة ناقصة لمن يبدأ بعده:
--   required_after (وقت تطبيق الترحيل): الحقول الجديدة، وحقول تقرير الأثر للتأسيسي والمتوسط، والراعي في البطاقة، مطلوبة لمن
--   اعتُمد مساره بعد الترحيل، واختيارية لمن اعتُمد قبله (fieldsFor بأول اعتماد للمشارك، approvalOf.since).
--   required_from: حقول تقرير الأثر مطلوبة للاحترافي كما كانت، أيًا كان وقت اعتماده.
--   وما كتبه مشارك في فصل أو حقل رُفع مستواه يبقى ظاهرًا وفي وثيقته غير مطلوب (fieldsFor/modelsFor)، ولا يُحسب في الجاهزية.
-- الفصول الثمانية التي لا يُنشئها ترحيل في المستودع (منها تقرير الأثر وسجل المعالم وخريطة أصحاب المصلحة وخطة التطوير)
-- تُعدَّل بمفتاح الفصل والحقل، وكل خطوة مشروطة بوجودهما، فلا يفشل الترحيل في بيئة تخلو منها. آمن لإعادة التشغيل.

-- restore: update leaders.learning_models m set min_level = b.lvl, fields = b.b::jsonb from leaders.backup_20261128_level_matrix b where b.kind = 'model' and m.key = b.ref; update leaders.track_profiles p set journey_ar = b.b from leaders.backup_20261128_level_matrix b where b.kind = 'profile' and p.key = b.ref; update leaders.tracks t set journey_ar = b.b from leaders.backup_20261128_level_matrix b where b.kind = 'track' and t.key = b.ref
create table if not exists leaders.backup_20261128_level_matrix as
  select 'model' kind, key ref, min_level lvl, fields::text b from leaders.learning_models
   where key in ('impact-report', 'evidence-plan', 'cost-plan', 'procurement', 'roadmap', 'governance', 'development-plan',
                 'milestone-register', 'stakeholder-map', 'initiative-charter')
  union all select 'profile', key, null, journey_ar from leaders.track_profiles where key in ('leadership-beginner', 'impact-intermediate', 'impact-advanced')
  union all select 'track', key, null, journey_ar from leaders.tracks where profile_key in ('leadership-beginner', 'impact-intermediate', 'impact-advanced');
alter table leaders.backup_20261128_level_matrix enable row level security;
revoke all on leaders.backup_20261128_level_matrix from anon, authenticated;

-- أدوات مؤقتة للجلسة: دمج خصائص في حقل بمفتاحه ما لم يحملها، وإدراج حقل غائب قبل «تعمق المسار» (أو أول الفصل)
create or replace function pg_temp.lm_patch(mkey text, fkey text, patch jsonb)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(case when f->>'key' = fkey then f || patch else f end order by ord)
                     from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
   where m.key = mkey and m.fields @> jsonb_build_array(jsonb_build_object('key', fkey))
     and not m.fields @> jsonb_build_array(jsonb_build_object('key', fkey) || patch);
$f$;

-- حقل لا مستوى له يصير من المتوسط؛ وحقل له مستوى (احترافي) لا يُمس
create or replace function pg_temp.lm_from_intermediate(mkey text, fkey text)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(case when f->>'key' = fkey and not f ? 'min_level' then f || '{"min_level": "intermediate"}'::jsonb else f end order by ord)
                     from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
   where m.key = mkey and exists (select 1 from jsonb_array_elements(m.fields) f where f->>'key' = fkey and not f ? 'min_level');
$f$;

-- يصير الحقل مطلوبًا لمن اعتُمد مساره بعد الترحيل: required_after بوقت التطبيق (مرة واحدة)، وrequired: false للدوال الأقدم
create or replace function pg_temp.lm_require_after(mkey text, fkey text, extra jsonb default '{}'::jsonb)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(case when f->>'key' = fkey
                     then f || extra || jsonb_build_object('required', false, 'required_after', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
                     else f end order by ord)
                     from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
   where m.key = mkey and exists (select 1 from jsonb_array_elements(m.fields) f where f->>'key' = fkey and not f ? 'required_after');
$f$;

create or replace function pg_temp.lm_add(mkey text, field jsonb, first boolean default false)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(x order by o) from (
       select f x, ord * 2 o from jsonb_array_elements(m.fields) with ordinality as e(f, ord)
       union all
       select field, case when first then -1 else coalesce((select ord * 2 - 1 from jsonb_array_elements(m.fields) with ordinality as e(f, ord) where f->>'key' = 'track_depth' limit 1), 100000) end
     ) s)
   where m.key = mkey and not m.fields @> jsonb_build_array(jsonb_build_object('key', field->>'key'));
$f$;

-- ════════════ 1) تقرير الأثر من التأسيسي ════════════
-- مطلوب للاحترافي كما كان (required_from)، ولكل من يراه ممن اعتُمد بعد الترحيل (required_after)، واختياري لمن دونه ممن بدأ قبله
select pg_temp.lm_require_after('impact-report', k, '{"required_from": "advanced"}'::jsonb) from unnest(array['program', 'changes', 'lessons', 'contribution', 'not_achieved']) k;
select pg_temp.lm_from_intermediate('impact-report', k) from unnest(array['contribution', 'not_achieved']) k;
-- التأسيسي يكتب تغييرًا واحدًا على الأقل
select pg_temp.lm_patch('impact-report', 'changes', '{"min_rows_beginner": 1}'::jsonb);
select pg_temp.lm_add('impact-report', $j${"key": "track_depth", "label": "تعمق المسار: من يرصد الأثر بعد إغلاق المبادرة، ومتى، وبأي مؤشر", "type": "textarea", "hint": "هذا محور الأولوية في مسارك، ووزنه في التقييم مضاعف", "required": false, "track": true, "min_level": "advanced"}$j$::jsonb);
select pg_temp.lm_require_after('impact-report', 'track_depth');
update leaders.learning_models set min_level = 'beginner' where key = 'impact-report' and min_level <> 'beginner';

-- ════════════ 2) خطة القياس والأدلة: سطر النجاح للتأسيسي ════════════
select pg_temp.lm_from_intermediate('evidence-plan', k) from unnest(array['plan', 'privacy', 'attribution', 'track_depth']) k;
select pg_temp.lm_add('evidence-plan', $j${"key": "success_signal", "label": "كيف ستعرف أنك نجحت؟", "type": "textarea", "required": false,
  "hint": "علامة واحدة تراها أو تقيسها حين تتحقق المنفعة، ومتى تنظر إليها. مثال: ينخفض زمن إنجاز الطلب من 9 أيام إلى 3 في سجل الخدمة بعد ثلاثة أشهر"}$j$::jsonb, true);
select pg_temp.lm_require_after('evidence-plan', 'success_signal');
update leaders.learning_models set min_level = 'beginner' where key = 'evidence-plan' and min_level <> 'beginner';

-- ════════════ 3) الموارد والتكلفة للتأسيسي: ما تحتاجه وكلفته ومن يوفره ════════════
select pg_temp.lm_from_intermediate('cost-plan', 'contingency');

-- ════════════ 4) فصول من المتوسط ════════════
update leaders.learning_models set min_level = 'intermediate'
 where key in ('procurement', 'roadmap', 'governance', 'development-plan') and min_level = 'beginner';

-- ════════════ 5) عمق الاحترافي ════════════
select pg_temp.lm_add('milestone-register', $j${"key": "critical_path", "label": "المسار الحرج والاعتماديات: أي المعالم يؤخر تأخرها الموعد النهائي، وعلى من أو ماذا يعتمد كل منها", "type": "textarea", "required": false, "min_level": "advanced",
  "hint": "على مستوى المعالم لا الأنشطة (الأنشطة في الجدول الزمني). مثال: اعتماد العقد يسبق التشغيل التجريبي، ويعتمد على قرار لجنة المشتريات"}$j$::jsonb);
select pg_temp.lm_add('stakeholder-map', $j${"key": "coalitions", "label": "التحالفات وتحريك المعارضين: من تجمعه مع من، وكيف تحرّك المعارض المؤثر إلى الحياد أو التأييد", "type": "textarea", "required": false, "min_level": "advanced",
  "hint": "تحالف صغير من أصحاب النفوذ يحرّك ما لا يحركه التواصل الفردي. مثال: يعرض مدير العمليات مع الراعي النتائج الأولى على المعارض قبل اجتماع القرار"}$j$::jsonb);

select pg_temp.lm_require_after('milestone-register', 'critical_path');
select pg_temp.lm_require_after('stakeholder-map', 'coalitions');

-- ════════════ 6) بطاقة المبادرة: المطلوب أولًا ثم «تعمّق إن شئت» ════════════
-- صاحب القرار (الراعي: منصبه ودوره) مطلوب لمن يبدأ بعد الترحيل: مصدر «من يقرر» للتأسيسي بلا فصل الحوكمة. بريده يبقى اختياريًا
select pg_temp.lm_require_after('initiative-charter', 'sponsor');
-- الترتيب داخل كل مجموعة كما هو، وعنوان المجموعة على أول حقل اختياري. مرة واحدة: لا يُعاد إن وُجد العنوان.
-- الحقل المطلوب بشرط (required_after) من مجموعة المطلوب
update leaders.learning_models m
   set fields = (
     select jsonb_agg(case when s.opt and s.n = 1 then s.f || '{"group": "تعمّق إن شئت"}'::jsonb else s.f end order by s.opt, s.ord)
       from (select e.f, e.ord, coalesce(e.f->>'required', 'true') = 'false' and not e.f ? 'required_after' and not e.f ? 'required_from' as opt,
                    row_number() over (partition by coalesce(e.f->>'required', 'true') = 'false' and not e.f ? 'required_after' and not e.f ? 'required_from' order by e.ord) n
               from jsonb_array_elements(m.fields) with ordinality as e(f, ord)) s
   )
 where m.key = 'initiative-charter'
   and not exists (select 1 from jsonb_array_elements(m.fields) f where f ? 'group')
   and exists (select 1 from jsonb_array_elements(m.fields) f where f->>'required' = 'false');

-- ════════════ 7) نصوص ملفات التعريف ════════════
-- مصدرها supabase/content/tracks/v2/profiles.json (مُحدَّث معه)، ونسختها في tracks.journey_ar لكل مسار من الملف.
-- استبدال جملة بجملة في الجدولين معًا، مشروط بوجود الأصل وغياب البديل، فلا يُمس نص حرّرته الإدارة بغير هذه الجملة
create or replace function pg_temp.lm_swap(pkey text, a text, b text)
returns void language sql as $f$
  update leaders.track_profiles set journey_ar = replace(journey_ar, a, b) where key = pkey and strpos(journey_ar, a) > 0 and strpos(journey_ar, b) = 0;
  update leaders.tracks set journey_ar = replace(journey_ar, a, b) where profile_key = pkey and strpos(journey_ar, a) > 0 and strpos(journey_ar, b) = 0;
$f$;
select pg_temp.lm_swap('leadership-beginner',
  'في خريطة أصحاب المصلحة، والحوكمة والمسؤوليات، وقيادة التغيير والاستدامة، وخطة التطوير القيادي، وقصة التحول.',
  'في خريطة أصحاب المصلحة، وقيادة التغيير والاستدامة، وقصة التحول.');
select pg_temp.lm_swap('impact-intermediate',
  'بافتراضها الأضعف وطريقة اختباره مبكرًا، مع سجل المنافع.',
  'بافتراضها الأضعف وطريقة اختباره مبكرًا، مع سجل المنافع وتقرير الأثر.');
select pg_temp.lm_swap('impact-intermediate',
  'وفي كل فصل من فصوله الأربعة سؤال تعمق إضافي.',
  'وفي المبرر والبدائل، ونظرية التغيير، وسجل المنافع، وخطة القياس والأدلة سؤال تعمق إضافي.');
select pg_temp.lm_swap('impact-advanced',
  'سؤال تعمق إضافي: المبرر والبدائل، ونظرية التغيير، وسجل المنافع، وخطة القياس والأدلة.',
  'سؤال تعمق إضافي: المبرر والبدائل، ونظرية التغيير، وسجل المنافع، وخطة القياس والأدلة، وتقرير الأثر.');

insert into leaders.schema_migrations (name) values ('20261128140000_leaders_level_matrix') on conflict do nothing;
