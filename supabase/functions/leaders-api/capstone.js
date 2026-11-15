// ════════════════════════════════════════════════════════════════
// مشروع التخرج القيادي («وثيقة المبادرة»): المنطق الصافي
// ════════════════════════════════════════════════════════════════
// مصدر واحد لكل معلومة، والباقي يستورد منه:
//   • فصول الوثيقة هي النماذج التعليمية نفسها (learning_models ذات
//     capstone_sort)، فلا محرر ثانٍ ولا قائمة تقييم ثانية ولا نقاط ثانية.
//   • اسم المبادرة يُكتب مرة في «بطاقة المبادرة»، ويظهر في كل نموذج حقله
//     مربوط بها (bind: 'initiative') للقراءة فقط.
//   • الجدول الذي يبنى على جدول آخر يستورد صفوفه منه (import) بمطابقة
//     أسماء الأعمدة، كمخاطر ورقة البوابة من سجل المخاطر.
//   • نوع المبادرة (مشروع، برنامج، محفظة) من نطاق عمل المشارك في ملفه،
//     والمستوى من التسكين المعتمد، والمسار وأولويته من جدول المسارات.
// بلا قاعدة بيانات ولا Deno، فيُختبر في vitest ويستورده الخادم والتطبيقان.
import { DIMENSIONS, fieldsFor, latinDigits, missingFields, modelsFor } from './logic.js';

export const CHARTER_KEY = 'initiative-charter';
export const SCOPE_TITLES = { project: 'مشروع', program: 'برنامج', portfolio: 'محفظة' };
export const SCOPE_LEAD = { project: 'قيادة مشروع', program: 'إدارة برنامج', portfolio: 'إدارة محفظة' };
export const STATUS_TITLES = {
  draft: 'قيد البناء', submitted: 'بانتظار مراجعة المستشار', returned: 'أُعيد للتحسين',
  accepted: 'بانتظار تأييد الراعي', approved: 'معتمد',
};
// ما تقوله الإدارة: المخاطَب هو المستشار نفسه
export const STATUS_TITLES_ADMIN = { ...STATUS_TITLES, submitted: 'بانتظار مراجعتك', accepted: 'بانتظار الراعي' };
// الوثيقة لا تُسلَّم قبل اكتمال فصولها وبلوغ الجاهزية هذا الحد
// نقاط اعتماد الوثيقة: تُمنح مرة عند الاعتماد، وتعرضها الواجهة من هنا
export const APPROVAL_POINTS = 100;
export const READY_MIN = 80;
// تحسين واحد بعد ملاحظات المستشار، ثم يُعتمد أو يُعاد بقرار مسبب
export const MAX_REVISIONS = 1;

