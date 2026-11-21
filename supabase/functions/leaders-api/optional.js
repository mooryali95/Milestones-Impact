// ════════════════════════════════════════════════════════════════
// قاعدة «الاختياري لا يُحسب» (قرار المالك 2026-11-21): المصدر الواحد
// ════════════════════════════════════════════════════════════════
// القاعدة: ما وُسم اختياريًا لا يدخل في أي عدّ. لا في نسبة التقدم (لا بسطًا ولا مقامًا)، ولا في بوابة الاستبانة، ولا في
// اكتمال المرحلة بأي قاعدة اكتمال، ولا في نتائج المجموعة والدفعة، ولا في التقارير والشهادات، ولا في نسب الحضور، ولا في
// تنبيه المتأخرين، ولا في «ماذا تغيّر» وأرقام البريد الأسبوعي. والإلزامي يدخل فيها كلها بالقاعدة نفسها.
//
// الاختياري ثلاثة أشياء، وكلها تُسأل من هذا الملف وحده:
//   1. نشاط اختياري في البرنامج: stage_requirements.required = false.
//   2. ورشة اختيارية: workshop_sessions.optional = true (الترحيل 20261122100000). حضورها يُسجَّل ويُعرض، ولا يُعد يومًا من
//      أيام نشاطها ولا يدخل في نسبة حضور ولا تنبيه. قبل الترحيل لا عمود، فكل ورشة إلزامية كما كانت.
//   3. نشاط «ورش إضافية» (config.each) بلا ورشة إلزامية قائمة لدفعة المشارك: خامد، فهو خارج العد حتى تُضاف له ورشة إلزامية.
//      المطلوب فيه كل ورشة إلزامية بعينها (لا عدد ثابت من البرنامج)، فيزيد بإضافتها وينقص بجعلها اختيارية.
//
// حفظ الاكتمال: ما اعتُمد اكتماله لمشارك (صف تقدم «done») يبقى مكتملًا، فنشاط الورش الإضافية المعتمد له يبقى في عدّه مكتملًا
// ولو خمد بعدها. بهذا لا يُسحب اكتمال من أحد بتغيير وسم ورشة (preserveCompletion في activities.ts).
//
// الحارس optional_guard_test.ts يقرأ ملفات الخادم: كل قراءة لـrequired أو لجلسات الورش والحضور تمر من هنا أو تحمل سببها.
// بلا اعتماد على شيء: يستورده logic.js وjourney.js وما فوقهما، ولوحتا الإدارة والقادة.

export const COUNTING = Object.freeze(['mandatory', 'optional']);
export const COUNTING_AR = Object.freeze({ mandatory: 'إلزامية', optional: 'اختيارية' });
// سطر واحد لكل اختيار، يُعرض تحت الاختيار في نموذج الورشة وفي نافذة التغيير
export const COUNTING_HELP_AR = Object.freeze({
  mandatory: 'تُحسب في كل شيء: التقدم واكتمال المرحلة ونسب الحضور والتقارير والتنبيهات.',
  optional: 'لا تُحسب في شيء: يُسجَّل حضورها ويُعرض، ولا يدخل في تقدم ولا اكتمال ولا نسبة ولا تنبيه.',
});
// ما يراه المشارك على الورشة الاختيارية
export const OPTIONAL_PARTICIPANT_AR = 'اختيارية، لا تُحسب في تقدمك';
export const OPTIONAL_NOT_READY_AR = 'غير مفعّلة بعد';

/** نشاط اختياري في تعريف البرنامج @param {any} r */
export const optionalReq = (r) => !!r && r.required === false;
/** نشاط «ورش إضافية»: كل ورشة إلزامية فيه مطلوبة بعينها @param {any} r */
export const eachWorkshop = (r) => !!r && r.kind === 'workshop' && r.config?.each === true;
/** ورشة اختيارية @param {any} s */
export const optionalSession = (s) => !!s && s.optional === true;
/** الجلسات التي تُعد: كل ما ليس اختياريًا @template T @param {T[] | null | undefined} rows @returns {T[]} */
export const countedSessions = (rows) => (rows || []).filter((s) => !optionalSession(s));
/** وسم الجلسة بكلمتيه @param {any} s */
export const countingOf = (s) => (optionalSession(s) ? 'optional' : 'mandatory');

