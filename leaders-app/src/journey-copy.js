// ════════════════════════════════════════════════════════════════
// نصوص الرحلة المحسوبة: عدّ المراحل، وصياغة النتيجة الختامية، والمعدود العربي، وصيغة الموعد
// ════════════════════════════════════════════════════════════════
// دوال صرفة بلا واجهة، فتُختبر وحدها (journey-copy.test.js) وتقرؤها شاشة الرحلة والأنشطة ومعالج البداية.
// (جولة المشارك 2026-11-19: رقمان مختلفان لعدد المراحل، وتهنئة فوق «لم يجتز»، و«2 معالم»، وصيغتان للوقت)
import { countAr } from '../../supabase/functions/leaders-api/labels.js';

// ── عدّ المراحل: قاعدة واحدة للرأس ولعناوين الأطوار ──
// ما يُعد على المشارك: المراحل المتتابعة المطلوبة. المرحلة «عند الحاجة» أو الاختيارية لا تُحسب عليه إن لم يحتجها وتُحسب
// له إن أتمها، والمسار المستمر (T1) والخدمة (T2) خارج العد. هي قاعدة نسبة التقدم نفسها (journeyProgress في logic.js)
export const countedStages = (journey) => (journey || []).filter((s) => s.lane !== 'track' && s.lane !== 'service'
  && ((s.stage_mode || 'required') === 'required' || s.status === 'done'));
/** «أنجزت X من Y»: للرحلة كلها أو لمراحل طور واحد */
export function stageTally(stages) {
  const counted = countedStages(stages);
  return { done: counted.filter((s) => s.status === 'done').length, total: counted.length };
}
export const stagesOfAr = (n) => countAr(n, 'مرحلة واحدة', 'مرحلتين', 'مراحل', 'مرحلة');

// ── المعدود العربي في المعالم ──
export const lateCountAr = (n) => countAr(n, 'معلم متأخر', 'معلمان متأخران', 'معالم متأخرة', 'معلمًا متأخرًا');
export const lateShortAr = (n) => countAr(n, 'واحد متأخر', 'اثنان متأخران', 'متأخرة', 'متأخرًا');
export const lateByAr = (days) => `متأخر ${countAr(days, 'يومًا واحدًا', 'يومين', 'أيام', 'يومًا')}`;
export const lateBannerAr = (late, maxDays) => (late === 1 ? `لديك معلم ${lateByAr(maxDays)}.`
  : `لديك ${lateCountAr(late)}، وأقصى التأخر ${countAr(maxDays, 'يوم واحد', 'يومان', 'أيام', 'يومًا')}.`);

// ── صيغة الموعد: واحدة لبطاقة «جلستك» ولقائمة الجلسات في المرحلة ──
export const fmtDay = (d) => new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtTime = (d) => new Date(d).toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
export const fmtWhen = (d) => `${fmtDay(d)}، ${fmtTime(d)}`;

// ── النتيجة الختامية: الرأس وسطر «التالي» يتبعان القرار ──
// لا وعد هنا ولا مسار جديد: كل سطر مما يحمله رد الخادم (القرار والدرجة وملاحظة الخبير) أو مما تعرضه الشاشة نفسها
// (بطاقة الشهادة، و«كيف يُقيَّم عملك» وفيها طريقة طلب المراجعة ومهلتها)، وما لا تُعرف خطوته يُحال إلى بريد الإدارة
const PASSED = new Set(['pass', 'pass_notes']);
/**
 * @param {{ final?: any, approved?: boolean, allDone?: boolean, hasPolicy?: boolean, firstName?: string }} a
 * allDone: كل المراحل المعدودة منجزة. hasPolicy: للبرنامج تقييم ختامي معلن (final_policy)
 * @returns {{ kind: 'pass'|'pass_notes'|'extend'|'fail'|'pending'|null, title: string|null, line: string|null,
 *   next: string|null, contact: boolean, review: boolean }}
 * title وline: عنوان الرأس وسطره حين يغيّرهما القرار، وإلا null فيبقى نص الرحلة المعتاد. line يُعرض مكان «أكملت الرحلة» وحده
 */
export function finalView({ final = null, approved = false, allDone = false, hasPolicy = false, firstName = '' } = {}) {
  const none = { kind: null, title: null, line: null, next: null, contact: false, review: false };
  if (!approved) return none;
  const d = final?.decision;
  if (PASSED.has(d)) {
    return { ...none, kind: d, title: `مبارك ${firstName}، اجتزت التقييم الختامي${d === 'pass_notes' ? ' بملاحظات' : ''}`,
      line: 'أكملت الرحلة كاملة. أثرك الآن موثّق.', next: 'شهادتك في بطاقة «شهادة الإتمام بنجاح» أدناه.' };
  }
  if (d === 'extend') {
    return { ...none, kind: 'extend', title: `${firstName}، مُدّدت مرحلتك لتستكمل ما ينقص`, line: 'قرار تقييمك الختامي: تمديد.',
      next: `استكمل ما ينقص في مرحلتك الممددة${final.notes ? '، وابدأ بملاحظات خبيرك' : ''}. لخطة الاستكمال راسل`, contact: true, review: hasPolicy };
  }
  if (d === 'fail') {
    return { ...none, kind: 'fail', title: `${firstName}، صدرت نتيجة تقييمك الختامي`, line: `أنهيت مراحل الرحلة، وقرار تقييمك الختامي: ${final.decision_ar || 'لم يجتز'}.`,
      next: 'للاستفسار عن نتيجتك وما بعدها راسل', contact: true, review: hasPolicy };
  }
  // لا قرار بعد: من أنهى مراحله وبرنامجه بتقييم ختامي ينتظر اعتماده، فلا يُقال له «أثرك موثّق» قبل النتيجة
  if (allDone && hasPolicy) {
    return { ...none, kind: 'pending', title: `${firstName}، أنهيت مراحل رحلتك`, line: 'تقييمك الختامي لم يُعتمد بعد، وتظهر نتيجته هنا حين يُعتمد.' };
  }
  return none;
}

// ── بعد إرسال القياس: هل بقي للمشارك ما يفعله بنفسه في قائمة التحقق؟ ──
// «اعتماد مسارك» ينتظر المستشار لا المشارك، والمراحل المقفلة والمنجزة لا بند فيها يُفعل الآن
export function leftToDo(journey) {
  return (journey || []).some((s) => s.status !== 'locked' && s.status !== 'done'
    && (s.items || []).some((i) => (i.status === 'pending' || i.status === 'returned') && i.code !== 'AP-OK'));
}
