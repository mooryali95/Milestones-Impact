-- ════════════════════════════════════════════════════════════════
-- بندا الرحلة T-360 وE-360 لا يُقرآن «تقييم 360» بعد اليوم (مفاتيح الميزات، قرار المالك 2026-11-16)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant نص فقط: الدالة والواجهة تعملان قبله وبعده، والبندان يُعرفان برمزهما لا بعنوانهما
-- لماذا: «تقييم 360» اسم ميزة التطوير feedback360 وحدها، وهي مخفية عن المستخدمين حتى تكتمل (features وfeedback360.enabled).
-- أما البندان فتقدير المدير والزملاء قبل البرنامج وبعده بمحرك الأثر (raters بمرحلة pre وpost)، ويكتملان آليًا ويغذيان
-- القياس وإفادة المدير E-MGR، فلا يُخفيان. يبقيان كما هما ويتغير اسمهما وحده، فلا يذكر المشارك ولا التذكير «360».
-- لا يمس ما حرّرته الإدارة: كل تعديل مشروط بالنص الأصلي حرفيًا، في كل برنامج. آمن لإعادة التشغيل.
update leaders.stage_requirements set title_ar = $q$تقدير المدير والزملاء قبل البرنامج$q$
 where code = 'T-360' and title_ar = $q$تقييم 360 مختصر قبل البرنامج (المدير والزملاء)$q$;
update leaders.stage_requirements set title_ar = $q$تقدير المدير والزملاء بعد البرنامج$q$
 where code = 'E-360' and title_ar = $q$تقييم 360 مختصر بعد البرنامج$q$;

-- وصف مرحلة التوجيه القيادي يذكره بالاسم نفسه: العبارة وحدها تُستبدل، وما حوله كما حرّرته الإدارة
update leaders.journey_stages
   set activities_ar = replace(activities_ar, $q$تقييم 360 مختصر من مديرك وزملائك وفريقك$q$, $q$تقدير مختصر من مديرك وزملائك وفريقك$q$)
 where key = 'leadership_coaching' and activities_ar like $q$%تقييم 360 مختصر من مديرك وزملائك وفريقك%$q$;

-- ونسخ البرامج المجمدة (program_versions.data): الدفعة المثبتة على نسخة تقرأ رحلتها وتذكيرها من لقطتها لا من الجداول
-- الحية (cohortDefinition)، فلو بقيت اللقطة لبقي «تقييم 360» عند أعضائها. التغيير هنا اسم عرض وحده، لا محتوى ولا قاعدة،
-- فلا يخالف «النسخة تبقى كما اعتُمدت». بالشرط نفسه حرفيًا: الرمز والعنوان الأصلي، والعبارة في مرحلة التوجيه القيادي.
-- اللقطة السابقة لكل نسخة تغيّرت في backup_20261116_t360_rename. آمن لإعادة التشغيل، ويُتخطى إن غاب الجدول.
create table if not exists leaders.backup_20261116_t360_rename (version_id uuid primary key, data jsonb not null);
alter table leaders.backup_20261116_t360_rename enable row level security;
revoke all on leaders.backup_20261116_t360_rename from anon, authenticated;

do $pv$
declare
  t_old text := $q$تقييم 360 مختصر قبل البرنامج (المدير والزملاء)$q$;
  t_new text := $q$تقدير المدير والزملاء قبل البرنامج$q$;
  e_old text := $q$تقييم 360 مختصر بعد البرنامج$q$;
  e_new text := $q$تقدير المدير والزملاء بعد البرنامج$q$;
  a_old text := $q$تقييم 360 مختصر من مديرك وزملائك وفريقك$q$;
  a_new text := $q$تقدير مختصر من مديرك وزملائك وفريقك$q$;
  n int;
begin
  if to_regclass('leaders.program_versions') is null then return; end if;
  drop table if exists pg_temp.t360_hit;
  create temp table t360_hit on commit drop as
    select v.id from leaders.program_versions v
     where (jsonb_typeof(v.data->'requirements') = 'array' and exists (select 1 from jsonb_array_elements(v.data->'requirements') r
              where (r->>'code' = 'T-360' and r->>'title_ar' = t_old) or (r->>'code' = 'E-360' and r->>'title_ar' = e_old)))
        or (jsonb_typeof(v.data->'stages') = 'array' and exists (select 1 from jsonb_array_elements(v.data->'stages') st
              where st->>'key' = 'leadership_coaching' and strpos(st->>'activities_ar', a_old) > 0));
  insert into leaders.backup_20261116_t360_rename (version_id, data)
    select v.id, v.data from leaders.program_versions v join t360_hit h on h.id = v.id on conflict do nothing;
  update leaders.program_versions v set data = jsonb_set(v.data, '{requirements}', (
      select coalesce(jsonb_agg(case
        when r->>'code' = 'T-360' and r->>'title_ar' = t_old then jsonb_set(r, '{title_ar}', to_jsonb(t_new))
        when r->>'code' = 'E-360' and r->>'title_ar' = e_old then jsonb_set(r, '{title_ar}', to_jsonb(e_new))
        else r end order by o), '[]'::jsonb)
      from jsonb_array_elements(v.data->'requirements') with ordinality e(r, o)))
   where v.id in (select id from t360_hit) and jsonb_typeof(v.data->'requirements') = 'array';
  update leaders.program_versions v set data = jsonb_set(v.data, '{stages}', (
      select coalesce(jsonb_agg(case
        when st->>'key' = 'leadership_coaching' and strpos(st->>'activities_ar', a_old) > 0
          then jsonb_set(st, '{activities_ar}', to_jsonb(replace(st->>'activities_ar', a_old, a_new)))
        else st end order by o), '[]'::jsonb)
      from jsonb_array_elements(v.data->'stages') with ordinality e(st, o)))
   where v.id in (select id from t360_hit) and jsonb_typeof(v.data->'stages') = 'array';
  select count(*) into n from t360_hit;
  if n > 0 then raise notice 't360 rename: program_versions %', n; end if;
end $pv$;

insert into leaders.schema_migrations (name) values ('20261116100000_leaders_t360_rename') on conflict do nothing;
