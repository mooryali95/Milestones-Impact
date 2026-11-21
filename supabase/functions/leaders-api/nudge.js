// ════════════════════════════════════════════════════════════════
// التذكير الموحد (المرحلة P3، اعتمدها المالك 2026-11-16)
// ════════════════════════════════════════════════════════════════
// محرك واحد يبني التذكير من رحلة المشارك نفسها: أين هو، وما بقي عليه بالاسم، وكم قطع، ومنذ متى توقف.
// كل مرسل (الإدارة، والمرشد وهو مشرف الرحلة، والمساعد نيابة عنه، ومنسق الجهة، والتذكير الآلي) يمر به،
// وكل تذكير يُكتب في سجل واحد (leaders.nudges) بحد مشترك، فلا تتكرر التذكيرات بلا داعٍ.
// دالة نقية بلا قاعدة: مصادرها onboardingOf وstuckMailText (onboarding.js)، وcurrentStages وstageEntry وneedsOf (journey-map.js).
// المراحل التي تسير معًا (R3b): «أين هو» مرحلته الحالية ومعها ما يسير معها، كما يراها في رحلته وكما تعدّه الخريطة.
import { countedItems, countedProgress } from './optional.js';
import { ONBOARDING_AR, REMIND_GAP_DAYS, STUCK_MAIL_SUBJECT, STUCK_STEPS, stuckMailText } from './onboarding.js';
import { currentStages, needsOf, stageEntry } from './journey-map.js';

// الحد المشترك بين كل المرسلين: لا يُذكَّر الشخص نفسه مرتين في أقل منه، أيًا كان المرسل
export const NUDGE_GAP_DAYS = REMIND_GAP_DAYS;
// بعد هذه المدة بلا تقدم يُعدّ التذكير «بلا أثر»، وقبلها «ينتظر»
export const NUDGE_OUTCOME_DAYS = 7;
// لافتة التذكير في الرحلة تبقى ما لم يرها حتى هذه المدة، ثم يكفي البريد والسجل
export const NUDGE_BANNER_DAYS = 14;
// نوافذ تقرير الفاعلية (P5) بالأيام: مصدر واحد للخادم وأزرار اللوحة
export const NUDGE_REPORT_WINDOWS = [7, 30, 90];
export const NUDGE_SENDERS = ['admin', 'mentor', 'assistant', 'coordinator', 'auto'];
export const NUDGE_SENDER_AR = {
  admin: 'الإدارة', mentor: 'المرشد', assistant: 'المساعد نيابة عن المرشد', coordinator: 'منسق الجهة', auto: 'التذكير الآلي',
};
export const NUDGE_OUTCOME_AR = { progressed: 'تقدّم بعده', waiting: 'ينتظر', none: 'بلا أثر بعد' };
// لماذا لا يُذكَّر: يُعرض في المعاينة قبل الإرسال
export const NUDGE_SKIP_AR = {
  out: 'خارج البرنامج (منسحب أو موقوف)', demo: 'حساب تجريبي', no_email: 'بلا بريد', approval: 'ينتظر اعتماد الإدارة لا خطوة منه',
  finished: 'أتم الرحلة', locked: 'مرحلته مقفلة بانتظار ما ليس بيده', nothing: 'لا خطوة مطلوبة منه الآن', recent: 'ذُكِّر قريبًا',
};

const DAY = 864e5;
const daysSince = (at, now) => (at ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(at)) / DAY)) : null);
const iso = (d) => new Date(d ?? Date.now()).toISOString();

/**
 * التذكير المناسب لمشارك الآن، أو سبب عدم تذكيره.
 * @param {{ p: any, onboarding?: any, journey?: any[], progress?: number, dates?: any[], now?: any }} o
 *   p: صف المشارك. onboarding: ناتج onboardingOf. journey/progress: من journeyFor. dates: تواريخ ما قبل الرحلة (stageEntry)
 * @returns {{ ok: true, key: string, stage: string, step: string, kind: string, remaining: string, progress: number, days: number|null, subject: string, text: string, snapshot: any } | { ok: false, why: string }}
 */
