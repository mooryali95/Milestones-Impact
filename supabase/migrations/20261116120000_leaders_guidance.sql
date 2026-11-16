-- ════════════════════════════════════════════════════════════════
-- «التوجيه والإرشاد» G2: محادثة المشارك مع المساعد داخل الرحلة، وسجل إنفاقها اليومي (تصور 2026-11-16 v4)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant مسارات guide.* ترد not_migrated قبل الجدول فيبقى المساعد مخفيًا، و«اطلب استشارة» يعمل كما هو
-- ضمانات v4 هنا:
-- - العزل: كل صف لمشارك واحد (participant_id)، والخادم يقرأ ويكتب بمعرّف الجلسة وحده. لا يقرأ الجدول إلا دور الخدمة
--   (RLS مفعّل بلا سياسة، وسحب الصلاحيات من anon وauthenticated)، فلا وصول من المتصفح مباشرة أبدًا.
-- - الحذف: حذف المشارك يحذف محادثته في العملية نفسها (cascade)، و«احذف محادثتي» يحذف صفوفه، وما تجاوز مدة الحفظ
--   (الإعدادات العامة guidance.retention_days، افتراضيًا 90) تحذفه مهمة يومية.
-- - الحدان (أسئلة اليوم والشهر لكل مشارك) يُحجزان ذريًا بقفل لكل مشارك: طلبان متوازيان لا يتجاوزان الحد.
-- - السقف اليومي للإنفاق: حجز ذري لأسوأ تكلفة قبل الاستدعاء ثم تسوية بالفعلية، كالمساعد العام بسجل منفصل.
-- آمن لإعادة التشغيل.

create table if not exists leaders.guidance_messages (
  id bigint generated always as identity primary key,
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null check (char_length(body) between 1 and 6000),
  -- أين سُئل: الرحلة أو الكتاب أو المبادرة، والباب إن كان من الكتاب
  context text not null default 'program' check (context in ('program', 'handbook', 'capstone')),
  chapter_id text check (char_length(chapter_id) <= 80),
  -- حكم الرد: أجاب، أو رفض وحوّل (خارج النطاق)، أو لم يتأكد فدعا إلى الاستشارة، أو تعذّر
  verdict text check (verdict in ('answered', 'refused', 'unsure', 'error')),
  sources jsonb,
  model text check (char_length(model) <= 60),
  input_tokens integer,
  cache_read_tokens integer,
  output_tokens integer,
  cost_micros bigint,
  created_at timestamptz not null default now()
);
create index if not exists guidance_messages_participant_idx on leaders.guidance_messages (participant_id, created_at desc);
create index if not exists guidance_messages_created_idx on leaders.guidance_messages (created_at);

create table if not exists leaders.guidance_spend_daily (
  day date primary key,
  micros bigint not null default 0 check (micros >= 0),
  calls integer not null default 0,
  alerted_100 timestamptz,
  updated_at timestamptz not null default now()
);

-- حجز سؤال المشارك ذريًا: قفل لكل مشارك طوال العملية، ثم عدّ أسئلته في اليوم والشهر، ثم إدراج السؤال إن بقي له.
-- يعيد معرّف الصف، أو -1 إن بلغ حد اليوم، أو -2 إن بلغ حد الشهر. الحدود والبدايات من الخادم (الإعدادات ويوم الرياض).
-- السؤال المرفوض قبل النموذج (خارج النطاق) يُحفظ بحكم refused على صف السؤال نفسه، فلا يُحسب من الحد.
create or replace function leaders.guidance_claim(
  p_participant uuid, p_body text, p_context text, p_chapter text,
  p_day_start timestamptz, p_month_start timestamptz, p_daily integer, p_monthly integer)
returns bigint language plpgsql as $$
declare d integer; m integer; new_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('guidance:' || p_participant::text, 0));
  select count(*) filter (where created_at >= p_day_start), count(*) into d, m
    from leaders.guidance_messages
   where participant_id = p_participant and role = 'user' and verdict is distinct from 'refused'
     and created_at >= least(p_day_start, p_month_start);
  if d >= p_daily then return -1; end if;
  if m >= p_monthly then return -2; end if;
  insert into leaders.guidance_messages (participant_id, role, body, context, chapter_id)
  values (p_participant, 'user', p_body, p_context, p_chapter)
  returning id into new_id;
  return new_id;
end;
$$;

-- حجز الإنفاق قبل الاستدعاء: يضيف أسوأ تكلفة إن بقي المجموع ضمن السقف، ويعيد المجموع بعده أو null إن رُفض
create or replace function leaders.guidance_spend_reserve(p_day date, p_micros bigint, p_cap bigint)
returns bigint language sql as $$
  insert into leaders.guidance_spend_daily as d (day, micros, calls)
  select p_day, greatest(p_micros, 0), 1 where greatest(p_micros, 0) <= p_cap
  on conflict (day) do update set micros = d.micros + excluded.micros, calls = d.calls + 1, updated_at = now()
  where d.micros + excluded.micros <= p_cap
  returning micros;
$$;

-- التسوية بعد الاستدعاء بالفرق بين الفعلية والمحجوز، والمجموع لا ينزل تحت الصفر
create or replace function leaders.guidance_spend_settle(p_day date, p_delta bigint)
returns bigint language sql as $$
  update leaders.guidance_spend_daily set micros = greatest(micros + p_delta, 0), updated_at = now()
  where day = p_day
  returning micros;
$$;

-- الحذف بعد مدة الحفظ: من الإعدادات العامة (guidance.retention_days بين 7 و365)، وإلا 90. يعيد عدد المحذوف
create or replace function leaders.guidance_purge_expired()
returns integer language plpgsql as $$
declare days integer := 90; n integer; raw text;
begin
  if to_regclass('leaders.app_settings') is not null then
    select value->>'retention_days' into raw from leaders.app_settings where key = 'guidance';
    if raw ~ '^[0-9]{1,3}$' and raw::integer between 7 and 365 then days := raw::integer; end if;
  end if;
  delete from leaders.guidance_messages where created_at < now() - make_interval(days => days);
  get diagnostics n = row_count;
  return n;
end;
$$;

alter table leaders.guidance_messages enable row level security;
alter table leaders.guidance_spend_daily enable row level security;
revoke all on leaders.guidance_messages, leaders.guidance_spend_daily from anon, authenticated;
revoke all on function leaders.guidance_claim(uuid, text, text, text, timestamptz, timestamptz, integer, integer),
  leaders.guidance_spend_reserve(date, bigint, bigint), leaders.guidance_spend_settle(date, bigint),
  leaders.guidance_purge_expired() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function leaders.guidance_claim(uuid, text, text, text, timestamptz, timestamptz, integer, integer),
      leaders.guidance_spend_reserve(date, bigint, bigint), leaders.guidance_spend_settle(date, bigint),
      leaders.guidance_purge_expired() to service_role;
  end if;
end;
$$;

-- كل يوم 01:41 UTC: الحذف بعد مدة الحفظ لا يتوقف على استعمال المساعد. الاسم نفسه يحدّث المهمة عند إعادة التشغيل
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('leaders-guidance-purge', '41 1 * * *', 'select leaders.guidance_purge_expired()');
  else
    raise notice 'pg_cron غير مفعل: leaders-guidance-purge لم تُجدول';
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261116120000_leaders_guidance') on conflict do nothing;
