// ════════════════════════════════════════════════════════════════
// التقييم المستمر: مؤشر واحد طوال التأهيل من أربعة مصادر قائمة
// ════════════════════════════════════════════════════════════════
// تكويني: يُعرض للمشارك والخبير ليعدّلا الدعم، ولا يحكم وحده. يُبنى عليه التقييم الختامي.
// لا يُنسخ رقم: كل مصدر يُقرأ من جدوله، وكل مكوّن يحمل سببه بجملة ومصدره.
//   quizzes    ← handbook_progress (quiz_score / quiz_total)
//   models     ← model_submissions.rating (1..5) بعد مراجعة المستشار
//   experts    ← expert_ratings اتجاه to_participant (1..5) بعد الجلسات والاستشارات
//   milestones ← participant_milestones.scores (معيار وصفي 1..4) عند اعتماد المعلم
import { CONTINUOUS_SOURCE_AR, MILESTONE_RUBRIC } from './labels.js';

const pct = (v, min, max) => Math.round(((v - min) / (max - min)) * 100);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

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
  const v = Object.values(scores || {}).filter((n) => n >= 1 && n <= 4);
  return v.length ? pct(avg(v), 1, 4) : null;
};

// events: كل حدث تقييم بتاريخه ونسبته، لحساب الاتجاه وعرض آخر ما جرى
/** @param {{ quizzes?: any[], models?: any[], ratings?: any[], milestones?: any[], katon?: any[] }} [src] */
export function continuousAssessment({ quizzes = [], models = [], ratings = [], milestones = [], katon = [] } = {}) {
  const events = [];
  for (const q of quizzes) if (q.quiz_total > 0) events.push({ source: 'quizzes', at: q.completed_at, pct: Math.round((q.quiz_score / q.quiz_total) * 100), label: q.title || 'اختبار باب' });
  for (const m of models) if (m.rating >= 1) events.push({ source: 'models', at: m.reviewed_at || m.updated_at, pct: pct(m.rating, 1, 5), label: m.title || 'نموذج' });
  for (const r of ratings) if (r.overall >= 1) events.push({ source: 'experts', at: r.created_at, pct: pct(Number(r.overall), 1, 5), label: r.label || 'تقييم خبير', comment: r.comment || null });
  for (const m of milestones) {
    const p = rubricPct(m.scores);
    if (p != null) events.push({ source: 'milestones', at: m.done_at, pct: p, label: m.title_ar || 'معلم' });
  }
  for (const k of katon) if (k.pct != null) events.push({ source: 'katon', at: k.at, pct: k.pct, label: k.title });
  events.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  const components = Object.keys(CONTINUOUS_SOURCE_AR).map((key) => {
    const ev = events.filter((e) => e.source === key);
    const value = ev.length ? Math.round(avg(ev.map((e) => e.pct))) : null;
    return { key, label: CONTINUOUS_SOURCE_AR[key], value, n: ev.length, reason: reasonFor(key, ev, value) };
  });
  const have = components.filter((c) => c.value != null);
  const index = have.length ? Math.round(avg(have.map((c) => c.value))) : null;
  // الاتجاه: متوسط آخر ثلاثة أحداث مقابل ما قبلها (يحتاج أربعة أحداث على الأقل)
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
  return { index, components, trend, flags, events: events.slice(-8).reverse(), count: events.length };
}

function reasonFor(key, ev, value) {
  if (!ev.length) return { quizzes: 'لم يُجب عن اختبار باب بعد', models: 'لم يُقيَّم له نموذج بعد', experts: 'لم يقيّمه خبير بعد جلسة أو استشارة', milestones: 'لم يُقيَّم له معلم بالمعيار بعد', katon: 'لم يُتم موضوعًا في «كاتون» بعد' }[key];
  const n = ev.length;
  const low = [...ev].sort((a, b) => a.pct - b.pct)[0];
  const base = { quizzes: `متوسط ${n} اختبار`, models: `متوسط ${n} نموذج مقيَّم`, experts: `متوسط ${n} تقييم خبير`, milestones: `متوسط ${n} معلم بالمعيار`, katon: `يقين صادق في ${n} موضوع` }[key];
  return value < 60 && n > 1 ? `${base}؛ أضعفها «${low.label}» (${low.pct}٪)` : base;
}
