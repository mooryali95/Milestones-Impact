// ════════════════════════════════════════════════════════════════
// جاهزية الدفعة كاملة: كل ما يلزم لتعمل الدفعة، بندًا بندًا (منطق خالص بلا واجهة ولا قاعدة)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لبنود ملف الدفعة: يقرؤه ملف الدفعة وجدول الدفعات (admin-app/src/cohort-hub.js يعيد تصديره ويضيف
// رابط التسجيل)، ونبض الدفعات في «مكتب اليوم» بالخادم (today.js). لا يخزّن شيئًا ولا يكرر قاعدة: الالتحاق بقاعدة
// pickCohort نفسها التي تحدد دفعة كل مشارك، والبنود الخمسة (الأعضاء والمستشار والمدة والجدول والجلسات) من cohortSetup
// نفسه الذي تقرؤه صفحة الجهة ولوحة المنسق. ويضيف ثلاثة بنود لا تُرى إلا من مكان واحد يجمع الدفعة: هل يدخلها المنضمون
// تلقائيًا، والبرنامج ونسخته (والدفعة غير المثبتة نقص)، ومن ينتظر الاعتماد.
import { pickCohort } from './logic.js';
import { cohortSetup } from './cohort-setup.js';

// نوع الدفعة بجملة واحدة: ثلاثة أنواع فقط، ولكل نوع طريقة دخول واحدة
export function cohortKind(c) {
  if (c?.is_default) return 'open';
  return c?.organization_id ? 'org' : 'individuals';
}
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
    // بقاعدة pickCohort: الملحق يدويًا (تسجيل صريح) يبقى في دفعته، ومن تبع الدفعة بجهته ينتقل إلى أحدث دفعة لها
    return { ok: false, detail: `دفعة «${active.name}» أحدث لجهة «${org.name}»، وهي التي يتبعها منضموها: الملحقون يدويًا بهذه الدفعة باقون فيها، والبقية ينتقلون إلى الدفعة الأحدث.`, action: 'other', other: active.id };
  }
  return { ok: true, detail: `كل من يسجّل برابط «${org.name}» يدخل هذه الدفعة تلقائيًا، دون أي إلحاق يدوي.`, action: null };
}

