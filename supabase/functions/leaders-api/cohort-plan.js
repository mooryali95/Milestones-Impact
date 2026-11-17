// ════════════════════════════════════════════════════════════════
// تحرير خطة الدفعة وأثره (R2a في تصور محرر رحلة الدفعة): منطق نقي بلا قاعدة ولا واجهة
// ════════════════════════════════════════════════════════════════
// يقرؤه الإجراء admin.cohort-plan (cohort-plan.ts) قبل الحفظ وتبويب «الرحلة» في اللوحة لمعاينته الحية، فتعديل المدة
// يُحسب في مكان واحد: planEdit يكتب الخطة الجديدة، وcohortPlan (stage-windows.js) يحسب تواريخها، وplanImpact يقول من
// يتأثر. لا حساب تاريخ هنا: كل تاريخ من cohortPlan وmilestoneDueInfo وmilestoneStatuses.
// تملك الدفعة المدة (days، R2a) والإيقاف (off، R2b)، و«حرّر التواريخ لتتبع المدد» للمثبت قديمًا، والتوازي (with وoffset،
// R3a): «تسير مع» مرحلة سابقة في المحور بإزاحة من بدايتها، تخطيطًا للتواريخ وحدها (القرار 6).
import {
  cohortPlan, PLAN_DAYS_MAX, PLAN_WITH_UNLOCKS, planDaysMin, planDaysOf, planDaysOnly, planOff, planOffKeys, planPinned, planRules, planSchedule,
  planWithOf, planWithRules,
} from './stage-windows.js';
import { addDays, cohortMilestones, daysBetween, distributeSchedule, lateNoticeAllowed, MILESTONE_GRACE_DAYS, milestoneDueInfo, milestoneStatuses } from './milestones.js';
import { stageRules, daysAr, durationAr, withPlacementIssue } from './journey.js';
import { latinDigits, plainInt } from './digits.js';
import { SYSTEM_REQUIREMENT_CODES } from './content-lock.js';

// الوحدات (القرار 9): أيام وأسابيع، والأسبوع 7 أيام. «أيام العمل» في R5
export const PLAN_UNITS = Object.freeze({ days: 1, weeks: 7 });
export const PLAN_UNIT_AR = Object.freeze({ days: 'أيام', weeks: 'أسابيع' });
export const PLAN_SOURCE_AR = Object.freeze({ program: 'من البرنامج', cohort: 'معدّلة لهذه الدفعة', pinned: 'مثبتة بتاريخ' });
// وحدة العرض الأنسب لمدة: أسابيع إن كانت أسابيع تامة، وإلا أيام
export const unitFor = (days) => (Number(days) > 0 && Number(days) % 7 === 0 ? 'weeks' : 'days');
export const planDurationAr = (d) => (Number(d) ? durationAr(d) || daysAr(d) : 'بلا مدة');

// مقارنة خطتين بلا اعتبار لترتيب المفاتيح: «لم يتغير شيء»، و«تغيّرت الخطة بعد آخر حفظ» قبل التراجع
const stable = (v) => (Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v);
export const sameSchedule = (a, b) => JSON.stringify(stable(a || {})) === JSON.stringify(stable(b || {}));

// ══ الإيقاف لهذه الدفعة (R2b، البند 4.6 والقرار 5) ══
// بوابات القبول: الملف وتحديد المستوى (ONBOARDING_GATE وGATE_CODE) واعتماده (AP-OK يحسمه النظام من اعتماد المستوى)
export const PLAN_GATE_STAGES = Object.freeze(['profile', 'assessment', 'approval']);
const SYSTEM_CODES = new Set(SYSTEM_REQUIREMENT_CODES);
/** لماذا لا تُوقف هذه المرحلة في الدفعة، أو null. المحمية: بوابات القبول، وكل مرحلة فيها بند يحسمه النظام (قياس أو 360 أو
 * مشروع أو تقرير أو حالة أو رضا). ومرجع «تبدأ مع» لمرحلة تعمل: «أوقف أولًا ما يسير معها أو انقله» (القرار 22).
 * أما مرحلة مذكورة في «بعد مراحل» لغيرها فلا تُمنع: تُعاد كتابة القاعدة (planRules) وتسميها نافذة الأثر
 * @param {any} stage @param {{ stages?: any[], requirements?: any[], schedule?: any }} o
 * schedule: الخطة كما ستُحفظ، فما يُوقف معها في التعديل نفسه لا يمنعها */
export function planOffBlock(stage, { stages = [], requirements = [], schedule = {} } = {}) {
  if (!stage) return null;
  const name = stage.title_ar || stage.key;
  if (PLAN_GATE_STAGES.includes(stage.key)) {
    return { code: 'protected', msg: `«${name}» من بوابات القبول، فلا تُوقف في دفعة: عليها يُبنى المسار وفتح ما بعدها` };
  }
  const sys = (requirements || []).filter((r) => r.active !== false && r.stage_key === stage.key && SYSTEM_CODES.has(r.code));
  if (sys.length) {
    return { code: 'protected', msg: `«${name}» فيها ${sys.map((r) => `«${r.title_ar || r.code}»`).join(' و')} يحسمه النظام (قياس أو تقرير أو 360 أو مشروع)، فإيقافها يفتح ما بعدها بلا قفله أو يكسر التقرير` };
  }
  const off = planOffKeys(schedule);
  // «تسير مع» الفعلية في الدفعة (R3a): من خطتها فوق قاعدة النسخة
  const eff = planWithRules((stages || []).filter((s) => !off.has(s.key) || s.key === stage.key), schedule);
  const riders = eff.filter((s) => s.key !== stage.key && s.active !== false && !off.has(s.key) && stageRules(s).unlock === 'with' && stageRules(s).with === stage.key);
  if (riders.length) {
    return { code: 'with_target', msg: `${riders.map((s) => `«${s.title_ar || s.key}»`).join(' و')} تبدأ مع «${name}»: أوقف أولًا ما يسير معها أو انقله` };
  }
  return null;
}

/** لماذا لا تعود هذه المرحلة الموقوفة في الخطة schedule (كما ستُحفظ)، أو null: «تبدأ مع» مرجعًا موقوفًا (القرار 22). بلا هذا
 * الحارس تعود وقاعدتها تُعاد كتابتها «بعد السابقة» بصمت (planRules)، وهي الحال التي يمنعها الحارس عند الإيقاف
 * @param {any} stage @param {{ stages?: any[], schedule?: any }} o */
export function planRestartBlock(stage, { stages = [], schedule = {} } = {}) {
  if (!stage) return null;
  // قاعدتها الفعلية في الدفعة (R3a)، والمرجع الموقوف حاضر في القائمة ليُعرف
  const r = stageRules(planWithRules(stages.some((s) => s.key === stage.key) ? stages : [...stages, stage], schedule).find((s) => s.key === stage.key) || stage);
  if (r.unlock !== 'with' || !r.with || !planOffKeys(schedule).has(r.with)) return null;
  const target = (stages || []).find((s) => s.key === r.with);
  const name = stage.title_ar || stage.key, tname = target?.title_ar || r.with;
  return { code: 'with_target_off', msg: `«${name}» تبدأ مع «${tname}» وهي موقوفة: أعد «${tname}» معها أو انقلها` };
}

