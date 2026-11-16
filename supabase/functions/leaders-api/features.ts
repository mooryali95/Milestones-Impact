// ════════════════════════════════════════════════════════════════
// مفاتيح الميزات على الخادم: القراءة من المخزن الواحد، والحارس المركزي لكل فعل، وما يُمسك في طابور البريد
// ════════════════════════════════════════════════════════════════
// المنطق الصافي في features.js. القيم من appSettings() بذاكرة دقيقة، وتعذّر القراءة يعيد الافتراضي (مطفأ).
import { db, Fail, FEEDBACK_MAIL, WORKSHOP_MAIL } from './core.ts';
import { mailNote } from '../_shared/mail.ts';
import { appSettings } from './settings.ts';
import { featureFlags, featureGate, WORKSHOP_NO_HALL_NOTE } from './features.js';

export type Features = { hall: boolean; katon: boolean; f360: boolean };

export async function features(): Promise<Features> {
  return featureFlags(await appSettings());
}

// الحارس المركزي (index.ts): يرمي Fail برمز الميزة، أو يعيد ردًا جاهزًا لقراءة مطفأة، أو null فيمضي الفعل
export async function gate(action: string): Promise<Record<string, unknown> | null> {
  const g = featureGate(action, await features());
  if (!g) return null;
  if (g.fail) throw new Fail(g.fail.message, g.fail.status, g.fail.code);
  return g.soft;
}

// بريد 360 المنتظر في الطابور حين يُطفأ: يُمسك ولا يُرسل ولا يُلغى، فيخرج حين يُظهَر (الدورة متجمدة لا ملغاة).
// دعوات المقيّمين وتذكيراتهم بمرجع rater:<id> لمقيّم بمرحلة f360 أو مقيّم أثر (pre وpost، مؤجل مع 360)، ورسائل الدورة
// بعناوينها (FEEDBACK_MAIL)، ورسالتا تأكيد مقيّم الأثر (للمؤكِّد وللمشارك عند عدم الاعتماد)
// ورسالتا التأكيد من بريد مقيّمي الأثر (impact)، وما سواهما من بريد الدورة (f360): لكل نطاق بداية إخفاء تخصه عند الاستئناف
const IMPACT_SUBJECTS = ['مقيّم بانتظار تأكيدك', 'لم يُعتمد أحد مقيّميك'];
const F360_SUBJECTS = [...Object.values(FEEDBACK_MAIL).map((m) => (m.subject as (w: string) => string)('').trim()), ...IMPACT_SUBJECTS];
export type QueuedF360 = { id: string; created_at: string; expires_at?: string | null; scope: 'f360' | 'impact' };
// كل ما في الطابور مما يمسكه المفتاح وهو مطفأ، أيًا كانت حاله الآن (heldMail يمسكه، وresumeHeldMail يعيد عمره عند الإظهار)
export async function f360QueuedMail(): Promise<QueuedF360[]> {
  // expires_at (ترحيل 20261116150000) يُقرأ إن وُجد، وقبله بدونه
  const read = (cols: string) => db.from('mail_queue').select(cols).is('sent_at', null).is('gave_up_at', null).order('created_at').limit(1000);
  let { data, error } = await read('id, ref, subject, created_at, expires_at');
  if (error) ({ data, error } = await read('id, ref, subject, created_at'));
  if (error) throw error;
  const rows = (data || []) as unknown as { id: string; ref: string | null; subject: string; created_at: string; expires_at?: string | null }[];
  const scope = new Map<string, 'f360' | 'impact'>();
  for (const m of rows) {
    const sub = String(m.subject || '');
    if (IMPACT_SUBJECTS.some((x) => sub.startsWith(x))) scope.set(m.id, 'impact');
    else if (F360_SUBJECTS.some((x) => sub.startsWith(x))) scope.set(m.id, 'f360');
  }
  const raterIds = [...new Set(rows.map((m) => /^rater:([0-9a-f-]{36})$/i.exec(m.ref || '')?.[1]).filter(Boolean))] as string[];
  for (let i = 0; i < raterIds.length; i += 100) {
    const { data: rs, error: re } = await db.from('raters').select('id, phase').in('id', raterIds.slice(i, i + 100)).in('phase', ['f360', 'pre', 'post']);
    if (re) throw re;
    const phase = new Map((rs || []).map((r: any) => [`rater:${r.id}`, r.phase === 'f360' ? 'f360' as const : 'impact' as const]));
    for (const m of rows) { const ph = m.ref ? phase.get(m.ref) : undefined; if (ph) scope.set(m.id, ph); }
  }
  return rows.filter((m) => scope.has(m.id)).map((m) => ({ id: m.id, created_at: m.created_at, expires_at: m.expires_at ?? null, scope: scope.get(m.id)! }));
}
export async function heldMail(): Promise<Set<string>> {
  if ((await features()).f360) return new Set();
  return new Set((await f360QueuedMail()).map((m) => m.id));
}
// عند الإظهار: ما مضى مخفيًا لا يُحسب على الرسالة الممسَكة، وإلا عدّها التفريغ فائتة فلا تُرسل دعوة أو تأكيد عاد رابطه حيًا.
// يُزاح created_at (ترتيبها في الطابور، وقاعدة العمر قبل ترحيل الموعد) وexpires_at (موعدها، كما يُزاح موعد المقيّم في
// resumeFrozen) بقدر ما مضى منها في الإخفاء (من بداية نطاقها أو من دخولها الطابور، أيهما أحدث)
export async function resumeHeldMail(since: { f360: number | null; impact: number | null }, now = Date.now()): Promise<number> {
  let n = 0;
  for (const m of await f360QueuedMail()) {
    const from = since[m.scope];
    const created = Date.parse(m.created_at);
    if (from === null || !Number.isFinite(created)) continue;
    const delta = now - Math.max(from, created);
    if (delta <= 0) continue;
    const exp = m.expires_at ? Date.parse(m.expires_at) : NaN;
    const patch: Record<string, string> = { created_at: new Date(created + delta).toISOString() };
    if (Number.isFinite(exp)) patch.expires_at = new Date(exp + delta).toISOString();
    const { error } = await db.from('mail_queue').update(patch).eq('id', m.id).is('sent_at', null);
    if (error) throw error;
    n += 1;
  }
  return n;
}

// بريد ورشة دخل الطابور بملاحظة القاعة (السقف اليومي) ثم أُخفيت القاعة قبل خروجه: تُستبدل الملاحظة عند الإرسال
// بالملاحظة العامة (لا تُعرف طريقة الحضور من الطابور)، وما سواه يخرج كما خُزّن. والقاعة ظاهرة: لا تغيير
type Queued = { subject: string; html: string };
export function hallNoteRewrite(hallOn: boolean): (m: Queued) => string {
  if (hallOn) return (m) => m.html;
  const swaps = (Object.keys(WORKSHOP_MAIL) as (keyof typeof WORKSHOP_MAIL)[])
    .map((k) => ({ subject: WORKSHOP_MAIL[k].subject as string, from: mailNote(WORKSHOP_MAIL[k].note), to: mailNote(WORKSHOP_NO_HALL_NOTE.other[k]) }));
  return (m) => {
    const w = swaps.find((x) => x.subject === m.subject);
    return w ? String(m.html || '').split(w.from).join(w.to) : m.html;
  };
}
export async function mailRewrite(): Promise<(m: Queued) => string> {
  return hallNoteRewrite((await features()).hall);
}
