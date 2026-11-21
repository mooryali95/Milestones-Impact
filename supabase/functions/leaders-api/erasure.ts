// ════════════════════════════════════════════════════════════════
// قرار طلب حذف البيانات من ملف المشارك (المراحل 1 إلى 3 من تصور معالجة الطلب، 2026-11-16)
// ════════════════════════════════════════════════════════════════
// admin.erasure-get: الطلب القائم وأثر تنفيذه وخطه الزمني، لكل مدير (قراءة).
// admin.erasure-execute / -decline / -withdrawn: القرار للمدير الأعلى وحده بعامل ثانٍ (requireSuper، قرار المالك 2).
// cron (كل ساعة، cron.expert-offers): تذكير المالك قبل 10 أيام وقبل 3 ويوم المهلة ثم يوميًا بعد التأخر (قرار المالك 5).
// لا حالة جديدة: الرفض rejected، والسحب عن طريق المدير cancelled ويتميز بأن decided_by بريده.
import { audit, db, ERASE_DECLINED_SUBJECT, ERASE_WITHDRAWN_SUBJECT, eraseDeclinedMail, erasureUrl, eraseWithdrawnMail, Fail, raiseAlert, sendMail } from './core.ts';
import { type Admin, needsSecondFactor, participantImpact, removeParticipant, requireSuper } from './admin.ts';
import { markNotified } from './privacy.ts';
import { eraseView } from './privacy.js';
import { daysLeft, ERASE_GROUNDS, ERASE_NOTE_MAX, ERASE_NOTE_MIN, ERASE_STATUS_AR, nameMatches, reminderDue, urgency, WITHDRAW_NOTE_MIN, WITHDRAW_VIA } from './erasure.js';
import { EXPIRE_AFTER_DAYS } from './payments-ledger.js';

type Body = Record<string, any>;
const missingTable = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || /erasure_requests/.test(String(e.message || '')));
const cleanNote = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, ERASE_NOTE_MAX) || null;
const canDecide = (a: Admin) => a.role === 'super_admin' && !needsSecondFactor(a);

// الخط الزمني من أعمدة الطلب وسجل التدقيق، لا نسخة ثانية
const TIMELINE_AR: Record<string, string> = {
  'system.alert': 'أُبلغت بالطلب', 'erasure.remind': 'ذُكّرت بالطلب', 'erasure.execute': 'نُفّذ الحذف', 'erasure.reject': 'رُفض الطلب', 'erasure.withdrawn': 'أُغلق بسحب صاحبه',
};
async function timelineOf(row: any) {
  const [mine, alerted] = await Promise.all([
    db.from('audit_log').select('action, actor, created_at, after').eq('entity', 'erasure_requests').eq('entity_id', row.id).order('created_at').limit(100),
    db.from('audit_log').select('action, created_at').eq('action', 'system.alert').eq('entity_id', `erase_request:${row.id}`).limit(1),
  ]);
  const ev = [{ at: row.created_at, text: 'استُلم الطلب من المشارك' }];
  for (const x of (alerted.data || []) as any[]) ev.push({ at: x.created_at, text: TIMELINE_AR['system.alert'] });
  for (const x of (mine.data || []) as any[]) ev.push({ at: x.created_at, text: TIMELINE_AR[x.action] || x.action, ...(x.actor && x.action !== 'erasure.remind' ? { by: x.actor } : {}) });
  if (row.notified_at) ev.push({ at: row.notified_at, text: 'أُبلغ المشارك بالنتيجة' });
  return ev.sort((x, y) => String(x.at).localeCompare(String(y.at)));
}

function requestView(row: any) {
  const left = daysLeft(row.created_at);
  return {
    ...eraseView(row)!, days_left: left, urgency: urgency(left), status_ar: ERASE_STATUS_AR[row.status as keyof typeof ERASE_STATUS_AR] || row.status,
    ground: row.ground ?? null, note: row.note ?? null, decided_at: row.decided_at ?? null, decided_by: row.decided_by ?? null,
    withdrawn_via: row.withdrawn_via ?? null, notified_at: row.notified_at ?? null, reminder_stage: row.reminder_stage ?? 0,
  };
}