export function nudgeFor({ p, onboarding = null, journey = [], progress = 0, dates = [], now = Date.now() }) {
  const t = iso(now);
  if (['withdrawn', 'suspended'].includes(p?.status)) return { ok: false, why: 'out' };
  if (p?.is_demo) return { ok: false, why: 'demo' };
  if (!p?.email) return { ok: false, why: 'no_email' };
  if (p.status === 'completed') return { ok: false, why: 'finished' };
  if (p.status === 'pending_approval') return { ok: false, why: 'approval' };

  // قبل الاعتماد: الملف ثم القياس، بالنص الذي يسمّي ما بقي عليه هو
  if (onboarding && STUCK_STEPS.includes(onboarding.step)) {
    const text = stuckMailText(onboarding);
    if (!text) return { ok: false, why: 'nothing' };
    const pct = onboarding.total ? Math.round(((onboarding.answered || 0) / onboarding.total) * 100) : 0;
    return {
      ok: true, kind: 'onboarding', key: `onboarding:${onboarding.step}`, stage: 'التسجيل', step: ONBOARDING_AR[onboarding.step],
      remaining: onboarding.remaining || '', progress: pct, days: daysSince(onboarding.last_answer_at || onboarding.started_at || p.created_at, t),
      subject: STUCK_MAIL_SUBJECT, text,
      snapshot: { key: `onboarding:${onboarding.step}`, answered: onboarding.answered || 0, progress: pct },
    };
  }
  if (!['placed', 'enrolled'].includes(p.status)) return { ok: false, why: 'nothing' };

  // في البرنامج: المرحلة التي يقف عندها (ومعها ما يسير معها نشطًا) وأول ما بقي عليه فيها
  const cur = currentStages(journey);
  if (cur.idx < 0) return { ok: false, why: 'finished' };
  const s = cur.stage;
  if (s.status === 'locked') return { ok: false, why: 'locked' };
  // ما أُعيد بملاحظة في أي جارية يتقدم، ثم ما ينقص الموضع، ثم ما ينقص ما يسير معه
  let returned = null, at = s;
  // الاختياري خارج التذكير (optional.js): لا يُذكَّر أحد ببند اختياري أُعيد إليه، ولا يدخل «أنجز N من M»
  for (const st of cur.stages) { returned = countedItems(st.items).find((it) => it.status === 'returned'); if (returned) { at = st; break; } }
  let need = returned ? returned.title_ar : null;
  if (!need) for (const st of cur.stages) { need = needsOf(st); if (need) { at = st; break; } }
  if (!need) return { ok: false, why: 'nothing' };
  const entered = stageEntry(journey, cur.idx, dates) || p.created_at;
  const days = daysSince(entered, t);
  const n = countedProgress(cur.stages.flatMap((st) => st.items || []));
  const done = n.done;
  const total = n.total;
  const names = stagesAr(cur.stages.map((st) => st.title_ar));
  // اللقطة على المجموعة كلها لا على الجارية وحدها: الجارية التي تكتمل تخرج من stages، فيُعدّ ما أنجز فيها ويبقى العدد لا ينقص
  // ما دام المفتاح نفسه، فيُعرف أنه تقدّم بين تذكيرين (ledgerSummary)
  const groupDone = countedProgress(cur.group.flatMap((st) => st.items || [])).done;
  return {
    ok: true, kind: returned ? 'returned' : 'stage', key: `stage:${s.key}`, stage: s.title_ar, step: need,
    remaining: total ? `أنجز ${done} من ${total} في ${cur.together ? `«${names}» معًا` : 'هذه المرحلة'}` : '', progress: Number(progress) || 0, days,
    subject: returned ? `ملاحظة على «${need}» بانتظارك` : `خطوتك التالية في «${at.title_ar}»`,
    text: stageText({ stage: s.title_ar, stages: cur.together ? cur.stages.map((st) => st.title_ar) : null, need, progress: Number(progress) || 0, days, returned: !!returned, note: returned?.note, at: at.title_ar }),
    snapshot: { key: `stage:${s.key}`, done: groupDone, progress: Number(progress) || 0 },
  };
}

