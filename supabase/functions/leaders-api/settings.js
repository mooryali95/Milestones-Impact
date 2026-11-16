// ════════════════════════════════════════════════════════════════
// الإعدادات العامة: مخزن واحد لكل قيمة يضبطها المالك من اللوحة (leaders.app_settings)
// ════════════════════════════════════════════════════════════════
// قاعدة المالك (2026-11-11): كل قيمة يضبطها المالك (حدود تقييم 360 ومهله وتذكيراته وسلمه، وحدود زمن
// الإجابة في مراجعة القياس) إعداد ديناميكي بقيمة افتراضية معقولة يحررها المدير من اللوحة، ومصدره هنا وحده.
// دالة نقية بلا قاعدة ولا Deno: الخادم يقرأ بها المخزن (settings.ts)، واللوحة ترسم محررها من SETTINGS نفسه،
// والوحدات المستهلكة (answer-review.js وfeedback360.js) تأخذ قيمها الافتراضية من DEFAULTS هنا.
// كل مجموعة صف واحد في المخزن (key = اسم المجموعة، value = ما حُرِّر منها). ما لم يُحرَّر يبقى على افتراضيه.

import { VISIBILITY, VISIBILITY_KEYS, visibilityLabel } from './visibility.js';

const int = (d, min, max, label_ar, hint_ar = '') => ({ type: 'int', default: d, min, max, label_ar, hint_ar });
const num = (d, min, max, step, label_ar, hint_ar = '') => ({ type: 'number', default: d, min, max, step, label_ar, hint_ar });

