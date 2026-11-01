-- ════════════════════════════════════════════════════════════════
-- بنك الأسئلة v4.1: تعديلات تدقيق 31 أكتوبر 2026 (الملحق 2)
-- ════════════════════════════════════════════════════════════════
-- مولَّد بـ scripts/questions/build-migration.mjs من supabase/content/questions/v4.1/items.json
-- 75 صفًا معدّلًا في baseline-v4 وpost-v2 (40 رمزًا)؛ لا إضافة ولا حذف.
-- آمن لإعادة التشغيل: النسخ الاحتياطي لا يُعاد إنشاؤه، وإعادة ربط الإجابات مشروطة بالخيارات القديمة.

-- 1) نسخة احتياطية من صفوف الأداتين النشطتين قبل أي تعديل
create table if not exists leaders.questions_backup_20261101 as
  select q.* from leaders.questions q
  where q.instrument_id in (select id from leaders.instruments where key in ('baseline-v4', 'post-v2'));
alter table leaders.questions_backup_20261101 enable row level security;
comment on table leaders.questions_backup_20261101 is 'نسخة من leaders.questions (baseline-v4 و post-v2) قبل ترحيل v4.1 — للرجوع فقط';

-- 2) الإجابات المخزونة تشير إلى موضع الخيار (value.k)؛ عند إعادة الترتيب يُنقل الفهرس إلى الموضع الجديد
--    new[j] = old[order[j]]  ⇒  k_old = order[j] يصبح k_new = j
-- baseline-v4 / M-S3: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = 'e0e82972-f9b6-48f2-b532-dbe83785f05b'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"مطالبة الفريق بخطة تسريع لتعويض الأسابيع المتأخرة","score":1},{"label":"تحليل السبب الجذري للانزلاق قبل أي تعديل للخطة","score":4},{"label":"اعتماد التاريخ الجديد في خط الأساس وإبلاغ الراعي","score":1},{"label":"الاستمرار في المتابعة لأن تأخير كل تقرير محدود","score":0}]'::jsonb);
-- baseline-v4 / M-S2: C→A A→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 2 then 0 when 0 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = '6efaed27-bbc8-4192-b03a-b85dc9e1b05b'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"عبور مع تكليف المدير بعرض خطة تصحيح في الاجتماع الدوري القادم","score":2},{"label":"عبور مشروط بخطة تصحيح ومعلم مراجعة قريب","score":4},{"label":"إعادة عقد الجلسة بعد أسبوعين وقد حُدّث الجدول","score":1},{"label":"عبور مع طلب اعتماد خط أساس معدل بالتاريخ الجديد","score":1}]'::jsonb);
-- baseline-v4 / I-S5: A→A B→B D→C C→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 1 then 1 when 3 then 2 when 2 then 3 else (a.value->>'k')::int end))
 where a.question_id = 'e06a38f0-65aa-4e75-9916-ac585b4f4cf4'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"عدد الورش المنفذة لرواد الأعمال خلال العام","score":0},{"label":"نسبة المشاركين الراضين عن جودة الورش المقدمة","score":1},{"label":"نسبة المنشآت المستمرة بعد عامين من الدعم","score":4},{"label":"عدد طلبات الالتحاق بالبرنامج في كل دورة","score":0}]'::jsonb);
-- baseline-v4 / I-S2: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = '4211046c-2eb6-4d16-be04-e023a87b7333'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"الموافقة على التأجيل مع توثيق السبب في السجل","score":1},{"label":"تحليل السبب ثم قرار موثق بتصحيح المسار","score":4},{"label":"ضخ موارد إضافية لتعويض الفجوة في الدورة القادمة","score":1},{"label":"خفض مستهدف المنفعة ليتوافق مع الأداء الفعلي","score":0}]'::jsonb);
-- baseline-v4 / I-K6: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = 'b2ac61c5-8cdb-4728-b31e-daa563d6b987'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"قائمة الأنشطة وجدولها الزمني ومسؤولياتها","score":0},{"label":"المسار السببي من الأنشطة إلى الأثر","score":4},{"label":"توزيع الميزانية على المخرجات بحسب أولويتها","score":0},{"label":"مؤشرات الأداء الشهرية لكل فريق من فرق البرنامج","score":0}]'::jsonb);
-- baseline-v4 / I-K7: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = 'e0b500a8-95af-41a2-8cc0-e921db3f0d96'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"منفعة متوقعة لم تتحقق في موعدها المحدد","score":0},{"label":"نتيجة يراها طرف سلبية وتنتج عن التغيير","score":4},{"label":"تكلفة إضافية تتجاوز الميزانية المعتمدة","score":0},{"label":"منفعة تحققت لكن لا يمكن قياسها بدقة كافية","score":0}]'::jsonb);
-- baseline-v4 / L-S4: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = '489695c3-85df-4812-a94b-78bab065d2b4'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"اجتماع أسبوعي لاطلاعه على سير المشروع","score":1},{"label":"إحاطة موجزة عند كل نقطة قرار تخص جهته","score":4},{"label":"الاكتفاء بنسخة من التقرير الشهري العام","score":1},{"label":"التواصل معه عند ظهور مشكلة كبيرة","score":0}]'::jsonb);
-- baseline-v4 / L-S2: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = 'd1caf792-8dbb-493e-ab6c-e66dac5c8e30'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"حسم المورد لصالح مشروعك عبر الإدارة العليا","score":1},{"label":"جلسة مشتركة لبناء حل يلبي حاجة الطرفين","score":4},{"label":"تقاسم المورد مناصفة لإنهاء الخلاف سريعًا","score":1},{"label":"اقتراح جدول تناوب على المورد يعتمده المديران","score":2}]'::jsonb);
-- baseline-v4 / L-K5: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = '84823854-7c70-4cad-97dd-496ace4b9ffd'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"رفع الأمر إلى الإدارة العليا لإلزامها بالتعاون","score":0},{"label":"ربط طلبه بمصلحة تهم تلك الإدارة نفسها","score":4},{"label":"الاستناد إلى أقدميته وخبرته الطويلة في الجهة","score":0},{"label":"تكرار الطلب رسميًا حتى تستجيب الإدارة","score":0}]'::jsonb);
-- baseline-v4 / L-K6B: B→A C→B D→C A→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 1 then 0 when 2 then 1 when 3 then 2 when 0 then 3 else (a.value->>'k')::int end))
 where a.question_id = 'c74bc7aa-a5fc-41a9-a1ab-234767d83b26'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"أن يعترف بأخطائه ويشكر من ينبّه إلى خلل","score":4},{"label":"أن يتجنب الخلاف داخل الفريق حفاظًا على الانسجام","score":0},{"label":"أن يعد الفريق بعدم تغيير المهام حتى نهاية المشروع","score":0},{"label":"أن يحمي الفريق من أي ملاحظة تأتي من خارجه","score":0}]'::jsonb);
