-- ════════════════════════════════════════════════════════════════
-- تقييم 360، المرحلة 1: نموذج المقيّم (تصور 2026-11-11، اعتمده المالك)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تقرأ questions بكل أعمدتها وتحجب المعكوسة بترتيب درجاتها قبله، وتكتب الأسئلة المفتوحة في comment إن غاب العمودان
-- docs/content/2026-11-11-تصور-تقييم-360-v1.md §5.2:
--   observable_by: من يشهد العبارة من مجموعات المقيّمين (null = الجميع). المعكوسة (M-B5 وI-B5 وL-B5) للذات وحدها،
--   وI-B3 «يذكر حدود الأدلة في تقارير الأثر التي يعتمدها» للمدير، وM-B3 «مراجعة مبرر الاستمرار» للمدير وأصحاب المصلحة.
--   open_answers: الأسئلة الثلاثة {continue, start, stop}، وcontact_freq: «كم مرة ترى عمله؟» (weekly|monthly|less).
-- لا يغيّر من يرى شيئًا: يعمل على البنية القائمة (pre/post). لا يمس نص عبارة ولا درجاتها. آمن لإعادة التشغيل.

alter table leaders.questions add column if not exists observable_by text[];
alter table leaders.questions drop constraint if exists questions_observable_by_check;
alter table leaders.questions add constraint questions_observable_by_check
  check (observable_by is null or observable_by <@ array['self', 'manager', 'peer', 'report', 'stakeholder']::text[]);
comment on column leaders.questions.observable_by is
  'تقييم 360: مجموعات المقيّمين التي تشهد العبارة (null = الجميع)، وself وحدها = لا تُعرض على المقيّم';

alter table leaders.raters add column if not exists open_answers jsonb;
alter table leaders.raters add column if not exists contact_freq text;
alter table leaders.raters drop constraint if exists raters_contact_freq_check;
alter table leaders.raters add constraint raters_contact_freq_check
  check (contact_freq is null or contact_freq = any (array['weekly', 'monthly', 'less']));
alter table leaders.raters drop constraint if exists raters_open_answers_check;
alter table leaders.raters add constraint raters_open_answers_check
  check (open_answers is null or (jsonb_typeof(open_answers) = 'object' and char_length(open_answers::text) <= 2400));

-- الوسم لما لم تحرّره الإدارة (observable_by is null) فقط، في كل نسخ الأداة
update leaders.questions set observable_by = array['self']
 where tier = 'behavior' and code in ('M-B5', 'I-B5', 'L-B5') and observable_by is null;
update leaders.questions set observable_by = array['self', 'manager']
 where tier = 'behavior' and code = 'I-B3' and observable_by is null;
update leaders.questions set observable_by = array['self', 'manager', 'stakeholder']
 where tier = 'behavior' and code = 'M-B3' and observable_by is null;

insert into leaders.schema_migrations (name) values ('20261111130000_leaders_feedback360_rater_form') on conflict do nothing;
