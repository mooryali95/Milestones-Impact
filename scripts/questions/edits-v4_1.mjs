// بنك الأسئلة v4.1 — تعديلات التدقيق (docs/audit/2026-10-31-ملحق-2-بنك-الأسئلة.md)
//   node scripts/questions/edits-v4_1.mjs
// يقرأ supabase/content/questions/v4/items.json (البنك الحي قبل التعديل) ويكتب
// supabase/content/questions/v4.1/items.json. كل تعديل يُطبَّق على التوأمين
// (baseline-v4 و post-v2) بالرمز نفسه. لا إضافة ولا حذف فقرات.
//
// شكل التعديل: { text?, help?, rater?, options?, scores?, order? }
//   text/help/rater : نص بديل كامل
//   options         : { A: 'نص', ... } يبدّل نص الخيار بموضعه القديم (قبل إعادة الترتيب)
//   scores          : { A: 1, ... } يبدّل درجة الخيار بموضعه القديم
//   order           : [i0, i1, i2, i3] الترتيب الجديد كفهارس قديمة (new[j] = old[order[j]])
//                     يُستخدم في الترحيل لإعادة ربط إجابات value.k المخزونة.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
export const SRC = new URL('supabase/content/questions/v4/items.json', ROOT);
export const OUT = new URL('supabase/content/questions/v4.1/items.json', ROOT);
export const ACTIVE = ['baseline-v4', 'post-v2'];

const T_HELP = 'تصف هذه العبارات تجربتك في البرنامج وبيئة عملك، لا أداءك.';

export const EDITS = {
  // ── حرجة ──
  'I-S3B': { // المشتت B كان تحليل نية المعالجة (أكثر تحفظًا من المفتاح)
    options: {
      B: 'أعمّم الرقم على المسجلين جميعًا لأن المكملين عينة ممثلة',
      C: 'أعرضه مع نسبة المنسحبين موضحًا أنه يخص المكملين فقط',
    },
    scores: { B: 0 },
  },

  // ── مهمة ──
  'I-K5': {
    text: 'أي عنصر ينقص المؤشر التالي: «رفع نسبة رضا المستفيدين إلى 85% بنهاية 2027»؟',
    options: { B: 'الجهة المستفيدة منه', C: 'وحدة قياس المؤشر', D: 'مصدر بيانات القياس' },
  },
  'I-S2B': { scores: { A: 1 } },
  'L-K7': {
    text: 'وفق نموذج المدى الكامل للقيادة عند باس وأفوليو (Bass & Avolio)، ما العلاقة بين القيادة التبادلية والتحويلية؟',
    options: {
      B: 'التحويلية تُبنى فوق تبادلية سليمة ولا تلغيها',
      C: 'التبادلية للفرق الجديدة والتحويلية للفرق المتمرسة',
      D: 'أسلوبان متعارضان يختار القائد بينهما بحسب شخصيته',
    },
    order: [1, 0, 2, 3], // المفتاح B → A
  },
  'L-K7B': {
    options: { C: 'ربط العمل بمعنى أكبر والاهتمام بنمو كل فرد', D: 'تقليل المتابعة ليشعر الفريق بالثقة' },
  },
  'L-K8B': {
    options: { D: 'الثقة' }, // بدل «لا شيء منها»: مفهوم مموّه ليس من نتائج CCL الثلاث
    order: [0, 2, 1, 3], // المفتاح B → C
  },
  'L-S6': {
    text: 'اتضح لك أن البرنامج لن يحقق مستهدفه السنوي، ومراجعة الأداء مع المسؤول الأعلى بعد ثلاثة أسابيع، وقرار ميزانية الربع القادم يُتخذ هذا الأسبوع. ما الأنسب؟',
  },
  'M-S2': {
    options: {
      A: 'عبور مع خطة تصحيح تُعرض في الاجتماع الدوري القادم',
      B: 'عبور مشروط بخطة تصحيح ومعلم مراجعة خلال أسبوعين',
    },
    order: [2, 0, 3, 1], // المفتاح B → D
  },
  'M-S6B': { scores: { A: 1, D: 2 } },

  // ── تحسين (15) ──
  'L-K2B': { options: { A: 'تعليمات تفصيلية ومتابعة قريبة', C: 'تفويض المهمة مع مراجعة ختامية' } },
  'L-K6B': {
    options: { D: 'أن يتولى الرد على ملاحظات الخارج بنفسه' },
    order: [1, 2, 3, 0], // المفتاح A → D
  },
  'L-K9B': { options: { C: 'أن تُقال في اجتماع الفريق ليستفيد الآخرون' } },
  'L-S5': { options: { A: 'تسليمه الملفات مع محضر رسمي موقّع', D: 'الرد على أسئلته بعد انتقالك متى احتاج' } },
  'I-K6B': {
    options: {
      A: 'كم تكلفة أنشطة البرنامج؟',
      B: 'من المسؤول عن تنفيذ المهام في المرحلة؟',
      D: 'متى تُسلَّم مخرجات البرنامج للجهة؟',
    },
  },
  'M-K6': {
    options: {
      A: 'منع التعديل على النطاق بعد اعتماده',
      B: 'تقييم أثر التغيير قبل اعتماده أو رفضه',
      D: 'إحالة طلبات التغيير إلى الراعي ليقررها',
    },
  },
  'M-K8B': { options: { B: 'لأن تعديله يُعيد احتساب الميزانية', C: 'لتقليل التقارير المطلوبة من الفريق' } },
  'M-S6': { options: { C: 'تحديث الجدول بالتاريخ الجديد وذكره في التقرير الشهري' } },
  'L-S1': { options: { D: 'شرح المطلوب ثم مراجعة النسخة النهائية' } },
  'I-K7': {
    options: { D: 'أثر جانبي إيجابي لم يُخطط له' },
    order: [0, 2, 3, 1], // المفتاح B → D
  },
  'I-S1': { options: { D: 'ارتفاع ثقة المتدربين بقدراتهم بعد الدورة' }, scores: { D: 1 } },
  'I-S4': { options: { D: 'تقديرات الفريق للوضع السابق دون توثيق مصدرها' } },
  'M-S4': { scores: { A: 2 } },
  'M-K2B': { // مثال موازٍ للنموذج A بدل التعريف
    text: 'في مشروع تحوّل رقمي، أي النقاط التالية تمثل بوابة مرحلة (Stage Gate)؟',
    options: {
      A: 'اجتماع الفريق الأسبوعي لمتابعة المهام والمخاطر',
      B: 'تسليم المورد النسخة الأولى من النظام للاختبار',
      C: 'رفع تقرير الإنجاز الشهري إلى الإدارة العليا',
      D: 'اعتماد اللجنة لنتائج التجربة قبل التعميم',
    },
  },
  'T-5': { text: 'استخدمت أداة واحدة على الأقل من أدوات البرنامج في عملي خلال الشهر الماضي.', help: T_HELP },

  // ── لغة وتوحيد ──
  'T-1': { help: T_HELP },
  'T-2': { help: T_HELP },
  'T-3': { help: T_HELP },
  'T-4': { help: T_HELP },
  'L-S4': { options: { A: 'اجتماع أسبوعي لإطلاعه على سير المشروع' }, order: [0, 2, 3, 1] }, // المفتاح B → D
  'L-K8': { options: { A: 'رضا أعضاء الفريق عن قائدهم في الاستبانة السنوية' } },
  'I-K1': { text: '«ارتفاع معرفة المتدربين بالمهارة المستهدفة بعد انتهاء الدورة» يقع في أي مستوى من سلسلة النتائج؟' },
  'I-K1B': { text: '«تدريب 200 موظف على نظام المشتريات الجديد» يقع في أي مستوى من سلسلة النتائج؟' },
  'I-K2': { text: 'في أي حالة تكون لغة «المساهمة» أدق من «الإسناد» في تقرير الأثر؟' },
  'I-K5B': { text: 'أي عنصر ينقص المؤشر التالي: «خفض زمن إنجاز المعاملة من 10 أيام إلى 4 أيام»؟' },

  // ── إعادة ترتيب فقط (موقع المفتاح) ──
  'I-K6': { order: [0, 2, 3, 1] }, // B → D
  'I-S2': { order: [0, 2, 3, 1] }, // B → D
  'I-S5': { order: [0, 1, 3, 2] }, // C → D
  'L-K5': { order: [0, 2, 3, 1] }, // B → D
  'L-S2': { order: [0, 2, 3, 1] }, // B → D
  'M-S3': { order: [0, 2, 3, 1] }, // B → D
};

