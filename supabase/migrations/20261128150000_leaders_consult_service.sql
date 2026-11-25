-- deploy-gate: tolerant صفوف البرامج الحية (journey_stages وstage_requirements) وجدول جديد service_unlocks تقرؤه الدوال الجديدة
-- وحدها. الدوال الأقدم تقرأ unlock:'any' شرطًا مجهولًا فتعامله «بعد ما قبلها» (stageRules)، ولا تعرف service_unlocks.
-- تنبيه: «المسودة» هنا هي الصفوف الحية. الدفعات المثبتة على نسخة (cohorts.program_version_id) تقرأ نسختها المجمدة ولا يمسها الترحيل،
-- لكن من لا دفعة له، أو دفعته بلا program_version_id، يقرأ الصفوف الحية مباشرة فيصله التحويل فور تطبيقه. عددهم لكل برنامج في
-- scripts/db/verify-consult-programs.sql (الفحص 5)، ويُراجع قبل التطبيق على الإنتاج.
-- إن تُراجع عن الدوال فشغّل سطر restore أدناه (RUNBOOK.md §2).
-- ════════════════════════════════════════════════════════════════
-- الاستشارة خدمة (تصور البرامج والرحلة 2026-11-24 v1، المرحلة 2، §6.2؛ اعتمده المالك 2026-11-24)
-- ════════════════════════════════════════════════════════════════
-- لكل برنامج فيه مرحلة consulting في المسودة (الصفوف الحية) وليست خدمة بعد:
--   1) rules := rules بلا شروط الفتح القديمة || {lane:'service', mode:'on_demand', unlock:'any',
--      any:[{type:'reading_started'},{type:'stage_done',stage:'training'}]} (شرط التدريب لبرنامج فيه مرحلة training وحده).
--      المرحلة التي صارت خدمة بشرط آخر ضبطه الأدمن عمدًا تُترك كما هي (التقرير scripts/db/verify-consult-programs.sql يسميها).
--   2) بنود consulting الإلزامية (C-BRIEF وأمثاله) تصير required:false داخل الخدمة (ق4: الافتراضي اختياري في الخدمة).
--   3) المراحل المعتمدة عليها (ق4): unlock:'stages' تُحذف منها consulting، وإن فرغت فبعد ojt_coaching (أو «بعد ما قبلها» إن لم
--      توجد)؛ و«تبدأ مع consulting» تصير «بعد ما قبلها»؛ ومسار مستمر ينتهي بنهايتها يمتد حتى نهاية الرحلة، وما يُشترط قبلها يعود للافتراضي.
--   4) سطر audit_log لكل مرحلة عُدّلت (program.consult_service).
--   5) جدول service_unlocks (participant_id, stage_key) فريد: لحظة فتح الخدمة لكل مشارك مرة، ومفتاح عدم تكرار بريدها.
-- لا يمس program_versions (الحارس المجمد مغلق) ولا cohorts.program_version_id، ولا الجلسات ولا الحجوزات ولا تقديرات الخبراء،
-- ولا يقطع نسخة (ق7). برنامج فيه القياس البعدي (E-POST) في مرحلة consulting يُترك ويظهر في التقرير.
-- آمن لإعادة التشغيل: كل خطوة مشروطة بأن الاستشارة ليست خدمة بعد، والنسخة الاحتياطية تُنشأ مرة.

-- restore: update leaders.journey_stages s set rules = b.rules from leaders.backup_20261128_consult_service b where b.kind = 'stage' and s.program_id = b.program_id and s.key = b.ref; update leaders.stage_requirements r set required = b.required from leaders.backup_20261128_consult_service b where b.kind = 'req' and r.id::text = b.ref
create table if not exists leaders.backup_20261128_consult_service as
  with t as (
    select s.program_id from leaders.journey_stages s
     where s.key = 'consulting' and coalesce(s.rules->>'lane', 'stage') <> 'service'
       and not exists (select 1 from leaders.stage_requirements e where e.program_id = s.program_id and e.stage_key = 'consulting' and e.code = 'E-POST' and e.active is not false)
  )
  select 'stage'::text kind, s.program_id, s.key ref, s.rules, null::boolean required
    from leaders.journey_stages s join t on t.program_id = s.program_id
  union all
  select 'req', r.program_id, r.id::text, null::jsonb, r.required
    from leaders.stage_requirements r join t on t.program_id = r.program_id
   where r.stage_key = 'consulting';
alter table leaders.backup_20261128_consult_service enable row level security;
revoke all on leaders.backup_20261128_consult_service from anon, authenticated;

-- البرامج المستهدفة (دالة مؤقتة للجلسة): مرحلة consulting ليست خدمة بعد، ولا قياس بعدي فيها. تُقرأ قبل كل خطوة،
-- فالخطوة 3 تسبق التحويل لتجد البرامج نفسها
create or replace function pg_temp.consult_targets()
returns table (program_id uuid, has_training boolean, has_ojt boolean) language sql stable as $f$
  select s.program_id, exists (select 1 from leaders.journey_stages x where x.program_id = s.program_id and x.key = 'training' and x.active is not false),
         exists (select 1 from leaders.journey_stages x where x.program_id = s.program_id and x.key = 'ojt_coaching' and x.active is not false)
    from leaders.journey_stages s
   where s.key = 'consulting' and coalesce(s.rules->>'lane', 'stage') <> 'service'
     and not exists (select 1 from leaders.stage_requirements e where e.program_id = s.program_id and e.stage_key = 'consulting' and e.code = 'E-POST' and e.active is not false)
$f$;

