// ════════════════════════════════════════════════════════════════
// «ماذا تغيّر في الدفعة منذ وقت كذا» (تصور تشغيل الدفعة 2026-11-19، المرحلة 3، القسم 4.6): منطق خالص بلا قاعدة
// ════════════════════════════════════════════════════════════════
// قراءة مشتقة لا سجل أحداث: كل سطر يُحسب من تواريخ محفوظة أصلًا (إتمام كل بند في جدوله، وقت كل حضور، تسليم كل نموذج،
// آخر استعمال للجلسة)، فتعمل على الماضي كله ولا تنحرف عن مصدرها. الخادم يقرأ تواريخ الدفعة كلها دفعة واحدة
// (cohort-times.ts)، ويعلّم بها بنود رحلة كل عضو (annotateJourney)، وjourneyMap يضع في صف العضو لحظاته (changeFacts).
// ثم cohortChanges يحسب السطور من الصفوف لأي «منذ»، في اللوحة (فتبديل «آخر زيارة، أمس، 7 أيام» بلا طلب جديد) وفي
// اللقطة اليومية والبريد. يستورده الخادم واللوحة معًا.
// النافذة (since, now]: ما وقع بعد «منذ» حتى لحظة القراءة. ما وقع في لحظة «منذ» نفسها عُدّ في النافذة السابقة.

const DAY = 864e5;
export const CHANGES_FLOOR_DAYS = 31;
export const IDLE_DAYS = 7;
export const DEFAULT_SINCE_DAYS = 7;
const ms = (v) => (v ? Date.parse(v) : NaN);
// الترتيب بالوقت لا بالنص: التواريخ تصل بصيغ مختلفة (Z أو +00:00، بكسور ثانية أو بلا)
const byTime = (list) => list.filter((v) => Number.isFinite(ms(v))).sort((a, b) => ms(a) - ms(b));
const latest = (list) => byTime(list).at(-1) || null;
const nth = (list, n) => { const s = byTime(list); return s.length ? s[Math.min(Math.max(1, n), s.length) - 1] : null; };

// ── لحظة إتمام البند ──
// t: تواريخ العضو من جداولها (cohort-times.ts): req وsub (participant_requirements)، video، ws (حضور كل جلسة)، coach،
// content، quiz وread (الكتيب)، model، lab، cap، auto (ما يحسمه النظام برمزه).
// البند المكتمل بعدد (حضور N من M، جلسات توجيه): لحظته لحظة الحضور الذي أتم العدد، لا آخر حضور بعده.
// ما لا تاريخ له في جدوله (بند آلي بلا مصدر مؤرخ): null، فلا يُعدّ في «منذ» ولا يُخمَّن له وقت
/** @param {any} it بند من رحلة العضو @param {any} t @returns {string|null} */
export function doneAt(it, t = {}) {
  if (!it || it.status !== 'done') return null;
  if (it.completed_at) return it.completed_at;
  if (t.req?.[it.id]) return t.req[it.id];
  if (it.code && t.auto?.[it.code]) return t.auto[it.code];
  const act = it.activity;
  if (!act) return null;
  if (it.kind === 'video') return t.video?.[it.id] || null;
  if (it.kind === 'workshop') return nth((act.sessions || []).filter((s) => s.attended).map((s) => t.ws?.[s.id] || s.ends_at), Number(act.total) || 1);
  if (it.kind === 'coaching') return nth((t.coach || []).filter((s) => s.requirement_id === it.id).map((s) => s.at), Number(act.total) || 1);
  if (it.kind === 'curriculum') return latest((act.items || []).filter((x) => x.required !== false && x.done).map((x) => t.content?.[x.id]));
  if (it.kind === 'reading') return latest((act.chapters || []).map((c) => (act.quiz === false ? t.read?.[c.id] || t.quiz?.[c.id] : t.quiz?.[c.id] || t.read?.[c.id])));
  if (it.kind === 'model') { const m = t.model?.[act.model_id]; return m ? (act.accept === 'submitted' ? m.submitted_at : m.reviewed_at || m.submitted_at) || null : null; }
  if (it.kind === 'lab') { const f = t.lab?.[act.item_id] || []; return act.accept === 'finished' ? nth(f, 1) : latest(f); }
  if (it.kind === 'capstone') return act.sections ? null : t.cap?.approved_at || t.cap?.reviewed_at || null;
  return null;
}