/** @param {{ cohort: any, cohorts?: any[], orgs?: any[], programs?: any[] }} d */
export function cohortReadiness({ cohort: c, cohorts = [], orgs = [], programs = [] }) {
  if (!c) return { kind: null, org: null, items: [], missing: 0 };
  const kind = cohortKind(c);
  const org = kind === 'org' ? orgs.find((o) => o.id === c.organization_id) || null : null;
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
        // الدفعة غير المثبتة (قبل ترحيل التثبيت) تتغير رحلة أعضائها مع كل تعديل على البرنامج: نقص يُصلح بالترقية
        : !pinned
          // الفعل واحد في النص والزر والنافذة: «ثبّت». وبلا نسخة للبرنامج يحفظها «تحرير الدفعة» من حاله الآن (لا فرق يُراجع)
          ? p.versions?.[0]
            ? { ok: false, detail: `«${p.name}» · الدفعة غير مثبتة على نسخة: كل تعديل على البرنامج يصل إلى أعضائها فورًا. ثبّتها على النسخة ${p.versions[0].number} بعد مراجعة الفرق.`, action: 'pin' }
            : { ok: false, detail: `«${p.name}» · الدفعة غير مثبتة، ولا نسخة محفوظة للبرنامج: احفظ الدفعة من «تحرير الدفعة» فتُحفظ نسخته الأولى من حاله الآن وتُثبَّت عليها.`, action: 'edit' }
          : { ok: true, detail: `«${p.name}» · ${p.requirements} متطلب · مثبتة على النسخة ${pinned.number}${newer ? `، وتوجد نسخة أحدث (${newer.number}) يمكن الترقية إليها` : ''}`, action: newer ? 'upgrade' : null };

  const base = cohortSetup({
    cohort: c, advisorName: c.advisor_name || null, advisorServes: c.advisor_serves !== false, teamCount: (c.team_expert_ids || []).length,
    members: c.members || 0, upcomingSessions: c.upcoming_sessions ?? 0, undatedSessions: c.undated_sessions ?? 0,
  }).filter((x) => x.key !== 'sessions' || c.upcoming_sessions != null);
  const byKey = Object.fromEntries(base.map((x) => [x.key, x]));
  // بند خطة المراحل يفتح تبويب «الرحلة» في ملف الدفعة (plan)، محررها الوحيد بعد إزالة نافذة «الجدول» (القرار 23)
  const ACTION = { team: 'team', cohort: 'edit', journey: 'plan', activities: 'activities' };
  const from = (k) => byKey[k] && { key: k, title: byKey[k].title, ok: byKey[k].ok, detail: byKey[k].detail, action: byKey[k].ok ? null : ACTION[byKey[k].where] || null };
  // مقاعد الدفعة (capacity) تنبيه لا منع: تجاوزها يُعلن ولا يُرفض به أحد، كمؤشر حمل الخبير
  const cap = Number(c.capacity) || 0;
  const over = cap > 0 && (c.members || 0) > cap;
  const members = byKey.members && {
    key: 'members', title: 'الأعضاء', ok: byKey.members.ok && !over, action: 'participants',
    detail: over ? (kind === 'org' ? `${c.members} عضوًا وسعة الدفعة التشغيلية ${cap}: ارفعها أو ألغها من «تحرير الدفعة» (مقاعد العقد الملزمة في ملف الجهة)، أو انقل بعضهم` : `${c.members} عضوًا وللدفعة ${cap} مقعدًا: زد المقاعد من «تحرير الدفعة» أو انقل بعضهم`)
      : byKey.members.ok ? `${byKey.members.detail}${cap ? ` · ${cap} مقعدًا` : ''}` : kind === 'org' ? 'لا أحد بعد: شارك رابط تسجيل الجهة' : kind === 'open' ? 'لا أحد بعد' : 'لا أحد بعد: ألحق بها المشاركين من شاشة المشاركين',
  };
  const pending = c.pending_approval || 0;

  // بالترتيب الذي يسلكه المدير: كيف يدخلونها، ثم ماذا يمرون به ومتى، ثم من يرافقهم، ثم من فيها
  const items = [
    { key: 'intake', title: 'الالتحاق', ...into },
    { key: 'program', title: 'البرنامج والنسخة', ...program },
    from('period'),
    // بلا تاريخ بداية لا خطة تُحسب: البند يفتح «تحرير الدفعة» لتحديده. ومراحل مثبتة بتاريخ (ومنها ما وُزّع قبل R2a) تفتح
    // تبويب «الرحلة» حيث «حرّر التواريخ لتتبع المدد»، والبند ناجح لأن المثبت خطة صحيحة
    byKey.schedule && { ...from('schedule'), action: !byKey.schedule.ok ? 'edit' : byKey.schedule.pinned ? 'plan' : null },
    byKey.advisor && { ...from('advisor'), title: 'المستشار والفريق' },
    from('sessions'),
    members,
    { key: 'approval', title: 'الاعتماد', ok: pending === 0, detail: pending ? `${pending} بانتظار اعتمادك: لا يرون رحلتهم قبله` : 'لا أحد ينتظر الاعتماد', action: pending ? 'approve' : null },
  ].filter(Boolean);
  return { kind, org, items, missing: items.filter((x) => !x.ok).length };
}

// ما بقي بجملة: يقرؤه رأس الملف وجدول الدفعات
export const hubSummary = (hub) => (hub.missing ? `بقي ${hub.missing === 1 ? 'بند واحد' : hub.missing === 2 ? 'بندان' : `${hub.missing} بنود`}` : 'مكتملة الإعداد');

// تنبيه نسخة الرحلة في رأس ملف الدفعة (قرار المالك 2026-11-23: «غيّرت الرحلة ولم تتغير الدفعة»). الدفعة مثبتة على نسخة
// حتى لا يختفي تقدم أحد، فيُقال صراحة ما بينها وبين ما عدّله المالك، والفعل الواحد الذي يوصله: حفظ نسخة أو الترقية بمعاينة
export function versionNotice({ cohort: c, programs = [] }) {
  const p = programs.find((x) => x.id === c?.program_id);
  if (!c || !p || p.archived_at || c.status === 'closed') return null;
  const pinned = p.versions?.find((v) => v.id === c.program_version_id);
  const latest = p.versions?.[0] || null;
  if (pinned && latest && latest.id !== pinned.id) {
    return { kind: 'newer', action: 'upgrade', button: 'رقِّ الدفعة',
      text: `الدفعة على النسخة ${pinned.number} من رحلة «${p.name}»، والأحدث ${latest.number}. ما عدّلته بعد ${pinned.number} لا يظهر هنا ولا عند أعضائها حتى ترقّيها، وترى قبلها ما يتغير ومن يتأثر.` };
  }
  if (pinned && p.draft_changed) {
    return { kind: 'draft', action: 'journey', button: 'افتح الرحلة واحفظها نسخة',
      text: `في رحلة «${p.name}» تعديلات لم تُحفظ نسخة بعد، فلا تصل إلى هذه الدفعة. احفظها نسخة من محرر الرحلة، ثم رقِّ الدفعة إليها.` };
  }
  return null;
}
