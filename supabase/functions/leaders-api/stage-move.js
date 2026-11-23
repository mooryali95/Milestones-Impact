// ════════════════════════════════════════════════════════════════
// رحلة المشارك بأطوارها، ونقله بين المراحل (ملف المشارك في اللوحة، تصور 2026-11-23)
// ════════════════════════════════════════════════════════════════
// مصدر واحد يقرؤه ثلاثة: رحلة المشارك (Journey.jsx) تجمع به المراحل في أطوارها، وتبويب «الرحلة» في ملفه يعرضها بالترتيب
// نفسه، والخادم (admin.stage-move) يحسب به خطة النقل التي عاينها المدير قبل التأكيد، فلا تختلف المعاينة عما يُكتب.
// النقل لا يكتب إنجاز بند ولا يمحوه: يكتب تدخلات participant_stage_overrides وحدها (فتح، اعتماد اكتمال، إعفاء)
// بالدلالة القائمة في resolveStages، كما يكتبها admin.stage-override مرحلةً مرحلة.
import { PHASE_AR, countAr } from './labels.js';
import { positionOf } from './journey-map.js';
import { withGroups } from './stage-windows.js';
import { countedItems } from './optional.js';

export const PHASE_KEYS = ['admission', 'qualification', 'impact'];
const side = (s) => s.lane === 'track' || s.lane === 'service';
export const phaseOf = (s) => (PHASE_KEYS.includes(s.phase) ? s.phase : 'qualification');

/**
 * الرحلة بأطوارها كما يراها المشارك: لكل طور كتله بترتيبها (مراحل «تسير معًا» كتلة واحدة، والمسار المستمر كتلة بعد
 * كتلة مرجعه أو أول الطور)، والخدمات خارج الأطوار. عرض فقط، فلا يغيّر حالة مرحلة.
 * @param {any[]} journey رحلة المشارك (journeyFor)
 * @returns {{ phases: { key: string, title: string, stages: any[], units: any[][] }[], services: any[] }}
 */
export function journeyPhases(journey) {
  const list = journey || [];
  const phases = PHASE_KEYS.map((key) => {
    const inPhase = list.filter((s) => s.lane !== 'service' && phaseOf(s) === key);
    const stages = inPhase.filter((s) => s.lane !== 'track');
    const units = withGroups(stages);
    for (const t of inPhase.filter((s) => s.lane === 'track')) {
      const at = units.findIndex((g) => g.some((s) => s.key === t.track?.with || s.key === t.rules?.with));
      units.splice(at < 0 ? 0 : at + 1, 0, [t]);
    }
    return { key, title: PHASE_AR[key], stages, units };
  }).filter((p) => p.units.length);
  return { phases, services: list.filter((s) => s.lane === 'service') };
}

// ── النقل ──
export const MOVE_REASON_MIN = 3;
export const MOVE_CHOICES = ['complete', 'skip'];
export const MOVE_CHOICE_AR = { complete: 'اعتمد اكتمالها', skip: 'أعفه منها' };

/** المراحل المتتابعة وحدها (لا مسار مستمر ولا خدمة): هي ما يُنقل إليه، بترتيب الرحلة */
export const moveTargets = (journey) => (journey || []).filter((s) => !side(s));

/**
 * خطة النقل إلى مرحلة: ما يُكتب وما يُحذف من التدخلات، وسطر يلخصها. خالصة، يحسبها المتصفح للمعاينة والخادم للتنفيذ.
 * إلى الأمام: كل مرحلة متتابعة قبل الهدف لم تكتمل يُعتمد اكتمالها (الافتراضي) أو يُعفى منها بحسب choices، والهدف يُفتح
 * إن كانت قاعدته لا تفتحه باكتمال ما قبله (needsOpen). إلى الخلف (إعادة فتح): تُحذف تدخلات الهدف وما بعده من المراحل
 * المتتابعة، فتعود لقواعد البرنامج ويصير الهدف موضعه، ويُفتح الهدف بالشرط نفسه. ما اكتمل
 * ببنوده يبقى مكتملًا (لا يُمحى إنجاز)، فيُسمّى في keepsDone ليعرفه المدير قبل التأكيد.
 * @param {any[]} journey @param {string} target @param {Record<string, string>} [choices]
 * @returns {{ ok: false, error: string } | { ok: true, direction: 'forward' | 'backward', target: any, writes: { key: string, title: string, action: string }[], clears: { key: string, title: string, was: string }[], keepsDone: string[], summary: string }}
 */
