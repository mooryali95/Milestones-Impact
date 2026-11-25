// ════════════════════════════════════════════════════════════════
// الملخص اليومي لإشعارات الإدارة (مركز الإشعارات، المرحلة 3، التصور 6.3 وقرار المالك في القسم 11)
// ════════════════════════════════════════════════════════════════
// من المهمة الساعية (cron.expert-offers)، مرة في يوم الرياض بعد ساعة الملخص (9:00 افتراضيًا، ويغيرها المالك من «التوجيه»):
// 1. يعدّ منذ آخر ملخص (وأربعًا وعشرين ساعة لأول مرة، وثمانيًا وأربعين على الأكثر) كل حدث يقرر له route ملخصًا:
//    إشعارات المالك (audit_log: system.notify)، والتنبيهات الموسومة (system.alert، كالحجز من غير مؤهل)، ودخول المالك
//    من جهاز معروف (public.admin_audit_log: login وmeta.device=known).
// 2. سطر لكل نوع بعدده ورابط شاشته في سلسلة «الملخص اليومي» في Slack. لا أسماء ولا بريد ولا نص: عدد ورابط.
// 3. لا يُنشر فارغًا. وإن لم يُضبط Slack أو لم يصل: بريد واحد بدله، لا رسالة لكل حدث.
// علامة اليوم سطر system.digest في audit_log باليوم (المعرّف)، يُكتب بعد النشر أو البريد أو حين لا شيء يُنشر، فلا يتكرر
// الملخص في الساعات التالية. وما فشل في القناتين لا يُعلَّم فيُعاد في الساعة التالية. وما وصل يُعلَّم في ذاكرة النسخة ولو
// تعذرت كتابة العلامة، فلا يتكرر بريد الاحتياط كل ساعة. والعلامة تحمل لحظة القراءة (until)، ومنها تبدأ نافذة الملخص التالي،
// فلا يسقط ما وقع بين القراءة وكتابة العلامة.
// الموعد الفعلي أول تشغيل للمهمة الساعية بعد الساعة المضبوطة: المهمة في الدقيقة 17، فملخص 9:00 يخرج نحو 9:17 بالرياض.
import { audit, CONFIG, db, publicDb, sendMail } from './core.ts';
import { mailButton, mailNote, mailRows, mailShell, mailText } from '../_shared/mail.ts';
import { maskText, riyadhDay, slackConfigured, slackDeliver } from '../_shared/slack.ts';
import { DIGEST_HOUR_RIYADH, DIGEST_SUBJECT, digestEvents, EVENT_INDEX, eventOf, screenOf } from '../_shared/notify-routing.js';
import { notifySettings } from '../_shared/notify-settings.ts';
import { NOTICE_ACTION } from './notify.ts';
import { SITES } from '../_shared/sites.js';
import { cohortDigest } from './cohort-pulse.ts';

export const DIGEST_ACTION = 'system.digest';
const DAY_MS = 864e5;
const MAX_WINDOW_MS = 2 * DAY_MS;
// سقف القراءة لكل مصدر: يوم مزدحم لا يقرأ السجل كله، وما زاد يُذكر «أكثر من»
const READ_LIMIT = 2000;

// text: سطر بنصه بدل عدده (تقدم الدفعات: «14 نشاطًا مكتملًا، متأخران جديدان»)، وعدده صفر فلا يدخل مجموع الإشعارات
export type DigestRow = { key: string; label: string; count: number; more?: boolean; text?: string };
export type DigestResult = { due: boolean; posted?: boolean; slack?: boolean; email?: boolean; empty?: boolean; rows?: number; error?: string };

// ساعة الرياض الآن (UTC+3 بلا توقيت صيفي)
const riyadhHour = (now: number) => new Date(now + 3 * 36e5).getUTCHours();

// عدّ صفوف مصدر بمفتاح حدثها، لما يقرر له الإعداد ملخصًا فقط
function tally(keys: string[], allowed: Set<string>, into: Map<string, number>) {
  for (const k of keys) {
    const key = eventOf(k).key;
    if (allowed.has(key)) into.set(key, (into.get(key) ?? 0) + 1);
  }
}

