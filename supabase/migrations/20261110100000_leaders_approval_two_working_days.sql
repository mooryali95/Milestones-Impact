-- ════════════════════════════════════════════════════════════════
-- مدة اعتماد المسار يوما عمل (D04 في سجل قرارات لجنة الخبراء)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدوال تقرأ مدة المرحلة نصًا من صفها، فتعمل قبله وبعده
-- لم يُطبَّق على الإنتاج بعد: يطبّقه المالك بسير migrate.yml باسمه (20261110100000_leaders_approval_two_working_days).
-- D04: «يُعتمد المسار خلال يومي عمل معلنين»، وهو ما تقوله صفحة الانتظار (Paywall.jsx) والخادم (payments.ts وentitlements.ts).
-- كانت المرحلة 3 أيام بالرمز '{duration} عمل' (20261030110000)، فيقرأ المشارك 3 في الترحيب وبطاقة «ما بعد ذلك» ويومين في الانتظار.
-- النص ثابت لا رمز: الرمز بيومين يُخرج «يومان عمل» (durationAr في journey.js) وهو خطأ. والوسم يظهر وحده في خط
-- الرحلة واللوحة فيُخزَّن مرفوعًا «يوما عمل»، والجمل («خلال يومي عمل») من APPROVAL_SLA_AR في labels.js لا من الوسم.
-- ولا رقم فيه فيجتاز hardcodedFacts.
-- الحارس: يُحدَّث الصف الذي ما زال على قيمة 20261030110000 وحدها، فلا يُكتب فوق تعديل من اللوحة.
-- الدفعات المثبتة على نسخة برنامج (program_versions) تبقى على لقطتها حتى تُقطع نسخة جديدة.
-- تحقق بعده: select program_id, duration_label, duration_days from leaders.journey_stages where key = 'approval';
-- آمن لإعادة التشغيل.

update leaders.journey_stages set duration_days = 2, duration_label = 'يوما عمل'
 where key = 'approval' and duration_days = 3 and duration_label = '{duration} عمل';

insert into leaders.schema_migrations (name) values ('20261110100000_leaders_approval_two_working_days') on conflict do nothing;