-- baseline-v4 / L-K7: B→A A→B C→C D→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 1 then 0 when 0 then 1 when 2 then 2 when 3 then 3 else (a.value->>'k')::int end))
 where a.question_id = 'cdd754df-6872-4ccd-8003-1a4534743884'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"التحويلية تحل محل التبادلية لأن المكافأة تضعف الدافع","score":0},{"label":"التحويلية تُبنى فوق تبادلية سليمة: توقعات واضحة ومكافأة عادلة","score":4},{"label":"التبادلية للفرق الجديدة، والتحويلية للفرق المتمرسة فقط","score":0},{"label":"هما أسلوبان متعارضان، يختار القائد أحدهما بحسب شخصيته","score":0}]'::jsonb);
-- baseline-v4 / L-K8B: A→A C→B B→C D→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 1 then 2 when 3 then 3 else (a.value->>'k')::int end))
 where a.question_id = 'be54f4b0-e492-43a7-b6c8-a86896406190'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"الالتزام","score":0},{"label":"المواءمة","score":4},{"label":"التوجيه","score":0},{"label":"لا شيء منها، فهذه مشكلة تخطيط لا قيادة","score":0}]'::jsonb);
-- post-v2 / M-S3: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = '55bbf4d1-d423-4d4c-9beb-8db329dcb367'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"مطالبة الفريق بخطة تسريع لتعويض الأسابيع المتأخرة","score":1},{"label":"تحليل السبب الجذري للانزلاق قبل أي تعديل للخطة","score":4},{"label":"اعتماد التاريخ الجديد في خط الأساس وإبلاغ الراعي","score":1},{"label":"الاستمرار في المتابعة لأن تأخير كل تقرير محدود","score":0}]'::jsonb);
-- post-v2 / M-S2: C→A A→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 2 then 0 when 0 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = '94f66850-40eb-49e5-85a5-b287a57848ab'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"عبور مع تكليف المدير بعرض خطة تصحيح في الاجتماع الدوري القادم","score":2},{"label":"عبور مشروط بخطة تصحيح ومعلم مراجعة قريب","score":4},{"label":"إعادة عقد الجلسة بعد أسبوعين وقد حُدّث الجدول","score":1},{"label":"عبور مع طلب اعتماد خط أساس معدل بالتاريخ الجديد","score":1}]'::jsonb);
-- post-v2 / I-S5: A→A B→B D→C C→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 1 then 1 when 3 then 2 when 2 then 3 else (a.value->>'k')::int end))
 where a.question_id = '4e676472-b221-4209-8290-92cf2dc081ef'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"عدد الورش المنفذة لرواد الأعمال خلال العام","score":0},{"label":"نسبة المشاركين الراضين عن جودة الورش المقدمة","score":1},{"label":"نسبة المنشآت المستمرة بعد عامين من الدعم","score":4},{"label":"عدد طلبات الالتحاق بالبرنامج في كل دورة","score":0}]'::jsonb);
-- post-v2 / I-S2: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = '50541e3a-8a22-468f-964f-55e53ad8d002'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"الموافقة على التأجيل مع توثيق السبب في السجل","score":1},{"label":"تحليل السبب ثم قرار موثق بتصحيح المسار","score":4},{"label":"ضخ موارد إضافية لتعويض الفجوة في الدورة القادمة","score":1},{"label":"خفض مستهدف المنفعة ليتوافق مع الأداء الفعلي","score":0}]'::jsonb);
-- post-v2 / I-K6: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = '5411a5b6-38c8-4fb2-be06-bc023f6dc2ee'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"قائمة الأنشطة وجدولها الزمني ومسؤولياتها","score":0},{"label":"المسار السببي من الأنشطة إلى الأثر","score":4},{"label":"توزيع الميزانية على المخرجات بحسب أولويتها","score":0},{"label":"مؤشرات الأداء الشهرية لكل فريق من فرق البرنامج","score":0}]'::jsonb);
-- post-v2 / I-K7: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = '8a2127b6-946a-47f7-8861-3f69dfc91f73'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"منفعة متوقعة لم تتحقق في موعدها المحدد","score":0},{"label":"نتيجة يراها طرف سلبية وتنتج عن التغيير","score":4},{"label":"تكلفة إضافية تتجاوز الميزانية المعتمدة","score":0},{"label":"منفعة تحققت لكن لا يمكن قياسها بدقة كافية","score":0}]'::jsonb);
-- post-v2 / L-S4: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = '7d646822-d68e-4240-bb7c-817d39a7e63e'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"اجتماع أسبوعي لاطلاعه على سير المشروع","score":1},{"label":"إحاطة موجزة عند كل نقطة قرار تخص جهته","score":4},{"label":"الاكتفاء بنسخة من التقرير الشهري العام","score":1},{"label":"التواصل معه عند ظهور مشكلة كبيرة","score":0}]'::jsonb);
-- post-v2 / L-S2: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = '7be9cb60-dee7-40e8-b273-cdaacb69d9ee'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"حسم المورد لصالح مشروعك عبر الإدارة العليا","score":1},{"label":"جلسة مشتركة لبناء حل يلبي حاجة الطرفين","score":4},{"label":"تقاسم المورد مناصفة لإنهاء الخلاف سريعًا","score":1},{"label":"اقتراح جدول تناوب على المورد يعتمده المديران","score":2}]'::jsonb);
-- post-v2 / L-K5: A→A C→B D→C B→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 3 then 2 when 1 then 3 else (a.value->>'k')::int end))
 where a.question_id = '9c84537a-36eb-498d-b6fe-d14f1b622db7'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"رفع الأمر إلى الإدارة العليا لإلزامها بالتعاون","score":0},{"label":"ربط طلبه بمصلحة تهم تلك الإدارة نفسها","score":4},{"label":"الاستناد إلى أقدميته وخبرته الطويلة في الجهة","score":0},{"label":"تكرار الطلب رسميًا حتى تستجيب الإدارة","score":0}]'::jsonb);
