// ════════════════════════════════════════════════════════════════
// بوابة جودة القيم في وثيقة المبادرة (منطق خالص)
// ════════════════════════════════════════════════════════════════
// التصور المعتمد (الخيار ب، 2026-11-24): الوثيقة تُبنى من القيم الصالحة وحدها.
// ما ليس صالحًا لا يُعرض في المتن بـ«لم يُملأ»، بل يُجمع بسببه في ملحق «ما ينقص لإكمال الوثيقة».
// القاعدة متحفظة: لا تحكم على المضمون، ولا ترفض جملة عربية سليمة. ترفض الفراغ وما يقوم مقامه
// (لا يوجد، -، ...)، والعبث (تتابع مفاتيح لوحة، حروف مكررة، كتلة طويلة بلا مسافات تخلط الحروف والأرقام)،
// والتاريخ أو الرقم الذي لا يُقرأ، والنص الطويل دون حد المعنى (TEXTAREA_MIN من logic.js، قاعدة واحدة).
// لا يغيّر البيانات المخزنة: يعمل على نسخة العرض فقط.
// يُستورد كما هو في الخادم (Deno) وفي الواجهات (vitest/vite).
import { latinDigits, meaningful, TEXTAREA_MIN } from './logic.js';
import { parseNumber, weekOf } from './capstone.js';

export const REASONS = Object.freeze({
  empty: 'لم يُكتب بعد',
  placeholder: 'كُتب فيه ما يقوم مقام الفراغ (مثل «لا يوجد»)',
  gibberish: 'نص لا يُقرأ (أحرف عشوائية)',
  too_short: 'أقصر من أن يُفهم: اكتب جملة كاملة',
  bad_date: 'تاريخ لا يُقرأ: اكتبه بصيغة 2027-03-15 أو «الأسبوع 3»',
  bad_number: 'يُنتظر رقم',
  zero: 'القيمة صفر',
  rows_invalid: 'صفوف لا تصلح للعرض',
});

