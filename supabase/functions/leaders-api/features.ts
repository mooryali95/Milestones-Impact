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
const F360_SUBJECTS = [...Object.values(FEEDBACK_MAIL).map((m) => (m.subject as (w: string) => string)('').trim()), 'مقيّم بانتظار تأكيدك', 'لم يُعتمد أحد مقيّميك'];
export async function heldMail(): Promise<Set<string>> {
  if ((await features()).f360) return new Set();
  const { data, error } = await db.from('mail_queue').select('id, ref, subject').is('sent_at', null).is('gave_up_at', null).order('created_at').limit(1000);
  if (error) throw error;
  const rows = (data || []) as { id: string; ref: string | null; subject: string }[];
  const held = new Set(rows.filter((m) => F360_SUBJECTS.some((s) => String(m.subject || '').startsWith(s))).map((m) => m.id));
  const raterIds = [...new Set(rows.map((m) => /^rater:([0-9a-f-]{36})$/i.exec(m.ref || '')?.[1]).filter(Boolean))] as string[];
  for (let i = 0; i < raterIds.length; i += 100) {
    const { data: rs, error: re } = await db.from('raters').select('id').in('id', raterIds.slice(i, i + 100)).in('phase', ['f360', 'pre', 'post']);
    if (re) throw re;
    const f360 = new Set((rs || []).map((r: any) => `rater:${r.id}`));
    for (const m of rows) if (m.ref && f360.has(m.ref)) held.add(m.id);
  }
  return held;
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
