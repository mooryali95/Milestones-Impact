// ════════════════════════════════════════════════════════════════
// خصوصية المشارك: نسخة من بياناته، وطلب حذفها (خدمة ذاتية)
// ════════════════════════════════════════════════════════════════
// me.privacy: حالة طلب الحذف وما بقي من نسخ اليوم. me.export: نسخة JSON من كل ما تحمله المنصة عنه.
// me.erase-request: طلب حذف يصل المالك فيقرر فيه المدير الأعلى من ورقة الطلب (erasure.ts: تنفيذ أو رفض بسبب أو إغلاق بسحب)،
// أو يسحبه المشارك قبل القرار. الحذف نفسه لا ينفذه المشارك: فيه موانع (شهادة صادرة، دفعة جارية) يقرأها إنسان.
import { alertOps, audit, db, ERASE_MAIL_SUBJECT, eraseRequestMail, erasureUrl, Fail, must, sendMail } from './core.ts';
import { daysLeft } from './erasure.js';
import { answersExportable, cleanReason, ERASE_REPLY_DAYS, eraseView, EXPORT_ANSWER_COLUMNS, EXPORT_FEEDBACK_COLUMNS, EXPORT_PER_DAY, EXPORT_ROW_CAP, EXPORT_TABLES, exportable, scrubRow } from './privacy.js';
import { CONTACT_EMAIL, POLICY_VERSION } from './labels.js';

type Body = Record<string, any>;
const missingTable = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || /erasure_requests/.test(String(e.message || '')));

async function pendingErase(participantId: string) {
  const { data, error } = await db.from('erasure_requests').select('id, status, reason, created_at')
    .eq('participant_id', participantId).eq('status', 'pending').order('created_at', { ascending: false }).limit(1);
  if (error) { if (missingTable(error)) return { ready: false, row: null }; throw new Fail('تعذّر قراءة حالة طلبك الآن، حاول بعد قليل', 503, 'busy'); }
  return { ready: true, row: data?.[0] ?? null };
}

async function exportsToday(p: any) {
  const { count } = await db.from('audit_log').select('id', { count: 'exact', head: true })
    .eq('action', 'participant.export').eq('entity_id', p.id).gte('created_at', new Date(Date.now() - 864e5).toISOString());
  return count ?? 0;
}

export async function state(p: any) {
  const [erase, used] = [await pendingErase(p.id), await exportsToday(p)];
  return { success: true, erase: eraseView(erase.row), erase_ready: erase.ready, exports_left: Math.max(0, EXPORT_PER_DAY - used), reply_days: ERASE_REPLY_DAYS, contact: CONTACT_EMAIL };
}

