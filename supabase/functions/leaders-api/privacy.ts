// ════════════════════════════════════════════════════════════════
// خصوصية المشارك: نسخة من بياناته، وطلب حذفها (خدمة ذاتية)
// ════════════════════════════════════════════════════════════════
// me.privacy: حالة طلب الحذف وما بقي من نسخ اليوم. me.export: نسخة JSON من كل ما تحمله المنصة عنه.
// me.erase-request: طلب حذف يصل المالك وينفذه المدير العام بمسار الحذف القائم (admin.participant-delete)،
// أو يسحبه المشارك قبل تنفيذه. الحذف نفسه لا ينفذه المشارك: فيه موانع (شهادة صادرة، دفعة جارية) يقرأها إنسان.
import { alertOps, audit, db, ERASE_MAIL_SUBJECT, eraseRequestMail, Fail, must, sendMail } from './core.ts';
import { cleanReason, ERASE_REPLY_DAYS, eraseView, EXPORT_PER_DAY, EXPORT_ROW_CAP, EXPORT_TABLES, scrubRow } from './privacy.js';
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
    if (rows?.length) data[t] = rows.map((r: any) => scrubRow(t, r));
  }));
  // الإجابات والنتائج تتبع القياس لا المشارك مباشرة
  const ids = ((data.assessments as any[]) || []).map((a) => a.id);
  if (ids.length) {
    const [ans, res] = await Promise.all([
      db.from('assessment_answers').select('*').in('assessment_id', ids).limit(EXPORT_ROW_CAP),
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
    must(await db.from('erasure_requests').update({ status: 'cancelled', decided_at: new Date().toISOString(), decided_by: 'participant' }).eq('id', cur.row.id).eq('status', 'pending'), 'تعذّر سحب الطلب');
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
  // المالك يُبلَّغ فورًا، والمشارك يصله تأكيد بالمهلة وطريقة السحب. تعذّر البريد لا يُسقط الطلب المسجَّل
  await alertOps('erase_request', { request: row.id, participant: p.id, due_at: view.due_at }).catch((e) => console.error('erase alert:', e));
  await sendMail(p.email, ERASE_MAIL_SUBJECT, eraseRequestMail(p.full_name, ERASE_REPLY_DAYS)).catch((e) => console.error('erase mail:', e));
  return { success: true, erase: view };
}

// عند تنفيذ المدير للحذف: يُغلق الطلب القائم قبل أن يُحذف صف المشارك (فيبقى أثر الطلب بلا معرّف صاحبه)
export async function closeOnDelete(participantId: string, by: string) {
  const { error } = await db.from('erasure_requests').update({ status: 'done', decided_at: new Date().toISOString(), decided_by: by })
    .eq('participant_id', participantId).eq('status', 'pending');
  if (error && !missingTable(error)) console.error('erasure close:', error.message);
}

// للوحة: الطلبات القائمة بأقدمها أولًا
export async function pendingList() {
  const { data, error } = await db.from('erasure_requests').select('id, participant_id, reason, created_at, participants(full_name, email)')
    .eq('status', 'pending').order('created_at').limit(200);
  if (error) { if (missingTable(error)) return { success: true, ready: false, items: [] }; throw new Fail('تعذّر قراءة طلبات الحذف', 503, 'busy'); }
  return { success: true, ready: true, items: (data || []).map((r: any) => ({ ...eraseView(r), participant_id: r.participant_id, name: r.participants?.full_name ?? null, email: r.participants?.email ?? null })) };
}
