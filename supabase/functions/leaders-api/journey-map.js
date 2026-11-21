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
import { ownerOf } from './journey-timeline.js';
import { stageRules } from './journey.js';
import { changeFacts, momentOf } from './cohort-changes.js';

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
// at: من أين تُقرأ لحظة البند. الافتراضي تاريخ إتمامه في صفه كما كان، و«المتابعة» تمرر momentOf (اللحظة المعلَّمة من جدول
// البند نفسه، cohort-changes.js) لسطر «دخلوا مرحلة» وحده
export function stageEntry(journey, idx, dates = [], at = (it) => it.completed_at) {
  let best = null;
  const take = (d) => { if (d && (!best || String(d) > String(best))) best = d; };
  const group = groupAt(journey, idx);
  const start = group.length ? journey.indexOf(group[0]) : idx;
  for (const s of journey.slice(0, Math.max(0, start))) for (const it of s.items || []) take(at(it));
  if (start > 0) dates.forEach(take);
  return best;
}

// البند الذي يقف عنده في مرحلته: أول إلزامي لم يكتمل، وإلا أول ما لم يكتمل. يقرؤه «ما ينقصه» و«على من الدور» معًا
const needItem = (stage) => (stage?.items || []).find((x) => x.required && x.status !== 'done') || (stage?.items || []).find((x) => x.status !== 'done') || null;
// ما ينقصه الآن: أول بند إلزامي لم يكتمل في مرحلته، بنصه كما يراه المشارك
export function needsOf(stage) {
  if (!stage) return null;
  if (stage.status === 'locked') return stage.lock_reason || 'بانتظار فتح المرحلة';
  const it = needItem(stage);
  return it ? renderJourneyText(it.title_ar, { reqs: stage.items }) : null;
}

