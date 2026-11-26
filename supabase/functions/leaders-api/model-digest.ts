// ════════════════════════════════════════════════════════════════
// الملخص اليومي لمراجعي نماذج مبادرتي، وإشعار البطاقة الفوري («بوابتان، والباقي ملاحظات»، قرار المالك 2026-11-23)
// ════════════════════════════════════════════════════════════════
// بدل بريد لكل تسليم (notifyAdvisor سابقًا): بريد واحد في اليوم لكل مراجع بما سُلّم منذ ملخصه السابق، مجمّعًا بالمشارك،
// ورابط قائمة «للقراءة». المراجع مستشار المشارك الفعلي، وبلا مستشار فريق البرنامج (LEADERS_ALERT_EMAIL، model-review.js).
// من المهمة الساعية القائمة (cron.expert-offers، الدقيقة 17)، مرة في يوم الرياض بعد الساعة 8 (MODEL_DIGEST_HOUR): لا جدولة
// ولا سر جديد. علامة اليوم سطر system.model-digest في audit_log بالتاريخ، وما أُرسل يُعلَّم digested_at فلا يُذكر مرتين.
// ما لم يُرسل (تعذّر مراجعه أو بريده) لا يُعلَّم، فيدخل ملخص الغد. وبطاقة المبادرة لا تدخل الملخص: تُبلَّغ فور تسليمها (notifyGate).
import { actionDeadline, audit, CONFIG, db, Fail, sendMail } from './core.ts';
import { bdi, mailButton, mailNote, mailRows, mailShell, mailText } from '../_shared/mail.ts';
import { riyadhDay } from '../_shared/slack.ts';
import { SITES } from '../_shared/sites.js';
import { advisorOf, advisorsOf } from './advisor.ts';
import { listed } from './counting.ts';
import { firstName } from './hall.js';
import { REVIEWER_AR } from './labels.js';
import { digestGroups, MODEL_DIGEST_HOUR, MODEL_DIGEST_SUBJECT } from './model-review.js';

export const MODEL_DIGEST_ACTION = 'system.model-digest';
const READ_LIMIT = 2000;
const riyadhHour = (now: number) => new Date(now + 3 * 36e5).getUTCHours();
// رابط قائمة «للقراءة»: بوابة الخبير للمستشار، وكتاب القائد في لوحة الإدارة لفريق البرنامج
export const reviewLink = (kind: 'advisor' | 'team') => (kind === 'advisor' ? `${SITES.leaders}/x` : `${SITES.admin}/#/leaders/handbook`);

type Group = ReturnType<typeof digestGroups>[number];
export function modelDigestMail(g: Group) {
  const team = g.kind === 'team';
  const hello = team ? 'أهلًا فريق البرنامج' : `أهلًا ${firstName(g.reviewer?.full_name || '')}`;
  return mailShell(hello,
    mailText(bdi(`سُلّم أو تغيّر منذ ملخصك السابق ${g.total} ${g.total === 1 ? 'نموذج' : 'نماذج'} من ${g.participants.length} ${g.participants.length === 1 ? 'مشارك' : 'مشاركين'}`)
      + `${team ? ' بلا مستشار، فمراجعتها عند فريق البرنامج' : ''}. التسليم يُحتسب للمشارك فور تسليمه، فاقرأ واكتب ملاحظتك أو اطلب تعديلًا حين تراه لازمًا.`)
    + mailRows(g.participants.map((p: any) => [bdi(p.name), bdi(p.titles.join('، ') || String(p.count))] as [string, string]))
    + mailNote('بطاقة المبادرة لا تدخل هذا الملخص: تصلك فور تسليمها لأن المشارك ينتظر اعتمادها.')
    + mailButton(reviewLink(g.kind), 'افتح قائمة «للقراءة»'),
    { family: team ? 'admin' : 'journey', preheader: MODEL_DIGEST_SUBJECT, footnote: team ? 'يصلك هذا لأن بريدك مضبوط في LEADERS_ALERT_EMAIL.' : 'يصلك هذا مرة في اليوم بصفتك مستشار هؤلاء المشاركين.' });
}

// علامة اليوم في هذه النسخة
let doneDay = '';
export const resetModelDigest = () => { doneDay = ''; };

export type ModelDigestResult = { due: boolean; sent?: number; marked?: number; skipped?: number; error?: string };