-- 3) المراحل المعتمدة على consulting، قبل تحويلها (ترتيب الخطوات لا يهم للنتيجة، والأثر يُسجَّل لكل مرحلة)
with dep as (
  select s.program_id, s.key, s.rules as before,
    case
      when s.rules->>'unlock' = 'stages' and s.rules->'after' ? 'consulting' then
        case when jsonb_array_length(s.rules->'after') > 1 then jsonb_set(s.rules, '{after}', (s.rules->'after') - 'consulting')
             when t.has_ojt and s.key <> 'ojt_coaching' then jsonb_set(s.rules, '{after}', '["ojt_coaching"]'::jsonb)
             else s.rules - 'unlock' - 'after' end
      when s.rules->>'unlock' = 'with' and s.rules->>'with' = 'consulting' then s.rules - 'unlock' - 'with' - 'offset'
      else s.rules
    end as r1
    from leaders.journey_stages s join pg_temp.consult_targets() t on t.program_id = s.program_id
   where s.key <> 'consulting' and s.rules is not null
     and ((s.rules->>'unlock' = 'stages' and s.rules->'after' ? 'consulting') or (s.rules->>'unlock' = 'with' and s.rules->>'with' = 'consulting')
          or s.rules->>'due_before' = 'consulting' or s.rules->>'until' = 'stage:consulting')
), fixed as (
  select program_id, key, before,
    (case when r1->>'until' = 'stage:consulting' then jsonb_set(r1, '{until}', '"journey_end"') else r1 end)
      - (case when r1->>'due_before' = 'consulting' then 'due_before' else '' end) as after
    from dep
), upd as (
  update leaders.journey_stages s set rules = f.after
    from fixed f where s.program_id = f.program_id and s.key = f.key
  returning s.program_id, s.key, f.before, f.after
)
insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
select 'system', 'migration:20261128150000', 'program.consult_service', 'journey_stages', program_id::text || ':' || key,
       jsonb_build_object('rules', before), jsonb_build_object('rules', after, 'why', 'كانت تعتمد على الاستشارة، وصارت الاستشارة خدمة')
  from upd;

-- 2) بنود الاستشارة الإلزامية اختيارية داخل الخدمة (الخدمة خارج النسبة أصلًا)
with upd as (
  update leaders.stage_requirements r set required = false
    from pg_temp.consult_targets() t
   where r.program_id = t.program_id and r.stage_key = 'consulting' and r.required is true
  returning r.program_id, r.id, r.code
)
insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
select 'system', 'migration:20261128150000', 'program.consult_service', 'stage_requirements', id::text,
       jsonb_build_object('required', true), jsonb_build_object('required', false, 'code', code)
  from upd;

-- 1) الاستشارة خدمة بشرط «أي من»
with upd as (
  update leaders.journey_stages s
     set rules = (coalesce(s.rules, '{}'::jsonb) - 'unlock' - 'after' - 'with' - 'offset' - 'day' - 'until' - 'due_before')
       || jsonb_build_object('lane', 'service', 'mode', case when s.rules->>'mode' = 'optional' then 'optional' else 'on_demand' end, 'unlock', 'any',
            'any', case when t.has_training then '[{"type":"reading_started"},{"type":"stage_done","stage":"training"}]'::jsonb else '[{"type":"reading_started"}]'::jsonb end)
    from pg_temp.consult_targets() t
   where s.program_id = t.program_id and s.key = 'consulting' and coalesce(s.rules->>'lane', 'stage') <> 'service'
  returning s.program_id, s.rules as after
)
insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
select 'system', 'migration:20261128150000', 'program.consult_service', 'journey_stages', u.program_id::text || ':consulting',
       jsonb_build_object('rules', b.rules), jsonb_build_object('rules', u.after)
  from upd u left join leaders.backup_20261128_consult_service b on b.kind = 'stage' and b.program_id = u.program_id and b.ref = 'consulting';

-- 5) لحظة فتح الخدمة لكل مشارك (service-unlock.ts): الصف الفريد مفتاح عدم التكرار، فلا سطر سجل ولا بريد إلا لمن أُدرج صفه.
-- تكتبه الدالة بمفتاح الخدمة وحدها؛ لا وصول لـanon ولا authenticated. reading_progress مفهرس بمفتاحه الأساسي (participant_id, module_id)
-- فقراءة «بدأ القراءة» بالمشارك لا تحتاج فهرسًا جديدًا
create table if not exists leaders.service_unlocks (
  participant_id uuid not null references leaders.participants (id) on delete cascade,
  stage_key text not null,
  program_id uuid,
  via text,
  created_at timestamptz not null default now(),
  primary key (participant_id, stage_key)
);
alter table leaders.service_unlocks enable row level security;
revoke all on leaders.service_unlocks from anon, authenticated;

-- تحقق: لا مرحلة consulting في المسودة بلا lane=service إلا ما فيها القياس البعدي (يُسمى في التقرير)
do $$
declare n int;
begin
  select count(*) into n from leaders.journey_stages s
   where s.key = 'consulting' and coalesce(s.rules->>'lane', 'stage') <> 'service'
     and not exists (select 1 from leaders.stage_requirements e where e.program_id = s.program_id and e.stage_key = 'consulting' and e.code = 'E-POST' and e.active is not false);
  if n > 0 then raise exception 'consult_service: % consulting stage(s) still not a service', n; end if;
end $$;

insert into leaders.schema_migrations (name) values ('20261128150000_leaders_consult_service') on conflict do nothing;

insert into leaders.schema_migrations (name) values ('20261128150000_leaders_consult_service') on conflict do nothing;
