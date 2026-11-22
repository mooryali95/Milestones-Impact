// ════════════════════════════════════════════════════════════════
// حساب العرض التوضيحي للورش: فتح من اللوحة، وإعادة ضبط، وأزرار تخطٍّ
// ════════════════════════════════════════════════════════════════
// مشارك حقيقي بعلامة is_demo، يمر بالرحلة نفسها التي يمر بها أي مشارك، لكنه:
// يُفتح من اللوحة بلا كلمة مرور، ويُعتمد مستواه آليًا، ولا يدخل القوائم ولا الإحصاءات،
// ولا يصله بريد، ويُعاد إلى البداية بضغطة. أزرار التخطي تعمل له وحده.
// وروابط التجربة (تصور 2026-11-19): رابط باسم مستلمه يفتح جلسة مشارك لحساب العرض نفسه بلا رمز بريد، ينتهي ويُلغى،
// ولا تُحفظ من رمزه إلا بصمته. جلساته وجلسة المدير لا تبطل إحداهما الأخرى. المنطق الخالص في demo-links.js.
import { audit, CONFIG, db, DEMO_MAIL_DOMAIN, Fail, hash, must, randomToken } from './core.ts';
import { DEMO_COHORT_OFF_AR, demoCohortReady, demoEmailFor, removeCohortDemo } from './demo-cohort.ts';
import { assessmentGet, assessmentSubmit, issueSession, journeyFor, mePayload, profileSave } from './participant.ts';
import { scoreFor } from './logic.js';
import { cleanDemoLinkInput, DEMO_LINK_LIMITS, DEMO_LINK_MAX_ACTIVE, demoLinkState, demoLinkUrl, demoLinkView } from './demo-links.js';
import { DEMO_FULL_NAME, DEMO_NAME_AR, DEMO_OPEN_NOTE, DEMO_RESTART_EXTRA, DEMO_RESTART_KEEP, DEMO_ROW_RESET, DEMO_SKIP_NOTE, demoLockedStages, demoSkipTarget, demoStageLine } from './demo-stage.js';
import { EXPORT_SKIPPED, EXPORT_TABLES } from './privacy.js';
import type { Admin } from './admin.ts';

type Body = Record<string, any>;
type Ctx = { ip: string | null; ua: string | null };
// بريد الحساب العام. وحساب الدفعة بريده من demoEmailFor (demo-cohort.ts)، وdemoEmailFor(null) هو هذا نفسه (demo_cohort_test.ts)
const DEMO_EMAIL = `demo@${DEMO_MAIL_DOMAIN}`;   // sendMail لا يرسل إلى هذا النطاق أبدًا
// رقم وهمي بصيغة صحيحة لإكمال الملف فقط (لا يُتصل به ولا يُنشر)
const DEMO_PHONE = '05' + '0'.repeat(8);

// الحساب التجريبي يُعرَّف ببريده لا بالعلامة وحدها: العام ببريده الثابت، وحساب الدفعة ببريد مشتق من معرّفها وعمود دفعته
// (demo-cohort.ts، والقيد participants_demo_identity). فلا يفتح فتحٌ حسابَ دفعة أخرى، ولا تحذف إعادة الضبط إلا المقصود.
// create=false: يقرأ ولا ينشئ (سطر الحالة في ملف الدفعة)
async function demoRow(cohortId: string | null = null, create = true) {
  const email = cohortId ? demoEmailFor(cohortId) : DEMO_EMAIL;
  const find = () => (cohortId
    ? db.from('participants').select('*').eq('is_demo', true).eq('email', email).eq('demo_cohort_id', cohortId).maybeSingle()
    : db.from('participants').select('*').eq('is_demo', true).eq('email', DEMO_EMAIL).maybeSingle());
  const { data } = await find();
  if (data || !create) return data;
  const made = await db.from('participants').insert({
    email, full_name: DEMO_FULL_NAME, is_demo: true, source: 'admin', ...(cohortId ? { demo_cohort_id: cohortId } : {}),
  }).select('*').single();
  // فتحان في اللحظة نفسها: الثاني يرده فهرس البريد الفريد، فيقرأ ما أنشأه الأول
  if (made.error && made.error.code === '23505') { const again = await find(); if (again.data) return again.data; }
  return must(made, 'تعذّر إنشاء الحساب التجريبي');
}