// ── معيار التقييم: أبعاد RUBRIC، كل منها من 1 إلى RUBRIC_MAX ──
// dimension: الإطار الذي يقيسه البعد؛ أبعاد الإطار الأولوي في مسار المشارك
// تُضاعف أوزانها، فيُقيَّم كل مسار بعدسته دون 27 معيارًا.
export const RUBRIC = [
  { key: 'strategy', dimension: 'impact', title: 'الاتساق الاستراتيجي',
    anchors: ['المشكلة عامة ولا رابط واضح بأهداف الجهة', 'مشكلة محددة وربط عام بالأهداف', 'مشكلة بالأرقام وربط صريح وبدائل مقارنة', 'مسوغ مقنع لصانع القرار: أرقام ومصادر وبدائل بمعايير وتوصية مسببة'],
    levels: {
      beginner: ['المشكلة عامة بلا أرقام', 'مشكلة محددة بلا ربط بهدف الجهة', 'مشكلة بالأرقام وربط صريح بهدف الجهة', 'مشكلة بأرقام من مصدر معروف، وربط بهدف الجهة، وسبب واضح لماذا الآن'],
      advanced: ['المشكلة عامة ولا رابط بالاستراتيجية', 'ربط بالأهداف وبدائل بلا معايير', 'بدائل بمعايير موزونة وتوصية مسببة', 'حالة استثمار تقنع صانع القرار: أدلة بمصادرها، ومعايير موزونة، وتكلفة مقابل منفعة، وتوصية تصمد للنقد'],
    } },
  { key: 'planning', dimension: 'milestone', title: 'واقعية التخطيط',
    anchors: ['تجزئة ناقصة وجدول بلا منطق', 'تجزئة معقولة وجدول بتواريخ', 'تجزئة كاملة بقاعدة 100% وجدول باعتماديات وتكلفة بالحزم', 'خطة قابلة للتنفيذ غدًا: مسار حرج واحتياطي مبرر وتكلفة مطابقة للميزانية'],
    levels: {
      beginner: ['معالم بلا تواريخ أو بلا معايير تحقق', 'معالم بتواريخ وجدول بلا منطق', 'معالم من الأنواع الأربعة بمعايير تحقق، وجدول بتواريخ واعتماديات', 'خطة قابلة للتنفيذ غدًا: معالم قرار وقيمة بأصحابها، وجدول متسق مع مدة المبادرة'],
      advanced: ['تجزئة ناقصة وجدول بلا منطق', 'تجزئة كاملة وجدول بمسار حرج', 'مسار حرج واحتياطي مبرر وتكلفة مطابقة للميزانية', 'خطة تصمد للصدمة: سيناريو تأخير محسوب، واحتياطي مبرر بالمخاطر، وتكلفة تستردها منفعة مقيسة'],
    } },
  { key: 'value', dimension: 'impact', title: 'القيمة والدليل',
    anchors: ['منافع وصفية بلا مؤشرات', 'مؤشرات بلا خط أساس', 'مؤشرات بخط أساس ومستهدف ومصدر', 'سلسلة نتائج متماسكة وخطة أدلة تميّز المساهمة من الإسناد'],
    levels: {
      beginner: ['منافع وصفية بلا مؤشرات', 'مؤشرات بلا خط أساس', 'لكل منفعة مؤشر وخط أساس ومستهدف ومالك', 'منافع مميزة عن المخرجات، بمؤشرات قابلة للقياس وموعد تحقق واقعي'],
      advanced: ['منافع بلا خطة أدلة', 'خطة أدلة بلا تمييز للمساهمة', 'سلسلة نتائج متماسكة تميّز المساهمة من الإسناد', 'مستوى دليل مصرح به لكل مؤشر على سلّم الأدلة، يناسب حجم القرار المبني عليه'],
    } },
  { key: 'governance', dimension: 'leadership', title: 'الحوكمة والملكية',
    anchors: ['لا يتضح من يقرر', 'أدوار مذكورة دون مساءلة', 'مصفوفة مسؤوليات ومالك لكل منفعة وإيقاع قرار', 'حوكمة متناسبة مع الحجم ومساءلة واحدة لكل قرار وملاك منافع من الجهة'],
    levels: {
      beginner: ['لا يتضح من يقرر', 'أدوار مذكورة دون مساءلة', 'مصفوفة مسؤوليات بمحاسب واحد لكل بند', 'من يقرر ماذا واضح لكل بند، والراعي ومالكو المنافع من الجهة نفسها'],
      advanced: ['لا يتضح من يقرر', 'مصفوفة بلا إيقاع قرار', 'إيقاع قرار وتصعيد وملاك منافع من الجهة', 'حوكمة متصلة بحوكمة البرنامج أو المحفظة، متناسبة مع الحجم، بمساءلة واحدة لكل قرار'],
    } },
  { key: 'risk', dimension: 'milestone', title: 'المخاطر والتغيير',
    anchors: ['مخاطر عامة بلا استجابة', 'مخاطر بمالكين', 'سجل مرتبط بالخطة واستجابات محددة وخطة تسليم', 'استباق للمخاطر الحرجة وخطة تغيير واستدامة تحمي المنافع بعد الإغلاق'],
    levels: {
      beginner: ['مخاطر عامة بلا استجابة', 'مخاطر بمالكين', 'لكل خطر مالك واستجابة محددة، وخطة تسليم لمن يشغّل بعد الإغلاق', 'مخاطر من واقع المبادرة لا عامة، وتسليم وتسلم يحمي المنافع بعد الإغلاق'],
      advanced: ['مخاطر عامة', 'سجل بمالكين واستجابات', 'استباق للمخاطر الحرجة بشهية مخاطرة معلنة وخطة تغيير', 'مخاطر وتغيير يُداران معًا: كسب المقاومين المؤثرين، وحماية المنافع بعد الإغلاق'],
    } },
  { key: 'leadership', dimension: 'leadership', title: 'النضج القيادي',
    anchors: ['وصف للعمل لا للقائد', 'تأمل عام', 'تأمل صادق بأمثلة وخطة تطوير مرتبطة', 'قصة تحول بدليل: ما تغيّر فيه هو، وما تغيّر بسببه'],
    levels: {
      beginner: ['وصف للعمل لا للقائد', 'تأمل عام', 'تأمل صادق بأمثلة وخطة تطوير بسلوك أسبوعي', 'قصة تحول بدليل: ما تغيّر فيك، وما تغيّر في فريقك بسببك'],
      advanced: ['وصف للعمل لا للقائد', 'تأمل عام', 'قصة تحول بدليل وخطة تطوير مرتبطة', 'قصة تحول بدليل، ومن بنيته قائدًا في فريقك يقود بعدك'],
    } },
];
// مراسي كل بعد بمستوى المشارك في إطاره: الدرجة 4 تعني إتقان المطلوب من
// مستواه، فلا يُحرم التأسيسي منها لحقول لا تظهر له. المتوسط هو المراسي الأصل.
export const rubricFor = (levels) => RUBRIC.map(({ levels: by, ...r }) => ({ ...r, level: levels?.[r.dimension] || null, anchors: by?.[levels?.[r.dimension]] || r.anchors }));
export const RUBRIC_MAX = 4;

