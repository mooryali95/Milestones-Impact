// ════════════════════════════════════════════════════════════════
// نموذج «كاتون»: الجملة وحدة السؤال، وثمانية خيارات، ونقاط مبنية على اليقين
// ════════════════════════════════════════════════════════════════
// لكل موضوع ست جمل تجيب عن الأسئلة الست، ومفتاح لكل جملة (صحيحة/خاطئة/رأي بلا مفتاح).
// المشارك يختار لكل جملة خيارًا واحدًا؛ اليقين يُكافأ إن صدق ويُعاقَب إن خاب.
// المصدر: ملفا «كاتون» و«الأسس» (docs/journey/2026-11-03-التصور-المعتمد-v1.md).

// الأسئلة الست بأسمائها كما اعتمدها المالك
export const KATON_QUESTION_AR = { why: 'لماذا', what: 'ماذا', how: 'كيف', absent: 'ماذا لو', who: 'من', when: 'متى' };
export const KATON_KEY_AR = { true: 'صحيحة', false: 'خاطئة', opinion: 'رأي بلا مفتاح' };
// ترتيب العرض كما في التصميم، ومعنى كل خيار ونقاطه الافتراضية (يعدّلها الأدمن لكل برنامج)
export const KATON_OPTIONS = [
  { key: 'question', ar: 'لدي سؤال', glyph: '؟', points: 2, family: 'curiosity' },
  { key: 'research', ar: 'تحتاج بحث', glyph: '⌕', points: 2, family: 'curiosity' },
  { key: 'true', ar: 'صحيحة 100%', glyph: '✓', points: 6, family: 'certainty' },
  { key: 'false', ar: 'خاطئة 100%', glyph: '✕', points: 6, family: 'certainty' },
  { key: 'idea', ar: 'لدي فكرة', glyph: '✦', points: 3, family: 'initiative' },
  { key: 'can', ar: 'أستطيع تنفيذها', glyph: '⚙', points: 3, family: 'initiative' },
  { key: 'believe', ar: 'آمن بالرأي', glyph: '←', points: 4, family: 'openness' },
  { key: 'assume', ar: 'أفترض', glyph: '«', points: 5, family: 'openness' },
];
export const KATON_FAMILY_AR = { certainty: 'دقة التحليل', curiosity: 'الفضول البحثي', initiative: 'المبادرة', openness: 'الانفتاح الفكري' };
const BY_KEY = Object.fromEntries(KATON_OPTIONS.map((o) => [o.key, o]));

// نقاط البرنامج: الافتراضي لكل ما لم يُضبط
/** @returns {Record<string, number>} */
export function katonPoints(raw) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const o of KATON_OPTIONS) {
    const v = Number(raw?.[o.key]);
    out[o.key] = Number.isFinite(v) && raw?.[o.key] !== '' && raw?.[o.key] != null ? Math.max(0, Math.min(20, Math.round(v))) : o.points;
  }
  return out;
}

// نقاط اختيار على جملة: اليقين مقابل المفتاح (+ إن أصاب، − إن أخطأ)، واليقين على جملة رأي غير مقبول
export function katonScore(choice, key, pointsCfg) {
  const p = katonPoints(pointsCfg);
  if (!BY_KEY[choice]) return null;
  if (choice === 'true' || choice === 'false') {
    if (key !== 'true' && key !== 'false') return 0;
    return choice === key ? p[choice] : -p[choice];
  }
  return p[choice];
}

// الجملة كما تُحفظ
export function cleanSentence(r) {
  const text_ar = String(r?.text_ar || '').trim().slice(0, 600);
  if (text_ar.length < 8) throw new Error('نص الجملة قصير جدًا');
  const question = Object.hasOwn(KATON_QUESTION_AR, r?.question) ? r.question : 'what';
  const key = r?.key === 'true' || r?.key === 'false' ? r.key : 'opinion';
  const tasks = {};
  for (const t of ['support', 'lead', 'guide', 'eval']) {
    const v = String(r?.tasks?.[t] || '').trim().slice(0, 200);
    if (v) tasks[t] = v;
  }
  return { text_ar, question, key, tasks, explain_ar: String(r?.explain_ar || '').trim().slice(0, 800) || null };
}

// ملخص مشارك على كل إجاباته: النقاط، ودقة اليقين، وتوزيع العائلات الأربع
export function katonSummary(answers, sentences, pointsCfg) {
  const byId = new Map((sentences || []).map((s) => [s.id, s]));
  let total = 0, sure = 0, sureRight = 0;
  const fam = { certainty: 0, curiosity: 0, initiative: 0, openness: 0 };
  let n = 0;
  for (const a of answers || []) {
    const s = byId.get(a.sentence_id);
    const o = BY_KEY[a.choice];
    if (!s || !o) continue;
    n += 1;
    total += katonScore(a.choice, s.key, pointsCfg) || 0;
    fam[o.family] += 1;
    if (o.family === 'certainty' && (s.key === 'true' || s.key === 'false')) { sure += 1; if (a.choice === s.key) sureRight += 1; }
  }
  return {
    answered: n, total,
    // دقة التحليل: نسبة اليقين الصادق من كل يقين أبداه (null حتى يبدي يقينًا)
    accuracy: sure ? Math.round((sureRight / sure) * 100) : null,
    sure, sure_wrong: sure - sureRight,
    families: Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, n ? Math.round((v / n) * 100) : 0])),
  };
}

// توزيع إجابات جملة على الخيارات (للخبير وشاشة القاعة)
export function sentenceDistribution(answers) {
  const out = Object.fromEntries(KATON_OPTIONS.map((o) => [o.key, 0]));
  for (const a of answers || []) if (a.choice in out) out[a.choice] += 1;
  return out;
}