/** المراحل الموقوفة لهذه الدفعة التي تصير محمية في نسخة أخرى (ترقية النسخة): بند يحسمه النظام أو بوابة قبول. الترقية تُمنع
 * بها، فلا يسقط من رحلة الأعضاء بند يحسمه النظام بصمت، ويعيدها المدير من تبويب «الرحلة» بأثرها ثم يرقّي
 * @param {{ stages?: any[], requirements?: any[], schedule?: any }} o @returns {string} نص المنع أو '' */
export function planUpgradeBlock({ stages = [], requirements = [], schedule = {} } = {}) {
  const off = planOffKeys(schedule);
  const msgs = (stages || []).filter((s) => s.active !== false && off.has(s.key)).map((s) => planOffBlock(s, { stages, requirements, schedule }))
    .filter((b) => b && b.code === 'protected').map((b) => b.msg);
  return msgs.length ? `${msgs.join('، و')}. وهي موقوفة لهذه الدفعة: أعدها من تبويب «الرحلة» ثم رقِّ النسخة` : '';
}

// ══ التوازي لهذه الدفعة (R3a، البند 4.6 والقرار 6) ══
// قاعدة الفتح بكلمات تُقرأ في سبب المنع
const UNLOCK_LOCK_AR = Object.freeze({ day: 'بيوم ثابت من بداية الدفعة', stages: 'بعد اكتمال مراحل محددة', always: 'متاحة من البداية', approval: 'بيد الأدمن أو الخبير' });
const sortOf = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);
/** لماذا لا تُضبط «تسير مع» لهذه المرحلة في دفعة، أو null: بوابات القبول (عليها يُبنى فتح ما بعدها)، وقاعدة فتح من البرنامج
 * غير «بعد ما قبلها» و«تبدأ مع» (قواعد الفتح للبرنامج وحده، القرار 2) @param {any} stage */
export function planWithLock(stage) {
  if (!stage) return null;
  const name = stage.title_ar || stage.key;
  if (PLAN_GATE_STAGES.includes(stage.key)) return { code: 'with_gate', msg: `«${name}» من بوابات القبول، فلا تسير مع غيرها في دفعة` };
  const r = stageRules(stage);
  if (!PLAN_WITH_UNLOCKS.includes(r.unlock)) {
    return { code: 'with_rule', msg: `«${name}» تُفتح ${UNLOCK_LOCK_AR[r.unlock] || 'بقاعدة خاصة'} (قاعدة البرنامج)، فلا تسير مع غيرها في دفعة` };
  }
  return null;
}
// المراحل الظاهرة العاملة في الخطة مرتبة، بقواعد التوازي الفعلية فيها
const liveWith = (stages, schedule) => {
  const off = planOffKeys(schedule);
  return planWithRules([...(stages || [])].filter((s) => s.active !== false && !off.has(s.key)).sort(sortOf), schedule);
};
/** المراجع المقبولة لـ«تسير مع» في الدفعة: ظاهرة تعمل قبلها في الترتيب من محورها، لا يفصلها عنها إلا من يسير معها
 * (withPlacementIssue نفسها التي يفحص بها البرنامج)، وليست بوابة قبول. قائمة البطاقة والحارس من هنا
 * @param {any[]} stages @param {any} schedule @param {string} key */
export function planWithCandidates(stages, schedule, key) {
  const live = liveWith(stages, schedule);
  const self = live.find((s) => s.key === key);
  if (!self || planWithLock(self)) return [];
  const idx = live.indexOf(self);
  return live.slice(0, idx).filter((s) => !PLAN_GATE_STAGES.includes(s.key) && !withPlacementIssue(live, self, s.key));
}
// أخطاء التوازي في خطة واحدة، بمفتاح المرحلة ورمز الخطأ والمرجع الذي يخصه، فمرجع آخر خاطئ بالرمز نفسه خطأ جديد
function withErrors(stages, schedule, cohort) {
  const out = new Map();
  const add = (stage, code, msg, ref = '') => { const id = `${stage}:${code}:${ref}`; if (!out.has(id)) out.set(id, { stage, code, msg }); };
  const sorted = [...(stages || [])].filter((s) => s.active !== false).sort(sortOf);
  const byKey = new Map(sorted.map((s) => [s.key, s]));
  const title = (k) => byKey.get(k)?.title_ar || k;
  const off = planOffKeys(schedule);
  const live = liveWith(sorted, schedule);
  const at = new Map(sorted.map((s, i) => [s.key, i]));
  const plan = cohortPlan(sorted, { ...(cohort || {}), schedule });
  for (const [k, e] of Object.entries(schedule && typeof schedule === 'object' ? schedule : {})) {
    const self = byKey.get(k);
    if (!self || off.has(k) || !e || typeof e !== 'object' || (!('with' in e) && !('offset' in e))) continue;
    const p = planWithOf(e);
    if ('with' in e && e.with !== undefined && p.with === undefined) { add(k, 'with_value', `«${title(k)}»: «تسير مع» مفتاح مرحلة أو لا شيء`); continue; }
    const lock = planWithLock(self);
    if (lock) { add(k, lock.code, lock.msg); continue; }
    if (typeof p.with === 'string') {
      const t = byKey.get(p.with);
      const name = title(p.with);
      if (!t) { add(k, 'with_unknown', `«${title(k)}» تسير مع مرحلة ليست في رحلة الدفعة (${p.with})`, p.with); continue; }
      if (p.with === k) { add(k, 'with_self', `«${title(k)}» لا تسير مع نفسها`, p.with); continue; }
      if (off.has(p.with)) { add(k, 'with_off', `«${title(k)}» تسير مع «${name}» وهي موقوفة لهذه الدفعة: أعدها أو اختر غيرها`, p.with); continue; }
      if (PLAN_GATE_STAGES.includes(p.with)) { add(k, 'with_gate', `«${name}» من بوابات القبول، فلا تسير معها مرحلة في دفعة`, p.with); continue; }
      // مرجع قبلها في الترتيب وحده، فلا حلقة: كل تابع يشير إلى ما سبقه
      if (!(at.get(p.with) < at.get(k))) { add(k, 'with_order', `«${name}» بعد «${title(k)}» في الترتيب، فلا تسير معها. اختر مرحلة قبلها`, p.with); continue; }
      const why = withPlacementIssue(live, live.find((s) => s.key === k) || self, p.with);
      if (why) { add(k, 'with_place', `«${title(k)}»: ${why}`, p.with); continue; }
    }
    if ('offset' in e && e.offset !== undefined && e.offset !== null && e.offset !== '') {
      if (p.offset === undefined) { add(k, 'offset_range', `إزاحة «${title(k)}» عدد أيام صحيح من 0 إلى ${PLAN_DAYS_MAX}`); continue; }
      const r = stageRules(live.find((s) => s.key === k) || self);
      if (r.unlock !== 'with' || !r.with) { add(k, 'offset_alone', `«${title(k)}» لا تسير مع مرحلة، فلا إزاحة لها`); continue; }
      // إزاحة الدفعة على مرجع النسخة: بوابة القبول لا يسير معها شيء في دفعة، بمرجع الدفعة أو بمرجع النسخة
      if (PLAN_GATE_STAGES.includes(r.with)) { add(k, 'with_gate', `«${title(r.with)}» من بوابات القبول، فلا تسير معها مرحلة في دفعة ولا إزاحة عليها`, r.with); continue; }
      const cap = Math.max(0, plan.byKey[r.with]?.days ?? 0);
      if (p.offset > cap) add(k, 'offset_range', `إزاحة «${title(k)}» من 0 إلى مدة «${title(r.with)}» (${cap ? daysAr(cap) : 'صفر'})`, r.with);
    }
  }
  // كل «تسير مع» فعلية صارت بلا موضع صالح بالخطة (مرحلة أُخرجت من مجموعة فصارت تفصل مرجعًا عن تابعه)
  for (const s of live) {
    const r = stageRules(s);
    if (r.unlock !== 'with' || !r.with || !live.some((x) => x.key === r.with)) continue;
    const why = withPlacementIssue(live, s, r.with);
    if (why) add(s.key, 'with_place', `«${title(s.key)}»: ${why}`, r.with);
  }
  return out;
}
/** أخطاء التوازي التي تحدثها الخطة الجديدة (schedule) ولم تكن في السابقة (before): ما كان قبلها (نسخة رُقّيت) لا يمنع تعديلًا
 * آخر، وما يحدثه التعديل يُرفض باسمه. يستعملها planEdit والتراجع على الخادم. touched: مراحل مس التعديل «تسير مع» أو
 * إزاحتها، فخطؤها يُرفض ولو كان قبله (التعديل لمسه فلم يصلحه)
 * @param {{ stages: any[], schedule: any, before?: any, cohort?: any, touched?: string[] }} o @returns {{ stage: string, code: string, msg: string }[]} */
