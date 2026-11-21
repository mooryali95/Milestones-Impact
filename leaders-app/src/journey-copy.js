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

// ── تواريخ المرحلة: من نافذتها في خطة الدفعة (stage.window من الخادم، أي cohortPlan) ──
// ميلادي بالصيغة التي يُكتب بها امتداد المسار المستمر ومواعيد الجلسات. السنة تُذكر حين تختلف عن سنة اليوم وحدها
const isoOf = (d) => new Date(d).toISOString().slice(0, 10);
const dayNo = (iso) => Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 864e5);
export function fmtDate(iso, today = new Date()) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getUTCFullYear() !== new Date(today).getUTCFullYear();
  return d.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}
export const daysLeftAr = (n) => (n === 1 ? 'بقي يوم واحد' : n === 2 ? 'بقي يومان' : `بقي ${countAr(n, '', '', 'أيام', 'يومًا')}`);
/** مدى المرحلة وسطر نهايتها. null لمرحلة بلا نافذة (دفعة بلا تواريخ): لا يُعرض شيء
 * @param {any} stage @param {Date|string} [today]
 * @returns {{ range: string, end: string|null, tone: ''|'soon'|'over' }|null}
 * end للمرحلة الجارية وحدها: «تنتهي في كذا، بقي كذا»، أو أن مدتها المخططة انتهت */
export function stageDates(stage, today = new Date()) {
  const w = stage?.window;
  if (!w?.from || !w?.to) return null;
  // الشهر نفسه يُكتب مرة: «من 11 إلى 25 نوفمبر»، فيسع الوسم سطرًا على الهاتف
  const sameMonth = w.from.slice(0, 7) === w.to.slice(0, 7);
  const range = w.from === w.to ? fmtDate(w.from, today)
    : `من ${sameMonth ? Number(w.from.slice(8, 10)) : fmtDate(w.from, today)} إلى ${fmtDate(w.to, today)}`;
  if (stage.status !== 'active' && stage.status !== 'available') return { range, end: null, tone: '' };
  const t = dayNo(isoOf(today));
  const left = dayNo(w.to) - t;
  if (t < dayNo(w.from)) return { range, end: `تبدأ في ${fmtDate(w.from, today)}`, tone: '' };
  if (left < 0) return { range, end: `انتهت مدتها المخططة في ${fmtDate(w.to, today)}`, tone: 'over' };
  if (left === 0) return { range, end: 'تنتهي اليوم', tone: 'soon' };
  return { range, end: `تنتهي في ${fmtDate(w.to, today)}، ${daysLeftAr(left)}`, tone: left <= 3 ? 'soon' : '' };
}

// ── لماذا المرحلة متوقفة وما الذي يفتحها: سطر واحد من حالتها الفعلية ──
// المقفلة: من تفصيل قفلها (stage.lock من resolveStages على الخادم: القاعدة، وما تنتظره، وتاريخ الفتح)، فهو الحساب نفسه الذي
// قفلها. والجارية التي لا شيء فيها على المشارك: ما سلّمه عند مستشاره، أو أنجز بنودها واكتمالها باعتماد الفريق.
// بلا تفصيل (خادم أقدم) يبقى نص الخادم lock_reason كما كان، ولا يُخترع سبب
const quote = (titles) => titles.map((t) => `«${t}»`).join(titles.length === 2 ? ' و' : '، ');
const counted = (s) => (s?.items || []).filter((i) => i.required);
/** هل المرحلة جارية ولا ينقصها إلا مراجعة المستشار لما سُلّم؟ */
export function awaitingReview(stage) {
  if (!stage || (stage.status !== 'active' && stage.status !== 'available')) return [];
  const open = counted(stage).filter((i) => i.status !== 'done');
  return open.length && open.every((i) => i.status === 'submitted') ? open : [];
}
/** @param {any} stage @param {any[]} journey @param {Date|string} [today]
 * @returns {{ kind: 'locked'|'review'|'approval', text: string }|null} */
