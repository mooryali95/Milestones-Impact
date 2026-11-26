-- deploy-gate: tolerant محتوى نماذج فقط. خاصيتان لا تقرؤهما الدوال الأقدم (label_beginner وhint_beginner)، فتعرض العنوان والتلميح
-- كما كانا. لا يتغير بها مطلوب ولا جاهزية. إن احتجت المحتوى كما كان فشغّل سطر restore أدناه (RUNBOOK.md §2).
-- ════════════════════════════════════════════════════════════════
-- تخفيف وثيقة المبادرة للتأسيسي، المرحلة 3: عناوين أسئلة وتلميح لكل حقل
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-26-تصور-تخفيف-المبادرة-للتأسيسي-v1.md §5 البند 3 (اعتمده المالك 2026-11-26).
-- للتأسيسي وحده (fieldsFor): العنوان سؤال مباشر، والتلميح بلغة بسيطة يعرّف المصطلح في سطر (خط الأساس، والمعلم، والخطر...)،
-- وتلميح المعالم يطلب خمسة بأنواع بسيطة بعد أن كان يطلب ثمانية بأنواع تعاقدية وحوكمية. المتوسط والاحترافي كما هما.
-- كل خطوة مشروطة بوجود الفصل والحقل وبألا يحمل الحقل عنوانًا للتأسيسي، فلا يُكتب فوق ما عدّلته الإدارة. آمن لإعادة التشغيل.

-- restore: update leaders.learning_models m set fields = b.b::jsonb from leaders.backup_20261129_beginner_language b where m.key = b.ref
create table if not exists leaders.backup_20261129_beginner_language as
  select key ref, fields::text b from leaders.learning_models
   where key in ('initiative-charter', 'options-analysis', 'milestone-register', 'schedule', 'cost-plan', 'impact-report',
                 'stakeholder-map', 'raid', 'theory-of-change', 'benefits-register', 'change-sustain', 'transformation-story');
alter table leaders.backup_20261129_beginner_language enable row level security;
revoke all on leaders.backup_20261129_beginner_language from anon, authenticated;

create or replace function pg_temp.bl_patch(mkey text, fkey text, patch jsonb)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(case when f->>'key' = fkey and not f ? 'label_beginner' then f || patch else f end order by ord)
                     from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
   where m.key = mkey and exists (select 1 from jsonb_array_elements(m.fields) f where f->>'key' = fkey and not f ? 'label_beginner');
$f$;