export function planWithIssues({ stages = [], schedule = {}, before = null, cohort = {}, touched = [] }) {
  const now = withErrors(stages, schedule, cohort);
  const was = before ? withErrors(stages, before, cohort) : new Map();
  const mine = new Set(touched);
  return [...now.entries()].filter(([k, v]) => !was.has(k) || mine.has(v.stage)).map(([, v]) => v);
}

/** الخطة بعد تعديل المدير، وأسباب الرفض إن وُجدت.
 * with: { مفتاح: مفتاح مرجع، أو false لـ«لا شيء»، أو null لقاعدة البرنامج } (R3a). offset: { مفتاح: أيام من بداية المرجع، أو null }.
 *  ما يساوي قاعدة النسخة لا يُكتب، فلا يبقى فرق بلا أثر
 * @param {{ stages: any[], schedule?: any, edit?: { days?: Record<string, any>, follow?: boolean, off?: Record<string, any>, with?: Record<string, any>, offset?: Record<string, any> }, cohort?: any, requirements?: any[] }} o
 *  stages: مراحل تعريف الدفعة الظاهرة بمدد النسخة. days: { مفتاح: عدد أيام، أو null لـ«ارجع لمدة البرنامج» }.
 *  follow: «حرّر التواريخ لتتبع المدد»: كل مرحلة مثبتة تصير مدة بطولها الحالي فتتبع ما قبلها.
 *  off: { مفتاح: true لـ«أوقف لهذه الدفعة» أو false لإعادتها }. الإيقاف يبقي مدتها الخاصة إن كانت، فتعود بها بنقرة.
 *  requirements: بنود تعريف الدفعة، تُعرف منها المراحل المحمية (planOffBlock) */