export const SETTINGS = {
  // الميزات قيد البناء (تصور مفاتيح الميزات، اعتمده المالك 2026-11-16): ما يُطفأ هنا يختفي عن كل من ليس مديرًا ويرفضه الخادم
  // (features.js)، ويبقى للمدير يبنيه. مطفأة افتراضيًا: مخزن غائب أو تالف لا يُظهر ميزة. لا يُحذف بها بيان، فإظهارها يعيد ما كان.
  // ومفتاح 360 هو feedback360.enabled نفسه، فلكل ميزة مفتاح واحد. ولا يمس المفتاح الدرجة: وزن كاتون مستقل (final.js وcontinuous.js)
  features: {
    title_ar: 'الميزات قيد البناء',
    note_ar: 'ما يُطفأ هنا يختفي عن المشاركين والخبراء والمنسقين والمقيّمين والبريد، ويبقى للمدير يعمل عليه. لا يُحذف أي بيان.',
    fields: {
      hall: { type: 'bool', default: false, label_ar: 'القاعة الحية ظاهرة للمستخدمين', hint_ar: 'مطفأة: لا يدخلها مشارك ولا يفتحها خبير ولا مدير، وتخلو منها رسائل الورش (الحضور برمز QR)، وتتوقف معها إجابة جمل «كاتون» داخلها.' },
      katon: { type: 'bool', default: false, label_ar: 'كاتون ظاهر للمستخدمين', hint_ar: 'شاشة «كاتون» المستقلة. الإجابة داخل القاعة يحكمها مفتاح القاعة، ووزن كاتون في التقييم لا يتغير بهذا المفتاح.' },
    },
  },
  feedback360: {
    title_ar: 'تقييم 360 للتطوير',
    note_ar: 'للتطوير وحده: لا يدخل التقييم الختامي ولا الشهادة ولا ما تراه الجهة عن الفرد.',
    fields: {
      // مفتاح 360 الواحد (مفاتيح الميزات 2026-11-16، الخيار أ): يُعرض في «الميزات قيد البناء» بجانب القاعة وكاتون، ويُخزَّن هنا
      enabled: { type: 'bool', default: false, label_ar: 'تقييم 360 ظاهر للمستخدمين', hint_ar: 'مطفأ: يختفي 360 عن المشاركين والمستشارين والمنسقين والمقيّمين وبريدهم، وتتجمد الدورات الجارية بلا بريد ولا إرسال، ويبقى للمدير. مُظهَر: يبدأ منه المشارك موجته وتستأنف الدورات من حالها.' },
      min_group: int(3, 2, 10, 'حد الإخفاء لكل مجموعة', 'أقل عدد مرسلين لتظهر المجموعة وحدها (الزملاء، الفريق، أصحاب المصلحة). المدير مستثنى ويظهر باسم دوره.'),
      min_others: int(3, 2, 20, 'أقل عدد لإصدار التقرير', 'من غير المدير. دونه لا يصدر تقرير ويُقال للمشارك ذلك بصدق.'),
      max_peer: int(6, 3, 12, 'أعلى عدد للزملاء'),
      max_report: int(6, 3, 12, 'أعلى عدد لأعضاء الفريق'),
      max_stakeholder: int(3, 3, 8, 'أعلى عدد لأصحاب المصلحة'),
      window_days: int(14, 5, 60, 'نافذة التقدير بالأيام', 'من اعتماد المستشار للقائمة إلى الإغلاق.'),
      remind_days: { type: 'days', default: [5, 10], min: 1, max: 59, label_ar: 'أيام التذكير', hint_ar: 'أيام من فتح النافذة يُذكَّر فيها من لم يرسل، مفصولة بفاصلة. كل يوم أقل من النافذة.' },
      round_gap_days: int(90, 30, 365, 'أقل مدة بين الموجتين بالأيام', 'السلوك يحتاج 3 إلى 6 أشهر ليظهر تغيره.'),
      gap_points: num(0.5, 0.2, 2, 0.1, 'فرق القوة الخفية والنقطة العمياء', 'على سلم 1 إلى 5: الفرق بين تقديرك وتقدير الآخرين الذي يُعد لافتًا.'),
      org_min: int(5, 3, 50, 'أقل عدد تقارير لمجاميع الجهة', 'تحته لا يرى منسق الجهة إلا نسبة الاستجابة.'),
      scale_labels: { type: 'labels', count: 5, default: ['نادرًا أو أبدًا', 'في أقل من نصف المرات', 'في نحو نصف المرات', 'في أغلب المرات', 'في كل المرات تقريبًا'], label_ar: 'مراسي السلم من 1 إلى 5', hint_ar: 'تظهر للمقيّم في النموذج وفي مفتاح التقرير. «لا أستطيع الحكم» ثابت.' },
    },
  },
  answer_review: {
    title_ar: 'زمن الإجابة في مراجعة القياس',
    note_ar: 'مؤشر مراجعة بصري لا يدخل أي قرار آلي ولا احتساب المستوى.',
    fields: {
      idle_seconds: int(300, 30, 3600, 'حد الانقطاع بالثواني', 'فاصل أطول منه بين إجابتين لا يُحسب زمنًا.'),
      fast_ratio: num(0.3, 0.05, 0.9, 0.05, 'نسبة «سريع» من وسيط القسم', 'إجابة أسرع من هذه النسبة من وسيط قسمها تُعلَّم «سريع».'),
      fast_min_sample: int(3, 2, 20, 'أقل عدد أزمنة لحساب وسيط القسم'),
      fast_floor_choice: num(3, 0.5, 30, 0.5, 'أدنى زمن معقول لسؤال الاختيار بالثواني'),
      fast_floor_likert: num(1.5, 0.5, 30, 0.5, 'أدنى زمن معقول لعبارة التقدير بالثواني'),
      // مؤشر الجهد على مستوى المشارك (مراجعة 2026-11-13): حد قراءة مطلق لا نسبةً إلى وسيط المشارك نفسه،
      // فمن استعجل في كل القياس يُعلَّم. استشاري للمستشار قبل الاعتماد، ولا يدخل الدرجة
      effort_floor_choice: num(5, 1, 60, 0.5, 'حد القراءة لسؤال الاختيار بالثواني', 'إجابة أسرع منه تُعدّ «دون زمن القراءة» في مؤشر الجهد.'),
      effort_floor_likert: num(2, 0.5, 30, 0.5, 'حد القراءة لعبارة التقدير بالثواني'),
      pace_streak: int(4, 2, 12, 'عدد الإجابات السريعة المتتالية قبل تنبيه المشارك', 'أثناء القياس: بعد هذا العدد من إجابات أسرع من حد القراءة يظهر للمشارك تنبيه لطيف «خذ وقتك»، مرتين على الأكثر.'),
      effort_low_share: num(0.25, 0.05, 0.9, 0.05, 'نسبة الإجابات دون زمن القراءة التي تعني جهدًا منخفضًا', 'عندها يُنبَّه المستشار إلى إعادة القياس قبل الاعتماد. نصفها يعني «يُراجع».'),
    },
  },
  // التوجيه والإرشاد (تصور 2026-11-16 v2، قرار المالك): السقوف والحفظ تُضبط هنا وحدها، ويقرؤها خادم المحادثة
  // من المرحلة G2. سقف الإنفاق ضابط مالي، فحفظ المجموعة للمدير الأعلى والمالك وحدهما (super)
  guidance: {
    title_ar: 'التوجيه والإرشاد (المساعد الذكي داخل الرحلة)',
    note_ar: 'المحادثة تلتزم بهذه القيم: الحدان لكل مشارك، والسقف اليومي لكل المشاركين معًا، ومدة الحفظ ثم الحذف الآلي. الحفظ للمدير الأعلى والمالك.',
    super: true,
    fields: {
      enabled: { type: 'bool', default: false, label_ar: 'المساعد الذكي مفعّل للمشاركين', hint_ar: 'لا يعمل لأحد قبل نسخة السياسة الجوهرية واجتياز تقييم الدقة (المرحلة G4) ولو فُعّل هنا. ومع التفعيل يبقى لمن بدأ القراءة أو المبادرة، ولجهة تسمح به.' },
      daily_spend_usd: num(5, 0, 200, 0.5, 'سقف الإنفاق اليومي بالدولار', 'لكل مشاركي التوجيه معًا، منفصل عن سقف مساعد الموقع العام. عند بلوغه يتوقف المساعد إلى اليوم التالي ويبقى «اطلب استشارة». صفر يوقفه.'),
      monthly_questions: int(30, 1, 300, 'أسئلة الشهر لكل مشارك', 'يرى المشارك ما بقي له. عند بلوغه يُعرض «اطلب استشارة».'),
      daily_questions: int(8, 1, 50, 'أسئلة اليوم لكل مشارك'),
      retention_days: int(90, 7, 365, 'مدة حفظ المحادثة بالأيام', 'ثم تُحذف آليًا. وللمشارك أن يحذفها متى شاء.'),
    },
  },
  // الرؤية (visibility.js): الحقول تُولَّد من المفاتيح نفسها، فلا يُكتب مفتاح مرتين
  visibility: {
    title_ar: 'الرؤية: ما يراه المستشار والخبير والمشارك',
    note_ar: 'الافتراضي لكل الدفعات. لكل دفعة أن تستثني مفتاحًا من نموذجها. موافقة المشارك على مشاركة مستواه مع جهته وسرية مقيّمي 360 ليست مفاتيح.',
    fields: Object.fromEntries(VISIBILITY_KEYS.map((k) => [k, { type: 'bool', default: VISIBILITY[k].default, label_ar: visibilityLabel(k), hint_ar: VISIBILITY[k].hint_ar }])),
  },
};