const DIACRITICS = /[ً-ْٰـ]/g;
const squash = (v) => latinDigits(String(v ?? '')).replace(DIACRITICS, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').trim();

// ما يقوم مقام الفراغ، بعد حذف المسافات والترقيم والتشكيل
const PLACEHOLDERS = new Set(['لايوجد', 'لاتوجد', 'لاشي', 'لاشيء', 'لا', 'ليوجد', 'لايوجدشيء', 'غيرمعروف', 'لااعرف', 'لاادري', 'غيرمتوفر', 'غيرمحدد', 'لاينطبق',
  'na', 'n/a', 'none', 'nil', 'null', 'nothing', 'no', 'x', 'xx', 'xxx', 'test', 'تجربه', 'تجربة', 'اختبار', 'ملاحظه', 'ـ']);
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

/** هل الكلمة الواحدة (بلا مسافات) عبث. متحفظة: الكلمات العربية الطويلة والروابط والرموز والتواريخ تمر */
export function gibberishToken(tok) {
  const t = squash(tok).toLowerCase();
  if (t.length < 5) return false;
  if (/^(https?:\/\/|www\.)|@.+\./.test(t)) return false;
  const letters = t.replace(/[^ء-يa-z]/g, '');
  // تتابع مفاتيح لوحة
  for (let i = 0; i + 5 <= letters.length; i++) if (KEY_RUNS.has(letters.slice(i, i + 5))) return true;
  // حرف واحد مكرر خمس مرات متتالية
  if (/(.)\1{4,}/u.test(t)) return true;
  // تبدل متكرر بين الحروف العربية واللاتينية والأرقام داخل كلمة واحدة
  const ks = [...t].map(kind).filter((k) => k !== 'o');
  let switches = 0;
  for (let i = 1; i < ks.length; i++) if (ks[i] !== ks[i - 1]) switches++;
  if (t.length >= 8 && switches >= 3) return true;
  if (AR.test(t) && LAT.test(t) && t.length >= 10) return true;
  // كتلة عربية بلا مسافة أطول من أطول كلمة عربية مألوفة
  if (/^[ء-ي]+$/.test(t) && t.length >= 17) return true;
  // كتلة لاتينية طويلة بلا حروف علة
  if (/^[a-z]+$/.test(t) && t.length >= 7 && (t.match(/[aeiouy]/g) || []).length / t.length < 0.12) return true;
  return false;
}

/** هل النص كله عبث: ما يغلب عليه (بوزن الأحرف) كلمات عابثة، أو لا حرف فيه أصلًا */
export function isGibberish(v) {
  const s = squash(v);
  if (!s) return false;
  if (!/[ء-يa-z]/i.test(s)) return !validNumber(s) && !validDate(s);
  const toks = s.split(/\s+/).filter(Boolean);
  const total = toks.reduce((a, t) => a + t.length, 0) || 1;
  const bad = toks.filter(gibberishToken).reduce((a, t) => a + t.length, 0);
  return bad / total >= 0.5;
}

// التاريخ بأرقام صحيحة المدى (الشهر 1-12 واليوم 1-31 والسنة 1990-2100) أو «الأسبوع N»
export function validDate(v) {
  const s = squash(v);
  if (weekOf(s) != null) return true;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  let y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [y, mo, d] = [+m[3], +m[2], +m[1]];
  else return false;
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

// رقم مكتوب بأرقام، ويقبل الفواصل والعملة («12,000 ريال»)، ولا يقبل نصًا فيه رقم عَرَضًا
export function validNumber(v) {
  const s = squash(v).replace(/(ريال|ر\.س|sar|رس|%|٪)/gi, '').replace(/[,٬\s]/g, '').replace('٫', '.');
  return /^-?\d+(\.\d+)?$/.test(s);
}

// دلالة العمود من اسمه: تاريخ أو مبلغ أو عدد. الإدارة قد تعيد الصياغة فيُعرف بكلمة دالة
const COL_DATE = /(التاريخ|تاريخ|البداية|النهاية|الموعد|البدء|الانتهاء)/;
const COL_MONEY = /(التكلفة|تكلفة|المبلغ|الكلفة|ريال|الميزانية)/;
export function columnKind(label) {
  const l = squash(label);
  if (COL_MONEY.test(l)) return 'money';
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
 * @param {{ key?: string, type?: string }|string} field الحقل أو نوع العمود ('date'|'money'|'number'|'text'|'textarea'|'select')
 */
export function reasonOf(field, value) {
  const k = typeof field === 'string' ? field : fieldKind(field);
  const s = String(value ?? '').trim();
  if (!s) return 'empty';
  if (k === 'select') return null;
  if (isPlaceholder(s)) return 'placeholder';
  if (k === 'date') return validDate(s) ? null : 'bad_date';
  if (k === 'money' || k === 'number') {
    if (!validNumber(s)) return 'bad_number';
    return k === 'money' && !(parseNumber(s) > 0) ? 'zero' : null;
  }
  if (isGibberish(s)) return 'gibberish';
  if (k === 'textarea' && !meaningful(s, TEXTAREA_MIN)) return 'too_short';
  return null;
}

export const validValue = (field, value) => reasonOf(field, value) === null;

/**
 * صفوف الجدول الصالحة للعرض. الصف يبقى إن صلح عموده الأول (عنوانه) أو خليتان فيه؛ الخلية التالفة في صف باقٍ تُفرَّغ.
 * يعيد { rows, dropped, reasons } ؛ reasons أسباب الصفوف المسقطة بلا تكرار
 */
export function cleanRows(table) {
  const columns = table?.columns || [];
  const kinds = columns.map(columnKind);
  const rows = [];
  const reasons = new Set();
  let dropped = 0;
  for (const r of Array.isArray(table?.value ?? table?.rows) ? (table.value ?? table.rows) : []) {
    if (!Array.isArray(r) || !r.some((c) => String(c ?? '').trim())) continue;
    const why = r.map((c, i) => reasonOf(kinds[i] || 'text', c));
    const good = why.filter((x) => x === null).length;
    if (why[0] === null || good >= 2) rows.push(r.map((c, i) => (why[i] === null ? c : '')));
    else {
      dropped++;
      why.filter((x) => x && x !== 'empty').forEach((x) => reasons.add(x));
    }
  }
  return { rows, dropped, reasons: [...reasons] };
}

/**
 * الوثيقة بقيمها الصالحة وحدها، وقائمة ما ينقص بأسبابه (للملحق).
 * لا يمس الأصل. gaps: [{ chapter, chapter_key, field, field_key, reason, reason_ar }]
 */
export function cleanDoc(doc) {
  if (!doc) return { doc, gaps: [] };
  const gaps = [];
  const sections = (doc.sections || []).map((s) => ({
    ...s,
    fields: (s.fields || []).map((f) => {
      const gap = (reason) => gaps.push({ chapter: s.title, chapter_key: s.key, field: f.label || f.key, field_key: f.key, reason, reason_ar: REASONS[reason] || reason });
      if (f.type === 'table') {
        const c = cleanRows(f);
        if (!c.rows.length) gap(c.dropped ? c.reasons[0] || 'rows_invalid' : 'empty');
        else if (c.dropped) gap('rows_invalid');
        return { ...f, value: c.rows };
      }
      const why = reasonOf(f, f.value);
      if (why) { gap(why); return { ...f, value: null }; }
      return f;
    }),
  }));
  const charter = sections.find((s) => s.key === 'initiative-charter');
  const cv = (k) => (charter?.fields || []).find((f) => f.key === k)?.value ?? null;
  const meta = doc.meta ? { ...doc.meta } : doc.meta;
  if (meta && charter) {
    meta.start = cv('start'); meta.end = cv('end'); meta.sponsor = cv('sponsor');
    meta.host = cv('host') ?? (reasonOf('text', meta.host) ? null : meta.host);
    meta.context = cv('context') ?? (reasonOf('text', meta.context) ? null : meta.context);
    if (meta.initiative && reasonOf('text', meta.initiative)) meta.initiative = null;
  }
  const summary = reasonOf('textarea', doc.summary) ? '' : doc.summary;
  if (doc.summary && !summary) gaps.unshift({ chapter: 'الملخص التنفيذي', chapter_key: 'summary', field: 'رسالة القائد', field_key: 'summary', reason: reasonOf('textarea', doc.summary), reason_ar: REASONS[reasonOf('textarea', doc.summary)] });
  return { doc: { ...doc, meta, summary, sections }, gaps };
}

// ── شرط الاكتمال المؤسسي: الأسئلة العشرة ──
// المرجع: docs/content/2026-11-24-مصفوفة-الوثيقة-بحسب-المستوى-v1.md §1.
// لكل سؤال مصادره [فصل، حقل]: يكفي أن يصلح واحد منها في الوثيقة النظيفة
export const INSTITUTIONAL_QUESTIONS = Object.freeze([
  { n: 1, title: 'ما المشكلة ولمن؟', sources: [['initiative-charter', 'problem']] },
  { n: 2, title: 'ما الهدف وما المخرجات؟', sources: [['initiative-charter', 'objective'], ['initiative-charter', 'deliverables']] },
  { n: 3, title: 'لماذا هذا الحل لا غيره؟', sources: [['options-analysis', 'recommendation'], ['options-analysis', 'options']] },
  { n: 4, title: 'كيف يحدث التغيير؟', sources: [['theory-of-change', 'chain'], ['theory-of-change', 'impact']] },
  { n: 5, title: 'ما المنفعة وكيف تُقاس؟', sources: [['benefits-register', 'benefits'], ['evidence-plan', 'plan']] },
  { n: 6, title: 'متى وبأي خطوات؟', sources: [['milestone-register', 'milestones'], ['schedule', 'activities']] },
  { n: 7, title: 'بأي موارد وكلفة؟', sources: [['cost-plan', 'items'], ['cost-plan', 'funding']] },
  { n: 8, title: 'ما المخاطر وكيف تُعالج؟', sources: [['raid', 'items']] },
  { n: 9, title: 'من يقرر ومن يشارك؟', sources: [['initiative-charter', 'sponsor'], ['stakeholder-map', 'stakeholders'], ['governance', 'structure']] },
  { n: 10, title: 'ماذا تحقق وماذا يبقى؟', sources: [['impact-report', 'changes'], ['change-sustain', 'sustain'], ['change-sustain', 'handover'], ['initiative-charter', 'operator']] },
]);

const has = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');

/** هل تُصدر الوثيقة المؤسسية: { ok, missing: [{ n, title }] } من الوثيقة النظيفة (cleanDoc) */
export function institutionalGate(cleanedDoc) {
  const val = (k, f) => ((cleanedDoc?.sections || []).find((s) => s.key === k)?.fields || []).find((x) => x.key === f)?.value;
  const missing = INSTITUTIONAL_QUESTIONS.filter((q) => !q.sources.some(([k, f]) => has(val(k, f)))).map(({ n, title }) => ({ n, title }));
  return { ok: !missing.length, missing };
}
