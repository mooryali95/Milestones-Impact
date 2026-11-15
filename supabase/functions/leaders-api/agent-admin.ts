// ════════════════════════════════════════════════════════════════
// شاشة «المساعد الآلي» في اللوحة: الحالة والتحكم، والإنفاق، والمحادثات، والتقييم على الخادم، والمفتاح بتحقق إضافي
// ════════════════════════════════════════════════════════════════
// القراءة للمدير الأعلى أو المالك، وكل كتابة superWriter في index.ts (عامل ثانٍ ومدير أعلى). المصدر الواحد لحالة المساعد
// صف leaders.agent_settings، والحكم الفعلي بالقاعدة نفسها التي تحكم بها agent-chat (runtime.ts وversion.ts)، فلا نسخة.
// المفتاح لا يُعاد أبدًا ولا يُطبع ولا يدخل سجلًا أو تنبيهًا أو رسالة خطأ: آخر أربعة أحرف وحدها.
// التقييم حلقة من المتصفح بدفعات (agent-eval-step): كل طلب 6 حالات بتوازٍ 3 تحت عقد إيجار ذري، فلا يتجاوز حد الطلب
// الواحد في Supabase Edge، ويُستأنف ويُوقف ويُرى تقدمه. الإنفاق في السجل الحقيقي ضمن سقف اليوم (ledgerStore).
import { agentKeyMail, AGENT_KEY_MAIL_SUBJECT, audit, db, Fail, publicDb, raiseAlert, sendMail } from './core.ts';
import type { Admin } from './admin.ts';
import { maskEmail } from '../_shared/slack.ts';
import { type Env, riyadhDay } from '../agent-chat/handler.ts';
import { DEFAULT_MODEL, MAX_TOKENS, streamAnswer } from '../agent-chat/model.ts';
import { estimateTokens, GEO_US_MULTIPLIER, knownModel, ratesFor, worstCaseMicros } from '../agent-chat/pricing.ts';
import { SYSTEM_BLOCKS } from '../agent-chat/prompt.ts';
import { readRuntime, envMode, type Runtime } from '../agent-chat/runtime.ts';
import { type Store, supabaseStore } from '../agent-chat/store.ts';
import { versions, type Versions } from '../agent-chat/version.ts';
import { CASES } from '../agent-chat/evals/cases.ts';
import type { Case } from '../agent-chat/evals/grade.ts';
import { THRESHOLDS } from '../agent-chat/evals/grade.ts';
import { type CaseOutcome, runCase } from '../agent-chat/evals/runner.ts';

type Body = Record<string, any>;

// ── الثوابت ──
export const AGENT = {
  batch: 6, parallel: 3, leaseSeconds: 120, staleMinutes: 30,
  // حد التشغيل الواحد، وما يُقدَّر لبدء تشغيل (يُرفض البدء إن لم يتسع له سقف اليوم)
  runMaxMicros: 500_000, startReserveMicros: 100_000,
  keyPerAdminHour: 5, keyAllHour: 10, keyCheckMs: 8_000, perPage: 25,
};
export const KEY_RE = /^sk-ant-[A-Za-z0-9_-]{20,200}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHOD_AR: Record<string, string> = { passkey: 'مفتاح المرور', totp: 'تطبيق المصادقة' };

export class NotMigrated extends Error {}
const notMigrated = () => new Fail('لم يُطبَّق ترحيل 20261115200000 بعد', 409, 'not_migrated');
const missing = (e: any) => !!e && ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(String(e.code));

export type Settings = {
  enabled: boolean; enabled_by: string | null; enabled_at: string | null; enabled_run_id: string | null; enabled_fingerprint: string | null;
  has_key: boolean; key_last4: string | null; key_set_at: string | null; key_set_by: string | null;
  key_ok_at: string | null; key_error_at: string | null; key_error: string | null; key_source: string | null;
};
export type Run = {
  id: string; status: 'running' | 'passed' | 'failed' | 'stopped' | 'error'; stop_reason: string | null; model: string; knowledge_version: string;
  prompt_version: string; cases_version: string; fingerprint: string; key_source: string | null; total_cases: number; done_cases: number;
  eval_pass: number; eval_total: number; redteam_pass: number; redteam_total: number; cost_micros: number; max_micros: number;
  lease_until: string | null; last_step_at: string | null; started_by: string; started_at: string; finished_at: string | null;
};
export type Result = { run_id: string; case_id: string; set_name: 'eval' | 'redteam'; pass: boolean; reasons: string[]; source: string | null; handoff: boolean | null; reply: string | null; cost_micros: number; created_at?: string };

