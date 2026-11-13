// ════════════════════════════════════════════════════════════════
// قواعد التنبيه الآلي: ست وقائع تُكتب في ملف المشارك ويُبلَّغ بها (منطق ونصوص خالصة)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لنص كل تنبيه آلي ولحدّه. كل قاعدة تُكتب عبر observations.ts record() بمفتاحها ومرجع واقعتها،
// فلا تتكرر للواقعة نفسها. ست قواعد لا أكثر عمدًا: كثرة التنبيه تُفقد المهم قيمته (تصور 2026-11-13).
// النصوص تصف الواقعة وما يُنتظر بعدها، ولا تتهم.
const dayAr = (iso) => { try { return new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }); } catch { return ''; } };

export const QUIZ_LOW_SHARE = 0.5;     // درجة الباب دون النصف «منخفضة»
export const QUIZ_LOW_COUNT = 3;       // عند ثالث باب منخفض يُنبَّه، مرة واحدة
export const MODEL_RETURN_COUNT = 2;   // عند الإعادة الثانية للنموذج نفسه
export const STATUS_REASON_MIN = 5;    // الإيقاف والانسحاب بسبب مكتوب

export const RULES = {
  coaching_no_show: (s) => ({
    kind: 'warning', visible: true, title: 'غياب عن جلسة توجيه',
    body: `سُجّل غيابك عن جلسة التوجيه${s?.starts_at ? ` يوم ${dayAr(s.starts_at)}` : ''}. إن كان لديك عذر فأخبر مستشارك، واحجز موعدًا بديلًا من صفحة الأنشطة.`,
  }),
  milestone_late: (m) => ({
    kind: 'warning', visible: true, title: 'معلم متأخر في رحلتك',
    body: `معلم «${m?.title || 'في رحلتك'}» تجاوز موعده${m?.late_days ? ` بـ${m.late_days} يومًا` : ''}. ابدأ به، أو اطلب استشارة إن احتجت دعمًا.`,
  }),
  model_returned_again: (m) => ({
    kind: 'warning', visible: true, title: 'نموذج أُعيد للمرة الثانية',
    body: `أُعيد نموذج «${m?.title || 'النموذج التعليمي'}» إليك للمرة ${m?.times === 2 ? 'الثانية' : `${m?.times}`}. اقرأ ملاحظة المستشار كاملة قبل التعديل، واطلب جلسة توجيه إن لم تتضح.`,
  }),
  peer_hidden: () => ({
    kind: 'note', visible: true, title: 'إجابة لك في طلبات الأقران لم تُعتمد',
    body: 'راجع الخبير إجابتك عن طلب زميلك ورأى ألا تُعرض. لا أثر لذلك على تقييمك، وهي فرصة لمراجعة الباب المتصل بالسؤال.',
  }),
  account_status: (x) => ({
    kind: 'warning', visible: true, title: x?.status === 'withdrawn' ? 'سُجّل انسحابك من البرنامج' : 'أُوقف حسابك في البرنامج',
    body: `${x?.status === 'withdrawn' ? 'سجّلت إدارة البرنامج انسحابك' : 'أوقفت إدارة البرنامج حسابك'}. السبب: ${x?.reason}. للاستفسار راسل إدارة البرنامج.`,
  }),
  quiz_low: (x) => ({
    kind: 'note', visible: true, title: 'اختبارات الأبواب تستحق وقفة',
    body: `جاءت درجتك دون النصف في ${x?.count} من اختبارات أبواب الكتيب. الاختبار يُحتسب من المحاولة الأولى، فاقرأ الباب بتمهّل قبل أن تفتح اختباره.`,
  }),
};

/** هل بلغ عدد الأبواب المنخفضة حد التنبيه بهذه الإجابة بالذات؟ rows: { quiz_score, quiz_total } */
export function quizLowCount(rows) {
  return (rows || []).filter((r) => Number(r.quiz_total) > 0 && Number(r.quiz_score) / Number(r.quiz_total) < QUIZ_LOW_SHARE).length;
}
export const statusNeedsReason = (status) => ['suspended', 'withdrawn'].includes(status);
export function cleanStatusReason(v) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  return s.length >= STATUS_REASON_MIN ? s : null;
}