export async function exportData(p: any) {
  if (p.is_demo) throw new Fail('حساب العرض لا يحمل بيانات شخصية تُصدَّر', 400, 'demo');
  if (await exportsToday(p) >= EXPORT_PER_DAY) throw new Fail(`بلغت حد النسخ اليومي (${EXPORT_PER_DAY}). تتاح نسخة جديدة بعد 24 ساعة`, 429, 'rate');
  const data: Record<string, unknown[]> = {};
  const skipped: string[] = [];
  await Promise.all(Object.keys(EXPORT_TABLES).map(async (t) => {
    const { data: rows, error } = await db.from(t).select('*').eq('participant_id', p.id).limit(EXPORT_ROW_CAP);
    // جدول لم يُطبَّق ترحيله بعد لا يفشل النسخة، ويُذكر في بيانها
    if (error) { skipped.push(t); return; }
    const keep = (rows || []).filter((r: any) => exportable(t, r));
    if (keep.length) data[t] = keep.map((r: any) => scrubRow(t, r));
  }));
  // الإجابات والنتائج تتبع القياس لا المشارك مباشرة
  // للقياس المُرسَل وحده وبلا درجة السؤال: نسخة تُطلب أثناء القياس لا تكشف مفتاح الإجابة (answersExportable)
  const ids = ((data.assessments as any[]) || []).filter(answersExportable).map((a) => a.id);
  if (ids.length) {
    const [ans, res] = await Promise.all([
      db.from('assessment_answers').select(EXPORT_ANSWER_COLUMNS).in('assessment_id', ids).limit(EXPORT_ROW_CAP),
      db.from('assessment_results').select('*').in('assessment_id', ids).limit(EXPORT_ROW_CAP),
    ]);
    if (ans.data?.length) data.assessment_answers = ans.data;
    if (res.data?.length) data.assessment_results = res.data;
  }
  const consent = await db.from('consent_events').select('created_at, kind, version').eq('subject', 'participant').eq('subject_id', p.id).limit(EXPORT_ROW_CAP);
  if (consent.data?.length) data.consent_events = consent.data;
  // إجابته عن استبيان سهولة الاستخدام: جدولها بمعرّف الدور لا بـparticipant_id، فتُقرأ هنا (وغياب الجدول لا يفشل النسخة)
  const sus = await db.from('sus_responses').select('answers, score, comment, answered_at').eq('role', 'participant').eq('subject_id', p.id).limit(1);
  if (sus.data?.length && sus.data[0].answers) data.sus_responses = sus.data;
  // تقييم 360: دوراته وتقديره الذاتي وخطته (EXPORT_FEEDBACK_COLUMNS)، وغياب الجدول قبل ترحيله لا يفشل النسخة
  const f360 = await db.from('feedback_cycles').select(EXPORT_FEEDBACK_COLUMNS).eq('participant_id', p.id).limit(EXPORT_ROW_CAP);
  if (f360.data?.length) data.feedback_cycles = f360.data;
  // ملاحظات ملفه: المرئية له وحدها، بلا كاتبها
  const obs = await db.from('participant_observations').select('kind, title, body, created_at, acknowledged_at').eq('participant_id', p.id).eq('visible', true).limit(EXPORT_ROW_CAP);
  if (obs.data?.length) data.participant_observations = obs.data;
  await audit('participant', p.id, 'participant.export', 'participants', p.id, null, { tables: Object.keys(data).length, rows: Object.values(data).reduce((n, r) => n + r.length, 0) });
  return {
    success: true,
    export: {
      format: 'milestone-impact.participant-export.v1', issued_at: new Date().toISOString(), policy_version: POLICY_VERSION,
      note_ar: 'نسخة من بياناتك الشخصية في منصة Milestone Impact. حُجبت منها رموز الدخول وبصماتها، وإجابات مقيّميك وأصوات لجنة التقييم لأنها بيانات أصحابها. ملفاتك المرفوعة تُطلب من بريد التواصل.',
      contact: CONTACT_EMAIL, participant: scrubRow('participants', p), data, skipped,
    },
  };
}

export async function eraseRequest(p: any, b: Body) {
  if (p.is_demo) throw new Fail('حساب العرض لا يُحذف من هنا', 400, 'demo');
  const cur = await pendingErase(p.id);
  if (!cur.ready) throw new Fail(`طلب الحذف من التطبيق غير متاح الآن. راسلنا على ${CONTACT_EMAIL} وننفذه خلال ${ERASE_REPLY_DAYS} يومًا`, 503, 'not_ready');
  if (b.cancel) {
    if (!cur.row) throw new Fail('لا طلب حذف قائم لتسحبه', 404, 'none');
    // بشرط أنه ما زال قائمًا: قرار المدير في اللحظة نفسها يسبقه، فلا يُقال للمشارك «سحبنا» وقد قُرِّر فيه
    const done = must(await db.from('erasure_requests').update({ status: 'cancelled', decided_at: new Date().toISOString(), decided_by: 'participant' }).eq('id', cur.row.id).eq('status', 'pending').select('id'), 'تعذّر سحب الطلب');
    if (!((done as any[]) || []).length) throw new Fail('قُرِّر في طلبك للتو، ويصلك بريد بالقرار', 409, 'decided');
    await audit('participant', p.id, 'participant.erase-cancel', 'participants', p.id, null, { request: cur.row.id });
    return { success: true, erase: null };
  }
  if (cur.row) return { success: true, erase: eraseView(cur.row), existing: true };
  // التأكيد بكتابة البريد: الحذف لا يُسترد
  if (String(b.confirm_email || '').trim().toLowerCase() !== String(p.email).toLowerCase()) throw new Fail('اكتب بريدك كما هو للتأكيد', 400, 'confirm');
  const row = must(await db.from('erasure_requests').insert({ participant_id: p.id, reason: cleanReason(b.reason) }).select('id, status, reason, created_at').single(), 'تعذّر تسجيل الطلب');
  if (!row) throw new Fail('تعذّر تسجيل الطلب', 500, 'db_error');
  await audit('participant', p.id, 'participant.erase-request', 'participants', p.id, null, { request: row.id });
  const view = eraseView(row)!;
  // المالك يُبلَّغ فورًا بتهدئة لكل طلب (لا يُسقط طلب ثانٍ في المهلة نفسها)، والمشارك يصله تأكيد بالمهلة وطريقة السحب. تعذّر البريد لا يُسقط الطلب المسجَّل
  // بقالب المالك (eraseOwnerMail): الاسم والمهلة وزر يفتح ورقة الطلب نفسها. التفاصيل (detail) تُكتب في سجل التدقيق الذي
  // لا يُحذف منه وتصل سلاك والرابط، فلا تحمل إلا المعرّفات والمهلة. الاسم والسبب في متن البريد وحده (mail)، ولا يُحفظ متنه
  await alertOps('erase_request', { request: row.id, participant: p.id, due_at: view.due_at, days_left: daysLeft(row.created_at), url: erasureUrl(p.id) },
    { key: row.id, mail: { name: p.full_name, ...(row.reason ? { reason: row.reason } : {}) } }).catch((e) => console.error('erase alert:', e));
  await sendMail(p.email, ERASE_MAIL_SUBJECT, eraseRequestMail(p.full_name, ERASE_REPLY_DAYS)).catch((e) => console.error('erase mail:', e));
  return { success: true, erase: view };
}