// سطر تقدم الدفعات (cohort_progress، تصور تشغيل الدفعة 2026-11-19، المرحلة 3): من لقطات الدفعات التي التُقطت في نافذة الملخص،
// أعداد وحدها. آخر السطور. تعذّر قراءته خطأ يعيد الملخص في الساعة التالية، وقبل ترحيل اللقطة لا سطر
export const COHORT_EVENT = 'cohort_progress';
async function cohortRow(since: string, until: string, errors: string[]): Promise<DigestRow[]> {
  try {
    const line = await cohortDigest(since, until);
    return line ? [{ key: COHORT_EVENT, label: 'تقدم الدفعات', count: 0, text: line.text }] : [];
  } catch (e) { errors.push(`cohorts: ${(e as Error)?.message || e}`); return []; }
}

export async function digestRows(since: string, allowed: Set<string>, until = new Date().toISOString()): Promise<{ rows: DigestRow[]; errors: string[] }> {
  const counts = new Map<string, number>();
  const capped = new Set<string>();
  const errors: string[] = [];
  const read = async (name: string, q: PromiseLike<{ data: any[] | null; error: any }>, keyOf: (r: any) => string) => {
    const { data, error } = await q;
    if (error) { errors.push(`${name}: ${error.message || error}`); return; }
    const keys = (data || []).map(keyOf);
    tally(keys, allowed, counts);
    if ((data || []).length >= READ_LIMIT) for (const k of keys) capped.add(eventOf(k).key);
  };
  await Promise.all([
    read('notify', db.from('audit_log').select('entity_id').eq('action', NOTICE_ACTION).gte('created_at', since).limit(READ_LIMIT), (r) => String(r.entity_id || '')),
    read('alert', db.from('audit_log').select('entity_id').eq('action', 'system.alert').gte('created_at', since).limit(READ_LIMIT), (r) => String(r.entity_id || '')),
    ...(allowed.has('owner_login_known_device') ? [read('login', publicDb.from('admin_audit_log').select('id').eq('action', 'login').eq('meta->>device', 'known').gte('created_at', since).limit(READ_LIMIT), () => 'owner_login_known_device')] : []),
  ]);
  // ترتيب الفهرس نفسه، فيثبت ترتيب السطور من يوم إلى يوم
  const rows = [...counts.entries()]
    .sort(([a], [b]) => Object.keys(EVENT_INDEX).indexOf(a) - Object.keys(EVENT_INDEX).indexOf(b))
    .map(([key, count]) => ({ key, label: eventOf(key).label, count, ...(capped.has(key) ? { more: true } : {}) })) as DigestRow[];
  if (allowed.has(COHORT_EVENT)) rows.push(...await cohortRow(since, until, errors));
  return { rows, errors };
}

// سطور Slack: عنوان بالفترة، وسطر لكل نوع بعدده ورابط شاشته. كل ما فيه من الفهرس والأعداد، ويمر بـ maskText احتياطًا.
// لا يُقص النص المجموع: السطور تُقسم على رسائل لا تتجاوز كل منها DIGEST_CHUNK (حد السطر في slackPost)، فلا يسقط نوع ولا عدد
export const DIGEST_CHUNK = 600;
export function digestTexts(rows: DigestRow[]): string[] {
  const total = rows.reduce((n, r) => n + r.count, 0);
  const lines = [total ? `🗞️ ${total} إشعارًا منذ الملخص السابق` : '🗞️ الملخص اليومي',
    ...rows.map((r) => `• ${r.label}: ${r.text ?? `${r.more ? 'أكثر من ' : ''}${r.count}`} ${SITES.admin}/${screenOf(r.key)}`)].map((l) => maskText(l).slice(0, DIGEST_CHUNK));
  const out: string[] = [];
  let cur = '';
  for (const l of lines) {
    if (cur && cur.length + 1 + l.length > DIGEST_CHUNK) { out.push(cur); cur = l; } else cur = cur ? `${cur}\n${l}` : l;
  }
  if (cur) out.push(cur);
  return out;
}

