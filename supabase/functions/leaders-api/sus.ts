// ════════════════════════════════════════════════════════════════
// استبيان سهولة الاستخدام SUS للأدوار الثلاثة، وملخصه للإدارة (بوابة م4)
// ════════════════════════════════════════════════════════════════
// الحالة: هل البطاقة مستحقة. الإرسال: إجابة واحدة لكل شخص في كل دور. الجدول قد لا يكون مطبّقًا بعد:
// قبله لا تُعرض البطاقة لأحد (ready: false) ولا يفشل شيء.
import { audit, db, Fail } from './core.ts';
import { SUS_COMMENT_MAX, susDue, susScore, susSummary, susValid } from './sus.js';

type Body = Record<string, any>;
type Role = 'participant' | 'expert' | 'coordinator';
const missingTable = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || /sus_responses/.test(String(e.message || '')));

async function mine(role: Role, subjectId: string) {
  const { data, error } = await db.from('sus_responses').select('id, score, answers, snoozed_at, created_at').eq('role', role).eq('subject_id', subjectId).limit(1);
  if (error) { if (missingTable(error)) return { ready: false, row: null }; throw new Fail('تعذّر قراءة الاستبيان الآن، حاول بعد قليل', 503, 'busy'); }
  return { ready: true, row: data?.[0] ?? null };
}

export async function state(role: Role, subject: any) {
  if (subject?.is_demo) return { success: true, ready: true, due: false, answered: false };
  const m = await mine(role, subject.id);
  const answered = !!m.row?.answers;
  return { success: true, ready: m.ready, answered, due: m.ready && susDue({ createdAt: subject.created_at, answered, snoozedAt: m.row?.snoozed_at }) };
}

export async function submit(role: Role, subject: any, b: Body) {
  if (subject?.is_demo) throw new Fail('حساب العرض لا يشارك في الاستبيان', 400, 'demo');
  const m = await mine(role, subject.id);
  if (!m.ready) throw new Fail('الاستبيان غير متاح الآن', 503, 'not_ready');
  // «لاحقًا»: يُسجَّل التأجيل وحده
  if (b.snooze === true) {
    if (m.row?.answers) return { success: true, answered: true };
    const { error } = await db.from('sus_responses').upsert({ role, subject_id: subject.id, snoozed_at: new Date().toISOString() }, { onConflict: 'role,subject_id' });
    if (error) throw new Fail('تعذّر الحفظ الآن، حاول بعد قليل', 503, 'busy');
    return { success: true, snoozed: true };
  }
  if (m.row?.answers) throw new Fail('سبق أن أجبت عن هذا الاستبيان. شكرًا لك', 409, 'answered');
  if (!susValid(b.answers)) throw new Fail('أجب عن العبارات العشر كلها', 400, 'invalid');
  const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, SUS_COMMENT_MAX) || null : null;
  const score = susScore(b.answers);
  const { error } = await db.from('sus_responses').upsert({ role, subject_id: subject.id, answers: b.answers, score, comment, answered_at: new Date().toISOString() }, { onConflict: 'role,subject_id' });
  if (error) throw new Fail('تعذّر حفظ إجابتك الآن، حاول بعد قليل', 503, 'busy');
  await audit(role === 'coordinator' ? 'coordinator' : role === 'participant' ? 'participant' : 'system', subject.id, 'sus.submit', 'sus_responses', subject.id, null, { role });
  return { success: true, answered: true };
}

// للإدارة: الأعداد والمتوسطات لكل دور، وآخر الملاحظات بلا أسماء
export async function adminSummary() {
  const { data, error } = await db.from('sus_responses').select('role, score, comment, answered_at').not('answers', 'is', null).order('answered_at', { ascending: false }).limit(2000);
  if (error) { if (missingTable(error)) return { success: true, ready: false, summary: susSummary([]), comments: [] }; throw new Fail('تعذّر قراءة نتائج الاستبيان', 503, 'busy'); }
  const comments = (data || []).filter((r: any) => r.comment).slice(0, 30).map((r: any) => ({ role: r.role, comment: r.comment, at: r.answered_at }));
  return { success: true, ready: true, summary: susSummary(data || []), comments };
}