export function planEdit({ stages = [], schedule = {}, edit = {}, cohort = {}, requirements = [] }) {
  const next = JSON.parse(JSON.stringify(schedule && typeof schedule === 'object' ? schedule : {}));
  const errors = [];
  const anchored = [];
  const byKey = new Map((stages || []).map((s) => [s.key, s]));
  const title = (k) => byKey.get(k)?.title_ar || k;
  const setDays = (k, d) => {
    const s = byKey.get(k);
    const e = { ...(next[k] || {}) };
    delete e.days;
    if (d != null && d !== (Math.round(Number(s.duration_days) || 0))) e.days = d;
    if (Object.keys(e).length) next[k] = e; else delete next[k];
  };
  if (edit.follow) {
    // كل مرحلة مثبتة تصير مدة بطولها الحالي فتتبع ما قبلها. ذلك لا يحرك تاريخًا إلا إن كانت تبدأ في اليوم التالي لنهاية
    // ما قبلها: بين المثبتة وما قبلها فجوة أو تداخل (جدول «وزّع» القديم أو يدوي) تبقى بدايتها مرساة وتُحرر نهايتها وحدها
    // (مدة بطولها)، فلا يتحرك تاريخ أي مرحلة بالتحرير. ما بقي مرساة يُسمّى في anchored
    const plan = cohortPlan(stages, { ...cohort, schedule: next });
    const same = (a, b) => (a?.from || null) === (b?.from || null) && (a?.to || null) === (b?.to || null);
    for (const s of stages) {
      const e = next[s.key];
      if (!planPinned(e)) continue;
      const row = plan.byKey[s.key];
      const { start, end, ...rest } = e;
      const keep = JSON.parse(JSON.stringify(next));
      next[s.key] = rest;
      setDays(s.key, row?.from ? row.days : planDaysOf(e) ?? null);
      if (!row?.from) continue;
      const now = cohortPlan(stages, { ...cohort, schedule: next });
      const moved = stages.some((x) => !same(now.byKey[x.key], plan.byKey[x.key]));
      if (!moved) continue;
      // البداية تبقى مرساة (من الخطة الحالية)، والمدة بطولها، فلا تثبت النهاية ولا يتحرك شيء
      Object.keys(next).forEach((k) => delete next[k]);
      Object.assign(next, keep);
      const { end: _e, days: _d, ...anchor } = keep[s.key];
      next[s.key] = { ...anchor, start: row.from, days: row.days };
      if (row.days === Math.round(Number(byKey.get(s.key)?.duration_days) || 0)) delete next[s.key].days;
      anchored.push(s.key);
    }
  }
  for (const [k, raw] of Object.entries(edit.days && typeof edit.days === 'object' ? edit.days : {})) {
    const s = byKey.get(k);
    if (!s) { errors.push({ stage: k, code: 'unknown', msg: `«${k}» ليست من مراحل رحلة الدفعة الظاهرة` }); continue; }
    if (raw === null || raw === '') { setDays(k, null); continue; }
    const n = Number(latinDigits(raw));
    const min = planDaysMin(s);
    if (!Number.isInteger(n) || n < min || n > PLAN_DAYS_MAX) {
      errors.push({ stage: k, code: 'range', msg: `مدة «${title(k)}» من ${min} إلى ${PLAN_DAYS_MAX} يومًا${min ? '، لأنها إلزامية' : ''}` });
      continue;
    }
    const e = next[k];
    if (e && ISO_PAIR(e)) {
      errors.push({ stage: k, code: 'pinned', msg: `«${title(k)}» مثبتة بتاريخين، فلا تتبع مدتها. حرّر التواريخ لتتبع المدد أولًا` });
      continue;
    }
    setDays(k, n);
  }
  // التوازي (R3a): المرجع ثم الإزاحة، وما يساوي قاعدة النسخة يُحذف من الخطة
  const put = (k, e) => { if (Object.keys(e).length) next[k] = e; else delete next[k]; };
  const withEdit = edit.with && typeof edit.with === 'object' ? edit.with : {};
  const offsetEdit = edit.offset && typeof edit.offset === 'object' ? edit.offset : {};
  for (const [k, v] of Object.entries(withEdit)) {
    const s = byKey.get(k);
    if (!s) { errors.push({ stage: k, code: 'unknown', msg: `«${k}» ليست من مراحل رحلة الدفعة الظاهرة` }); continue; }
    const r = stageRules(s);
    const prog = r.unlock === 'with' ? r.with : null;
    const e = { ...(next[k] || {}) };
    delete e.with;
    if (!(k in offsetEdit)) delete e.offset;
    if (v === null || v === undefined) { put(k, e); continue; }
    if (v === false || v === '') { if (prog) e.with = false; delete e.offset; put(k, e); continue; }
    if (typeof v !== 'string') { errors.push({ stage: k, code: 'with_value', msg: `«${title(k)}»: «تسير مع» مفتاح مرحلة أو لا شيء` }); continue; }
    if (v !== prog) e.with = v;
    put(k, e);
  }
  for (const [k, raw] of Object.entries(offsetEdit)) {
    const s = byKey.get(k);
    if (!s) { errors.push({ stage: k, code: 'unknown', msg: `«${k}» ليست من مراحل رحلة الدفعة الظاهرة` }); continue; }
    const r = stageRules(s);
    const e = { ...(next[k] || {}) };
    delete e.offset;
    if (raw !== null && raw !== '') {
      const n = plainInt(raw);
      if (!Number.isInteger(n) || n < 0 || n > PLAN_DAYS_MAX) { errors.push({ stage: k, code: 'offset_range', msg: `إزاحة «${title(k)}» عدد أيام صحيح من 0 إلى ${PLAN_DAYS_MAX}` }); continue; }
      if (e.with === false) { errors.push({ stage: k, code: 'offset_alone', msg: `«${title(k)}» لا تسير مع مرحلة، فلا إزاحة لها` }); continue; }
      // مرجع النسخة نفسه: إزاحة النسخة لا تُكتب. ومرجع الدفعة: الصفر هو الافتراضي فلا يُكتب
      const same = e.with === undefined ? n === r.offset : n === 0;
      if (!same) e.offset = n;
    }
    put(k, e);
  }
  // الإيقاف والإعادة، ثم الحراس على الخطة كما ستُحفظ: ما يُوقف مع مرجعه في التعديل نفسه لا يمنعه
  const offEdit = edit.off && typeof edit.off === 'object' ? edit.off : {};
  const stopping = [];
  for (const [k, raw] of Object.entries(offEdit)) {
    const s = byKey.get(k);
    if (!s) { errors.push({ stage: k, code: 'unknown', msg: `«${k}» ليست من مراحل رحلة الدفعة الظاهرة` }); continue; }
    if (raw !== true && raw !== false) { errors.push({ stage: k, code: 'off_value', msg: `إيقاف «${title(k)}» بنعم أو لا` }); continue; }
    const e = { ...(next[k] || {}) };
    if (raw) { if (!planOff(e)) stopping.push(k); e.off = true; } else delete e.off;
    if (Object.keys(e).length) next[k] = e; else delete next[k];
  }
  for (const k of stopping) {
    const block = planOffBlock(byKey.get(k), { stages, requirements, schedule: next });
    if (block) errors.push({ stage: k, code: block.code, msg: block.msg });
  }
  // الإعادة: مرحلة «تبدأ مع» مرجعًا يبقى موقوفًا لا تعود وحدها (القرار 22)، كما لا يُوقف مرجع يسير معه غيره
  for (const [k, raw] of Object.entries(offEdit)) {
    if (raw !== false || !byKey.has(k) || !planOff(schedule?.[k])) continue;
    const block = planRestartBlock(byKey.get(k), { stages, schedule: next });
    if (block) errors.push({ stage: k, code: block.code, msg: block.msg });
  }
  // حارس التوازي على الخطة كما ستُحفظ (البند 4.6): المرجع سابق في المحور يعمل، والإزاحة من 0 إلى مدته. يُفحص بعد المدد
  // والإيقاف، فتقصير المرجع تحت الإزاحة أو إيقاف ما بين المرجع وتابعه يُرفض أيضًا
  const seen = new Set(errors.map((x) => `${x.stage}:${x.code}`));
  // ما أعاده التعديل إلى قاعدة البرنامج (null) لا يُحسب لمسًا: خطأ قاعدة النسخة ليس من الدفعة
  const touched = [...Object.entries(withEdit), ...Object.entries(offsetEdit)].filter(([, v]) => v !== null && v !== undefined).map(([k]) => k);
  for (const x of planWithIssues({ stages, schedule: next, before: schedule, cohort, touched })) if (!seen.has(`${x.stage}:${x.code}`)) errors.push(x);
  return { schedule: next, errors, anchored, changed: !sameSchedule(schedule, next) };
}
const ISO_PAIR = (e) => /^\d{4}-\d{2}-\d{2}$/.test(e.start || '') && /^\d{4}-\d{2}-\d{2}$/.test(e.end || '');