export function digestMail(rows: DigestRow[], why: 'unconfigured' | 'failed') {
  return mailShell(DIGEST_SUBJECT,
    mailText(why === 'failed' ? 'لم يصل الملخص اليومي إلى Slack، فهذه نسخته بالبريد.' : 'Slack غير مضبوط، فهذا الملخص اليومي بالبريد.')
    + mailRows(rows.map((r) => [r.label, r.text ?? `${r.more ? 'أكثر من ' : ''}${r.count}`] as [string, string]))
    + mailNote('هذا بريد واحد في اليوم بدل الملخص في Slack. والإشعارات الحرجة تصلك بالبريد فور وقوعها كما هي.')
    + mailButton(`${SITES.admin}/#/leaders/overview`, 'افتح لوحة الإدارة'),
    { family: 'admin', preheader: 'الملخص اليومي لإشعارات الإدارة', footnote: 'يصلك هذا الملخص لأن بريدك مضبوط في LEADERS_ALERT_EMAIL.' });
}

// علامة اليوم في هذه النسخة: يوم أُرسل ملخصه لا يُعاد فيه السؤال
let doneDay = '';
export const resetDigest = () => { doneDay = ''; };

export async function dailyDigest(now = Date.now()): Promise<DigestResult> {
  const day = riyadhDay(now);
  if (doneDay === day) return { due: false };
  // الساعة من إعداد المالك (قسم «التوجيه»، 9:00 افتراضيًا)، والقراءة من ذاكرة الدقيقة
  const settings = await notifySettings(db);
  if (riyadhHour(now) < (settings.digest_hour ?? DIGEST_HOUR_RIYADH)) return { due: false };
  const last = await db.from('audit_log').select('entity_id, created_at, after').eq('action', DIGEST_ACTION).order('created_at', { ascending: false }).limit(1);
  if (last.error) return { due: true, error: `digest marker: ${last.error.message || last.error}` };
  const prev = last.data?.[0];
  if (prev?.entity_id === day) { doneDay = day; return { due: false }; }
  const floor = now - MAX_WINDOW_MS;
  // بداية النافذة لحظة قراءة الملخص السابق (until في علامته)، وبلاها وقت كتابة العلامة كما كان
  const prevUntil = Date.parse(String(prev?.after?.until ?? ''));
  const prevAt = Number.isFinite(prevUntil) ? prevUntil : prev?.created_at ? Date.parse(prev.created_at) : now - DAY_MS;
  const since = new Date(Math.max(prevAt, floor)).toISOString();
  // لحظة القراءة قبل الاستعلامات: ما يقع بعدها يعدّه الملخص التالي
  const until = new Date(now).toISOString();
  const { rows, errors } = await digestRows(since, new Set(digestEvents(settings)), until);
  // مصدر لم يُقرأ: لا يُعلَّم اليوم، فيُعاد في الساعة التالية بدل ملخص ناقص يُعدّ كاملًا
  if (errors.length) return { due: true, error: errors.join('; ').slice(0, 300) };
  // ما وصل يُعلَّم في هذه النسخة أولًا، فتعذّر العلامة لا يعيد الإرسال منها. والعلامة تُحاول مرتين
  const mark = async (after: Record<string, unknown>) => {
    doneDay = day;
    const write = () => audit('system', 'digest', DIGEST_ACTION, 'notify', day, null, { since, until, ...after });
    await write().catch(() => write()).catch((e) => console.error('digest mark:', e));
  };
  if (!rows.length) { await mark({ empty: true }); return { due: true, posted: false, empty: true }; }
  const counts = Object.fromEntries(rows.map((r) => [r.key, r.text ?? r.count]));
  const parts = digestTexts(rows);
  const slack = slackConfigured() ? (await Promise.all(parts.map((t) => slackDeliver('digest', t, { client: db })))).every(Boolean) : false;
  if (slack) { await mark({ slack: true, counts, parts: parts.length }); return { due: true, posted: true, slack: true, email: false, rows: rows.length }; }
  // بريد واحد بدل الملخص: إن لم يُضبط Slack أو لم يصل. بلا بريد مضبوط لا شيء يُعلَّم فيُعاد
  if (!CONFIG.alertEmail) return { due: true, posted: false, slack: false, email: false, rows: rows.length, error: 'no channel' };
  const email = await sendMail(CONFIG.alertEmail, DIGEST_SUBJECT, digestMail(rows, slackConfigured() ? 'failed' : 'unconfigured'), [], { category: 'ops', kind: 'notify', ref: `digest:${day}` })
    .then(() => true, (e) => { console.error('digest mail:', e); return false; });
  if (email) await mark({ slack: false, email: true, counts });
  return { due: true, posted: email, slack: false, email, rows: rows.length };
}
