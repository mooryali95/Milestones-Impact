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
    model: async (messages, onText, signal, apiKey) => {
      try {
        const r = await o.model(messages, onText, signal, apiKey);
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