// ── الوصول إلى القاعدة في واجهة واحدة (الاختبار يحقن واحدة في الذاكرة) ──
export interface Repo {
  settings(): Promise<Settings>;
  updateSettings(patch: Record<string, unknown>): Promise<void>;
  runs(limit: number): Promise<Run[]>;
  run(id: string): Promise<Run | null>;
  createRun(row: Partial<Run>): Promise<{ id: string } | { running: string | null }>;
  lease(id: string, seconds: number): Promise<Run | null>;
  updateRun(id: string, patch: Partial<Run>): Promise<void>;
  addCost(id: string, delta: number): Promise<number | null>;
  results(id: string): Promise<Result[]>;
  addResult(row: Result): Promise<void>;
  closeStale(beforeIso: string): Promise<void>;
  spend(sinceDay: string): Promise<{ day: string; micros: number; calls: number }[]>;
  usage(sinceIso: string): Promise<{ model: string; calls: number; input_tokens: number; cache_read_tokens: number; cache_write_tokens: number; output_tokens: number; cost_micros: number }[]>;
  counts(sinceIso: string): Promise<{ conversations: number; handoffs: number; with_calls: number; canned: number; agent: number }>;
  conversations(p: { from: string; to: string; limit: number; offset: number; who: string }): Promise<any[]>;
  conversation(id: string): Promise<any | null>;
  messages(id: string): Promise<any[]>;
  consumeStepUp(sessionHash: string, adminId: string, purpose: string): Promise<string | null>;
  keyAttempts(email: string, sinceIso: string): Promise<{ mine: number; all: number }>;
  keySet(key: string, by: string): Promise<{ key_last4: string; key_set_at: string }>;
  keyClear(by: string): Promise<void>;
  companionOff(): Promise<number | null>;
  owners(): Promise<string[]>;
  runtime(): PromiseLike<{ data: any; error: unknown }>;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
function check(error: any, what: string) {
  if (!error) return;
  if (missing(error)) throw new NotMigrated(what);
  // رسالة Postgres قد تقتبس معاملًا: الرمز وحده
  throw new Error(`${what}: ${error.code || 'db_error'}`);
}
const SETTINGS_COLS = 'enabled, enabled_by, enabled_at, enabled_run_id, enabled_fingerprint, key_secret_id, key_last4, key_set_at, key_set_by, key_ok_at, key_error_at, key_error, key_source';

export const supabaseRepo: Repo = {
  async settings() {
    const { data, error } = await db.from('agent_settings').select(SETTINGS_COLS).eq('id', true).maybeSingle();
    check(error, 'agent_settings');
    if (!data) throw new NotMigrated('agent_settings');
    const { key_secret_id, ...rest } = data as any;
    return { ...rest, has_key: !!key_secret_id } as Settings;
  },
  async updateSettings(patch) {
    const { error } = await db.from('agent_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', true);
    check(error, 'agent_settings update');
  },
  async runs(limit) {
    const { data, error } = await db.from('agent_eval_runs').select('*').order('started_at', { ascending: false }).limit(limit);
    check(error, 'agent_eval_runs');
    return (data || []) as Run[];
  },
  async run(id) {
    const { data, error } = await db.from('agent_eval_runs').select('*').eq('id', id).maybeSingle();
    check(error, 'agent_eval_run');
    return (data as Run) || null;
  },
  async createRun(row) {
    const { data, error } = await db.from('agent_eval_runs').insert(row).select('id').single();
    if (error?.code === '23505') {
      const { data: r } = await db.from('agent_eval_runs').select('id').eq('status', 'running').limit(1);
      return { running: r?.[0]?.id ?? null };
    }
    check(error, 'agent_eval_runs insert');
    return { id: String((data as any)?.id) };
  },
  async lease(id, seconds) {
    const { data, error } = await db.rpc('agent_eval_lease', { p_id: id, p_seconds: seconds });
    check(error, 'agent_eval_lease');
    return (Array.isArray(data) ? data[0] : data) || null;
  },
  async updateRun(id, patch) {
    const { error } = await db.from('agent_eval_runs').update(patch).eq('id', id);
    check(error, 'agent_eval_runs update');
  },
  async addCost(id, delta) {
    const { data, error } = await db.rpc('agent_eval_add_cost', { p_id: id, p_delta: Math.max(0, Math.round(delta)) });
    check(error, 'agent_eval_add_cost');
    return data == null ? null : num(data);
  },
  async results(id) {
    const { data, error } = await db.from('agent_eval_results').select('*').eq('run_id', id).limit(500);
    check(error, 'agent_eval_results');
    return (data || []) as Result[];
  },
  async addResult(row) {
    const { error } = await db.from('agent_eval_results').upsert(row, { onConflict: 'run_id,case_id', ignoreDuplicates: true });
    check(error, 'agent_eval_results insert');
  },
  async closeStale(before) {
    const { error } = await db.from('agent_eval_runs').update({ status: 'stopped', stop_reason: 'stale', finished_at: new Date().toISOString(), lease_until: null })
      .eq('status', 'running').lt('last_step_at', before);
    check(error, 'agent_eval_runs stale');
    const { error: e2 } = await db.from('agent_eval_runs').update({ status: 'stopped', stop_reason: 'stale', finished_at: new Date().toISOString(), lease_until: null })
      .eq('status', 'running').is('last_step_at', null).lt('started_at', before);
    check(e2, 'agent_eval_runs stale');
  },
  async spend(sinceDay) {
    const { data, error } = await db.from('agent_spend_daily').select('day, micros, calls').gte('day', sinceDay).order('day');
    check(error, 'agent_spend_daily');
    return (data || []).map((r: any) => ({ day: String(r.day), micros: num(r.micros), calls: num(r.calls) }));
  },
  async usage(since) {
    const { data, error } = await db.rpc('agent_admin_usage', { p_since: since });
    check(error, 'agent_admin_usage');
    return (data || []).map((r: any) => ({ model: String(r.model), calls: num(r.calls), input_tokens: num(r.input_tokens), cache_read_tokens: num(r.cache_read_tokens), cache_write_tokens: num(r.cache_write_tokens), output_tokens: num(r.output_tokens), cost_micros: num(r.cost_micros) }));
  },
  async counts(since) {
    const { data, error } = await db.rpc('agent_admin_counts', { p_since: since });
    check(error, 'agent_admin_counts');
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return { conversations: num(r.conversations), handoffs: num(r.handoffs), with_calls: num(r.with_calls), canned: num(r.canned), agent: num(r.agent) };
  },
  async conversations(p) {
    const { data, error } = await db.rpc('agent_admin_conversations', { p_from: p.from, p_to: p.to, p_limit: p.limit, p_offset: p.offset, p_who: p.who });
    check(error, 'agent_admin_conversations');
    return data || [];
  },
  async conversation(id) {
    const { data, error } = await db.from('conversations').select('id, created_at, product, locale, status, rating, visitor_messages, handoff_reason, handoff_at, contact_request_id').eq('id', id).maybeSingle();
    check(error, 'conversations');
    return data || null;
  },
  async messages(id) {
    const { data, error } = await db.from('conversation_messages')
      .select('id, role, body, lang, model, stop_reason, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, cost_micros, created_at')
      .eq('conversation_id', id).order('id', { ascending: true }).limit(300);
    check(error, 'conversation_messages');
    return data || [];
  },
  async consumeStepUp(sessionHash, adminId, purpose) {
    const { data, error } = await publicDb.rpc('admin_step_up_consume', { p_session_hash: sessionHash, p_admin: adminId, p_purpose: purpose });
    check(error, 'admin_step_up_consume');
    return data ? String(data) : null;
  },
  async keyAttempts(email, since) {
    const q = () => db.from('audit_log').select('id', { count: 'exact', head: true }).in('action', ['agent.key-set', 'agent.key-rejected', 'agent.key-clear']).gte('created_at', since);
    const [mine, all] = await Promise.all([q().eq('actor', email), q()]);
    if (mine.error || all.error) throw new Error('audit_log count');
    return { mine: num(mine.count), all: num(all.count) };
  },
  async keySet(key, by) {
    const { data, error } = await db.rpc('agent_key_set', { p_key: key, p_by: by });
    if (error) {
      // رسالة الخطأ لا تُمرر: قد تقتبس المعامل
      if (missing(error)) throw new NotMigrated('agent_key_set');
      throw new Fail(error.message === 'vault_unavailable' ? 'Vault غير مفعّل في القاعدة، فلم يُحفظ المفتاح' : 'تعذّر حفظ المفتاح، لم يُحفظ شيء', 500, error.message === 'vault_unavailable' ? 'vault_unavailable' : 'key_save_failed');
    }
    const r = Array.isArray(data) ? data[0] : data;
    return { key_last4: String(r?.key_last4 || ''), key_set_at: String(r?.key_set_at || new Date().toISOString()) };
  },
  async keyClear(by) {
    const { error } = await db.rpc('agent_key_clear', { p_by: by });
    if (error) { if (missing(error)) throw new NotMigrated('agent_key_clear'); throw new Fail('تعذّر الرجوع إلى سر الخادم', 500, 'key_clear_failed'); }
  },
  async companionOff() {
    const { count, error } = await db.from('organizations').select('id', { count: 'exact', head: true }).eq('companion_allowed', false);
    return error ? null : num(count);
  },
  async owners() {
    const { data } = await publicDb.from('admin_users').select('email').eq('is_owner', true).eq('is_active', true);
    return (data || []).map((r: any) => String(r.email)).filter(Boolean);
  },
  runtime: () => db.rpc('agent_runtime'),
};

// ── ما يُحقن في الاختبار ──
export const AG = {
  repo: supabaseRepo as Repo,
  env: (k: string) => Deno.env.get(k),
  now: () => Date.now(),
  fetch: (u: string, i?: RequestInit) => fetch(u, i),
  audit,
  alert: (kind: string, detail: Record<string, unknown>) => raiseAlert(kind, detail),
  mail: (to: string, subject: string, html: string) => sendMail(to, subject, html, [], { kind: 'alert' }),
  model: ((messages, onText, signal, apiKey) => streamAnswer(apiKey || '', agentEnv().model, messages, onText, signal)) as Parameters<typeof runCase>[1]['model'],
  // السجل الحقيقي للإنفاق (agent_spend_daily) بالمخزن نفسه الذي تستعمله agent-chat
  ledger: (() => supabaseStore(publicDb, async () => ({ data: null, error: 'unused' }))) as () => Store,
};

export function agentEnv() {
  const cap = Number(AG.env('LEADERS_AGENT_DAILY_CAP_CENTS') || '200');
  return {
    mode: envMode(AG.env('LEADERS_AGENT_ENABLED')),
    model: (AG.env('LEADERS_AGENT_MODEL') || DEFAULT_MODEL).trim(),
    capCents: Number.isFinite(cap) && cap >= 0 ? cap : 200,
    envKey: AG.env('ANTHROPIC_API_KEY') || '',
  };
}

async function settingsOr409() {
  try { return await AG.repo.settings(); } catch (e) { if (e instanceof NotMigrated) throw notMigrated(); throw e; }
}
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { if (e instanceof NotMigrated) throw notMigrated(); throw e; }
}