/** الطلب القائم لمشارك (أو آخر طلب أُغلق، لسطر السجل)، وأثر تنفيذه، وخطه الزمني، وهل يقرر هذا المدير */
export async function get(a: Admin, b: Body) {
  const pid = String(b.participant_id || '');
  if (!pid) throw new Fail('المشارك مطلوب', 400);
  const { data, error } = await db.from('erasure_requests').select('*').eq('participant_id', pid).order('created_at', { ascending: false }).limit(5);
  if (error) { if (missingTable(error)) return { success: true, ready: false, request: null }; throw new Fail('تعذّر قراءة طلب الحذف', 503, 'busy'); }
  const rows = (data || []) as any[];
  const pending = rows.find((r) => r.status === 'pending');
  const last = rows.find((r) => r.status !== 'pending');
  const base = { success: true, ready: true, can_decide: canDecide(a), last: last ? requestView(last) : null };
  if (!pending) return { ...base, request: null };
  const impact = await participantImpact({ participant_id: pid });
  return {
    ...base, request: requestView(pending), timeline: await timelineOf(pending),
    participant: impact.participant, counts: impact.counts,
    // حساب العرض ودفعة معلّقة يمنعان التنفيذ. الدفع المؤكد لا يمنع (يبقى سجله)، والشهادة تُلغى وتُحذف (قرار المالك 1)
    blockers: await executeBlockers(impact),
  };
}
// صفحة دفع مفتوحة: لو اكتملت بعد الحذف لخُصم ماله بلا حساب ووصله إيصال على عنوانه. تنتهي وحدها بعد أيام (expireAbandoned)
export const PENDING_PAY_AR = `له صفحة دفع لم تكتمل بعد. تنتهي من تلقاء نفسها خلال ${EXPIRE_AFTER_DAYS} أيام، فنفّذ بعدها`;
async function executeBlockers(impact: Awaited<ReturnType<typeof participantImpact>>) {
  const out = impact.blockers.filter((x) => x.startsWith('الحساب التجريبي'));
  const { count, error } = await db.from('payments').select('id', { count: 'exact', head: true }).eq('participant_id', impact.participant.id).eq('status', 'pending');
  if (error) throw new Fail('تعذّر قراءة دفعاته', 503, 'busy');
  if ((count ?? 0) > 0) out.push(PENDING_PAY_AR);
  return out;
}

async function loadPending(b: Body) {
  const id = String(b.request_id || '');
  if (!id) throw new Fail('رقم الطلب مطلوب', 400);
  const { data, error } = await db.from('erasure_requests').select('*').eq('id', id).maybeSingle();
  if (error) throw new Fail('تعذّر قراءة طلب الحذف', 503, 'busy');
  if (!data) throw new Fail('طلب الحذف غير موجود', 404);
  if ((data as any).status !== 'pending') throw new Fail('قُرِّر في هذا الطلب من قبل. حدّث الصفحة', 409, 'decided');
  if (!(data as any).participant_id) throw new Fail('صاحب هذا الطلب لم يعد موجودًا', 409, 'gone');
  return data as any;
}
async function ownerOf(pid: string) {
  const { data, error } = await db.from('participants').select('id, full_name, email, is_demo').eq('id', pid).maybeSingle();
  if (error) throw new Fail('تعذّر قراءة المشارك', 503, 'busy');
  if (!data) throw new Fail('صاحب هذا الطلب لم يعد موجودًا', 409, 'gone');
  return data as any;
}
// الكتابة بشرط أن الطلب ما زال قائمًا: قراران متزامنان لا يكتب ثانيهما فوق الأول
async function decide(id: string, patch: Record<string, unknown>) {
  const { data, error } = await db.from('erasure_requests').update(patch).eq('id', id).eq('status', 'pending').select('id');
  if (error) { console.error('erasure decide:', error.message); throw new Fail('تعذّر حفظ القرار. لم يتغير شيء، حاول بعد قليل', 500, 'db_error'); }
  if (!(data || []).length) throw new Fail('قُرِّر في هذا الطلب من قبل. حدّث الصفحة', 409, 'decided');
}
const note = (a: Admin, action: string, id: string, after: Record<string, unknown>) =>
  audit('admin', a.email, action, 'erasure_requests', id, null, after).then(() => true, (e) => { console.error(`${action} audit:`, e); return false; });
