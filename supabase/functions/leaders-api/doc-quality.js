// ════════════════════════════════════════════════════════════════
// بوابة جودة القيم في وثيقة المبادرة (منطق خالص)
// ════════════════════════════════════════════════════════════════
// التصور المعتمد (الخيار ب، 2026-11-24). وثيقتان من مصدر واحد:
// - الوثيقة المؤسسية: تُبنى من القيم الصالحة وحدها (cleanDoc strict).
// - ملف العمل الكامل: يعرض كل ما كُتب، وما لم يصلح يُعلَّم «يحتاج مراجعة» بسببه، ويُجمع في ملحق «ما ينقص» (cleanDoc keep).
// القاعدة متحفظة: لا تحكم على المضمون، ولا ترفض جملة عربية سليمة. ترفض الفراغ وما يقوم مقامه (لا يوجد، -، ...)،
// والعبث (تتابع مفاتيح، تكرار مقطع، كتلة بلا مسافات تخلط الحروف والأرقام)، والتاريخ أو المبلغ الذي لا يُقرأ،
// والنص الطويل دون حد المعنى (TEXTAREA_MIN من logic.js). لا يغيّر البيانات المخزنة.
// يُستورد كما هو في الخادم (Deno) وفي الواجهات (vitest/vite).
import { latinDigits, meaningful, TEXTAREA_MIN } from './logic.js';
import { costSummary, parseNumber } from './capstone.js';

export const REASONS = Object.freeze({
  empty: 'لم يُكتب بعد',
  placeholder: 'كُتب فيه ما يقوم مقام الفراغ (مثل «لا يوجد»)',
  gibberish: 'نص لا يُقرأ (أحرف عشوائية أو مكررة)',
  too_short: 'أقصر من أن يُفهم: اكتب جملة كاملة',
  bad_date: 'تاريخ لا يُقرأ: اكتبه مثل 2027-03-15 أو «مارس 2027» أو «الأسبوع 3»',
  bad_number: 'يُنتظر مبلغ أو رقم، مثل 50000 أو «50 ألف»',
  zero: 'القيمة صفر',
  bad_subject: 'الخانة الأولى في الصف (موضوعه) لا تصلح',
  rows_invalid: 'صفوف لا تصلح للعرض',
});

