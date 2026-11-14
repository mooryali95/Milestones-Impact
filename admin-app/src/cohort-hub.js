// ════════════════════════════════════════════════════════════════
// ملف الدفعة: كل ما يلزم لتعمل الدفعة، بندًا بندًا، مع زر الضبط لكل بند (منطق خالص بلا واجهة)
// ════════════════════════════════════════════════════════════════
// لا يخزّن شيئًا ولا يكرر قاعدة: الالتحاق بقاعدة pickCohort نفسها التي تحدد دفعة كل مشارك، والبنود الخمسة
// (الأعضاء والمستشار والمدة والجدول والجلسات) من cohortSetup نفسه الذي تقرؤه صفحة الجهة ولوحة المنسق.
// يضيف ثلاثة بنود لا تُرى إلا من مكان واحد يجمع الدفعة: هل يدخلها المنضمون تلقائيًا، والبرنامج ونسخته، ومن ينتظر الاعتماد.
import { pickCohort } from '../../supabase/functions/leaders-api/logic.js';
import { cohortSetup } from '../../supabase/functions/leaders-api/cohort-setup.js';
import { inviteUrl } from './leaders.js';

// نوع الدفعة بجملة واحدة: ثلاثة أنواع فقط، ولكل نوع طريقة دخول واحدة
export function cohortKind(c) {
  if (c?.is_default) return 'open';
  return c?.organization_id ? 'org' : 'individuals';
}
export const KIND_AR = {
  org: 'دفعة جهة: يدخلها تلقائيًا كل من يسجّل برابط الجهة',
  open: 'الدفعة المفتوحة: يدخلها تلقائيًا كل من يسجّل بلا جهة',
  individuals: 'دفعة أفراد: لا رابط لها، يدخلها من تلحقه بها يدويًا',
};

// هل تستقبل الدفعة المنضمين الجدد تلقائيًا؟ ولماذا لا؟
/** @param {{ cohort: any, cohorts: any[], org?: any }} d */
export function intake({ cohort: c, cohorts = [], org = null }) {
  const kind = cohortKind(c);
  if (c.status === 'closed') return { ok: true, info: true, detail: 'الدفعة مغلقة: لا تستقبل أحدًا، ويبقى أعضاؤها وسجلهم كما هم.', action: null };
  if (kind === 'individuals') return { ok: true, detail: 'دفعة أفراد: لا رابط تسجيل لها، فيدخلها من تلحقه بها يدويًا من شاشة المشاركين.', action: 'participants' };
  if (kind === 'open') {
    return c.status === 'open' || c.status === 'running'
      ? { ok: true, detail: 'كل من يسجّل بلا جهة يدخلها تلقائيًا، دون أي إلحاق يدوي.', action: null }
      : { ok: false, detail: 'ليست «التسجيل مفتوح» ولا «جارية»: من يسجّل بلا جهة لا يجد دفعة.', action: 'edit' };
  }
  if (!org) return { ok: false, detail: 'الجهة المرتبطة بالدفعة غير موجودة.', action: 'edit' };
  if (org.status && org.status !== 'active') return { ok: false, detail: `جهة «${org.name}» غير فعّالة: رابط تسجيلها متوقف حتى تُفعَّل.`, action: 'org' };
  if (c.status !== 'open' && c.status !== 'running') {
    return { ok: false, detail: 'الدفعة «مخطط لها»: من يسجّل برابط الجهة لا يدخلها حتى تجعل حالتها «التسجيل مفتوح» أو «جارية». إلى ذلك الحين يدخل الدفعة المفتوحة العامة.', action: 'edit' };
  }
  const active = pickCohort({ enrollments: [], cohorts, organizationId: c.organization_id }).cohort;
  if (active && active.id !== c.id && active.organization_id === c.organization_id) {
    return { ok: false, detail: `دفعة «${active.name}» أحدث لجهة «${org.name}»، وهي التي تستقبل المنضمين الجدد. أعضاء هذه الدفعة الحاليون باقون فيها.`, action: 'other', other: active.id };
  }
  return { ok: true, detail: `كل من يسجّل برابط «${org.name}» يدخل هذه الدفعة تلقائيًا، دون أي إلحاق يدوي.`, action: null };
}