// رسالة القرار إلى المشارك، خارج الطابور (رسالة نظامية نادرة): إن تعذّرت يُعاد عنوانه إلى المدير ليرسلها بنفسه
const tell = (to: string, subject: string, html: string) =>
  sendMail(to, subject, html, [], { force: true, queue: false }).then(() => true, (e) => { console.error('erasure mail:', e); return false; });

/** نفّذ الحذف: بتأكيد الاسم كما في الملف، وتُحذف الشهادة معه، ويُغلق الطلب برقمه ويُبلَّغ صاحبه */
export async function execute(a: Admin, b: Body) {
  requireSuper(a);
  const req = await loadPending(b);
  const impact = await participantImpact({ participant_id: req.participant_id });
  const [block] = await executeBlockers(impact);
  if (block) throw new Fail(block, 409, 'blocked');
  if (!nameMatches(b.confirm_name, impact.participant.full_name)) throw new Fail('اكتب اسم المشارك كما يظهر في ملفه للتأكيد', 400, 'confirm');
  const r = await removeParticipant(a, impact, req.id, { purgeCertificates: true });
  await note(a, 'erasure.execute', req.id, { mailed: r.mailed, files: r.files, certificates: impact.counts.certificates, payments_kept: impact.counts.payments });
  return r;
}

/** ارفض مع السبب: من قائمة مغلقة بأساسه، ونص إلزامي لـ«سبب آخر». يبقى حسابه ويصله السبب وحقه في الشكوى */
export async function decline(a: Admin, b: Body) {
  requireSuper(a);
  const ground = String(b.ground || '') as keyof typeof ERASE_GROUNDS;
  if (!(ground in ERASE_GROUNDS)) throw new Fail('اختر سبب الرفض', 400, 'ground');
  const text = cleanNote(b.note);
  if (ground === 'other' && (text || '').length < ERASE_NOTE_MIN) throw new Fail(`اكتب السبب بوضوح (${ERASE_NOTE_MIN} أحرف على الأقل)، فهو يصل المشارك`, 400, 'note');
  const req = await loadPending(b);
  const p = await ownerOf(req.participant_id);
  const at = new Date().toISOString();
  await decide(req.id, { status: 'rejected', ground, note: text, decided_at: at, decided_by: a.email });
  const audited = await note(a, 'erasure.reject', req.id, { ground });
  const mailed = await tell(p.email, ERASE_DECLINED_SUBJECT, eraseDeclinedMail(p.full_name, ground, text, at));
  if (mailed) await markNotified(req.id);
  return { success: true, mailed, ...(mailed ? {} : { email: p.email }), ...(audited ? {} : { audit_failed: true }) };
}

