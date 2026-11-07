// ════════════════════════════════════════════════════════════════
// التقييم المستمر: مؤشر واحد طوال التأهيل من مصادر الجدارة القائمة
// ════════════════════════════════════════════════════════════════
// تكويني: يُعرض للمشارك والخبير ليعدّلا الدعم، ولا يحكم وحده. يُبنى عليه التقييم الختامي.
// لا يُنسخ رقم: كل مصدر يُقرأ من جدوله، وكل مكوّن يحمل سببه بجملة ومصدره وعدد أحداثه وخطأه.
//   quizzes    ← handbook_progress: مجموع الصواب ÷ مجموع الأسئلة عبر الأبواب (لا متوسط النسب)
//   models     ← model_submissions.rating بالسلّم الرباعي (1..4) بعد مراجعة المستشار، بخريطة RUBRIC_PCT (D08)
//   milestones ← participant_milestones.scores (معيار وصفي 1..4) عند اعتماد المعلم، بخريطة RUBRIC_PCT
//   lab        ← lab_attempts.pct: متوسط أول محاولة منتهية وأفضلها في كل أداة (لا الأفضل وحدها)
//   katon      ← معطّل حتى يُعاد تصميمه
//   peer       ← peer_answers بحالة confirmed/corrected: إسهام للزملاء أكّده الخبير (كامل) أو صحّحه (جزئي)، بخريطة PEER_PCT
// تقدير الخبراء بعد الجلسات (انخراط) يُعرض منفصلًا ولا يدخل المؤشر (الملحق 5 §3.2).
// لا يدخل المصدر المؤشر قبل حد أدنى من الأحداث (min_events، وللاختبارات min_quiz_items سؤالًا) (§3.4).
import { CONTINUOUS_SOURCE_AR, ENGAGEMENT_AR, EXPERT_RATING_PCT, KATON_ENABLED, MILESTONE_RUBRIC, RUBRIC_PCT } from './labels.js';
import { peerEvents } from './peer.js';

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (x) => Math.round(x * 10) / 10;
// الخطأ المعياري لمتوسط الأحداث (±1 SE): sd/√n، ولا يُعرض بحدث واحد
const seOf = (xs) => {
  if (xs.length < 2) return null;
  const m = avg(xs);
  return r1(Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)) / Math.sqrt(xs.length));
};
export const CONTINUOUS_DEFAULTS = { min_events: 3, min_quiz_items: 10 };

// معيار المعلم كما يُحفظ: قيم صحيحة من 1 إلى 4 لمعايير معروفة، والفارغ يُسقط
export function cleanRubricScores(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    const n = Math.round(Number(v));
    if (Object.hasOwn(MILESTONE_RUBRIC, k) && n >= 1 && n <= 4) out[k] = n;
  }
  return out;
}
export const rubricPct = (scores) => {
  const v = Object.values(scores || {}).filter((n) => n >= 1 && n <= 4).map((n) => RUBRIC_PCT[n]);
  return v.length ? Math.round(avg(v)) : null;
};
// تقييمات الخبراء للمشارك (خماسية) وحدها
export const expertRatingPct = (n) => (n >= 1 && n <= 5 ? EXPERT_RATING_PCT[Math.round(n)] : null);
// تقدير النموذج بالسلّم الرباعي (D08). القيمة 5 من السلّم الخماسي السابق تُقرأ «متميز» بجدول التحويل (5←4)؛
// وما دونها يُحوَّل على الإنتاج بجدول يقره المالك قبل تضييق قيد القاعدة
export const modelPct = (n) => { const r = Math.round(Number(n)); return r === 5 ? RUBRIC_PCT[4] : r >= 1 && r <= 4 ? RUBRIC_PCT[r] : null; };