// ── الحارس ──
export function requireAgentRead(a: Admin) {
  if (a.role !== 'super_admin' && !a.owner) throw new Fail('شاشة المساعد للمدير الأعلى والمالك', 403, 'super_required');
}

// بوابة التفعيل: آخر تشغيل منتهٍ ناجح بالبصمة الحالية وكامل الحالات
export function gateOf(runs: Run[], fingerprint: string, total = CASES.length) {
  const mine = runs.filter((r) => r.fingerprint === fingerprint && r.status !== 'running');
  const ok = mine.find((r) => r.status === 'passed' && r.done_cases >= total && r.total_cases >= total);
  if (ok) return { ok: true, run_id: ok.id, reason: null, run: ok };
  if (mine.some((r) => r.status === 'failed')) return { ok: false, run_id: null, reason: 'failed', run: null };
  if (runs.some((r) => r.status === 'passed')) return { ok: false, run_id: null, reason: 'stale', run: null };
  return { ok: false, run_id: null, reason: 'none', run: null };
}

const runtimeOf = (env = agentEnv(), v?: Versions): Promise<Runtime> =>
  readRuntime(() => AG.repo.runtime(), { mode: AG.env('LEADERS_AGENT_ENABLED'), envKey: env.envKey, fingerprint: async () => (v ?? await versions(env.model)).fingerprint }, AG.now());