/** تواصلت معه وسحب الطلب: كيف أبلغك ونص قصير، ويصله تأكيد السحب (الضمان أن السحب صدر منه) */
export async function withdrawn(a: Admin, b: Body) {
  requireSuper(a);
  const via = String(b.via || '') as keyof typeof WITHDRAW_VIA;
  if (!(via in WITHDRAW_VIA)) throw new Fail('اختر كيف أبلغك المشارك بسحب طلبه', 400, 'via');
  const text = cleanNote(b.note);
  if ((text || '').length < WITHDRAW_NOTE_MIN) throw new Fail(`اكتب ما قاله المشارك باختصار (${WITHDRAW_NOTE_MIN} أحرف على الأقل)`, 400, 'note');
  const req = await loadPending(b);
  const p = await ownerOf(req.participant_id);
  const at = new Date().toISOString();
  await decide(req.id, { status: 'cancelled', withdrawn_via: via, note: text, decided_at: at, decided_by: a.email });
  const audited = await note(a, 'erasure.withdrawn', req.id, { via });
  const mailed = await tell(p.email, ERASE_WITHDRAWN_SUBJECT, eraseWithdrawnMail(p.full_name, WITHDRAW_VIA[via], at));
  if (mailed) await markNotified(req.id);
  return { success: true, mailed, ...(mailed ? {} : { email: p.email }), ...(audited ? {} : { audit_failed: true }) };
}

/** تذكير المالك بالطلبات القائمة في مواعيدها (كل ساعة من المجدول). المرحلة تُحجز قبل التنبيه فلا يتكرر،
 * وتُعاد إن لم يصل التنبيه من أي قناة فيُعاد في الساعة التالية */
export async function remindSweep(now = Date.now()) {
  const { data, error } = await db.from('erasure_requests').select('id, participant_id, status, reason, created_at, reminder_stage').eq('status', 'pending').order('created_at').limit(200);
  if (error) { if (missingTable(error)) return { reminded: 0, ready: false }; throw new Error(error.message); }
  const due = ((data || []) as any[]).map((r) => ({ r, stage: reminderDue(r, now) })).filter((x) => x.stage != null && x.r.participant_id);
  if (!due.length) return { reminded: 0 };
  // counting-exempt: أسماء أصحاب طلبات حذف قائمة، وطلب الحذف مغلق على حساب العرض (DEMO_BLOCKED)
  const { data: people } = await db.from('participants').select('id, full_name').in('id', due.map((x) => x.r.participant_id));
  const nameOf = new Map(((people || []) as any[]).map((p) => [p.id, p.full_name]));
  let reminded = 0, failed = 0;
  for (const { r, stage } of due) {
    const old = Number(r.reminder_stage) || 0;
    const claim = await db.from('erasure_requests').update({ reminder_stage: stage, reminded_at: new Date(now).toISOString() }).eq('id', r.id).eq('status', 'pending').eq('reminder_stage', old).select('id');
    if (claim.error || !(claim.data || []).length) continue;   // سبقته تشغيلة أخرى أو قُرِّر فيه
    const left = daysLeft(r.created_at, now);
    // التفاصيل تُكتب في سجل التدقيق الذي لا يُحذف منه: معرّفات ومهلة وحدها، والاسم والسبب في متن البريد وحده
    const sent = await raiseAlert('erase_reminder', {
      request: r.id, participant: r.participant_id, due_at: eraseView(r)!.due_at, days_left: left, stage, url: erasureUrl(r.participant_id),
    }, { key: `${r.id}:${stage}`, mail: { name: nameOf.get(r.participant_id) || null, ...(r.reason ? { reason: r.reason } : {}) } }).catch(() => null);
    // لا تهدئة لهذا النوع (المرحلة المحجوزة تمنع التكرار)، فالمهدَّأ لم يصل: لا يُعدّ واصلًا
    const delivered = !!sent && !sent.cooled && (sent.webhook || !!sent.slack || sent.email);
    if (!delivered) { failed++; await db.from('erasure_requests').update({ reminder_stage: old }).eq('id', r.id).eq('reminder_stage', stage); continue; }
    reminded++;
    await audit('system', 'erasure', 'erasure.remind', 'erasure_requests', r.id, null, { stage, days_left: left }).catch((e) => console.error('erasure.remind audit:', e));
  }
  return { reminded, ...(failed ? { failed } : {}) };
}