// «اقترح مددًا تملأ مدة الدفعة» (كان «وزّع على مدة الدفعة»): التوزيع النسبي نفسه (distributeSchedule) لكن مددًا لا تواريخ،
// فتبقى الخطة نسبية ويتبع ما بعد كل مرحلة مدتها. يقترح للإلزامية وحدها، والاختيارية وعند الطلب تبقى بمدتها. وcohortPlan
// يضع كل مجموعة بعد سابقتها، الاختيارية منها أيضًا، فما تأخذه غير الإلزامية من المسار يُطرح من مدة الدفعة قبل التوزيع،
// ويُتحقق بcohortPlan نفسه أن الرحلة تنتهي يوم نهاية الدفعة. schedule: خطة الدفعة الحالية (مددها وحدها تُقرأ هنا)
export function suggestDays(stages, startsOn, endsOn, schedule = {}) {
  // الموقوفة لهذه الدفعة لا تأخذ من مدتها شيئًا (R2b)
  const off = planOffKeys(schedule);
  // والتوازي الخاص بالدفعة (R3a): المجموعات وإزاحاتها من خطتها، فيقترح التوزيع ما ترسمه الخطة
  const live = planWithRules((stages || []).filter((s) => s.active !== false && !off.has(s.key)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), schedule);
  const required = live.filter((s) => stageRules(s).mode === 'required');
  const own = planDaysOnly(schedule);
  const daysFor = (end) => {
    const d = distributeSchedule(live, startsOn, end);
    const out = {};
    for (const s of required) if (d[s.key]) out[s.key] = daysBetween(d[s.key].start, d[s.key].end) + 1;
    return out;
  };
  let out = daysFor(endsOn);
  if (!required.length || !Object.keys(out).length) return out;
  // التصحيح في الاتجاهين: الزيادة تقصّر الهدف، والنقص يمده. النقص يأتي من الإزاحة: distributeSchedule يحسبها من نصيب
  // المجموعة فتتسع معه، وcohortPlan يبقيها أيامًا ثابتة، فتابع يتجاوز مرجعه بإزاحته تقصر مجموعته عما افتُرض (R3a)
  let reserve = 0, best = null;
  for (let i = 0; i < 6; i += 1) {
    const sched = { ...own };
    for (const [k, n] of Object.entries(out)) sched[k] = { days: n };
    const p = cohortPlan(live, { starts_on: startsOn, ends_on: endsOn, schedule: sched });
    const diff = p.end ? daysBetween(endsOn, p.end) : 0;
    // أقرب اقتراح، والتساوي للأقصر فلا تتجاوز الرحلة نهاية الدفعة إلا مضطرة
    if (!best || Math.abs(diff) < Math.abs(best.diff) || (Math.abs(diff) === Math.abs(best.diff) && diff < best.diff)) best = { out, diff };
    if (!diff) break;
    const next = reserve + diff;
    // لا يتسع ما بقي للإلزامية بيوم لكل منها: يبقى أقرب اقتراح، وتنبيه «تنتهي الرحلة بعد نهاية الدفعة» يقول الفرق
    if (daysBetween(startsOn, endsOn) + 1 - next < required.length) break;
    reserve = next;
    out = daysFor(addDays(endsOn, -reserve));
  }
  return best ? best.out : out;
}

// لماذا لا تُحفظ خطة هذه الدفعة، أو '' (البند 4.5 والقرار 21)
export function planLock(cohort) {
  const c = cohort || {};
  if (c.status === 'closed') return { code: 'cohort_closed', msg: 'الدفعة مغلقة: خطتها للقراءة فقط.' };
  if (c.is_default && !c.program_version_id) {
    return { code: 'open_unpinned', msg: 'الدفعة المفتوحة يدخلها كل من ليس في دفعة، فأي تعديل في خطتها يمس الجميع. لا تُعدَّل قبل تثبيتها على نسخة من برنامجها: ثبّتها من ملفها أولًا.' };
  }
  return null;
}

const windowsFor = (stages, cohort) => (cohort?.starts_on && !cohort?.is_default ? cohortPlan(stages, cohort).windows : null);

/** أثر تعديل الخطة قبل الحفظ (نافذة الأثر، البند 4.2 هـ): ما تغيّر سطرًا سطرًا، ومن يقف في كل مرحلة تغيّرت، والمعالم
 * التي يتغير موعدها أو تنقلب متأخرة أو تُستبعد بالإيقاف، وبريد «معلم متأخر» الذي يمنعه الحارس.
 * people: [{ id, at, stagesDone, records, open, after }] من رحلة كل عضو كما يراها (journeyFor)، أو null إن لم تُحسب.
 *   at: موضعه الآن، وstagesDone: ما أكمل (منهما يُعرف من تجاوز مرحلة تعود)، وopen: مراحل ليست مقفلة عليه الآن، وafter: حالة كل مرحلة عليه بالخطة الجديدة (تُحسب حين يُعاد تشغيل مرحلة فقط)
 * booked: { مفتاح مرحلة: عدد جلسات التوجيه المحجوزة القادمة فيها } لما يُوقف (تحذير لا منع، البند 4.6)
 * @param {{ stages: any[], before?: any, after?: any, cohort?: any, milestones?: any[], people?: any[]|null, today?: any, cutoff?: string, booked?: Record<string, number> }} o */