// الدفعة التي يُفتح حسابها: null للحساب العام (بلا cohort_id، أو الدفعة المفتوحة: حسابها هو العام القائم). دفعة مغلقة لا يُفتح
// لها حساب (حُذف عند إغلاقها)، وقبل الترحيل يُرد الطلب بـnot_migrated فلا يُفتح الحساب العام مكانه بصمت
const isUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(v || ''));
async function scopeOf(b: Body, { allowClosed = false } = {}): Promise<{ id: string; name: string } | null> {
  if (b?.cohort_id == null || b.cohort_id === '') return null;
  if (!isUuid(b.cohort_id)) throw new Fail('الدفعة غير موجودة', 404);
  const c = must(await db.from('cohorts').select('id, name, status, is_default').eq('id', b.cohort_id).maybeSingle()) as any;
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  if (c.is_default) return null;
  if (!(await demoCohortReady())) throw new Fail(DEMO_COHORT_OFF_AR, 409, 'not_migrated');
  if (c.status === 'closed' && !allowClosed) throw new Fail('الدفعة مغلقة: حُذف حسابها التجريبي عند إغلاقها، ولا يُفتح لدفعة مغلقة', 409, 'cohort_closed');
  return { id: c.id, name: c.name };
}

// يفتح تطبيق المشارك بالحساب التجريبي: رابط بجلسة جاهزة في جزء الرابط (لا يصل إلى أي خادم). cohort_id: حساب تلك الدفعة،
// يُنشأ عند أول فتح ويبقى بعدها كما تركه المقدِّم
export async function open(a: Admin, b: Body, ctx: Ctx) {
  const scope = await scopeOf(b);
  const p = await demoRow(scope?.id || null);
  // رابط عرض جديد يُبطل ما قبله: رمز ظهر على شاشة سابقة لا يبقى صالحًا (M5). جلسات روابط التجربة (demo_link_id) ليست
  // مما قبله: من أُعطي رابطًا لا يخرجه فتح المدير للعرض. والإبطال لجلسات هذا الحساب وحده، فلا يخرج مقدِّم دفعة مقدِّم أخرى
  must(await db.from('auth_sessions').update({ revoked_at: new Date().toISOString() }).eq('participant_id', p.id).is('revoked_at', null).is('demo_link_id', null), 'تعذّر إبطال جلسة العرض السابقة');
  const token = await issueSession(p.id, 'demo', ctx);
  await audit('admin', a.email, 'demo.open', 'participants', p.id, null, scope ? { cohort: scope.id } : null);
  return { success: true, url: `${CONFIG.appUrl.replace(/\/$/, '')}/#demo=${token}`, status: p.status, cohort: scope };
}

// إعادة الضبط: يُحذف الحساب بكل ما عليه، ويُنشأ من جديد عند الفتح التالي. الحساب مشترك بين من يجرّبه، فتُحذف معه جلسات كل من
// يجرّبه برابط (حذف الصف يحذف جلساته)، وروابطهم تبقى صالحة وتفتح الحساب الجديد. اللوحة تسمّي الروابط النشطة قبل التأكيد.
// cohort_id: حساب تلك الدفعة وحده (ولو أُغلقت)، وبلاه الحساب العام وحده
export async function reset(a: Admin, b: Body = {}) {
  const scope = await scopeOf(b, { allowClosed: true });
  if (scope) { await removeCohortDemo(a.email, scope.id, 'reset'); return { success: true }; }
  const { data: p } = await db.from('participants').select('id').eq('is_demo', true).eq('email', DEMO_EMAIL).maybeSingle();
  if (p) {
    await db.from('certificates').delete().eq('participant_id', p.id);
    must(await db.from('participants').delete().eq('id', p.id), 'تعذّر حذف الحساب التجريبي');
  }
  await audit('admin', a.email, 'demo.reset', 'participants', p?.id || 'none');
  return { success: true };
}