// عند تنفيذ المدير للحذف: رقم الطلب القائم يُلتقط قبل حذف صف المشارك (بعده يصير participant_id فارغًا بقيد on delete set null)،
// ثم يُغلق الطلب برقمه بعد نجاح الحذف وحده، فلا يُغلق طلب لم يُنفذ. note: ما بقي معلقًا (ملفات تعذّر حذفها)
export async function pendingEraseId(participantId: string) {
  const { data, error } = await db.from('erasure_requests').select('id').eq('participant_id', participantId).eq('status', 'pending').limit(1);
  // تعذّر القراءة (غير غياب الجدول) يوقف الحذف قبل أن يبدأ: بعده يصير participant_id فارغًا فلا يُعرف الطلب ولا يُغلق
  if (error) { if (missingTable(error)) return null; console.error('erasure read:', error.message); throw new Fail('تعذّرت قراءة طلب الحذف. لم يُحذف شيء، حاول بعد قليل', 503, 'busy'); }
  return (data?.[0]?.id as string) ?? null;
}
// يعيد true إن أُغلق الطلب أو لم يكن طلب، وfalse إن بقي قائمًا بتعذّر الكتابة (يُبلَّغ ويُعاد في الرد)
// email_hash: بصمة بريده تربط الطلب بسطر الحذف في سجل التدقيق بلا بريد صريح (20261116150000)
export async function closeOnDelete(requestId: string | null, by: string, note: string | null = null, emailHash: string | null = null) {
  if (!requestId) return true;
  // السبب نص حر من المشارك: يُمحى عند الإغلاق فلا يبقى من الطلب إلا تاريخه وقراره ومن نفذه (erasure.js ERASE_KEPT.request).
  // بلا صف مطابق (قُرِّر فيه في اللحظة نفسها) يُعاد false، لا «أُغلق»
  const { data, error } = await db.from('erasure_requests').update({ status: 'done', decided_at: new Date().toISOString(), decided_by: by, reason: null, ...(note ? { note: note.slice(0, 1000) } : {}), ...(emailHash ? { email_hash: emailHash } : {}) })
    .eq('id', requestId).eq('status', 'pending').select('id');
  if (error) { if (missingTable(error)) return true; console.error('erasure close:', error.message); return false; }
  return ((data || []) as any[]).length > 0;
}
// ملاحظة على طلب أغلقه التنفيذ (erasure_purge) بعده، كتعذّر حذف ملفاته. true إن كُتبت
export async function noteOnDone(requestId: string, note: string) {
  const { data, error } = await db.from('erasure_requests').update({ note: note.slice(0, 1000) }).eq('id', requestId).eq('status', 'done').select('id');
  if (error) { console.error('erasure note:', error.message); return false; }
  return ((data || []) as any[]).length > 0;
}

// وقت إبلاغ المشارك بالنتيجة. تعذّره لا يُفشل القرار المنفَّذ (الرسالة وصلت)، ويُسجَّل
export async function markNotified(requestId: string) {
  const { error } = await db.from('erasure_requests').update({ notified_at: new Date().toISOString() }).eq('id', requestId);
  if (error) console.error('erasure notified:', error.message);
}

// للوحة: الطلبات القائمة بأقدمها أولًا، بأيامها المتبقية بتقويم الرياض (erasure.js daysLeft)
export async function pendingList() {
  const { data, error } = await db.from('erasure_requests').select('id, participant_id, reason, created_at, participants(full_name, email)')
    .eq('status', 'pending').order('created_at').limit(200);
  if (error) { if (missingTable(error)) return { success: true, ready: false, items: [] }; throw new Fail('تعذّر قراءة طلبات الحذف', 503, 'busy'); }
  return { success: true, ready: true, items: (data || []).map((r: any) => ({ ...eraseView(r), days_left: daysLeft(r.created_at), participant_id: r.participant_id, name: r.participants?.full_name ?? null, email: r.participants?.email ?? null })) };
}
