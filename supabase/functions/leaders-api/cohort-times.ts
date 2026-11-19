// ════════════════════════════════════════════════════════════════
// تواريخ أعضاء الدفعة من جداولها القائمة، بقراءة واحدة لكل جدول (تصور تشغيل الدفعة 2026-11-19، المرحلة 3)
// ════════════════════════════════════════════════════════════════
// مصدر «منذ آخر زيارة»: لا جدول أحداث جديد. كل لحظة هنا محفوظة أصلًا حيث وقعت (إتمام البند، مشاهدة المقطع، الحضور، جلسة
// التوجيه، مادة المنهج، اختبار الباب، تسليم النموذج، محاولة المختبر، وثيقة المبادرة، القياس البعدي). القراءة للدفعة كلها
// بدفعات من 150 معرّفًا (allFor)، فعدد الاستعلامات بعدد الجداول لا بعدد الأعضاء: READS لكل 150 عضوًا.
// المعرّفات من cohortMemberIds (بلا حساب العرض ولا حساب الاختبار)، فلا يدخل أحدهما سطرًا ولا عددًا.
import { allFor, db } from './core.ts';
import { missingColumn } from './missing-column.ts';
import { CHANGES_FLOOR_DAYS } from './cohort-changes.js';

type Times = Record<string, any>;
export const READS = 11;