// سطر الحالة في ملف الدفعة (4.6 في التصور): هل الحساب قائم، وعند أي مرحلة، ومتى استُعمل آخر مرة، ومن فتحه من اللوحة،
// وروابط تجربته النشطة. قراءة وحدها: لا تنشئ الحساب. ready=false قبل الترحيل («غير مفعّلة بعد»)
export async function cohortStatus(b: Body) {
  if (!isUuid(b?.cohort_id)) throw new Fail('الدفعة غير موجودة', 404);
  const c = must(await db.from('cohorts').select('id, name, status, is_default').eq('id', b.cohort_id).maybeSingle()) as any;
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  const ready = c.is_default || await demoCohortReady();
  const base = { success: true, ready, general: !!c.is_default, closed: c.status === 'closed', cohort: { id: c.id, name: c.name }, max: DEMO_LINK_MAX_ACTIVE };
  if (!ready) return { ...base, exists: false, links: [] };
  const scope = c.is_default ? null : c.id;
  const p: any = await demoRow(scope, false);
  const links = await linkRows(scope);
  if (!p) return { ...base, exists: false, links };
  const [seen, opened, j] = await Promise.all([
    db.from('auth_sessions').select('last_seen_at').eq('participant_id', p.id).order('last_seen_at', { ascending: false }).limit(1),
    db.from('audit_log').select('actor, created_at').eq('action', 'demo.open').eq('entity_id', p.id).order('created_at', { ascending: false }).limit(1),
    p.profile_completed_at ? journeyFor(p, { lite: true }) : null,
  ]);
  const target = demoSkipTarget({ profileDone: !!p.profile_completed_at, approved: !!(j as any)?.approved, journey: (j as any)?.journey || [] });
  const last = (opened.data as any[] | null)?.[0] || null;
  return { ...base, exists: true, links, stage: demoStageLine(target), created_at: p.created_at || null,
    last_used_at: (seen.data as any[] | null)?.[0]?.last_seen_at || null, last_opened_at: last?.created_at || null, last_opened_by: last?.actor || null };
}

const onlyDemo = (p: any) => { if (!p.is_demo) throw new Fail('هذا متاح للحساب التجريبي فقط', 403, 'demo_only'); };

// تخطّي الملف الشخصي: بيانات عرض جاهزة
export async function fillProfile(p: any) {
  onlyDemo(p);
  return profileSave(p, { fields: {
    full_name: DEMO_FULL_NAME, job_title: 'مدير إدارة المشاريع', organization_name: 'جهة تجريبية',
    sector: 'حكومي', phone: DEMO_PHONE, years_experience: 8, work_scope: null,
    bio: 'حساب تجريبي لعرض رحلة القائد في الورشة الأولى.',
  } });
}

// تخطّي القياس: إجابات واقعية (لا كلها مثالية) ثم الإرسال، فيُعتمد المستوى آليًا وتظهر الرحلة
export async function fillAssessment(p: any) {
  onlyDemo(p);
  const g: any = await assessmentGet(p, {});
  const ids = g.questions.map((q: any) => q.id);
  const { data: qs } = await db.from('questions').select('id, tier, kind, options').in('id', ids);
  const now = new Date().toISOString();
  const rows = (qs || []).map((q: any, i: number) => {
    const opts = (q.options || []).map((o: any, k: number) => ({ k, s: Number(o.score) })).filter((o: any) => o.s >= 0).sort((x: any, y: any) => y.s - x.s);
    // أغلبها أفضل خيار، وبعضها الثاني، فيخرج مستوى متوسط واقعي يصلح للشرح
    const pick = opts[(i % 3 === 2 && opts.length > 1) ? 1 : 0];
    return { assessment_id: g.assessment.id, question_id: q.id, value: { k: pick.k }, score: scoreFor(q, pick.k), answered_at: now };
  });
  if (rows.length) must(await db.from('assessment_answers').upsert(rows));
  const fresh = must(await db.from('participants').select('*').eq('id', p.id).single());
  return assessmentSubmit(fresh, { assessment_id: g.assessment.id });
}