const publicRun = (r: Run | null | undefined) => r && {
  id: r.id, status: r.status, stop_reason: r.stop_reason, model: r.model, knowledge_version: r.knowledge_version, fingerprint: r.fingerprint,
  total_cases: r.total_cases, done_cases: r.done_cases, eval_pass: r.eval_pass, eval_total: r.eval_total, redteam_pass: r.redteam_pass, redteam_total: r.redteam_total,
  cost_micros: num(r.cost_micros), max_micros: num(r.max_micros), started_by: r.started_by, started_at: r.started_at, finished_at: r.finished_at, key_source: r.key_source,
};

async function closeStale() {
  await AG.repo.closeStale(new Date(AG.now() - AGENT.staleMinutes * 6e4).toISOString());
}

// ════════ القراءة ════════
export async function state(a: Admin) {
  requireAgentRead(a);
  let s: Settings;
  try { s = await AG.repo.settings(); } catch (e) { if (e instanceof NotMigrated) return { success: true, ready: false }; throw e; }
  await closeStale();
  const env = agentEnv();
  const v = await versions(env.model);
  const runs = await AG.repo.runs(20);
  const gate = gateOf(runs, v.fingerprint);
  const effective = env.mode !== 'off' && s.enabled && s.enabled_fingerprint === v.fingerprint;
  const reason = env.mode === 'off' ? 'env_off' : !s.enabled ? 'db_off' : s.enabled_fingerprint !== v.fingerprint ? 'stale' : null;
  return {
    success: true, ready: true, env_mode: env.mode, enabled: s.enabled, effective, reason,
    enabled_by: s.enabled_by, enabled_at: s.enabled_at, model: env.model, known_model: knownModel(env.model), cap_cents: env.capCents,
    key: {
      source: s.has_key ? 'db' : env.envKey ? 'env' : null, last4: s.key_last4, set_at: s.key_set_at, set_by: s.key_set_by,
      ok_at: s.key_ok_at, error_at: s.key_error_at, error: s.key_error, last_source: s.key_source,
      env_present: !!env.envKey, env_last4: env.envKey ? env.envKey.slice(-4) : null,
    },
    versions: v, total_cases: CASES.length, thresholds: THRESHOLDS,
    latest_run: publicRun(runs[0]) || null, gate: { ok: gate.ok, run_id: gate.run_id, reason: gate.reason, run: publicRun(gate.run) || null },
    companion_off: await AG.repo.companionOff(),
    can_write: a.role === 'super_admin' && a.method !== 'email',
  };
}

const dayMinus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

export async function usage(a: Admin) {
  requireAgentRead(a);
  return await guard(async () => {
    const env = agentEnv();
    const now = AG.now();
    const today = riyadhDay(now);
    const from = dayMinus(today, 29);
    const sinceIso = new Date(Date.parse(`${from}T00:00:00+03:00`)).toISOString();
    const [spend, use, counts, runs] = await Promise.all([AG.repo.spend(from), AG.repo.usage(sinceIso), AG.repo.counts(sinceIso), AG.repo.runs(200)]);
    const byDay = new Map(spend.map((r) => [r.day, r]));
    const evalByDay = new Map<string, number>();
    for (const r of runs) {
      const d = riyadhDay(Date.parse(r.started_at));
      if (d >= from) evalByDay.set(d, (evalByDay.get(d) ?? 0) + num(r.cost_micros));
    }
    const series = Array.from({ length: 30 }, (_, i) => {
      const day = dayMinus(today, 29 - i);
      return { day, micros: byDay.get(day)?.micros ?? 0, calls: byDay.get(day)?.calls ?? 0, eval_micros: evalByDay.get(day) ?? 0 };
    });
    // توفير الذاكرة المؤقتة: ما قُرئ منها بفرق سعر الدخل عن سعر القراءة، بضريبة الموقع
    let saved = 0, read = 0, input = 0, write = 0, cost = 0;
    for (const u of use) {
      const r = ratesFor(u.model);
      saved += u.cache_read_tokens * (r.input - r.cacheRead) * GEO_US_MULTIPLIER;
      read += u.cache_read_tokens; input += u.input_tokens; write += u.cache_write_tokens; cost += u.cost_micros;
    }
    const answers = counts.canned + counts.agent;
    return {
      success: true,
      today: { day: today, spent_micros: byDay.get(today)?.micros ?? 0, cap_micros: env.capCents * 1e4, calls: byDay.get(today)?.calls ?? 0 },
      series, conversations: counts.conversations, handoffs: counts.handoffs,
      avg_cost_micros: counts.with_calls ? Math.round(cost / counts.with_calls) : 0,
      cache: { read_tokens: read, saved_micros: Math.round(saved), hit_ratio: read + input + write ? read / (read + input + write) : 0 },
      canned_share: answers ? counts.canned / answers : 0,
      eval_micros: series.reduce((x, d) => x + d.eval_micros, 0),
    };
  });
}