export function planImpact({ stages = [], before = {}, after = {}, cohort = {}, milestones = [], people = null, today = null, cutoff = undefined, booked = {} }) {
  const c0 = { ...cohort, schedule: before || {} };
  const c1 = { ...cohort, schedule: after || {} };
  const p0 = cohortPlan(stages, c0), p1 = cohortPlan(stages, c1);
  const titleOf = new Map(stages.map((s) => [s.key, s.title_ar || s.key]));
  const changes = stages.map((s) => {
    const a = p0.byKey[s.key], b = p1.byKey[s.key];
    if (!a || !b) return null;
    const side = (x) => ({ days: x.days, from: x.from, to: x.to, source: x.source, off: !!x.off, with: x.with || null, with_title: x.with ? titleOf.get(x.with) || x.with : null, offset: x.offset || 0 });
    // الإيقاف والإعادة سطر واحد بلا مقارنة تواريخ: الموقوفة لا نافذة لها
    if (!!a.off !== !!b.off) return { key: s.key, title: titleOf.get(s.key), before: side(a), after: side(b), days_changed: false, off: b.off ? 'stop' : 'start' };
    const parChanged = (a.with || null) !== (b.with || null) || (a.offset || 0) !== (b.offset || 0);
    if (a.off || (a.days === b.days && a.from === b.from && a.to === b.to && !parChanged)) return null;
    return { key: s.key, title: titleOf.get(s.key), before: side(a), after: side(b), days_changed: a.days !== b.days, with_changed: parChanged };
  }).filter(Boolean);
  const stopped = changes.filter((x) => x.off === 'stop').map((x) => x.key);
  const started = changes.filter((x) => x.off === 'start').map((x) => x.key);
  const shift = p0.end && p1.end ? daysBetween(p0.end, p1.end) : 0;
  // «تُفتح يوم N» لا تتبع المدد (القرار 20): تُسمّى صراحة إن تحركت نافذتها
  const dayRules = changes.filter((x) => !x.off && stageRules(stages.find((s) => s.key === x.key)).unlock === 'day').map((x) => x.title);
  // «بعد مراحل» تنتظر موقوفة: يُحذف شرطها في هذه الدفعة (القرار 22)، وتُسمّى هنا ما صار فتحها لا ينتظرها
  const rewritesOf = (sched) => {
    const off = planOffKeys(sched);
    return planRules(stages.filter((s) => !off.has(s.key)), off).rewrites;
  };
  const r0 = new Map(rewritesOf(before).map((x) => [x.key, x]));
  const rewrites = rewritesOf(after).filter((x) => {
    const was = r0.get(x.key);
    return !was || x.dropped.some((k) => !was.dropped.includes(k));
  }).map((x) => ({ ...x, dropped_titles: x.dropped.map((k) => titleOf.get(k) || k) }));
  const w0 = windowsFor(stages, c0), w1 = windowsFor(stages, c1);
  // المعالم التي تسري قبل وبعد: معالم الموقوفة تُستبعد (cohortMilestones، القرار 15)، ومعالم المعادة ترجع
  const live = (milestones || []).filter((m) => m.active !== false);
  const in0 = new Set(cohortMilestones(live, c0).map((m) => m.id)), in1 = new Set(cohortMilestones(live, c1).map((m) => m.id));
  // الخطة كما تقرؤها المعالم (planSchedule): المفتوحة بلا تواريخ مثبتة، كما في milestoneStatuses
  const ctx = (w, cc) => ({ startsOn: cohort.starts_on || null, endsOn: cohort.ends_on || null, schedule: planSchedule(cc), windows: w });
  const moved = live.filter((m) => in0.has(m.id) && in1.has(m.id)).map((m) => {
    const a = milestoneDueInfo(m, ctx(w0, c0)).due, b = milestoneDueInfo(m, ctx(w1, c1)).due;
    return a === b ? null : { id: m.id, title: m.title_ar, before: a, after: b };
  }).filter(Boolean);
  const excluded = live.filter((m) => in0.has(m.id) && !in1.has(m.id)).map((m) => ({ id: m.id, title: m.title_ar, stage: m.stage_key }));
  const restored = live.filter((m) => !in0.has(m.id) && in1.has(m.id)).map((m) => ({ id: m.id, title: m.title_ar, stage: m.stage_key, after: milestoneDueInfo(m, ctx(w1, c1)).due }));

  let who = null, late = null, mail = null, moving = null, reenabled = null, notify = null;
  if (Array.isArray(people)) {
    const here = {};
    let flips = 0, held = 0, cleared = 0;
    const flipped = new Set();
    const t = today ? String(new Date(today).toISOString()).slice(0, 10) : undefined;
    for (const p of people) {
      // كل مرحلة جارية عليه (ats من currentStages)، فمن يسير في مرحلتين معًا يُعدّ في كل منهما كما في الخريطة (R3b)
      for (const k of p.ats || (p.at ? [p.at] : [])) here[k] = (here[k] || 0) + 1;
      if (!live.length) continue;
      const o = { stagesDone: p.stagesDone instanceof Set ? p.stagesDone : new Set(p.stagesDone || []), records: p.records || {}, stages, today: t };
      const s0 = new Map(milestoneStatuses(live, { ...o, cohort: c0 }).map((m) => [m.id, m]));
      for (const m of milestoneStatuses(live, { ...o, cohort: c1 })) {
        const was = s0.get(m.id);
        if (m.status === 'late' && was?.status !== 'late') { flips += 1; flipped.add(p.id); }
        if (was?.status === 'late' && m.status !== 'late') cleared += 1;
        // بريد كان سيُرسل في التشغيلة التالية بلا حارس الخطة: صار متأخرًا فوق المهلة بهذا التعديل. موعده قبل يوم الحفظ
        // دائمًا، فيمنعه الحارس (يوم آخر حفظ للخطة في lateMilestoneNotices)، ويبقى ظاهرًا متأخرًا في الرحلة واللوحة
        if (lateNoticeAllowed(m, MILESTONE_GRACE_DAYS, cutoff) && !(was && lateNoticeAllowed(was, MILESTONE_GRACE_DAYS, cutoff))) held += 1;
      }
    }
    who = { total: people.length, by_stage: changes.filter((x) => !x.off).map((x) => ({ key: x.key, title: x.title, here: here[x.key] || 0 })).filter((x) => x.here > 0) };
    // من يقف الآن في مرحلة تُوقف: ينتقل إلى ما بعدها، وما أنجزه فيها محفوظ (البند 4.5، القاعدة 2)
    moving = stopped.map((k) => ({ key: k, title: titleOf.get(k), here: here[k] || 0 }));
    late = { milestones: flips, people: flipped.size, cleared };
    mail = { send: 0, held };
    // إعادة تشغيل مرحلة تجاوزها مشاركون وهي موقوفة (القرار 12): من فُتحت له مرحلة بعدها، وتصير هي نشطة عليه بالخطة الجديدة
    const order = new Map([...stages].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map((s, i) => [s.key, i]));
    reenabled = started.map((k) => {
      // «تجاوزها» بالتقدم لا بما ليس مقفلًا: موضعه الآن بعدها، أو أكمل مرحلة بعدها. فالقادم الجديد في الملف لا يُعد وإن
      // فُتحت مرحلة لاحقة بلا شرط تقدم (دائمًا أو يوم ثابت)، فلا يُعفى من مرحلة لم يصلها
      const ko = order.get(k) ?? 1e9;
      const later = (x) => (order.get(x) ?? -1) > ko;
      const ids = people.filter((p) => p.after && p.after[k] === 'active'
        && ((p.at && later(p.at)) || [...(p.stagesDone || [])].some(later))).map((p) => p.id);
      return { key: k, title: titleOf.get(k), passed: ids.length, ids };
    });
    // «أبلغ المشاركين» (القرار 13): من في الرحلة ولم ينهها
    notify = { members: people.filter((p) => p.at).length };
  }
  const bookedRows = stopped.map((k) => ({ key: k, title: titleOf.get(k), sessions: Number(booked?.[k]) || 0 })).filter((x) => x.sessions > 0);
  return {
    changes, stopped, started, end: { before: p0.end, after: p1.end, shift }, total: { before: p0.total_days, after: p1.total_days },
    day_rules: dayRules, rewrites, milestones: moved, excluded, restored, people: who, moving, reenabled, booked: bookedRows, late, mail, notify, issues: p1.issues,
    open: cohort.is_default ? { members: Array.isArray(people) ? people.length : null } : null,
  };
}

// سطور نافذة الأثر بالعربية، من planImpact وحده، فتقول اللوحة ما يقوله الخادم بالكلمات نفسها
export const peopleAr = (n) => (n === 1 ? 'مشارك واحد' : n === 2 ? 'مشاركان' : n <= 10 ? `${n} مشاركين` : `${n} مشاركًا`);
const msAr = (n) => (n === 1 ? 'معلم واحد' : n === 2 ? 'معلمان' : n <= 10 ? `${n} معالم` : `${n} معلمًا`);
const msgAr = (n) => (n === 1 ? 'رسالة واحدة' : n === 2 ? 'رسالتان' : n <= 10 ? `${n} رسائل` : `${n} رسالة`);
const sessionsAr = (n) => (n === 1 ? 'جلسة واحدة محجوزة' : n === 2 ? 'جلستان محجوزتان' : n <= 10 ? `${n} جلسات محجوزة` : `${n} جلسة محجوزة`);
/** opts.notify: «أبلغ المشاركين» مختار في نافذة الحفظ (القرار 13)، فيقول سطر البريد ما سيصل ومن يصله
 * @param {any} impact @param {(d: string) => string} [fmt] @param {{ notify?: boolean }} [opts] */
