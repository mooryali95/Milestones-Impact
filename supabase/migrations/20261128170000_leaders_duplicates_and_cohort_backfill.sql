-- deploy-gate: tolerant ترحيل بيانات وحده: لا عمود ولا دالة دائمة تقرؤها الدوال. الحساب الموقوف ترده الدوال القائمة
-- (participantFromToken وauthVerify وauthGoogle)، والإلحاق بالدالة place_participant المطبقة في 20261128160000.
-- إن تُراجع عنه فشغّل سطر restore أدناه (RUNBOOK.md §2).
-- ════════════════════════════════════════════════════════════════
-- معالجة لمرة واحدة: الحسابات المكررة بالهاتف، وإلحاق من لا دفعة له (تحليل التكرار، اعتمده المالك 2026-11-25)
-- ════════════════════════════════════════════════════════════════
-- أ) الحساب الأقدم لكل شخص له حسابان بهاتف واحد يُؤرشف ولا يُحذف:
--    - الهاتف يُطبَّع كمفتاح الفهرس في 20261128180000 وphoneKey في phone-key.js: أرقام لاتينية وحدها، وحذف 00 الدولية، و05/5 السعودي إلى 966.
--    - المجموعة: حسابات حقيقية (غير تجريبية) قائمة (لا موقوفة ولا منسحبة) بالمفتاح نفسه، وطوله 8 أرقام فأكثر.
--    - الباقي: الأحدث دخولًا (last_login_at)، ثم الأحدث إنشاءً. وما سواه مكرر.
--    - الأرشفة: status = 'suspended' (لا آلية أرشفة غيرها في المنظومة)، فترده participantFromToken في كل طلب وauthVerify
--      وauthGoogle عند الدخول، وتُبطَل جلساته القائمة (auth_sessions.revoked_at)، وسطر audit_log
--      participant.duplicate_archived بمعرّف الباقي (kept_id).
--    - الحارس: لا يُمس الزوج إلا إن خلا المكرر من أي أثر: بنود (participant_requirements)، ووثيقة (capstones)، وإلحاق قائم
--      (enrollments)، وقياس (assessments)، وقراءة (reading_progress)، ونقاط (points_ledger)، ودفع (payments)، وشهادة (certificates).
--      وإلا يُترك ويُذكر في إشعار الترحيل وفي scripts/db/verify-backfill-after.sql (الفحص 3).
-- ب) كل مشارك حقيقي بلا دفعة يُلحق بـ place_participant بالمصدر 'manual'، عدا: التجريبي، وحساب الاختبار (is_test)، وحسابات اختبار
--    خمسة سماها المالك تُطابق ببصمة الاسم بعد حذف كل فراغ طرفي (المسافة والجدولة والمسافة غير الفاصلة) فلا تُكتب أسماؤها هنا، والمؤرشف، والموقوف والمنسحب.
-- ج) تحقق ذاتي يرمي (فيُرجع الترحيل كله) إن بقي حقيقي غير مستثنى بلا دفعة، أو أُلحق أحد بدفعتين.
-- آمن لإعادة التشغيل: المؤرشف لا يعود في مجموعة قائمة، والمُلحق له دفعة، والنسخة الاحتياطية تُنشأ مرة.

-- restore: update leaders.participants p set status = b.status from leaders.backup_20261128_duplicates_backfill b where b.kind = 'archive' and p.id = b.participant_id; update leaders.auth_sessions s set revoked_at = null from leaders.backup_20261128_duplicates_backfill b where b.kind = 'session' and s.id::text = b.ref; delete from leaders.enrollments e using leaders.cohort_placements c where c.actor = 'migration:20261128170000' and e.participant_id = c.participant_id and e.cohort_id = c.cohort_id; delete from leaders.cohort_placements where actor = 'migration:20261128170000'; delete from leaders.cohorts c using leaders.backup_20261128_duplicates_backfill b where b.kind = 'cohort' and c.id::text = b.ref and not exists (select 1 from leaders.enrollments e where e.cohort_id = c.id)