const POS = 'ABCDEF';
const idx = (letter) => POS.indexOf(letter);

export function applyEdit(q, e) {
  const out = { ...q, options: q.options.map((o) => ({ ...o })) };
  if (e.text) out.text_ar = e.text;
  if (e.help) out.help_ar = e.help;
  if (e.rater) out.text_rater_ar = e.rater;
  for (const [l, label] of Object.entries(e.options || {})) {
    if (!out.options[idx(l)]) throw new Error(`${q.code}: لا خيار ${l}`);
    out.options[idx(l)].label = label;
  }
  for (const [l, score] of Object.entries(e.scores || {})) {
    if (!out.options[idx(l)]) throw new Error(`${q.code}: لا خيار ${l}`);
    out.options[idx(l)].score = score;
  }
  if (e.order) {
    if (e.order.length !== out.options.length || [...e.order].sort().join() !== out.options.map((_, i) => i).join()) throw new Error(`${q.code}: ترتيب غير صالح`);
    out.options = e.order.map((i) => out.options[i]);
  }
  return out;
}

export function build() {
  const src = JSON.parse(readFileSync(SRC, 'utf8'));
  const seen = new Set();
  const out = src.map((q) => {
    if (!ACTIVE.includes(q.instrument)) return q;
    const e = EDITS[q.code];
    if (!e) return q;
    seen.add(q.code);
    return applyEdit(q, e);
  });
  const missing = Object.keys(EDITS).filter((c) => !seen.has(c));
  if (missing.length) throw new Error(`رموز غير موجودة في البنك: ${missing.join(', ')}`);
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const items = build();
  writeFileSync(OUT, JSON.stringify(items, null, 2) + '\n');
  console.log(`كُتب ${items.length} صفًا إلى ${OUT.pathname} (${Object.keys(EDITS).length} رمزًا معدّلًا)`);
}