// ════════════════════════════════════════════════════════════════
// المرحلة 1 من التصور: «تخطَّ هذه المرحلة» و«افتح كل المراحل»
// ════════════════════════════════════════════════════════════════
// التخطي يكتب تجاوزًا (skip) والفتح يكتب فتحًا (open) في participant_stage_overrides، وهي آلية تدخل الإدارة القائمة
// في مرحلة مشارك (admin.stage-override). لا يُكتب إنجاز بند ولا حضور ولا درجة ولا اعتماد ولا شهادة، فلا دليل مختلق.
// الصف المكتوب صف صاحب الجلسة وحده: لا معرّف مشارك يُقرأ من جسم الطلب، وonlyDemo يرد كل حساب غير تجريبي. وما يقرأ
// هذه الصفوف (journeyFor) يحسب رحلة مشارك بعينه، وكل قائمة أو رقم يستبعد الحساب التجريبي بقاعدة counting.ts، فلا يبلغ
// التخطي تقريرًا ولا جهة ولا خبيرًا ولا تذكيرًا. وإعادة الضبط تحذف الحساب فتُحذف صفوفه معه (on delete cascade).

// من فتح الجلسة، لسطر السجل: اسم رابط التجربة لجلسة رابط، وإلا المدير صاحب آخر فتح من اللوحة (كل فتح منها يبطل ما
// قبله، فالجلسة القائمة بلا رابط هي جلسته). آخر فتح لهذا الحساب بعينه: لكل دفعة حسابها ومقدِّمها)
async function openedBy(sessionId: string, participantId: string) {
  const s = await db.from('auth_sessions').select('demo_link_id').eq('id', sessionId).maybeSingle();
  const linkId = (s.data as any)?.demo_link_id;
  if (linkId) {
    const l = await db.from('demo_links').select('label').eq('id', linkId).maybeSingle();
    return { link: linkId, label: (l.data as any)?.label || null };
  }
  const a = await db.from('audit_log').select('actor').eq('action', 'demo.open').eq('entity_id', participantId).order('created_at', { ascending: false }).limit(1);
  return { admin: (a.data as any[] | null)?.[0]?.actor || null };
}

// يتخطى المرحلة الحالية وحدها (demoCurrentStage). بوابتا القبول تُتخطيان بما يفتحهما فعلًا في التطبيق: الملف يُملأ
// ببيانات تجريبية، والقياس يُجاب ويُرسل فيُعتمد المسار آليًا (الزران القائمان)، فلا تبقى شاشة القبول أمام رحلة «مكتملة»
export async function skipStage(p: any, _b: Body, sessionId: string) {
  onlyDemo(p);
  const j: any = p.profile_completed_at ? await journeyFor(p, { lite: true }) : null;
  const target = demoSkipTarget({ profileDone: !!p.profile_completed_at, approved: !!j?.approved, journey: j?.journey || [] });
  if (target.kind === 'profile') return fillProfile(p);
  if (target.kind === 'assessment') return fillAssessment(p);
  const stage = target.stage;
  if (!stage) throw new Fail('لا مرحلة باقية للتخطي. أعد ضبط الحساب التجريبي من لوحة الإدارة لتبدأ من جديد', 409, 'demo_done');
  must(await db.from('participant_stage_overrides').upsert({
    participant_id: p.id, program_id: j.def.program_id, stage_key: stage.key, action: 'skip', note: DEMO_SKIP_NOTE, by_email: DEMO_NAME_AR, created_at: new Date().toISOString(),
  }), 'تعذّر تخطي المرحلة');
  await audit('participant', p.id, 'demo.stage-skip', 'participants', p.id, null, { stage: stage.key, program: j.def.program_id, by: await openedBy(sessionId, p.id) });
  return { success: true, skipped: stage.key, ...(await mePayload(p)) };
}