// events: كل حدث تقييم بتاريخه ونسبته، لحساب الاتجاه وعرض آخر ما جرى
/** @param {{ quizzes?: any[], models?: any[], ratings?: any[], milestones?: any[], lab?: any[], katon?: any[], peer?: any[], weights?: Record<string, number> | null, min_events?: number, min_quiz_items?: number }} [src] */
export function continuousAssessment({ quizzes = [], models = [], ratings = [], milestones = [], lab = [], katon = [], peer = [], weights = null, min_events = CONTINUOUS_DEFAULTS.min_events, min_quiz_items = CONTINUOUS_DEFAULTS.min_quiz_items } = {}) {
  const events = [];
  let quizItems = 0, quizRight = 0;
  for (const q of quizzes) if (q.quiz_total > 0) {
    quizItems += Number(q.quiz_total); quizRight += Number(q.quiz_score);
    events.push({ source: 'quizzes', at: q.completed_at, pct: Math.round((q.quiz_score / q.quiz_total) * 100), label: q.title || 'اختبار باب' });
  }
  for (const m of models) if (m.rating >= 1) events.push({ source: 'models', at: m.reviewed_at || m.updated_at, pct: modelPct(m.rating), label: m.title || 'نموذج' });
  for (const m of milestones) {
    const p = rubricPct(m.scores);
    if (p != null) events.push({ source: 'milestones', at: m.done_at, pct: p, label: m.title_ar || 'معلم' });
  }
  // المختبر: أول محاولة منتهية وأفضلها لكل أداة؛ المتوسط بينهما يكافئ التعلم ولا يقيس الأداء بعد كشف الحل وحده
  const byItem = new Map();
  for (const a of [...lab].filter((x) => x.finished_at && x.pct != null).sort((x, y) => String(x.finished_at).localeCompare(String(y.finished_at)))) {
    const s = byItem.get(a.item_id) || { first: Number(a.pct), best: Number(a.pct), at: a.finished_at, title: a.title };
    s.best = Math.max(s.best, Number(a.pct)); s.at = a.finished_at;
    byItem.set(a.item_id, s);
  }
  for (const s of byItem.values()) events.push({ source: 'lab', at: s.at, pct: Math.round((s.first + s.best) / 2), label: s.title || 'أداة في المختبر', first: Math.round(s.first), best: Math.round(s.best) });
  if (KATON_ENABLED) for (const k of katon) if (k.pct != null) events.push({ source: 'katon', at: k.at, pct: k.pct, label: k.title });
  for (const e of peerEvents(peer)) events.push({ source: 'peer', ...e });
  events.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  const components = Object.keys(CONTINUOUS_SOURCE_AR).filter((key) => KATON_ENABLED || key !== 'katon').map((key) => {
    const ev = events.filter((e) => e.source === key);
    const pcts = ev.map((e) => e.pct);
    const value = !ev.length ? null : key === 'quizzes' ? Math.round((quizRight / quizItems) * 100) : Math.round(avg(pcts));
    // وزن المصدر من إعداد البرنامج (final_eval.sources)؛ بلا إعداد: أوزان متساوية
    const weight = weights && Number.isFinite(Number(weights[key])) ? Math.max(0, Number(weights[key])) : 1;
    const enough = key === 'quizzes' ? quizItems >= min_quiz_items : ev.length >= min_events;
    const need = key === 'quizzes' ? `${min_quiz_items} أسئلة` : `${min_events} أحداث`;
    return { key, label: CONTINUOUS_SOURCE_AR[key], value, n: ev.length, items: key === 'quizzes' ? quizItems : undefined, se: seOf(pcts), weight, enough, in_index: value != null && enough && weight > 0,
      reason: reasonFor(key, ev, value, quizItems) + (value != null && !enough ? `؛ لا يدخل المؤشر قبل ${need}` : '') };
  });
  const have = components.filter((c) => c.in_index);
  const wsum = have.reduce((a, c) => a + c.weight, 0);
  const index = wsum ? Math.round(have.reduce((a, c) => a + c.value * c.weight, 0) / wsum) : null;
  // الانخراط بتقدير الخبراء: يُعرض بجانب المؤشر ولا يدخله
  const eng = ratings.filter((r) => r.overall >= 1).map((r) => ({ at: r.created_at, pct: expertRatingPct(Number(r.overall)), label: r.label || 'تقييم خبير', comment: r.comment || null }));
  const engagement = { label: ENGAGEMENT_AR, value: eng.length ? Math.round(avg(eng.map((e) => e.pct))) : null, n: eng.length,
    reason: eng.length ? `متوسط ${eng.length} تقدير خبير (جاء مستعدًا، تفاعل بجدية، يتقدم في هدفه)؛ انخراط لا جدارة، فلا يدخل المؤشر` : 'لم يقيّمه خبير بعد جلسة أو استشارة',
    events: eng.sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 5) };
  // الاتجاه: متوسط آخر ثلاثة أحداث مقابل ما قبلها (يحتاج أربعة أحداث على الأقل)، على الدرجات الموحدة
  let trend = null;
  if (events.length >= 4) {
    const last = avg(events.slice(-3).map((e) => e.pct)), before = avg(events.slice(0, -3).map((e) => e.pct));
    const d = Math.round(last - before);
    trend = { delta: d, dir: d >= 5 ? 'up' : d <= -5 ? 'down' : 'flat' };
  }
  // ما يحتاج انتباه الخبير: مكوّن دون 50، أو هبوط واضح
  const flags = [
    ...have.filter((c) => c.value < 50).map((c) => `${c.label} دون المنتصف (${c.value}٪)`),
    ...(trend?.dir === 'down' ? [`هبوط في آخر التقييمات بـ ${-trend.delta} نقطة`] : []),
  ];
  return { index, components, engagement, trend, flags, events: events.slice(-8).reverse(), count: events.length, min_events, min_quiz_items };
}

function reasonFor(key, ev, value, quizItems) {
  if (!ev.length) return { quizzes: 'لم يُجب عن اختبار باب بعد', models: 'لم يُقيَّم له نموذج بعد', milestones: 'لم يُقيَّم له معلم بالمعيار بعد', lab: 'لم يُتم أداة في المختبر بعد', katon: 'لم يُتم موضوعًا في «كاتون» بعد', peer: 'لم يؤكّد الخبير له إسهامًا في طلبات زملائه بعد' }[key];
  const n = ev.length;
  const low = [...ev].sort((a, b) => a.pct - b.pct)[0];
  const base = { quizzes: `الصواب في ${quizItems} سؤالًا عبر ${n} اختبار`, models: `متوسط ${n} نموذج مقيَّم`, milestones: `متوسط ${n} معلم بالمعيار`, lab: `متوسط أول محاولة وأفضلها في ${n} أداة`, katon: `يقين صادق في ${n} موضوع`, peer: `${n} إسهام أكّده الخبير أو صحّحه` }[key];
  return value < 60 && n > 1 ? `${base}؛ أضعفها «${low.label}» (${low.pct}٪)` : base;
}
