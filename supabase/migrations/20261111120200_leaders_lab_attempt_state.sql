-- ════════════════════════════════════════════════════════════════
-- مختبر القائد: حالة المحاولة الجارية للوحة (المرحلة الثانية من تصور خريطة العمليات المعتمد 2026-11-11)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تقرأ المحاولة بـ* وتكتب الأعمدة بمحاولة ثانية بدونها (lab.ts)، فقبله لا حفظ تلقائي ولا تلميح ولا فحص ولا تثبيت للمستوى، والإرسال يعمل كما كان
-- لم يُطبَّق على الإنتاج بعد: يُطبَّق بسير migrate.yml باسمه (20261111120200_leaders_lab_attempt_state).
--   • draft   مسودة الخطوة الجارية { step: answer }: تُحفظ بعد نحو ثانية ونصف من آخر حركة، ويُستأنف منها، ولا تُصحَّح فلا تسرّب الحل
--   • hints   سجل التلميحات { step: { card: درجة 1..4 } }: الدرجة 4 كشف الخانة ودرجة البطاقة صفر
--   • checks  مرات «افحص لوحتي» المستعملة { step: n } (مرتان للمتوسط)
--   • level   مستوى المشارك في إطار الأداة عند بدء المحاولة: تُعرض السقالة وتُصحَّح به حتى لو اعتُمد مستوى آخر أثناءها
-- إضافة أعمدة بقيم افتراضية لا تمس صفًا قائمًا. آمن لإعادة التشغيل.
alter table leaders.lab_attempts add column if not exists draft  jsonb not null default '{}'::jsonb;
alter table leaders.lab_attempts add column if not exists hints  jsonb not null default '{}'::jsonb;
alter table leaders.lab_attempts add column if not exists checks jsonb not null default '{}'::jsonb;
alter table leaders.lab_attempts add column if not exists level  text references leaders.levels(key);

comment on column leaders.lab_attempts.draft is 'مسودة الخطوة الجارية في المختبر { step: answer }، لا تُصحَّح، وتُمحى بإرسال الخطوة';
comment on column leaders.lab_attempts.hints is 'تلميحات اللوحة { step: { card: degree 1..4 } }، والدرجة 4 كشف الخانة';
comment on column leaders.lab_attempts.checks is 'مرات فحص اللوحة قبل الإرسال { step: n }';
comment on column leaders.lab_attempts.level is 'مستوى المشارك في إطار الأداة عند بدء المحاولة (سقالة اللوحة وتصحيحها)';

insert into leaders.schema_migrations (name) values ('20261111120200_leaders_lab_attempt_state') on conflict do nothing;
