// ════════════════════════════════════════════════════════════════
// DATE + VALIDATION UTILITIES
// ════════════════════════════════════════════════════════════════

// ── التقويم الهجري ──
// كان هنا حسابٌ يدوي للتقويم الهجري *الحسابي الجدولي*. وهو تقويم صحيح
// في ذاته، لكنه ليس التقويم المعتمد في السعودية — فكان يسبق أمّ القرى
// بيوم إلى يومين. أمثلة مقيسة: 2025-03-01 كان يُعرض «3 رمضان» وهو
// «1 رمضان»، و2000-01-01 «26 رمضان» وهو «24 رمضان».
//
// في تطبيقٍ للمواعيد هذا فرقٌ يُعتدّ به: المستخدم يقارن ما يراه هنا
// بتقويم هاتفه وتقويم الجهات الرسمية، وكلاهما أمّ القرى.
//
// Intl يشحن أمّ القرى في كل المتصفحات ضمن هدف البناء (Chrome 107+ ·
// Safari 16+)، فحلّ عشرين سطراً من الحساب اليدوي بسطرين يقرآن من
// المصدر الصحيح. و‑nu-latn تُبقي الأرقام لاتينية كبقية الواجهة.
const HIJRI_AR = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
  day: "numeric", month: "long", year: "numeric",
});
const HIJRI_PARTS = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
  day: "numeric", month: "numeric", year: "numeric",
});

export function gregorianToHijri(gDate) {
  const d = new Date(gDate);
  // تاريخ غير صالح يجعل Intl يرمي RangeError فيسقط التصيير كله؛
  // الحساب القديم كان يعيد NaN بصمت. نعيد شكلاً آمناً بدل الحالتين.
  if (Number.isNaN(d.getTime())) {
    return { day: NaN, month: NaN, year: NaN, formatted: "—" };
  }
  const ar = Object.fromEntries(HIJRI_AR.formatToParts(d).map(p => [p.type, p.value]));
  const num = Object.fromEntries(HIJRI_PARTS.formatToParts(d).map(p => [p.type, p.value]));
  return {
    day: Number(num.day),
    month: Number(num.month),
    year: Number(num.year),
    // نبني النص يدوياً لا عبر format(): الأخير يفصل «هـ» بمسافة،
    // والشكل المعتمد في الواجهة يلصقها بالسنة.
    formatted: `${ar.day} ${ar.month} ${ar.year}هـ`,
  };
}

export function fmtGregorian(d) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    year: "numeric", month: "long", day: "numeric", calendar: "gregory"
  }).format(new Date(d));
}

export function fmtShort(d) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(d));
}

export function fmtBoth(d) {
  const h = gregorianToHijri(d);
  const g = fmtGregorian(d);
  return { hijri: h.formatted, gregorian: g, both: `${h.formatted} | ${g}` };
}

export function todayISO() { return new Date().toISOString().split("T")[0]; }
export function validPhone(p) { return /^05\d{8}$/.test(p.replace(/\s/g, "")); }
export function validEmail(e) {
  // Stronger validation: requires valid TLD (2+ chars), no consecutive dots, no leading/trailing dots in local part
  return /^[a-zA-Z0-9]([a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(e)
    && !e.includes('..')
    && e.length <= 254;
}
export function isPast(d) { const t = new Date(); t.setHours(0, 0, 0, 0); return new Date(d) < t; }
