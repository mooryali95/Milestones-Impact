import { gregorianToHijri, fmtGregorian } from "./dateUtils";

// ════════════════════════════════════════════════════════════════
// PRINT — نموذج الخطة النهائي (نافذة طباعة مستقلة)
// ════════════════════════════════════════════════════════════════

// المحرك يُحمَّل عند الطلب، والنافذة تُفتح فور النقر قبل التحميل
export async function printFinalTable(user, procs, dates, confirmed) {
  const win = window.open("", "_blank");
  const [{ writeDocument }, { planReport }] = await Promise.all([import("./brand/doc.js"), import("./brand/reports.js")]);
  const rows = procs
    .filter((p) => dates[p.key])
    .sort((a, b) => new Date(dates[a.key]) - new Date(dates[b.key]))
    .map((p) => ({
      name: p.nameAr, track: p.trackNameAr, trackColor: p.trackColor, weight: p.trackWeight, phase: p.phaseNameAr,
      duration: `${p.dur} أيام`, gregorian: fmtGregorian(dates[p.key]), hijri: gregorianToHijri(dates[p.key]).formatted, confirmed: !!confirmed[p.key],
    }));
  const { meta, body } = planReport(user, rows);
  if (!writeDocument(win, meta, body)) {
    alert("يرجى السماح بالنوافذ المنبثقة (Popup) لطباعة النموذج.\n\nSettings → Allow pop-ups for this site");
  }
}
