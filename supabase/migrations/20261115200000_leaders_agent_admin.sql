-- ════════════════════════════════════════════════════════════════
-- إدارة المساعد الآلي من اللوحة: التفعيل، والمفتاح في Vault، وتشغيلات التقييم، والتحقق الإضافي، ومفتاح المرافق للجهة
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant agent-chat بلا الجدول يعد المساعد مطفأ (يفشل مغلقًا)، وleaders-api يرد not_migrated لشاشة المساعد، وحفظ الجهة لا يرسل companion_allowed قبل وجوده، وadmin-api يرد step_up_unavailable
-- المصدر الواحد لحالة المساعد صف واحد في leaders.agent_settings: التفعيل وبصمة التقييم الذي فُعّل عليه، ومعرّف سر المفتاح
-- في Vault (القيمة لا تُخزن هنا ولا تُعاد أبدًا)، وآخر نجاح وآخر خطأ لاستدعاء بالمفتاح.
-- LEADERS_AGENT_ENABLED صار مفتاح طوارئ فقط: off يطفئ كل شيء، وغيره يترك الحكم لهذا الصف (الافتراضي مطفأ).
-- التحقق الإضافي (public.admin_step_ups) تكتبه admin-api بعد مفتاح مرور أو رمز تطبيق مصادقة، مربوطًا بهاش الجلسة،
-- صالحًا 5 دقائق ولمرة واحدة، وتستهلكه leaders-api ذريًا قبل حفظ المفتاح.
-- Vault: دوال المفتاح plpgsql تتحقق من وجوده وقت الاستدعاء، فالترحيل يُطبَّق بلاه (والبناء المحلي بلا Vault) ويرد
-- agent_key_set بخطأ vault_unavailable، وagent_runtime يعيد مفتاحًا فارغًا فيبقى سر الخادم احتياطًا.
-- لا يقرأ الجداول إلا دور الخدمة. آمن لإعادة التشغيل.

-- ── 1) صف الإعداد الواحد ──
create table if not exists leaders.agent_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  enabled_by text check (char_length(enabled_by) <= 254),
  enabled_at timestamptz,
  -- الإعداد الذي فُعّل عليه (بصمة التقييم الناجح): agent-chat يقارنه بما ينشره، فأي تغيير في النموذج أو المعرفة أو الموجه يطفئه
  enabled_run_id uuid,
  enabled_fingerprint text check (char_length(enabled_fingerprint) <= 80),
  -- المفتاح: معرّف السر في Vault وحده، والقيمة لا تُخزن هنا
  key_secret_id uuid,
  key_last4 text check (key_last4 ~ '^[A-Za-z0-9_-]{4}$'),
  key_set_at timestamptz,
  key_set_by text check (char_length(key_set_by) <= 254),
  -- آخر نجاح وآخر خطأ لاستدعاء بالمفتاح (يكتبها agent-chat بعد الاستدعاء، مرة في الدقيقة على الأكثر لكل نتيجة)
  key_ok_at timestamptz,
  key_error_at timestamptz,
  key_error text check (key_error in ('http_400', 'http_401', 'http_403', 'http_404', 'http_429', 'http_5xx', 'network', 'timeout')),
  key_source text check (key_source in ('db', 'env')),
  updated_at timestamptz not null default now()
);
insert into leaders.agent_settings (id) values (true) on conflict do nothing;

-- ── 2) تشغيلات التقييم ونتائجها ──
create table if not exists leaders.agent_eval_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running', 'passed', 'failed', 'stopped', 'error')),
  stop_reason text check (stop_reason in ('max_cost', 'daily_cap', 'ledger', 'key', 'cancelled', 'stale', 'model')),
  model text not null check (char_length(model) <= 60),
  knowledge_version text not null check (char_length(knowledge_version) <= 60),
  prompt_version text not null check (char_length(prompt_version) <= 40),
  cases_version text not null check (char_length(cases_version) <= 40),
  fingerprint text not null check (char_length(fingerprint) <= 80),
  key_source text check (key_source in ('db', 'env')),
  total_cases integer not null check (total_cases > 0),
  done_cases integer not null default 0,
  eval_pass integer not null default 0,
  eval_total integer not null default 0,
  redteam_pass integer not null default 0,
  redteam_total integer not null default 0,
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  max_micros bigint not null default 500000 check (max_micros > 0),
  lease_until timestamptz,
  last_step_at timestamptz,
  started_by text not null check (char_length(started_by) <= 254),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists agent_eval_runs_started_idx on leaders.agent_eval_runs (started_at desc);