// «أ» و«ب» و«ج»: أسماء المراحل الجارية معًا في جملة واحدة
const stagesAr = (titles) => titles.length < 2 ? titles[0] || '' : `${titles.slice(0, -1).join('» و«')}» و«${titles.at(-1)}`;

// نص تحفيزي يسمّي المرحلة والخطوة والتقدم، ويتدرج بطول التوقف: لا لوم، بل ما يقرّبه من التالية
// stages: أسماء المراحل الجارية معًا إن كانت أكثر من واحدة (R3b)، وat: المرحلة التي فيها الخطوة
export function stageText({ stage, stages = null, need, progress, days, returned = false, note = '', at = '' }) {
  if (returned) return `رُوجع «${need}» وأُعيد إليك بملاحظة${note ? `: «${String(note).slice(0, 200)}»` : ''}. تعديل بسيط يكفي لتُعتمد وتنتقل خطوة في «${at || stage}».`;
  const where = stages && stages.length > 1
    ? `أنت في ${stages.length > 2 ? `${stages.length} مراحل تسير` : 'مرحلتين تسيران'} معًا: «${stagesAr(stages)}»، وقطعت ${progress}% من رحلتك.`
    : `أنت في مرحلة «${stage}»، وقطعت ${progress}% من رحلتك.`;
  const next = stages && stages.length > 1 && at ? `خطوتك التالية في «${at}»: ${need}.` : `خطوتك التالية: ${need}.`;
  if (days != null && days >= 21) return `${where} ${next} مضى على توقفك ${days} يومًا، والعودة الآن تُبقيك مع دفعتك، ونحن هنا إن احتجت عونًا.`;
  if (days != null && days >= 7) return `${where} ${next} بضع دقائق اليوم تحافظ على إيقاعك وتقرّبك من المرحلة التالية.`;
  return `${where} ${next} أنت على الطريق الصحيح، فواصل.`;
}

/** هل يُرسل الآن، أم ذُكِّر خلال الحد المشترك؟ last: آخر تذكير له من أي مرسل { sender, sender_label, created_at } */
export function gate(last, now = Date.now(), gapDays = NUDGE_GAP_DAYS) {
  if (!last?.created_at) return { ok: true };
  const days = daysSince(last.created_at, iso(now));
  if (Date.parse(iso(now)) - Date.parse(last.created_at) >= gapDays * DAY) return { ok: true, last: lastView(last, days) };
  return { ok: false, why: 'recent', last: lastView(last, days) };
}
const lastView = (l, days) => ({ by: l.sender_label || NUDGE_SENDER_AR[l.sender] || l.sender, sender: l.sender, at: l.created_at, days });

/** «ذكّره المرشد قبل يومين»: سطر واحد يراه كل مرسل قبل أن يرسل */
export function lastLine(last) {
  if (!last) return '';
  const ago = last.days === 0 ? 'اليوم' : last.days === 1 ? 'أمس' : last.days === 2 ? 'قبل يومين' : last.days <= 10 ? `قبل ${last.days} أيام` : `قبل ${last.days} يومًا`;
  return `ذكّره ${last.by} ${ago}`;
}

/** أثر التذكير: هل تقدّم بعده؟ يقارن لقطة الإرسال بحاله الآن (ناتج nudgeFor أو حالته) */
export function outcomeOf(n, current, now = Date.now()) {
  const s = n?.snapshot || {};
  const c = current?.ok ? current.snapshot : null;
  // انتقل من موضعه، أو أتم شيئًا فيه، أو لم يعد عليه شيء (اعتُمد أو أتم الرحلة)
  if (!c && current && ['approval', 'finished', 'locked'].includes(current.why)) return 'progressed';
  if (c && (c.key !== s.key || (c.done ?? 0) > (s.done ?? 0) || (c.answered ?? 0) > (s.answered ?? 0) || (c.progress ?? 0) > (s.progress ?? 0))) return 'progressed';
  return Date.parse(iso(now)) - Date.parse(n.created_at) < NUDGE_OUTCOME_DAYS * DAY ? 'waiting' : 'none';
}

