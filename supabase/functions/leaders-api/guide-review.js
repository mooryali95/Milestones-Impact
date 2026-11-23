// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد» المرحلة د: مراجعة الأسبوع للتعلم (قرار المالك 2026-11-23). منطق خالص
// ════════════════════════════════════════════════════════════════
// ما يستحق المراجعة من ردود المساعد: «لم يتأكد»، و«رفض»، وما أوقفه الحارس، وما طلب فيه المشارك التأكد من خبير.
// تُجمع بالموضع (الرحلة أو باب الكتاب)، ويُعدّ تكرار السؤال نفسه. لا يغيّر شيئًا آليًا: كل حالة تُضاف بقرار المراجع.
export const REVIEW_DAYS = 7;
export const REVIEW_MAX = 200;
export const REPEAT_MIN = 3;               // سؤال تكرر ثلاث مرات فأكثر في الأسبوع يُبرز للمراجع
export const REASON_AR = Object.freeze({ guard: 'أوقفه الحارس', unsure: 'لم يتأكد', refused: 'اعتذر', confirmed: 'طلب المشارك التأكد من خبير' });
export const GUARD_AR = Object.freeze({
  ungrounded: 'بلا سند من الكتاب', quiz: 'إجابة اختبار', write: 'كتابة عن المشارك', grade: 'تقدير درجة', personal: 'شأن شخصي',
  offtopic: 'خارج البرنامج', inject: 'محاولة تجاوز التعليمات', verify_error: 'تعذّر التحقق',
});

/** سبب المراجعة لرد واحد، أو null إن لم يستحقها. الحارس أولًا لأنه أوقف ردًا كان سيصل */
export function reviewReason(m) {
  if (m.guard) return 'guard';
  if (m.verdict === 'unsure') return 'unsure';
  if (m.verdict === 'refused') return 'refused';
  if (m.confirmed_at) return 'confirmed';
  return null;
}

/** مفتاح مقارنة الأسئلة: بلا تشكيل ولا ترقيم، والهمزات والتاء المربوطة موحّدة */
export const normQuestion = (s) => String(s || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * replies: ردود المساعد [{ id, participant_id, context, chapter_id, verdict, guard, confirmed_at, created_at }]
 * questions: أسئلة المشاركين [{ id, participant_id, body }]، وchapterLabel(id) اسم الباب
 * يعيد المجموعات بالموضع، ولكل حالة سؤالها السابق في المحادثة نفسها وعدد تكراره في الأسبوع
 */
export function buildReview(replies, questions, chapterLabel = (id) => `باب ${id}`) {
  const byP = new Map();
  for (const q of [...(questions || [])].sort((a, b) => a.id - b.id)) {
    if (!byP.has(q.participant_id)) byP.set(q.participant_id, []);
    byP.get(q.participant_id).push(q);
  }
  const before = (r) => {
    const list = byP.get(r.participant_id) || [];
    let found = null;
    for (const q of list) { if (q.id < r.id) found = q; else break; }
    return found?.body || '';
  };
  const picked = [];
  for (const r of [...(replies || [])].sort((a, b) => b.id - a.id)) {
    const reason = reviewReason(r);
    if (!reason) continue;
    picked.push({ message_id: r.id, reason, guard: r.guard || null, question: before(r), at: r.created_at,
      where: r.context === 'handbook' && r.chapter_id ? `handbook:${r.chapter_id}` : r.context || 'program', chapter_id: r.chapter_id || null });
    if (picked.length >= REVIEW_MAX) break;
  }
  const count = new Map();
  for (const it of picked) { const k = normQuestion(it.question); if (k) count.set(k, (count.get(k) || 0) + 1); }
  const groups = new Map();
  for (const it of picked) {
    it.repeats = count.get(normQuestion(it.question)) || 1;
    if (!groups.has(it.where)) {
      const label = it.where.startsWith('handbook:') ? chapterLabel(it.chapter_id) : it.where === 'capstone' ? 'المبادرة' : 'الرحلة والبرنامج';
      groups.set(it.where, { key: it.where, label, cases: [] });
    }
    groups.get(it.where).cases.push(it);
  }
  // الأكثر حالات أولًا، وداخل كل موضع المتكرر ثم الأحدث
  const out = [...groups.values()].sort((a, b) => b.cases.length - a.cases.length);
  for (const g of out) g.cases.sort((a, b) => b.repeats - a.repeats || b.message_id - a.message_id);
  const reasons = Object.fromEntries(Object.keys(REASON_AR).map((k) => [k, picked.filter((x) => x.reason === k).length]));
  return { groups: out, total: picked.length, reasons, repeated: [...count.values()].filter((n) => n >= REPEAT_MIN).length };
}

/** نسب أسبوع من أحكام ردوده [{ verdict, guard }] */
export function weekRates(rows) {
  const n = (rows || []).length;
  const c = (f) => (rows || []).filter(f).length;
  const pct = (x) => (n ? Math.round((x / n) * 1000) / 10 : null);
  return { replies: n, answered_pct: pct(c((r) => r.verdict === 'answered' && !r.guard)), unsure_pct: pct(c((r) => r.verdict === 'unsure')), guard_pct: pct(c((r) => !!r.guard)) };
}

/** سطر Slack الأسبوعي: أعداد ونسب وحدها، بلا نص سؤال ولا اسم */
export function weekLine(w, p, toReview) {
  const d = (a, b) => (a == null || b == null || a === b ? '' : ` (${a > b ? '+' : ''}${Math.round((a - b) * 10) / 10})`);
  const pct = (x) => (x == null ? '—' : `${x}٪`);
  return `🧭 مراجعة أسبوع «التوجيه والإرشاد»: ${w.replies} ردًا، أجاب ${pct(w.answered_pct)}${d(w.answered_pct, p.answered_pct)}، `
    + `لم يتأكد ${pct(w.unsure_pct)}${d(w.unsure_pct, p.unsure_pct)}، أوقفه الحارس ${pct(w.guard_pct)}${d(w.guard_pct, p.guard_pct)}. `
    + (toReview ? `${toReview} حالة تنتظر مراجعتك في «مراجعة الأسبوع».` : 'لا حالة تنتظر المراجعة.');
}