// يفتح كل مرحلة مقفلة (بتتابع أو تاريخ أو اعتماد) فتظهر بمحتواها ويمكن العمل فيها، دون أن تُعد منتهية. بعد اعتماد
// المسار وحده: قبله تقف بوابة البرنامج أمام الكتاب والمبادرة مهما فُتحت المراحل، فيُتخطى الملف والقياس أولًا
export async function openAll(p: any, _b: Body, sessionId: string) {
  onlyDemo(p);
  const j: any = await journeyFor(p, { lite: true });
  if (!p.profile_completed_at || !j.approved) throw new Fail('تخطَّ الملف والقياس أولًا، ثم افتح كل المراحل', 409, 'demo_gates');
  const locked = demoLockedStages(j.journey);
  if (locked.length) {
    const at = new Date().toISOString();
    must(await db.from('participant_stage_overrides').upsert(locked.map((s: any) => ({
      participant_id: p.id, program_id: j.def.program_id, stage_key: s.key, action: 'open', note: DEMO_OPEN_NOTE, by_email: DEMO_NAME_AR, created_at: at,
    }))), 'تعذّر فتح المراحل');
    await audit('participant', p.id, 'demo.open-all', 'participants', p.id, null, { stages: locked.map((s: any) => s.key), program: j.def.program_id, by: await openedBy(sessionId, p.id) });
  }
  return { success: true, opened: locked.map((s: any) => s.key), ...(await mePayload(p)) };
}

// «أعد من البداية» من شريط الحساب التجريبي (قرار المالك 2026-11-21): يمسح كل ما يحمله الحساب (تجاوزات المراحل وما أُنجز
// من بنود، والقياس والتسكين، والكتاب والنماذج والمبادرة ومتابعتها، والنقاط وطلبات الأقران وكل جدول آخر فيه صف له) ويعيد
// صفه إلى أوله (الملف فارغ والحالة «مسجّل»). يبقى صف الحساب بمعرّفه، وجلساته كلها، وروابط التجربة: فلا يخرج زائر آخر من
// جلسته ولا يبطل رابط، بخلاف إعادة ضبط المدير الأعلى التي تحذف الحساب نفسه.
// قائمة الجداول من المصدر الذي يحرسه privacy.test.js (كل جدول فيه participant_id مذكور في EXPORT_TABLES أو EXPORT_SKIPPED)،
// فجدول جديد يدخل المسح بلا تعديل هنا. والأعمدة من DEMO_ROW_RESET التي يحرسها demo_skip_test.ts مقابل المخطط.
const GONE_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204', '42703']);
export async function restart(p: any, _b: Body, sessionId: string) {
  onlyDemo(p);
  const by = await openedBy(sessionId, p.id);
  const tables = [...new Set([...Object.keys(EXPORT_TABLES), ...Object.keys(EXPORT_SKIPPED)])].filter((t) => !DEMO_RESTART_KEEP.includes(t));
  const targets: [string, string][] = [...tables.map((t) => [t, 'participant_id'] as [string, string]), ...Object.entries(DEMO_RESTART_EXTRA as Record<string, string>)];
  const cleared: string[] = [];
  for (const [table, col] of targets) {
    const r = await db.from(table).delete().eq(col, p.id).select(col);
    // جدول لم يُرحَّل بعد لا يحمل شيئًا للحساب. وكل تعذّر آخر يوقف المسح برسالته، فلا يُقال «أُعيد» وقد بقي شيء
    if (r.error) { if (GONE_TABLE.has(String(r.error.code))) continue; must(r, 'تعذّرت إعادة الحساب التجريبي إلى البداية، حاول مرة أخرى'); }
    if ((r.data as any[] | null)?.length) cleared.push(table);
  }
  must(await db.from('participants').update({ ...DEMO_ROW_RESET }).eq('id', p.id).eq('is_demo', true), 'تعذّرت إعادة الحساب التجريبي إلى البداية، حاول مرة أخرى');
  await audit('participant', p.id, 'demo.restart', 'participants', p.id, null, { cleared, by });
  const fresh = must(await db.from('participants').select('*').eq('id', p.id).single());
  return { success: true, restarted: true, ...(await mePayload(fresh)) };
}