-- تشغيل واحد جارٍ في كل وقت
create unique index if not exists agent_eval_runs_one_running on leaders.agent_eval_runs ((true)) where status = 'running';

-- المفتاح الأساسي (run_id, case_id) يمنع حساب حالة مرتين إن تكررت دفعة. نص الرد لمراجعة الراسب، ولا يقرؤه إلا دور الخدمة
create table if not exists leaders.agent_eval_results (
  run_id uuid not null references leaders.agent_eval_runs(id) on delete cascade,
  case_id text not null check (char_length(case_id) <= 20),
  set_name text not null check (set_name in ('eval', 'redteam')),
  pass boolean not null,
  reasons text[] not null default '{}',
  source text check (source in ('canned', 'model', 'capped', 'error')),
  handoff boolean,
  reply text check (char_length(reply) <= 6000),
  cost_micros bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (run_id, case_id)
);

-- عقد الإيجار ذريًا بساعة القاعدة: دفعة واحدة في كل وقت لكل تشغيل، ولو فُتحت الشاشة في تبويبين
create or replace function leaders.agent_eval_lease(p_id uuid, p_seconds integer)
returns setof leaders.agent_eval_runs language sql set search_path = '' as $$
  update leaders.agent_eval_runs set lease_until = now() + make_interval(secs => least(greatest(p_seconds, 10), 300)), last_step_at = now()
  where id = p_id and status = 'running' and (lease_until is null or lease_until < now())
  returning *;
$$;

-- تكلفة حالة تُضاف ذريًا (حالات الدفعة تعمل بتوازٍ)
create or replace function leaders.agent_eval_add_cost(p_id uuid, p_delta bigint)
returns bigint language sql set search_path = '' as $$
  update leaders.agent_eval_runs set cost_micros = cost_micros + greatest(p_delta, 0) where id = p_id returning cost_micros;
$$;

-- ── 3) التحقق الإضافي لمدير الإدارة (يكتبه admin-api) ──
create table if not exists public.admin_step_ups (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_users(id) on delete cascade,
  -- token_hash للجلسة نفسها: لا يصلح لجلسة أخرى
  session_hash text not null check (char_length(session_hash) = 64),
  purpose text not null check (purpose in ('agent_key')),
  method text not null check (method in ('passkey', 'totp')),
  -- الخطوة الزمنية للرمز المقبول: لا يُقبل الرمز نفسه مرتين
  totp_step bigint,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index if not exists admin_step_ups_session_idx on public.admin_step_ups (session_hash, purpose) where consumed_at is null;
create index if not exists admin_step_ups_admin_idx on public.admin_step_ups (admin_id, created_at desc);
-- الخطوة الزمنية للرمز لا تُقبل مرتين للمدير نفسه ولو وصل طلبان معًا (الخطوات تتزايد مع الوقت فلا تعود صالحة)
create unique index if not exists admin_step_ups_totp_once on public.admin_step_ups (admin_id, totp_step) where totp_step is not null;
-- القيد باسمه في اللقطة (webauthn_challenges_purpose_check)
alter table public.webauthn_challenges drop constraint if exists webauthn_challenges_purpose_check;
alter table public.webauthn_challenges add constraint webauthn_challenges_purpose_check check (purpose in ('register', 'authenticate', 'step_up'));

-- الاستهلاك ذري وبساعة القاعدة: أحدث تحقق صالح لهذه الجلسة وهذا المدير وهذا الغرض، مرة واحدة. يعيد الطريقة أو null
create or replace function public.admin_step_up_consume(p_session_hash text, p_admin uuid, p_purpose text)
returns text language sql set search_path = '' as $$
  update public.admin_step_ups s set consumed_at = now()
  where s.id = (
    select x.id from public.admin_step_ups x
    where x.session_hash = p_session_hash and x.admin_id = p_admin and x.purpose = p_purpose and x.consumed_at is null and x.expires_at > now()
    order by x.created_at desc limit 1 for update skip locked)
  returning s.method;
$$;

-- ── 4) مفتاح المرافق للجهة ──
alter table leaders.organizations add column if not exists companion_allowed boolean not null default true;
comment on column leaders.organizations.companion_allowed is 'السماح بالمرافق الذكي لمشاركي الجهة (لا يمس مساعد الموقع العام)';

