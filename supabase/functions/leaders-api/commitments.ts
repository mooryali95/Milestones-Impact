// ════════════════════════════════════════════════════════════════
// حلقة الالتزام بعد الورشة (تصور المرحلة 3 §5.2، البند 3.2): القاعدة والبريد
// ════════════════════════════════════════════════════════════════
// المنطق الخالص في commitments.js. هنا: الكتابة بعد الحضور، والمراجعة، والنقرة إلى وثيقة المبادرة، وتذكير الأسبوعين
// على المجدول الأسبوعي القائم (cron.reminders)، وما يراه المستشار. لا يمس الرحلة ولا التقدم.
// قبل الترحيل 20261129200000 تُرد القراءة فارغة، والكتابة برسالة «غير متاح الآن»، ويتجاوز التذكير.
import { CONFIG, db, Fail, mailButton, must, sendMail } from './core.ts';
import { bdi, mailShell, mailText } from '../_shared/mail.ts';
import { award, modelGet, modelSave } from './participant.ts';
import { simulated } from './counting.ts';
import { appSettings } from './settings.ts';
import { POINTS } from './logic.js';
import {
  cleanCommitment, cleanReview, coachBuckets, commitmentsOn, commitmentStepRow, reviewDue, reviewOpen,
  COMMITMENT_LEARNED_AR, COMMITMENT_OUTCOME_AR, COMMITMENT_Q_AR, COMMITMENT_REVIEW_Q_AR, COMMITMENT_STEP_FIELD,
} from './commitments.js';

type Body = Record<string, any>;
const COLS = 'id, session_id, action, due_on, created_at, reminded_at, outcome, learned, reviewed_at, added_at';
const OFF_AR = 'هذا غير متاح الآن.';
const view = (r: any) => ({
  id: r.id, session_id: r.session_id, session: r.workshop_sessions?.title_ar || null, action: r.action, due_on: r.due_on,
  created_at: r.created_at, outcome: r.outcome || null, outcome_ar: r.outcome ? (COMMITMENT_OUTCOME_AR as Record<string, string>)[r.outcome] : null,
  learned: r.learned || null, reviewed_at: r.reviewed_at || null, added_at: r.added_at || null, review_open: reviewOpen(r),
});
const on = async () => commitmentsOn(await appSettings().catch(() => ({})));

// التزامات المشارك ونصوص الأسئلة: مصدر شاشة الرحلة وورقة الحضور
export async function mine(p: any) {
  const texts = { question: COMMITMENT_Q_AR, review_question: COMMITMENT_REVIEW_Q_AR, learned: COMMITMENT_LEARNED_AR, outcomes: COMMITMENT_OUTCOME_AR };
  if (!(await on())) return { success: true, enabled: false, items: [], ...texts };
  const { data, error } = await db.from('workshop_commitments').select(`${COLS}, workshop_sessions(title_ar)`).eq('participant_id', p.id).order('created_at', { ascending: false });
  if (error) throw error;
  return { success: true, enabled: true, items: (data || []).map(view), ...texts };
}

// الكتابة بعد الحضور: التزام واحد لكل ورشة حضرها، ونقاطه مرة واحدة
export async function save(p: any, b: Body) {
  if (!(await on())) throw new Fail(OFF_AR, 404, 'commitments_off');
  const sid = String(b.session_id || '');
  const c = cleanCommitment(b) as any;
  if (c.error) throw new Fail(c.error, 400, 'invalid');
  const { data: att } = await db.from('workshop_attendance').select('session_id').eq('session_id', sid).eq('participant_id', p.id).maybeSingle();
  if (!att) throw new Fail('يُكتب الالتزام بعد تسجيل حضورك في الورشة', 400, 'not_attended');
  if (simulated(p)) return { success: true, simulated: true, gained: 0 };
  const { data: prev, error: readErr } = await db.from('workshop_commitments').select('id, reviewed_at').eq('participant_id', p.id).eq('session_id', sid).maybeSingle();
  if (readErr) throw readErr;
  if (prev?.reviewed_at) throw new Fail('راجعت هذا الالتزام، فلا يُعدَّل بعدها', 409, 'reviewed');
  const row: any = prev
    ? must(await db.from('workshop_commitments').update({ action: c.action, due_on: c.due_on }).eq('id', prev.id).select(COLS).single())
    : must(await db.from('workshop_commitments').insert({ participant_id: p.id, session_id: sid, action: c.action, due_on: c.due_on }).select(COLS).single());
  const gained = prev ? 0 : await award(p.id, 'commitment', row.id, POINTS.commitment, `التزام بعد الورشة: ${c.action}`.slice(0, 200));
  return { success: true, item: view(row), gained };
}