export const SETTING_GROUPS = Object.keys(SETTINGS);
// القيم الافتراضية لكل مجموعة: المصدر الواحد لما تستعمله الوحدات قبل قراءة المخزن أو عند تعذّره
export const DEFAULTS = Object.fromEntries(SETTING_GROUPS.map((g) => [g, Object.fromEntries(Object.entries(SETTINGS[g].fields).map(([k, f]) => [k, f.default]))]));

// قيمة حقل واحد بعد التحقق: { ok, value } أو { ok: false, error }
export function cleanField(f, v) {
  const bad = (error) => ({ ok: false, error });
  if (f.type === 'bool') return typeof v === 'boolean' ? { ok: true, value: v } : bad('نعم أو لا');
  if (f.type === 'int' || f.type === 'number') {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isFinite(n)) return bad('رقم مطلوب');
    if (f.type === 'int' && !Number.isInteger(n)) return bad('عدد صحيح مطلوب');
    if (n < f.min || n > f.max) return bad(`بين ${f.min} و${f.max}`);
    return { ok: true, value: n };
  }
  if (f.type === 'days') {
    const list = Array.isArray(v) ? v : String(v ?? '').split(/[,،\s]+/).filter(Boolean);
    const ns = list.map(Number);
    if (!ns.length || ns.length > 5 || ns.some((n) => !Number.isInteger(n) || n < f.min || n > f.max)) return bad(`من يوم إلى خمسة أيام، كل منها بين ${f.min} و${f.max}`);
    return { ok: true, value: [...new Set(ns)].sort((a, b) => a - b) };
  }
  if (f.type === 'labels') {
    if (!Array.isArray(v) || v.length !== f.count) return bad(`${f.count} مراسٍ`);
    const out = v.map((x) => String(x ?? '').trim().slice(0, 60));
    if (out.some((x) => !x)) return bad('لا مرساة فارغة');
    return { ok: true, value: out };
  }
  return bad('نوع غير معروف');
}