export function holdLine(stage, journey = [], today = new Date()) {
  if (!stage) return null;
  const by = new Map((journey || []).map((s) => [s.key, s]));
  const title = (k) => by.get(k)?.title_ar || null;
  if (stage.status === 'locked') {
    const l = stage.lock;
    if (!l) return stage.lock_reason ? { kind: 'locked', text: stage.lock_reason } : null;
    const due = (l.due || []).map(title).filter(Boolean);
    const waits = (l.waits || []).map(title).filter(Boolean);
    let text = '';
    if (l.unlock === 'approval') text = 'يفتحها لك فريق البرنامج حين يحين دورك فيها، ولا شيء مطلوب منك لفتحها.';
    else if (l.unlock === 'day' && l.date) text = `لم يحن موعدها: تُفتح في ${fmtDate(l.date, today)}.`;
    else if (l.unlock === 'with' && title(l.with)) text = by.get(l.with)?.status === 'locked' ? `تبدأ مع «${title(l.with)}»، وهي لم تُفتح بعد.` : `تُفتح مع بداية «${title(l.with)}».`;
    else if (waits.length) {
      // ما تنتظره وهو عند المستشار: يُقال، فلا يبحث المشارك عن شيء يفعله
      const inReview = (l.waits || []).filter((k) => awaitingReview(by.get(k)).length).map(title).filter(Boolean);
      text = inReview.length === waits.length
        ? `تُفتح حين يعتمد مستشارك ما سلّمته في ${quote(waits)}.`
        : `تُفتح بعد أن تكمل ${quote(waits)}${inReview.length ? `، وما سلّمته في ${quote(inReview)} عند مستشارك للمراجعة` : ''}.`;
    }
    if (due.length) text = `${text ? `${text} ` : ''}${text ? 'و' : ''}تنتظر البنود الإلزامية في مسارك المستمر ${quote(due)}.`;
    return text ? { kind: 'locked', text } : stage.lock_reason ? { kind: 'locked', text: stage.lock_reason } : null;
  }
  const review = awaitingReview(stage);
  if (review.length) {
    return { kind: 'review', text: `لا شيء مطلوب منك الآن: ${review.length === 1 ? `«${review[0].title_ar}» عند مستشارك للمراجعة` : `${countAr(review.length, 'بند واحد', 'بندان', 'بنود', 'بندًا')} سلّمتها عند مستشارك للمراجعة`}، وتكتمل المرحلة باعتماده.` };
  }
  if (stage.status === 'active' && stage.rules?.complete === 'approval' && counted(stage).every((i) => i.status === 'done')) {
    return { kind: 'approval', text: 'أنجزت ما عليك فيها، وتكتمل حين يعتمدها فريق البرنامج.' };
  }
  return null;
}
/** مرحلة أوقفتها الإدارة لدفعته بعد أن عمل فيها (stages_off من الخادم) */
export const stageOffAr = (s) => `أُوقفت «${s.title_ar}» لدفعتك، فلا شيء مطلوب منك فيها. ما أنجزته فيها محفوظ.`;

// ── تفصيل النتيجة الختامية: كل مكوّن بوزنه ودرجتك فيه (final.detail من الخادم، finalBreakdown) ──
const STATE_AR = { zeroed: 'لم يُسلَّم قبل نهاية الدفعة، فحُسب صفرًا', missing: 'لم يدخل الحساب، ووُزّع وزنه على بقية المكوّنات' };
/** @param {any} final رد الخادم me.final
 * @returns {{ rows: { key: string, label: string, weight: string, score: string, note: string|null, value: number|null }[], notes: string[] }|null}
 * null: لا تفصيل لهذه النتيجة، فتعرض الشاشة البديل الصادق (FINAL_NO_DETAIL_AR) */
export function finalDetailView(final) {
  const d = final?.detail;
  if (!d?.components?.length) return null;
  const rows = d.components.map((c) => ({
    key: c.key, label: c.label, weight: `وزنه ${c.weight}٪`, value: c.value,
    score: c.value == null ? 'لم يُحتسب' : `${c.value}٪`, note: STATE_AR[c.state] || null,
  }));
  const notes = [];
  if (d.score_adjusted) notes.push('عُدّلت درجتك النهائية عند اعتماد التقييم، فقد تختلف عن حاصل المكوّنات بأوزانها.');
  else notes.push('درجتك النهائية حاصل درجات المكوّنات بأوزانها.');
  if (d.thresholds && Number.isFinite(d.thresholds.pass)) notes.push(`حدود القرار: الاجتياز من ${d.thresholds.pass}٪، والاجتياز بملاحظات من ${d.thresholds.pass_notes}٪، والتمديد من ${d.thresholds.extend}٪.`);
  return { rows, notes };
}
// والبريد يُذكر بعدها مرة واحدة: حين لا يحمله سطر «التالي» (قرارا الاجتياز)
export const FINAL_NO_DETAIL_AR = 'تفصيل درجات المكوّنات غير متاح لهذه النتيجة.';
export const FINAL_ASK_DETAIL_AR = 'لطلبه راسل';
