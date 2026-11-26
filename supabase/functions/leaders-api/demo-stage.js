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

/** سطر «عند أي مرحلة» في حالة الحساب بملف الدفعة: المرحلة التي يقف عندها بالحكم نفسه (demoSkipTarget) */
export const DEMO_ALL_SKIPPED_AR = 'تخطى كل المراحل';
/** @param {{ kind: string, title: string | null }} target */
export const demoStageLine = (target) => (target?.kind === 'none' ? DEMO_ALL_SKIPPED_AR : target?.title || '');
/** اسم الدفعة في شريط الحساب التجريبي (4.6): حساب دفعة يسمّيها، والعام بلا دفعة لا يضيف شيئًا */
export const demoCohortLabel = (name) => (String(name || '').trim() ? `دفعة «${String(name).trim()}»` : '');

// ── «أعد من البداية» من الشريط (قرار المالك 2026-11-21) ──
// أخف من إعادة ضبط المدير الأعلى: يمسح كل ما يحمله الحساب التجريبي ويعيد صفه إلى أوله، ويُبقي صف الحساب نفسه (بمعرّفه)
// وجلساته القائمة وروابط التجربة، فلا يخرج زائر آخر من جلسته ولا يبطل رابط.
/** الاسم الذي يُنشأ به الحساب ويعود إليه */
export const DEMO_FULL_NAME = 'مشارك تجريبي';
/** أعمدة صف المشارك التي تعود إلى قيمتها الأولى */
export const DEMO_ROW_RESET = Object.freeze({
  full_name: DEMO_FULL_NAME, name_en: null, phone: null, job_title: null, organization_name: null, sector: null, years_experience: null, bio: null, cv_path: null,
  linkedin_url: null, work_scope: null, status: 'registered', profile_completed_at: null, passkey_prompted_at: null, passkey_dismissed_at: null, reminded_at: null,
  name_locked_at: null, name_confirmed_at: null, consented_at: null, consent_version: null, org_share_consented_at: null,
  // «لا يوجد مدير متاح» (تصور المرحلة 3، 20261129210000)
  no_manager: null, no_manager_at: null,
});
/** وأعمدته التي تبقى: هويته وعلامتاه ومصدره وأوقاته. organization_id فارغ دائمًا بقيد participants_demo_no_org */
export const DEMO_ROW_KEEP = Object.freeze(['id', 'email', 'is_demo', 'is_test', 'source', 'created_at', 'updated_at', 'last_login_at', 'email_verified_at',
  'organization_id', 'org_via', 'person_id', 'contact_request_id', 'campaign', 'referrer_host',
  // دفعة حساب الدفعة التجريبي (المرحلة 2): «أعد من البداية» يبقيه حساب دفعته
  'demo_cohort_id']);
/** جداول تبقى صفوف الحساب فيها عند «أعد من البداية»: جلساته وحدها */
export const DEMO_RESTART_KEEP = Object.freeze(['auth_sessions']);
/** جداول يشير عمود آخر فيها إلى المشارك (لا participant_id) */
export const DEMO_RESTART_EXTRA = Object.freeze({ peer_answers: 'author_id' });
/** نص الرابط الصغير في الشريط وتأكيده */
export const DEMO_RESTART_AR = 'أعد من البداية';
export const DEMO_RESTART_ASK_AR = 'يُمسح كل ما فُعل في هذا الحساب التجريبي ويعود إلى أول الرحلة. تبقى جلستك وروابط التجربة.';
export const DEMO_RESTART_ASK_SHARED_AR = 'يُمسح كل ما فُعل في هذا الحساب التجريبي ويعود إلى أول الرحلة، لك ولكل من يجرّبه الآن. تبقى الجلسات وروابط التجربة.';
/** وسم ما يُفتح للحساب التجريبي بلا اعتماده الحقيقي (متابعة الأثر) */
export const DEMO_FOR_SHOW_AR = 'للعرض';
export const DEMO_TRACKING_NOTE_AR = 'في الحساب التجريبي تُفتح متابعة الأثر بلا اعتماد المستشار، ليُرى شكلها. لم تُعتمد هذه الوثيقة، وما تكتبه هنا لا يُحسب ولا يصل راعيًا.';
