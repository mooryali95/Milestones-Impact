-- ════════════════════════════════════════════════════════════════
-- «التوجيه والإرشاد» H3: سجل المحادثات لتتبع المشكلات، بصلاحية يمنحها المالك، والإخفاء بدل الحذف (قرار المالك v8)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبل العمود يبقى «احذف محادثتي» حذفًا كما كان، ومسارات السجل ترد not_migrated
-- قرار المالك v8:
-- 1) يقرأ نص المحادثة المالك دائمًا، والمدير الأعلى بصلاحية يمنحها المالك من اللوحة (جدول المنح هنا)، وكل قراءة تُسجَّل.
-- 2) «احذف محادثتي» يخفيها عن المشارك (hidden_at)، وتبقى نسخة إلى نهاية مدة الحفظ (90 يومًا) ثم تحذفها المهمة اليومية
--    القائمة (guidance_purge_expired بتاريخ الإنشاء). وأسئلة المخفية تبقى محسوبة من الحدين، فالإخفاء لا يفتح أسئلة جديدة.
-- حذف المشارك (طلب الحذف) يحذف محادثته كلها مخفيةً وظاهرةً (cascade قائم). لا يقرأ شيئًا من هذا إلا دور الخدمة.
-- آمن لإعادة التشغيل.

alter table leaders.guidance_messages add column if not exists hidden_at timestamptz;

-- منح المالك المدير الأعلى قراءة النص: صف لكل مدير، والسحب حذف الصف. المنح والسحب يُسجَّلان في audit_log
create table if not exists leaders.guidance_transcript_grants (
  admin_id text primary key check (char_length(admin_id) between 1 and 80),
  admin_email text not null check (char_length(admin_email) between 3 and 200),
  granted_by text not null check (char_length(granted_by) between 3 and 200),
  granted_at timestamptz not null default now()
);
alter table leaders.guidance_transcript_grants enable row level security;
revoke all on leaders.guidance_transcript_grants from anon, authenticated;

-- قائمة المحادثات منذ وقت: صف لكل مشارك بأعداده وكلفته وأول رسالة وآخرها، وهل أخفاها. بلا نص
create or replace function leaders.guidance_conversations(p_since timestamptz, p_limit integer)
returns table (participant_id uuid, asked integer, unsure integer, confirmed integer, errors integer, micros bigint,
               first_at timestamptz, last_at timestamptz, hidden integer)
language sql stable as $$
  select m.participant_id,
         count(*) filter (where m.role = 'user' and m.verdict is distinct from 'refused')::integer,
         count(*) filter (where m.role = 'assistant' and m.verdict = 'unsure')::integer,
         count(*) filter (where m.role = 'assistant' and m.confirmed_at is not null)::integer,
         count(*) filter (where m.role = 'assistant' and m.verdict = 'error')::integer,
         coalesce(sum(m.cost_micros), 0)::bigint,
         min(m.created_at), max(m.created_at),
         count(*) filter (where m.hidden_at is not null)::integer
    from leaders.guidance_messages m
   where m.created_at >= p_since
   group by m.participant_id
   order by max(m.created_at) desc
   limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

revoke all on function leaders.guidance_conversations(timestamptz, integer) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function leaders.guidance_conversations(timestamptz, integer) to service_role;
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261116180000_leaders_guidance_transcripts') on conflict do nothing;