export async function conversations(a: Admin, b: Body) {
  requireAgentRead(a);
  const now = AG.now();
  const to = Date.parse(String(b.to || '')) || now + 60e3;
  const from = Date.parse(String(b.from || '')) || now - 7 * 864e5;
  if (from >= to) throw new Fail('بداية المدة بعد نهايتها', 400, 'range');
  const page = Math.max(1, Math.min(1000, Math.floor(Number(b.page) || 1)));
  const who = ['all', 'contact', 'visitor'].includes(b.who) ? b.who : 'all';
  const rows = await guard(() => AG.repo.conversations({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), limit: AGENT.perPage, offset: (page - 1) * AGENT.perPage, who }));
  return {
    success: true, page, per_page: AGENT.perPage, total: num(rows[0]?.total),
    // الاسم والبريد لمن طلب التواصل وحده، وإلا «زائر» ومعرّف قصير. لا عنوان شبكة أبدًا
    rows: rows.map((r: any) => ({
      id: r.id, short_id: String(r.id).slice(0, 8), created_at: r.created_at, product: r.product, locale: r.locale, status: r.status, rating: r.rating,
      visitor_messages: num(r.visitor_messages), model_calls: num(r.model_calls), cost_micros: num(r.cost_micros), handoff_reason: r.handoff_reason,
      contact: !!r.contact_request_id, ...(r.contact_request_id ? { name: r.contact_name, email: r.contact_email } : { label: 'زائر' }),
    })),
  };
}

export async function transcript(a: Admin, b: Body) {
  requireAgentRead(a);
  const id = String(b.id || '');
  if (!UUID.test(id)) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
  const conv = await guard(() => AG.repo.conversation(id));
  if (!conv) throw new Fail('المحادثة غير موجودة أو انتهت مدتها', 404, 'not_found');
  // كل فتح يُسجَّل، والسجل يفشل مغلقًا: بلا أثر لا يُعرض النص
  await AG.audit('admin', a.email, 'admin.agent-transcript-view', 'conversations', id, null, { contact: !!conv.contact_request_id });
  const msgs = await guard(() => AG.repo.messages(id));
  return {
    success: true,
    conversation: { id: conv.id, short_id: String(conv.id).slice(0, 8), created_at: conv.created_at, product: conv.product, locale: conv.locale, status: conv.status, rating: conv.rating, handoff_reason: conv.handoff_reason, contact: !!conv.contact_request_id },
    messages: msgs.filter((m: any) => !(m.role === 'agent' && !m.body && m.stop_reason === 'pending')).map((m: any) => ({
      role: m.role, body: m.body, lang: m.lang, model: m.model, stop_reason: m.stop_reason, created_at: m.created_at,
      tokens: m.role === 'agent' ? { input: num(m.input_tokens), cache_read: num(m.cache_read_tokens), cache_write: num(m.cache_write_tokens), output: num(m.output_tokens) } : null,
      cost_micros: m.role === 'agent' ? num(m.cost_micros) : 0,
    })),
  };
}

export async function evalRuns(a: Admin) {
  requireAgentRead(a);
  const runs = await guard(async () => { await closeStale(); return await AG.repo.runs(20); });
  return { success: true, runs: runs.map(publicRun) };
}

export async function evalRun(a: Admin, b: Body) {
  requireAgentRead(a);
  const id = String(b.run_id || b.id || '');
  if (!UUID.test(id)) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
  const run = await guard(() => AG.repo.run(id));
  if (!run) throw new Fail('التشغيل غير موجود', 404, 'not_found');
  await AG.audit('admin', a.email, 'admin.agent-eval-view', 'agent_eval_runs', id, null, null);
  const res = await guard(() => AG.repo.results(id));
  const order = new Map(CASES.map((c, i) => [c.id, i]));
  res.sort((x, y) => Number(x.pass) - Number(y.pass) || (order.get(x.case_id) ?? 0) - (order.get(y.case_id) ?? 0));
  return { success: true, run: publicRun(run), results: res.map((r) => ({ case_id: r.case_id, set: r.set_name, pass: r.pass, reasons: r.reasons, source: r.source, handoff: r.handoff, reply: r.reply, cost_micros: num(r.cost_micros), message: CASES.find((c) => c.id === r.case_id)?.message ?? null })) };
}

