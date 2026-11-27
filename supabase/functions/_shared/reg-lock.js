// قفل تقديم الخطة في user-api save (تقرير الأمن الثاني، البند 2): submitted وreopenRequested وsubmittedAt يحفظها الخادم
// من القيمة المخزنة، وما يرسله المسجل فيها لا يُكتب إلا في انتقالين معتمدين:
//   التقديم الأول: submitted من false إلى true، ووقته submittedAt من ساعة الخادم لا من المتصفح.
//   طلب إعادة الفتح: reopenRequested من false إلى true لخطة مقدمة.
// فك القفل (submitted إلى false) ورفض الطلب أو قبوله للمشرف وحده (admin-api unlock-reg وupdate-reg).
// منطق صافٍ: يُختبر في reg_lock_test.ts وsrc/lib/reg-lock.test.js.

/** الحقول بعد تطبيق القفل: نسخة من fields بلا الحقول الثلاثة، ومعها ما يجيزه الانتقال وحده
 * @param {{ submitted?: unknown, reopenRequested?: unknown } | null | undefined} stored
 * @param {Record<string, unknown>} fields @param {string} [now] */
export function lockFields(stored, fields, now = new Date().toISOString()) {
  const out = { ...fields };
  delete out.submitted; delete out.reopenRequested; delete out.submittedAt;
  const wasSubmitted = stored?.submitted === true;
  // محتوى الخطة المقدمة مقفل كحالتها: لا يُعدَّل إلا بعد فك المشرف القفل
  if (wasSubmitted) { delete out.dates; delete out.confirmed; }
  if (!wasSubmitted && fields.submitted === true) { out.submitted = true; out.submittedAt = now; }
  if (wasSubmitted && stored?.reopenRequested !== true && fields.reopenRequested === true) out.reopenRequested = true;
  return out;
}