-- post-v2 / L-K6B: B→A C→B D→C A→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 1 then 0 when 2 then 1 when 3 then 2 when 0 then 3 else (a.value->>'k')::int end))
 where a.question_id = '448ff781-5291-495d-9f62-b9831fe6e58f'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"أن يعترف بأخطائه ويشكر من ينبّه إلى خلل","score":4},{"label":"أن يتجنب الخلاف داخل الفريق حفاظًا على الانسجام","score":0},{"label":"أن يعد الفريق بعدم تغيير المهام حتى نهاية المشروع","score":0},{"label":"أن يحمي الفريق من أي ملاحظة تأتي من خارجه","score":0}]'::jsonb);
-- post-v2 / L-K7: B→A A→B C→C D→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 1 then 0 when 0 then 1 when 2 then 2 when 3 then 3 else (a.value->>'k')::int end))
 where a.question_id = '38f2923f-b7a1-4ec9-8bd5-265cf331a025'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"التحويلية تحل محل التبادلية لأن المكافأة تضعف الدافع","score":0},{"label":"التحويلية تُبنى فوق تبادلية سليمة: توقعات واضحة ومكافأة عادلة","score":4},{"label":"التبادلية للفرق الجديدة، والتحويلية للفرق المتمرسة فقط","score":0},{"label":"هما أسلوبان متعارضان، يختار القائد أحدهما بحسب شخصيته","score":0}]'::jsonb);
-- post-v2 / L-K8B: A→A C→B B→C D→D
update leaders.assessment_answers a
   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int when 0 then 0 when 2 then 1 when 1 then 2 when 3 then 3 else (a.value->>'k')::int end))
 where a.question_id = '1c430630-698e-4096-b893-931a90c10a51'
   and jsonb_typeof(a.value->'k') = 'number'
   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = '[{"label":"الالتزام","score":0},{"label":"المواءمة","score":4},{"label":"التوجيه","score":0},{"label":"لا شيء منها، فهذه مشكلة تخطيط لا قيادة","score":0}]'::jsonb);

