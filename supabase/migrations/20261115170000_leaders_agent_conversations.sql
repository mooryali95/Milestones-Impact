-- ════════════════════════════════════════════════════════════════
-- المساعد الآلي في الموقع العام (المرحلة 1): المحادثات ورسائلها وسجل الإنفاق اليومي على النموذج
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة agent-chat ترد agent_unavailable (503) بلا الجداول فتعرض النافذة «اترك رسالتك» عبر النموذج، وsend-otp لا تقرؤها
-- المصدر الواحد للمحادثة هنا، وسلاك (المرحلة 2) نافذة عليها لا مكان حفظها. لا يقرؤها إلا دور الخدمة.
-- الاحتفاظ: غير المحولة 90 يومًا (expires_at) ثم تحذفها مهمة pg_cron يومية (leaders-agent-purge) ولو أُغلق المساعد،
-- وagent-chat تشغل الدالة نفسها احتياطًا عند كل بدء محادثة. والمحولة تبقى مع طلب التواصل المرتبط.
-- السقف اليومي (قرار المالك: 2 دولار في يوم الرياض): agent_spend_daily يُجمع فيه ما كلّفه كل استدعاء من usage،
-- بحجز ذري قبل كل استدعاء (agent_spend_reserve: أسوأ تكلفة، ويُرفض إن تجاوز السقف) ثم تسوية بالتكلفة الفعلية
-- بعده (agent_spend_settle). الاستدعاء الذي يفشل أو ينقطع يبقى محسوبًا بحجزه، فلا يضيع ما فوتره Anthropic.
-- التكلفة بالميكرو دولار (جزء من مليون) فلا يضيع كسر سنت.
-- آمن لإعادة التشغيل.

create table if not exists leaders.conversations (
  id uuid primary key default gen_random_uuid(),
  public_token_hash text not null unique,
  channel text not null default 'web' check (channel in ('web')),
  product text not null default 'MI-HOME' check (char_length(product) <= 40),
  source_url text check (char_length(source_url) <= 500),
  locale text check (char_length(locale) <= 10),
  status text not null default 'bot' check (status in ('bot', 'waiting', 'closed')),
  ip inet,
  visitor_messages integer not null default 0,
  contact_request_id uuid references public.contact_requests(id) on delete set null,
  handoff_reason text check (char_length(handoff_reason) <= 300),
  handoff_at timestamptz,
  rating smallint check (rating between 1 and 5),
  last_visitor_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);
create index if not exists conversations_ip_created_idx on leaders.conversations (ip, created_at desc);
create index if not exists conversations_created_idx on leaders.conversations (created_at desc);
create index if not exists conversations_handoff_idx on leaders.conversations (handoff_at desc) where handoff_at is not null;
create index if not exists conversations_expires_idx on leaders.conversations (expires_at) where contact_request_id is null;

-- role: visitor ما كتبه الزائر بعد الحجب، وagent رد النموذج بعد فحص المخرج، وcanned جواب جاهز بلا نموذج، وsystem سطر آلي
create table if not exists leaders.conversation_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references leaders.conversations(id) on delete cascade,
  role text not null check (role in ('visitor', 'agent', 'canned', 'system')),
  body text not null check (char_length(body) <= 6000),
  lang text check (char_length(lang) <= 10),
  model text check (char_length(model) <= 60),
  stop_reason text check (char_length(stop_reason) <= 40),
  input_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  output_tokens integer,
  cost_micros bigint,
  created_at timestamptz not null default now()
);
create index if not exists conversation_messages_conv_idx on leaders.conversation_messages (conversation_id, id);
create index if not exists conversation_messages_created_idx on leaders.conversation_messages (created_at desc);

create table if not exists leaders.agent_spend_daily (
  day date primary key,
  micros bigint not null default 0 check (micros >= 0),
  calls integer not null default 0,
  alerted_80 timestamptz,
  alerted_100 timestamptz,
  alerted_config timestamptz,
  updated_at timestamptz not null default now()
);

-- حجز ذري قبل الاستدعاء: يضيف p_micros إلى يومه إن بقي المجموع ضمن p_cap، ويعيد المجموع بعده، أو null إن رُفض
create or replace function leaders.agent_spend_reserve(p_day date, p_micros bigint, p_cap bigint)
returns bigint language sql as $$
  insert into leaders.agent_spend_daily as d (day, micros, calls)
  select p_day, greatest(p_micros, 0), 1 where greatest(p_micros, 0) <= p_cap
  on conflict (day) do update set micros = d.micros + excluded.micros, calls = d.calls + 1, updated_at = now()
  where d.micros + excluded.micros <= p_cap
  returning micros;