/** هل يدخل تعريف النشاط في العد قبل أي دليل؟ (فحوص البرنامج والخطة والمواعيد). نشاط الورش الإضافية لا يُعوَّل عليه في
 * التعريف: قد يكون خامدًا في أي دفعة @param {any} r */
export const countedDef = (r) => !optionalReq(r) && !eachWorkshop(r);

/** هل البند خارج العد لهذا المشارك؟ يُختم به البند عند بناء رحلته (buildJourney) فيقرؤه كل من بعده من required وحده
 * @param {any} req تعريف النشاط @param {any} activity دليله (workshopStatus) أو null @param {boolean} approved صف تقدمه «done» */
export function itemOptional(req, activity, approved = false) {
  if (optionalReq(req)) return true;
  if (!eachWorkshop(req)) return false;
  return !(Number(activity?.total) > 0) && !approved;
}

/** البند المبني في رحلة مشارك: يُعد ما لم يُختم اختياريًا. المصدر الواحد لكل عدّاد ونسبة وشرط @param {any} item */
export const countsItem = (item) => !!item && item.required !== false;
/** @template T @param {T[] | null | undefined} items @returns {T[]} */
export const countedItems = (items) => (items || []).filter(countsItem);
/** عدّاد المرحلة: المنجز والمطلوب من البنود التي تُعد وحدها @param {any[] | null | undefined} items */
export function countedProgress(items) {
  const list = countedItems(items);
  return { done: list.filter((i) => i.status === 'done').length, total: list.length, optional: (items || []).length - list.length };
}

// ── أثر وسم ورشة على أعضاء دفعتها، بأرقامه (countingImpact في activities.ts) ──
// members: أعضاء الدفعة داخل البرنامج ممن يخصهم النشاط. preserved: من كان سيُسحب منهم اكتمال نشاط أو مرحلة فحُفظ لهم.
// required_of: من تصير مطلوبة منهم. completes: من يكتمل نشاطهم بها. progress_up وprogress_down: من تتغير نسبة تقدمهم.
export const NO_IMPACT = Object.freeze({ members: 0, preserved: 0, required_of: 0, completes: 0, progress_up: 0, progress_down: 0 });
// المعدود بعد حرف جر أو مضاف (من مشاركَين، تقدم 3 مشاركين)، ومرفوعًا بين قوسين
const peopleOf = (n) => (n === 1 ? 'مشارك واحد' : n === 2 ? 'مشاركَين' : n >= 3 && n <= 10 ? `${n} مشاركين` : `${n} مشاركًا`);
const peopleN = (n) => (n === 1 ? 'مشارك واحد' : n === 2 ? 'مشاركان' : n >= 3 && n <= 10 ? `${n} مشاركين` : `${n} مشاركًا`);
/** سطور المعاينة قبل الحفظ، بالأرقام نفسها التي تُكتب في السجل
 * @param {{ members?: number, preserved?: number, required_of?: number, completes?: number, progress_up?: number, progress_down?: number } | null | undefined} impact
 * @param {'mandatory'|'optional'} to الوسم بعد الحفظ @returns {string[]} */
export function countingImpactAr(impact, to) {
  const i = { ...NO_IMPACT, ...(impact || {}) };
  const out = [];
  const changed = i.progress_up + i.progress_down;
  if (to === 'optional' && !changed && !i.preserved && !i.completes) return ['لا يتغير تقدم أحد ولا اكتماله: الورشة الاختيارية خارج كل حساب.'];
  if (to === 'mandatory' && !changed && !i.preserved && !i.completes && !i.required_of) return ['لا يتغير تقدم أحد ولا اكتماله الآن: تُحسب لمن يحضرها.'];
  if (i.required_of) out.push(`تصير مطلوبة من ${peopleOf(i.required_of)} لإكمال المرحلة.`);
  if (i.completes) out.push(`يكتمل بها نشاط ${peopleOf(i.completes)}.`);
  if (i.progress_down) out.push(`تنخفض نسبة تقدم ${peopleOf(i.progress_down)}.`);
  if (i.progress_up) out.push(`ترتفع نسبة تقدم ${peopleOf(i.progress_up)}.`);
  if (i.preserved) out.push(`من أتم ما يخصه قبل هذا التغيير (${peopleN(i.preserved)}) يبقى اكتماله محفوظًا: لا يُسحب منه شيء، ولا شهادة تُمس.`);
  return out;
}
