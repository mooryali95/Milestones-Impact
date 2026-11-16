// ════════════════════════════════════════════════════════════════
// التذكير الموحد (المرحلة P3، اعتمدها المالك 2026-11-16)
// ════════════════════════════════════════════════════════════════
// محرك واحد يبني التذكير من رحلة المشارك نفسها: أين هو، وما بقي عليه بالاسم، وكم قطع، ومنذ متى توقف.
// كل مرسل (الإدارة، والمرشد وهو مشرف الرحلة، والمساعد نيابة عنه، ومنسق الجهة، والتذكير الآلي) يمر به،
// وكل تذكير يُكتب في سجل واحد (leaders.nudges) بحد مشترك، فلا تتكرر التذكيرات بلا داعٍ.
// دالة نقية بلا قاعدة: مصادرها onboardingOf وstuckMailText (onboarding.js)، وpositionOf وstageEntry وneedsOf (journey-map.js).
import { ONBOARDING_AR, REMIND_GAP_DAYS, STUCK_MAIL_SUBJECT, STUCK_STEPS, stuckMailText } from './onboarding.js';
import { needsOf, positionOf, stageEntry } from './journey-map.js';

// الحد المشترك بين كل المرسلين: لا يُذكَّر الشخص نفسه مرتين في أقل منه، أيًا كان المرسل
export const NUDGE_GAP_DAYS = REMIND_GAP_DAYS;
// بعد هذه المدة بلا تقدم يُعدّ التذكير «بلا أثر»، وقبلها «ينتظر»
export const NUDGE_OUTCOME_DAYS = 7;
// لافتة التذكير في الرحلة تبقى ما لم يرها حتى هذه المدة، ثم يكفي البريد والسجل
export const NUDGE_BANNER_DAYS = 14;
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

  // في البرنامج: المرحلة التي يقف عندها وأول ما بقي عليه فيها
  const idx = positionOf(journey);
  if (idx < 0) return { ok: false, why: 'finished' };
  const s = journey[idx];
  if (s.status === 'locked') return { ok: false, why: 'locked' };
  const returned = (s.items || []).find((it) => it.status === 'returned');
  const need = returned ? returned.title_ar : needsOf(s);
  if (!need) return { ok: false, why: 'nothing' };
  const entered = stageEntry(journey, idx, dates) || p.created_at;
  const days = daysSince(entered, t);
  const done = (s.items || []).filter((it) => it.status === 'done').length;
  const total = (s.items || []).length;
  return {
    ok: true, kind: returned ? 'returned' : 'stage', key: `stage:${s.key}`, stage: s.title_ar, step: need,
    remaining: total ? `أنجز ${done} من ${total} في هذه المرحلة` : '', progress: Number(progress) || 0, days,
    subject: returned ? `ملاحظة على «${need}» بانتظارك` : `خطوتك التالية في «${s.title_ar}»`,
    text: stageText({ stage: s.title_ar, need, progress: Number(progress) || 0, days, returned: !!returned, note: returned?.note }),
    snapshot: { key: `stage:${s.key}`, done, progress: Number(progress) || 0 },
  };
}

// نص تحفيزي يسمّي المرحلة والخطوة والتقدم، ويتدرج بطول التوقف: لا لوم، بل ما يقرّبه من التالية
export function stageText({ stage, need, progress, days, returned = false, note = '' }) {
  if (returned) return `رُوجع «${need}» وأُعيد إليك بملاحظة${note ? `: «${String(note).slice(0, 200)}»` : ''}. تعديل بسيط يكفي لتُعتمد وتنتقل خطوة في «${stage}».`;
  const where = `أنت في مرحلة «${stage}»، وقطعت ${progress}% من رحلتك.`;
  const next = `خطوتك التالية: ${need}.`;
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