// ── «على من الدور» (تصور تشغيل الدفعة 2026-11-19، المرحلة 1) ──
// يُبنى فوق needsOf: البند نفسه الذي يسميه «ما ينقصه»، وحالته كما في رحلة المشارك. قاعدة الصدق: ما لا يُستنتج من حالة
// البند يبقى none («غير محدد») بلا تخمين. لا حالة هنا تدل على الجهة (الدفع والرعاية خارج الرحلة)، فلا قيمة «على الجهة».
//   participant  عليه: بند يكمله المشارك بنفسه ولم يسلّمه، أو جلسة توجيه لم يحجزها
//   admin        عليك: تسليم ينتظر المراجعة، اعتماد المسار، مرحلة يفتحها الفريق أو يعتمد اكتمالها، جلسة توجيه انتهت بلا
//                تأكيد حضور، ونشاط حضور بلا جلسة قادمة له
//   expert       على الخبير: لقاء يسجله المستشار (kind: meeting)
//   schedule     على موعد: مرحلة تُفتح بتاريخ، أو جلسة قادمة لم تُعقد بعد
//   none         غير محدد
export const TURNS = Object.freeze(['participant', 'admin', 'expert', 'schedule', 'none']);
export const TURN_AR = Object.freeze({ participant: 'عليه', admin: 'عليك', expert: 'على الخبير', schedule: 'على موعد', none: 'غير محدد' });
// البنود الآلية التي يُعرف صاحبها من رمزها. T-360 وE-360 (تقدير المدير والزملاء) والتقرير النهائي R-ISSUE (خبير أو لجنة أو
// إدارة) وأي رمز آلي آخر: غير محدد
const AUTO_TURN = Object.freeze({ 'P-INFO': 'participant', 'P-CV': 'participant', 'A-DONE': 'participant', 'E-POST': 'participant', 'P-PROJECT': 'participant', 'AP-OK': 'admin' });
const turn = (t, why = null) => ({ turn: t, why });
const timeOf = (d) => (d ? new Date(d).getTime() : NaN);
function itemTurn(it, stage, now) {
  // استبانة تنتظر أول حضور (gateSurveys): دورها دور بند الحضور في مرحلتها
  if (it.waits) {
    const attend = (stage.items || []).find((x) => x.kind === 'workshop' && x !== it);
    return attend ? itemTurn(attend, stage, now) : turn('none');
  }
  const act = it.activity || null;
  // محتوى يُفتح بعد اعتماد المسار (منهج، نموذج، فصول الوثيقة): لا يُعرف من البند أسلّم القياس أم لا
  if (act?.locked) return turn('none');
  const owner = ownerOf(it);
  if (owner === 'system') return AUTO_TURN[it.code] ? turn(AUTO_TURN[it.code], AUTO_TURN[it.code] === 'admin' ? 'اعتماد المسار' : null) : turn('none');
  if (it.kind === 'workshop') {
    if (!act) return turn('none');
    const ahead = (act.sessions || []).some((x) => !x.attended && !x.undated && timeOf(x.ends_at) + 1800e3 > now);
    return ahead ? turn('schedule', 'جلسة قادمة') : turn('admin', 'لا جلسة قادمة له');
  }
  if (it.kind === 'coaching') {
    if (!act) return turn('none');
    const live = (act.sessions || []).filter((x) => x.status !== 'attended' && x.status !== 'no_show' && x.status !== 'cancelled');
    if (live.some((x) => x.awaiting)) return turn('admin', 'جلسة تنتظر تأكيد الحضور');
    if (live.length) return turn('schedule', 'جلسة محجوزة');
    return act.can_book ? turn('participant', 'لم يحجز جلسته') : turn('none');
  }
  if (owner === 'expert') return turn('expert', 'لقاء يسجله المستشار');
  if (it.kind === 'model') return act?.status === 'submitted' ? turn('admin', 'تسليم ينتظر المراجعة') : act ? turn('participant') : turn('none');
  if (it.kind === 'capstone') {
    if (!act) return turn('none');
    if (act.sections) return turn('participant');
    if (act.status === 'submitted') return turn('admin', 'تسليم ينتظر المراجعة');
    return !act.status || act.status === 'draft' || act.status === 'returned' ? turn('participant') : turn('none');
  }
  // قراءة ومشاهدة ومنهج وأداة مختبر واستبانة وبند يدوي (رفع، نموذج، تدريب): عليه، إلا ما سلّمه وينتظر المراجعة
  if (it.status === 'submitted') return turn('admin', 'تسليم ينتظر المراجعة');
  return turn('participant');
}
/** على من الدور في مرحلة المشارك الحالية @param {any} stage مرحلة من رحلته @param {any} [today]
 * @returns {{ turn: 'participant'|'admin'|'expert'|'schedule'|'none', why: string|null }} */
