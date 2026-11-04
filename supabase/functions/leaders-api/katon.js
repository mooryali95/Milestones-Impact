// ════════════════════════════════════════════════════════════════
// نموذج «كاتون»: الجملة وحدة السؤال، وحكم بثقة مدرَّجة، ووسوم موقف بلا نقاط
// ════════════════════════════════════════════════════════════════
// لكل موضوع ست جمل تجيب عن الأسئلة الست، ومفتاح لكل جملة (صحيحة/خاطئة/رأي بلا مفتاح).
// المشارك يحكم على الجملة (صحيحة أو خاطئة) بدرجة ثقة من ثلاث: أرجّح (C1) أو واثق (C2) أو متيقن (C3)،
// والنقاط جدول Gardner-Medwin الثلاثي: الصواب 1/2/3 والخطأ 0/−2/−6، فالإفصاح الصادق عن الثقة هو
// الاستراتيجية المثلى (قاعدة تسجيل سليمة: منحنيات القيمة المتوقعة تتقاطع عند 67% و80%).
// الموقف (لدي سؤال، تحتاج بحث، لدي فكرة، أستطيع تنفيذها، آمن بالرأي، أفترض) وسوم بلا نقاط تُستعمل
// في القاعة والمهام؛ تسجيلها بنقاط هو ما كان يفسد القياس (الملحق 5 §5).
// المصدر: ملفا «كاتون» و«الأسس» (docs/journey/2026-11-03-التصور-المعتمد-v1.md) وإعادة التصميم (المرحلة ط).

// الأسئلة الست بأسمائها كما اعتمدها المالك
export const KATON_QUESTION_AR = { why: 'لماذا', what: 'ماذا', how: 'كيف', absent: 'ماذا لو', who: 'من', when: 'متى' };
export const KATON_KEY_AR = { true: 'صحيحة', false: 'خاطئة', opinion: 'رأي بلا مفتاح' };
export const KATON_VERDICT_AR = { true: 'صحيحة', false: 'خاطئة' };
// درجات الثقة الثلاث: التسمية ونطاق الاحتمال الذي تمثله واحتماله الممثِّل (لحساب Brier)
export const KATON_CONFIDENCE = {
  1: { ar: 'أرجّح', band: 'أقل من 67%', p: 0.58 },
  2: { ar: 'واثق', band: 'من 67% إلى 80%', p: 0.74 },
  3: { ar: 'متيقن', band: 'فوق 80%', p: 0.9 },
};
// وسوم الموقف: بلا نقاط، ويُكتب معها ما يراه الخبير والفريق
export const KATON_STANCES = [
  { key: 'question', ar: 'لدي سؤال', glyph: '؟', family: 'curiosity', note: true },
  { key: 'research', ar: 'تحتاج بحث', glyph: '⌕', family: 'curiosity', note: true },
  { key: 'idea', ar: 'لدي فكرة', glyph: '✦', family: 'initiative', note: true },
  { key: 'can', ar: 'أستطيع تنفيذها', glyph: '⚙', family: 'initiative', note: true },
  { key: 'believe', ar: 'آمن بالرأي', glyph: '←', family: 'openness', note: false },
  { key: 'assume', ar: 'أفترض', glyph: '«', family: 'openness', note: false },
];
export const KATON_STANCE_KEYS = KATON_STANCES.map((s) => s.key);
export const KATON_FAMILY_AR = { curiosity: 'الفضول البحثي', initiative: 'المبادرة', openness: 'الانفتاح الفكري' };
const STANCE_BY_KEY = Object.fromEntries(KATON_STANCES.map((s) => [s.key, s]));

// جدول النقاط الافتراضي (Gardner-Medwin): right[c] للصواب وwrong[c] للخطأ بدرجة الثقة c
export const KATON_DEFAULT_POINTS = { right: { 1: 1, 2: 2, 3: 3 }, wrong: { 1: 0, 2: -2, 3: -6 } };
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// جدول البرنامج كما يُقرأ: الافتراضي لكل ما لم يُضبط (أو ضُبط بالشكل القديم ذي الخيارات الثمانية)
/** @returns {{ right: Record<number, number>, wrong: Record<number, number> }} */
export function katonPoints(raw) {
  const out = { right: { ...KATON_DEFAULT_POINTS.right }, wrong: { ...KATON_DEFAULT_POINTS.wrong } };
  for (const side of ['right', 'wrong']) for (const c of [1, 2, 3]) {
    const v = num(raw?.[side]?.[c]);
    if (Number.isFinite(v)) out[side][c] = Math.max(-20, Math.min(20, Math.round(v)));
  }
  return out;
}

