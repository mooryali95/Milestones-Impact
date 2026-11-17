// ════════════════════════════════════════════════════════════════
// ملف الدفعة: كل ما يلزم لتعمل الدفعة، بندًا بندًا، مع زر الضبط لكل بند (منطق خالص بلا واجهة)
// ════════════════════════════════════════════════════════════════
// لا يخزّن شيئًا ولا يكرر قاعدة: البنود نفسها (الالتحاق والبرنامج والمدة والجدول والمستشار والجلسات والأعضاء والاعتماد)
// في الخادم (cohort-readiness.js)، يقرؤها ملف الدفعة هنا ونبض الدفعات في «مكتب اليوم»، ويُضاف هنا رابط التسجيل وحده.
import { pickCohort } from '../../supabase/functions/leaders-api/logic.js';
import { cohortKind, cohortReadiness } from '../../supabase/functions/leaders-api/cohort-readiness.js';
import { inviteUrl } from './leaders.js';
import { cohortErrors } from './methodology.js';

export const KIND_AR = {
  org: 'دفعة جهة: يدخلها تلقائيًا كل من يسجّل برابط الجهة',
  open: 'الدفعة المفتوحة: يدخلها تلقائيًا كل من يسجّل بلا جهة',
  individuals: 'دفعة أفراد: لا رابط لها، يدخلها من تلحقه بها يدويًا',
};

// قواعد البنود في الخادم (cohort-readiness.js)، يقرؤها ملف الدفعة ونبض الدفعات في «مكتب اليوم»
export { cohortKind, cohortReadiness, hubSummary, intake } from '../../supabase/functions/leaders-api/cohort-readiness.js';

/** ملف الدفعة: بنود جاهزيتها (cohortReadiness) ورابط تسجيل جهتها
 * @param {{ cohort: any, cohorts?: any[], orgs?: any[], programs?: any[] }} d */
export function cohortHub(d) {
  if (!d?.cohort) return { kind: null, link: null, items: [] };
  const r = cohortReadiness(d);
  const link = r.org?.invite_code && r.org.status === 'active' ? inviteUrl(r.org) : null;
  return { ...r, link };
}

// ══ معالج الدفعة الجديدة: أربع خطوات، ولكل خطوة شرط واحد للانتقال ══
export const WIZARD_STEPS = ['لمن الدفعة', 'البرنامج', 'المواعيد', 'المراجعة والإنشاء'];

// ما يمنع الانتقال من الخطوة، بجملة تُقرأ؛ وفارغ يعني «تابع»
/** @param {number} step @param {any} v */
// programs: برنامج بلا متطلب فعّال لا تُنشأ عليه دفعة (لا نسخة تُثبَّت عليها، cohortSave)، فيقف المعالج عنده لا عند الإنشاء
export function wizardBlock(step, v, programs = []) {
  if (step === 0 && v.kind === 'org' && !v.organization_id) return 'اختر الجهة';
  if (step === 1 && !v.program_id) return 'اختر البرنامج';
  const p = programs.find((x) => x.id === v.program_id);
  if (step === 1 && p && !p.requirements) return `البرنامج «${p.name}» بلا متطلبات بعد، فلا تُنشأ عليه دفعة. ابنِ رحلته أولًا أو اختر برنامجًا آخر.`;
  // تحقق المعالج هو تحقق المحرر نفسه (cohortErrors)، فلا تختلف قاعدة الاسم والتاريخين بين الإنشاء والتحرير
  if (step === 2) { const e = cohortErrors(v); return e.name || e.ends_on || ''; }
  return '';
}

// ما يحسن أن يعرفه المدير قبل الإنشاء: أثر الدفعة الجديدة على دفعة الجهة القائمة، وحالة البرنامج والجهة
/** @param {{ v: any, cohorts?: any[], orgs?: any[], programs?: any[] }} d */
export function wizardNotes({ v, cohorts = [], orgs = [], programs = [] }) {
  const out = [];
  const org = v.kind === 'org' ? orgs.find((o) => o.id === v.organization_id) : null;
  if (org && org.status && org.status !== 'active') out.push(`جهة «${org.name}» غير فعّالة: رابط تسجيلها لا يعمل حتى تُفعَّل.`);
  if (org) {
    const live = pickCohort({ enrollments: [], cohorts, organizationId: org.id }).cohort;
    // بقاعدة pickCohort: من تبع الدفعة القائمة بجهته ينتقل إلى الأحدث، والملحق بها يدويًا يبقى (صياغة الزميل في تنسيق P1)
    if (live && live.organization_id === org.id) out.push(`لجهة «${org.name}» دفعة قائمة: «${live.name}». الملحقون يدويًا باقون، والبقية ينتقلون إلى الدفعة الأحدث.`);
  }
  const p = programs.find((x) => x.id === v.program_id);
  if (p && !p.requirements) out.push(`البرنامج «${p.name}» بلا متطلبات بعد: لا تُنشأ عليه دفعة حتى تُبنى رحلته.`);
  if (v.status === 'planned' && v.kind === 'org') out.push('الحالة «مخطط لها»: لن يدخلها أحد تلقائيًا حتى تجعلها «التسجيل مفتوح».');
  return out;
}

// جسم الحفظ: الدفعة الجديدة تُثبَّت دائمًا على أحدث نسخة من برنامجها ('latest')، والخادم ينشئ النسخة 1 من البرنامج
// كما هو إن لم تُحفظ له نسخة بعد (cohortSave). لا دفعة جديدة «تتبع آخر تعديل»
export function wizardBody(v) {
  return {
    name: String(v.name || '').trim(), organization_id: v.kind === 'org' ? v.organization_id : null, program_id: v.program_id,
    program_version_id: 'latest', status: v.status || 'open',
    ...(v.starts_on ? { starts_on: v.starts_on } : {}), ...(v.ends_on ? { ends_on: v.ends_on } : {}),
    // دفعة الجهة بلا سعة من المعالج: مقاعدها من عقد الجهة (P3)، والسعة التشغيلية اختيار لاحق في «تحرير الدفعة»
    ...(v.capacity && v.kind !== 'org' ? { capacity: Number(v.capacity) } : {}),
  };
}
