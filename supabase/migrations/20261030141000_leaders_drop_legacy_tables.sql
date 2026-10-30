-- جداول لم تعد مستعملة في أي كود (تحقق: grep في supabase/functions وتطبيقات الواجهة)، ولا يشير إليها مفتاح أجنبي من خارجها:
-- level_rules: قواعد التسكين القديمة، حلّ محلها placement_model (الكود لا يقرؤها منذ الترحيل 20261030140000)
-- step_catalog وparticipant_steps وparticipant_stages وmeetings: جداول المراحل الأولى، فارغة (0 صفوف)
-- قيم level_rules (9 صفوف) محفوظة في supabase/schema/baseline.sql قبل هذا الترحيل.
-- يُشغَّل يدويًا من SQL Editor بعد مراجعته.
drop table if exists leaders.participant_steps;
drop table if exists leaders.step_catalog;
drop table if exists leaders.participant_stages;
drop table if exists leaders.meetings;
drop table if exists leaders.level_rules;