// درجة المعيار من 100: كل بعد وزنه 1، وأبعاد الإطار الأولوي وزنها 2.
// priority هنا من rubricPriority (logic.js): null إذا تساوت المستويات الثلاثة،
// فلا يُضاعف وزن أي إطار.
export const PRIORITY_WEIGHT = 2;
/** @param {any} scores @param {string | null} [priority] */
export function rubricScore(scores, priority = null) {
  let got = 0, max = 0;
  for (const r of RUBRIC) {
    const s = Math.round(Number(scores?.[r.key]));
    if (!(s >= 1 && s <= RUBRIC_MAX)) return null;
    const w = r.dimension === priority ? PRIORITY_WEIGHT : 1;
    got += w * s; max += w * RUBRIC_MAX;
  }
  return Math.round((got / max) * 1000) / 10;
}

export function cleanRubric(scores, notes) {
  const s = {}, n = {};
  for (const r of RUBRIC) {
    const v = Math.round(Number(scores?.[r.key]));
    if (!(v >= 1 && v <= RUBRIC_MAX)) throw new Error(`قيّم بُعد «${r.title}» من 1 إلى ${RUBRIC_MAX}`);
    s[r.key] = v;
    const t = String(notes?.[r.key] ?? '').trim().slice(0, 1500);
    if (t) n[r.key] = t;
  }
  return { scores: s, notes: n };
}

// ── نتيجة القائد ──
// D05: لا حساب موازٍ هنا. النتيجة من التقييم الختامي وحده (computeFinal في final.js)، ومنها الشهادة.

// ── الفصول ──
// نماذج الوثيقة كما تخص المشارك: نماذج capstone_sort المتاحة بمستواه ونطاقه
export function capstoneModels(models, levels, scope) {
  return modelsFor((models || []).filter((m) => m.capstone_sort != null), levels, scope)
    .sort((a, b) => a.capstone_sort - b.capstone_sort);
}

// حقول نموذج للمشارك: بمستواه في بُعد النموذج ونطاقه، وحقول التعمق إن كان
// بُعد النموذج محور الأولوية في مساره
export const modelFields = (/** @type {any} */ m, /** @type {any} */ levels, /** @type {any} */ scope, /** @type {string | null} */ priority = null) => fieldsFor(m.fields, levels?.[m.dimension], scope, !!priority && m.dimension === priority);

// مشروع المسار التطبيقي من مصدره الوحيد: فصول الوثيقة نفسها بمستوى المشارك
// ونطاقه، وما يتعمق فيه منها بمحور أولويته. لا نص يُكتب يدويًا لكل مسار.
const chaptersWord = (n) => (n === 1 ? 'فصل واحد' : n === 2 ? 'فصلين' : n <= 10 ? `${n} فصول` : `${n} فصلًا`);
export function trackProject(models, levels, scope, priority) {
  const mine = capstoneModels(models, levels, scope);
  if (!mine.length) return null;
  const deep = mine.filter((m) => m.dimension === priority).map((m) => m.title_ar);
  const where = scope ? ` على مستوى ${SCOPE_TITLES[scope]}` : '';
  const text = `وثيقة مبادرة حقيقية في جهتك${where}، يؤيدها راعيها، في ${chaptersWord(mine.length)}`
    + (deep.length ? `، وتتعمق فيها بحسب مسارك: ${deep.join('، ')}.` : '.');
  return { chapters: mine.length, deep, text };
}

// الحقول المربوطة تأخذ قيمتها من المصدر وتُقفل، فلا تُكتب مرتين
export function bindAnswers(fields, answers, initiative) {
  const out = { ...(answers || {}) };
  for (const f of fields || []) if (f.bind === 'initiative' && initiative) out[f.key] = initiative;
  return out;
}