select pg_temp.bl_patch('initiative-charter', 'title', '{"label_beginner": "ما اسم مبادرتك؟", "hint_beginner": "اسم قصير يُفهم منه ما تفعله، يظهر في كل فصول وثيقتك. مثال: ساعة رقمية لكبار السن في الحي"}');
select pg_temp.bl_patch('initiative-charter', 'objective', '{"label_beginner": "ما الهدف الأكبر الذي تخدمه مبادرتك؟", "hint_beginner": "الهدف الأعلى: هدف جهة أو حي أو مجتمع تعرفه تخدمه مبادرتك. مثال: أن يصل كبار السن في الحي إلى الخدمات الرقمية بأنفسهم"}');
select pg_temp.bl_patch('initiative-charter', 'problem', '{"label_beginner": "ما المشكلة، وبأي رقم تعرفها؟", "hint_beginner": "الرقم اليوم ومن أين عرفته. مثال: 18 من 25 مسنًا في الحي يطلبون من غيرهم حجز مواعيدهم (حصر الجمعية 2026)"}');
select pg_temp.bl_patch('initiative-charter', 'in_scope', '{"label_beginner": "ماذا ستقدم المبادرة؟", "hint_beginner": "ما ستفعله فعلًا في مدتها، في سطرين أو ثلاثة. مثال: لقاء أسبوعي لتعليم تطبيقين، ومتطوع يرد على الأسئلة"}');
select pg_temp.bl_patch('initiative-charter', 'out_scope', '{"label_beginner": "ما الذي لن تقدمه المبادرة؟", "hint_beginner": "ما قد يتوقعه أحد ولن تقدمه. مثال: لن نصلح الأجهزة ولن نشتري هواتف"}');
select pg_temp.bl_patch('initiative-charter', 'deliverables', '{"label_beginner": "ما الذي ستسلّمه، ومتى؟", "hint_beginner": "المخرج: شيء تسلّمه ويُرى. وكيف تعرف أنه اكتمل في جملة، والموعد بالأسبوع من البداية: «الأسبوع 6»"}');
select pg_temp.bl_patch('initiative-charter', 'end', '{"label_beginner": "متى تنتهي المبادرة؟", "hint_beginner": "بالأسبوع من انطلاقها، مثل «الأسبوع 12»، أو بالتاريخ"}');
select pg_temp.bl_patch('initiative-charter', 'sponsor', '{"label_beginner": "من يدعم مبادرتك، وماذا يقرر؟", "hint_beginner": "الراعي: صاحب قرار يدعم المبادرة، بمنصبه أو صفته لا باسمه. مثال: رئيس الجمعية يوافق على القاعة. اختياري"}');
select pg_temp.bl_patch('options-analysis', 'evidence', '{"label_beginner": "ما الدليل على أن المشكلة حقيقية؟", "hint_beginner": "المؤشر: رقم يدل على المشكلة. رقم واحد من مصدر تعرفه يكفي، مثل حصر أو استبيان أو سجل"}');
select pg_temp.bl_patch('options-analysis', 'options', '{"label_beginner": "ما الحلول الممكنة؟", "hint_beginner": "ابدأ بـ«عدم التدخل» (أن يبقى الوضع كما هو) ليقارَن به، ثم حلًا آخر على الأقل، ولكل منها مزاياه وعيوبه في سطر"}');
select pg_temp.bl_patch('options-analysis', 'recommendation', '{"label_beginner": "أي حل اخترت، ولماذا؟", "hint_beginner": "قل لماذا يتفوق على غيره: نفع أكبر، أو كلفة أقل، أو أسرع أثرًا"}');
select pg_temp.bl_patch('milestone-register', 'goal', '{"label_beginner": "ما هدف المبادرة في جملة واحدة؟", "hint_beginner": "جملة تبدأ بفعل وفيها رقم. مثال: أن يحجز 20 مسنًا مواعيدهم بأنفسهم خلال 12 أسبوعًا"}');
select pg_temp.bl_patch('milestone-register', 'milestones', '{"label_beginner": "ما المحطات الكبرى في الطريق؟", "hint_beginner": "المعلم: محطة تعرف عندها أنك تقدمت، لا مهمة. خمسة معالم بسيطة تكفي (أربعة على الأقل): بداية، وتسليم، وقرار، ونتيجة. لكل معلم أسبوعه وكيف تتحقق منه"}');
select pg_temp.bl_patch('schedule', 'activities', '{"label_beginner": "ما الأنشطة، ومتى يبدأ كل منها وينتهي؟", "hint_beginner": "النشاط عمل تقوم به. اكتب البداية والنهاية بالأسبوع من انطلاق المبادرة، ويجوز أن يبدأ نشاط في أسبوع انتهاء ما قبله"}');
select pg_temp.bl_patch('cost-plan', 'items', '{"label_beginner": "ماذا تحتاج، وكم يكلف؟", "hint_beginner": "ما تحتاجه وكلفته بالريال رقمًا فقط. ما يأتيك تبرعًا اكتب كلفته 0"}');
select pg_temp.bl_patch('cost-plan', 'envelope', '{"label_beginner": "كم المبلغ المتاح للمبادرة؟", "hint_beginner": "رقم فقط بالريال، ولو تقديرًا. اكتب 0 إن كانت تطوعية بلا ميزانية"}');
select pg_temp.bl_patch('cost-plan', 'funding', '{"label_beginner": "من أين يأتي المال، ومن يوافق عليه؟", "hint_beginner": "مثال: تبرع من الجمعية، ويوافق عليه أمين الصندوق. أو: تطوعية بلا تكلفة"}');
select pg_temp.bl_patch('impact-report', 'changes', '{"label_beginner": "ما الذي تغيّر بالأرقام؟", "hint_beginner": "قبل: الرقم قبل المبادرة (خط الأساس). بعد: الرقم الآن. إن لم يكتمل القياس فاكتب أول قراءة وتاريخها"}');
select pg_temp.bl_patch('impact-report', 'lessons', '{"label_beginner": "ماذا تعلمت للمبادرات القادمة؟", "hint_beginner": "درسان أو ثلاثة: ما نجح وتكرره، وما لم ينجح وتغيّره"}');
select pg_temp.bl_patch('stakeholder-map', 'stakeholders', '{"label_beginner": "من يهمه أمر المبادرة؟", "hint_beginner": "أصحاب المصلحة: كل من يتأثر بالمبادرة أو يؤثر فيها، مثل المستفيدين والمتطوعين وصاحب المكان. ثلاثة يكفون"}');
select pg_temp.bl_patch('raid', 'items', '{"label_beginner": "ما الذي قد يعطلك، وماذا ستفعل؟", "hint_beginner": "الخطر: شيء قد يحدث فيعطل المبادرة. اكتب ثلاثة، ولكل منها ما ستفعله إن حدث"}');
select pg_temp.bl_patch('theory-of-change', 'impact', '{"label_beginner": "ما الأثر البعيد الذي تريده؟", "hint_beginner": "الأثر: ما يتغير في حياة الناس بعد سنة أو أكثر. مثال: كبار السن في الحي أقل اعتمادًا على غيرهم"}');
select pg_temp.bl_patch('theory-of-change', 'chain', '{"label_beginner": "كيف يؤدي عملك إلى هذا الأثر؟", "hint_beginner": "أربعة أسطر بالترتيب: الأنشطة (ما تفعله)، فالمخرجات (ما تسلّمه)، فالنتائج (ما يتغير قريبًا)، فالأثر (ما يتغير بعيدًا)"}');
select pg_temp.bl_patch('benefits-register', 'benefits', '{"label_beginner": "ما المنفعة، وكيف تقيسها؟", "hint_beginner": "المنفعة تحسن يشعر به الناس. الرقم اليوم هو خط الأساس، والمستهدف الرقم الذي تريده في نهاية المبادرة"}');
select pg_temp.bl_patch('change-sustain', 'handover', '{"label_beginner": "من يشغّل الحل بعد انتهاء المبادرة، وكيف تسلّمه له؟", "hint_beginner": "المنصب أو الجهة، وما ستسلّمه: قائمة، أو دليل قصير، أو لقاء تعريف"}');
select pg_temp.bl_patch('change-sustain', 'sustain', '{"label_beginner": "ما الذي يضمن أن يستمر النفع بعدك؟", "hint_beginner": "شيء واحد أو اثنان: متطوع بديل، أو موعد ثابت، أو جهة تتبنى المبادرة"}');
select pg_temp.bl_patch('transformation-story', 'before', '{"label_beginner": "أين كانت المبادرة، وأين كنت أنت في البداية؟", "hint_beginner": "سطران: حال المبادرة يوم بدأت، وما كنت تعرفه أو تخشاه"}');
select pg_temp.bl_patch('transformation-story', 'decisions', '{"label_beginner": "ما القرارات التي غيّرت مسار المبادرة؟", "hint_beginner": "قرار اتخذته أنت، وما الذي تغيّر بسببه. قراران يكفيان"}');
select pg_temp.bl_patch('transformation-story', 'lessons', '{"label_beginner": "ماذا تعلمت عن نفسك قائدًا؟", "hint_beginner": "وما ستفعله بشكل مختلف في المرة القادمة"}');

insert into leaders.schema_migrations (name) values ('20261129150000_leaders_beginner_language') on conflict do nothing;