export function impactLines(impact, fmt = (d) => d, { notify = false } = {}) {
  if (!impact) return [];
  const out = [];
  for (const x of impact.changes) {
    if (x.off === 'stop') { out.push({ key: `c-${x.key}`, kind: 'change', off: 'stop', text: `${x.title}: تُوقف لهذه الدفعة، فلا تأخذ من الرحلة وقتًا ويُزاح ما بعدها` }); continue; }
    if (x.off === 'start') {
      const when = x.after.from ? `، ${x.after.from === x.after.to ? fmt(x.after.from) : `من ${fmt(x.after.from)} إلى ${fmt(x.after.to)}`}` : '';
      out.push({ key: `c-${x.key}`, kind: 'change', off: 'start', text: `${x.title}: تعود إلى رحلة هذه الدفعة بمدة ${planDurationAr(x.after.days)}${when}` });
      continue;
    }
    const par = x.with_changed ? withChangeAr(x) : '';
    const dur = x.days_changed ? `${planDurationAr(x.before.days)} إلى ${planDurationAr(x.after.days)}` : par ? '' : 'بمدتها نفسها';
    const lead = [par, dur].filter(Boolean).join('، ومدتها ');
    const when = x.after.from ? `${x.days_changed || par ? '، فتصير' : '، وتصير'} ${x.after.from === x.after.to ? fmt(x.after.from) : `من ${fmt(x.after.from)} إلى ${fmt(x.after.to)}`}` : '';
    out.push({ key: `c-${x.key}`, kind: 'change', text: `${x.title}: ${lead}${when}` });
  }
  // التوازي (R3a والقرار 6): متى تُفتح لأصحابها، والإزاحة تخطيط للتواريخ وحدها لا تقفل حتى موعدها
  for (const x of impact.changes.filter((c) => c.with_changed && !c.off)) {
    const b = x.after, a = x.before;
    if ((a.with || null) === (b.with || null) && !b.offset) continue;
    const open = b.with ? `«${x.title}» تُفتح لأصحابها مع بداية «${b.with_title}»` : `«${x.title}» تُفتح لأصحابها بعد اكتمال الإلزامية قبلها`;
    out.push({ key: `par-${x.key}`, kind: 'note', text: b.with && b.offset ? `${open}، والإزاحة تخطيط للتواريخ وحدها فلا تقفلها حتى موعدها المخطط` : open });
  }
  const sh = impact.end.shift;
  if (sh) out.push({ key: 'end', kind: 'end', text: `${sh > 0 ? 'تتأخر' : 'تتقدم'} نهاية الرحلة ${daysAr(Math.abs(sh))}${impact.end.after ? `، فتنتهي ${fmt(impact.end.after)}` : ''}` });
  if (impact.day_rules.length) out.push({ key: 'day', kind: 'note', text: `${impact.day_rules.map((t) => `«${t}»`).join(' و')} تُفتح بيوم ثابت من بداية الدفعة (قاعدة البرنامج)، فلا يتحرك فتحها مع المدد` });
  // القرار 22: ما كان ينتظر الموقوفة بشرط «بعد مراحل» يُفتح في هذه الدفعة بلا انتظارها
  for (const r of impact.rewrites || []) {
    const names = r.dropped_titles.map((t) => `«${t}»`).join(' و');
    out.push({ key: `rw-${r.key}`, kind: 'note', text: r.rule === 'with'
      ? `«${r.title}» كانت تبدأ مع ${names}، فصارت في هذه الدفعة تُفتح بعد ما قبلها`
      : `«${r.title}» كانت تُفتح بعد اكتمال ${names}، فصار فتحها في هذه الدفعة لا ينتظرها${r.to === 'previous' ? ' (تُفتح بعد ما قبلها)' : ''}` });
  }
  if (impact.open) out.push({ key: 'open', kind: 'warn', text: `الدفعة المفتوحة: يمس التعديل ${impact.open.members == null ? 'كل من ليس في دفعة' : `${peopleAr(impact.open.members)} ليسوا في دفعة`}، والمدد نسبية من دخول كل منهم` });
  // من يقف الآن في مرحلة تُوقف (البند 4.5، القاعدة 2)
  for (const m of impact.moving || []) {
    out.push({ key: `mv-${m.key}`, kind: 'people', text: m.here ? `${peopleAr(m.here)} في «${m.title}» الآن ${m.here === 1 ? 'ينتقل' : m.here === 2 ? 'ينتقلان' : 'ينتقلون'} إلى ما بعدها، ${m.here === 1 ? 'وما أنجزه' : m.here === 2 ? 'وما أنجزاه' : 'وما أنجزوه'} فيها محفوظ ويعود إن أُعيد تشغيلها` : `لا أحد في «${m.title}» الآن` });
  }
  for (const r of impact.reenabled || []) {
    if (r.passed) out.push({ key: `re-${r.key}`, kind: 'reenable', stage: r.key, passed: r.passed, text: `${peopleAr(r.passed)} ${r.passed === 1 ? 'تجاوز' : r.passed === 2 ? 'تجاوزا' : 'تجاوزوا'} «${r.title}» وهي موقوفة، وإعادتها تجعلها نشطة عليهم وقد تقفل ما بعدها` });
  }
  for (const b of impact.booked || []) out.push({ key: `bk-${b.key}`, kind: 'warn', text: `${sessionsAr(b.sessions)} في «${b.title}» ستُحجب عن أصحابها ما دامت موقوفة` });
  if (impact.people) {
    const by = impact.people.by_stage;
    // بصيغة التصور (4.2 هـ): «12 مشاركًا في التدريب الآن، و3 في التوجيه». المراحل هنا كل ما تتغير مواعيده، لا ما تغيّرت مدته وحده
    if (by.length || !(impact.moving || []).length) {
      out.push({ key: 'people', kind: 'people', text: by.length
        ? `في المراحل التي تتغير مواعيدها: ${by.map((x, i) => (i ? `${x.here} في ${x.title}` : `${peopleAr(x.here)} في ${x.title} الآن`)).join('، و')}`
        : 'لا أحد الآن في المراحل التي تتغير مواعيدها' });
    }
  } else out.push({ key: 'people', kind: 'note', text: 'لم يُحسب أثره على كل عضو (الدفعة أكبر من أن تُحسب هنا). المعالم والمواعيد تتبع الخطة الجديدة' });
  out.push({ key: 'ms', kind: impact.milestones.length ? 'ms' : 'note', text: impact.milestones.length ? `${msAr(impact.milestones.length)} ${impact.milestones.length === 1 ? 'يتغير موعده' : impact.milestones.length === 2 ? 'يتغير موعدهما' : 'تتغير مواعيدها'}` : 'لا يتغير موعد أي معلم' });
  // القرار 15: معالم الموقوفة تُستبعد من الدفعة ومن درجة المعالم، ولا تُحذف من البرنامج
  if ((impact.excluded || []).length) {
    const n = impact.excluded.length;
    out.push({ key: 'excl', kind: 'ms', text: `${msAr(n)} للمراحل الموقوفة ${n === 1 ? 'يُستبعد' : n === 2 ? 'يُستبعدان' : 'تُستبعد'} من هذه الدفعة ومن درجة المعالم: ${impact.excluded.map((m) => `«${m.title}»`).join(' و')}، ولا ${n === 1 ? 'يُحذف' : 'تُحذف'} من البرنامج` });
  }
  if ((impact.restored || []).length) {
    const n = impact.restored.length;
    out.push({ key: 'rest', kind: 'ms', text: `${n === 1 ? 'يعود' : 'تعود'} ${msAr(n)} للمراحل المعادة: ${impact.restored.map((m) => `«${m.title}»${m.after ? ` (${fmt(m.after)})` : ''}`).join(' و')}` });
  }
  if (impact.late) {
    if (impact.late.milestones) out.push({ key: 'late', kind: 'warn', text: `${msAr(impact.late.milestones)} ${impact.late.milestones === 1 ? 'يصير متأخرًا' : impact.late.milestones === 2 ? 'يصيران متأخرين' : 'تصير متأخرة'} على أصحابها (عدد من يتأثر: ${impact.late.people})` });
    if (impact.late.cleared) out.push({ key: 'cleared', kind: 'ok', text: `ويعود في الموعد ما كان متأخرًا: ${msAr(impact.late.cleared)}` });
  }
  const held = impact.mail?.held ? ` ${msgAr(impact.mail.held)} «معلم متأخر» عن مواعيد صارت في الماضي تُحجب بحارس البريد.` : '';
  if (notify && impact.notify?.members) {
    out.push({ key: 'mail', kind: 'mail', text: `البريد: يصل ${peopleAr(impact.notify.members)} في الرحلة إشعار «تغيّرت مواعيد رحلتك» في ملفه وبريده.${held} والتذكيرات تُحسب من المواعيد الجديدة` });
  } else {
    out.push({ key: 'mail', kind: 'mail', text: impact.mail?.held
      ? `البريد: لن يُرسل شيء الآن.${held} والتذكيرات تُحسب من المواعيد الجديدة`
      : 'البريد: لن يُرسل شيء الآن، والتذكيرات تُحسب من المواعيد الجديدة' });
  }
  return out;
}