// اسم المبادرة من مصدره الوحيد: حقل title في بطاقة المبادرة
export const initiativeOf = (charterAnswers) => String(charterAnswers?.title || '').trim() || null;

// D18: الوثيقة كما تصل الجهة أو راعي المبادرة: مستواها العام ومسارها (بمحور أولويته) مشتقان من المستويات،
// فلا يبقيان إلا بموافقة المشارك، ومع صلاحية المستويات حين يطّلع منسق الجهة
export const docLevelsFor = (/** @type {any} */ doc, /** @type {boolean} */ show) => (show || !doc?.meta ? doc : { ...doc, meta: { ...doc.meta, level: null, track: null } });

export const norm = (t) => String(t || '').replace(/\(.*?\)/g, '').replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
const SYNONYMS = [['الخطر', 'البند', 'الوصف'], ['الاجراء', 'الاستجابه', 'التدخل'], ['المسؤول', 'المالك'], ['المؤشر', 'المقياس']].map((g) => g.map(norm));
// أقرب عمود في المصدر لعمود الهدف: نفس الاسم، أو اسم يحتوي الآخر
function columnMap(target, source) {
  const s = source.map(norm);
  return target.map((c) => {
    const t = norm(c);
    let i = s.indexOf(t);
    if (i < 0) i = s.findIndex((x) => x && t && (x.includes(t) || t.includes(x)));
    if (i < 0) {
      const head = t.split(' ')[0];
      i = s.findIndex((x) => x.split(' ')[0] === head);
    }
    // أسماء مختلفة للمعنى نفسه بين النماذج: «الخطر» في البوابة هو «الوصف» في السجل
    if (i < 0) {
      const g = SYNONYMS.find((w) => w.some((x) => t.startsWith(x)));
      if (g) i = s.findIndex((x) => g.some((y) => x.startsWith(y)));
    }
    return i;
  });
}

// صفوف مستوردة من جدول نموذج آخر إلى أعمدة هذا الجدول (لقطة يعدّلها المشارك)
export function importRows(targetCols, sourceCols, rows, filter = null) {
  const map = columnMap(targetCols || [], sourceCols || []);
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => Array.isArray(r) && String(r[0] || '').trim())
    .filter((r) => !filter || filter(r))
    .map((r) => map.map((i) => (i >= 0 ? String(r[i] ?? '') : '')));
}

// ── قراءة الجداول بدلالة أعمدتها ──
// الإدارة قد تعيد صياغة الأعمدة، فالعمود يُعرف بكلمة دالة لا بموضعه
function table(model, answers, fieldKey) {
  const f = (model?.fields || []).find((x) => x.key === fieldKey && x.type === 'table');
  if (!f) return null;
  const rows = (Array.isArray(answers?.[fieldKey]) ? answers[fieldKey] : []).filter((r) => Array.isArray(r) && r.some((c) => String(c || '').trim()));
  const cols = (f.columns || []).map(norm);
  const col = (...words) => cols.findIndex((c) => words.some((w) => c.includes(norm(w))));
  return { rows, col, cell: (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '') };
}