-- مفتاح الهاتف للجلسة: تعبير فهرس 20261128180000 نفسه (phoneKey في phone-key.js)
create or replace function pg_temp.pkey(p text) returns text language sql immutable as $f$
  select case when d ~ '^05[0-9]{8}$' then '966' || substr(d, 2) when d ~ '^5[0-9]{8}$' then '966' || d else d end
    from (select regexp_replace(regexp_replace(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^00', '') as d) x
$f$;

-- حسابات الاختبار الخمسة التي استبعدها المالك من الإلحاق: بصمة md5 للاسم بعد حذف كل فراغ طرفي (\s والمسافة غير الفاصلة)، مطابقة تامة
create or replace function pg_temp.excluded_test(n text) returns boolean language sql immutable as $f$
  select md5(regexp_replace(coalesce(n, ''), '^[\s ]+|[\s ]+$', '', 'g')) in ('fabd495fc8a7654531ea1b20e4260a4a', '95f8958a8fbcda02de1a8a5cf8f4f3a9', '34bba4869d4a4a9b23ca3d3b021ffa9b',
                                         '406c5913519e5427b9a6717e29cf2f12', 'a3b0d8be3bc69a1c348a6f2ec974a3eb')
$f$;

-- الأزواج: كل مكرر وباقيه، وهل خلا المكرر من الأثر
create or replace function pg_temp.dup_pairs()
returns table (dup_id uuid, kept_id uuid, clean boolean) language sql stable as $f$
  with p as (
    select id, pg_temp.pkey(phone) k,
           row_number() over (partition by pg_temp.pkey(phone) order by last_login_at desc nulls last, created_at desc, id) rn
      from leaders.participants
     where not is_demo and status not in ('suspended', 'withdrawn') and length(pg_temp.pkey(phone)) >= 8),
  g as (select k from p group by k having count(*) > 1)
  select d.id, kp.id,
         not exists (select 1 from leaders.participant_requirements x where x.participant_id = d.id)
     and not exists (select 1 from leaders.capstones x where x.participant_id = d.id)
     and not exists (select 1 from leaders.enrollments x where x.participant_id = d.id and x.status <> 'withdrawn')
     and not exists (select 1 from leaders.assessments x where x.participant_id = d.id)
     and not exists (select 1 from leaders.reading_progress x where x.participant_id = d.id)
     and not exists (select 1 from leaders.points_ledger x where x.participant_id = d.id)
     and not exists (select 1 from leaders.payments x where x.participant_id = d.id)
     and not exists (select 1 from leaders.certificates x where x.participant_id = d.id)
    from g join p d on d.k = g.k and d.rn > 1 join p kp on kp.k = g.k and kp.rn = 1
$f$;

-- من يُلحق: حقيقي بلا إلحاق قائم، وليس مستثنى (أزواج الأرشفة تُحسم قبله، فالمؤرشف موقوف لا يُلحق)
create or replace function pg_temp.to_place()
returns table (id uuid) language sql stable as $f$
  select pa.id from leaders.participants pa
   where not pa.is_demo and not pa.is_test and not pg_temp.excluded_test(pa.full_name)
     and pa.status not in ('suspended', 'withdrawn')
     and not exists (select 1 from leaders.enrollments e where e.participant_id = pa.id and e.status <> 'withdrawn')
$f$;

-- النسخة الاحتياطية (مرة): حال المكرر قبل الأرشفة، وجلساته القائمة، ومن سيُلحق
create table if not exists leaders.backup_20261128_duplicates_backfill as
  select 'archive'::text kind, pa.id participant_id, d.kept_id::text ref, pa.status
    from pg_temp.dup_pairs() d join leaders.participants pa on pa.id = d.dup_id where d.clean
  union all
  select 'session', s.participant_id, s.id::text, null
    from pg_temp.dup_pairs() d join leaders.auth_sessions s on s.participant_id = d.dup_id and s.revoked_at is null where d.clean
  union all
  select 'place', t.id, null, null from pg_temp.to_place() t;
alter table leaders.backup_20261128_duplicates_backfill enable row level security;
revoke all on leaders.backup_20261128_duplicates_backfill from anon, authenticated;

-- أ) الأرشفة
do $$
declare r record;
begin
  for r in select * from pg_temp.dup_pairs() d where not d.clean loop
    raise notice 'duplicates: تُرك % (له أثر) والباقي %', r.dup_id, r.kept_id;
  end loop;
end $$;

with d as (select dup_id, kept_id from pg_temp.dup_pairs() where clean),
upd as (
  update leaders.participants pa set status = 'suspended', updated_at = now()
    from d where pa.id = d.dup_id and pa.status not in ('suspended', 'withdrawn')
  returning pa.id, d.kept_id
),
ses as (
  update leaders.auth_sessions s set revoked_at = now()
    from upd where s.participant_id = upd.id and s.revoked_at is null
  returning s.participant_id
)
insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
select 'system', 'migration:20261128170000', 'participant.duplicate_archived', 'participants', u.id::text,
       jsonb_build_object('status', b.status),
       jsonb_build_object('status', 'suspended', 'kept_id', u.kept_id, 'sessions_revoked', (select count(*) from ses where ses.participant_id = u.id),
                          'why', 'حساب ثانٍ للشخص نفسه بالهاتف نفسه')
  from upd u left join leaders.backup_20261128_duplicates_backfill b on b.kind = 'archive' and b.participant_id = u.id;

-- ب) الإلحاق، واحدًا واحدًا بالدالة الذرية نفسها التي يستعملها التسجيل. 'none' (لا دفعة تُنشأ: برنامج بلا نسخة) يرمي فورًا
-- باسم المشارك. الدفعات التي ينشئها الإلحاق (استقبال جهة أو المنصة العامة) تُسجَّل في النسخة الاحتياطية فيحذفها سطر restore إن بقيت فارغة
create temp table backfill_cohorts_before on commit drop as select id from leaders.cohorts;
do $$
declare r record; res record;
begin
  for r in select id from pg_temp.to_place() order by id loop
    select * into res from leaders.place_participant(r.id, 'manual', null, 'migration:20261128170000');
    if res.outcome = 'none' then
      raise exception 'duplicates_backfill: place_participant returned none for participant %', r.id;
    end if;
    insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
    values ('system', 'migration:20261128170000', 'participant.cohort_backfill', 'participants', r.id::text, null,
            jsonb_build_object('cohort_id', res.cohort_id, 'outcome', res.outcome));
  end loop;
end $$;

insert into leaders.backup_20261128_duplicates_backfill (kind, participant_id, ref, status)
select 'cohort', null, c.id::text, null from leaders.cohorts c
 where not exists (select 1 from backfill_cohorts_before x where x.id = c.id)
   and not exists (select 1 from leaders.backup_20261128_duplicates_backfill b where b.kind = 'cohort' and b.ref = c.id::text);
drop table backfill_cohorts_before;

-- ج) التحقق الذاتي
do $$
declare n int; m int;
begin
  select count(*) into n from pg_temp.to_place();
  if n > 0 then raise exception 'duplicates_backfill: % real participant(s) still without a cohort', n; end if;
  select count(*) into m from (select participant_id from leaders.enrollments where status <> 'withdrawn' group by 1 having count(*) > 1) x;
  if m > 0 then raise exception 'duplicates_backfill: % participant(s) enrolled in more than one cohort', m; end if;
end $$;

insert into leaders.schema_migrations (name) values ('20261128170000_leaders_duplicates_and_cohort_backfill') on conflict do nothing;
