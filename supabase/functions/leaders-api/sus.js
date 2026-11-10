// ════════════════════════════════════════════════════════════════
// مقياس سهولة الاستخدام SUS (Brooke 1996): المصدر الواحد لبنوده واحتسابه وموعده
// ════════════════════════════════════════════════════════════════
// عشر عبارات بخمس درجات. الفردية إيجابية والزوجية سلبية، والدرجة من 0 إلى 100.
// 68 متوسط الأنظمة عمومًا، و75 هدف بوابة م4 (خمسة مستخدمين لكل دور على الأقل).
// الصياغة العربية ترجمة للأصل تحفظ قطبية كل عبارة، وتُعرض على لجنة المحتوى قبل اعتماد نتائجها.

export const SUS_ITEMS = [
  'أظن أنني سأستعمل هذه المنصة باستمرار.',
  'وجدت المنصة معقدة بلا داعٍ.',
  'وجدت المنصة سهلة الاستعمال.',
  'أظن أنني سأحتاج دعمًا من شخص تقني لأستعمل المنصة.',
  'وجدت وظائف المنصة متكاملة فيما بينها.',
  'وجدت في المنصة تناقضًا كثيرًا.',
  'أتصور أن معظم الناس سيتعلمون استعمال المنصة بسرعة.',
  'وجدت المنصة مرهقة في الاستعمال.',
  'شعرت بثقة وأنا أستعمل المنصة.',
  'احتجت أن أتعلم أشياء كثيرة قبل أن أبدأ باستعمال المنصة.',
];
export const SUS_SCALE = ['لا أوافق بشدة', 'لا أوافق', 'محايد', 'أوافق', 'أوافق بشدة'];
export const SUS_ROLES = ['participant', 'expert', 'coordinator'];
export const SUS_ROLE_AR = { participant: 'المشاركون', expert: 'الخبراء', coordinator: 'منسقو الجهات' };
export const SUS_AFTER_DAYS = 7;   // بعد أسبوع من أول استعمال: الانطباع بعد تجربة حقيقية لا بعد أول شاشة
export const SUS_SNOOZE_DAYS = 3;  // «لاحقًا» تؤجل البطاقة ولا تلغيها
export const SUS_TARGET = 75;
export const SUS_MIN_N = 5;
export const SUS_COMMENT_MAX = 600;

export const susValid = (a) => Array.isArray(a) && a.length === SUS_ITEMS.length && a.every((x) => Number.isInteger(x) && x >= 1 && x <= 5);

// الفردية (1، 3، ...): الدرجة ناقص 1. الزوجية: 5 ناقص الدرجة. المجموع في 2.5.
export function susScore(a) {
  if (!susValid(a)) return null;
  return a.reduce((s, x, i) => s + (i % 2 === 0 ? x - 1 : 5 - x), 0) * 2.5;
}

// مستحق إن مضى أسبوع على إنشاء الحساب ولم يُجب، ولم يؤجله خلال أيام التأجيل
export function susDue({ createdAt, answered, snoozedAt, now = Date.now() }) {
  if (answered || !createdAt) return false;
  const day = 864e5;
  if (now - new Date(createdAt).getTime() < SUS_AFTER_DAYS * day) return false;
  if (snoozedAt && now - new Date(snoozedAt).getTime() < SUS_SNOOZE_DAYS * day) return false;
  return true;
}

const median = (xs) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

// ملخص لكل دور: العدد والمتوسط والوسيط، وهل بلغ شرط البوابة (خمسة فأكثر ومتوسط فوق الهدف)
export function susSummary(rows) {
  const roles = SUS_ROLES.map((role) => {
    const scores = (rows || []).filter((r) => r.role === role).map((r) => Number(r.score)).filter((x) => Number.isFinite(x));
    const mean = scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10 : null;
    return { role, role_ar: SUS_ROLE_AR[role], n: scores.length, mean, median: median(scores), met: scores.length >= SUS_MIN_N && mean > SUS_TARGET };
  });
  return { roles, target: SUS_TARGET, min_n: SUS_MIN_N, met: roles.every((r) => r.met) };
}
