// ════════════════════════════════════════════════════════════════
// مكتب اليوم، المرحلة 3ب (تصور لوحة الإدارة 4.3، البندان 4 و5): التنبيهات ونبض الدفعات (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// لا يخزّن شيئًا ولا يكرر قاعدة. كل حكم من مصدره الواحد:
//   جاهزية الجهة ← orgReadinessOf (org-readiness.js، رأس ملف الجهة وشارة الصحة نفسيهما)
//   اكتمال المقاعد ← seatsFull (org-readiness.js، بند «العقد والمقاعد» نفسه)
//   جاهزية الدفعة ← cohortReadiness (cohort-readiness.js، ملف الدفعة وجدول الدفعات نفسيهما)
//   الدفعة بصيغة الكتاب لا تلزمها جلسات ← usesHandbook (cohort-setup.js)، والجلسة بلا دفعة تعمّ الدفعات (sessionsFor)
//   الخبير فوق طاقته ← expertLoad (insight.js، جدول «حِمل الخبراء» في الرؤية الشاملة)
//   ما ينتظر القرار ← بنود admin.inbox نفسها (inbox.js)، وعضوية الدفعة بقاعدة pickCohort (في today-desk.ts)
// المصدر المتعذر (skipped) لا يُسقط الرد: لا يُبنى منه تنبيه، وما يعتمد عليه في النبض يبقى مجهولًا (null) لا صفرًا.
import { orgReadinessOf, readinessSummary, seatsFull } from './org-readiness.js';
import { cohortKind, cohortReadiness, hubSummary } from './cohort-readiness.js';
import { SESSION_WINDOW_MS, usesHandbook, workshopOf } from './cohort-setup.js';
import { isRunning } from './cohort-running.js';

// نافذة «جلسة قادمة» للدفعة الجارية: نافذة الجلسات نفسها في cohort-setup.js (SESSION_WINDOW_MS، أربعة عشر يومًا)
const DAY = 864e5;
export const UPCOMING_DAYS = Math.round(SESSION_WINDOW_MS / DAY);
const isoDay = (now) => new Date(now).toISOString().slice(0, 10);

// المصادر بأسمائها كما تُعرض في سطر «تعذّرت قراءة»
export const SOURCE_AR = {
  orgs: 'الجهات', org_setups: 'جاهزية دفعات الجهات', programs: 'الدفعات والبرامج', inbox: 'صندوق القرارات', experts: 'حِمل الخبراء', sessions: 'الجلسات', members: 'أعضاء الدفعات',
};
// ما يقوم عليه كل نوع تنبيه: تعذّر أحدها لا يُقال معه «لا تنبيه» عن هذا النوع
export const ALERT_KINDS = {
  seats_full: { label: 'المقاعد ممتلئة', needs: ['orgs'] },
  cohort_no_session: { label: 'دفعة جارية بلا جلسة قريبة', needs: ['programs', 'sessions', 'members'] },
  expert_over: { label: 'خبير فوق طاقته', needs: ['experts'] },
  // جاهزية دفعات الجهات مصدر فرعي من الجهات (orgCohortSetups): تعذّرها يُبقي التنبيه بما قُرئ ويقول إن بند الدفعة لم يُفحص
  org_readiness: { label: 'جهة لم تكتمل جاهزيتها', needs: ['orgs', 'org_setups'] },
};
const SEVERITY_RANK = { bad: 0, warn: 1 };

// الدفعة الجارية بالتعريف الواحد (cohort-running.js، P10): حية وبدأت ولم تنتهِ بتاريخ UTC، وهو نفسه الذي تقفل به الأقفال
export { isRunning };

/**
 * أقرب جلسة مؤرخة قادمة للدفعة: ورشة تخصها (workshopOf، قاعدة sessionsFor نفسها)، أو جلسة توجيه محجوزة لأحد أعضائها.
 * وهذا أوسع عمدًا من بند «الجلسات» في جاهزية الدفعة (ورش فقط، وتُحسب فيه غير المؤرخة والحديثة): التنبيه يسأل «هل يلتقي
 * أحد من الدفعة بأحد قريبًا؟»، والبند يسأل «هل ضُبط جدول الورش؟»، فقد يظهر أحدهما دون الآخر. الجلسة الجارية الآن (بدأت ولم تنتهِ) قادمة كذلك. غير المؤرخة («يُحدد لاحقًا») لا تُحسب: لا موعد لها.
 * @param {{ id: string }} cohort
 * @param {{ workshops?: any[], coaching?: any[], members?: Set<string>|null, now?: number }} d
 * @returns {string|null} وقت البداية ISO
 */
