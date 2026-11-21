// ════════════════════════════════════════════════════════════════
// الحساب التجريبي، المرحلة 1 من تصوره (2026-11-19): التخطي وفتح كل المراحل (منطق خالص)
// ════════════════════════════════════════════════════════════════
// مصدر واحد للخادم (demo.ts) ولتطبيق المشارك (DemoBar.jsx): أي مرحلة هي «الحالية» التي يتخطاها الزر، وما يُفتح بزر
// «افتح كل المراحل»، ونصوص الشارة والوسم. التخطي يكتب تجاوزًا (skip) في participant_stage_overrides للحساب التجريبي
// وحده، بالآلية نفسها التي يتدخل بها المدير في مرحلة مشارك، ولا يكتب إنجازًا ولا حضورًا ولا درجة ولا شهادة.

/** الاسم الظاهر الموحد (القرار 3 في التصور). «حساب اختبار» يبقى للعلامة الأخرى is_test */
export const DEMO_NAME_AR = 'حساب تجريبي';
/** سطر الشارة الثابتة في كل شاشة من الحساب */
export const DEMO_BADGE_LINE_AR = 'ما تفعله هنا لا يُحسب';
/** يُضاف لمن دخل برابط تجربة: الحساب واحد يشترك فيه كل من يجرّب */
export const DEMO_SHARED_LINE_AR = 'وقد يراه غيرك ممن يجرّب';
/** وسم المرحلة المتخطاة في رحلة الحساب التجريبي (القرار 5): لا «مكتملة» ولا أدلة مختلقة */
export const DEMO_SKIPPED_AR = 'تم تخطيها للعرض';
/** رد الأفعال المغلقة على الحساب التجريبي (ما يمس طرفًا ثالثًا أو مالًا أو وثيقة رسمية يُعرض ولا يُنفذ) */
export const DEMO_NOT_REAL_AR = 'في الحساب التجريبي لا يُنفذ هذا فعليًا';
/** علامة معاينة الشهادة (القرار 6) */
export const DEMO_SAMPLE_AR = 'نموذج للعرض';
export const DEMO_SKIP_NOTE = 'تخطٍّ للعرض في الحساب التجريبي';
export const DEMO_OPEN_NOTE = 'فتح للعرض في الحساب التجريبي';

const lane = (s) => s?.lane || 'stage';

/**
 * المرحلة التي يتخطاها زر «تخطَّ هذه المرحلة»: أول مرحلة لم تنتهِ بترتيب الرحلة. الخدمة خارجها (يطلبها من يريد، ولا
 * تكتمل الرحلة بها)، والمسار المستمر يأتي بعد المراحل المتتابعة لأنه يسير بجانبها. null حين لا يبقى ما يُتخطى.
 * @param {any[]} journey مراحل الرحلة كما يحسبها resolveStages
 */
export function demoCurrentStage(journey) {
  const open = (journey || []).filter((s) => s && s.status !== 'done' && lane(s) !== 'service');
  return open.find((s) => lane(s) === 'stage') || open[0] || null;
}

/** ما يكتب له «افتح كل المراحل» فتحًا: المقفلة وحدها، فلا يُمس ما فُتح أو انتهى أو تُخطي. @param {any[]} journey */
export function demoLockedStages(journey) {
  return (journey || []).filter((s) => s && s.status === 'locked');
}

/**
 * ما يفعله «تخطَّ هذه المرحلة» الآن، بالحكم نفسه في الخادم (skipStage) وفي نص الشريط: بوابتا القبول تُتخطيان بما
 * يفتحهما فعلًا (ملء الملف، ثم إجابة القياس وإرساله فيُعتمد المسار آليًا)، وما بعدهما بتجاوز المرحلة الحالية.
 * @param {{ profileDone: boolean, approved: boolean, journey: any[] }} x
 * @returns {{ kind: 'profile' | 'assessment' | 'stage' | 'none', title: string | null, stage: any }}
 */
export function demoSkipTarget({ profileDone, approved, journey }) {
  if (!profileDone) return { kind: 'profile', title: 'الملف الشخصي', stage: null };
  if (!approved) return { kind: 'assessment', title: 'القياس واعتماد المسار', stage: null };
  const stage = demoCurrentStage(journey);
  return stage ? { kind: 'stage', title: stage.title_ar || stage.key, stage } : { kind: 'none', title: null, stage: null };
}