// تسليم ينتظر المراجعة: null ليس تسليمًا منتظرًا، و{ at } لحظته (at فارغ: سُلّم قبل أن يُحفظ وقت التسليم، فلا يُعدّ «جديدًا»)
/** @param {any} it @param {any} [t] @returns {{ at: string|null }|null} */
export function waitingAt(it, t = {}) {
  if (!it || it.status === 'done') return null;
  const act = it.activity;
  if (it.kind === 'model') return act?.status === 'submitted' ? { at: t.model?.[act.model_id]?.submitted_at || null } : null;
  if (it.kind === 'capstone') return act && !act.sections && act.status === 'submitted' ? { at: t.cap?.submitted_at || null } : null;
  return it.status === 'submitted' ? { at: t.sub?.[it.id] || null } : null;
}

/** يعلّم بنود الرحلة بلحظاتها (done_at، وwaiting_at للتسليم المنتظر)، وجلسات الحضور بوقت الحضور. يعدّل الرحلة في مكانها
 * @param {any[]} journey @param {any} [t] */
export function annotateJourney(journey, t = {}) {
  for (const st of journey || []) for (const it of st.items || []) {
    const d = doneAt(it, t);
    if (d) it.done_at = d;
    const w = waitingAt(it, t);
    if (w) it.waiting_at = w.at || '';
    if (it.kind === 'workshop') for (const s of it.activity?.sessions || []) if (s.attended) s.attended_at = t.ws?.[s.id] || s.ends_at || null;
  }
  return journey;
}

/** لحظة البند كما تُقرأ للتغيّر: المعلَّمة من جدولها، وإلا تاريخ إتمامه في صفه @param {any} it */
export const momentOf = (it) => it?.done_at || it?.completed_at || null;

// لحظات العضو من رحلته المعلَّمة، لصفه في «المتابعة». floor: ما قبله لا يُحمل (أقصى نافذة تُعرض)، فلا يكبر الرد بتاريخ الرحلة كله
/** @param {any[]} journey @param {{ now?: number, floorDays?: number }} [o]
 * @returns {{ done_at: string[], waiting: (string|null)[], finished_at: string|null, ws: { id: string, title: string, at: string|null }[] }} */
export function changeFacts(journey, { now = Date.now(), floorDays = CHANGES_FLOOR_DAYS } = {}) {
  const floor = now - floorDays * DAY;
  const done = [], waiting = [], ws = [];
  let last = null;
  for (const st of journey || []) for (const it of st.items || []) {
    const d = momentOf(it);
    if (it.status === 'done' && Number.isFinite(ms(d))) { if (ms(d) >= floor) done.push(d); if (!last || ms(d) > ms(last)) last = d; }
    if (it.waiting_at !== undefined && it.status !== 'done') waiting.push(it.waiting_at || null);
    if (it.kind === 'workshop') for (const s of it.activity?.sessions || []) {
      if (s.undated) continue;
      // الجلسة التي بدأت أو حُضرت: مقام «حضر N من M» لسطرها
      if (s.attended || ms(s.starts_at) <= now) ws.push({ id: s.id, title: s.title || 'ورشة', at: s.attended ? s.attended_at || null : null });
    }
  }
  return { done_at: byTime(done), waiting, finished_at: last, ws };
}