$$;

-- تسوية بعد الاستدعاء: الفرق بين التكلفة الفعلية والمحجوز (سالب غالبًا)، والمجموع لا ينزل تحت الصفر
create or replace function leaders.agent_spend_settle(p_day date, p_delta bigint)
returns bigint language sql as $$
  update leaders.agent_spend_daily set micros = greatest(micros + p_delta, 0), updated_at = now()
  where day = p_day
  returning micros;
$$;

-- رسالة الزائر تُحجز ذريًا: تزيد العداد إن كانت المحادثة مع المساعد ودون حدها، وتعيد العدد بعدها أو null
create or replace function leaders.agent_claim_message(p_id uuid, p_max integer, p_at timestamptz)
returns integer language sql as $$
  update leaders.conversations set visitor_messages = visitor_messages + 1, last_visitor_at = p_at
  where id = p_id and status = 'bot' and visitor_messages < p_max
  returning visitor_messages;
$$;

-- استدعاءات النموذج من محادثات شبكة واحدة منذ وقت (حصة الشبكة اليومية). p_ip null = الطلبات بلا عنوان معروف دلوًا واحدًا
create or replace function leaders.agent_ip_calls(p_ip inet, p_since timestamptz)
returns integer language sql stable as $$
  select count(*)::integer from leaders.conversation_messages m
  join leaders.conversations c on c.id = m.conversation_id
  where m.role = 'agent' and m.created_at >= p_since and c.ip is not distinct from p_ip;
$$;

-- حذف المحادثات غير المحولة بعد مدتها (والرسائل بالتتالي)، ويعيد عدد المحذوف
create or replace function leaders.agent_purge_expired()
returns integer language plpgsql as $$
declare n integer;
begin
  delete from leaders.conversations where contact_request_id is null and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- تنبيه واحد لكل حد في اليوم (80 و100، و1 لخطأ إعداد النموذج): يعيد true لمن سجّله أولًا وحده
create or replace function leaders.agent_spend_alert(p_day date, p_level integer)
returns boolean language plpgsql as $$
declare n integer;
begin
  insert into leaders.agent_spend_daily (day) values (p_day) on conflict (day) do nothing;
  if p_level >= 100 then
    update leaders.agent_spend_daily set alerted_100 = now() where day = p_day and alerted_100 is null;
  elsif p_level = 1 then
    update leaders.agent_spend_daily set alerted_config = now() where day = p_day and alerted_config is null;
  else
    update leaders.agent_spend_daily set alerted_80 = now() where day = p_day and alerted_80 is null;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

alter table leaders.conversations enable row level security;
alter table leaders.conversation_messages enable row level security;
alter table leaders.agent_spend_daily enable row level security;
revoke all on leaders.conversations, leaders.conversation_messages, leaders.agent_spend_daily from anon, authenticated;
revoke all on function leaders.agent_spend_reserve(date, bigint, bigint), leaders.agent_spend_settle(date, bigint),
  leaders.agent_claim_message(uuid, integer, timestamptz), leaders.agent_spend_alert(date, integer),
  leaders.agent_ip_calls(inet, timestamptz), leaders.agent_purge_expired() from public, anon, authenticated;
grant execute on function leaders.agent_spend_reserve(date, bigint, bigint), leaders.agent_spend_settle(date, bigint),
  leaders.agent_claim_message(uuid, integer, timestamptz), leaders.agent_spend_alert(date, integer),
  leaders.agent_ip_calls(inet, timestamptz), leaders.agent_purge_expired() to service_role;

-- كل يوم 01:23 UTC (04:23 بتوقيت الرياض): الحذف بعد 90 يومًا لا يتوقف على حركة المحادثات.
-- cron.schedule بالاسم نفسه يحدّث المهمة، فإعادة التشغيل آمنة. وبلا pg_cron يبقى الاحتياط في agent-chat.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('leaders-agent-purge', '23 1 * * *', 'select leaders.agent_purge_expired()');
  else
    raise notice 'pg_cron غير مفعل: leaders-agent-purge لم تُجدول';
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261115170000_leaders_agent_conversations') on conflict do nothing;