const DIACRITICS = /[ً-ْٰـ]/g;
const squash = (v) => latinDigits(String(v ?? '')).replace(DIACRITICS, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').trim();

// ما يقوم مقام الفراغ، بعد حذف المسافات والترقيم والتشكيل
const PLACEHOLDERS = new Set(['لايوجد', 'لاتوجد', 'لاشي', 'لاشيء', 'لا', 'ليوجد', 'لايوجدشيء', 'غيرمعروف', 'لااعرف', 'لاادري', 'غيرمتوفر', 'غيرمحدد', 'لاينطبق',
  'na', 'n/a', 'none', 'nil', 'null', 'nothing', 'no', 'x', 'xx', 'xxx', 'test', 'تجربه', 'اختبار', 'ـ']);
const placeholderKey = (s) => squash(s).toLowerCase().replace(/[\s\-–—_.,،؛;:!?؟'"«»()[\]/\\*]+/g, (m) => (m.includes('/') ? '/' : ''));

/** هل النص يقوم مقام الفراغ: «لا يوجد»، «-»، «...»، «n/a» */
export function isPlaceholder(v) {
  const raw = squash(v);
  if (!raw) return false;
  if (/^[\s\-–—_.,،؛;:!?؟*/\\·•]+$/.test(raw)) return true;
  const k = placeholderKey(raw);
  return PLACEHOLDERS.has(k) || PLACEHOLDERS.has(k.replace(/\//g, ''));
}

// صفوف لوحتي المفاتيح العربية واللاتينية: خمسة مفاتيح متجاورة في كلمة واحدة علامة عبث
const KEY_ROWS = ['ضصثقفغعهخحجد', 'شسيبلاتنمكط', 'ئءؤرىةوزظ', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KEY_RUNS = new Set(KEY_ROWS.flatMap((r) => {
  const out = [];
  for (const s of [r, [...r].reverse().join('')]) for (let i = 0; i + 5 <= s.length; i++) out.push(s.slice(i, i + 5));
  return out;
}));
const AR = /[ء-ي]/;
const LAT = /[a-z]/i;
const DIG = /\d/;
const kind = (c) => (AR.test(c) ? 'a' : LAT.test(c) ? 'l' : DIG.test(c) ? 'd' : 'o');
// حروف المد والتاء المربوطة والهمزات: لا تكاد تخلو منها كلمة عربية من ثمانية أحرف فأكثر
const AR_VOWELISH = /[اويةءئؤ]/;

/** هل الكلمة الواحدة (بلا مسافات) عبث. متحفظة: الكلمات العربية الطويلة والروابط والرموز والعلامات التجارية تمر */
export function gibberishToken(tok) {
  const t = squash(tok).toLowerCase();
  if (/^(https?:\/\/|www\.)|@.+\./.test(t)) return false;
  const letters = t.replace(/[^ء-يa-z]/g, '');
  if (letters.length < 3) return false;
  // تكرار مقطع من حرف إلى ثلاثة: «فغفغفغ»، «dfgdfg»، «ههههه» (الأرقام لا تدخل: 1000000 رقم سليم)
  // العربية تُشترط فيها ثلاث مرات على الكلمة كلها («الثالث» = الث+الث مرتين فتمر)؛ اللاتينية تكفيها مرتان («dfgdfg»)
  if (/^(.{1,3})\1{2,}$/u.test(letters) || (/^[a-z]{6,}$/.test(letters) && /^(.{2,3})\1+$/.test(letters))) return true;
  if (/(.)\1{4,}/u.test(letters)) return true;
  if (letters.length < 5) return false;
  // تتابع مفاتيح لوحة
  for (let i = 0; i + 5 <= letters.length; i++) if (KEY_RUNS.has(letters.slice(i, i + 5))) return true;
  // تبدل متكرر بين الحروف العربية واللاتينية والأرقام داخل كلمة واحدة («kjh٣٤٥قق»). «وCloudflare» تبدّل واحد فيمر
  const ks = [...t].map(kind).filter((k) => k !== 'o');
  let switches = 0;
  for (let i = 1; i < ks.length; i++) if (ks[i] !== ks[i - 1]) switches++;
  if (t.length >= 8 && switches >= 3) return true;
  if (/^[ء-ي]+$/.test(t)) {
    // كتلة عربية أطول من أطول كلمة مألوفة، أو ثمانية أحرف فأكثر بلا حرف مد ولا همزة ولا تاء مربوطة
    if (t.length >= 17) return true;
    // بعد نزع السوابق (و، ف، ب، ك، ل، ال، لل…) تبقى الكلمة بلا حرف مد عشرة أحرف فأكثر: «للمستخدم» و«فتستخدمه» تمر
    const stem = t.replace(/^(?:[وف]?(?:بال|كال|لل|ال|ب|ك|ل)?)/, '');
    if (stem.length >= 10 && !AR_VOWELISH.test(stem)) return true;
  }
  // كتلة لاتينية بلا حرف علة واحد («sdfghk»)؛ «Strengths» فيها e فتمر
  if (/^[a-z]+$/.test(t) && t.length >= 6 && !/[aeiouy]/.test(t)) return true;
  return false;
}

/** هل النص كله عبث: ما يغلب عليه (بوزن الأحرف) كلمات عابثة، أو كلمة واحدة مكررة، أو لا حرف فيه */
export function isGibberish(v) {
  const s = squash(v);
  if (!s) return false;
  if (!/[ء-يa-z]/i.test(s)) return !validNumber(s) && !validDate(s);
  const toks = s.split(/\s+/).filter(Boolean);
  // الكلمة نفسها مكررة («sdf sdf sdf»)
  if (toks.length >= 3 && new Set(toks.map((x) => x.toLowerCase())).size === 1) return true;
  const total = toks.reduce((a, t) => a + t.length, 0) || 1;
  const bad = toks.filter(gibberishToken).reduce((a, t) => a + t.length, 0);
  return bad / total >= 0.5;
}

// ── التاريخ ──
const MONTHS = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر',
  'كانون الثاني', 'شباط', 'اذار', 'نيسان', 'ايار', 'حزيران', 'تموز', 'اب', 'ايلول', 'تشرين الاول', 'تشرين الثاني', 'كانون الاول',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = `(?:${MONTHS.map((m) => m.replace(/ /g, '\\s+')).join('|')})[a-z]*`;
const YEAR = '(19[9]\\d|20\\d\\d|2100)';
const WEEK = '(?:ال)?(?:اسبوع|week|wk|w)';
const DATE_FORMS = [
  new RegExp(`^${WEEK}\\s*[:.]?\\s*\\d{1,3}(\\s*[-–—]\\s*\\d{1,3}|\\s*(الي|to)\\s*\\d{1,3})?$`, 'i'),
  new RegExp(`^(?:\\d{1,2}\\s+)?${MONTH_RE}\\s*[,،]?\\s*${YEAR}$`, 'i'),
  new RegExp(`^(?:ال)?ربع\\s*(?:ال)?(?:اول|ثاني|ثالث|رابع|[1-4])\\s*(?:من\\s*)?(?:عام\\s*)?${YEAR}$`, 'i'),
  new RegExp(`^q[1-4]\\s*[-/]?\\s*${YEAR}$`, 'i'),
  new RegExp(`^(?:عام\\s*)?${YEAR}$`, 'i'),
  new RegExp(`^(0?[1-9]|1[0-2])[-/.]${YEAR}$`),
  new RegExp(`^${YEAR}[-/.](0?[1-9]|1[0-2])$`),
];

/** التاريخ بصيغه المقبولة: يوم كامل صحيح المدى، أو شهر وسنة (رقمًا أو باسم الشهر)، أو ربع، أو سنة، أو «الأسبوع 3» ومداه «الأسبوع 3–5» */
export function validDate(v) {
  const s = squash(v).replace(/\s+/g, ' ');
  if (DATE_FORMS.some((re) => re.test(s))) return true;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  let y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [y, mo, d] = [+m[3], +m[2], +m[1]];
  else return false;
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
/** هل يبدو المكتوب تاريخًا (أرقام بفواصل التاريخ) وإن لم يصح: فيوسم «تاريخ لا يُقرأ» لا «عبث» */
const dateLike = (s) => /^\d{1,6}[-/.]\d{1,6}([-/.]\d{1,6})?$/.test(squash(s));

// ── المبلغ والرقم ──
// يقبل الفواصل والعملة والمضاعف («50 ألف»، «1.5 مليون») والتقريب («نحو 50 ألف»)، ولا يقبل نصًا فيه رقم عَرَضًا
const MULT = { الف: 1e3, الاف: 1e3, k: 1e3, مليون: 1e6, ملايين: 1e6, m: 1e6 };
export function amountOf(v) {
  let s = squash(v).toLowerCase().replace(/(ريال|ر\.س|sar|رس|%|٪)/g, '').replace(/^(نحو|حوالي|تقريبا|قرابه|ما يقارب)\s*/, '').replace(/\s*(تقريبا)$/, '');
  s = s.replace(/[,٬]/g, '').replace('٫', '.').trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(الف|الاف|k|مليون|ملايين|m)?$/);
  return m ? +m[1] * (m[2] ? MULT[m[2]] : 1) : null;
}
export const validNumber = (v) => amountOf(v) != null;

// دلالة العمود من اسمه: تاريخ أو مبلغ. الإدارة قد تعيد الصياغة فيُعرف بكلمة دالة
const COL_DATE = /(التاريخ|تاريخ|البداية|النهاية|الموعد|البدء|الانتهاء)/;
const COL_MONEY = /(التكلفة|تكلفة|المبلغ|الكلفة|ريال|الميزانية)/;
export function columnKind(label) {
  const l = squash(label);
  if (COL_MONEY.test(l)) return 'amount';
  if (COL_DATE.test(l)) return 'date';
  return 'text';
}

// دلالة الحقل من مفتاحه ونوعه
const FIELD_DATE = new Set(['start', 'end']);
const FIELD_MONEY = new Set(['envelope']);
const FIELD_NUMBER = new Set(['contingency']);
export function fieldKind(field) {
  if (!field) return 'text';
  if (field.type === 'date' || FIELD_DATE.has(field.key)) return 'date';
  if (field.type === 'number' || FIELD_NUMBER.has(field.key)) return 'number';
  if (FIELD_MONEY.has(field.key)) return 'money';
  if (field.type === 'select') return 'select';
  if (field.type === 'textarea') return 'textarea';
  return 'text';
}

/**
 * سبب رفض قيمة واحدة، أو null إن كانت صالحة.
 * @param field الحقل أو نوعه: 'date' | 'money' (لا صفر) | 'amount' (خلية مبلغ: الصفر مقبول، عينيّ أو مجاني) | 'number' | 'text' | 'textarea' | 'select'
 */
export function reasonOf(field, value) {
  const k = typeof field === 'string' ? field : fieldKind(field);
  const s = String(value ?? '').trim();
  if (!s) return 'empty';
  if (k === 'select') return null;
  if (isPlaceholder(s)) return 'placeholder';
  if (k === 'date') return validDate(s) ? null : 'bad_date';
  if (k === 'money' || k === 'number' || k === 'amount') {
    const n = amountOf(s);
    if (n == null) return k === 'amount' && !isGibberish(s) ? null : 'bad_number';
    return k === 'money' && !(n > 0) ? 'zero' : null;
  }
  if (!/[ء-يa-z]/i.test(squash(s)) && dateLike(s) && !validDate(s) && !validNumber(s)) return 'bad_date';
  if (isGibberish(s)) return 'gibberish';
  if (k === 'textarea' && !meaningful(s, TEXTAREA_MIN)) return 'too_short';
  return null;
}

export const validValue = (field, value) => reasonOf(field, value) === null;

/**
 * صفوف الجدول الصالحة للعرض.
 * strict (الوثيقة المؤسسية): الصف يبقى إن صلح عموده الأول (موضوعه)، وتُفرَّغ خلاياه التالفة.
 * غير strict (ملف العمل): يبقى إن صلح أوله أو خليتان فيه.
 * يعيد { rows, dropped, reasons, droppedRows, cellIssues } ؛ cellIssues: [[صف، عمود، سبب]] في الصفوف الباقية
 */
export function cleanRows(table, { strict = false } = {}) {
  const columns = table?.columns || [];
  const kinds = columns.map(columnKind);
  const rows = [], droppedRows = [], cellIssues = [];
  const reasons = new Set();
  for (const r of Array.isArray(table?.value ?? table?.rows) ? (table.value ?? table.rows) : []) {
    if (!Array.isArray(r) || !r.some((c) => String(c ?? '').trim())) continue;
    const why = r.map((c, i) => reasonOf(kinds[i] || 'text', c));
    const good = why.filter((x) => x === null).length;
    if (why[0] === null || (!strict && good >= 2)) {
      why.forEach((x, i) => { if (x && x !== 'empty') cellIssues.push([rows.length, i, x]); });
      rows.push(r.map((c, i) => (why[i] === null ? c : '')));
    } else {
      droppedRows.push({ row: r, reason: why[0] && why[0] !== 'empty' && good ? 'bad_subject' : why.find((x) => x && x !== 'empty') || 'bad_subject' });
      why.filter((x) => x && x !== 'empty').forEach((x) => reasons.add(x));
    }
  }
  return { rows, dropped: droppedRows.length, reasons: [...reasons], droppedRows, cellIssues };
}

const quote = (v) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s.length > 80 ? `${s.slice(0, 80)}…` : s; };

/**
 * الوثيقة بقيمها الصالحة، وقائمة ما ينقص بأسبابه (للملحق). لا يمس الأصل.
 * strict: الوثيقة المؤسسية (موضوع الصف شرط). keep: ملف العمل، تبقى القيم الأصلية في الفصول ويُعلَّم التالف:
 *   f.issue = سبب الحقل، f.rowIssues = [{ row, reason }] صفوف سقطت، f.cellIssues = [[صف، عمود، سبب]] و f.raw = الصفوف الأصلية الباقية.
 * الحقول المشتقة (meta والتكلفة) تُبنى من القيم الصالحة في الحالين.
 * gaps: [{ chapter, chapter_key, field, field_key, reason, reason_ar, value }]
 */
export function cleanDoc(doc, { strict = false, keep = false } = {}) {
  if (!doc) return { doc, gaps: [] };
  const gaps = [];
  let costAnswers = null;
  const sections = (doc.sections || []).map((s) => {
    const fields = (s.fields || []).map((f) => {
      const gap = (reason, value = '') => { if (s.optional && reason === 'empty') return; gaps.push({ chapter: s.title, chapter_key: s.key, field: f.label || f.key, field_key: f.key, reason, reason_ar: REASONS[reason] || reason, value: quote(value) }); };
      if (f.type === 'table') {
        const c = cleanRows(f, { strict });
        if (!c.rows.length) gap(c.dropped ? c.droppedRows[0].reason : 'empty', c.droppedRows.map((d) => d.row.filter(Boolean).join(' · ')).join(' | '));
        else c.droppedRows.forEach((d) => gap(d.reason, d.row.filter(Boolean).join(' · ')));
        if (!keep) return { ...f, value: c.rows };
        // ملف العمل: الصفوف الباقية بقيمها الأصلية، والساقطة تُعرض معلَّمة
        const kept = (Array.isArray(f.value) ? f.value : []).filter((r) => Array.isArray(r) && r.some((x) => String(x ?? '').trim()));
        return { ...f, value: kept, clean: c.rows, rowIssues: c.droppedRows.map((d) => ({ row: kept.indexOf(d.row), reason: d.reason })), cellIssues: c.cellIssues };
      }
      const why = reasonOf(f, f.value);
      if (why) {
        if (why !== 'empty') gap(why, f.value); else gap('empty');
        return keep && why !== 'empty' ? { ...f, issue: why, clean: null } : { ...f, value: null };
      }
      return f;
    });
    if (s.key === 'cost-plan') {
      const v = (k) => { const f = fields.find((x) => x.key === k); return f ? (f.clean !== undefined ? f.clean : f.value) : null; };
      costAnswers = { model: { fields }, answers: { items: v('items') || [], contingency: v('contingency'), envelope: v('envelope') } };
    }
    return { ...s, fields };
  });
  // الحقل الصالح من البطاقة (ما يقرؤه الغلاف والميثاق): القيمة النظيفة لا الأصلية في ملف العمل
  const charter = sections.find((s) => s.key === 'initiative-charter');
  const cv = (k) => { const f = (charter?.fields || []).find((x) => x.key === k); return f ? (f.issue ? null : f.clean !== undefined && f.type !== 'table' ? f.clean : f.value) ?? null : null; };
  const meta = doc.meta ? { ...doc.meta } : doc.meta;
  if (meta && charter) {
    meta.start = cv('start'); meta.end = cv('end'); meta.sponsor = cv('sponsor');
    meta.host = cv('host') ?? (reasonOf('text', meta.host) ? null : meta.host);
    meta.context = cv('context') ?? (reasonOf('text', meta.context) ? null : meta.context);
    if (meta.initiative && reasonOf('text', meta.initiative)) meta.initiative = null;
  }
  // التكلفة تُعاد من الصفوف الصالحة فتتسق المؤشرات مع الجدول المعروض (costSummary نفسها في الخادم)
  let cost = doc.cost;
  if (costAnswers && doc.cost) {
    const items = costAnswers.model.fields.find((f) => f.key === 'items');
    const model = { fields: costAnswers.model.fields.map((f) => (f.key === 'items' ? { ...f, value: undefined } : f)) };
    cost = items ? costSummary(model, costAnswers.answers) || doc.cost : doc.cost;
  }
  const sumWhy = reasonOf('textarea', doc.summary);
  const summary = sumWhy ? '' : doc.summary;
  if (doc.summary && sumWhy) gaps.unshift({ chapter: 'الملخص التنفيذي', chapter_key: 'summary', field: 'رسالة القائد', field_key: 'summary', reason: sumWhy, reason_ar: REASONS[sumWhy], value: quote(doc.summary) });
  return { doc: { ...doc, meta, summary, sections, cost }, gaps };
}

// ── شرط الاكتمال المؤسسي: الأسئلة العشرة ──
// المرجع: docs/content/2026-11-24-مصفوفة-الوثيقة-بحسب-المستوى-v1.md §1.
// كل سؤال «كل» من مكوّنات، وكل مكوّن «أيٌّ» من مصادر [فصل، حقل] صالحة في الوثيقة النظيفة (strict)
export const INSTITUTIONAL_QUESTIONS = Object.freeze([
  { n: 1, title: 'ما المشكلة ولمن؟', add: 'اكتب المشكلة والمستفيدين في بطاقة المبادرة', all: [[['initiative-charter', 'problem']], [['initiative-charter', 'beneficiaries']]] },
  { n: 2, title: 'ما الهدف وما المخرجات؟', add: 'اكتب الهدف الأعلى وجدول المخرجات في البطاقة', all: [[['initiative-charter', 'objective']], [['initiative-charter', 'deliverables']]] },
  { n: 3, title: 'لماذا هذا الحل لا غيره؟', add: 'اكتب البدائل والتوصية في «المبرر والبدائل»', all: [[['options-analysis', 'recommendation'], ['options-analysis', 'options']]] },
  { n: 4, title: 'كيف يحدث التغيير؟', add: 'اكتب سلسلة التغيير أو الأثر المنشود في «نظرية التغيير»', all: [[['theory-of-change', 'chain'], ['theory-of-change', 'impact']]] },
  { n: 5, title: 'ما المنفعة وكيف تُقاس؟', add: 'املأ سجل المنافع، واكتب كيف ستعرف أنك نجحت أو خطة القياس', all: [[['benefits-register', 'benefits']], [['evidence-plan', 'success_signal'], ['evidence-plan', 'plan']]] },
  { n: 6, title: 'متى وبأي خطوات؟', add: 'املأ سجل المعالم أو الجدول الزمني', all: [[['milestone-register', 'milestones'], ['schedule', 'activities']]] },
  { n: 7, title: 'بأي موارد وكلفة؟', add: 'املأ بنود الموارد والتكلفة', all: [[['cost-plan', 'items']]] },
  { n: 8, title: 'ما المخاطر وكيف تُعالج؟', add: 'املأ سجل المخاطر', all: [[['raid', 'items']]] },
  { n: 9, title: 'من يقرر ومن يشارك؟', add: 'اكتب الراعي ودوره في البطاقة (أو بنية الحوكمة)، واملأ خريطة أصحاب المصلحة', all: [[['initiative-charter', 'sponsor'], ['governance', 'structure']], [['stakeholder-map', 'stakeholders']]] },
  // تقرير الأثر إن كان من فصول الوثيقة وكُتب، وإلا الاستدامة؛ والمشغّل وحده لا يكفي
  { n: 10, title: 'ماذا تحقق وماذا يبقى؟', add: 'اكتب ما تغيّر في «تقرير الأثر» أو التسليم والاستدامة في «التغيير والاستدامة»', all: [[['impact-report', 'changes'], ['change-sustain', 'sustain'], ['change-sustain', 'handover']]] },
]);

const has = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');

/** هل تُصدر الوثيقة المؤسسية: { ok, missing: [{ n, title }] } من الوثيقة النظيفة (cleanDoc strict) */
export function institutionalGate(cleanedDoc) {
  const fld = (k, f) => ((cleanedDoc?.sections || []).find((s) => s.key === k)?.fields || []).find((x) => x.key === f);
  // المكوّن يتحقق بمصدر صالح؛ والمكوّن الذي لا حقل له أصلًا في نسخة نماذج المشارك (حقل أُضيف بعد بدئه، مثل «المستفيدون») لا يُطلب منه
  const ok = (any) => any.some(([k, f]) => has(fld(k, f)?.value)) || any.every(([k, f]) => !fld(k, f));
  // المكوّن الأول في كل سؤال (لبّه) مطلوب دائمًا
  const missing = INSTITUTIONAL_QUESTIONS.filter((q) => !q.all.every((any, i) => (i === 0 ? any.some(([k, f]) => has(fld(k, f)?.value)) : ok(any)))).map(({ n, title, add }) => ({ n, title, add }));
  return { ok: !missing.length, missing };
}

// ── الإصدار: بصمة النسخة ومحتواها النظيف مجمّدان في لقطة الاعتماد ──
/** بصمة النسخة: FNV-1a مزدوج على محتوى الوثيقة الخام (لا ناتج التنظيف)، فلا تتغير بتغير قواعد الجودة */
export function fingerprint(doc) {
  const src = JSON.stringify({ i: doc?.meta?.initiative, v: doc?.meta?.version, s: (doc?.sections || []).map((s) => [s.key, (s.fields || []).map((f) => [f.key, f.value])]) });
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')).toUpperCase().match(/.{4}/g).join('-');
}

/** ما يُجمَّد في snapshot.issued لحظة الاعتماد: المحتوى النظيف (strict) وبصمة الخام */
export function freezeIssued(snapshot) {
  const { doc } = cleanDoc(snapshot, { strict: true });
  const m = doc.meta || {};
  // بلا أي بريد: يُقرأ في روابط المشاركة
  const sections = doc.sections.map((s) => ({ ...s, fields: (s.fields || []).filter((f) => !/email/i.test(f.key)) }));
  return { fingerprint: fingerprint(snapshot), sections, cost: doc.cost ?? null, summary: doc.summary,
    meta: { start: m.start ?? null, end: m.end ?? null, sponsor: m.sponsor ?? null, host: m.host ?? null, context: m.context ?? null, initiative: m.initiative ?? null } };
}

// ── قيم رُفضت للمراجعة (قرار المالك 2026-11-24): شبكة أمان لضبط قواعد الرفض ببيانات حقيقية ──
// حساب للقراءة وحده لحظة الطلب من الإجابات الحالية، بلا سجل ولا ترحيل: القاعدة، والفصل، والحقل، والعدد، وعينة مقنّعة.
// العينة لا تكشف النص: طوله وحده، فلا يخرج من الإجابة شيء.
export const maskSample = (v) => {
  const n = [...String(v ?? '').replace(/\s+/g, ' ').trim()].length;
  return n ? `${'•'.repeat(Math.min(8, n))} (${n} حرفًا)` : '';
};

/**
 * items: [{ chapter_key, fields: [{ key, type, columns }], answers }] لكل تسليم.
 * يعيد { rules: [{ rule, rule_ar, count }], rows: [{ rule, rule_ar, chapter_key, field_key, count, sample }], submissions }
 * الفراغ و«أقصر من أن يُفهم» ليسا رفضًا لقيمة مكتوبة فلا يُعدّان.
 */
export function rejectionStats(items) {
  const by = new Map();
  const hit = (rule, chapter_key, field_key, value) => {
    if (!rule || rule === 'empty' || rule === 'too_short') return;
    const k = `${rule}|${chapter_key}|${field_key}`;
    const r = by.get(k) || { rule, rule_ar: REASONS[rule] || rule, chapter_key, field_key, count: 0, sample: maskSample(value) };
    r.count++;
    by.set(k, r);
  };
  let submissions = 0;
  for (const it of items || []) {
    submissions++;
    const answers = it?.answers || {};
    for (const f of Array.isArray(it?.fields) ? it.fields : []) {
      const v = answers[f.key];
      if (f.type === 'table') {
        const kinds = (f.columns || []).map(columnKind);
        for (const row of Array.isArray(v) ? v : []) {
          if (!Array.isArray(row)) continue;
          row.forEach((c, i) => hit(reasonOf(kinds[i] || 'text', c), it.chapter_key, `${f.key}:${(f.columns || [])[i] ?? i}`, c));
        }
      } else if (v != null && typeof v !== 'object') hit(reasonOf(f, v), it.chapter_key, f.key, v);
    }
  }
  const rows = [...by.values()].sort((a, b) => b.count - a.count);
  const totals = new Map();
  rows.forEach((r) => totals.set(r.rule, (totals.get(r.rule) || 0) + r.count));
  return { rules: [...totals].map(([rule, count]) => ({ rule, rule_ar: REASONS[rule] || rule, count })).sort((a, b) => b.count - a.count), rows: rows.slice(0, 200), submissions };
}