// «طبقته؟»: نعم أو جزئيًا أو لا، والنقاط نفسها لأي نتيجة لأن الصدق هو المطلوب
export async function review(p: any, b: Body) {
  if (!(await on())) throw new Fail(OFF_AR, 404, 'commitments_off');
  const r = cleanReview(b) as any;
  if (r.error) throw new Fail(r.error, 400, 'invalid');
  const { data: row, error } = await db.from('workshop_commitments').select(COLS).eq('id', String(b.id || '')).eq('participant_id', p.id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Fail('لم نجد هذا الالتزام', 404);
  if (!reviewOpen(row)) throw new Fail('سجّلت مراجعته من قبل', 409, 'reviewed');
  if (simulated(p)) return { success: true, simulated: true, gained: 0 };
  const saved: any = must(await db.from('workshop_commitments').update({ outcome: r.outcome, learned: r.learned, reviewed_at: new Date().toISOString() })
    .eq('id', row.id).is('reviewed_at', null).select(COLS).single());
  const gained = await award(p.id, 'commitment_review', row.id, POINTS.commitmentReview, `مراجعة التزام: ${row.action}`.slice(0, 200));
  return { success: true, item: view(saved), gained };
}

// النقرة إلى وثيقة المبادرة: صف في جدول الأنشطة بحفظ النموذج نفسه (modelSave وحراسه)، فلا يُكتب مرتين
export async function toInitiative(p: any, b: Body) {
  if (!(await on())) throw new Fail(OFF_AR, 404, 'commitments_off');
  const { data: row } = await db.from('workshop_commitments').select(COLS).eq('id', String(b.id || '')).eq('participant_id', p.id).maybeSingle();
  if (!row) throw new Fail('لم نجد هذا الالتزام', 404);
  if (row.added_at) throw new Fail('أضفته إلى وثيقة مبادرتك من قبل', 409, 'added');
  const { data: models } = await db.from('learning_models').select('id, fields').not('capstone_sort', 'is', null).eq('active', true);
  const target = (models || []).find((m: any) => (m.fields || []).some((f: any) => f.key === COMMITMENT_STEP_FIELD && f.type === 'table'));
  if (!target) throw new Fail('لا يوجد في وثيقتك جدول أنشطة يُضاف إليه', 404, 'no_target');
  // modelGet يرفض فصلًا لا يخص مسار المشارك برسالته
  const got: any = await modelGet(p, { id: target.id });
  const field = (got.model.fields || []).find((f: any) => f.key === COMMITMENT_STEP_FIELD);
  const step = commitmentStepRow(row, (field?.columns || []).length || 1);
  if (!step) throw new Fail('يُضاف إلى الوثيقة ما طبّقته كليًا أو جزئيًا', 400, 'not_applied');
  const answers = { ...(got.submission?.answers || {}) };
  answers[COMMITMENT_STEP_FIELD] = [...(Array.isArray(answers[COMMITMENT_STEP_FIELD]) ? answers[COMMITMENT_STEP_FIELD] : []), step];
  // الحجز قبل الحفظ: نقرتان متتاليتان لا تضيفان الصف مرتين، وتعذّر الحفظ يعيد الحجز
  const { data: claimed } = await db.from('workshop_commitments').update({ added_at: new Date().toISOString() }).eq('id', row.id).is('added_at', null).select('id');
  if (!claimed?.length) throw new Fail('أضفته إلى وثيقة مبادرتك من قبل', 409, 'added');
  let out: any;
  try { out = await modelSave(p, { id: target.id, answers }); } catch (e) {
    await db.from('workshop_commitments').update({ added_at: null }).eq('id', row.id);
    throw e;
  }
  return { success: true, model_id: target.id, submission: out.submission };
}

// ما يراه المستشار في ملف المشارك: من طبّق ومن لم يطبق ومن ينتظر. تعذّر القراءة يعيد null فلا يسقط الملف
export async function forCoach(participantId: string) {
  const { data, error } = await db.from('workshop_commitments').select(`${COLS}, workshop_sessions(title_ar)`).eq('participant_id', participantId).order('created_at', { ascending: false });
  if (error) return null;
  const b = coachBuckets((data || []).map(view));
  return { applied: b.applied, not_applied: b.not_applied, pending: b.pending };
}

// تذكير واحد بعد 14 يومًا على المجدول الأسبوعي. التسجيل قبل البريد فلا يتكرر ولو فشل البريد
export async function reminders() {
  if (!(await on())) return { sent: 0, skipped: 'off' };
  const { data, error } = await db.from('workshop_commitments').select(`${COLS}, participant_id, participants(full_name, email, status, is_demo)`)
    .is('reviewed_at', null).is('reminded_at', null).lte('created_at', new Date(Date.now() - 14 * 864e5).toISOString()).limit(500);
  if (error) throw error;
  let sent = 0, failed = 0;
  for (const r of (data || []) as any[]) {
    const p = r.participants;
    if (!reviewDue(r) || !p?.email || p.status === 'suspended' || simulated(p)) continue;
    const { error: e } = await db.from('workshop_commitments').update({ reminded_at: new Date().toISOString() }).eq('id', r.id).is('reminded_at', null);
    if (e) { failed += 1; continue; }
    try {
      await sendMail(p.email, 'طبقته؟', mailShell('طبقته؟',
        mailText(`أهلًا ${bdi(p.full_name || '')}، قبل أسبوعين كتبت بعد الورشة: «${bdi(r.action)}».`)
        + mailText('طبقته؟ سجّل نعم أو جزئيًا أو لا، وسطرًا عما تعلمته. أي جواب صادق يحتسب لك.')
        + mailButton(CONFIG.appUrl, 'سجّل ما حدث'), { family: 'journey', footnote: '' }), [], { category: 'reminders', ref: `participant:${r.participant_id}` });
      sent += 1;
    } catch (err) {
      console.error('commitment reminder:', (err as Error)?.message || err);
      failed += 1;
    }
  }
  return { sent, failed };
}