-- ── 5) دوال المفتاح (security definer وsearch_path فارغ: vault لا يصل إليه دور الخدمة مباشرة) ──
-- كتابة المفتاح في Vault: إنشاء أول مرة ثم تحديث السر نفسه. لا تعيد القيمة أبدًا، ورسائل الخطأ ثابتة لا تقتبس المعامل
create or replace function leaders.agent_key_set(p_key text, p_by text)
returns table (key_last4 text, key_set_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare sid uuid; l4 text; at timestamptz := now();
begin
  if p_key is null or p_key !~ '^sk-ant-[A-Za-z0-9_-]{20,200}$' then raise exception 'invalid_key' using errcode = '22023'; end if;
  if to_regclass('vault.secrets') is null then raise exception 'vault_unavailable' using errcode = '55000'; end if;
  l4 := right(p_key, 4);
  select s.key_secret_id into sid from leaders.agent_settings s where s.id for update;
  if sid is null or not exists (select 1 from vault.secrets v where v.id = sid) then
    sid := vault.create_secret(p_key, 'leaders_agent_anthropic_key_' || to_char(at, 'YYYYMMDDHH24MISS'), 'مفتاح المساعد الآلي، يُدار من اللوحة');
  else
    perform vault.update_secret(sid, p_key);
  end if;
  update leaders.agent_settings s set key_secret_id = sid, key_last4 = l4, key_set_at = at, key_set_by = left(p_by, 254),
    key_ok_at = at, key_error_at = null, key_error = null, key_source = 'db', updated_at = at where s.id;
  return query select l4, at;
end; $$;

-- الرجوع إلى سر الخادم: حذف السر من Vault ومسح الحقول
create or replace function leaders.agent_key_clear(p_by text) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select s.key_secret_id into sid from leaders.agent_settings s where s.id for update;
  if sid is not null and to_regclass('vault.secrets') is not null then
    execute 'delete from vault.secrets where id = $1' using sid;
  end if;
  update leaders.agent_settings s set key_secret_id = null, key_last4 = null, key_set_at = now(), key_set_by = left(p_by, 254),
    key_ok_at = null, key_error_at = null, key_error = null, key_source = null, updated_at = now() where s.id;
end; $$;

-- ما تحتاجه agent-chat في استدعاء واحد (يُخزن 60 ثانية في النسخة): التفعيل وبصمته والمفتاح إن وُجد
create or replace function leaders.agent_runtime()
returns table (enabled boolean, enabled_fingerprint text, api_key text)
language plpgsql stable security definer set search_path = '' as $$
declare k text;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select d.decrypted_secret from vault.decrypted_secrets d join leaders.agent_settings s on s.key_secret_id = d.id where s.id' into k;
  end if;
  return query select s.enabled, s.enabled_fingerprint, k from leaders.agent_settings s where s.id;
end; $$;

-- حالة المفتاح بعد الاستدعاء، مرة في الدقيقة على الأكثر لكل نتيجة، والنتيجة المختلفة تُكتب دائمًا (كقاعدة ops_status)
create or replace function leaders.agent_key_status(p_ok boolean, p_error text, p_source text) returns void
language sql security definer set search_path = '' as $$
  update leaders.agent_settings s set
    key_ok_at = case when p_ok then now() else s.key_ok_at end,
    key_error_at = case when p_ok then s.key_error_at else now() end,
    key_error = case when p_ok then s.key_error
      when p_error in ('http_400', 'http_401', 'http_403', 'http_404', 'http_429', 'http_5xx', 'network', 'timeout') then p_error else 'network' end,
    key_source = case when p_source in ('db', 'env') then p_source else s.key_source end, updated_at = now()
  where s.id and (
    (p_ok and (s.key_ok_at is null or s.key_ok_at < now() - interval '1 minute'))
    or (not p_ok and (s.key_error_at is null or s.key_error_at < now() - interval '1 minute' or s.key_error is distinct from p_error)));
$$;

-- ── 6) قوائم اللوحة (ليست definer: دور الخدمة يملك القراءة، ووجودها لأن PostgREST لا يربط مخططين ولا يجمع) ──
-- محادثات مع تكلفتها، والاسم والبريد لمن طلب التواصل وحده
create or replace function leaders.agent_admin_conversations(p_from timestamptz, p_to timestamptz, p_limit integer, p_offset integer, p_who text)
returns table (id uuid, created_at timestamptz, product text, locale text, status text, rating smallint, visitor_messages integer,
  model_calls integer, cost_micros bigint, handoff_reason text, contact_request_id uuid, contact_name text, contact_email text, total bigint)