// ════════════════════════════════════════════════════════════════
// روابط التجربة
// ════════════════════════════════════════════════════════════════
const LINK_COLS = 'id, label, created_by, created_at, expires_at, revoked_at, last_used_at, uses';
// عمود الدفعة يُطلب حين يوجد وحده (الترحيل 20261123100000): قبله الروابط كلها للحساب العام كما كانت
const linkCols = async () => ((await demoCohortReady()) ? `${LINK_COLS}, cohort_id` : LINK_COLS);
// روابط حساب بعينه: العام (cohort_id فارغ) أو حساب دفعة. قبل الترحيل لا عمود ولا روابط دفعات، فالكل للعام
const scoped = (q: any, ready: boolean, cohortId: string | null) => (!ready ? q : cohortId ? q.eq('cohort_id', cohortId) : q.is('cohort_id', null));
async function linkRows(cohortId: string | null) {
  const q = db.from('demo_links').select(await linkCols()).is('revoked_at', null).gt('expires_at', new Date().toISOString());
  const data = must(await scoped(q, await demoCohortReady(), cohortId).order('created_at', { ascending: false }).limit(DEMO_LINK_MAX_ACTIVE * 2));
  return ((data || []) as any[]).map((r) => demoLinkView(r));
}

// الروابط النشطة للحساب العام في بطاقة النظرة العامة: الاسم ومن أنشأه ومتى، وانتهاؤه وآخر استعمال. بلا رمز ولا بصمته.
// روابط حساب دفعة تُقرأ مع حالته في ملف الدفعة (cohortStatus)
export async function linkList() {
  // توافق مع نسخة اللوحة المنشورة قبل هذا التنظيف (تحديث بلا أثر): لوحة مفتوحة لحظة النشر تقرأ هذه الإشارة، فتبقى ثابتة إصدارًا واحدًا وتُحذف بعد 2026-12-04
  return { success: true, ready: true /* COMPAT_UNTIL_2026_12_04 */, max: DEMO_LINK_MAX_ACTIVE, links: await linkRows(null) };
}

// رابط جديد: الرمز يُعرض مرة واحدة في الرد ولا يُحفظ (بصمته فقط)، ولا يعود من أي قراءة بعدها. cohort_id: رابط يفتح حساب
// تلك الدفعة، وبلاه الحساب العام. الحد لكل حساب على حدة
export async function linkCreate(a: Admin, b: Body) {
  let input: { label: string; days: number };
  try { input = cleanDemoLinkInput(b); } catch (e) { throw new Fail((e as Error).message); }
  const scope = await scopeOf(b);
  const now = Date.now();
  const cur = await scoped(db.from('demo_links').select('id', { count: 'exact', head: true }).is('revoked_at', null).gt('expires_at', new Date(now).toISOString()), await demoCohortReady(), scope?.id || null);
  if (cur.error) must(cur);
  if ((cur.count ?? 0) >= DEMO_LINK_MAX_ACTIVE) throw new Fail(`للحساب التجريبي ${DEMO_LINK_MAX_ACTIVE} رابطًا نشطًا، وهذا الحد. ألغِ رابطًا لا تحتاجه ثم أنشئ الجديد`, 409, 'limit');
  const token = randomToken();
  const row = must(await db.from('demo_links').insert({
    token_hash: await hash(token), label: input.label, created_by: a.email, expires_at: new Date(now + input.days * 864e5).toISOString(), ...(scope ? { cohort_id: scope.id } : {}),
  }).select(await linkCols()).single(), 'تعذّر إنشاء الرابط') as any;
  await audit('admin', a.email, 'demo.link-create', 'demo_links', row.id, null, { label: row.label, days: input.days, ...(scope ? { cohort: scope.id } : {}) });
  return { success: true, link: demoLinkView(row), url: demoLinkUrl(CONFIG.appUrl, token) };
}