export function nextSessionAt(cohort, { workshops = [], coaching = [], members = null, now = Date.now() } = {}) {
  const live = (s) => s.starts_at && Date.parse(s.ends_at || s.starts_at) >= now;
  const dates = [
    ...(workshops || []).filter((w) => workshopOf(cohort, w) && live(w)).map((w) => w.starts_at),
    ...(members ? (coaching || []).filter((s) => s.status !== 'cancelled' && members.has(s.participant_id) && live(s)).map((s) => s.starts_at) : []),
  ];
  return dates.length ? dates.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a)) : null;
}

const countAr = (n, one, two, many, single) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${many}` : `${n} ${single}`);

/**
 * مكتب اليوم من مصادره. كل مصدر قيمته أو null حين تعذّر (ويُسمّى في skipped).
 * @param {{
 *   orgs?: any[]|null,          // admin.orgs: صفوف الجهات بوصولها وحال دفعتها ومقاعدها المستهلكة
 *   programs?: { cohorts: any[], organizations: any[], programs: any[] }|null,   // admin.programs
 *   inbox?: { items: any[] }|null,                // admin.inbox
 *   experts?: any[]|null,                          // expertLoad
 *   sessions?: { workshops: any[], coaching: any[] }|null,
 *   members?: Record<string, string|null>|null,   // دفعة كل مشارك (pickCohort)، بلا حسابات العرض
 *   skipped?: string[], now?: number,
 * }} src
 */
export function deskOf(src = {}) {
  const now = src.now ?? Date.now();
  const skipped = [...new Set(src.skipped || [])];
  // المصدر الفرعي (org_setups) يُعرف بمصدره الأب ما لم يُسمَّ متعذرًا
  const SUB = { org_setups: 'orgs' };
  const has = (k) => !skipped.includes(k) && (SUB[k] ? has(SUB[k]) : src[k] != null);
  const alerts = [];

  // ── الجهات: المقاعد الممتلئة، ثم الجاهزية الناقصة بأسماء ما بقي ──
  if (has('orgs')) {
    for (const o of (src.orgs || []).filter((x) => x.status === 'active')) {
      const used = o.seats_used ?? null;
      // المستهلك المتعذر عدّه (seats_used فارغ) لا يُبنى عليه تنبيه: بند الجاهزية يقرؤه بعدد الأعضاء كما كان
      const full = used != null && seatsFull(o, used);
      if (full) {
        alerts.push({ kind: 'seats_full', severity: 'bad', id: `seats:${o.id}`, target: { tab: 'orgs', id: o.id },
          text: `مقاعد «${o.name}» ممتلئة (${used} من ${o.seats}): التسجيلات التالية تنتظر قرار الرعاية` });
      }
      const r = orgReadinessOf(o, isoDay(now));
      // بند «العقد والمقاعد» الناقص بامتلاء المقاعد وحده قاله تنبيه المقاعد، فلا يُكرر للجهة نفسها سطرًا ثانيًا
      const gaps = r.items.filter((x) => !x.ok && !(full && x.key === 'contract' && o.contract_ends && o.contract_ends >= isoDay(now)));
      if (gaps.length > 0) {
        alerts.push({ kind: 'org_readiness', severity: 'warn', id: `org:${o.id}`, target: { tab: 'orgs', id: o.id },
          text: `جهة «${o.name}» لم تكتمل جاهزيتها: ${readinessSummary({ missing: gaps.length, items: r.items })} (${gaps.map((x) => x.title).join('، ')})` });
      }
    }
  }

  // ── الدفعات الجارية ──
  const cohorts = has('programs') ? (src.programs.cohorts || []) : [];
  const running = cohorts.filter((c) => isRunning(c, now));
  const membersOf = {};
  if (has('members')) for (const [pid, cid] of Object.entries(src.members || {})) if (cid) (membersOf[cid] ||= new Set()).add(pid);
  const sessionsKnown = has('sessions') && has('members');
  const nextOf = (c) => (sessionsKnown ? nextSessionAt(c, { ...src.sessions, members: membersOf[c.id] || new Set(), now }) : null);
  const horizon = now + UPCOMING_DAYS * DAY;
  for (const c of running) {
    if (!sessionsKnown || usesHandbook(c)) continue;
    const next = nextOf(c);
    if (!next || Date.parse(next) > horizon) {
      alerts.push({ kind: 'cohort_no_session', severity: 'warn', id: `cohort:${c.id}`, target: { tab: 'programs', id: c.id },
        text: `دفعة «${c.name}» جارية ولا جلسة لها في الأيام الـ${UPCOMING_DAYS} القادمة${next ? `: أقربها ${isoDay(Date.parse(next))}` : ''}` });
    }
  }

  // ── الخبراء فوق طاقتهم: طلباتهم وجلساتهم القادمة أكثر من ساعاتهم الأسبوعية (expertLoad) ──
  if (has('experts')) {
    for (const e of (src.experts || []).filter((x) => x.state === 'over')) {
      alerts.push({ kind: 'expert_over', severity: 'warn', id: `expert:${e.id}`, target: { tab: 'experts', id: e.id },
        text: `«${e.name}» فوق طاقته: ${countAr(e.demand, 'إسناد واحد', 'إسنادان', 'إسنادات', 'إسنادًا')} و${countAr(e.hours, 'ساعة واحدة', 'ساعتان', 'ساعات', 'ساعة')} أسبوعيًا` });
    }
  }
  const order = Object.keys(ALERT_KINDS);
  alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || order.indexOf(a.kind) - order.indexOf(b.kind));

  // ── نبض الدفعات: سطر لكل دفعة جارية ──
  // ما ينتظر القرار لأعضاء الدفعة: بنود الصندوق عن مشارك (وثيقة المبادرة معرّفها المشارك نفسه، inbox.js)
  const waitingBy = {};
  const waitingKnown = has('inbox') && has('members');
  if (waitingKnown) {
    for (const i of src.inbox.items || []) {
      const pid = i.participant_id || (i.kind === 'capstone' ? i.id : null);
      const cid = pid ? src.members[pid] : null;
      if (cid) waitingBy[cid] = (waitingBy[cid] || 0) + 1;
    }
  }
  const orgName = Object.fromEntries((has('programs') ? src.programs.organizations || [] : []).map((o) => [o.id, o.name]));
  const pulse = running.map((c) => {
    const hub = cohortReadiness({ cohort: c, cohorts, orgs: src.programs.organizations || [], programs: src.programs.programs || [] });
    return {
      id: c.id, name: c.name, org: c.organization_id ? orgName[c.organization_id] || null : null, kind: cohortKind(c),
      starts_on: c.starts_on, ends_on: c.ends_on || null,
      readiness: { missing: hub.missing, total: hub.items.length, summary: hubSummary(hub) },
      next_at: nextOf(c), handbook: usesHandbook(c),
      waiting: waitingKnown ? waitingBy[c.id] || 0 : null,
    };
  }).sort((a, b) => b.readiness.missing - a.readiness.missing || String(a.next_at || '9').localeCompare(String(b.next_at || '9')));

  // أنواع التنبيه التي لم تُفحص لتعذّر مصدرها: تقولها الواجهة «لم تُفحص» لا «لا تنبيه»
  const unchecked = Object.entries(ALERT_KINDS).filter(([, d]) => d.needs.some((k) => !has(k))).map(([k]) => k);
  // صندوق قُرئ ناقصًا (نوع منه متعذر، أو بلغ حد قراءته: capped): أعداد «ينتظر قرارًا» أقل من الحقيقة، فتُعلَّم «على الأقل»
  const waiting_partial = waitingKnown && ((src.inbox.skipped || []).length > 0 || (src.inbox.capped || []).length > 0);
  return { success: true, alerts, pulse, pulse_known: has('programs'), skipped, unchecked, waiting_partial };
}
