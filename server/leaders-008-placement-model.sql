-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة · الترحيل الثامن: نموذج التسكين المركّب
-- ════════════════════════════════════════════════════════════════
-- يُشغَّل بعد 001 إلى 007. آمن لإعادة التشغيل، ولا يكتب فوق ما ضبطته.
--
-- بدل شروط "كل الجوانب معًا" (level_rules) يُحسب لكل إطار مؤشر مركّب
-- من 100 = متوسط موزون للمعرفة والمواقف والممارسة:
--   المواقف 45% (اختبار الحكم الموقفي، الأصدق تنبؤًا بالأداء)
--   المعرفة 30%
--   الممارسة 25% (تقدير ذاتي، يميل إلى التضخم فوزنه أقل)
-- ثم: متوسط إذا بلغ المؤشر 55 ولم يقل أي جانب عن 25%،
--     احترافي إذا بلغ 80 ولم يقل أي جانب عن 50%.
-- الحد الأدنى للجانب يمنع أن تُخفي قوة جانب فجوة حقيقية في آخر.
-- الحالة "حدّية" إذا كانت على بعد 5 نقاط أو أقل من المستوى التالي،
-- فتظهر للمستشار ليحسمها بحكمه. كل هذه الأرقام تُضبط من لوحة الإدارة.

create table if not exists leaders.placement_model (
  id                 smallint primary key default 1 check (id = 1),
  w_knowledge        numeric(5,2) not null default 30 check (w_knowledge >= 0),
  w_skill            numeric(5,2) not null default 45 check (w_skill >= 0),
  w_behavior         numeric(5,2) not null default 25 check (w_behavior >= 0),
  min_intermediate   numeric(5,2) not null default 55 check (min_intermediate between 0 and 100),
  min_advanced       numeric(5,2) not null default 80 check (min_advanced between 0 and 100),
  floor_intermediate numeric(5,2) not null default 25 check (floor_intermediate between 0 and 100),
  floor_advanced     numeric(5,2) not null default 50 check (floor_advanced between 0 and 100),
  borderline         numeric(5,2) not null default 5  check (borderline between 0 and 30),
  updated_at         timestamptz not null default now(),
  check (min_advanced > min_intermediate),
  check (w_knowledge + w_skill + w_behavior > 0)
);
insert into leaders.placement_model (id) values (1) on conflict (id) do nothing;

drop trigger if exists placement_model_touch on leaders.placement_model;
create trigger placement_model_touch before update on leaders.placement_model
  for each row execute function leaders.touch_updated_at();

alter table leaders.placement_model enable row level security;
grant all on leaders.placement_model to service_role;

-- نتيجة كل إطار تحفظ المؤشر وسبب المستوى وهل هي حدّية
alter table leaders.assessment_results add column if not exists composite_pct numeric(5,2);
alter table leaders.assessment_results add column if not exists borderline    boolean;
alter table leaders.assessment_results add column if not exists reason_ar     text;

notify pgrst, 'reload schema';