// سطر التوازي في نافذة الأثر: المرجع والإزاحة قبل وبعد
const startAr = (n) => (n ? `بعد ${daysAr(n)} من بدايتها` : 'من بدايتها');
function withChangeAr(x) {
  const a = x.before, b = x.after;
  if (!b.with) return `لم تعد تسير مع «${a.with_title}»، فتبدأ بعد ما قبلها`;
  if (!a.with) return `تسير مع «${b.with_title}» ${startAr(b.offset)}`;
  if (a.with !== b.with) return `تسير مع «${b.with_title}» بدل «${a.with_title}» ${startAr(b.offset)}`;
  return `تسير مع «${b.with_title}» ${startAr(b.offset)} بدل ${a.offset ? daysAr(a.offset) : 'بدايتها'}`;
}

// إشعار «أبلغ المشاركين» (القرار 13): نص واحد للدفعة من الأثر نفسه، يُكتب في ملف كل مشارك ويصله بريده بقالب الملاحظات القائم
// (observations.ts record، بمفتاح cohort_plan ومرجع الحفظ فلا يُكتب مرتين). لا أسماء ولا أرقام نسخ، ويصف ما تغيّر وحده
const dayLongAr = (iso) => { try { return new Date(`${iso}T00:00:00Z`).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch { return iso; } };
/** @param {any} impact @param {(d: string) => string} [fmt] @returns {{ title: string, body: string }} */
export function planNotice(impact, fmt = dayLongAr) {
  const name = (k) => `«${(impact.changes.find((x) => x.key === k) || {}).title || k}»`;
  const list = (ks) => ks.map(name).join(' و');
  const parts = [];
  if (impact.stopped?.length) parts.push(`لم تعد ${list(impact.stopped)} ضمن رحلة دفعتك، وما أنجزته فيها محفوظ.`);
  if (impact.started?.length) parts.push(`عادت ${list(impact.started)} إلى رحلة دفعتك.`);
  const dur = impact.changes.filter((x) => !x.off && x.days_changed).map((x) => x.key);
  if (dur.length) parts.push(`تغيّرت مدة ${list(dur)}.`);
  const par = impact.changes.filter((x) => !x.off && x.with_changed && !x.days_changed).map((x) => x.key);
  if (par.length) parts.push(`تغيّر توقيت ${list(par)}.`);
  if (impact.end?.after && impact.end.shift) parts.push(`وتنتهي رحلتك الآن ${fmt(impact.end.after)}.`);
  parts.push('افتح رحلتك لترى المواعيد الجديدة لكل مرحلة ومعلم.');
  return { title: 'تغيّرت مواعيد رحلتك', body: `حدّث فريق البرنامج خطة دفعتك. ${parts.join(' ')}` };
}

// ملخص الأثر الذي يُكتب في السجل مع كل حفظ (البند 4.6): أعداد لا أسماء
export const impactSummary = (impact) => (impact ? {
  changes: impact.changes.map((x) => ({
    key: x.key, before: x.before.days, after: x.after.days, ...(x.off ? { off: x.off } : {}),
    ...(x.with_changed ? { with: [x.before.with, x.after.with], offset: [x.before.offset, x.after.offset] } : {}),
  })),
  stopped: impact.stopped || [], started: impact.started || [], excluded: (impact.excluded || []).length,
  shift: impact.end.shift, milestones: impact.milestones.length,
  late: impact.late ? impact.late.milestones : null, held: impact.mail ? impact.mail.held : null,
  people: impact.people ? impact.people.total : null,
} : null);

// أفعال حفظ خطة الدفعة في السجل: حارس بريد «معلم متأخر» يقرؤها (lateMilestoneNotices)
export const PLAN_ACTIONS = Object.freeze(['cohort.plan', 'cohort.plan-undo']);
// الحارس لدفعة: الأحدث بين يوم البيئة (cutoffFrom) ويوم آخر حفظ لخطتها، فما صار متأخرًا بتعديل الخطة لا يُرسل عنه
export const planCutoff = (cutoff, planDay) => (planDay && (!cutoff || planDay > cutoff) ? planDay : cutoff);
/** حارس الخطة لدفعة من صفوف سجلها (cohort.plan وcohort.plan-undo، بعمود after): لكل معلم يوم آخر حفظ حرّك موعده
 * (after.moved_ids)، وما حفظه سطر بلا moved_ids (قبل تسجيلها) يُعامل كأنه حرّك كل المعالم يومها
 * @param {any[]} rows @returns {{ moved: Record<string, string>, all: string | null }} */
export function planGuard(rows) {
  /** @type {Record<string, string>} */
  const moved = {};
  let all = null;
  for (const r of rows || []) {
    const d = String(r.created_at || '').slice(0, 10);
    if (!d) continue;
    const ids = r.after && Array.isArray(r.after.moved_ids) ? r.after.moved_ids : null;
    if (!ids) { if (!all || d > all) all = d; continue; }
    for (const id of ids) { const k = String(id); if (!moved[k] || d > moved[k]) moved[k] = d; }
  }
  return { moved, all };
}
// يوم الحارس لمعلم واحد: الأحدث بين يوم البيئة ويوم آخر حفظ حرّك موعده. ما لم يحركه حفظ يبقى على يوم البيئة،
// فمعلم متأخر داخل المهلة في مرحلة لم يمسها التعديل يُرسل عنه كالمعتاد
export const planCutoffFor = (cutoff, guard, id) => {
  const a = guard?.moved?.[String(id)] || null, b = guard?.all || null;
  return planCutoff(cutoff, a && b ? (a > b ? a : b) : a || b);
};
