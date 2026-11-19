// ════════════════════════════════════════════════════════════════
// خريطة الرحلة للجهة وللدفعة: كم يقف عند كل مرحلة، ومنذ متى، ومن تجاوز موعدها (قرار المالك 2026-11-11)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد: رحلة كل مشارك كما يراها هو (journeyFor في participant.ts)، تُجمَّع هنا بلا حساب ثانٍ.
// دالة نقية بلا قاعدة، يختبرها journey-map.test.js، ويستدعيها coordinator.ts.
// الخصوصية: الأعداد والأسباب المجمّعة لكل منسق، والأسماء لمن له صلاحية «القائمة» (list)، وما ينقص كل شخص لمن له
// صلاحية «النشاط» (activity). لا درجات ولا مستويات هنا أبدًا.
import { addDays, daysBetween, MILESTONE_GRACE_DAYS } from './milestones.js';
import { renderJourneyText } from './journey.js';
import { cohortPlan, planService, planTrack, stageWindows, todayStage, todayStages, withGroups } from './stage-windows.js';
import { inProgram } from './logic.js';

// مهلة السماح نفسها التي في المعالم: من تجاوز مدة مرحلته بأكثر منها يُعدّ متأخرًا
export const STAGE_GRACE_DAYS = MILESTONE_GRACE_DAYS;
const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
// النوافذ من الملف المشترك (stage-windows.js) يقرؤه الخط الزمني أيضًا، فلا تُحسب مرتين. تُصدَّر من هنا كما كانت
export { stageWindows, todayStage, todayStages };

// موضع المشارك: المرحلة النشطة، وإلا أول مرحلة إلزامية لم تكتمل (مقفلة بانتظار اعتماد مثلًا). -1: أنهى الرحلة
// المسار المستمر (T1) يسير بجانب الرحلة فليس موضعًا: لا يُعد «مرحلة حالية» ولا «المرحلة X من Y»
export function positionOf(journey) {
  // والخدمة (T2) لمن يريد: ليست موضعًا ولا تنقص من أحد
  const seq = (s) => s.lane !== 'track' && s.lane !== 'service' && !planTrack(s) && !planService(s);
  const active = journey.findIndex((s) => s.status === 'active' && seq(s));
  if (active >= 0) return active;
  return journey.findIndex((s) => s.status !== 'done' && (s.stage_mode || 'required') === 'required' && seq(s));
}
/** مسارات الرحلة المستمرة (T1) بترتيبها @param {any[]} journey */
export const journeyTracks = (journey) => (journey || []).filter((s) => s.lane === 'track' || planTrack(s));
/** خدمات الرحلة (T2) بترتيبها @param {any[]} journey */
export const journeyServices = (journey) => (journey || []).filter((s) => s.lane === 'service' || planService(s));
/** هل استفاد المشارك من الخدمة: جلسة محجوزة أو حاضرة في أحد بنودها (الملغاة لا تُعد)، أو بند منها مكتمل
 * @param {any} st مرحلة الخدمة في رحلته */
export const serviceUsed = (st) => (st?.items || []).some((it) => it.status === 'done' || (it.activity?.sessions || []).some((x) => x.status !== 'cancelled' && x.status !== 'no_show'));

// مجموعة «تسير معًا» التي فيها المرحلة idx من رحلة المشارك (withGroups على قواعد رحلته نفسها، بعد خطة دفعته)،
// ومرحلة لا تسير مع غيرها مجموعة وحدها
export function groupAt(journey, idx) {
  const list = journey || [];
  const s = list[idx];
  if (!s) return [];
  return withGroups(list).find((g) => g.includes(s)) || [s];
}

/**
 * المرحلة الحالية للمشارك (R3b، التوازي 2): قيمة واحدة تقرؤها الخريطة والتذكير وشاشة الرحلة، فلا يختلف ما يراه المشارك
 * عما يُعدّ عليه في الخريطة. الموضع (stage) من positionOf كما كان، والجارية معه (stages) مراحل مجموعته «تسير معًا»
 * النشطة الآن بترتيب الرحلة، أولها الموضع أو ما يسبقه في المجموعة. start: فهرس أول المجموعة، ومنه يوم الدخول.
 * بلا توازٍ: stages مرحلة واحدة هي الموضع، فلا يتغير شيء لبرنامج بلا «تسير مع»
 * @param {any[]} journey @returns {{ idx: number, start: number, stage: any, stages: any[], group: any[], together: boolean }}
 */