export function turnOf(stage, today = new Date()) {
  if (!stage) return turn('none');
  const r = stageRules(stage);
  if (stage.status === 'locked') {
    if (r.unlock === 'approval') return turn('admin', 'مرحلة يفتحها الفريق');
    if (r.unlock === 'day') return turn('schedule', 'موعد فتح المرحلة');
    return turn('none');
  }
  // مرحلة تكتمل باعتماد الفريق واكتملت بنودها الإلزامية: الدور على الإدارة ولو بقي فيها بند اختياري
  if (r.complete === 'approval' && !(stage.items || []).some((x) => x.required && x.status !== 'done')) return turn('admin', 'اعتماد اكتمال المرحلة');
  const it = needItem(stage);
  return it ? itemTurn(it, stage, new Date(today).getTime()) : turn('none');
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
// roster (تبويب «المتابعة» في ملف الدفعة، تصور تشغيل الدفعة 2026-11-19): صف لكل عضو في members من الحلقة نفسها التي
// تعدّ الخريطة، فعدد «هنا» في كل مرحلة هو عدد الصفوف التي فيها مفتاحها دائمًا (rosterAgrees). بدونه لا يتغير المخرج حرفًا
/** @param {{ stages: any[], people: any[], cohort?: any, program?: any, today?: any, list?: boolean, activity?: boolean, off?: any[], roster?: boolean }} o */
export function journeyMap({ stages, people: all, cohort = null, program = null, today = new Date(), list = false, activity = false, off = [], roster = false }) {
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
  const members = [];
  const titleOf = (k) => stages[keys.indexOf(k)]?.title_ar || k;
  // لحظة انقضاء مهلة مرحلة مؤرخة على جدول الدفعة (غداة نهاية نافذتها والمهلة)، أو null لما لا موعد له
  const dueOf = (k) => {
    const s = stages[keys.indexOf(k)], w = s && windows[s.key];
    return w && !cohort?.is_default && (daysOf(s) > 0 || plan.byKey[s.key]?.source === 'pinned') ? `${addDays(w.to, STAGE_GRACE_DAYS + 1)}T00:00:00.000Z` : null;
  };
  for (const p of people) {
    const mem = roster ? { id: p.id, name: p.name, status: p.status, state: 'ontime', stage_keys: [], track_keys: [], late_keys: [], stage: null, tracks: [], days: null, late: false,
      needs: null, turn: 'none', why: null, turns: [], stuck: [], progress: p.progress ?? null, services: [] } : null;
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
      const used = serviceUsed(st);
      if (used) acc[st.key].used += 1;
      if (mem) mem.services.push({ key: st.key, used });
    }
    for (let i = 0; i < startPos; i++) if (!trackKeys.has(keys[i]) && !serviceKeys.has(keys[i])) acc[keys[i]].done += 1;
    for (const st of j.filter((x) => trackKeys.has(x.key))) {
      if (st.status === 'done') acc[st.key].done += 1;
      else if (st.status === 'active') { acc[st.key].here += 1; if (mem) { mem.track_keys.push(st.key); mem.tracks.push(titleOf(st.key)); } }
    }
    if (key) {
      const hereKeys = new Set(cur.stages.map((s) => s.key));
      // باقي مجموعته: ما سبق موضعه منها تجاوزه (كما كان كل ما قبل الموضع)، وما بعده يُعدّ متجاوزًا إن اكتمل
      for (const g of cur.group) if (!hereKeys.has(g.key) && (j.indexOf(g) < cur.idx || g.status === 'done')) acc[g.key].done += 1;
      const entry = stageEntry(j, cur.idx, p.dates || []) || p.created_at || null;
      const days = entry ? Math.max(0, daysBetween(isoDay(entry), t)) : 0;
      const phases = new Set();
      // لحظة دخوله موضعه بلحظات البنود المعلَّمة من جداولها (momentOf)، لسطر «دخلوا مرحلة» و«صاروا متأخرين» في «منذ آخر زيارة».
      // أول مرحلة ليست دخولًا. وأيام المكوث والتأخر نفسه يبقيان على حسابهما كما في لوحة الجهة
      const enteredAt = mem && cur.start > 0 ? stageEntry(j, cur.idx, p.dates || [], momentOf) : null;
      // في أول مرحلة: لحظة انضمامه، فمن انضم ومهلتها منقضية صار متأخرًا لحظة انضم لا قبل أن يكون عضوًا
      const sinceHere = enteredAt || (cur.start > 0 ? null : p.joined_at || p.created_at || null);
      const lateFrom = [];
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
        // متى بدأ تأخره في هذه المرحلة: غداة انقضاء المهلة (بيوم UTC كما يُحسب التأخر)، أو لحظة دخوله إن دخلها وموعدها منقضٍ
        if (late && mem) {
          const due = `${dated ? addDays(w.to, STAGE_GRACE_DAYS + 1) : addDays(isoDay(entry || t), d + STAGE_GRACE_DAYS + 1)}T00:00:00.000Z`;
          lateFrom.push(dated && sinceHere && timeOf(sinceHere) > timeOf(due) ? lateChain(j, cur.start, sinceHere, p, dueOf) : due);
        }
        const needs = needsOf(st);
        if (needs) a.reasons.set(needs, (a.reasons.get(needs) || 0) + 1);
        a.rows.push({ id: p.id, name: p.name, days, late, needs: activity ? needs : null });
        if (mem) {
          mem.stage_keys.push(st.key);
          if (late) mem.late_keys.push(st.key);
          mem.stuck.push({ key: st.key, title: titleOf(st.key), needs: activity ? needs : null, ...turnOf(st, today) });
        }
      }
      for (const ph of phases) herePhase.set(ph, (herePhase.get(ph) || 0) + 1);
      if (mem) {
        // الصف يحمل موضعه (أول ما في stuck من مرحلة الموضع نفسها)، ومن يسير في مرحلتين معًا تُسمى مرحلتاه ودور كل منهما
        const at = mem.stuck.find((x) => x.key === key) || mem.stuck[0];
        const titles = mem.stuck.map((x) => x.title);
        // «منذ» في الصف من لحظة دخوله المعلَّمة إن عُرفت، فلا يقول الصف «منذ 26 يومًا» لمن يقول الشريط إنه دخل أمس. التأخر وأعداد
        // الخريطة على حسابها كما هي
        Object.assign(mem, { days: enteredAt ? Math.max(0, daysBetween(isoDay(enteredAt), t)) : days, late: mem.late_keys.length > 0, needs: at?.needs ?? null, turn: at?.turn || 'none', why: at?.why || null,
          turns: [...new Set(mem.stuck.map((x) => x.turn))], stage: titles.length < 2 ? titles[0] || null : `${andAr(titles)} معًا`,
          state: mem.late_keys.length ? 'late' : phases.has('admission') ? 'onboarding' : 'ontime',
          entered_at: enteredAt, late_since: lateFrom.length ? lateFrom.sort((x, y) => timeOf(x) - timeOf(y))[0] : null });
      }
    } else if (mem) mem.state = 'finished';
    if (mem) { Object.assign(mem, memberActivity(j, today), changeFacts(j, { now: new Date(today).getTime() }), { joined_at: p.joined_at || p.created_at || null }); members.push(mem); }
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
  if (roster) {
    // «لم يحضر آخر ورشة»: آخر جلسة انتهت بين جلسات الأعضاء كلهم، ومن كانت من جلساته ولم يحضرها
    const last = members.flatMap((x) => x.sessions).filter((x) => x.ended).sort((a, b) => String(b.ends_at).localeCompare(String(a.ends_at)))[0] || null;
    for (const x of members) {
      x.missed_last = !!last && x.sessions.some((y) => y.id === last.id && !y.attended);
      delete x.sessions;
    }
    // المنسحب والموقوف خارج الرحلة: صف بلا مرحلة ولا تأخر، فلا يدخل عدًّا في الخريطة
    for (const p of all.filter((x) => !inProgram(x.status))) {
      members.push({ id: p.id, name: p.name, status: p.status, state: 'out', stage_keys: [], track_keys: [], late_keys: [], stage: null, tracks: [], days: null, late: false,
        needs: null, turn: 'none', why: null, turns: [], stuck: [], progress: p.progress ?? null, services: [], attendance: null, consult: null, missed_last: false,
        entered_at: null, late_since: null, done_at: [], waiting: [], finished_at: null, ws: [], joined_at: p.joined_at || p.created_at || null });
    }
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
    ...(roster ? { members } : {}),
  };
}

