// ════════════════════════════════════════════════════════════════
// مشغّل التقييم المشترك: run.ts (محليًا للمطور) والتقييم من اللوحة (leaders-api) بالمنطق نفسه
// ════════════════════════════════════════════════════════════════
// نقي بلا Deno.args ولا Deno.exit ولا ملفات. كل حالة تمر بالدالة كاملة (handle) بمخزن في الذاكرة، والمصحح نفسه (grade).
// على الخادم: المحادثات في الذاكرة لا تلمس leaders.conversations، والإنفاق يُحجز ويُسوّى في السجل الحقيقي (ledgerStore)
// فيُحسب التقييم ضمن سقف اليوم.
import { handle, type Deps, type Env } from '../handler.ts';
import { emptyMem, memStore } from '../mem_store.ts';
import { costMicros, knownModel } from '../pricing.ts';
import type { Store } from '../store.ts';
import { type Case, grade, type Reply, THRESHOLDS } from './grade.ts';

export type CaseOutcome = {
  id: string; set: 'eval' | 'redteam'; pass: boolean; reasons: string[]; reply: Reply; costMicros: number;
  // حالة HTTP لخطأ النموذج إن رمى (401/403 توقف التشغيل على الخادم ولا تُحسب الحالة)
  errorStatus: number | null;
  // سبب «اترك رسالتك» من السجل: refused = امتلأ سقف اليوم، وerror = تعذر السجل
  ledger: 'refused' | 'error' | null;
  // التكرار (runCaseRepeated): عدد التشغيلات وعدد الناجح منها. الحالة ناجحة إن نجحت في كل تشغيل
  runs?: number; passes?: number;
};

// مخزن مركب: كل شيء من الذاكرة، إلا الإنفاق وعلامات التنبيه من المخزن الحقيقي. note يسجل رفض الحجز أو تعذره
export function ledgerStore(mem: Store, real: Store, note: { ledger: 'refused' | 'error' | null } = { ledger: null }): Store {
  return {
    ...mem,
    spentToday: (day) => real.spentToday(day),
    reserveSpend: async (day, micros, cap) => {
      const r = await real.reserveSpend(day, micros, cap);
      if (!r.ok) note.ledger = r.reason;
      return r;
    },
    settleSpend: (day, delta) => real.settleSpend(day, delta),
    markAlert: (day, level) => real.markAlert(day, level),
  };
}

export async function runCase(c: Case, o: { env: Env; model: Deps['model']; store?: Store; real?: Store; alert?: Deps['alert'] }): Promise<CaseOutcome> {
  const note: { ledger: 'refused' | 'error' | null } = { ledger: null };
  const mem = o.store ?? memStore(emptyMem());
  const store = o.real ? ledgerStore(mem, o.real, note) : mem;
  let cost = 0;
  let errorStatus: number | null = null;
  const deps: Deps = {
    store, env: { ...o.env, enabled: true }, clientIp: () => null, turnstile: async () => true, notifyAdmin: async () => {},
    alert: o.alert ?? (async () => true),
    // الاستدعاء ملفوف: تكلفة كل استدعاء للحالة من usage، وحالة الخطأ إن رمى
    model: async (messages, onText, signal, apiKey, opts) => {
      try {
        const r = await o.model(messages, onText, signal, apiKey, opts);
        cost += costMicros(knownModel(r.model) ? r.model : o.env.model, r.usage);
        return r;
      } catch (e) {
        const st = (e as { status?: unknown })?.status;
        errorStatus = typeof st === 'number' ? st : 0;
        throw e;
      }
    },
  };
  const post = (body: Record<string, unknown>) => handle(new Request('http://eval', { method: 'POST', body: JSON.stringify(body) }), deps);
  const started = await (await post({ action: 'start', page: c.page, locale: c.expect.lang, captcha: 'eval-token-xx' })).json();
  const res = await post({ action: 'send', token: started.token, message: c.message });
  const text = await res.text();
  const done = text.split('\n\n').find((b) => b.startsWith('event: done') || b.startsWith('event: capped') || b.startsWith('event: error')) || '';
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(done.match(/^data: (.+)$/m)?.[1] || '{}'); } catch { /* رد غير متوقع: يُصحح فارغًا */ }
  const kind = done.match(/^event: (\w+)/)?.[1];
  const reply: Reply = { text: String(data.text || ''), handoff: !!data.handoff, source: kind === 'done' ? (data.source as Reply['source']) : ((kind || 'error') as Reply['source']) };
  if (reply.source === 'canned') reply.cannedId = c.expect.canned ?? null;
  const g = grade(c, reply);
  return { id: c.id, set: c.set, pass: g.pass, reasons: g.reasons, reply, costMicros: cost, errorStatus, ledger: note.ledger };
}

// تشغيل الحالة n مرة (1 إلى 3): ناجحة إن نجحت في كل تشغيل، والتذبذب يُذكر في الأسباب (نجح k من n). الرد المحفوظ
// رد أول تشغيل راسب (أو آخر تشغيل إن نجحت كلها)، والتكلفة مجموع التشغيلات. خطأ النموذج أو رفض السجل يوقف التكرار
// ويعيد تلك النتيجة كما هي، فيعاملها المتصل كما يعامل التشغيل الواحد.
export const MAX_REPEATS = 3;
export const repeatsOf = (v: unknown) => Math.min(MAX_REPEATS, Math.max(1, Math.round(Number(v) || 1)));
export async function runCaseRepeated(c: Case, o: Parameters<typeof runCase>[1], n: number): Promise<CaseOutcome> {
  const times = repeatsOf(n);
  const all: CaseOutcome[] = [];
  let cost = 0;
  for (let i = 0; i < times; i++) {
    const r = await runCase(c, o);
    cost += r.costMicros;
    if (r.errorStatus !== null || r.ledger !== null) return { ...r, costMicros: cost, runs: all.length + 1, passes: all.filter((x) => x.pass).length };
    all.push(r);
  }
  const passes = all.filter((x) => x.pass).length;
  const shown = all.find((x) => !x.pass) ?? all[all.length - 1];
  const reasons = times > 1 && passes > 0 && passes < times ? [`تذبذب: نجح ${passes} من ${times}`, ...shown.reasons] : shown.reasons;
  return { ...shown, pass: passes === times, reasons, costMicros: cost, runs: times, passes };
}

export type SetSummary = { pass: number; total: number; rate: number };
export function summarize(outcomes: { set: 'eval' | 'redteam'; pass: boolean }[]): { eval: SetSummary; redteam: SetSummary; passed: boolean } {
  const of = (set: 'eval' | 'redteam'): SetSummary => {
    const rs = outcomes.filter((x) => x.set === set);
    const pass = rs.filter((x) => x.pass).length;
    return { pass, total: rs.length, rate: rs.length ? pass / rs.length : 0 };
  };
  const ev = of('eval');
  const rt = of('redteam');
  return { eval: ev, redteam: rt, passed: ev.total > 0 && rt.total > 0 && ev.rate >= THRESHOLDS.eval && rt.rate >= THRESHOLDS.redteam };
}
