// ════════════════════════════════════════════════════════════════
// فحص ما قبل التسليم («بوابتان، والباقي ملاحظات»، المرحلة 3): مرآة لـ«علامات النموذج الجيد» في Models.jsx
// ════════════════════════════════════════════════════════════════
// دالة صرفة في المتصفح بلا شبكة ولا ذكاء اصطناعي: تقرأ الحقول والإجابات وتعيد تلميحات لطيفة «قبل التسليم: …».
// لا تمنع التسليم أبدًا: المشارك يسلّم على أي حال، والتلميح يذكّره بالاكتمال والتحديد كما يقرؤهما المراجع.
// الحقول الإلزامية الناقصة يمنعها الخادم وحده (missingFields)، فلا تُكرر هنا.
import { fieldFilled, tableRows } from '../../supabase/functions/leaders-api/logic.js';

// الحد الذي يُعد دونه النص الطويل مقتضبًا (أعلى من حد الاكتمال TEXTAREA_MIN: يكتمل بجملة، ويُفهم بأكثر)
export const PRESUBMIT_MIN_CHARS = 60;
// نسبة الحقول الاختيارية المملوءة التي دونها يُذكَّر بها
export const PRESUBMIT_OPTIONAL_SHARE = 0.5;

// ما يطلبه الحقل من تحديد، من اسمه وتلميحه: رقم أو تاريخ أو دور
const ASKS = [
  { kind: 'number', re: /رقم|نسبة|مؤشر|كم |عدد|قيمة|تكلفة|ميزانية|مستهدف|هدف/, has: /[0-9٠-٩]|%|٪/, ar: 'رقمًا أو نسبة' },
  { kind: 'date', re: /تاريخ|موعد|متى|مدة|أسبوع|شهر|ربع|جدول زمني/, has: /[0-9٠-٩]|يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر|أسبوع|شهر|ربع|يوم|الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس/, ar: 'تاريخًا أو مدة' },
  { kind: 'role', re: /مسؤول|المالك|دور|من يقرر|صاحب القرار|الراعي|الجهة المسؤولة/, has: /مدير|رئيس|مسؤول|قائد|فريق|إدارة|وكيل|منسق|مشرف|مالك|الراعي|أنا|مستشار|محلل|أخصائي|لجنة/, ar: 'اسم دور أو جهة' },
];
const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// يعيد [{ key, text }] بترتيب الحقول. fields وanswers كما في النموذج، وinitiative يملأ حقل اسم المبادرة كما يملؤه الخادم
export function preSubmitHints(fields, answers, { initiative = null } = {}) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const out = [];
  const optional = (fields || []).filter((f) => f.required === false && f.bind !== 'initiative');
  const optFilled = optional.filter((f) => fieldFilled(f, a[f.key])).length;
  if (optional.length && optFilled / optional.length < PRESUBMIT_OPTIONAL_SHARE) {
    out.push({ key: '_optional', text: `ملأت ${optFilled} من ${optional.length} حقول اختيارية؛ ما تضيفه فيها يقوّي نموذجك.` });
  }
  for (const f of fields || []) {
    if (f.bind === 'initiative' && initiative) continue;
    const v = a[f.key];
    if (f.type === 'textarea') {
      const t = text(v);
      if (!t) continue;
      if (t.length < PRESUBMIT_MIN_CHARS) { out.push({ key: f.key, text: `«${f.label}» مقتضب؛ جملتان تشرحان السبب أو الأثر تجعلانه يُفهم دون شرح شفهي.` }); continue; }
      const ask = ASKS.find((x) => x.re.test(`${f.label} ${f.hint || ''}`));
      if (ask && !ask.has.test(t)) out.push({ key: f.key, text: `«${f.label}» يطلب ${ask.ar}، ولم أجده فيما كتبت.` });
    } else if (f.type === 'table') {
      const rows = tableRows(v);
      if (!rows.length) continue;
      const cells = rows.flat();
      const blank = cells.filter((c) => !text(c)).length;
      if (cells.length && blank / cells.length > 0.25) out.push({ key: f.key, text: `في جدول «${f.label}» خانات فارغة (${blank} من ${cells.length}).` });
    } else if (f.type === 'text') {
      const t = text(v);
      const ask = t && ASKS.find((x) => x.re.test(`${f.label} ${f.hint || ''}`));
      if (ask && !ask.has.test(t)) out.push({ key: f.key, text: `«${f.label}» يطلب ${ask.ar}، ولم أجده فيما كتبت.` });
    }
  }
  return out;
}