language sql stable set search_path = '' as $$
  with c as (
    select c.* from leaders.conversations c
    where c.created_at >= p_from and c.created_at < p_to
      and (p_who = 'all' or (p_who = 'contact' and c.contact_request_id is not null) or (p_who = 'visitor' and c.contact_request_id is null))
  )
  select c.id, c.created_at, c.product, c.locale, c.status, c.rating, c.visitor_messages,
    coalesce(m.calls, 0), coalesce(m.cost, 0)::bigint, c.handoff_reason, c.contact_request_id,
    r.name, r.email, count(*) over ()
  from c
  left join lateral (select (count(*) filter (where x.role = 'agent'))::integer calls, sum(x.cost_micros)::bigint cost
                     from leaders.conversation_messages x where x.conversation_id = c.id) m on true
  left join public.contact_requests r on r.id = c.contact_request_id
  order by c.created_at desc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

-- لكل نموذج مجاميع الرموز والتكلفة في المدة (التوفير يُحسب بالأسعار في pricing.ts على الخادم)
create or replace function leaders.agent_admin_usage(p_since timestamptz)
returns table (model text, calls bigint, input_tokens bigint, cache_read_tokens bigint, cache_write_tokens bigint, output_tokens bigint, cost_micros bigint)
language sql stable set search_path = '' as $$
  select m.model, count(*), coalesce(sum(m.input_tokens), 0)::bigint, coalesce(sum(m.cache_read_tokens), 0)::bigint,
    coalesce(sum(m.cache_write_tokens), 0)::bigint, coalesce(sum(m.output_tokens), 0)::bigint, coalesce(sum(m.cost_micros), 0)::bigint
  from leaders.conversation_messages m where m.role = 'agent' and m.created_at >= p_since and m.model is not null group by m.model;
$$;

-- أعداد الملخص في المدة: المحادثات، والمحولة، وذات استدعاء، والأجوبة الجاهزة واستدعاءات النموذج
create or replace function leaders.agent_admin_counts(p_since timestamptz)
returns table (conversations bigint, handoffs bigint, with_calls bigint, canned bigint, agent bigint)
language sql stable set search_path = '' as $$
  select
    (select count(*) from leaders.conversations c where c.created_at >= p_since),
    (select count(*) from leaders.conversations c where c.handoff_at >= p_since),
    (select count(distinct m.conversation_id) from leaders.conversation_messages m where m.role = 'agent' and m.created_at >= p_since),
    (select count(*) from leaders.conversation_messages m where m.role = 'canned' and m.created_at >= p_since),
    (select count(*) from leaders.conversation_messages m where m.role = 'agent' and m.created_at >= p_since);
$$;

-- ── 7) RLS والصلاحيات: بلا سياسات، فلا يقرأ الجداول ولا ينفذ الدوال إلا دور الخدمة ──
alter table leaders.agent_settings enable row level security;
alter table leaders.agent_eval_runs enable row level security;
alter table leaders.agent_eval_results enable row level security;
alter table public.admin_step_ups enable row level security;
revoke all on leaders.agent_settings, leaders.agent_eval_runs, leaders.agent_eval_results, public.admin_step_ups from anon, authenticated;
revoke all on function leaders.agent_key_set(text, text), leaders.agent_key_clear(text), leaders.agent_runtime(),
  leaders.agent_key_status(boolean, text, text), leaders.agent_admin_conversations(timestamptz, timestamptz, integer, integer, text),
  leaders.agent_admin_usage(timestamptz), leaders.agent_admin_counts(timestamptz), leaders.agent_eval_lease(uuid, integer),
  leaders.agent_eval_add_cost(uuid, bigint), public.admin_step_up_consume(text, uuid, text) from public, anon, authenticated;
grant execute on function leaders.agent_key_set(text, text), leaders.agent_key_clear(text), leaders.agent_runtime(),
  leaders.agent_key_status(boolean, text, text), leaders.agent_admin_conversations(timestamptz, timestamptz, integer, integer, text),
  leaders.agent_admin_usage(timestamptz), leaders.agent_admin_counts(timestamptz), leaders.agent_eval_lease(uuid, integer),
  leaders.agent_eval_add_cost(uuid, bigint), public.admin_step_up_consume(text, uuid, text) to service_role;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    raise notice 'supabase_vault غير مفعل: حفظ المفتاح من اللوحة يرد vault_unavailable، ويبقى ANTHROPIC_API_KEY احتياطًا';
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261115200000_leaders_agent_admin') on conflict do nothing;