export function parseNumber(v) {
  const s = latinDigits(v).replace(/[٬,\s]/g, '').replace('٫', '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// تاريخ بصيغة 2026-03-15 أو 15/3/2026، وإلا null
export function parseDate(v) {
  const s = latinDigits(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return null;
}
// التاريخ كما يقرؤه الراعي: «1 مارس 2027» بالتقويم الميلادي وأرقام لاتينية كبقية المنصة، لا 2027-03-01 خامًا
// يتقلب ترتيبه في السطر العربي (links-expert-7). ما لا يُفهم تاريخًا يُعرض كما كُتب
export function dateAr(v) {
  const ts = parseDate(v ?? '');
  return ts == null ? String(v ?? '') : new Date(ts).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

const codeOf = (v) => String(v || '').trim().replace(/\s+/g, '').toUpperCase();
// رمز في أول الخلية قبل اسم الحزمة («1.1 رحلة المستفيد»)، كما يكتبه المشارك حين يُطلب منه «الرمز أو الاسم»
const leadCode = (v) => codeOf(String(v || '').trim().split(/\s+/)[0]);
const listCodes = (v) => String(v || '').split(/[،,;\s]+/).map(codeOf).filter(Boolean);

// تكلفة صف: الإجمالي إن كُتب، وإلا الكمية × سعر الوحدة
function rowCost(t, r) {
  const total = parseNumber(t.cell(r, t.col('الإجمالي', 'المجموع')));
  if (total != null) return total;
  const q = parseNumber(t.cell(r, t.col('الكمية'))), u = parseNumber(t.cell(r, t.col('سعر الوحدة', 'السعر')));
  return q != null && u != null ? q * u : null;
}

export function costSummary(model, answers) {
  const t = table(model, answers, 'items');
  if (!t) return null;
  const code = t.col('رمز', 'الحزمة');
  const by = {};
  let total = 0;
  for (const r of t.rows) {
    const c = rowCost(t, r) || 0;
    total += c;
    const k = codeOf(t.cell(r, code)) || '—';
    by[k] = (by[k] || 0) + c;
  }
  const contingency = parseNumber(answers?.contingency);
  const envelope = parseNumber(answers?.envelope);
  const pct = contingency != null && contingency > 0 && contingency <= 50 ? contingency : 0;
  return { total, by, contingency: pct, withContingency: Math.round(total * (1 + pct / 100)), envelope };
}

// ── محرك الاتساق: الفصول تتحدث مع بعضها ──
// ctx: { scope, models: { key: model }, answers: { key: answers } }
// كل فحص يطبَّق متى وُجد فصلاه في وثيقة المشارك، وإلا يُتجاوز.
// فحوص حاجبة: لا تُسلَّم وثيقة تخالفها مهما بلغت الجاهزية. هي ما يجعل المبادرة قابلة للاعتماد
// في أي جهة: راعٍ حقيقي، ومحاسب واحد، وتكلفة ضمن الميزانية، ومنفعة لها مالك، وخطر عالٍ له مالك.
export const BLOCKING = new Set(['raci-a', 'cost-envelope', 'benefit-owner', 'risk-owner']);
export function capstoneChecks(ctx) {
  const M = ctx.models || {}, A = ctx.answers || {};
  const has = (...keys) => keys.every((k) => M[k]);
  const out = [];
  const add = (key, title, ok, detail) => out.push({ key, title, ok: !!ok, detail: ok ? null : detail, ...(BLOCKING.has(key) ? { blocking: true } : {}) });

  const wbs = has('wbs') ? table(M.wbs, A.wbs, 'packages') : null;
  const wbsCodes = wbs ? wbs.rows.map((r) => codeOf(wbs.cell(r, wbs.col('الرمز')))).filter(Boolean) : [];
  const wbsNames = wbs ? wbs.rows.map((r) => norm(wbs.cell(r, wbs.col('حزمه العمل', 'الحزمه')))).filter(Boolean) : [];
  const known = (v) => { const c = codeOf(v), n = norm(v); return wbsCodes.includes(c) || (n && wbsNames.some((w) => w === n || w.includes(n) || n.includes(w))); };

  if (has(CHARTER_KEY)) {
    const e = String(A[CHARTER_KEY]?.sponsor_email || '').trim();
    // الراعي اختياري: يقوّي الوثيقة بتأييد من الجهة، ولا يمنع تسليمها (قرار المالك 2026-11-03)
    if (e) add('sponsor', 'بريد راعي المبادرة صحيح', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e), 'صحّح بريد الراعي في بطاقة المبادرة، أو احذفه إن لم يكن للمبادرة راعٍ.');
  }
  if (has('options-analysis')) {
    const t = table(M['options-analysis'], A['options-analysis'], 'options');
    const base = t && t.rows.some((r) => /عدم|الوضع الحالي|بلا تدخل|لا شيء/.test(t.cell(r, 0)));
    add('do-nothing', 'البدائل تشمل خيار عدم التدخل للمقارنة', base, 'أضف بديل «عدم التدخل» أو «الوضع الحالي»، فهو خط المقارنة لكل بديل آخر.');
  }
  if (wbs) {
    const owner = wbs.col('المالك');
    const missing = wbs.rows.filter((r) => !wbs.cell(r, owner)).map((r) => wbs.cell(r, 0) || wbs.cell(r, 1));
    add('wbs-owner', 'لكل حزمة عمل مالك واحد', wbs.rows.length && !missing.length, `حزم بلا مالك: ${missing.slice(0, 6).join('، ')}`);
  }
  if (wbs && has('governance')) {
    const raci = table(M.governance, A.governance, 'raci');
    const cover = raci ? raci.rows.map((r) => raci.cell(r, 0)) : [];
    const a = raci ? raci.col('المحاسب', 'A') : -1;
    const noA = raci ? raci.rows.filter((r) => !raci.cell(r, a)).map((r) => raci.cell(r, 0)) : [];
    const uncovered = wbsCodes.filter((c, i) => !cover.some((x) => codeOf(x) === c || leadCode(x) === c || (wbsNames[i] && norm(x).includes(wbsNames[i]))));
    add('raci-cover', 'مصفوفة المسؤوليات تغطي حزم العمل', wbsCodes.length && uncovered.length <= Math.floor(wbsCodes.length / 4), `حزم لم تظهر في مصفوفة المسؤوليات: ${uncovered.slice(0, 6).join('، ')}`);
    add('raci-a', 'لكل بند في المصفوفة محاسب واحد', raci && raci.rows.length && !noA.length, `بنود بلا محاسب: ${noA.slice(0, 6).join('، ')}`);
  }
  if (wbs && has('cost-plan')) {
    const t = table(M['cost-plan'], A['cost-plan'], 'items');
    const costed = new Set(t ? t.rows.map((r) => codeOf(t.cell(r, t.col('رمز', 'الحزمه')))) : []);
    const free = wbsCodes.filter((c) => !costed.has(c));
    add('cost-cover', 'التكلفة مقدّرة لحزم العمل', wbsCodes.length && free.length <= Math.floor(wbsCodes.length / 3), `حزم بلا تكلفة: ${free.slice(0, 6).join('، ')}`);
  }
  if (has('cost-plan')) {
    const c = costSummary(M['cost-plan'], A['cost-plan']);
    if (c && c.envelope != null) {
      add('cost-envelope', 'التكلفة مع الاحتياطي ضمن الميزانية المتاحة', c.withContingency <= c.envelope,
        `التكلفة مع الاحتياطي ${c.withContingency.toLocaleString('en')} تتجاوز الميزانية ${c.envelope.toLocaleString('en')}.`);
    }
  }
  const sched = has('schedule') ? table(M.schedule, A.schedule, 'activities') : null;
  if (sched) {
    const t = sched;
    const codes = t ? t.rows.map((r) => codeOf(t.cell(r, t.col('الرمز')))).filter(Boolean) : [];
    const s = t?.col('البدايه'), e = t?.col('النهايه'), dep = t?.col('يعتمد');
    const bad = t ? t.rows.filter((r) => {
      const a = parseDate(t.cell(r, s)), b = parseDate(t.cell(r, e));
      return a == null || b == null || b < a;
    }).map((r) => t.cell(r, 0) || t.cell(r, 1)) : [];
    // جدول بلا صفوف يفشل الفحص، وتفصيله يقول ذلك بدل قائمة فارغة («…معكوس: .»)
    add('dates', 'تواريخ الجدول واضحة والنهاية بعد البداية', t && t.rows.length && !bad.length,
      t && t.rows.length ? `صفوف بتاريخ غير واضح أو معكوس: ${bad.slice(0, 6).join('، ')}. اكتب التاريخ هكذا 2026-03-15.` : 'لم تُدخل أنشطة في الجدول الزمني بعد.');
    const orphan = t ? t.rows.flatMap((r) => listCodes(t.cell(r, dep))).filter((c) => !codes.includes(c) && !wbsCodes.includes(c)) : [];
    add('deps', 'الاعتماديات تشير إلى أنشطة موجودة', !orphan.length, `اعتماديات لا تجد نشاطها: ${[...new Set(orphan)].slice(0, 6).join('، ')}`);
    if (has(CHARTER_KEY) && t) {
      const from = parseDate(A[CHARTER_KEY]?.start), to = parseDate(A[CHARTER_KEY]?.end);
      if (from != null && to != null) {
        const out2 = t.rows.filter((r) => { const a = parseDate(t.cell(r, s)), b = parseDate(t.cell(r, e)); return (a != null && a < from) || (b != null && b > to); });
        add('window', 'الجدول داخل مدة المبادرة في بطاقتها', !out2.length, `${out2.length} نشاط خارج المدة بين ${A[CHARTER_KEY].start} و${A[CHARTER_KEY].end}.`);
      }
    }
  }
  const raid = has('raid') ? table(M.raid, A.raid, 'items') : null;
  if (raid) {
    const t = raid;
    const p = t.col('الاحتمال'), i = t.col('الاثر'), o = t.col('المالك'), res = t.col('الاستجابه'), link = t.col('مرتبط');
    const high = t.rows.filter((r) => (parseNumber(t.cell(r, p)) || 0) * (parseNumber(t.cell(r, i)) || 0) >= 12);
    const weak = high.filter((r) => !t.cell(r, o) || !t.cell(r, res)).map((r) => t.cell(r, 0) || t.cell(r, 2));
    add('risk-owner', 'لكل خطر عالٍ مالك واستجابة', !weak.length, `مخاطر عالية بلا مالك أو استجابة: ${weak.slice(0, 6).join('، ')}`);
    if (wbs) {
      const loose = t.rows.filter((r) => t.cell(r, link) && listCodes(t.cell(r, link)).some((c) => !known(c))).map((r) => t.cell(r, 0));
      add('risk-link', 'المخاطر مرتبطة بحزم موجودة في هيكل التجزئة', !loose.length, `روابط لا تجد حزمتها: ${loose.slice(0, 6).join('، ')}`);
    }
  }
  const benefits = has('benefits-register') ? table(M['benefits-register'], A['benefits-register'], 'benefits') : null;
  if (benefits) {
    const t = benefits;
    const base = t.col('خط الاساس'), target = t.col('المستهدف'), owner = t.col('المالك');
    const weak = t.rows.filter((r) => !t.cell(r, base) || !t.cell(r, target) || !t.cell(r, owner)).map((r) => t.cell(r, 0));
    add('benefit-owner', 'لكل منفعة خط أساس ومستهدف ومالك من الجهة', t.rows.length && !weak.length,
      t.rows.length ? `منافع ينقصها خط أساس أو مستهدف أو مالك: ${weak.slice(0, 6).join('، ')}` : 'لم تُدخل منافع في سجل المنافع بعد.');
    if (has('evidence-plan')) {
      const ev = table(M['evidence-plan'], A['evidence-plan'], 'plan');
      const ind = t.col('المؤشر');
      const planned = ev ? ev.rows.map((r) => norm(ev.cell(r, 0))) : [];
      const miss = t.rows.map((r) => t.cell(r, ind) || t.cell(r, 0)).filter((x) => x && !planned.some((y) => y && (y.includes(norm(x)) || norm(x).includes(y))));
      add('evidence', 'خطة الأدلة تقيس كل مؤشرات المنافع', !miss.length, `مؤشرات بلا خطة قياس: ${miss.slice(0, 6).join('، ')}. استوردها من سجل المنافع.`);
    }
  }
  // فصل الشراء (البعد التجاري): من قال إنه يحتاج شراء يكتب ما يشتريه
  if (has('procurement')) {
    const need = String(A.procurement?.need || '');
    if (need.startsWith('نعم')) {
      const t = table(M.procurement, A.procurement, 'items');
      add('procurement', 'ما يُشترى مكتوب بقيمته وطريقة طرحه', t && t.rows.length, 'اخترت أن المبادرة تحتاج شراء أو تعاقدًا: اكتب في فصل «الشراء والتعاقد» بندًا واحدًا على الأقل.');
    }
  }
  const roadmap = ctx.scope === 'program' && has('roadmap') ? table(M.roadmap, A.roadmap, 'tranches') : null;
  if (roadmap) {
    const t = roadmap;
    const weak = t.rows.filter((r) => !t.cell(r, t.col('المشاريع')) || !t.cell(r, t.col('المنافع'))).map((r) => t.cell(r, 0));
    add('tranches', 'كل دفعة في البرنامج بمشاريعها ومنافعها', t.rows.length && !weak.length, `دفعات ينقصها مشاريع أو منافع: ${weak.slice(0, 6).join('، ')}`);
  }
  const criteria = ctx.scope === 'portfolio' && has('portfolio-review') ? table(M['portfolio-review'], A['portfolio-review'], 'criteria') : null;
  if (criteria) {
    const t = criteria;
    const sum = t.rows.reduce((a, r) => a + (parseNumber(t.cell(r, t.col('الوزن'))) || 0), 0);
    add('weights', 'أوزان معايير المفاضلة مجموعها 100%', Math.round(sum) === 100, `مجموع الأوزان ${sum}% وليس 100%.`);
  }
  return out;
}

// ── الجاهزية ──
// نصفها اكتمال الفصول، ونصفها فحوص الاتساق. sections: [{ complete }]
export function readiness(sections, checks) {
  const s = sections.length ? sections.filter((x) => x.complete).length / sections.length : 0;
  const c = checks.length ? checks.filter((x) => x.ok).length / checks.length : 1;
  return Math.round((s * 0.5 + c * 0.5) * 100);
}

// حالة كل فصل للمشارك: مكتمل الحقول، ومُسلَّم، ومقيَّم
export function sectionState(model, fields, sub) {
  const missing = missingFields(fields, sub?.answers || {});
  return {
    complete: !missing.length, missing,
    status: sub?.status || null, rating: sub?.rating ?? null,
  };
}

// ── بوابة البطاقة ──
// المستشار يعتمد اختيار المبادرة من بطاقتها قبل تسليم الوثيقة كاملة: هل هي حقيقية في جهته، وبحجم يكفيه زمن البرنامج،
// ولها راعٍ. كان الحكم الأول على المبادرة يأتي عند الوثيقة كاملة في آخر الرحلة، فتُكتشف المبادرة غير المناسبة بعد بنائها.
// البوابة لا تقفل الفصول: المشارك يكمل البناء أثناء الانتظار، والذي ينتظر الاعتماد هو تسليم الوثيقة وحده.
// المبادرة قد تكون افتراضية (قرار المالك 2026-11-14): المعيار واقعيتها في سياق جهته، والراعي توضيح لدوره لا اسم ولا بريد.
export const CARD_REVIEW_CRITERIA = [
  'واقعية في سياق جهته، حقيقية كانت أو افتراضية',
  'بحجم يُخطَّط له في زمن البرنامج',
  'موضّح فيها من يرعاها في هيكل الجهة وما يقرره',
  'مشكلتها ومنفعتها المتوقعة واضحتان',
];
/** @param {string | null | undefined} status حالة تسليم نموذج البطاقة */
export function cardGate(status) {
  if (status === 'reviewed') return { state: 'approved', ok: true, reason: null };
  if (status === 'submitted') return { state: 'waiting', ok: false, reason: 'بطاقة المبادرة بانتظار اعتماد المستشار. تُسلَّم الوثيقة بعد اعتمادها.' };
  if (status === 'returned') return { state: 'returned', ok: false, reason: 'أعاد المستشار بطاقة المبادرة بملاحظات. عدّلها وسلّمها ليعتمدها.' };
  return { state: 'none', ok: false, reason: 'سلّم بطاقة المبادرة ليعتمد المستشار اختيارها قبل تسليم الوثيقة.' };
}

// يمكن التسليم؟ كل الفصول مكتملة، والجاهزية فوق الحد، والحالة تسمح
export function canSubmit(state) {
  if (!['draft', 'returned', undefined, null].includes(state.status)) return { ok: false, reason: 'الوثيقة قيد المراجعة أو معتمدة' };
  if (!state.scope) return { ok: false, reason: 'حدد نطاق عملك (مشروع، برنامج، محفظة) في ملفك أولًا' };
  if (!state.initiative) return { ok: false, reason: 'اكتب اسم المبادرة في بطاقة المبادرة' };
  // state.card غائبة في وثيقة بلا فصل بطاقة (برنامج لا يضعها في الوثيقة): لا بوابة
  if (state.card) { const g = cardGate(state.card.status); if (!g.ok) return { ok: false, reason: g.reason }; }
  const open = state.sections.filter((s) => !s.complete);
  if (open.length) return { ok: false, reason: `فصول لم تكتمل: ${open.map((s) => s.title).slice(0, 5).join('، ')}` };
  const blocked = (state.checks || []).filter((x) => x.blocking && !x.ok);
  if (blocked.length) return { ok: false, reason: `فحوص لازمة قبل التسليم: ${blocked.map((x) => x.title).join('، ')}` };
  if (state.readiness < READY_MIN) return { ok: false, reason: `الجاهزية ${state.readiness}% وتلزم ${READY_MIN}%. عالج فحوص الاتساق المفتوحة.` };
  return { ok: true };
}

// من أعاد الوثيقة المعادة: الأحدث بين رفض الراعي ومراجعة المستشار. حالة الراعي لا تُصفَّر بإعادة التسليم
// (تبقى في السجل)، فبعد «قبول ← رفض الراعي ← إعادة تسليم ← إعادة من المستشار» كانت الواجهة تعرض ملاحظة الراعي
// القديمة وتخفي ملاحظات المستشار الجديدة على التحسين الوحيد المتاح (p-capstone-2، تدقيق 2026-11-11).
/** @param {{ status?: string, review?: { reviewed_at?: string | null } | null, sponsor?: { status?: string | null, at?: string | null } | null }} c */
export function returnedBy(c) {
  if (c?.status !== 'returned') return null;
  if (c.sponsor?.status !== 'declined') return 'advisor';
  const reviewed = Date.parse(c.review?.reviewed_at || ''), declined = Date.parse(c.sponsor.at || '');
  return reviewed > declined ? 'advisor' : 'sponsor';
}

// الإطار الذي ينتمي إليه كل فصل، لترتيب الفهرس وألوانه
export const dimensionIndex = (d) => Math.max(0, DIMENSIONS.indexOf(d));