// ════════ الكتابة (superWriter في index.ts) ════════
export async function enable(a: Admin, b: Body) {
  requireAgentRead(a);
  const want = b.enabled === true;
  const s = await settingsOr409();
  const env = agentEnv();
  const v = await versions(env.model);
  let runId: string | null = null;
  if (want) {
    if (env.mode === 'off') throw new Fail('مفتاح الطوارئ LEADERS_AGENT_ENABLED=off في الخادم يغلب اللوحة. أزله أولًا', 409, 'env_off');
    if (!knownModel(env.model)) throw new Fail(`النموذج ${env.model} غير موجود في جدول الأسعار`, 409, 'unknown_model');
    if (!s.has_key && !env.envKey) throw new Fail('لا مفتاح: اضبطه من قسم «المفتاح» أو في أسرار الخادم', 409, 'no_key');
    const gate = gateOf(await AG.repo.runs(20), v.fingerprint);
    if (!gate.ok) throw new Fail('لا تقييم ناجح لهذا الإعداد: شغّل التقييم أولًا', 409, 'eval_required', { reason: gate.reason });
    runId = gate.run_id;
  }
  const at = new Date(AG.now()).toISOString();
  await AG.repo.updateSettings(want
    ? { enabled: true, enabled_by: a.email, enabled_at: at, enabled_run_id: runId, enabled_fingerprint: v.fingerprint }
    : { enabled: false, enabled_by: a.email, enabled_at: at });
  await AG.audit('admin', a.email, want ? 'agent.enable' : 'agent.disable', 'agent_settings', 'enabled',
    { enabled: s.enabled, fingerprint: s.enabled_fingerprint }, { enabled: want, fingerprint: want ? v.fingerprint : s.enabled_fingerprint, run_id: runId });
  await AG.alert(want ? 'agent_enabled' : 'agent_disabled', { by: maskEmail(a.email), fingerprint: v.fingerprint, at }).catch(() => null);
  return { success: true, enabled: want };
}

export async function evalStart(a: Admin) {
  requireAgentRead(a);
  await settingsOr409();
  await closeStale();
  const env = agentEnv();
  if (!knownModel(env.model)) throw new Fail(`النموذج ${env.model} غير موجود في جدول الأسعار`, 409, 'unknown_model');
  const rt = await runtimeOf(env);
  if (!rt.apiKey) throw new Fail('لا مفتاح: اضبطه من قسم «المفتاح» أو في أسرار الخادم', 409, 'no_key');
  const spent = await AG.ledger().spentToday(riyadhDay(AG.now()));
  if (spent === null || spent + AGENT.startReserveMicros > env.capCents * 1e4) throw new Fail('لا يتسع سقف اليوم للتقييم', 409, 'daily_cap');
  const v = await versions(env.model);
  const made = await guard(() => AG.repo.createRun({
    model: env.model, knowledge_version: v.knowledge_version, prompt_version: v.prompt_version, cases_version: v.cases_version, fingerprint: v.fingerprint,
    key_source: rt.keySource, total_cases: CASES.length, max_micros: AGENT.runMaxMicros, started_by: a.email,
  }));
  if ('running' in made) throw new Fail('يجري تقييم آخر الآن', 409, 'eval_running', { run_id: made.running });
  await AG.audit('admin', a.email, 'agent.eval-start', 'agent_eval_runs', made.id, null, { fingerprint: v.fingerprint });
  return { success: true, run_id: made.id, total: CASES.length };
}

export async function evalCancel(a: Admin, b: Body) {
  requireAgentRead(a);
  const id = String(b.run_id || '');
  if (!UUID.test(id)) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
  const run = await guard(() => AG.repo.run(id));
  if (!run) throw new Fail('التشغيل غير موجود', 404, 'not_found');
  if (run.status !== 'running') return { success: true, status: run.status };
  await AG.repo.updateRun(id, { status: 'stopped', stop_reason: 'cancelled', finished_at: new Date(AG.now()).toISOString(), lease_until: null });
  await AG.audit('admin', a.email, 'agent.eval-cancel', 'agent_eval_runs', id, null, { done: run.done_cases });
  return { success: true, status: 'stopped' };
}

const progress = (r: Run, extra: Record<string, unknown> = {}) => ({
  success: true, run_id: r.id, done: r.status !== 'running', status: r.status, stop_reason: r.stop_reason, done_cases: r.done_cases, total: r.total_cases,
  cost_micros: num(r.cost_micros), rates: { eval: r.eval_total ? r.eval_pass / r.eval_total : 0, redteam: r.redteam_total ? r.redteam_pass / r.redteam_total : 0 }, ...extra,
});

// أسوأ تكلفة لحالة قبل تشغيلها (البادئة كتابة في الذاكرة، والرسالة دخل، والخرج حتى max_tokens)
const PREFIX_TOKENS = estimateTokens(SYSTEM_BLOCKS.map((x) => x.text).join(''));
export const caseWorst = (model: string, c: Case) => worstCaseMicros(model, PREFIX_TOKENS, estimateTokens(c.message) + 200, MAX_TOKENS);