// هل الجدول قاعدة تسجيل سليمة؟ القيمة المتوقعة E_c(q) = q·right[c] + (1−q)·wrong[c] يجب أن تتقاطع
// بترتيب تصاعدي: الدرجة 1 الأفضل لثقة منخفضة، ثم 2، ثم 3 لثقة عالية، وتقاطعاها داخل (0.5، 1).
export function cbmCheck(raw) {
  const t = katonPoints(raw);
  const cross = (a, b) => {
    const d = (t.right[b] - t.right[a]) + (t.wrong[a] - t.wrong[b]);
    return d ? (t.wrong[a] - t.wrong[b]) / d : null;
  };
  const q12 = cross(1, 2), q23 = cross(2, 3);
  const issues = [];
  if (!(t.right[1] >= 0 && t.right[2] > t.right[1] && t.right[3] > t.right[2])) issues.push('مكافأة الصواب تتصاعد مع الثقة (1 < 2 < 3) ولا تكون سالبة');
  if (!(t.wrong[1] <= 0 && t.wrong[2] < t.wrong[1] && t.wrong[3] < t.wrong[2])) issues.push('عقوبة الخطأ تتصاعد مع الثقة ولا تكون موجبة');
  if (q12 == null || q23 == null || !(q12 >= 0.5 && q12 < q23 && q23 < 1)) issues.push('نقطتا التقاطع يجب أن تقعا بين 50% و100% بترتيب تصاعدي، وإلا صار الكذب عن الثقة مجزيًا');
  const r2 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
  return { ok: !issues.length, issues, thresholds: { c1_c2: r2(q12), c2_c3: r2(q23) }, table: t };
}

// نقاط حكم على جملة: الصواب والخطأ بدرجة الثقة؛ جملة الرأي لا تُسجَّل؛ بلا حكم صفر
export function katonScore(answer, key, pointsCfg) {
  const a = normalizeAnswer(answer);
  if (key !== 'true' && key !== 'false') return null;
  if (!a.verdict) return 0;
  const p = katonPoints(pointsCfg);
  return a.verdict === key ? p.right[a.confidence] : p.wrong[a.confidence];
}

// الإجابة كما تُقرأ من الصف (الجديد: verdict/confidence/stances؛ القديم: choice وحده)
export function normalizeAnswer(a) {
  if (!a) return { verdict: null, confidence: null, stances: [] };
  if (a.verdict === 'true' || a.verdict === 'false') {
    const c = [1, 2, 3].includes(Number(a.confidence)) ? Number(a.confidence) : 3;
    return { verdict: a.verdict, confidence: c, stances: cleanStances(a.stances) };
  }
  // صف قديم: «صحيحة 100%» حكم بأعلى ثقة، وغيره وسم موقف
  if (a.choice === 'true' || a.choice === 'false') return { verdict: a.choice, confidence: 3, stances: cleanStances(a.stances) };
  return { verdict: null, confidence: null, stances: cleanStances(a.stances?.length ? a.stances : a.choice ? [a.choice] : []) };
}
export const cleanStances = (v) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((k) => Object.hasOwn(STANCE_BY_KEY, k)))];

// الإجابة كما تُحفظ: حكم بثقة، أو وسم موقف واحد على الأقل، أو كلاهما
export function cleanAnswer(raw) {
  const verdict = raw?.verdict === 'true' || raw?.verdict === 'false' ? raw.verdict : null;
  const confidence = verdict ? Number(raw?.confidence) : null;
  if (verdict && ![1, 2, 3].includes(confidence)) throw new Error('حدد درجة ثقتك: أرجّح أو واثق أو متيقن');
  const stances = cleanStances(raw?.stances);
  if (!verdict && !stances.length) throw new Error('احكم على الجملة أو اختر موقفًا منها');
  const note = String(raw?.note || '').trim().slice(0, 1000) || null;
  return { verdict, confidence, stances, note };
}

// ── حارس الصياغة (الملحق 5 §5.4.3) ──
// الجمل الخاطئة لا تحمل قرائن إطلاق يُستدل بها على المفتاح من الصياغة؛ والمحوّطة ليست دليلًا على الصحة
export const ABSOLUTE_CUES = /(دائمًا|أبدًا|مطلقًا|إطلاقًا|حصرًا|فقط|تمامًا|بالكامل|وحده|وحدها|في كل الأحوال|مرة واحدة|لا دور|كل أنواع|جميع|لا يؤثر|لا شيء مما|كل ما سبق)/;
export const HEDGE_CUES = /(قد |يمكن|ربما|بحسب|غالبًا|أحيانًا|في الغالب|يُفضَّل|يُستحسن|في أغلب)/;
export const absoluteCue = (text) => { const m = String(text || '').match(ABSOLUTE_CUES); return m ? m[1] : null; };
export const isHedged = (text) => HEDGE_CUES.test(String(text || ''));

// الجملة كما تُحفظ
export function cleanSentence(r) {
  const text_ar = String(r?.text_ar || '').trim().slice(0, 600);
  if (text_ar.length < 8) throw new Error('نص الجملة قصير جدًا');
  const question = Object.hasOwn(KATON_QUESTION_AR, r?.question) ? r.question : 'what';
  const key = r?.key === 'true' || r?.key === 'false' ? r.key : 'opinion';
  const cue = key === 'false' ? absoluteCue(text_ar) : null;
  if (cue) throw new Error(`الجملة الخاطئة تحمل قرينة إطلاق («${cue}») يُستدل بها على المفتاح؛ صُغها محوّطة كالصحيحة`);
  const tasks = {};
  for (const t of ['support', 'lead', 'guide', 'eval']) {
    const v = String(r?.tasks?.[t] || '').trim().slice(0, 200);
    if (v) tasks[t] = v;
  }
  return { text_ar, question, key, tasks, explain_ar: String(r?.explain_ar || '').trim().slice(0, 800) || null };
}