// ما يُقرأ بتاريخه وحده يُحدّ بأرضية النافذة (أقصى ما يُعرض)، وما يكتمل بعدد (الحضور، جلسات التوجيه، المختبر) يُقرأ كله
// لأن لحظة الإتمام لحظة العدد المتمم لا آخر صف
export async function completionTimes(ids: string[], people: Record<string, any> = {}, now = Date.now()): Promise<Record<string, Times>> {
  const out: Record<string, Times> = Object.fromEntries(ids.map((id) => [id, { req: {}, sub: {}, video: {}, ws: {}, coach: [], content: {}, quiz: {}, read: {}, model: {}, lab: {}, cap: null, auto: {} }]));
  if (!ids.length) return out;
  const floor = new Date(now - CHANGES_FLOOR_DAYS * 864e5).toISOString();
  const read = (make: () => any) => allFor(ids, make).catch((e) => { console.error('cohort times:', (e as Error)?.message || e); return [] as any[]; });
  // وقت التسليم (submitted_at) عمود الترحيل 20261119120000: قبله تُقرأ البنود بلا وقت تسليمها، فلا يُعدّ تسليم «جديدًا»
  const requirements = async () => {
    const q = (cols: string) => allFor(ids, () => db.from('participant_requirements').select(cols).or(`completed_at.gte.${floor},status.eq.submitted`).order('participant_id').order('requirement_id'));
    // must يحجب رمز الخطأ، فأي تعذّر يُعاد بلا العمود الجديد، وتعذّر الثانية يُسقط هذا المصدر وحده
    return q('participant_id, requirement_id, status, completed_at, submitted_at')
      .catch(() => q('participant_id, requirement_id, status, completed_at'))
      .catch((e) => { console.error('cohort times:', (e as Error)?.message || e); return [] as any[]; });
  };
  const [reqs, video, att, coach, content, quiz, reading, models, lab, caps, post] = await Promise.all([
    requirements(),
    read(() => db.from('video_progress').select('participant_id, requirement_id, completed_at').gte('completed_at', floor).order('participant_id').order('requirement_id')),
    // counting-exempt: حضور معرّفات أعضاء الدفعة من cohortMemberIds (بلا حساب العرض ولا الاختبار)، لوقت كل حضور لا لعدّ
    read(() => db.from('workshop_attendance').select('participant_id, session_id, checked_in_at').order('participant_id').order('session_id')),
    read(() => db.from('coaching_sessions').select('participant_id, requirement_id, status, confirmed_at, ends_at, updated_at').eq('status', 'attended').order('participant_id').order('id')),
    read(() => db.from('content_progress').select('participant_id, item_id, completed_at').gte('completed_at', floor).order('participant_id').order('item_id')),
    read(() => db.from('handbook_progress').select('participant_id, module_id, completed_at').gte('completed_at', floor).order('participant_id').order('module_id')),
    read(() => db.from('reading_progress').select('participant_id, module_id, last_ping_at').gte('last_ping_at', floor).order('participant_id').order('module_id')),
    read(() => db.from('model_submissions').select('participant_id, model_id, status, submitted_at, reviewed_at').order('participant_id').order('id')),
    read(() => db.from('lab_attempts').select('participant_id, item_id, finished_at').not('finished_at', 'is', null).order('participant_id').order('id')),
    read(() => db.from('capstones').select('participant_id, status, submitted_at, reviewed_at, approved_at').order('participant_id')),
    // counting-exempt: القياس البعدي لمعرّفات أعضاء الدفعة من cohortMemberIds، لوقت تسليمه لا لعدّ
    read(() => db.from('assessments').select('participant_id, submitted_at, instruments!inner(kind)').eq('status', 'submitted').eq('instruments.kind', 'post').order('participant_id').order('id')),
  ]);
  const of = (r: any) => out[r.participant_id];
  for (const r of reqs as any[]) { const t = of(r); if (!t) continue; if (r.completed_at) t.req[r.requirement_id] = r.completed_at; if (r.status === 'submitted' && r.submitted_at) t.sub[r.requirement_id] = r.submitted_at; }
  for (const r of video as any[]) { const t = of(r); if (t && r.completed_at) t.video[r.requirement_id] = r.completed_at; }
  for (const r of att as any[]) { const t = of(r); if (t && r.checked_in_at) t.ws[r.session_id] = r.checked_in_at; }
  for (const r of coach as any[]) { const t = of(r); if (t) t.coach.push({ requirement_id: r.requirement_id, at: r.ends_at || r.confirmed_at || r.updated_at || null }); }
  for (const r of content as any[]) { const t = of(r); if (t && r.completed_at) t.content[r.item_id] = r.completed_at; }
  for (const r of quiz as any[]) { const t = of(r); if (t && r.completed_at) t.quiz[r.module_id] = r.completed_at; }
  for (const r of reading as any[]) { const t = of(r); if (t && r.last_ping_at) t.read[r.module_id] = r.last_ping_at; }
  for (const r of models as any[]) { const t = of(r); if (t) t.model[r.model_id] = { submitted_at: r.submitted_at || null, reviewed_at: r.reviewed_at || null }; }
  for (const r of lab as any[]) { const t = of(r); if (t && r.finished_at) (t.lab[r.item_id] ||= []).push(r.finished_at); }
  for (const r of caps as any[]) { const t = of(r); if (t) t.cap = { submitted_at: r.submitted_at || null, reviewed_at: r.reviewed_at || null, approved_at: r.approved_at || null }; }
  for (const r of post as any[]) { const t = of(r); if (t && r.submitted_at) t.auto['E-POST'] = r.submitted_at; }
  // ما يحسمه النظام من صف المشارك ورحلته المقروءة أصلًا: إكمال الملف، وتسليم القياس المبدئي، واعتماد المسار
  for (const id of ids) {
    const p = people[id] || {};
    const t = out[id];
    if (p.profile_completed_at) t.auto['P-INFO'] = p.profile_completed_at;
    if (p.baselineAt) t.auto['A-DONE'] = p.baselineAt;
    if (p.approvedAt) t.auto['AP-OK'] = p.approvedAt;
  }
  return out;
}

// وقت تسليم البند للمراجعة (عمود الترحيل 20261119120000): يُكتب بعد أن يُحفظ التسليم نفسه، ولا يُسقطه. قبل الترحيل لا عمود
// فيبقى التسليم بلا وقته، وأي تعذّر آخر يُسجَّل ولا يُرمى
export async function stampSubmitted(participantId: string, requirementId: string, at = new Date().toISOString()) {
  try {
    const { error } = await db.from('participant_requirements').update({ submitted_at: at }).eq('participant_id', participantId).eq('requirement_id', requirementId).eq('status', 'submitted');
    if (error && !missingColumn(error)) console.error('requirement submitted_at:', error.message || error);
  } catch (e) { console.error('requirement submitted_at:', (e as Error)?.message || e); }
}