/** @param {{ cohort: any, cohorts?: any[], orgs?: any[], programs?: any[] }} d */
export function cohortHub({ cohort: c, cohorts = [], orgs = [], programs = [] }) {
  if (!c) return { kind: null, link: null, items: [] };
  const kind = cohortKind(c);
  const org = kind === 'org' ? orgs.find((o) => o.id === c.organization_id) || null : null;
  const link = org?.invite_code && org.status === 'active' ? inviteUrl(org) : null;
  const p = programs.find((x) => x.id === c.program_id);
  const pinned = p?.versions?.find((v) => v.id === c.program_version_id);
  const newer = pinned && p.versions[0] && p.versions[0].id !== pinned.id ? p.versions[0] : null;

  const into = intake({ cohort: c, cohorts, org });
  const program = !p
    ? { ok: false, detail: 'البرنامج غير موجود: اختر برنامجًا للدفعة.', action: 'edit' }
    : p.archived_at
      ? { ok: false, detail: `البرنامج «${p.name}» مؤرشف. اختر برنامجًا فعّالًا.`, action: 'edit' }
      : !p.requirements
        ? { ok: false, detail: `البرنامج «${p.name}» بلا متطلبات بعد: لا رحلة يمر بها المشارك.`, action: 'journey' }
        : { ok: true, detail: `«${p.name}» · ${p.requirements} متطلب · ${pinned ? `مثبتة على النسخة ${pinned.number}${newer ? `، وتوجد نسخة أحدث (${newer.number}) يمكن الترقية إليها` : ''}` : 'تتبع آخر تعديل على البرنامج'}`, action: newer ? 'upgrade' : null };

  const base = cohortSetup({
    cohort: c, advisorName: c.advisor_name || null, teamCount: (c.team_expert_ids || []).length,
    members: c.members || 0, upcomingSessions: c.upcoming_sessions ?? 0,
  }).filter((x) => x.key !== 'sessions' || c.upcoming_sessions != null);
  const byKey = Object.fromEntries(base.map((x) => [x.key, x]));
  const ACTION = { team: 'team', cohort: 'edit', schedule: 'schedule', activities: 'activities' };
  const from = (k) => byKey[k] && { key: k, title: byKey[k].title, ok: byKey[k].ok, detail: byKey[k].detail, action: byKey[k].ok ? null : ACTION[byKey[k].where] || null };
  const members = byKey.members && {
    key: 'members', title: 'الأعضاء', ok: byKey.members.ok, action: 'participants',
    detail: byKey.members.ok ? byKey.members.detail : kind === 'org' ? 'لا أحد بعد: شارك رابط تسجيل الجهة' : kind === 'open' ? 'لا أحد بعد' : 'لا أحد بعد: ألحق بها المشاركين من شاشة المشاركين',
  };
  const pending = c.pending_approval || 0;

  // بالترتيب الذي يسلكه المدير: كيف يدخلونها، ثم ماذا يمرون به ومتى، ثم من يرافقهم، ثم من فيها
  const items = [
    { key: 'intake', title: 'الالتحاق', ...into },
    { key: 'program', title: 'البرنامج والنسخة', ...program },
    from('period'),
    from('schedule'),
    byKey.advisor && { ...from('advisor'), title: 'المستشار والفريق' },
    from('sessions'),
    members,
    { key: 'approval', title: 'الاعتماد', ok: pending === 0, detail: pending ? `${pending} بانتظار اعتمادك: لا يرون رحلتهم قبله` : 'لا أحد ينتظر الاعتماد', action: pending ? 'approve' : null },
  ].filter(Boolean);
  return { kind, org, link, items, missing: items.filter((x) => !x.ok).length };
}

// ما بقي بجملة: يقرؤه رأس الملف وجدول الدفعات
export const hubSummary = (hub) => (hub.missing ? `بقي ${hub.missing === 1 ? 'بند واحد' : hub.missing === 2 ? 'بندان' : `${hub.missing} بنود`}` : 'مكتملة الإعداد');

// ══ معالج الدفعة الجديدة: أربع خطوات، ولكل خطوة شرط واحد للانتقال ══
export const WIZARD_STEPS = ['لمن الدفعة', 'البرنامج', 'المواعيد', 'المراجعة والإنشاء'];

// ما يمنع الانتقال من الخطوة، بجملة تُقرأ؛ وفارغ يعني «تابع»
/** @param {number} step @param {any} v */
export function wizardBlock(step, v) {
  if (step === 0 && v.kind === 'org' && !v.organization_id) return 'اختر الجهة';
  if (step === 1 && !v.program_id) return 'اختر البرنامج';
  if (step === 2) {
    if (!String(v.name || '').trim()) return 'اكتب اسم الدفعة';
    if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) return 'تاريخ النهاية قبل البداية';
  }
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
    if (live && live.organization_id === org.id) out.push(`لجهة «${org.name}» دفعة قائمة: «${live.name}». أعضاؤها باقون فيها، ومن يسجّل بعد الإنشاء يدخل أحدث دفعة مفتوحة أو جارية للجهة.`);
  }
  const p = programs.find((x) => x.id === v.program_id);
  if (p && !p.requirements) out.push(`البرنامج «${p.name}» بلا متطلبات بعد: لا رحلة يمر بها المشارك حتى تُبنى.`);
  if (v.status === 'planned' && v.kind === 'org') out.push('الحالة «مخطط لها»: لن يدخلها أحد تلقائيًا حتى تجعلها «التسجيل مفتوح».');
  return out;
}

// جسم الحفظ: النسخة «أحدث نسخة محفوظة» تثبّت الدفعة عليها، وإلا تتبع آخر تعديل
export function wizardBody(v) {
  return {
    name: String(v.name || '').trim(), organization_id: v.kind === 'org' ? v.organization_id : null, program_id: v.program_id,
    program_version_id: v.pin ? 'latest' : '', status: v.status || 'open',
    ...(v.starts_on ? { starts_on: v.starts_on } : {}), ...(v.ends_on ? { ends_on: v.ends_on } : {}),
    ...(v.capacity ? { capacity: Number(v.capacity) } : {}),
  };
}