export async function modelDigest(now = Date.now()): Promise<ModelDigestResult> {
  const day = riyadhDay(now);
  if (doneDay === day || riyadhHour(now) < MODEL_DIGEST_HOUR) return { due: false };
  const last = await db.from('audit_log').select('entity_id').eq('action', MODEL_DIGEST_ACTION).eq('entity_id', day).limit(1);
  if (last.error) return { due: true, error: `marker: ${last.error.message || last.error}` };
  if (last.data?.length) { doneDay = day; return { due: false }; }
  // قبل الترحيل (digested_at) يفشل هنا ولا يرسل شيئًا: لا بريد يتكرر كل ساعة بلا علامة
  const { data, error } = await listed(db.from('model_submissions')
    .select('id, participant_id, status, submitted_at, updated_at, reviewed_at, digested_at, participants!inner(id, full_name, organization_id, is_demo), learning_models(key, title_ar)')
    .in('status', ['submitted', 'reviewed']), 'participants').order('updated_at', { ascending: false }).limit(READ_LIMIT);
  if (error) return { due: true, error: `submissions: ${error.message || error}` };
  const rows = (data || []) as any[];
  // مراجع كل مشارك مرة: تعذّر معرفته يترك تسليماته للغد بدل أن تذهب لغير مراجعها
  // بقراءات معدودة للجميع (advisorsOf) بدل قراءات لكل مشارك؛ من غاب عن الخريطة تعذّر تحديده
  const people = new Map<string, any>();
  for (const r of rows) if (!people.has(r.participant_id)) people.set(r.participant_id, { ...r.participants, id: r.participant_id });
  let reviewers = new Map<string, any>();
  try { reviewers = await advisorsOf([...people.values()]); } catch (e) { console.error('model digest reviewers:', e); }
  let skipped = [...people.keys()].filter((pid) => !reviewers.has(pid)).length;
  const groups = digestGroups(rows, reviewers);
  let sent = 0, marked = 0;
  const stamp = new Date(now).toISOString();
  for (const g of groups) {
    const to = g.kind === 'team' ? CONFIG.alertEmail : g.reviewer?.email;
    if (!to) { skipped += g.total; continue; }
    const ok = await sendMail(to, `${MODEL_DIGEST_SUBJECT} · ${g.total}`, modelDigestMail(g), [], { category: g.kind === 'team' ? 'ops' : 'expert_digest', kind: 'notify', ref: `model-digest:${day}:${g.key}`, recipient: g.reviewer?.id ? { kind: 'expert', id: g.reviewer.id } : null })
      .then(() => true, (e) => { console.error('model digest mail:', e); return false; });
    if (!ok) { skipped += g.total; continue; }
    sent++;
    const { error: e } = await db.from('model_submissions').update({ digested_at: stamp }).in('id', g.ids);
    if (e) console.error('model digest mark:', e); else marked += g.ids.length;
  }
  doneDay = day;
  await audit('system', 'model-digest', MODEL_DIGEST_ACTION, 'model_submissions', day, null, { sent, marked, skipped, groups: groups.length })
    .catch((e) => console.error('model digest marker:', e));
  return { due: true, sent, marked, skipped };
}

// تسليم بطاقة المبادرة: يُبلَّغ مراجعها فورًا لأنها تحبس المشارك (المستشار، وبلاه فريق البرنامج). غيرها ينتظر الملخص اليومي
export async function notifyGate(p: any, title: string, modelId: string | null = null) {
  if (p?.is_demo) return { sent: false, to: null };
  // تعذّر معرفة المستشار لا يحوّل البطاقة إلى الفريق بتخمين: تبقى ظاهرة في قوائم المراجعة
  let adv: any = null;
  try { adv = await advisorOf(p); } catch (e) { if (e instanceof Fail) return { sent: false, to: null }; throw e; }
  const team = !adv;
  const to = team ? CONFIG.alertEmail : adv.email;
  if (!to) return { sent: false, to: null };
  const html = mailShell(team ? 'أهلًا فريق البرنامج' : `أهلًا ${firstName(adv.full_name)}`,
    mailText(`سلّم ${bdi(p.full_name)} «${bdi(title)}»، وهي بانتظار ${team ? `اعتماد ${REVIEWER_AR.team} لأنه بلا مستشار` : 'اعتمادك بصفتك مستشاره'}. لا يسلّم وثيقة مبادرته قبل اعتمادها.`)
    + mailButton(reviewLink(team ? 'team' : 'advisor'), team ? 'افتح لوحة الإدارة' : 'افتح لوحة الخبير'),
    { family: team ? 'admin' : 'journey', preheader: 'بطاقة مبادرة بانتظار اعتمادك' });
  const sent = await sendMail(to, `بطاقة مبادرة بانتظار اعتمادك: ${title}`, html, [], { category: team ? 'ops' : 'expert_work', ...(team ? {} : { recipient: { kind: 'expert' as const, id: adv.id }, about: p.id, actionUntil: actionDeadline(), ...(modelId ? { noteRef: `model:${p.id}:${modelId}` } : {}) }) }).then(() => true, () => false);
  return { sent, to: team ? 'team' : 'advisor' };
}