export async function evalStep(a: Admin, b: Body) {
  requireAgentRead(a);
  const id = String(b.run_id || '');
  if (!UUID.test(id)) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
  const leased = await guard(() => AG.repo.lease(id, AGENT.leaseSeconds));
  if (!leased) {
    const run = await guard(() => AG.repo.run(id));
    if (!run) throw new Fail('التشغيل غير موجود', 404, 'not_found');
    if (run.status !== 'running') return progress(run);
    throw new Fail('دفعة أخرى من هذا التشغيل تعمل الآن', 409, 'busy');
  }
  const run = leased;
  const finish = async (status: Run['status'], stop: string | null) => {
    await AG.repo.updateRun(id, { status, stop_reason: stop, finished_at: new Date(AG.now()).toISOString(), lease_until: null });
    const after = (await AG.repo.run(id)) ?? { ...run, status, stop_reason: stop };
    return progress(after as Run);
  };
  try {
    const env = agentEnv();
    const v = await versions(env.model);
    if (v.fingerprint !== run.fingerprint) return await finish('stopped', 'stale');
    const rt = await runtimeOf(env, v);
    if (!rt.apiKey) return await finish('error', 'key');
    const done = new Set((await AG.repo.results(id)).map((r) => r.case_id));
    const pending = CASES.filter((c) => !done.has(c.id)).slice(0, AGENT.batch);
    const evalEnv: Env = { apiKey: rt.apiKey, model: env.model, capCents: env.capCents, enabled: true, turnstileSecret: 'eval', turnstileSite: 'eval', adminEmail: '' };
    const real = AG.ledger();
    let cost = num(run.cost_micros);
    let stop: { status: Run['status']; reason: string } | null = null;
    const queue = [...pending];
    const worker = async () => {
      while (queue.length && !stop) {
        const c = queue.shift()!;
        // حارس التشغيل: لا تبدأ حالة قد تتجاوز حده
        const worst = caseWorst(env.model, c);
        if (cost + worst > num(run.max_micros)) { stop = { status: 'stopped', reason: 'max_cost' }; return; }
        cost += worst;
        let o: CaseOutcome;
        try {
          o = await runCase(c, { env: evalEnv, model: AG.model, real });
        } catch (e) {
          // رقم الحالة ونوع الخطأ وحدهما، لا نص ولا رد
          console.error('agent eval case:', c.id, (e as Error)?.name);
          cost -= worst;
          stop = { status: 'error', reason: 'ledger' };
          return;
        }
        cost += o.costMicros - worst;
        if (o.errorStatus === 401 || o.errorStatus === 403) {
          console.error('agent eval case:', c.id, o.errorStatus);
          stop = { status: 'error', reason: 'key' };
          return;
        }
        if (o.ledger === 'refused') { stop = { status: 'stopped', reason: 'daily_cap' }; return; }
        if (o.ledger === 'error') { stop = { status: 'error', reason: 'ledger' }; return; }
        if (o.errorStatus !== null) console.error('agent eval case:', c.id, o.errorStatus);
        await AG.repo.addResult({ run_id: id, case_id: c.id, set_name: c.set, pass: o.pass, reasons: o.reasons.slice(0, 20).map((x) => x.slice(0, 300)), source: o.reply.source, handoff: o.reply.handoff, reply: o.reply.text.slice(0, 6000), cost_micros: o.costMicros });
        if (o.costMicros > 0) await AG.repo.addCost(id, o.costMicros);
      }
    };
    await Promise.all(Array.from({ length: Math.min(AGENT.parallel, pending.length) }, worker));
    // المجاميع من النتائج نفسها لا من عداد يتكرر
    const all = await AG.repo.results(id);
    const ev = all.filter((r) => r.set_name === 'eval');
    const rtm = all.filter((r) => r.set_name === 'redteam');
    const totals = { done_cases: all.length, eval_pass: ev.filter((r) => r.pass).length, eval_total: ev.length, redteam_pass: rtm.filter((r) => r.pass).length, redteam_total: rtm.length };
    await AG.repo.updateRun(id, totals);
    const s = stop as { status: Run['status']; reason: string } | null;
    if (s) return await finish(s.status, s.reason);
    if (all.length >= run.total_cases) {
      const passed = totals.eval_total > 0 && totals.redteam_total > 0 && totals.eval_pass / totals.eval_total >= THRESHOLDS.eval && totals.redteam_pass / totals.redteam_total >= THRESHOLDS.redteam;
      return await finish(passed ? 'passed' : 'failed', null);
    }
    await AG.repo.updateRun(id, { lease_until: null });
    return progress({ ...run, ...totals, cost_micros: cost } as Run);
  } catch (e) {
    await AG.repo.updateRun(id, { lease_until: null }).catch(() => null);
    throw e;
  }
}

// ════════ المفتاح ════════
async function keyGuards(a: Admin) {
  const since = new Date(AG.now() - 36e5).toISOString();
  const n = await guard(() => AG.repo.keyAttempts(a.email, since));
  if (n.mine >= AGENT.keyPerAdminHour || n.all >= AGENT.keyAllHour) throw new Fail('محاولات كثيرة لتغيير المفتاح في الساعة الأخيرة، حاول لاحقًا', 429, 'rate');
  if (!a.id || !a.sessionHash) throw new Fail('أكّد بالبصمة أو برمز تطبيق المصادقة ثم أعد الحفظ', 403, 'step_up_required');
  // الاستهلاك قبل أي شبكة: تحقق واحد = محاولة واحدة
  const method = await guard(() => AG.repo.consumeStepUp(a.sessionHash!, a.id!, 'agent_key'));
  if (!method) throw new Fail('أكّد بالبصمة أو برمز تطبيق المصادقة ثم أعد الحفظ', 403, 'step_up_required');
  return method;
}