// الإلغاء: الرابط لا يفتح بعده، وجلساته القائمة تنتهي الآن. جلسة المدير وجلسات الروابط الأخرى كما هي
export async function linkRevoke(a: Admin, b: Body) {
  const id = String(b.id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Fail('الرابط غير موجود', 404);
  const got = await db.from('demo_links').select(LINK_COLS).eq('id', id).maybeSingle();
  if (got.error) must(got);
  const row = got.data as any;
  if (!row) throw new Fail('الرابط غير موجود', 404);
  const now = new Date().toISOString();
  const first = !row.revoked_at;
  if (first) must(await db.from('demo_links').update({ revoked_at: now, revoked_by: a.email }).eq('id', id).is('revoked_at', null), 'تعذّر إلغاء الرابط');
  const ended = must(await db.from('auth_sessions').update({ revoked_at: now }).eq('demo_link_id', id).is('revoked_at', null).select('id'), 'أُلغي الرابط وتعذّر إنهاء جلساته، أعد المحاولة') as any[] | null;
  if (first) await audit('admin', a.email, 'demo.link-revoke', 'demo_links', id, null, { label: row.label, sessions: (ended || []).length });
  return { success: true, ended: (ended || []).length };
}

// عدّ محاولات الفتح من شبكة في 10 دقائق: كل محاولة سطر في السجل باسم بصمة الشبكة (لا العنوان نفسه)، كما يُعدّ رمز الحضور
// (activities.ts: codeCheckin). من بلغ الحد يُرد قبل الكتابة، فحلقة طلبات لا تضيف سطورًا بلا حد
const LINK_TRY = 'demo.link-try';
async function linkTries(net: string, since: string) {
  const { count, error } = await db.from('audit_log').select('id', { count: 'exact', head: true }).eq('actor', net).eq('action', LINK_TRY).gte('created_at', since);
  if (error) must({ data: null, error });
  return count ?? 0;
}

const LINK_GONE: Record<string, [string, string]> = {
  invalid: ['رابط التجربة غير صالح. تأكد من نسخه كاملًا، أو اطلب رابطًا جديدًا ممن أرسله لك', 'link_invalid'],
  revoked: ['أُلغي رابط التجربة هذا. اطلب رابطًا جديدًا ممن أرسله لك', 'link_revoked'],
  expired: ['انتهت مدة رابط التجربة هذا. اطلب رابطًا جديدًا ممن أرسله لك', 'link_expired'],
};
const gone = (k: keyof typeof LINK_GONE) => new Fail(LINK_GONE[k][0], k === 'invalid' ? 404 : 410, LINK_GONE[k][1]);

// فتح الرابط (فعل مفتوح بلا جلسة): يعطي جلسة مشارك للحساب التجريبي الذي أُنشئ له الرابط وحده (العام أو حساب دفعته)، بمدة جلسة العرض (8 ساعات) ولا تتجاوز انتهاء الرابط.
// لا يقرأ من الجسم إلا الرمز، ولا يعيد إلا ما يعيده دخول أي مشارك (mePayload لحساب العرض)، فلا بيانات إدارة ولا مشارك حقيقي
export async function linkOpen(b: Body, ctx: Ctx) {
  const token = String(b.t || '');
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) throw gone('invalid');
  const net = `net:${(await hash(`demo-link:${ctx.ip || 'none'}`)).slice(0, 32)}`;
  const since = new Date(Date.now() - 6e5).toISOString();
  const tooMany = () => new Fail('محاولات كثيرة من هذه الشبكة. حاول بعد عشر دقائق', 429, 'rate');
  if (await linkTries(net, since) >= DEMO_LINK_LIMITS.triesPerNet10Min) throw tooMany();
  await audit('system', net, LINK_TRY, 'demo_links', null);
  if (await linkTries(net, since) > DEMO_LINK_LIMITS.triesPerNet10Min) throw tooMany();
  const got = await db.from('demo_links').select(await linkCols()).eq('token_hash', await hash(token)).maybeSingle();
  if (got.error) must(got);
  const row = got.data as any;
  if (!row) throw gone('invalid');
  const st = demoLinkState(row);
  if (st !== 'active') throw gone(st as 'revoked' | 'expired');
  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const opened = await db.from('auth_sessions').select('id', { count: 'exact', head: true }).eq('demo_link_id', row.id).gte('created_at', hourAgo);
  if (opened.error) must(opened);
  if ((opened.count ?? 0) >= DEMO_LINK_LIMITS.opensPerLinkHour) throw new Fail('فُتح هذا الرابط مرات كثيرة في الساعة الأخيرة. حاول بعد قليل', 429, 'rate');
  // رابط دفعة يفتح حساب دفعته وحده. دفعة أُغلقت أو حُذفت: رابطها لا يفتح (ولا يُنشأ لها حساب من جديد)
  let cohortId: string | null = null;
  if (row.cohort_id) {
    const c = await db.from('cohorts').select('id, status').eq('id', row.cohort_id).maybeSingle();
    if (c.error) must(c);
    if (!c.data || (c.data as any).status === 'closed') throw gone('revoked');
    cohortId = (c.data as any).id;
  }
  const p = await demoRow(cohortId);
  const session = await issueSession(p.id, 'demo', ctx);
  // الجلسة تُنسب إلى رابطها، ولا تعيش بعد انتهائه. تعذّر النسبة يلغي الجلسة: جلسة بلا رابطها لا يبطلها إلغاؤه
  const tokenHash = await hash(session);
  const hardEnd = Math.min(Date.now() + CONFIG.demoSessionHours * 36e5, Date.parse(row.expires_at));
  const tag = await db.from('auth_sessions').update({ demo_link_id: row.id, expires_at: new Date(hardEnd).toISOString() }).eq('token_hash', tokenHash).select('id');
  if (tag.error || !tag.data?.length) {
    await db.from('auth_sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', tokenHash);
    throw new Fail('تعذّر فتح رابط التجربة، حاول مرة أخرى', 500, 'db_error');
  }
  const used = new Date().toISOString();
  await db.from('demo_links').update({ last_used_at: used, uses: (row.uses || 0) + 1 }).eq('id', row.id);
  await audit('system', `demo-link:${row.id}`, 'demo.link-open', 'demo_links', row.id, null, { label: row.label });
  const fresh = must(await db.from('participants').select('*').eq('id', p.id).single());
  return { success: true, token: session, demo_shared: true, ...(await mePayload(fresh)) };
}

// جلسة حساب العرض التي بدأها رابط: تنتهي بانتهاء رابطها أو إلغائه ولو لم تُبطل هي بعد (الحارس في معالج الطلب لكل فعل
// لحساب العرض). تعيد true لجلسة رابط سارٍ، وfalse لجلسة المدير
export async function linkSession(sessionId: string) {
  const s = await db.from('auth_sessions').select('demo_link_id').eq('id', sessionId).maybeSingle();
  // تعذّر القراءة يُرد ولا يُفتح به: جلسة رابط لا تمر بلا فحص رابطها
  if (s.error) must(s);
  const linkId = (s.data as any)?.demo_link_id;
  if (!linkId) return false;
  const l = await db.from('demo_links').select('expires_at, revoked_at').eq('id', linkId).maybeSingle();
  if (l.error) must(l);
  const st = l.data ? demoLinkState(l.data) : 'revoked';
  if (st !== 'active') {
    await db.from('auth_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId).is('revoked_at', null);
    throw new Fail(st === 'expired' ? LINK_GONE.expired[0] : LINK_GONE.revoked[0], 401, 'session', { link: st });
  }
  return true;
}