// قواعد بين الحقول في المجموعة الواحدة، بعد تحقق كل حقل
function crossCheck(group, v) {
  if (group === 'feedback360') {
    if (v.remind_days.some((d) => d >= v.window_days)) return 'أيام التذكير يجب أن تقع داخل نافذة التقدير';
    if (v.min_others < v.min_group) return 'أقل عدد لإصدار التقرير لا يقل عن حد الإخفاء';
  }
  if (group === 'guidance' && v.daily_questions > v.monthly_questions) return 'أسئلة اليوم لا تزيد على أسئلة الشهر';
  return null;
}

// تحقق تعديل الإدارة لمجموعة: يعيد القيمة المكتملة (المحرَّر فوق الافتراضي) أو أخطاء كل حقل
/** @returns {{ ok: boolean, value?: any, errors?: Record<string, string> }} */
export function cleanGroup(group, input, current = null) {
  const def = SETTINGS[group];
  if (!def) return { ok: false, errors: { _: 'مجموعة غير معروفة' } };
  const base = { ...DEFAULTS[group], ...(current || {}) };
  const errors = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!def.fields[k]) { errors[k] = 'حقل غير معروف'; continue; }
    const r = cleanField(def.fields[k], v);
    if (r.ok) base[k] = r.value; else errors[k] = r.error;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const cross = crossCheck(group, base);
  if (cross) return { ok: false, errors: { _: cross } };
  return { ok: true, value: base };
}

// صفوف المخزن إلى قيم كاملة: كل حقل محرَّر صالح يُقرأ، وما سواه (غائب أو تالف) يبقى على افتراضيه
export function resolveSettings(rows = []) {
  const out = structuredClone(DEFAULTS);
  for (const r of rows || []) {
    const def = SETTINGS[r?.key];
    if (!def || !r.value || typeof r.value !== 'object') continue;
    for (const [k, v] of Object.entries(r.value)) {
      if (!def.fields[k]) continue;
      const c = cleanField(def.fields[k], v);
      if (c.ok) out[r.key][k] = c.value;
    }
    if (crossCheck(r.key, out[r.key])) out[r.key] = { ...DEFAULTS[r.key] };
  }
  return out;
}