export function currentStages(journey) {
  const list = journey || [];
  const idx = positionOf(list);
  if (idx < 0) return { idx: -1, start: -1, stage: null, stages: [], group: [], together: false };
  const stage = list[idx];
  const group = groupAt(list, idx);
  const stages = group.filter((s) => s === stage || s.status === 'active');
  return { idx, start: list.indexOf(group[0]), stage, stages, group, together: stages.length > 1 };
}

// ── «أين هو» عند الخبير ومنسق الجهة (التوازي 2 خارج الخريطة، بعد R3b) ──
// القيمة نفسها التي يراها المشارك في رحلته (currentStages)، فلا يسمي الخبير أو المنسق مرحلة واحدة لمن يسير في مرحلتين معًا.
// المسار المستمر (T1) والخدمة (T2) ليسا موضعًا: يُذكران بجانبه لا مكانه
const isSide = (s) => s.lane === 'track' || s.lane === 'service' || planTrack(s) || planService(s);
const andAr = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join('، ')} و${list.at(-1)}`);
/** @param {any[]} journey رحلة المشارك كما يراها (journeyFor)
 * @returns {{ stage: string | null, stages: string[], together: boolean, tracks: string[], label: string }} */
export function stageNow(journey) {
  const list = journey || [];
  const cur = currentStages(list);
  const stages = cur.stages.map((s) => s.title_ar);
  const tracks = journeyTracks(list).filter((s) => s.status === 'active').map((s) => s.title_ar);
  const stage = !stages.length ? null : stages.length === 1 ? stages[0] : `${andAr(stages)} معًا`;
  const label = !stages.length ? '' : stages.length === 1 ? `المرحلة الحالية: ${stages[0]}`
    : `${stages.length === 2 ? 'المرحلتان الحاليتان تسيران' : 'المراحل الحالية تسير'} معًا: ${andAr(stages)}`;
  return { stage, stages, together: cur.together, tracks, label };
}
/** الرحلة كتلًا بترتيبها كما يراها المشارك: مرحلة وحدها، أو مراحل «تسير معًا» كتلة واحدة، ثم المسارات المستمرة والخدمات
 * @param {any[]} journey @returns {{ blocks: { key: string, together: boolean, stages: any[] }[], tracks: any[], services: any[] }} */
export function journeyBlocks(journey) {
  const list = journey || [];
  const blocks = withGroups(list.filter((s) => !isSide(s))).map((g) => ({ key: g[0].key, together: g.length > 1, stages: g }));
  return { blocks, tracks: journeyTracks(list), services: journeyServices(list).map((s) => ({ ...s, used: serviceUsed(s) })) };
}

// متى دخل مرحلته: أحدث تاريخ إتمام معروف لما قبلها (بنود الرحلة، وإتمام الملف والقياس والاعتماد)، وإلا تسجيله.
// المراحل التي «تسير معًا» دخلها معًا: ما قبل أول مجموعتها وحده يُحسب، فإتمام مرحلة تسير معها لا يجعله «دخل للتو» (R3b)
export function stageEntry(journey, idx, dates = []) {
  let best = null;
  const take = (d) => { if (d && (!best || String(d) > String(best))) best = d; };
  const group = groupAt(journey, idx);
  const start = group.length ? journey.indexOf(group[0]) : idx;
  for (const s of journey.slice(0, Math.max(0, start))) for (const it of s.items || []) take(it.completed_at);
  if (start > 0) dates.forEach(take);
  return best;
}

// ما ينقصه الآن: أول بند إلزامي لم يكتمل في مرحلته، بنصه كما يراه المشارك
export function needsOf(stage) {
  if (!stage) return null;
  if (stage.status === 'locked') return stage.lock_reason || 'بانتظار فتح المرحلة';
  const it = (stage.items || []).find((x) => x.required && x.status !== 'done') || (stage.items || []).find((x) => x.status !== 'done');
  return it ? renderJourneyText(it.title_ar, { reqs: stage.items }) : null;
}

/** التوازي والمسار المستمر في الخريطة كما يرسمهما الخط وتبويب «الرحلة» (withGroups على قواعد التعريف بعد خطة الدفعة):
 * together لكل مرحلة في مجموعة «تسير معًا» مفتاح أولها، وtracks مفاتيح المسارات. يضيفه مستدعيا journeyMap (لوحة الجهة وملف
 * الدفعة) في journey_map.lanes بجانب مخرجها، فلا يتغير مخرج journeyMap نفسه (journey-legacy) ولا يُحسب التوازي في الواجهة
 * @param {any[]} stages مراحل التعريف الظاهرة بترتيبها @returns {{ together: Record<string, string>, tracks: string[] }} */
export function mapLanes(stages) {
  const together = {};
  for (const g of withGroups(stages || [])) if (g.length > 1) for (const x of g) together[x.key] = g[0].key;
  return { together, tracks: (stages || []).filter((s) => planTrack(s)).map((s) => s.key) };
}

// people: [{ id, name, status, created_at, journey, milestones, dates }]
// المنسحب والموقوف خارج الرحلة (inProgram): لا يُعدّ فيها ولا يقف عند مرحلة ولا يتأخر عنها
// off: مراحل موقوفة لهذه الدفعة (R2b، stages_off من تعريفها): خارج الحساب، وتُرجع في مكانها بعلامة off وأعداد صفرية
/** @param {{ stages: any[], people: any[], cohort?: any, program?: any, today?: any, list?: boolean, activity?: boolean, off?: any[] }} o */
export function journeyMap({ stages, people: all, cohort = null, program = null, today = new Date(), list = false, activity = false, off = [] }) {
  const people = all.filter((p) => inProgram(p.status));
  const keys = stages.map((s) => s.key);
  // خطة الدفعة (cohortPlan): النوافذ والمدة الفعلية لكل مرحلة (مدة الدفعة الخاصة أو مدة النسخة)، فلا تُقرأ duration_days خامًا
  const plan = cohortPlan(stages, cohort || {});
  const windows = plan.windows;
  const daysOf = (s) => plan.byKey[s.key]?.days ?? (Number(s.duration_days) || 0);
  const t = isoDay(today);
  const acc = Object.fromEntries(stages.map((s) => [s.key, { here: 0, done: 0, late: 0, used: 0, of: 0, rows: [], reasons: new Map() }]));
  const ms = new Map();
  let finished = 0;
  // من تأخر في أي مرحلة جارية له يُعدّ مرة واحدة في الإجمالي، ومن يقف في مراحل تسير معًا يُعدّ مرة واحدة في محوره
  const latePeople = new Set();
  const herePhase = new Map();
  for (const p of people) {
    const j = (p.journey || []).filter((s) => keys.includes(s.key));
    // المرحلة الحالية (currentStages): الموضع ومعه ما يسير معه نشطًا، فيُعدّ «هنا» في كل منها كما يراها في رحلته
    const cur = currentStages(j);
    const key = cur.stage ? cur.stage.key : null;
    if (!key) finished += 1;
    const startPos = key ? keys.indexOf(j[cur.start].key) : keys.length;
    // المسار المستمر (T1) يُعد بحالته عليه لا بموضعه: «هنا» ما دام جاريًا، و«تجاوزه» إن اكتمل
    const trackKeys = new Set(journeyTracks(j).map((s) => s.key));
    // والخدمة (T2): مؤشر استخدام لا حالة. «استفاد N من M» بدل «هنا» و«تجاوزها»
    const serviceKeys = new Set(journeyServices(j).map((s) => s.key));
    for (const st of j.filter((x) => serviceKeys.has(x.key))) {
      acc[st.key].of += 1;
      if (serviceUsed(st)) acc[st.key].used += 1;
    }
    for (let i = 0; i < startPos; i++) if (!trackKeys.has(keys[i]) && !serviceKeys.has(keys[i])) acc[keys[i]].done += 1;
    for (const st of j.filter((x) => trackKeys.has(x.key))) {
      if (st.status === 'done') acc[st.key].done += 1;
      else if (st.status === 'active') acc[st.key].here += 1;
    }
    if (key) {
      const hereKeys = new Set(cur.stages.map((s) => s.key));
      // باقي مجموعته: ما سبق موضعه منها تجاوزه (كما كان كل ما قبل الموضع)، وما بعده يُعدّ متجاوزًا إن اكتمل
      for (const g of cur.group) if (!hereKeys.has(g.key) && (j.indexOf(g) < cur.idx || g.status === 'done')) acc[g.key].done += 1;
      const entry = stageEntry(j, cur.idx, p.dates || []) || p.created_at || null;
      const days = entry ? Math.max(0, daysBetween(isoDay(entry), t)) : 0;
      const phases = new Set();
      for (const st of cur.stages) {
        const s = stages[keys.indexOf(st.key)];
        const a = acc[st.key];
        a.here += 1;
        phases.add(s.phase || 'qualification');
        const d = daysOf(s);
        // «متأخر» من نافذة الدفعة (R0 «تاريخ واحد»): من تجاوز اليوم نهاية نافذة مرحلته بعد مهلة السماح، أيًا كان يوم دخوله.
        // نافذة بلا مدة ولا جدول مكتوب لا تُعدّ موعدًا. وبلا بداية للدفعة (الدفعة المفتوحة) يبقى الحساب من دخوله بالمدة
        const w = windows[s.key];
        // والدفعة المفتوحة (is_default) مددها نسبية من الدخول ولو كان لها starts_on (القرار 21)، فتبقى على الحساب بالمدة
        const dated = w && !cohort?.is_default && (d > 0 || plan.byKey[s.key]?.source === 'pinned');
        const late = dated ? t > addDays(w.to, STAGE_GRACE_DAYS) : d > 0 && days > d + STAGE_GRACE_DAYS;
        if (late) { a.late += 1; latePeople.add(p.id); }
        const needs = needsOf(st);
        if (needs) a.reasons.set(needs, (a.reasons.get(needs) || 0) + 1);
        a.rows.push({ id: p.id, name: p.name, days, late, needs: activity ? needs : null });
      }
      for (const ph of phases) herePhase.set(ph, (herePhase.get(ph) || 0) + 1);
    }
    for (const m of p.milestones || []) {
      const x = ms.get(m.id) || { id: m.id, title: m.title_ar, due: m.due || null, done: 0, late: 0, sort: m.sort ?? 0 };
      if (m.done) x.done += 1;
      if (m.status === 'late') x.late += 1;
      if (!x.due && m.due) x.due = m.due;
      ms.set(m.id, x);
    }
  }
  const out = stages.map((s) => {
    const a = acc[s.key];
    const row = { key: s.key, title: s.title_ar, phase: s.phase || 'qualification', duration_days: daysOf(s),
      here: a.here, done: a.done, late: a.late, window: windows[s.key] || null };

    // الأسماء لصلاحية «القائمة» وحدها، الأطول مكوثًا أولًا. وبدونها أسباب مجمّعة بلا أسماء (أكثرها أولًا)
    if (list) row.people = a.rows.sort((x, y) => y.days - x.days || String(x.name).localeCompare(String(y.name), 'ar'));
    else row.reasons = [...a.reasons].map(([text, count]) => ({ text, count })).sort((x, y) => y.count - x.count).slice(0, 5);
    // الخدمة (T2): مؤشر الاستخدام وحده، فلا تُرسم حالة ولا عنق زجاجة. برنامج بلا خدمة لا يتغير صفه
    if (planService(s)) return { ...row, service: true, used: a.used, of: a.of, usage_ar: `استفاد ${a.used} من ${a.of}` };
    return row;
  });
  // الموقوفة في مكانها بترتيب المراحل، بلا أعداد ولا نافذة، فلا تُحسب في عنق الزجاجة ولا في «تجاوزوها»
  const sortOf = (s) => Number(s.sort ?? 0);
  for (const s of (off || []).filter((x) => x && !keys.includes(x.key))) {
    const row = { key: s.key, title: s.title_ar || s.key, phase: s.phase || 'qualification', duration_days: 0, here: 0, done: 0, late: 0, window: null, off: true };
    if (list) row.people = []; else row.reasons = [];
    // الخدمة الموقوفة (T2) تبقى في «الخدمات» بعلامة off، لا محطة موقوفة على المسار
    if (planService(s)) Object.assign(row, { service: true, used: 0, of: 0, usage_ar: '' });
    const at = stages.findIndex((x) => sortOf(x) > sortOf(s));
    const idx = at < 0 ? out.length : out.findIndex((x) => x.key === stages[at].key);
    out.splice(idx < 0 ? out.length : idx, 0, row);
  }
  const peak = out.reduce((b, s) => (s.here > (b?.here || 0) || (s.here === b?.here && s.late > b.late) ? s : b), null);
  return {
    program: program ? { name: program.name } : null,
    // موقع الدفعة على جدولها اليوم: today_stage قيمة واحدة (أول الجارية)، وtoday_stages كل ما يسير اليوم معًا (R3b)
    cohort: cohort ? { name: cohort.name, starts_on: cohort.starts_on || null, is_default: !!cohort.is_default, today_stage: todayStage(stages, windows, today), today_stages: todayStages(stages, windows, today) } : null,
    totals: { total: people.length, finished, late: latePeople.size, not_started: 0 },
    // من يقف الآن في كل محور، كل شخص مرة واحدة ولو وقف في مرحلتين تسيران معًا
    here_by_phase: Object.fromEntries(herePhase),
    bottleneck: peak && peak.here > 0 ? { stage: peak.key } : null,
    stages: out,
    milestones: [...ms.values()].sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || a.sort - b.sort)
      .map(({ sort, ...m }) => m),
  };
}