/** ملخص سجل التذكير لملف المشارك: كم، ومن، وكم منها تلاه تقدم */
export function ledgerSummary(rows, current, now = Date.now()) {
  const list = (rows || []).map((n) => ({ ...n, by: n.sender_label || NUDGE_SENDER_AR[n.sender] || n.sender, outcome: outcomeOf(n, current, now) }));
  // الأثر الحقيقي للأحدث وحده؛ ما قبله يُقاس بما تلاه مباشرة: تقدّم إن تغير موضعه قبل التذكير التالي
  for (let i = 1; i < list.length; i++) {
    const newer = list[i - 1];
    const older = list[i];
    const moved = newer.snapshot?.key !== older.snapshot?.key || (newer.snapshot?.done ?? 0) > (older.snapshot?.done ?? 0)
      || (newer.snapshot?.answered ?? 0) > (older.snapshot?.answered ?? 0);
    older.outcome = moved ? 'progressed' : 'none';
  }
  return { total: list.length, progressed: list.filter((x) => x.outcome === 'progressed').length, last: list[0] || null, rows: list };
}

/** معاينة جماعية: تجمع المرشحين بالمرحلة، ومن يُتخطى بسببه */
export function groupPreview(items) {
  const groups = new Map();
  const skipped = [];
  for (const it of items) {
    if (!it.nudge?.ok) { skipped.push({ id: it.id, name: it.name, why: it.nudge?.why, reason: NUDGE_SKIP_AR[it.nudge?.why] || '', last: it.last || null }); continue; }
    const k = it.nudge.key;
    if (!groups.has(k)) groups.set(k, { key: k, stage: it.nudge.stage, step: it.nudge.kind === 'onboarding' ? it.nudge.step : '', sample: it.nudge.text, people: [] });
    groups.get(k).people.push({ id: it.id, name: it.name, step: it.nudge.step, days: it.nudge.days, last: it.last || null });
  }
  return { groups: [...groups.values()], skipped, count: [...groups.values()].reduce((n, g) => n + g.people.length, 0) };
}

// التذكير الأسبوعي (cron الأحد): حدود التشغيلة الواحدة، ومصدرها الواحد للخادم واختباره
export const WEEKLY_SEND_MAX = 200; // رسائل في التشغيلة، كما كان
export const WEEKLY_CANDIDATES = 400; // من يمر بالمحرك في التشغيلة: ضعف حد الإرسال، فمن يتخطاه المحرك لا يأكل الحد
export const NEVER_LOGGED_SHARE = 100; // نصيب من لم يدخل قط مقدَّمًا، والباقي لمن غاب ثم يُكمل كل فريق ما فضل عن الآخر
export const NEVER_LOGGED_MAX = 2; // من لم يدخل قط يذكّره الأسبوعي مرتين في جملته ثم يُترك لتدخل الإدارة أو المنسق
// حالات لا يُذكَّر صاحبها أبدًا (nudgeFor): تُستبعد في الاستعلام فلا تملأ نافذة القراءة كل أسبوع
export const WEEKLY_OUT_STATUSES = ['suspended', 'withdrawn', 'completed', 'pending_approval'];

/**
 * من يمر بالمحرك في التذكير الأسبوعي، بالترتيب، من فريقين يُقرآن منفصلين فلا يزاحم أحدهما الآخر:
 * away من دخل ثم غاب أسبوعًا (الأقدم غيابًا أولًا)، وnever من لم يدخل قط وعمر حسابه أسبوع فأكثر (الأحدث أولًا،
 * فمن بلغ حده يتأخر ولا يحجب من بعده). يُسقط من ذُكِّر خلال الأسبوع (recent)، ومن لم يدخل قط وبلغ حده (autoCounts).
 * الترتيب: نصيب never أولًا، ثم away، ثم ما بقي من never، والحد WEEKLY_CANDIDATES. الإرسال نفسه يقف عند WEEKLY_SEND_MAX
 * بعد تخطي المحرك (weeklyNudges)، فلا يأكل الحد من لا تذكير له.
 * @param {{ away: {id: string}[], never: {id: string}[], recent: Set<string>, autoCounts: Map<string, number> }} o
 * @returns {string[]}
 */
