// ════════════════════════════════════════════════════════════════
// أين توقف المشارك قبل اعتماد مستواه: الملف الشخصي ثم القياس ثم الاعتماد (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لحقول اكتمال الملف: profileSave يحكم بها على الاكتمال، واللوحة تسمّي بها الناقص،
// فلا يختلف ما يطلبه التطبيق عما تعرضه الإدارة. والقياس الجاري يُعدّ بما قُدِّم فعلًا (صيغة المشارك).
import { forForm, usesForms } from './logic.js';

export const PROFILE_FIELDS = [
  { key: 'full_name', label: 'الاسم' },
  { key: 'phone', label: 'الجوال' },
  { key: 'job_title', label: 'المسمى الوظيفي' },
  { key: 'organization_name', label: 'جهة العمل' },
  { key: 'years_experience', label: 'سنوات الخبرة' },
];
const filled = (v) => v != null && String(v).trim() !== '';
/** أسماء الحقول الناقصة من الملف، بترتيب النموذج */
export const profileMissing = (p) => PROFILE_FIELDS.filter((f) => !filled(p?.[f.key])).map((f) => f.label);
export const profileComplete = (p) => profileMissing(p).length === 0;

/** عدد ما يُعرض على المشارك من أسئلة القياس المبدئي: صيغته إن حُددت، وإلا الصيغة الأولى (كل الصيغ بالطول نفسه) */
export function servedTotal(questions, form) {
  const qs = questions || [];
  if (!usesForms(qs)) return qs.length;
  const f = form || [...new Set(qs.map((q) => q.form).filter(Boolean))].sort()[0];
  return forForm(qs, f).length;
}

export const ONBOARDING_STEPS = ['profile', 'assessment_todo', 'assessment_doing', 'approval', 'done'];
export const ONBOARDING_AR = {
  profile: 'لم يكمل الملف', assessment_todo: 'لم يبدأ القياس', assessment_doing: 'القياس جارٍ', approval: 'بانتظار الاعتماد', done: 'معتمد',
};

/**
 * خطوة المشارك قبل الاعتماد، وما بقي عليه بكلمات تُقرأ.
 * @param {any} p صف المشارك (حقول الملف وstatus)
 * @param {{ status?: string, answered?: number, total?: number, started_at?: string|null }|null} [a] قياسه المبدئي الأحدث غير الملغى
 */
export function onboardingOf(p, a = null) {
  const missing = profileMissing(p);
  const answered = Number(a?.answered) || 0;
  const total = Number(a?.total) || 0;
  if (a?.status === 'submitted' || ['placed', 'enrolled', 'completed'].includes(p?.status) || p?.status === 'pending_approval') {
    const step = p?.status === 'pending_approval' ? 'approval' : 'done';
    return { step, label: ONBOARDING_AR[step], missing: [], answered: total || answered, total, remaining: step === 'approval' ? 'اعتماد المستوى من الإدارة' : '' };
  }
  if (missing.length) return { step: 'profile', label: ONBOARDING_AR.profile, missing, answered: 0, total, remaining: `ينقص الملف: ${missing.join('، ')}` };
  if (!a || answered === 0) return { step: 'assessment_todo', label: ONBOARDING_AR.assessment_todo, missing: [], answered: 0, total, remaining: a ? 'فتح القياس ولم يجب عن أي سؤال' : 'لم يفتح القياس' };
  return {
    step: 'assessment_doing', label: ONBOARDING_AR.assessment_doing, missing: [], answered, total,
    remaining: total ? `أجاب ${answered} من ${total}، وبقي ${Math.max(0, total - answered)}` : `أجاب ${answered}`,
  };
}

// ── تذكير المتعثر قبل الاعتماد (admin.remind-stuck): نص يسمّي ما بقي عليه هو، لا «لديك خطوات» ──
export const STUCK_STEPS = ['profile', 'assessment_todo', 'assessment_doing'];
export const REMIND_GAP_DAYS = 3;   // لا يُذكَّر الشخص نفسه مرتين في أقل منها (آليًا أو يدويًا: reminded_at واحد)
export const STUCK_MAIL_SUBJECT = 'خطوة واحدة لتبدأ رحلتك في برنامج القادة';
/** @param {{ step: string, missing?: string[], answered?: number, total?: number }} o ناتج onboardingOf */
export function stuckMailText(o) {
  if (o?.step === 'profile') return `بقي إكمال ملفك الشخصي (${(o.missing || []).join('، ')}). دقيقتان وتنتقل بعدها إلى قياس تحديد المستوى.`;
  if (o?.step === 'assessment_doing') return `أجبت ${o.answered}${o.total ? ` من ${o.total}` : ''} في قياس تحديد المستوى، وإجاباتك محفوظة. أكمل من حيث توقفت ليُعتمد مسارك.`;
  if (o?.step === 'assessment_todo') return 'ملفك مكتمل، وبقي قياس تحديد المستوى. تقدمك يُحفظ سؤالًا سؤالًا، فتكمله على أكثر من جلسة إن شئت.';
  return null;
}