-- 3) الصفوف المعدّلة (بالمعرّف)
-- baseline-v4 / M-S3
update leaders.questions set options = '[{"label":"مطالبة الفريق بخطة تسريع لتعويض الأسابيع المتأخرة","score":1},{"label":"اعتماد التاريخ الجديد في خط الأساس وإبلاغ الراعي","score":1},{"label":"الاستمرار في المتابعة لأن تأخير كل تقرير محدود","score":0},{"label":"تحليل السبب الجذري للانزلاق قبل أي تعديل للخطة","score":4}]'::jsonb where id = 'e0e82972-f9b6-48f2-b532-dbe83785f05b';
-- baseline-v4 / M-S4
update leaders.questions set options = '[{"label":"التفاوض مع المانح على تقرير فصلي بدل الشهري","score":2},{"label":"ربط مواعيد التقارير بمعالم القرار الداخلية","score":4},{"label":"إسناد التقارير لموظف متخصص بعيدًا عن الفريق","score":1},{"label":"دمج التقارير في تقرير سنوي واحد شامل","score":0}]'::jsonb where id = '7eeff23e-925e-4596-b2fe-bb134c063bc8';
-- baseline-v4 / M-S2
update leaders.questions set options = '[{"label":"إعادة عقد الجلسة بعد أسبوعين وقد حُدّث الجدول","score":1},{"label":"عبور مع خطة تصحيح تُعرض في الاجتماع الدوري القادم","score":2},{"label":"عبور مع طلب اعتماد خط أساس معدل بالتاريخ الجديد","score":1},{"label":"عبور مشروط بخطة تصحيح ومعلم مراجعة خلال أسبوعين","score":4}]'::jsonb where id = '6efaed27-bbc8-4192-b03a-b85dc9e1b05b';
-- baseline-v4 / M-S6
update leaders.questions set options = '[{"label":"تفعيل خطة الاستجابة المسجلة وإبلاغ أصحاب القرار","score":4},{"label":"مطالبة المورد بخطة تعافٍ مكتوبة قبل تحديث الجدول","score":2},{"label":"تحديث الجدول بالتاريخ الجديد وذكره في التقرير الشهري","score":1},{"label":"مطالبة المورد بغرامة التأخير المنصوص عليها في العقد","score":1}]'::jsonb where id = '325a4592-5ebc-4ae9-b9b9-3d5608df47e5';
-- baseline-v4 / M-S6B
update leaders.questions set options = '[{"label":"طلب إعادة الفريق الرئيسي من مدير المشروع الآخر","score":1},{"label":"تأجيل الإطلاق أسبوعين لتهيئة فريق جديد من الداخل","score":1},{"label":"تفعيل الفريق المساند وإبلاغ أصحاب القرار","score":4},{"label":"تقييم قدرة الفريق المساند ثم إبلاغ أصحاب القرار لاحقًا","score":2}]'::jsonb where id = '52d57444-1a8d-4385-a6b5-50b4f91d6c17';
-- baseline-v4 / M-K2B
update leaders.questions set text_ar = 'في مشروع تحوّل رقمي، أي النقاط التالية تمثل بوابة مرحلة (Stage Gate)؟', options = '[{"label":"اجتماع الفريق الأسبوعي لمتابعة المهام والمخاطر","score":0},{"label":"تسليم المورد النسخة الأولى من النظام للاختبار","score":0},{"label":"رفع تقرير الإنجاز الشهري إلى الإدارة العليا","score":0},{"label":"اعتماد اللجنة لنتائج التجربة قبل التعميم","score":4}]'::jsonb where id = 'ef263e5a-b5aa-493b-b9c2-f7ebdbd77dba';
-- baseline-v4 / M-K6
update leaders.questions set options = '[{"label":"منع التعديل على النطاق بعد اعتماده","score":0},{"label":"تقييم أثر التغيير قبل اعتماده أو رفضه","score":4},{"label":"توثيق التغييرات بعد تنفيذها لأغراض التدقيق","score":0},{"label":"إحالة طلبات التغيير إلى الراعي ليقررها","score":0}]'::jsonb where id = 'd9f4e723-6927-42c1-9bd9-9842e6f546bb';
-- baseline-v4 / M-K8B
update leaders.questions set options = '[{"label":"ليبقى مرجعًا يُقاس عليه الانحراف","score":4},{"label":"لأن تعديله يُعيد احتساب الميزانية","score":0},{"label":"لتقليل التقارير المطلوبة من الفريق","score":0},{"label":"لأن الراعي هو من يحتفظ بالنسخة المعتمدة منه","score":0}]'::jsonb where id = '506006c4-d400-481e-b291-fd42083fd91c';
-- baseline-v4 / I-S1
update leaders.questions set options = '[{"label":"تدريب 500 متدرب خلال العام بنسبة حضور 95%","score":0},{"label":"رفع توظيف الخريجين من 30% إلى 45% خلال 12 شهرًا","score":4},{"label":"رضا المتدربين عن الدورة بنسبة 90% في الاستبانة","score":1},{"label":"ارتفاع ثقة المتدربين بقدراتهم بعد الدورة","score":1}]'::jsonb where id = 'ad541e73-bc42-40bd-b321-8e3ad394d6c8';
-- baseline-v4 / I-S4
update leaders.questions set options = '[{"label":"بناء خط أساس فوري بالبيانات المتاحة وتوثيق قيوده","score":4},{"label":"اعتماد أول قياس بعد ثلاثة أشهر خطًا للأساس","score":1},{"label":"الاكتفاء بقياس المخرجات حتى نهاية البرنامج","score":0},{"label":"تقديرات الفريق للوضع السابق دون توثيق مصدرها","score":1}]'::jsonb where id = '1805e31a-dd7d-4743-9b5d-d587e40343de';
-- baseline-v4 / I-S5
update leaders.questions set options = '[{"label":"عدد الورش المنفذة لرواد الأعمال خلال العام","score":0},{"label":"نسبة المشاركين الراضين عن جودة الورش المقدمة","score":1},{"label":"عدد طلبات الالتحاق بالبرنامج في كل دورة","score":0},{"label":"نسبة المنشآت المستمرة بعد عامين من الدعم","score":4}]'::jsonb where id = 'e06a38f0-65aa-4e75-9916-ac585b4f4cf4';
-- baseline-v4 / I-S2
update leaders.questions set options = '[{"label":"الموافقة على التأجيل مع توثيق السبب في السجل","score":1},{"label":"ضخ موارد إضافية لتعويض الفجوة في الدورة القادمة","score":1},{"label":"خفض مستهدف المنفعة ليتوافق مع الأداء الفعلي","score":0},{"label":"تحليل السبب ثم قرار موثق بتصحيح المسار","score":4}]'::jsonb where id = '4211046c-2eb6-4d16-be04-e023a87b7333';
-- baseline-v4 / I-S2B
update leaders.questions set options = '[{"label":"رفع مستهدف المنفعة للعام القادم بناءً على الأداء","score":1},{"label":"التحقق من دقة القياس وسبب التسارع قبل التعميم","score":4},{"label":"إعلان النتيجة في التقرير السنوي كما وردت","score":1},{"label":"إيقاف قياس المنفعة لأنها تحققت قبل موعدها","score":0}]'::jsonb where id = 'fefa770d-3c45-475c-beae-e9861c5147e7';
-- baseline-v4 / I-S3B
update leaders.questions set options = '[{"label":"أعرضه كما هو لأنه قياس فعلي","score":1},{"label":"أعمّم الرقم على المسجلين جميعًا لأن المكملين عينة ممثلة","score":0},{"label":"أعرضه مع نسبة المنسحبين موضحًا أنه يخص المكملين فقط","score":4},{"label":"أستبدله بعدد المسجلين في البرنامج لأنه أدق","score":0}]'::jsonb where id = 'aa21387d-ee94-404e-bbc0-f99ea728286f';
-- baseline-v4 / I-K1
update leaders.questions set text_ar = '«ارتفاع معرفة المتدربين بالمهارة المستهدفة بعد انتهاء الدورة» يقع في أي مستوى من سلسلة النتائج؟' where id = '66c0a52e-400d-4e94-b615-6c5574676843';
-- baseline-v4 / I-K1B
update leaders.questions set text_ar = '«تدريب 200 موظف على نظام المشتريات الجديد» يقع في أي مستوى من سلسلة النتائج؟' where id = 'db984245-e41c-4271-90a9-3dd3ce8e2640';
-- baseline-v4 / I-K2
update leaders.questions set text_ar = 'في أي حالة تكون لغة «المساهمة» أدق من «الإسناد» في تقرير الأثر؟' where id = '4aa20897-8baa-4f78-9d02-e6849c695aaf';
-- baseline-v4 / I-K5
update leaders.questions set text_ar = 'أي عنصر ينقص المؤشر التالي: «رفع نسبة رضا المستفيدين إلى 85% بنهاية 2027»؟', options = '[{"label":"خط الأساس للقياس","score":4},{"label":"الجهة المستفيدة منه","score":0},{"label":"وحدة قياس المؤشر","score":0},{"label":"مصدر بيانات القياس","score":0}]'::jsonb where id = '946aded7-5ca2-4d73-88ae-2175127b17d8';
-- baseline-v4 / I-K5B
update leaders.questions set text_ar = 'أي عنصر ينقص المؤشر التالي: «خفض زمن إنجاز المعاملة من 10 أيام إلى 4 أيام»؟' where id = 'd1cc4a43-0710-4769-80cf-dbbc1b46862b';
-- baseline-v4 / I-K6
update leaders.questions set options = '[{"label":"قائمة الأنشطة وجدولها الزمني ومسؤولياتها","score":0},{"label":"توزيع الميزانية على المخرجات بحسب أولويتها","score":0},{"label":"مؤشرات الأداء الشهرية لكل فريق من فرق البرنامج","score":0},{"label":"المسار السببي من الأنشطة إلى الأثر","score":4}]'::jsonb where id = 'b2ac61c5-8cdb-4728-b31e-daa563d6b987';
-- baseline-v4 / I-K6B
update leaders.questions set options = '[{"label":"كم تكلفة أنشطة البرنامج؟","score":0},{"label":"من المسؤول عن تنفيذ المهام في المرحلة؟","score":0},{"label":"لماذا نتوقع أن تؤدي أنشطتنا إلى الأثر؟","score":4},{"label":"متى تُسلَّم مخرجات البرنامج للجهة؟","score":0}]'::jsonb where id = '6eb60a17-285a-41a3-ab65-de9476fde811';
-- baseline-v4 / I-K7
update leaders.questions set options = '[{"label":"منفعة متوقعة لم تتحقق في موعدها المحدد","score":0},{"label":"تكلفة إضافية تتجاوز الميزانية المعتمدة","score":0},{"label":"أثر جانبي إيجابي لم يُخطط له","score":0},{"label":"نتيجة يراها طرف سلبية وتنتج عن التغيير","score":4}]'::jsonb where id = 'e0b500a8-95af-41a2-8cc0-e921db3f0d96';
-- baseline-v4 / L-S4
update leaders.questions set options = '[{"label":"اجتماع أسبوعي لإطلاعه على سير المشروع","score":1},{"label":"الاكتفاء بنسخة من التقرير الشهري العام","score":1},{"label":"التواصل معه عند ظهور مشكلة كبيرة","score":0},{"label":"إحاطة موجزة عند كل نقطة قرار تخص جهته","score":4}]'::jsonb where id = '489695c3-85df-4812-a94b-78bab065d2b4';
-- baseline-v4 / L-S6
update leaders.questions set text_ar = 'اتضح لك أن البرنامج لن يحقق مستهدفه السنوي، ومراجعة الأداء مع المسؤول الأعلى بعد ثلاثة أسابيع، وقرار ميزانية الربع القادم يُتخذ هذا الأسبوع. ما الأنسب؟' where id = '5ffeb838-de1e-4294-9d74-ec74a3244cb7';
-- baseline-v4 / L-S1
update leaders.questions set options = '[{"label":"تفويض المهمة مع موعد تسليم واضح","score":0},{"label":"تعليمات محددة ومتابعة قريبة","score":4},{"label":"تشجيعه ودعمه وترك طريقة التنفيذ له","score":1},{"label":"شرح المطلوب ثم مراجعة النسخة النهائية","score":1}]'::jsonb where id = '07722242-5c5d-4a76-bb13-e5eb8b660a13';
-- baseline-v4 / L-S2
update leaders.questions set options = '[{"label":"حسم المورد لصالح مشروعك عبر الإدارة العليا","score":1},{"label":"تقاسم المورد مناصفة لإنهاء الخلاف سريعًا","score":1},{"label":"اقتراح جدول تناوب على المورد يعتمده المديران","score":2},{"label":"جلسة مشتركة لبناء حل يلبي حاجة الطرفين","score":4}]'::jsonb where id = 'd1caf792-8dbb-493e-ab6c-e66dac5c8e30';
-- baseline-v4 / L-S5
update leaders.questions set options = '[{"label":"تسليمه الملفات مع محضر رسمي موقّع","score":1},{"label":"مرافقته في الاجتماعات والقرارات حتى يقودها بنفسه","score":4},{"label":"إعداد تقرير مفصل عن حالة المشروع وإرساله إليه","score":1},{"label":"الرد على أسئلته بعد انتقالك متى احتاج","score":1}]'::jsonb where id = '571bbcf7-9063-4f07-8eb7-177d759f6bda';
-- baseline-v4 / L-K2B
update leaders.questions set options = '[{"label":"تعليمات تفصيلية ومتابعة قريبة","score":0},{"label":"الدعم وإشراكه في القرار مع توجيه قليل","score":4},{"label":"تفويض المهمة مع مراجعة ختامية","score":0},{"label":"نقله إلى مهمة جديدة يتعلمها من البداية","score":0}]'::jsonb where id = 'f1a84f4d-8c5b-41f1-b01d-3e119b867af0';
-- baseline-v4 / L-K5
update leaders.questions set options = '[{"label":"رفع الأمر إلى الإدارة العليا لإلزامها بالتعاون","score":0},{"label":"الاستناد إلى أقدميته وخبرته الطويلة في الجهة","score":0},{"label":"تكرار الطلب رسميًا حتى تستجيب الإدارة","score":0},{"label":"ربط طلبه بمصلحة تهم تلك الإدارة نفسها","score":4}]'::jsonb where id = '84823854-7c70-4cad-97dd-496ace4b9ffd';
-- baseline-v4 / L-K6B
update leaders.questions set options = '[{"label":"أن يتجنب الخلاف داخل الفريق حفاظًا على الانسجام","score":0},{"label":"أن يعد الفريق بعدم تغيير المهام حتى نهاية المشروع","score":0},{"label":"أن يتولى الرد على ملاحظات الخارج بنفسه","score":0},{"label":"أن يعترف بأخطائه ويشكر من ينبّه إلى خلل","score":4}]'::jsonb where id = 'c74bc7aa-a5fc-41a9-a1ab-234767d83b26';
-- baseline-v4 / L-K7
update leaders.questions set text_ar = 'وفق نموذج المدى الكامل للقيادة عند باس وأفوليو (Bass & Avolio)، ما العلاقة بين القيادة التبادلية والتحويلية؟', options = '[{"label":"التحويلية تُبنى فوق تبادلية سليمة ولا تلغيها","score":4},{"label":"التحويلية تحل محل التبادلية لأن المكافأة تضعف الدافع","score":0},{"label":"التبادلية للفرق الجديدة والتحويلية للفرق المتمرسة","score":0},{"label":"أسلوبان متعارضان يختار القائد بينهما بحسب شخصيته","score":0}]'::jsonb where id = 'cdd754df-6872-4ccd-8003-1a4534743884';
-- baseline-v4 / L-K7B
update leaders.questions set options = '[{"label":"مكافآت أكبر مرتبطة بأهداف أعلى","score":0},{"label":"متابعة أدق للانحرافات قبل وقوعها","score":0},{"label":"ربط العمل بمعنى أكبر والاهتمام بنمو كل فرد","score":4},{"label":"تقليل المتابعة ليشعر الفريق بالثقة","score":0}]'::jsonb where id = '188df6e8-b2a3-4432-ab67-374f72997946';
-- baseline-v4 / L-K8
update leaders.questions set options = '[{"label":"رضا أعضاء الفريق عن قائدهم في الاستبانة السنوية","score":0},{"label":"اكتمال مهام الخطة في مواعيدها المعتمدة","score":0},{"label":"امتلاك القائد للصفات القيادية المعروفة","score":0},{"label":"توجيه مشترك ومواءمة والتزام بالهدف","score":4}]'::jsonb where id = 'b296beec-9e79-484a-8bb5-935513f28e68';
-- baseline-v4 / L-K8B
update leaders.questions set options = '[{"label":"الالتزام","score":0},{"label":"التوجيه","score":0},{"label":"المواءمة","score":4},{"label":"الثقة","score":0}]'::jsonb where id = 'be54f4b0-e492-43a7-b6c8-a86896406190';
-- baseline-v4 / L-K9B
update leaders.questions set options = '[{"label":"أن تكون عامة حتى لا تجرح الشخص المعني","score":0},{"label":"أن تصف سلوكًا محددًا وأثره، ثم تفتح حوارًا عن الحل","score":4},{"label":"أن تُقال في اجتماع الفريق ليستفيد الآخرون","score":0},{"label":"أن تُؤجل إلى التقييم السنوي لتكون شاملة","score":0}]'::jsonb where id = '358a2b96-3021-4317-9d23-94393d1f942a';
-- post-v2 / M-S3
update leaders.questions set options = '[{"label":"مطالبة الفريق بخطة تسريع لتعويض الأسابيع المتأخرة","score":1},{"label":"اعتماد التاريخ الجديد في خط الأساس وإبلاغ الراعي","score":1},{"label":"الاستمرار في المتابعة لأن تأخير كل تقرير محدود","score":0},{"label":"تحليل السبب الجذري للانزلاق قبل أي تعديل للخطة","score":4}]'::jsonb where id = '55bbf4d1-d423-4d4c-9beb-8db329dcb367';
-- post-v2 / M-S4
update leaders.questions set options = '[{"label":"التفاوض مع المانح على تقرير فصلي بدل الشهري","score":2},{"label":"ربط مواعيد التقارير بمعالم القرار الداخلية","score":4},{"label":"إسناد التقارير لموظف متخصص بعيدًا عن الفريق","score":1},{"label":"دمج التقارير في تقرير سنوي واحد شامل","score":0}]'::jsonb where id = '850a81e2-6ce4-4ae7-9eac-01674da5b444';
-- post-v2 / M-S2
update leaders.questions set options = '[{"label":"إعادة عقد الجلسة بعد أسبوعين وقد حُدّث الجدول","score":1},{"label":"عبور مع خطة تصحيح تُعرض في الاجتماع الدوري القادم","score":2},{"label":"عبور مع طلب اعتماد خط أساس معدل بالتاريخ الجديد","score":1},{"label":"عبور مشروط بخطة تصحيح ومعلم مراجعة خلال أسبوعين","score":4}]'::jsonb where id = '94f66850-40eb-49e5-85a5-b287a57848ab';
-- post-v2 / M-S6
update leaders.questions set options = '[{"label":"تفعيل خطة الاستجابة المسجلة وإبلاغ أصحاب القرار","score":4},{"label":"مطالبة المورد بخطة تعافٍ مكتوبة قبل تحديث الجدول","score":2},{"label":"تحديث الجدول بالتاريخ الجديد وذكره في التقرير الشهري","score":1},{"label":"مطالبة المورد بغرامة التأخير المنصوص عليها في العقد","score":1}]'::jsonb where id = 'f21bf4b7-241c-4317-b258-f3cf8b66b98e';
-- post-v2 / M-S6B
update leaders.questions set options = '[{"label":"طلب إعادة الفريق الرئيسي من مدير المشروع الآخر","score":1},{"label":"تأجيل الإطلاق أسبوعين لتهيئة فريق جديد من الداخل","score":1},{"label":"تفعيل الفريق المساند وإبلاغ أصحاب القرار","score":4},{"label":"تقييم قدرة الفريق المساند ثم إبلاغ أصحاب القرار لاحقًا","score":2}]'::jsonb where id = '492d6b4b-5ad1-4be7-9bcc-30e8f5a1ed35';
-- post-v2 / M-K2B
update leaders.questions set text_ar = 'في مشروع تحوّل رقمي، أي النقاط التالية تمثل بوابة مرحلة (Stage Gate)؟', options = '[{"label":"اجتماع الفريق الأسبوعي لمتابعة المهام والمخاطر","score":0},{"label":"تسليم المورد النسخة الأولى من النظام للاختبار","score":0},{"label":"رفع تقرير الإنجاز الشهري إلى الإدارة العليا","score":0},{"label":"اعتماد اللجنة لنتائج التجربة قبل التعميم","score":4}]'::jsonb where id = '182616d3-a075-4cdd-b0ff-3bacaa253b0d';
-- post-v2 / M-K6
update leaders.questions set options = '[{"label":"منع التعديل على النطاق بعد اعتماده","score":0},{"label":"تقييم أثر التغيير قبل اعتماده أو رفضه","score":4},{"label":"توثيق التغييرات بعد تنفيذها لأغراض التدقيق","score":0},{"label":"إحالة طلبات التغيير إلى الراعي ليقررها","score":0}]'::jsonb where id = '29932de9-840b-4b06-95bc-96ab079a24e3';
-- post-v2 / M-K8B
update leaders.questions set options = '[{"label":"ليبقى مرجعًا يُقاس عليه الانحراف","score":4},{"label":"لأن تعديله يُعيد احتساب الميزانية","score":0},{"label":"لتقليل التقارير المطلوبة من الفريق","score":0},{"label":"لأن الراعي هو من يحتفظ بالنسخة المعتمدة منه","score":0}]'::jsonb where id = '97a60cdc-3b3c-4920-9487-f8a9ff7389be';
-- post-v2 / I-S1
update leaders.questions set options = '[{"label":"تدريب 500 متدرب خلال العام بنسبة حضور 95%","score":0},{"label":"رفع توظيف الخريجين من 30% إلى 45% خلال 12 شهرًا","score":4},{"label":"رضا المتدربين عن الدورة بنسبة 90% في الاستبانة","score":1},{"label":"ارتفاع ثقة المتدربين بقدراتهم بعد الدورة","score":1}]'::jsonb where id = '876c875c-b864-4c0a-b7ad-634d53072e09';
-- post-v2 / I-S4
update leaders.questions set options = '[{"label":"بناء خط أساس فوري بالبيانات المتاحة وتوثيق قيوده","score":4},{"label":"اعتماد أول قياس بعد ثلاثة أشهر خطًا للأساس","score":1},{"label":"الاكتفاء بقياس المخرجات حتى نهاية البرنامج","score":0},{"label":"تقديرات الفريق للوضع السابق دون توثيق مصدرها","score":1}]'::jsonb where id = 'b8b2b1b5-af73-46b6-adfc-00c3307a8718';
-- post-v2 / I-S5
update leaders.questions set options = '[{"label":"عدد الورش المنفذة لرواد الأعمال خلال العام","score":0},{"label":"نسبة المشاركين الراضين عن جودة الورش المقدمة","score":1},{"label":"عدد طلبات الالتحاق بالبرنامج في كل دورة","score":0},{"label":"نسبة المنشآت المستمرة بعد عامين من الدعم","score":4}]'::jsonb where id = '4e676472-b221-4209-8290-92cf2dc081ef';
-- post-v2 / I-S2
update leaders.questions set options = '[{"label":"الموافقة على التأجيل مع توثيق السبب في السجل","score":1},{"label":"ضخ موارد إضافية لتعويض الفجوة في الدورة القادمة","score":1},{"label":"خفض مستهدف المنفعة ليتوافق مع الأداء الفعلي","score":0},{"label":"تحليل السبب ثم قرار موثق بتصحيح المسار","score":4}]'::jsonb where id = '50541e3a-8a22-468f-964f-55e53ad8d002';
-- post-v2 / I-S2B
update leaders.questions set options = '[{"label":"رفع مستهدف المنفعة للعام القادم بناءً على الأداء","score":1},{"label":"التحقق من دقة القياس وسبب التسارع قبل التعميم","score":4},{"label":"إعلان النتيجة في التقرير السنوي كما وردت","score":1},{"label":"إيقاف قياس المنفعة لأنها تحققت قبل موعدها","score":0}]'::jsonb where id = '82f9f1f2-e25d-439a-9eb7-d771bf04bb4c';
-- post-v2 / I-S3B
update leaders.questions set options = '[{"label":"أعرضه كما هو لأنه قياس فعلي","score":1},{"label":"أعمّم الرقم على المسجلين جميعًا لأن المكملين عينة ممثلة","score":0},{"label":"أعرضه مع نسبة المنسحبين موضحًا أنه يخص المكملين فقط","score":4},{"label":"أستبدله بعدد المسجلين في البرنامج لأنه أدق","score":0}]'::jsonb where id = '3576260c-e17c-4f5d-9de5-92af23f7c166';
-- post-v2 / I-K1
update leaders.questions set text_ar = '«ارتفاع معرفة المتدربين بالمهارة المستهدفة بعد انتهاء الدورة» يقع في أي مستوى من سلسلة النتائج؟' where id = 'b1ecbea2-d9ab-4a8c-af33-2e6bb0199598';
-- post-v2 / I-K1B
update leaders.questions set text_ar = '«تدريب 200 موظف على نظام المشتريات الجديد» يقع في أي مستوى من سلسلة النتائج؟' where id = '983107f7-4e0d-45d5-9295-21138124e87a';
-- post-v2 / I-K2
update leaders.questions set text_ar = 'في أي حالة تكون لغة «المساهمة» أدق من «الإسناد» في تقرير الأثر؟' where id = 'fb8bb37b-bd99-4b18-a6a5-594bc56c2f21';
-- post-v2 / I-K5
update leaders.questions set text_ar = 'أي عنصر ينقص المؤشر التالي: «رفع نسبة رضا المستفيدين إلى 85% بنهاية 2027»؟', options = '[{"label":"خط الأساس للقياس","score":4},{"label":"الجهة المستفيدة منه","score":0},{"label":"وحدة قياس المؤشر","score":0},{"label":"مصدر بيانات القياس","score":0}]'::jsonb where id = '5b125578-bfee-473a-8407-d0ef4256973d';
-- post-v2 / I-K5B
update leaders.questions set text_ar = 'أي عنصر ينقص المؤشر التالي: «خفض زمن إنجاز المعاملة من 10 أيام إلى 4 أيام»؟' where id = '6c2cd479-0a07-426c-94a2-e94a39891b1a';
-- post-v2 / I-K6
update leaders.questions set options = '[{"label":"قائمة الأنشطة وجدولها الزمني ومسؤولياتها","score":0},{"label":"توزيع الميزانية على المخرجات بحسب أولويتها","score":0},{"label":"مؤشرات الأداء الشهرية لكل فريق من فرق البرنامج","score":0},{"label":"المسار السببي من الأنشطة إلى الأثر","score":4}]'::jsonb where id = '5411a5b6-38c8-4fb2-be06-bc023f6dc2ee';
-- post-v2 / I-K6B
update leaders.questions set options = '[{"label":"كم تكلفة أنشطة البرنامج؟","score":0},{"label":"من المسؤول عن تنفيذ المهام في المرحلة؟","score":0},{"label":"لماذا نتوقع أن تؤدي أنشطتنا إلى الأثر؟","score":4},{"label":"متى تُسلَّم مخرجات البرنامج للجهة؟","score":0}]'::jsonb where id = '991ab04e-7874-481e-8d0d-0b721f0e31f1';
-- post-v2 / I-K7
update leaders.questions set options = '[{"label":"منفعة متوقعة لم تتحقق في موعدها المحدد","score":0},{"label":"تكلفة إضافية تتجاوز الميزانية المعتمدة","score":0},{"label":"أثر جانبي إيجابي لم يُخطط له","score":0},{"label":"نتيجة يراها طرف سلبية وتنتج عن التغيير","score":4}]'::jsonb where id = '8a2127b6-946a-47f7-8861-3f69dfc91f73';
-- post-v2 / L-S4
update leaders.questions set options = '[{"label":"اجتماع أسبوعي لإطلاعه على سير المشروع","score":1},{"label":"الاكتفاء بنسخة من التقرير الشهري العام","score":1},{"label":"التواصل معه عند ظهور مشكلة كبيرة","score":0},{"label":"إحاطة موجزة عند كل نقطة قرار تخص جهته","score":4}]'::jsonb where id = '7d646822-d68e-4240-bb7c-817d39a7e63e';
-- post-v2 / L-S6
update leaders.questions set text_ar = 'اتضح لك أن البرنامج لن يحقق مستهدفه السنوي، ومراجعة الأداء مع المسؤول الأعلى بعد ثلاثة أسابيع، وقرار ميزانية الربع القادم يُتخذ هذا الأسبوع. ما الأنسب؟' where id = '82530013-363d-46e1-bab8-7b295b02f412';
-- post-v2 / L-S1
update leaders.questions set options = '[{"label":"تفويض المهمة مع موعد تسليم واضح","score":0},{"label":"تعليمات محددة ومتابعة قريبة","score":4},{"label":"تشجيعه ودعمه وترك طريقة التنفيذ له","score":1},{"label":"شرح المطلوب ثم مراجعة النسخة النهائية","score":1}]'::jsonb where id = '88587b56-cb0f-4c77-a30f-a38a9c5dad60';
-- post-v2 / L-S2
update leaders.questions set options = '[{"label":"حسم المورد لصالح مشروعك عبر الإدارة العليا","score":1},{"label":"تقاسم المورد مناصفة لإنهاء الخلاف سريعًا","score":1},{"label":"اقتراح جدول تناوب على المورد يعتمده المديران","score":2},{"label":"جلسة مشتركة لبناء حل يلبي حاجة الطرفين","score":4}]'::jsonb where id = '7be9cb60-dee7-40e8-b273-cdaacb69d9ee';
-- post-v2 / L-S5
update leaders.questions set options = '[{"label":"تسليمه الملفات مع محضر رسمي موقّع","score":1},{"label":"مرافقته في الاجتماعات والقرارات حتى يقودها بنفسه","score":4},{"label":"إعداد تقرير مفصل عن حالة المشروع وإرساله إليه","score":1},{"label":"الرد على أسئلته بعد انتقالك متى احتاج","score":1}]'::jsonb where id = '82d8c9db-b680-47d8-ba48-06b8b57aabc2';
-- post-v2 / L-K2B
update leaders.questions set options = '[{"label":"تعليمات تفصيلية ومتابعة قريبة","score":0},{"label":"الدعم وإشراكه في القرار مع توجيه قليل","score":4},{"label":"تفويض المهمة مع مراجعة ختامية","score":0},{"label":"نقله إلى مهمة جديدة يتعلمها من البداية","score":0}]'::jsonb where id = '1cbe6291-2d11-425c-9545-6a3de35d3200';
-- post-v2 / L-K5
update leaders.questions set options = '[{"label":"رفع الأمر إلى الإدارة العليا لإلزامها بالتعاون","score":0},{"label":"الاستناد إلى أقدميته وخبرته الطويلة في الجهة","score":0},{"label":"تكرار الطلب رسميًا حتى تستجيب الإدارة","score":0},{"label":"ربط طلبه بمصلحة تهم تلك الإدارة نفسها","score":4}]'::jsonb where id = '9c84537a-36eb-498d-b6fe-d14f1b622db7';
-- post-v2 / L-K6B
update leaders.questions set options = '[{"label":"أن يتجنب الخلاف داخل الفريق حفاظًا على الانسجام","score":0},{"label":"أن يعد الفريق بعدم تغيير المهام حتى نهاية المشروع","score":0},{"label":"أن يتولى الرد على ملاحظات الخارج بنفسه","score":0},{"label":"أن يعترف بأخطائه ويشكر من ينبّه إلى خلل","score":4}]'::jsonb where id = '448ff781-5291-495d-9f62-b9831fe6e58f';
-- post-v2 / L-K7
update leaders.questions set text_ar = 'وفق نموذج المدى الكامل للقيادة عند باس وأفوليو (Bass & Avolio)، ما العلاقة بين القيادة التبادلية والتحويلية؟', options = '[{"label":"التحويلية تُبنى فوق تبادلية سليمة ولا تلغيها","score":4},{"label":"التحويلية تحل محل التبادلية لأن المكافأة تضعف الدافع","score":0},{"label":"التبادلية للفرق الجديدة والتحويلية للفرق المتمرسة","score":0},{"label":"أسلوبان متعارضان يختار القائد بينهما بحسب شخصيته","score":0}]'::jsonb where id = '38f2923f-b7a1-4ec9-8bd5-265cf331a025';
-- post-v2 / L-K7B
update leaders.questions set options = '[{"label":"مكافآت أكبر مرتبطة بأهداف أعلى","score":0},{"label":"متابعة أدق للانحرافات قبل وقوعها","score":0},{"label":"ربط العمل بمعنى أكبر والاهتمام بنمو كل فرد","score":4},{"label":"تقليل المتابعة ليشعر الفريق بالثقة","score":0}]'::jsonb where id = '8c22edb5-1eb9-4686-9ef4-83e48a02c946';
-- post-v2 / L-K8
update leaders.questions set options = '[{"label":"رضا أعضاء الفريق عن قائدهم في الاستبانة السنوية","score":0},{"label":"اكتمال مهام الخطة في مواعيدها المعتمدة","score":0},{"label":"امتلاك القائد للصفات القيادية المعروفة","score":0},{"label":"توجيه مشترك ومواءمة والتزام بالهدف","score":4}]'::jsonb where id = '900bac7b-fc19-4381-8ae8-e49db1afa4c3';
-- post-v2 / L-K8B
update leaders.questions set options = '[{"label":"الالتزام","score":0},{"label":"التوجيه","score":0},{"label":"المواءمة","score":4},{"label":"الثقة","score":0}]'::jsonb where id = '1c430630-698e-4096-b893-931a90c10a51';
-- post-v2 / L-K9B
update leaders.questions set options = '[{"label":"أن تكون عامة حتى لا تجرح الشخص المعني","score":0},{"label":"أن تصف سلوكًا محددًا وأثره، ثم تفتح حوارًا عن الحل","score":4},{"label":"أن تُقال في اجتماع الفريق ليستفيد الآخرون","score":0},{"label":"أن تُؤجل إلى التقييم السنوي لتكون شاملة","score":0}]'::jsonb where id = '77d74f2a-d4ff-46cd-9075-a5761756b880';
-- post-v2 / T-1
update leaders.questions set help_ar = 'تصف هذه العبارات تجربتك في البرنامج وبيئة عملك، لا أداءك.' where id = 'bdbaf393-57ae-4e38-a9b2-74effa844050';
-- post-v2 / T-2
update leaders.questions set help_ar = 'تصف هذه العبارات تجربتك في البرنامج وبيئة عملك، لا أداءك.' where id = '469b169d-f912-4916-bf6e-431cc97bca9a';
-- post-v2 / T-3
update leaders.questions set help_ar = 'تصف هذه العبارات تجربتك في البرنامج وبيئة عملك، لا أداءك.' where id = 'b83e8f74-6c81-45b7-8611-1b8d3d23f62e';
-- post-v2 / T-4
update leaders.questions set help_ar = 'تصف هذه العبارات تجربتك في البرنامج وبيئة عملك، لا أداءك.' where id = 'a1c3ad81-4987-4eec-b6d0-712095db16e4';
-- post-v2 / T-5
update leaders.questions set text_ar = 'استخدمت أداة واحدة على الأقل من أدوات البرنامج في عملي خلال الشهر الماضي.', help_ar = 'تصف هذه العبارات تجربتك في البرنامج وبيئة عملك، لا أداءك.' where id = 'b119cd2c-7155-4d85-9449-4dcefc577c26';