export function weeklyCandidates({ away, never, recent, autoCounts }) {
  const a = away.filter((p) => !recent.has(p.id)).map((p) => p.id);
  const n = never.filter((p) => !recent.has(p.id) && (autoCounts.get(p.id) || 0) < NEVER_LOGGED_MAX).map((p) => p.id);
  return [...new Set([...n.slice(0, NEVER_LOGGED_SHARE), ...a, ...n.slice(NEVER_LOGGED_SHARE)])].slice(0, WEEKLY_CANDIDATES);
}

/**
 * خطة التذكير الأسبوعي (P4): من له مرشد يذكّره المساعد نيابة عن مرشده، ما لم يتابعه المرشد بنفسه مؤخرًا (busy)،
 * فحينها لا ينوب عنه المساعد ويُترك للمرشد. ومن لا مرشد له يذكّره التذكير الآلي.
 * @param {string[]} ids @param {Map<string, {id: string, name: string}>} mentors @param {Set<string>} busy
 * @returns {{ mentor: {id: string, name: string} | null, ids: string[] }[]}
 */
export function weeklyPlan(ids, mentors, busy) {
  const out = new Map();
  for (const id of ids) {
    const m = mentors.get(id) || null;
    if (m && busy.has(id)) continue;
    const k = m ? `m:${m.id}` : 'auto';
    if (!out.has(k)) out.set(k, { mentor: m, ids: [] });
    out.get(k).ids.push(id);
  }
  return [...out.values()];
}

/**
 * تقرير فاعلية التذكير (P5): من سجل التذكير الواحد وحال كل مشارك الآن، بلا مصدر ثانٍ.
 * لكل مرسل ولكل مرحلة: كم أُرسل، وكم رآه في الموقع، وكم تلاه تقدم، وكم ينتظر. ومن ذُكِّر مرتين فأكثر بلا أثر
 * يُسمّى «يحتاج تدخلًا شخصيًا»: التذكير لم يعد يكفيه.
 * @param {any[]} rows صفوف nudges في النافذة، الأحدث أولًا
 * @param {Map<string, any>} current ناتج nudgeFor لكل مشارك الآن
 * @param {Map<string, string>} names
 */
export function effectReport(rows, current, names = new Map(), now = Date.now()) {
  const byPerson = new Map();
  for (const r of rows) {
    if (!byPerson.has(r.participant_id)) byPerson.set(r.participant_id, []);
    byPerson.get(r.participant_id).push(r);
  }
  const judged = [];
  for (const [pid, list] of byPerson) {
    const s = ledgerSummary(list, current.get(pid) || { ok: false, why: 'nothing' }, now);
    for (const x of s.rows) judged.push({ ...x, participant_id: pid });
  }
  const tally = (key) => {
    const m = new Map();
    for (const x of judged) {
      const k = key(x);
      if (!m.has(k)) m.set(k, { key: k, sent: 0, seen: 0, progressed: 0, waiting: 0, none: 0 });
      const t = m.get(k);
      t.sent += 1; if (x.seen_at) t.seen += 1; t[x.outcome] += 1;
    }
    return [...m.values()].map((t) => ({ ...t, seen_pct: pct(t.seen, t.sent), progressed_pct: pct(t.progressed, t.sent - t.waiting) })).sort((a, b) => b.sent - a.sent);
  };
  const all = tally(() => 'all')[0] || { sent: 0, seen: 0, progressed: 0, waiting: 0, none: 0, seen_pct: null, progressed_pct: null };
  const stuck = [...byPerson].map(([pid, list]) => {
    const mine = judged.filter((x) => x.participant_id === pid);
    const misses = mine.filter((x) => x.outcome === 'none').length;
    return { id: pid, name: names.get(pid) || '', nudges: list.length, misses, stage: list[0].stage_title, last: list[0].created_at };
  }).filter((x) => x.misses >= 2).sort((a, b) => b.misses - a.misses || b.nudges - a.nudges);
  return {
    total: all, people: byPerson.size,
    by_sender: tally((x) => x.sender).map((t) => ({ ...t, label: NUDGE_SENDER_AR[t.key] || t.key })),
    by_stage: tally((x) => x.stage_title || x.stage_key),
    stuck,
  };
}
// نسبة صحيحة، أو null حين لا يُحكم بعد (كل ما أُرسل ما زال ينتظر)
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);