// ما يعيب موضوعًا قبل نشره: أقل من جملتين خاطئتين، أو لا جملة صحيحة حازمة، أو قرينة إطلاق في خاطئة
export function topicIssues(sentences) {
  const ss = sentences || [];
  const falses = ss.filter((s) => s.key === 'false'), trues = ss.filter((s) => s.key === 'true');
  const issues = [];
  if (ss.length < 2) issues.push('لا يُنشر موضوع بأقل من جملتين');
  if (falses.length < 2) issues.push(`جملتان خاطئتان على الأقل لكل موضوع (الآن ${falses.length})`);
  if (trues.length && trues.every((s) => isHedged(s.text_ar))) issues.push('كل الجمل الصحيحة محوّطة (قد/يمكن/بحسب)؛ اجعل بعضها حازمة حتى لا تدل الصياغة على المفتاح');
  for (const s of falses) { const cue = absoluteCue(s.text_ar); if (cue) issues.push(`جملة خاطئة بقرينة إطلاق («${cue}»): ${String(s.text_ar).slice(0, 40)}…`); }
  return issues;
}

// ── مقاييس المعايرة (الملحق 5 §5.4.4) ──
// على كل الأحكام لا على من تيقن فقط (فلا انحياز بالانتقاء الذاتي):
//   الدقة = نسبة الأحكام الصائبة؛ Brier = متوسط (p − صواب)² حيث p احتمال درجة الثقة؛
//   المعايرة = (1 − Brier) × 100 وهي ما يدخل التقييم المستمر؛ فرط الثقة = متوسط p − الدقة (موجب = مفرط)؛
//   الامتناع = نسبة جمل المفتاح التي لم يحكم عليها؛ ومنحنى المعايرة: الدقة لكل درجة ثقة مقابل احتمالها.
export function katonSummary(answers, sentences, pointsCfg) {
  const byId = new Map((sentences || []).map((s) => [s.id, s]));
  let total = 0, n = 0, keyed = 0, judged = 0, right = 0, brier = 0, pSum = 0;
  const curve = { 1: { n: 0, right: 0 }, 2: { n: 0, right: 0 }, 3: { n: 0, right: 0 } };
  const fam = { curiosity: 0, initiative: 0, openness: 0 };
  let stanced = 0;
  for (const raw of answers || []) {
    const s = byId.get(raw.sentence_id);
    if (!s) continue;
    const a = normalizeAnswer(raw);
    n += 1;
    for (const k of a.stances) fam[STANCE_BY_KEY[k].family] += 1;
    if (a.stances.length) stanced += 1;
    const hasKey = s.key === 'true' || s.key === 'false';
    if (!hasKey) continue;
    keyed += 1;
    if (!a.verdict) continue;
    judged += 1;
    total += katonScore(a, s.key, pointsCfg) || 0;
    const ok = a.verdict === s.key ? 1 : 0;
    const p = KATON_CONFIDENCE[a.confidence].p;
    right += ok; pSum += p; brier += (p - ok) ** 2;
    curve[a.confidence].n += 1; curve[a.confidence].right += ok;
  }
  const pct = (x, d) => (d ? Math.round((x / d) * 100) : null);
  const b = judged ? Math.round((brier / judged) * 1000) / 1000 : null;
  return {
    answered: n, total, keyed, judged,
    accuracy: pct(right, judged), wrong: judged - right,
    brier: b, calibration: b == null ? null : Math.round((1 - b) * 100),
    overconfidence: judged ? Math.round((pSum / judged - right / judged) * 100) : null,
    abstention: pct(keyed - judged, keyed),
    curve: Object.fromEntries([1, 2, 3].map((c) => [c, { n: curve[c].n, accuracy: pct(curve[c].right, curve[c].n), expected: Math.round(KATON_CONFIDENCE[c].p * 100) }])),
    stances: { with_stance: pct(stanced, n), families: Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, pct(v, n) ?? 0])) },
  };
}

// توزيع إجابات جملة: الحكم بدرجته (true1..false3) ووسوم الموقف (للخبير وشاشة القاعة)
export function sentenceDistribution(answers) {
  const out = { true1: 0, true2: 0, true3: 0, false1: 0, false2: 0, false3: 0, none: 0 };
  for (const k of KATON_STANCE_KEYS) out[k] = 0;
  for (const raw of answers || []) {
    const a = normalizeAnswer(raw);
    if (a.verdict) out[`${a.verdict}${a.confidence}`] += 1; else out.none += 1;
    for (const k of a.stances) out[k] += 1;
  }
  return out;
}