// «صار متأخرًا» لمن دخل مرحلة وموعدها منقضٍ: إن كان متأخرًا في ما قبلها حين غادره فتأخره متصل، وبدايته بداية ذاك (وهكذا
// رجوعًا)، فلا يُعدّ «متأخرًا جديدًا» من انتقل وهو متأخر. وإن لم يكن متأخرًا قبلها فبداية تأخره لحظة دخوله
function lateChain(journey, start, entered, p, dueOf) {
  let since = entered, at = start;
  while (at > 0) {
    // ما قبل مجموعته من المراحل المتتابعة (لا مسار مستمر ولا خدمة)
    let prev = at - 1;
    while (prev >= 0 && isSide(journey[prev])) prev -= 1;
    if (prev < 0) break;
    const group = groupAt(journey, prev);
    const first = journey.indexOf(group[0]);
    const due = group.map((s) => dueOf(s.key)).filter(Boolean).sort()[0] || null;
    if (!due || timeOf(due) >= timeOf(since)) break;
    const prevEntry = (first > 0 ? stageEntry(journey, prev, p.dates || [], momentOf) : null) || p.joined_at || p.created_at || null;
    since = prevEntry && timeOf(prevEntry) > timeOf(due) ? prevEntry : due;
    if (since === due || first <= 0) break;
    at = first;
  }
  return since;
}

