-- ════════════════════════════════════════════════════════════════
-- «بوابتان، والباقي ملاحظات»: نماذج مبادرتي تُحتسب بالتسليم، والمراجعة ملاحظات لا اعتماد (قرار المالك 2026-11-23)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تعمل قبله وبعده: modelStatus (logic.js) يقرأ accept من الإعداد كما هو، فقبله تبقى الفصول الخمسة
-- تنتظر المراجعة كما كانت، وبعده تكتمل بالتسليم. والملخص اليومي (model-digest.ts) يقرأ digested_at، وقبل العمود يفشل بخطأ
-- يُبتلع في المهمة الساعية ولا يرسل شيئًا (لا بريد مكرر)، وإشعار البطاقة الفوري لا يمسه.
-- 1) الفصول الخمسة (O-MREG وO-BREG وO-GATE وL-MAP وL-PLAN) تكتمل بالتسليم بعد أن كانت باعتماد المستشار (20261029120000).
--    ما أعاده المراجع للتعديل (returned) يبقى مكتملًا في الرحلة (logic.js modelStatus)، فلا يُحبس مشارك بانتظار مراجع.
-- 2) بطاقة المبادرة CP-CARD تبقى بوابة تكتمل بالاعتماد: يُعاد هنا ما في 20261110180000 بشرطه نفسه، فيصح وإن لم يُطبَّق ذاك.
-- 3) digested_at: متى دخل التسليم الملخص اليومي للمراجع، فلا يُذكر مرتين. التسليم من جديد بعد تعديل (submitted_at أحدث منه)
--    يدخل الملخص التالي، فلا يكتب التسليم في العمود شيئًا (modelSave يعمل قبل الترحيل كما بعده).
-- لا يمس ما حرّرته الإدارة: كل تعديل مشروط بالقيمة الأصلية. آمن لإعادة التشغيل.
-- restore: update leaders.stage_requirements r set config = b.config, help_ar = b.help_ar, needs_review = b.needs_review from leaders.backup_20261127_model_review b where r.id = b.id

create table if not exists leaders.backup_20261127_model_review as
  select id, config, help_ar, needs_review from leaders.stage_requirements
   where code in ('O-MREG', 'O-BREG', 'O-GATE', 'L-MAP', 'L-PLAN', 'CP-CARD') and kind = 'model';
alter table leaders.backup_20261127_model_review enable row level security;
revoke all on leaders.backup_20261127_model_review from anon, authenticated;

update leaders.stage_requirements
   set config = jsonb_set(config, '{accept}', '"submitted"')
 where code in ('O-MREG', 'O-BREG', 'O-GATE', 'L-MAP', 'L-PLAN') and kind = 'model' and config->>'accept' = 'reviewed';

-- نص المساعدة الذي كتبه 20261029120000 وحده (لا ما حرّرته الإدارة)
update leaders.stage_requirements
   set help_ar = replace(help_ar, $q$ في مكتبة النماذج حين يقيّمه المستشار، وهو فصل$q$, $q$ في مكتبة النماذج حين تسلّمه، وهو فصل$q$)
 where code in ('O-MREG', 'O-BREG', 'O-GATE', 'L-MAP', 'L-PLAN') and kind = 'model'
   and help_ar like $q$يكتمل من نموذج «%» في مكتبة النماذج حين يقيّمه المستشار، وهو فصل في وثيقة مبادرتك.$q$;

update leaders.stage_requirements
   set needs_review = true,
       config = jsonb_set(config, '{accept}', '"reviewed"')
 where code = 'CP-CARD' and kind = 'model' and config->>'accept' = 'submitted';

-- الدفعات مثبتة على نسخ محفوظة من الرحلة (program_versions.data) وتقرأ متطلباتها منها لا من الصفوف الحية:
-- يُطبَّق التغيير نفسه على كل نسخة محفوظة، وإلا بقيت دفعات اليوم تنتظر الاعتماد. النسخ قبل التعديل في جدول احتياطي.
-- restore: update leaders.program_versions v set data = b.data from leaders.backup_20261127_program_versions b where b.id = v.id;
create table if not exists leaders.backup_20261127_program_versions as
  select id, data from leaders.program_versions
   where data->'requirements' @> '[{"kind":"model"}]';
alter table leaders.backup_20261127_program_versions enable row level security;
revoke all on leaders.backup_20261127_program_versions from anon, authenticated;
update leaders.program_versions v
   set data = jsonb_set(v.data, '{requirements}', (
     select jsonb_agg(case
       when r->>'kind' = 'model' and r->>'code' in ('O-MREG', 'O-BREG', 'O-GATE', 'L-MAP', 'L-PLAN') and r->'config'->>'accept' = 'reviewed'
         then jsonb_set(r, '{config,accept}', '"submitted"')
       when r->>'kind' = 'model' and r->>'code' = 'CP-CARD' and r->'config'->>'accept' = 'submitted'
         then jsonb_set(jsonb_set(r, '{config,accept}', '"reviewed"'), '{needs_review}', 'true')
       else r end order by ord)
     from jsonb_array_elements(v.data->'requirements') with ordinality as e(r, ord)))
 where jsonb_typeof(v.data->'requirements') = 'array'
   and exists (select 1 from jsonb_array_elements(v.data->'requirements') r
                where r->>'kind' = 'model'
                  and ((r->>'code' in ('O-MREG', 'O-BREG', 'O-GATE', 'L-MAP', 'L-PLAN') and r->'config'->>'accept' = 'reviewed')
                    or (r->>'code' = 'CP-CARD' and r->'config'->>'accept' = 'submitted')));

alter table leaders.model_submissions add column if not exists digested_at timestamptz;
comment on column leaders.model_submissions.digested_at is 'متى دخل التسليم الملخص اليومي للمراجع (model-digest.ts)؛ التسليم بعده (submitted_at أحدث) يدخل الملخص التالي';
create index if not exists model_submissions_digest_idx on leaders.model_submissions (submitted_at) where status = 'submitted';

insert into leaders.schema_migrations (name) values ('20261127100000_leaders_model_review_light') on conflict do nothing;