// التحقق عند Anthropic بلا SDK: الحالة وحدها تُسجل، لا الرد ولا الرؤوس
export async function checkKey(key: string, model: string): Promise<{ ok: true; model_ok: boolean } | { ok: false; code: string; status: number }> {
  let res: Response;
  try {
    res = await AG.fetch('https://api.anthropic.com/v1/models?limit=100', {
      method: 'GET', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(AGENT.keyCheckMs),
    });
  } catch {
    return { ok: false, code: 'key_unverified', status: 0 };
  }
  if (res.status === 200) {
    let ids: string[] = [];
    try { ids = ((await res.json())?.data || []).map((m: any) => String(m?.id || '')); } catch { /* القائمة اختيارية */ }
    return { ok: true, model_ok: ids.includes(model) };
  }
  try { await res.body?.cancel(); } catch { /* */ }
  if (res.status === 401) return { ok: false, code: 'key_rejected', status: 401 };
  if (res.status === 403) return { ok: false, code: 'key_forbidden', status: 403 };
  return { ok: false, code: 'key_unverified', status: res.status };
}

const KEY_FAIL: Record<string, [string, number]> = {
  key_rejected: ['رفضت Anthropic المفتاح، لم يُحفظ شيء', 400],
  key_forbidden: ['المفتاح بلا صلاحية على الواجهة، لم يُحفظ شيء', 400],
  key_unverified: ['تعذّر التحقق من المفتاح الآن، لم يُحفظ شيء. حاول بعد قليل', 503],
};

async function notifyOwners(kind: 'changed' | 'reverted', rows: [string, string][]) {
  const owners = await AG.repo.owners().catch(() => [] as string[]);
  for (const to of owners) await AG.mail(to, AGENT_KEY_MAIL_SUBJECT[kind], agentKeyMail(kind, rows)).catch(() => console.error('agent key mail failed'));
}
const when = (ms: number) => new Date(ms).toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh' });

export async function keySet(a: Admin, b: Body) {
  requireAgentRead(a);
  const before = await settingsOr409();
  const method = await keyGuards(a);
  const key = String(b.key ?? '').trim();
  if (!KEY_RE.test(key)) {
    await AG.audit('admin', a.email, 'agent.key-rejected', 'agent_settings', 'key', null, { reason: 'invalid_key', method });
    throw new Fail('صيغة المفتاح غير صحيحة: يبدأ بـ sk-ant-', 400, 'invalid_key');
  }
  const env = agentEnv();
  const c = await checkKey(key, env.model);
  if (!c.ok) {
    await AG.audit('admin', a.email, 'agent.key-rejected', 'agent_settings', 'key', null, { reason: c.code, status: c.status, method });
    const [msg, st] = KEY_FAIL[c.code];
    throw new Fail(msg, st, c.code);
  }
  const saved = await guard(() => AG.repo.keySet(key, a.email));
  const at = AG.now();
  await AG.audit('admin', a.email, 'agent.key-set', 'agent_settings', 'key', { last4: before.key_last4 }, { last4: saved.key_last4, method, model_ok: c.model_ok });
  const methodAr = METHOD_AR[method] || method;
  await AG.alert('agent_key_changed', { by: maskEmail(a.email), method: methodAr, last4_before: before.key_last4 || (env.envKey ? 'سر الخادم' : 'لا مفتاح'), last4_after: saved.key_last4, at: when(at) }).catch(() => null);
  await notifyOwners('changed', [['الحساب', maskEmail(a.email)], ['الطريقة', methodAr], ['آخر أربعة قبل', before.key_last4 ? `••••${before.key_last4}` : 'سر الخادم'], ['آخر أربعة بعد', `••••${saved.key_last4}`], ['الوقت', when(at)]]);
  return { success: true, key: { source: 'db', last4: saved.key_last4, set_at: saved.key_set_at, set_by: a.email }, model_ok: c.model_ok };
}

export async function keyClear(a: Admin, b: Body) {
  requireAgentRead(a);
  const before = await settingsOr409();
  if (!before.has_key) throw new Fail('المفتاح من سر الخادم أصلًا', 409, 'no_db_key');
  const env = agentEnv();
  if (before.enabled && !env.envKey && b.force !== true) throw new Fail('لا سر ANTHROPIC_API_KEY في الخادم، فالرجوع يطفئ المساعد. أكّد الإطفاء صراحة', 409, 'no_env_key');
  const method = await keyGuards(a);
  await guard(() => AG.repo.keyClear(a.email));
  const forced = before.enabled && !env.envKey;
  if (forced) await AG.repo.updateSettings({ enabled: false, enabled_by: a.email, enabled_at: new Date(AG.now()).toISOString() });
  await AG.audit('admin', a.email, 'agent.key-clear', 'agent_settings', 'key', { last4: before.key_last4 }, { source: env.envKey ? 'env' : null, method, disabled: forced });
  const methodAr = METHOD_AR[method] || method;
  await AG.alert('agent_key_reverted', { by: maskEmail(a.email), method: methodAr, last4_before: before.key_last4, at: when(AG.now()), disabled: forced }).catch(() => null);
  await notifyOwners('reverted', [['الحساب', maskEmail(a.email)], ['الطريقة', methodAr], ['آخر أربعة قبل', `••••${before.key_last4}`], ['المصدر الآن', env.envKey ? 'سر الخادم' : 'لا مفتاح'], ['الوقت', when(AG.now())]]);
  return { success: true, key: { source: env.envKey ? 'env' : null, last4: null }, disabled: forced };
}