// حضور العضو واستشارته من بنود رحلته نفسها (activity من evidenceFor)، بلا قراءة ثانية:
// attendance «حضر 2 من 3» من جلسات الحضور التي بدأت (وما حضره منها)، وconsult «استفاد 1 من 2» حضر ومحجوز من الحد (coachingStatus)
function memberActivity(journey, today) {
  const now = new Date(today).getTime();
  const sessions = [];
  let coach = null;
  for (const st of journey) for (const it of st.items || []) {
    const act = it.activity;
    if (!act) continue;
    if (it.kind === 'workshop') {
      for (const x of act.sessions || []) {
        const started = !x.undated && timeOf(x.starts_at) <= now;
        if (started || x.attended) sessions.push({ id: x.id, ends_at: x.ends_at || null, attended: !!x.attended, ended: !x.undated && timeOf(x.ends_at) <= now });
      }
    }
    if (it.kind === 'coaching') {
      const open = (act.sessions || []).filter((x) => x.status === 'booked' || x.status === 'requested').length;
      coach = { used: (coach?.used || 0) + (act.used ?? (Number(act.count) || 0) + open - (Number(act.off) || 0)), max: (coach?.max || 0) + (act.max ?? (Number(act.total) || 0)) };
    }
  }
  const hasWorkshop = journey.some((st) => (st.items || []).some((it) => it.kind === 'workshop' && it.activity));
  return { attendance: hasWorkshop ? { count: sessions.filter((x) => x.attended).length, total: sessions.length } : null, consult: coach, sessions };
}

/** هل تطابق صفوف الأعضاء أعداد الخريطة: «هنا» و«متأخر» لكل مرحلة، واستخدام كل خدمة، والإجماليات. يقرؤها الاختبار، والخادم يسجل
 * الاختلاف إن وقع (لا يقع ما دام الاثنان من حلقة واحدة) @param {any} map مخرج journeyMap بـroster @returns {string[]} الاختلافات */
export function rosterAgrees(map) {
  const rows = map?.members || [];
  const inside = rows.filter((x) => x.state !== 'out');
  const bad = [];
  for (const s of map?.stages || []) {
    if (s.off) continue;
    if (s.service) {
      const mine = inside.flatMap((x) => x.services.filter((y) => y.key === s.key));
      if (mine.length !== s.of || mine.filter((y) => y.used).length !== s.used) bad.push(`${s.key}: خدمة`);
      continue;
    }
    const here = inside.filter((x) => x.stage_keys.includes(s.key) || x.track_keys.includes(s.key)).length;
    const late = inside.filter((x) => x.late_keys.includes(s.key)).length;
    if (here !== s.here) bad.push(`${s.key}: هنا ${s.here} والصفوف ${here}`);
    if (late !== s.late) bad.push(`${s.key}: متأخر ${s.late} والصفوف ${late}`);
  }
  const t = map?.totals || {};
  if (inside.length !== t.total) bad.push(`الإجمالي ${t.total} والصفوف ${inside.length}`);
  if (inside.filter((x) => x.state === 'finished').length !== t.finished) bad.push('أنهوا الرحلة');
  if (inside.filter((x) => x.late).length !== t.late) bad.push('المتأخرون');
  return bad;
}