// ── السطور ──
const nAr = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`);
// بعد «من»: مجرور (من عضوين)
const peopleFromAr = (n) => nAr(n, 'عضو واحد', 'عضوين', 'أعضاء', 'عضوًا');
export const activitiesAr = (n) => nAr(n, 'نشاط واحد', 'نشاطان', 'أنشطة', 'نشاطًا');
const lastSeen = (m) => m.last_active_at || m.last_login_at || null;

/**
 * سطور «منذ آخر زيارة» من صفوف «المتابعة». كل سطر بعدده ومعرّفات أصحابه (ids)، فالضغط عليه يصفّي الجدول بهم.
 * المنسحب والموقوف خارج السطور (كما هو خارج أعداد الخريطة). وحساب العرض وحساب الاختبار ليسا في الصفوف أصلًا (cohortMemberIds).
 * @param {any[]} rows صفوف roster من admin.cohort-journey
 * @param {{ since?: any, now?: any, stages?: any[] }} [o] stages: مراحل الخريطة لترتيب سطور «دخلوا مرحلة»
 * @returns {{ since: string, until: string, lines: { key: string, kind: string, text: string, count: number, ids: string[] }[], totals: Record<string, number> }}
 */
export function cohortChanges(rows, { since, now = Date.now(), stages = [] } = {}) {
  const from = new Date(since).getTime();
  const to = new Date(now).getTime();
  const within = (v) => { const x = ms(v); return x > from && x <= to; };
  const inside = (rows || []).filter((m) => m.state !== 'out');
  const lines = [];
  const add = (key, kind, text, ids, count = ids.length) => { if (ids.length) lines.push({ key, kind, text, count, ids: [...new Set(ids)] }); };

  // دخلوا مرحلة: من تغيّر موضعه في النافذة، بمرحلته الحالية. أول مرحلة ليست «دخولًا» (سطرها «انضموا»)
  const order = (stages || []).map((s) => s.key);
  const entered = new Map();
  for (const m of inside) {
    if (!m.entered_at || !within(m.entered_at) || !(m.stage_keys || []).length) continue;
    const k = m.stage_keys[0];
    if (!entered.has(k)) entered.set(k, { title: (m.stuck || []).find((x) => x.key === k)?.title || m.stage || k, ids: [] });
    entered.get(k).ids.push(m.id);
  }
  for (const [k, e] of [...entered].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))) add(`entered:${k}`, 'entered', `دخلوا مرحلة ${e.title}: ${e.ids.length}`, e.ids);

  const finished = inside.filter((m) => m.state === 'finished' && within(m.finished_at));
  add('finished', 'finished', `أتموا الرحلة: ${finished.length}`, finished.map((m) => m.id));

  const doers = inside.map((m) => [m.id, (m.done_at || []).filter(within).length]).filter(([, n]) => n > 0);
  const doneItems = doers.reduce((n, [, x]) => n + x, 0);
  add('done', 'done', `أنجزوا نشاطًا: ${activitiesAr(doneItems)} من ${peopleFromAr(doers.length)}`, doers.map(([id]) => id), doneItems);

  const submitted = inside.filter((m) => (m.waiting || []).some((w) => w && within(w)));
  add('submitted', 'submitted', `سلّموا ما ينتظر مراجعتك: ${submitted.length}`, submitted.map((m) => m.id));

  // حضروا جلسة: سطر لكل جلسة حضرها أحد في النافذة، ومقامه من يُتوقع حضورهم فيها
  const sessions = new Map();
  for (const m of inside) for (const s of m.ws || []) {
    if (!sessions.has(s.id)) sessions.set(s.id, { title: s.title, of: 0, ids: [], first: null });
    const x = sessions.get(s.id);
    x.of += 1;
    if (s.at && within(s.at)) { x.ids.push(m.id); if (!x.first || s.at < x.first) x.first = s.at; }
  }
  for (const [id, s] of [...sessions].filter(([, x]) => x.ids.length).sort((a, b) => String(a[1].first).localeCompare(String(b[1].first)))) {
    add(`attended:${id}`, 'attended', `حضروا «${s.title}»: ${s.ids.length} من ${s.of}`, s.ids);
  }

  const late = inside.filter((m) => m.late && m.late_since && within(m.late_since));
  add('late', 'late', `صاروا متأخرين: ${late.length}`, late.map((m) => m.id));

  const joined = (rows || []).filter((m) => within(m.joined_at));
  add('joined', 'joined', `انضموا للدفعة: ${joined.length}`, joined.map((m) => m.id));

  // توقفوا: من أتم سبعة أيام بلا نشاط في النافذة (آخر نشاطه، أو انضمامه إن لم يدخل قط)، وما زال في رحلته
  const idle = inside.filter((m) => m.state !== 'finished' && (() => { const b = ms(lastSeen(m) || m.joined_at); return Number.isFinite(b) && within(new Date(b + IDLE_DAYS * DAY).toISOString()); })());
  add('idle', 'idle', `توقفوا ${IDLE_DAYS} أيام: ${idle.length}`, idle.map((m) => m.id));

  return {
    since: new Date(from).toISOString(), until: new Date(to).toISOString(), lines,
    totals: { entered: [...entered.values()].reduce((n, e) => n + e.ids.length, 0), finished: finished.length, done_items: doneItems, done_people: doers.length,
      submitted: submitted.length, late_new: late.length, joined: joined.length, idle_new: idle.length },
  };
}

// ── «منذ» ──
// يوم الرياض (UTC+3 بلا توقيت صيفي): «أمس» يبدأ من منتصف ليل أمس بالرياض
const RIYADH_MS = 3 * 36e5;
/** @param {any} [now] @param {number} [back] */
export const riyadhDayStart = (now = Date.now(), back = 0) => Math.floor((new Date(now).getTime() + RIYADH_MS) / DAY) * DAY - RIYADH_MS - back * DAY;
export const SINCE_OPTIONS = [['visit', 'آخر زيارة'], ['yesterday', 'أمس'], ['week', '7 أيام']];
/** لحظة «منذ» للاختيار. visit بلا زيارة محفوظة: النافذة الافتراضية (سبعة أيام)
 * @param {string} option @param {{ visit?: any, now?: any }} [o] @returns {string} */
export function sinceFor(option, { visit = null, now = Date.now() } = {}) {
  const t = new Date(now).getTime();
  if (option === 'yesterday') return new Date(riyadhDayStart(t, 1)).toISOString();
  if (option === 'visit' && visit) return new Date(visit).toISOString();
  return new Date(t - DEFAULT_SINCE_DAYS * DAY).toISOString();
}

// ── وقت آخر زيارة: متى يتقدم ──
// الصف لكل مدير ولكل دفعة: since_at ما تُعرض التغيّرات منذه في الزيارة الجارية، وseen_at آخر لحظة قراءة عُرض شريطها،
// وtouched_at آخر عرض. الزيارة تمتد ما دام بين عرض وآخر أقل من VISIT_GAP_MS، فتحديث الصفحة أو العودة للتبويب في الزيارة
// نفسها لا يمحو ما لم يُقرأ. وأول عرض بعد انقطاع يبدأ زيارة جديدة: «منذ» يصير آخر لحظة قراءة في الزيارة السابقة.
// لا يتقدم شيء بالقراءة وحدها: التقدم بعد عرض الشريط (visitAdvance)، و«اعتبرها مقروءة» تقدّم «منذ» إلى لحظة القراءة (visitRead)
export const VISIT_GAP_MS = 30 * 60e3;
/** @param {any} row @param {any} now */
const sameVisit = (row, now) => !!row?.touched_at && new Date(now).getTime() - ms(row.touched_at) < VISIT_GAP_MS;
/** ما تُعرض التغيّرات منذه الآن. null: لا زيارة سابقة (أول مرة)، فالنافذة الافتراضية
 * @param {any} row @param {any} [now] @returns {string|null} */
export const visitSince = (row, now = Date.now()) => (!row ? null : sameVisit(row, now) ? row.since_at || null : row.seen_at || null);
const maxIso = (a, b) => (!a ? b : !b ? a : ms(a) > ms(b) ? a : b);
/** الصف بعد عرض الشريط لقراءة لحظتها at @param {any} row @param {string} at @param {any} [now] */
export function visitAdvance(row, at, now = Date.now()) {
  const touched_at = new Date(now).toISOString();
  if (!row) return { since_at: null, seen_at: at, touched_at };
  if (sameVisit(row, now)) return { since_at: row.since_at || null, seen_at: maxIso(row.seen_at, at), touched_at };
  return { since_at: row.seen_at || null, seen_at: maxIso(row.seen_at, at), touched_at };
}
/** الصف بعد «اعتبرها مقروءة» لقراءة لحظتها at @param {any} row @param {string} at @param {any} [now] */
export const visitRead = (row, at, now = Date.now()) => ({ since_at: maxIso(row?.seen_at, at), seen_at: maxIso(row?.seen_at, at), touched_at: new Date(now).toISOString() });

// ── اللقطة اليومية للدفعة: أعداد وحدها، بلا اسم ولا معرّف مشارك ──
/** @param {any[]} rows صفوف roster @param {any} map خريطة الرحلة @param {{ since?: any, now?: any }} [o] */
export function snapshotOf(rows, map, { since, now = Date.now() } = {}) {
  const inside = (rows || []).filter((m) => m.state !== 'out');
  const t = new Date(now).getTime();
  const ch = cohortChanges(rows, { since, now, stages: map?.stages || [] });
  return {
    members: inside.length,
    finished: inside.filter((m) => m.state === 'finished').length,
    late: inside.filter((m) => m.late).length,
    late_new: ch.totals.late_new,
    waiting: inside.filter((m) => (m.turns || []).includes('admin')).length,
    active_week: inside.filter((m) => { const s = ms(lastSeen(m)); return Number.isFinite(s) && t - s <= 7 * DAY; }).length,
    done_items: ch.totals.done_items, done_people: ch.totals.done_people, entered: ch.totals.entered, joined: ch.totals.joined,
    stages: (map?.stages || []).filter((s) => !s.service && !s.off).map((s) => ({ key: s.key, title: s.title, here: s.here, late: s.late })),
  };
}

// ── نصوص التنبيه والملخص: أعداد وحدها ──
const lateNewAr = (n) => nAr(n, 'عضو واحد صار متأخرًا', 'عضوان صارا متأخرين', 'أعضاء صاروا متأخرين', 'عضوًا صاروا متأخرين');
/** تنبيه «نظرة عامة»: كم صار متأخرًا في الدفعة منذ اللقطة السابقة (أمس) @param {string} name @param {any} snap */
// «منذ أمس» حين تفصل اللقطتين ليلة واحدة، وإلا عدد الأيام (تعطلت المهمة أيامًا): لا يقال «أمس» عن أسبوع
export function lateAlertText(name, snap) {
  const days = Math.round((ms(snap.taken_at) - ms(snap.since_at)) / DAY);
  return `دفعة «${name}»: ${lateNewAr(snap.late_new)} منذ ${days >= 2 ? nAr(days, 'يوم', 'يومين', 'أيام', 'يومًا') : 'أمس'}، والمتأخرون الآن ${snap.late}`;
}
/** سطر الملخص اليومي: مجموع اللقطات في نافذته. null حين لا شيء يُذكر @param {any[]} snaps */
export function digestLine(snaps) {
  const done = (snaps || []).reduce((n, s) => n + (Number(s.done_items) || 0), 0);
  const late = (snaps || []).reduce((n, s) => n + (Number(s.late_new) || 0), 0);
  if (!done && !late) return null;
  const parts = [
    ...(done ? [nAr(done, 'نشاط مكتمل واحد', 'نشاطان مكتملان', 'أنشطة مكتملة', 'نشاطًا مكتملًا')] : []),
    ...(late ? [nAr(late, 'متأخر جديد واحد', 'متأخران جديدان', 'متأخرين جدد', 'متأخرًا جديدًا')] : []),
  ];
  return { done, late, text: parts.join('، ') };
}

// ── الملخص الأسبوعي: متى يحين ──
// الأحد 9:00 بتوقيت الرياض، ويبقى مستحقًا 48 ساعة (يُعاد كل ساعة إن ضاقت حصة البريد)، ثم يُترك لذلك الأسبوع
export const WEEKLY_HOUR_RIYADH = 9;
export const WEEKLY_WINDOW_MS = 48 * 36e5;
/** @param {any} [now] @returns {{ due: boolean, week: string, from: string }} week: تاريخ أحد الأسبوع بالرياض، وfrom: لحظة استحقاقه */
export function weeklyDue(now = Date.now()) {
  const t = new Date(now).getTime();
  const local = new Date(t + RIYADH_MS);
  const sunday = Math.floor(local.getTime() / DAY) * DAY - local.getUTCDay() * DAY;
  const from = sunday + WEEKLY_HOUR_RIYADH * 36e5 - RIYADH_MS;
  return { due: t >= from && t < from + WEEKLY_WINDOW_MS, week: new Date(sunday).toISOString().slice(0, 10), from: new Date(from).toISOString() };
}
// نصيب البريد غير الرموز الذي يُترك لبريد المشاركين: الملخص الأسبوعي لا يخرج إن تجاوز به المستهلك هذا الكسر من النصيب
export const WEEKLY_SHARE = 0.5;
/** هل تتسع حصة اليوم للملخصات بلا مزاحمة بريد المشاركين؟ usage: { nonCode } من العداد، waiting: المنتظر في الطابور
 * @param {{ usage: any, waiting: number|null, cap: number, reserve: number, count: number }} o */
export function weeklyBudgetOk({ usage, waiting, cap, reserve, count }) {
  if (!usage || waiting == null) return false;
  if (waiting > 0) return false;
  const share = Math.floor(cap * (1 - reserve));
  return (Number(usage.nonCode) || 0) + count <= Math.floor(share * WEEKLY_SHARE);
}