export function planMove(journey, target, choices = {}) {
  const seq = moveTargets(journey);
  const ti = seq.findIndex((s) => s.key === target);
  if (ti < 0) return { ok: false, error: 'المرحلة ليست في رحلة هذا المشارك' };
  const t = seq[ti];
  const pos = positionOf(journey || []);
  const cur = pos >= 0 ? journey[pos] : null;
  const ci = cur ? seq.indexOf(cur) : seq.length;
  if (cur && cur.key === t.key) return { ok: false, error: 'هو في هذه المرحلة الآن' };
  // بعد الموضع: إلى الأمام. وقبله، أو بعد انتهاء الرحلة: إلى الخلف
  if (cur && ti > ci) {
    if (t.status === 'done') return { ok: false, error: 'هذه المرحلة مكتملة له' };
    const writes = seq.slice(0, ti).filter((s) => s.status !== 'done').map((s) => {
      const c = choices?.[s.key] ?? 'complete';
      return { key: s.key, title: s.title_ar, action: MOVE_CHOICES.includes(c) ? c : 'invalid' };
    });
    if (writes.some((w) => w.action === 'invalid')) return { ok: false, error: 'اختيار غير معروف لمرحلة' };
    if (t.status === 'locked' && needsOpen(t)) writes.push({ key: t.key, title: t.title_ar, action: 'open' });
    return { ok: true, direction: 'forward', target: t, writes, clears: [], keepsDone: [], summary: moveSummary(t.title_ar, writes) };
  }
  // إلى الخلف: الهدف قبل الموضع
  const later = seq.slice(ti);
  const clears = later.filter((s) => s.override && !(s === t && s.override === 'open')).map((s) => ({ key: s.key, title: s.title_ar, was: s.override }));
  const writes = needsOpen(t) ? [{ key: t.key, title: t.title_ar, action: 'open' }] : [];
  // ما اكتمل ببنوده (لا بتدخل) يبقى مكتملًا: النقل لا يمحو إنجازًا
  const keepsDone = t.status === 'done' && !['complete', 'skip'].includes(t.override) ? [t.title_ar] : [];
  return { ok: true, direction: 'backward', target: t, writes, clears, keepsDone, summary: moveSummary(t.title_ar, writes, clears) };
}

// هل يحتاج الهدف فتحًا صريحًا: قاعدة فتحه لا يحسمها اكتمال ما قبله (اعتماد الفريق، أو يوم من البداية، أو «تبدأ مع»)، أو
// ينتظر بنود مسار مستمر. التتابع وحده يُفتح باكتمال ما قبله، فلا يُكتب له تدخل زائد يبقى بعد النقل
const OPEN_RULES = ['approval', 'day', 'with'];
const needsOpen = (t) => t.override !== 'open' && (OPEN_RULES.includes(t.rules?.unlock ?? t.lock?.unlock) || (t.lock?.due || []).length > 0);

/** «سينتقل إلى «الاستشارة»، وتُعتمد مرحلتان ويُعفى من واحدة» */
export function moveSummary(title, writes, clears = []) {
  const n = (a) => writes.filter((w) => w.action === a).length;
  const parts = [];
  const done = n('complete'), skip = n('skip');
  if (done) parts.push(`تُعتمد ${countAr(done, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة')}`);
  if (skip) parts.push(`يُعفى من ${countAr(skip, 'واحدة', 'اثنتين', 'مراحل', 'مرحلة')}`);
  if (clears.length) parts.push(`يُلغى التدخل في ${countAr(clears.length, 'مرحلة واحدة', 'مرحلتين', 'مراحل', 'مرحلة')}`);
  return `سينتقل إلى «${title}»${parts.length ? `، و${parts.join(' و')}` : ''}`;
}

/** ما ينقص المرحلة: بنودها التي تُعد ولم تكتمل، لنافذة «أكمل هذه المرحلة» */
export const stageMissing = (s) => countedItems(s?.items || []).filter((it) => it.status !== 'done');
