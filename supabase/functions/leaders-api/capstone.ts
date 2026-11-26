// ════════════════════════════════════════════════════════════════
// مشروع التخرج القيادي: وثيقة المبادرة للمشارك والمستشار والراعي والجهة
// ════════════════════════════════════════════════════════════════
// الوثيقة لا تخزّن محتوى خاصًا بها: فصولها تسليمات النماذج التعليمية،
// واسم المبادرة من بطاقتها، والنوع من نطاق عمل المشارك، والمسار من
// تسكينه، والجهة والدفعة من مصدريهما. جدول capstones يحمل الحالة وحدها:
// التسليم، ومعيار المستشار، وتأييد الراعي، والاعتماد، ولقطة المعتمد.
// المسار: مسودة ← تسليم (اكتمال وجاهزية 80%) ← مراجعة المستشار (إعادة
// للتحسين مرة، أو قبول بمعيار) ← تأييد الراعي برابط خاص ← اعتماد.
import { audit, CONFIG, db, Fail, hash, mailButton, must, randomToken, reviewMail, sendMail } from './core.ts';
import { bdi, mailNote, mailShell, mailText, mailTitle } from '../_shared/mail.ts';
import { approvalEvidence, award, CAPSTONE_LOCKED, examplesFor, initiativeFor, mePayload, participantPriority } from './participant.ts';
import { cohortOf, contentLevelsFor, programEndOf } from './programs.ts';
import { answeredModels, approvalOf, viewTable, workMinutes, coordPermissions, isEmail, linkAfterDecisionOk, LINK_CLOSED_AR, normalizeEmail, overallLevel, profileKey, rubricPriority, trackKey } from './logic.js';
import { summaryFromCard } from './business-case.js';
import { trackManifest } from './track-manifest.js';
import { unseenNew } from './track-history.ts';
import {
  APPROVAL_POINTS, bindAnswers, canSubmit, CLOSING_AR, closingState, cardGate, capstoneChecks, capstoneModels, CHARTER_KEY, cleanRubric, costSummary, docLevelsFor, MAX_REVISIONS,
  capstoneListRows, capstoneState, chapterLevel, withoutReviewLevels, CHAPTER_STANDING_AR, displayJoins, LIVE_READINESS, modelFields, READY_MIN, readiness, RUBRIC, rubricFor, rubricScore, SCOPE_TITLES, sectionState, STATUS_TITLES, trackProject } from './capstone.js';
import { APPROVAL_SLA_AR } from './labels.js';
import { GATE_ACTIONS, gateDecisions } from './closure.js';
import { docFingerprint, freezeIssued, rejectionStats } from './doc-quality.js';
import { docFormFor } from './doc-form.js';
import { cohortIdentity } from './cohort-identity.js';
import { pdfTicket } from './pdf-ticket.ts';
import type { Admin } from './admin.ts';
import { trackingFor, trackingOf } from './tracking.ts';
import { get as finalGet } from './final.ts';
import { profileFor } from './profiles.ts';
import { counted, listed, simulated } from './counting.ts';

type Body = Record<string, any>;

const SPONSOR_DAYS = 21;
const MODEL_COLS = 'id, key, dimension, sort, min_level, active, scopes, capstone_sort, title_ar, icon, summary_ar, points, fields';

async function levelsOf(participantId: string) {
  const [rows, earlier] = await Promise.all([db.from('placements').select('dimension, level, approved_at').eq('participant_id', participantId), approvalEvidence(participantId)]);
  const pl = must(rows) as any[] ?? [];
  const a = approvalOf(pl, earlier);
  return { levels: a.levels as Record<string, string>, approved: a.approved, since: a.since };
}

// ── بناء الوثيقة من مصادرها ──
async function build(p: any) {
  const { levels, approved, since } = await levelsOf(p.id);
  if (!approved) throw new Fail('تُفتح وثيقة مبادرتك بعد اعتماد مسارك', 403, 'locked');
  const scope = p.work_scope || null;
  // النماذج وحقولها بمستوى المحتوى (الموحد في الدفعة المتجانسة)، والمسار والأولوية من قياسه
  const content = await contentLevelsFor(p, levels);
  const key = trackKey(levels);
  const [models, subs, cap, track] = await Promise.all([
    db.from('learning_models').select(MODEL_COLS).not('capstone_sort', 'is', null),
    db.from('model_submissions').select('id, model_id, status, rating, feedback_ar, answers, updated_at, reviewed_at, submitted_at').eq('participant_id', p.id),
    db.from('capstones').select('*').eq('participant_id', p.id).maybeSingle(),
    key ? db.from('tracks').select('key, title_ar, priority_dimension').eq('key', key).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const by = Object.fromEntries((subs.data || []).map((s: any) => [s.model_id, s]));
  const all = must(models) ?? [];
  // محور الأولوية للمشارك نفسه (التعادل بمؤشراته)، وافتراض المسار عند غيابها.
  // وزن المعيار لا يُضاعف إذا تساوت المستويات الثلاثة (rubricPriority).
  const priority = await participantPriority(p.id, levels, (track as any).data?.priority_dimension || null);
  const weighted = rubricPriority(levels, priority);
  // العنوان المعروض للمشارك وراعيه: ملف التعريف، وإلا عنوان المسار
  const profile = await profileFor(levels, priority);
  if ((track as any).data && profile?.title_ar) (track as any).data = { ...(track as any).data, title_ar: profile.title_ar };
  // قاعدة «لا فقد»: فصل كتب فيه المشارك قبل أن يُرفع مستواه يبقى في وثيقته، غير مطلوب
  const kept = answeredModels(subs.data || []);
  const mine = capstoneModels(all, content, scope, kept);
  const charter = mine.find((m: any) => m.key === CHARTER_KEY);
  const charterAnswers = charter ? by[charter.id]?.answers || {} : {};
  const initiative = String(charterAnswers.title || '').trim() || null;
  // نهاية برنامج المشارك للفصلين الختاميين (closingState): نهاية دفعته، وإلا انتهاء مبادرته من بطاقتها
  const end = await programEndOf(p, since, charterAnswers);
  const sections = mine.map((m: any) => {
    const sub = by[m.id];
    const fields = modelFields(m, content, scope, priority, sub?.answers || null, since);
    const answers = bindAnswers(fields, sub?.answers || {}, m.key === CHARTER_KEY ? null : initiative);
    const closing = closingState(m.key, content?.[m.dimension], end);
    const base = sectionState(m, fields, { ...sub, answers });
    // مؤجل: لا يُحسب في الجاهزية (counted: false) ولا يمنع التقديم الأول (deferred)، ويظهر مقفلًا حتى يُفتح
    const state = closing.deferred ? { ...base, counted: false, deferred: true, opens_at: closing.opens_at } : base;
    // موقع الفصل من مستوى الوثيقة للمستشار والمراجع (المرحلة 4): مما حُسب هنا نفسه، لا قاعدة ثانية
    return { model: m, fields, answers, sub, state, chapter: chapterLevel(m, fields, state, content, levels) };
  });
  const checks = capstoneChecks({
    scope,
    models: Object.fromEntries(sections.map((s: any) => [s.model.key, { ...s.model, fields: s.fields }])),
    answers: Object.fromEntries(sections.map((s: any) => [s.model.key, s.answers])),
  });
  const ready = readiness(sections.map((s: any) => s.state), checks);
  return { levels, content, scope, priority, weighted, project: trackProject(all, levels, scope, priority, kept), track: (track as any).data || null, capstone: (cap as any).data || null, sections, checks, readiness: ready, initiative, charter: charterAnswers };
}

const sectionView = (s: any) => ({
  id: s.model.id, key: s.model.key, title: s.model.title_ar, icon: s.model.icon || '◆', dimension: s.model.dimension, points: s.model.points,
  complete: s.state.complete, missing: s.state.missing.length,
  // زمن الفصل بالدقائق من حقوله الظاهرة المطلوبة (workMinutes): مصدر خط الوثيقة الواحد
  minutes: workMinutes(s.fields), status: s.state.status, rating: s.state.rating,
  // فصل لا حقل مطلوبًا فيه للمشارك: لا يُحسب في الجاهزية (readiness)، فيُعرض «اختياري» لا «مكتمل»
  optional: s.state.counted === false,
  // الفصل الختامي المؤجل للتأسيسي: مقفل حتى آخر أسبوعين من برنامجه (closingState)
  ...(s.state.deferred ? { deferred: true, opens_at: s.state.opens_at, deferred_ar: CLOSING_AR } : {}),
  // آخر حفظ للفصل: منه تُشتق إشارات التعثر في الواجهة (stuck.js)، ولا يُخزَّن شيء جديد
  updated_at: s.sub?.updated_at || null,
  // «الوثيقة الحية»: ملاحظة الخبير على الفصل ووقت قراءته، منهما تُشتق الحالات الأربع و«قرأه خبيرك» و«جديد» (spine.js)
  note: s.sub?.feedback_ar || null, reviewed_at: s.sub?.reviewed_at || null, submitted_at: s.sub?.submitted_at || null,
  // معرّف التسليم ليقيّم المراجع الفصل من بطاقة المبادرة نفسها (لا من «التعلم»)
  sub_id: s.sub?.id || null,
  // مستوى المشارك في إطار الفصل، وموقع الفصل منه (مطلوب، اختياري، باقٍ بقاعدة «لا فقد»)، ومعيار المستوى (chapterLevel)
  level: s.chapter.level, standing: s.chapter.standing, kept_fields: s.chapter.kept_fields, criteria: s.chapter.criteria,
});

// مستوى الوثيقة وموقع كل فصل منه، لملحق يقرؤه المستشار والخبير وحدهما (لا يدخل لقطة الاعتماد ولا ما يصل الراعي أو الجهة)
// live: الوثيقة معتمدة تُعرض من لقطتها، والملحق من حالتها الآن، فيُعلَّم بذلك ولا يُنسب إلى النسخة المعتمدة
export const levelsView = (d: any, live = false) => ({
  level: overallLevel(d.levels), live,
  chapters: d.sections.map((s: any) => ({ key: s.model.key, title: s.model.title_ar, level: s.chapter.level, standing: s.chapter.standing,
    standing_title: (CHAPTER_STANDING_AR as Record<string, string>)[s.chapter.standing], kept_fields: s.chapter.kept_fields, criteria: s.chapter.criteria })),
});

function reviewView(c: any, full = true) {
  if (!c || !['returned', 'accepted', 'approved'].includes(c.status) && !c.review_note) return null;
  return {
    score: full ? c.score : null, scores: full ? c.scores : null, notes: c.notes || {}, note: c.review_note || null,
    reviewed_at: c.reviewed_at,
  };
}
const sponsorView = (c: any) => (c?.sponsor_status || c?.sponsor_waived ? {
  name: c.sponsor_name, status: c.sponsor_status, at: c.sponsor_at, note: c.sponsor_note, waived: !!c.sponsor_waived,
} : null);

// فصل البطاقة في وثيقة المشارك وحالة تسليمه؛ null إن لم تكن البطاقة من فصول وثيقته
const cardOf = (d: any) => { const c = d.sections.find((s: any) => s.model.key === CHARTER_KEY); return c ? { status: c.state.status } : null; };

// ── المشارك ──
export async function get(p: any) {
  const [d, examples] = await Promise.all([build(p), examplesFor(p)]);
  const fresh = await unseenNew(p.id).catch(() => ({ chapter: [] as string[], field: [] as string[] }));
  const c = d.capstone;
  const status = c?.status || 'draft';
  const card = cardOf(d);
  const gate = canSubmit({ status, scope: d.scope, initiative: d.initiative, card, sections: d.sections.map((s: any) => ({ ...s.state, title: s.model.title_ar })), readiness: d.readiness, checks: d.checks });
  return {
    success: true,
    scope: d.scope, scope_title: d.scope ? (SCOPE_TITLES as Record<string, string>)[d.scope] : null,
    // هوية المشارك ملف تعريفه (إطار الأولوية بمستواه فيه، 9 ملفات)، لا المستوى الملخص (قرار المالك 2026-11-25).
    // عمق كل فصل بمستوى إطاره (sections[].level)، وكثافة الصفحة بملف التعريف (spine.js densityFor)
    // البيان الواحد للمسار (track-manifest.js): منه الكثافة والعدسة في الواجهة
    track_key: trackKey(d.levels), profile: (({ profile, profile_level, priority }) => ({ key: profile, level: profile_level, dimension: priority }))(trackManifest(trackKey(d.levels), d.priority)),
    track: d.track ? { title: d.track.title_ar, brief: d.project?.text || null, priority: d.weighted } : null,
    initiative: d.initiative,
    // اسم النسخة المؤسسية وحجمها من المسار (document-forms.js)، لزر تحميلها
    doc_form: docFormFor({ levels: d.levels, priority: d.priority || null }),
    // «جديد في مستواك» من القاعدة (participant_new_items، track-history.ts): الفصل الجديد، والحقول الجديدة في فصل قائم
    sections: d.sections.map(sectionView).map((x: any) => ({ ...x, new: (fresh.chapter || []).includes(x.key), new_fields: (fresh.field || []).filter((k: string) => k.startsWith(`${x.key}.`)).map((k: string) => k.slice(x.key.length + 1)) })),
    checks: d.checks, readiness: d.readiness, ready_min: READY_MIN,
    // ملخص مقترح من البطاقة لمن كثافته summary: auto (spine.js densityFor)؛ لا يُحفظ حتى يحفظه المشارك
    summary_draft: summaryFromCard(d.charter),
    capstone: {
      status, status_title: (STATUS_TITLES as Record<string, string>)[status], summary: c?.summary_ar || '', revisions: c?.revisions || 0, max_revisions: MAX_REVISIONS,
      submitted_at: c?.submitted_at || null, approved_at: c?.approved_at || null,
      // الملاحظات تصل المشارك فور المراجعة، والدرجات بعد الاعتماد
      review: reviewView(c, status === 'approved'), sponsor: sponsorView(c),
    },
    // بوابة البطاقة: حالتها ومدة الاعتماد المعتادة، لتقول الواجهة ما ينتظره المشارك
    card: card ? { state: cardGate(card.status).state, sla: APPROVAL_SLA_AR } : null,
    can_submit: gate.ok, blocker: gate.ok ? null : gate.reason,
    rubric: rubricFor(d.levels).map((r) => ({ key: r.key, title: r.title, dimension: r.dimension, level: r.level, anchors: r.anchors })),
    // المبادرات المحلولة كما يضبطها المالك (examplesFor): أي القطاعات تُعرض، والوثيقة الكاملة أم لا
    examples,
  };
}

export async function saveSummary(p: any, b: Body) {
  const { data: c } = await db.from('capstones').select('status').eq('participant_id', p.id).maybeSingle();
  if (CAPSTONE_LOCKED.includes(c?.status)) throw new Fail('الوثيقة عند المراجعة أو معتمدة، فلا تُعدَّل الآن', 409, 'capstone_locked');
  const summary = String(b.summary ?? '').trim().slice(0, 3000) || null;
  must(await db.from('capstones').upsert({ participant_id: p.id, summary_ar: summary, updated_at: new Date().toISOString() }, { onConflict: 'participant_id' }));
  return { success: true };
}

export async function submit(p: any) {
  const d = await build(p);
  const status = d.capstone?.status || 'draft';
  const card = cardOf(d);
  const gate = canSubmit({ status, scope: d.scope, initiative: d.initiative, card, sections: d.sections.map((s: any) => ({ ...s.state, title: s.model.title_ar })), readiness: d.readiness, checks: d.checks });
  if (!gate.ok) throw new Fail(gate.reason as string, 400, 'not_ready');
  const now = new Date().toISOString();
  must(await db.from('capstones').upsert({
    participant_id: p.id, status: 'submitted', readiness: d.readiness, submitted_at: now, updated_at: now,
  }, { onConflict: 'participant_id' }));
  await audit('participant', p.email, 'capstone.submit', 'capstones', p.id, null, { readiness: d.readiness, initiative: d.initiative });
  return get(p);
}

// ── الوثيقة كاملة: مصدر واحد للعرض والطباعة عند الجميع ──
// audience: participant يرى معيار المستشار بعد الاعتماد فقط، admin يراه دائمًا
async function docFor(p: any, audience: 'participant' | 'admin' | 'sponsor' | 'org') {
  return (await docAndBuild(p, audience)).doc;
}
// الوثيقة ومعها بناؤها، فلا يُبنى مرتين من يحتاج الاثنين (adminGet، expertDoc)
async function docAndBuild(p: any, audience: 'participant' | 'admin' | 'sponsor' | 'org') {
  const d = await build(p);
  return { d, doc: await docOf(p, audience, d) };
}
async function docOf(p: any, audience: 'participant' | 'admin' | 'sponsor' | 'org', d: any) {
  const c = d.capstone;
  // تجميع الفصول القصيرة للتأسيسي يُحسب هنا من مستويات المحتوى، ولا يصل المستوى نفسه: تلميح joins على التابع وحده
  const joins = displayJoins(d.sections.map((s: any) => ({ key: s.model.key, dimension: s.model.dimension })), d.content);
  const [org, { cohort }] = await Promise.all([
    p.organization_id ? db.from('organizations').select('name, logo, color, status').eq('id', p.organization_id).maybeSingle().then((r: any) => r.data) : null,
    cohortOf(p),
  ]);
  const cost = d.sections.find((s: any) => s.model.key === 'cost-plan');
  const status = c?.status || 'draft';
  const showReview = audience === 'admin' || (audience === 'participant' && status === 'approved');
  return {
    meta: {
      ref: `MI-CP-${String(p.id).slice(0, 8).toUpperCase()}`, version: (c?.revisions || 0) + 1, generated_at: new Date().toISOString(),
      status, status_title: (STATUS_TITLES as Record<string, string>)[status], submitted_at: c?.submitted_at || null, approved_at: c?.approved_at || null,
      participant: { name: p.full_name, name_en: p.name_en || null, job_title: p.job_title || null },
      // شعار الجهة ولونها للجهة النشطة وحدها، كما في participant.ts orgLogo
      org: org ? { name: org.name, logo: org.status === 'active' ? org.logo || null : null, color: org.status === 'active' ? org.color || null : null } : (p.organization_name ? { name: p.organization_name, logo: null, color: null } : null),
      cohort: cohort && !cohort.is_default ? cohort.name : null,
      // هوية الدفعة (اسم البرنامج وشعاره ولونه، cohorts.identity): توقيع بعد الجهة، وتُجمَّد مع اللقطة كهوية الجهة
      cohort_brand: cohort && !cohort.is_default ? cohortIdentity(cohort) : null,
      // شكل النسخة المؤسسية من المسار (document-forms.js): يُحل هنا، ويُجمَّد في لقطة الاعتماد
      track_key: trackKey(d.levels), priority: d.priority || null,
      doc_form: docFormFor({ levels: d.levels, priority: d.priority || null }),
      app_url: CONFIG.appUrl,
      track: d.track ? { title: d.track.title_ar, priority: d.weighted } : null,
      // profile: هوية المشارك (ملف تعريفه) لاسم الوثيقة المطبوعة وتلميح النوع فيها؛ لا مستوى ملخص في الوثيقة
      profile: profileKey(d.levels, d.priority), scope: d.scope, scope_title: d.scope ? (SCOPE_TITLES as Record<string, string>)[d.scope] : null,
      // مكان المبادرة من بطاقتها لا من ملف المشارك: الجهة المسجّلة في الملف راعية البرنامج، لا مالكة المبادرة (anatomy.json writing_rules)
      host: String(d.charter.host || '').trim() || null, context: String(d.charter.context || '').trim() || null,
      initiative: d.initiative, sponsor: d.charter.sponsor || null, start: d.charter.start || null, end: d.charter.end || null,
      readiness: d.readiness,
    },
    summary: c?.summary_ar || '',
    sections: d.sections.map((s: any) => ({
      key: s.model.key, title: s.model.title_ar, icon: s.model.icon || '◆', dimension: s.model.dimension,
      // تلميح عرض محايد: الفصل يُطبع في صفحة أصله (displayPages)
      ...(joins[s.model.key] ? { joins: joins[s.model.key] } : {}),
      // الفصل الاختياري للمشارك (لا حقل مطلوبًا فيه، counted: false): يُعرض «اختياري» ولا يُعد فراغه نقصًا في ملحق ما ينقص
      optional: s.state.counted === false,
      // الجدول بأعمدة المشارك الظاهرة وعناوينها (viewTable، أعمدة التأسيسي): مصدر واحد للوثيقة والطباعة ولوحات المستشار والإدارة
      fields: s.fields.map((f: any) => { const t = f.type === 'table' ? viewTable(f, s.answers[f.key] ?? null) : null;
        // optional-exempt: حقل نموذج لا نشاط، ويُحمل اختياره للمستوى إلى فحص الإصدار
        return { key: f.key, label: f.label, type: f.type, columns: t ? t.columns : f.columns || null, ...(t?.labels ? { labels: t.labels } : {}), value: t ? t.rows : s.answers[f.key] ?? null, ...(f.required === false ? { required: false } : {}) }; }),
    })),
    cost: cost ? costSummary({ ...cost.model, fields: cost.fields }, cost.answers) : null,
    checks: d.checks,
    review: showReview && c?.scores ? { score: c.score, scores: c.scores, notes: c.notes || {}, note: c.review_note || null, priority: d.weighted } : null,
    sponsor: sponsorView(c),
    rubric: RUBRIC.map((r) => ({ key: r.key, title: r.title, dimension: r.dimension })),
  };
}

// سجل قرارات البوابات (المرحلة الخامسة): يُقرأ من سجل التدقيق لحظة العرض، فلا نسخة ثانية ولا لقطة تتجمد قبل مراجعات الأثر.
// أفعال الوثيقة على كيانها، واعتماد البطاقة على تسليمها، ومراجعات الأثر على صفوف المتابعة. تعذّر القراءة يعيد سجلًا فارغًا
async function decisionsFor(participantId: string, approvedAt: string | null) {
  try {
    const [{ data: card }, { data: ups }] = await Promise.all([
      db.from('model_submissions').select('id, learning_models!inner(key)').eq('participant_id', participantId).eq('learning_models.key', CHARTER_KEY).maybeSingle(),
      db.from('capstone_updates').select('id').eq('participant_id', participantId),
    ]);
    const ids = [participantId, (card as any)?.id, ...((ups || []) as any[]).map((u) => u.id)].filter(Boolean).map(String);
    const { data: ev } = await db.from('audit_log').select('action, created_at, after').in('entity_id', ids).in('action', GATE_ACTIONS).order('created_at').limit(200);
    return gateDecisions((ev || []) as any[], { approved_at: approvedAt });
  } catch (e) {
    console.error('capstone decisions:', e);
    return [];
  }
}

// المعتمدة تُعرض من لقطتها، فلا يغيّرها تعديل لاحق على نموذج أو حقل. سجل القرارات يُضاف حيًا فوق أي منهما
async function recordFor(p: any, audience: 'participant' | 'admin' | 'sponsor' | 'org') {
  return (await recordAndBuild(p, audience)).doc;
}
// السجل ومعه البناء الحي إن بُني (غير المعتمدة)، وإلا null: المعتمدة من لقطتها
async function recordAndBuild(p: any, audience: 'participant' | 'admin' | 'sponsor' | 'org'): Promise<{ doc: any; d: any }> {
  const { data: c } = await db.from('capstones').select('status, snapshot, approved_at').eq('participant_id', p.id).maybeSingle();
  if (c?.status === 'approved' && c.snapshot) {
    const doc = c.snapshot;
    if (audience !== 'admin' && audience !== 'participant') doc.review = null;
    return { doc: { ...doc, decisions: await decisionsFor(p.id, c.approved_at || null) }, d: null };
  }
  const { d, doc } = await docAndBuild(p, audience);
  return { doc: { ...doc, decisions: await decisionsFor(p.id, null) }, d };
}

// الوثيقة المعتمدة تحمل متابعتها، فيطبع التقرير الخطة وما تحقق منها معًا
async function withTracking(doc: any, participantId: string) {
  return doc?.meta?.status === 'approved' ? { ...doc, tracking: await trackingOf(participantId) } : doc;
}

// للخبير من بوابته (file.ts capstoneDoc بعد فحص نطاقه ومفتاح الرؤية): الوثيقة كما يقرؤها الراعي، بلا معيار المستشار ودرجته
// ومعها مستوى الوثيقة وموقع كل فصل منه (review_levels)، فلا يفقد المراجع تمييز المستوى. تعذّر البناء لا يحجب الوثيقة
export async function expertDoc(participantId: string) {
  const p = await participantRow(participantId);
  const { doc: document, d } = await recordAndBuild(p, 'sponsor');
  // المعتمدة من لقطتها، فالملحق يُبنى حيًا ويُعلَّم «الحالة الآن» (levelsView)
  const levels = await (d ? Promise.resolve(d) : build(p)).then((x) => levelsView(x, !d), () => null);
  return withTracking(levels ? { ...document, review_levels: levels } : document, p.id);
}

// لمن يفتح رابط المشاركة (share.ts): الوثيقة كما يقرؤها الراعي، وshare.js publicDoc يحذف منها ما ليس للقارئ
export async function shareDocFor(p: any) {
  return withTracking(await recordFor(p, 'sponsor'), p.id);
}

// وثيقة الحساب التجريبي كما هي الآن، لخطة متابعته المفتوحة للعرض (tracking.ts: demoLoad). للحساب التجريبي وحده، ولا تكتب
export async function demoDoc(p: any) {
  if (!simulated(p)) throw new Fail('هذا متاح للحساب التجريبي فقط', 403, 'demo_only');
  return docFor(p, 'participant');
}

export async function doc(p: any) {
  // تذكرة مولّد PDF على الخادم (workers/pdf-render) إن ضُبط؛ وإلا يبني المتصفح الملف كما كان (pdf.js)
  // مسار المشارك بلا ملحق المراجع صراحة (withoutReviewLevels، المرحلة 21)، والتذكرة مربوطة ببصمة هذه الوثيقة نفسها
  const document = withoutReviewLevels(await withTracking(await recordFor(p, 'participant'), p.id));
  return { success: true, doc: document, pdf: await pdfTicket(p.id, docFingerprint(document)).catch(() => null) };
}

// ── التحقق العام من وثيقة معتمدة ببصمتها (رمز QR في صفحة الاعتماد): ما تعرضه الوثيقة على غلافها وحده، بلا محتوى ولا بريد ──
const DOC_CHECK_LIMIT = 40; // طلبًا لكل عنوان في 10 دقائق، كالتحقق من الشهادة
export async function verifyDoc(b: Body, ctx: { ip: string | null; ua: string | null }) {
  const fp = String(b.fingerprint || '').trim().toUpperCase();
  const valid = /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(fp);
  if (ctx.ip) {
    const since = new Date(Date.now() - 10 * 60e3).toISOString();
    const { count, error } = await db.from('document_checks').select('id', { count: 'exact', head: true }).eq('ip', ctx.ip).gte('created_at', since);
    if (!error && (count ?? 0) >= DOC_CHECK_LIMIT) throw new Fail('طلبات كثيرة، حاول بعد دقائق', 429, 'rate');
  }
  const { data: rows } = valid
    ? await db.from('capstones').select('status, approved_at, snapshot, participants(is_demo)').eq('status', 'approved').eq('snapshot->issued->>fingerprint', fp).limit(1)
    : { data: [] as any[] };
  const row = ((rows || []) as any[]).find((r) => r?.participants && !r.participants.is_demo) || null;
  // السجل اختياري: قبل ترحيله يعمل التحقق ولا يُسجَّل
  await db.from('document_checks').insert({ fingerprint: valid ? fp : null, found: !!row, ip: ctx.ip, user_agent: ctx.ua }).then(() => null, () => null);
  if (!row) return { success: true, found: false };
  const s = row.snapshot || {}, m = { ...(s.meta || {}), ...(s.issued?.meta || {}) };
  return {
    success: true, found: true, authentic: true,
    document: {
      fingerprint: fp, ref: `${m.ref || 'MI-CP'}-V${m.version || 1}`, initiative: m.initiative || null,
      form: m.doc_form?.name || null, org: m.org?.name || null, program: m.cohort_brand?.program || null,
      approved_at: row.approved_at, issuer: 'Milestone Impact',
    },
  };
}

// «قيم رُفضت للمراجعة»: قواعد الرفض على إجابات فصول المبادرة الحالية، محسوبة للقراءة لحظة الطلب (doc-quality.js rejectionStats).
// بلا اسم ولا بريد ولا نص كامل: القاعدة ومفتاح الفصل والحقل والعدد وعينة مقنّعة. الحسابات المعدودة وحدها (لا العرض ولا الاختبار)
const QUALITY_CAP = 3000;
export async function adminQualityReport() {
  // حقول الفصول مرة واحدة، والإجابات الأحدث أولًا حتى الحد
  const models = must(await db.from('learning_models').select('id, key, fields').not('capstone_sort', 'is', null)) as any[] ?? [];
  const byId = new Map(models.map((m) => [m.id, m]));
  const ids = models.map((m) => m.id);
  const { data, count, error } = ids.length
    ? await counted(db.from('model_submissions').select('model_id, answers, participants!inner(is_demo, is_test)', { count: 'exact' }).in('model_id', ids), 'participants')
      .order('updated_at', { ascending: false }).limit(QUALITY_CAP)
    : { data: [], count: 0, error: null };
  if (error) throw error;
  const rows = (data || []) as any[];
  const stats = rejectionStats(rows.map((r) => ({ chapter_key: byId.get(r.model_id)?.key, fields: byId.get(r.model_id)?.fields || [], answers: r.answers || {} })));
  const total = count ?? rows.length;
  return { success: true, ...stats, total, truncated: total > rows.length, cap: QUALITY_CAP, generated_at: new Date().toISOString() };
}

// ── المستشار ──
export async function adminList(b: Body) {
  let q = listed(db.from('capstones').select('participant_id, status, readiness, revisions, submitted_at, reviewed_at, score, sponsor_status, approved_at, participants!inner(full_name, email, organization_name, work_scope, is_demo)'), 'participants').order('submitted_at', { ascending: false, nullsFirst: false }).limit(300);
  if (b.status) q = q.eq('status', String(b.status));
  const capRows = must(await q) as any[] ?? [];
  // من بدأ بطاقة مبادرته ولم يُنشأ له صف بعد (لم يسلّم ولم يحفظ ملخصًا) يظهر مسودةً، فلا تختفي وثيقة يعمل عليها
  // عن الإدارة (قرار المالك 2026-11-24)
  const started = !b.status || b.status === 'draft'
    ? must(await listed(db.from('model_submissions').select('participant_id, updated_at, learning_models!inner(key), participants!inner(full_name, email, organization_name, work_scope, is_demo)')
      .eq('learning_models.key', CHARTER_KEY), 'participants').order('updated_at', { ascending: false }).limit(300)) as any[] ?? []
    : [];
  // الجاهزية الحية لما قيد البناء بالبناء نفسه الذي يقرؤه ملف المشارك (admin.capstone)، فلا تختلف القائمة عن الملف
  const building = [...new Set([...capRows.filter((r) => LIVE_READINESS.includes(r.status)).map((r) => r.participant_id),
    ...started.map((s) => s.participant_id)])].filter((id) => !capRows.some((r) => r.participant_id === id && !LIVE_READINESS.includes(r.status)));
  const live = await liveReadiness(building);
  const rows = capstoneListRows({ capstones: capRows, started, live, status: b.status ? String(b.status) : null });
  const ids = rows.map((r) => r.participant_id);
  const charters = ids.length ? must(await db.from('model_submissions').select('participant_id, answers, learning_models!inner(key)')
    .eq('learning_models.key', CHARTER_KEY).in('participant_id', ids)) as any[] ?? [] : [];
  const title = Object.fromEntries(charters.map((c) => [c.participant_id, String(c.answers?.title || '').trim() || null]));
  // المعتمدة تحمل حالة متابعتها، من اللقطة نفسها التي تقرأ منها المتابعة
  const approvedIds = rows.filter((r) => r.status === 'approved').map((r) => r.participant_id);
  const tr = approvedIds.length
    ? await trackingFor(must(await db.from('capstones').select('participant_id, status, approved_at, snapshot').in('participant_id', approvedIds)) as any[] ?? [])
    : {};
  return {
    success: true,
    capstones: rows.map((r) => ({
      participant_id: r.participant_id, full_name: r.participants?.full_name, email: r.participants?.email,
      organization: r.participants?.organization_name || null, scope: r.participants?.work_scope || null,
      initiative: title[r.participant_id] || null, status: r.status, readiness: r.readiness, revisions: r.revisions,
      submitted_at: r.submitted_at, reviewed_at: r.reviewed_at, score: r.score, sponsor_status: r.sponsor_status, approved_at: r.approved_at,
      tracking: tr[r.participant_id] || null,
    })),
  };
}

// الجاهزية الحية لعدة مشاركين: build لكل منهم (قراءة لا تكتب)، بتوازٍ محدود. من لم يُعتمد مساره أو تعذّر بناؤه: null
async function liveReadiness(ids: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  if (!ids.length) return out;
  // counting-exempt: ids من صفوف القائمة نفسها (المحسوبة بقاعدة العد)، والقراءة لبناء الجاهزية لا للعد
  const people = must(await db.from('participants').select('*').in('id', ids)) as any[] ?? [];
  for (let i = 0; i < people.length; i += 6) {
    await Promise.all(people.slice(i, i + 6).map(async (p) => {
      out[p.id] = await build(p).then((d) => d.readiness, () => null);
    }));
  }
  return out;
}

async function participantRow(id: unknown) {
  const p = must(await db.from('participants').select('*').eq('id', String(id || '')).maybeSingle());
  if (!p) throw new Fail('المشارك غير موجود', 404);
  return p as any;
}

// D05: نتيجة القائد من مصدر واحد هو التقييم الختامي (computeFinal في final.js)، لا حساب موازٍ بأوزان أخرى.
// تُعرض اللقطة المعتمدة إن رُفع التقييم، وإلا الحساب الحي بمعادلة البرنامج نفسها.
async function leaderScore(p: any) {
  const f: any = await finalGet({ participant_id: p.id }).catch(() => null);
  if (!f?.live) return null;
  return {
    score: f.live.score ?? null, decision: f.live.decision || f.live.suggested || null, status: f.record?.status || 'draft', frozen: !!f.frozen,
    config_version: f.live.config_version ?? null, coverage: f.live.coverage ?? null,
    components: (f.live.components || []).map((x: any) => ({ key: x.key, label: x.label, weight: x.weight, value: x.value })),
  };
}

// تحميل الأدمن للوثيقة النهائية (المرحلة 21): الوثيقة نفسها التي يقرؤها admin.capstone، مع تذكرة PDF مربوطة ببصمتها،
// وسطر تدقيق admin.docExport: من حمّل ومتى وبأي خيارات وبأي بصمة. الخيارات لكل تنزيل ولا تُحفظ (صفة للإرسال لا للوثيقة)
export const DOC_EXPORT_KEYS = ['annex', 'decision', 'appendix', 'qr'] as const;
export async function adminDocExport(a: Admin, b: Body) {
  const p = await participantRow(b.participant_id);
  const r = await recordAndBuild(p, 'admin');
  const state = r.d || await build(p);
  const document = await withTracking({ ...r.doc, review_levels: levelsView(state, !r.d) }, p.id);
  const fp = docFingerprint(document);
  const o = b.options && typeof b.options === 'object' ? b.options : {};
  const options = Object.fromEntries(DOC_EXPORT_KEYS.map((k) => [k, o[k] === true]));
  const preset = b.preset === 'full' ? 'full' : 'send';
  await audit('admin', a.email, 'admin.docExport', 'capstones', p.id, null, {
    preset, options, fingerprint: fp, status: state.capstone?.status || r.doc?.meta?.status || 'draft'
  });
  return { success: true, doc: document, fingerprint: fp, pdf: await pdfTicket(`admin-${a.id || 'owner'}`, fp).catch(() => null) };
}

export async function adminGet(b: Body) {
  const p = await participantRow(b.participant_id);
  const r = await recordAndBuild(p, 'admin');
  const document = r.doc;
  const state = r.d || await build(p);
  const c = state.capstone;
  return {
    success: true, doc: await withTracking({ ...document, review_levels: levelsView(state, !r.d) }, p.id),
    capstone: c ? { ...c, sponsor_token_hash: undefined, snapshot: undefined } : { status: 'draft' },
    // الحالة والجاهزية بالقاعدة نفسها التي تقرأ بها قائمة الوثائق (capstoneState)
    sections: state.sections.map(sectionView), checks: state.checks, readiness: capstoneState(c, state.readiness).readiness ?? 0,
    priority: state.weighted, max_revisions: MAX_REVISIONS,
    rubric: rubricFor(state.levels), leader: await leaderScore(p),
    // بلا بريد صحيح للراعي لا يُطلب تأييد: تعرض الشاشة القبول بالاعتماد دون تأييد بدل خطأ بعد الحفظ
    sponsor_email: sponsorEmailOf(state.charter),
  };
}

export function sponsorMail(sponsor: string | null, who: string, initiative: string, link: string) {
  return mailShell(mailTitle`طلب تأييد مبادرة: ${initiative}`,
    mailText(`${sponsor ? `أهلًا ${bdi(sponsor)}،` : 'أهلًا،'} أعدّ ${bdi(who)} وثيقة مبادرة «${bdi(initiative)}» في برنامج القادة من Milestone Impact، وذكرك راعيًا لها.`)
    + mailText('راجعها المستشار وقبلها. نطلب تأييدك بأن المبادرة تخدم أولويات تعنيك، وأن خطتها قابلة للتنفيذ. تقرأ الوثيقة كاملة من الرابط، ثم تؤيد أو تطلب تعديلًا بملاحظة.')
    + mailButton(link, 'اقرأ الوثيقة وأيّدها')
    + mailNote(`الرابط خاص بك وصالح ${SPONSOR_DAYS} يومًا.`),
    { family: 'capstone', preheader: `${who} يطلب تأييدك لمبادرة «${initiative}»`, footnote: '' });
}

// بريد الراعي من بطاقة المبادرة، أو null إن غاب أو لم يصح (الراعي اختياري، قرار المالك 2026-11-03)
function sponsorEmailOf(charter: any): string | null {
  const email = normalizeEmail(charter?.sponsor_email);
  return isEmail(email) ? email : null;
}
const NO_SPONSOR_WAIVER_AR = 'لا راعٍ فعلي للمبادرة: الراعي موضّح دوره في بطاقتها، فاعتمدها قبول المستشار';
const NO_SPONSOR_EMAIL_AR = 'لا بريد صحيح للراعي في بطاقة المبادرة. اعتمد دون تأييد بسبب مكتوب، أو أعدها للمشارك ليصحح البريد';

export async function inviteSponsor(p: any, c: any, charter: any = null) {
  charter = charter || (await build(p)).charter;
  const email = sponsorEmailOf(charter);
  if (!email) throw new Fail(NO_SPONSOR_EMAIL_AR, 400, 'sponsor_email');
  if (c?.sponsor_invited_at && Date.now() - Date.parse(c.sponsor_invited_at) < 10 * 60e3) throw new Fail('أُرسلت الدعوة قبل قليل، أعد الإرسال بعد عشر دقائق', 429, 'rate');
  const token = randomToken();
  must(await db.from('capstones').update({
    sponsor_name: String(charter.sponsor || '').trim().slice(0, 200) || null, sponsor_email: email, sponsor_token_hash: await hash(token),
    sponsor_status: 'pending', sponsor_invited_at: new Date().toISOString(), sponsor_expires_at: new Date(Date.now() + SPONSOR_DAYS * 864e5).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('participant_id', p.id));
  const initiative = String(charter.title || '').trim() || 'المبادرة';
  // حساب العرض: الحالة تُكتب كما تُكتب لغيره («بانتظار الراعي») فيرى صاحبه التجربة كاملة، والبريد لا يخرج والرمز لا يصل
  // أحدًا. البريد يكتبه الحساب في بطاقة مبادرته، فحارس نطاق العرض في sendMail لا يكفيه (تصور 2026-11-19، المرحلة 0)
  if (simulated(p)) return;
  await sendMail(email, `طلب تأييد مبادرة «${initiative}»`, sponsorMail(charter.sponsor || null, p.full_name || 'مشارك في برنامج القادة', initiative, `${CONFIG.appUrl}/sponsor?t=${encodeURIComponent(token)}`), [], { category: 'request' });
}

async function approve(p: any, by: string, waived: string | null = null) {
  const now = new Date().toISOString();
  must(await db.from('capstones').update({ status: 'approved', approved_at: now, approved_by: by, sponsor_waived: waived, updated_at: now }).eq('participant_id', p.id));
  // لقطة السجل بعد الاعتماد، بمعيار المستشار
  const snapshot = await docFor(p, 'admin');
  // الإصدار: المحتوى النظيف للوثيقة المؤسسية وبصمتها يُجمَّدان مع شعار الجهة ولونها (meta.org)، فلا يغيّرها تعديل لاحق ولا تحسين لقواعد الجودة
  (snapshot as any).issued = freezeIssued(snapshot);
  must(await db.from('capstones').update({ snapshot }).eq('participant_id', p.id));
  const initiative = await initiativeFor(p.id);
  await award(p.id, 'capstone', p.id, APPROVAL_POINTS, `اعتماد وثيقة المبادرة: ${initiative || ''}`.trim());
  sendMail(p.email, 'اعتُمدت وثيقة مبادرتك', reviewMail(p.full_name, `وثيقة مبادرة «${initiative || 'مبادرتك'}»`, false), [], { category: 'journey' })
    .catch((e) => console.error('capstone mail:', e));
}

export async function adminReview(a: Admin, b: Body) {
  const p = await participantRow(b.participant_id);
  const { data: c } = await db.from('capstones').select('*').eq('participant_id', p.id).maybeSingle();
  if (c?.status !== 'submitted') throw new Fail('الوثيقة ليست بانتظار المراجعة', 409);
  const note = String(b.note || '').trim().slice(0, 3000) || null;
  const now = new Date().toISOString();
  if (b.decision === 'return') {
    if ((c.revisions || 0) >= MAX_REVISIONS) throw new Fail(`استُنفد التحسين المتاح (${MAX_REVISIONS}). اقبل الوثيقة بمعيارها، والملاحظات تصل المشارك`, 409, 'revisions');
    if (!note) throw new Fail('اكتب للمشارك ما الذي يحسّنه');
    const notes = Object.fromEntries(Object.entries(b.notes || {}).map(([k, v]) => [k, String(v || '').trim().slice(0, 1500)]).filter(([, v]) => v));
    must(await db.from('capstones').update({ status: 'returned', review_note: note, notes, revisions: (c.revisions || 0) + 1, reviewed_by: a.email, reviewed_at: now, updated_at: now }).eq('participant_id', p.id));
    await audit('admin', a.email, 'capstone.return', 'capstones', p.id, null, { revisions: (c.revisions || 0) + 1 });
    sendMail(p.email, 'ملاحظات المستشار على وثيقة مبادرتك', reviewMail(p.full_name, 'وثيقة مبادرتك', true, note), [], { category: 'journey' }).catch((e) => console.error(e));
    return adminGet({ participant_id: p.id });
  }
  if (b.decision !== 'accept') throw new Fail('قرار غير صالح');
  let rubric;
  try { rubric = cleanRubric(b.scores, b.notes); } catch (e) { throw new Fail((e as Error).message); }
  // ما يمنع إتمام القبول يُفحص قبل أي كتابة. كان بريد الراعي يُفحص بعد حفظ القبول والدرجة، فتبقى الشاشة
  // على «بانتظار مراجعتك» والوثيقة مقبولة، ولا تصح «الإعادة للتحسين» التي تنصح بها الرسالة (التدقيق 2026-11-11)
  let waive = String(b.waive_sponsor || '').trim().slice(0, 500);
  if (waive && waive.length < 10) throw new Fail('اكتب سبب الاعتماد دون تأييد الراعي');
  const charter = waive ? null : (await build(p)).charter;
  // المبادرة قد تكون افتراضية والراعي توضيح لا شرط (قرار المالك 2026-11-14): بلا بريد راعٍ فعلي يعتمدها قبول المستشار
  // وحده، بسبب ثابت يُسجَّل، ولا يُطلب منه أن يكتب سببًا لكل وثيقة
  if (!waive && !sponsorEmailOf(charter)) waive = NO_SPONSOR_WAIVER_AR;
  const { levels } = await levelsOf(p.id);
  const key = trackKey(levels);
  const { data: t } = key ? await db.from('tracks').select('priority_dimension').eq('key', key).maybeSingle() : { data: null };
  const priority = await participantPriority(p.id, levels, (t as any)?.priority_dimension || null);
  const score = rubricScore(rubric.scores, rubricPriority(levels, priority));
  must(await db.from('capstones').update({
    status: 'accepted', scores: rubric.scores, notes: rubric.notes, review_note: note, score, reviewed_by: a.email, reviewed_at: now, updated_at: now,
  }).eq('participant_id', p.id));
  // المعيار المطبَّق يُحفظ مع الدرجة: مراسي كل بعد بمستوى المشارك في إطاره يوم التقييم، ووزن إطار الأولوية.
  // فالدرجة تُقرأ لاحقًا بمعيارها ولو تغيّر مستواه بعدها (تحليل نماذج القياس §4.6)
  await audit('admin', a.email, 'capstone.accept', 'capstones', p.id, null, { score, standard: { levels, weighted: rubricPriority(levels, priority) } });
  if (waive) await approve(p, a.email, waive);
  else {
    try { await inviteSponsor(p, c, charter); }
    catch (e) {
      // القبول محفوظ، وتعذر الدعوة وحده (حد إعادة الإرسال أو البريد) لا يُعرض خطأً يُبقي الوثيقة كأنها لم تُقبل:
      // تعود الوثيقة بحالتها، فتظهر لوحة «تأييد الراعي» لإعادة الدعوة أو الاعتماد دون تأييد
      if (!(e instanceof Fail)) console.error('capstone sponsor invite:', e);
      const why = e instanceof Fail ? e.message : 'تعذّر إرسال طلب التأييد';
      return { ...(await adminGet({ participant_id: p.id })), warning: `قُبلت الوثيقة ولم يُرسل طلب التأييد: ${why}` };
    }
  }
  return adminGet({ participant_id: p.id });
}

export async function adminSponsor(a: Admin, b: Body) {
  const p = await participantRow(b.participant_id);
  const { data: c } = await db.from('capstones').select('*').eq('participant_id', p.id).maybeSingle();
  if (c?.status !== 'accepted') throw new Fail('التأييد يُطلب بعد قبول المستشار', 409);
  const waive = String(b.waive || '').trim().slice(0, 500);
  if (b.waive !== undefined) {
    if (waive.length < 10) throw new Fail('اكتب سبب الاعتماد دون تأييد الراعي');
    await approve(p, a.email, waive);
    await audit('admin', a.email, 'capstone.approve-waived', 'capstones', p.id, null, { reason: waive });
  } else {
    await inviteSponsor(p, c);
    await audit('admin', a.email, 'capstone.sponsor-invite', 'capstones', p.id, null, {});
  }
  return adminGet({ participant_id: p.id });
}

// ── الراعي: رابط بريد بلا حساب ──
async function sponsorFrom(t: unknown) {
  const token = String(t || '');
  if (token.length < 20) throw new Fail('الرابط غير صالح', 400, 'invalid');
  const c = must(await db.from('capstones').select('*, participants(*)').eq('sponsor_token_hash', await hash(token)).maybeSingle()) as any;
  if (!c) throw new Fail('الرابط غير صالح أو استُبدل بدعوة أحدث', 404, 'invalid');
  if (c.sponsor_status === 'pending' && new Date(c.sponsor_expires_at) < new Date()) throw new Fail('انتهت صلاحية الرابط، اطلب من المستشار دعوة جديدة', 410, 'expired');
  // بعد القرار: اطلاع محدود المدة (4.5)
  if (c.sponsor_status !== 'pending' && !linkAfterDecisionOk(c.sponsor_at)) throw new Fail(LINK_CLOSED_AR, 410, 'closed');
  return c;
}

export async function sponsorGet(b: Body) {
  const c = await sponsorFrom(b.t);
  return {
    success: true, done: c.sponsor_status !== 'pending', decision: c.sponsor_status,
    // D18: الراعي لا يرى مستوى الوثيقة ولا مسارها إلا بموافقة المشارك
    sponsor: c.sponsor_name, doc: docLevelsFor(await recordFor(c.participants, 'sponsor'), !!c.participants?.org_share_consented_at),
  };
}

export async function sponsorSubmit(b: Body) {
  const c = await sponsorFrom(b.t);
  if (c.sponsor_status !== 'pending' || c.status !== 'accepted') throw new Fail('سُجّل قرارك من قبل، شكرًا لك', 409, 'done');
  const p = c.participants;
  const note = String(b.note || '').trim().slice(0, 2000) || null;
  const now = new Date().toISOString();
  if (b.decision === 'endorse') {
    must(await db.from('capstones').update({ sponsor_status: 'endorsed', sponsor_note: note, sponsor_at: now, updated_at: now }).eq('participant_id', p.id));
    await approve(p, `sponsor:${c.sponsor_email}`);
  } else if (b.decision === 'decline') {
    if (!note) throw new Fail('اكتب للمشارك ما الذي يعدّله');
    // ملاحظة الراعي تعيد الوثيقة لصاحبها، ولا تُحسب من التحسين المتاح بعد المستشار
    must(await db.from('capstones').update({ status: 'returned', sponsor_status: 'declined', sponsor_note: note, sponsor_at: now, updated_at: now }).eq('participant_id', p.id));
    sendMail(p.email, 'ملاحظات راعي مبادرتك', reviewMail(p.full_name, 'وثيقة مبادرتك (من الراعي)', true, note), [], { category: 'journey' }).catch((e) => console.error(e));
  } else throw new Fail('قرار غير صالح');
  await audit('system', c.sponsor_email, `capstone.sponsor-${b.decision}`, 'capstones', p.id, null, {});
  return { success: true, done: true, decision: b.decision === 'endorse' ? 'endorsed' : 'declined' };
}

// ── الجهة: محفظة مبادرات الدفعة ──
// المنسق يرى عناوين مبادرات جهته وحالتها، والوثيقة كاملة بعد اعتمادها فقط
export async function orgList(orgId: string) {
  const people = must(await listed(db.from('participants').select('id, full_name, work_scope').eq('organization_id', orgId))) as any[] ?? [];
  const ids = people.map((x) => x.id);
  if (!ids.length) return [];
  const [caps, charters, costs] = await Promise.all([
    db.from('capstones').select('participant_id, status, readiness, approved_at, snapshot').in('participant_id', ids),
    db.from('model_submissions').select('participant_id, answers, learning_models!inner(key)').eq('learning_models.key', CHARTER_KEY).in('participant_id', ids),
    db.from('model_submissions').select('participant_id, answers, learning_models!inner(key, fields)').eq('learning_models.key', 'cost-plan').in('participant_id', ids),
  ]);
  const cap = Object.fromEntries((caps.data || []).map((c: any) => [c.participant_id, c]));
  const ch = Object.fromEntries((charters.data || []).map((c: any) => [c.participant_id, c.answers || {}]));
  const co = Object.fromEntries((costs.data || []).map((c: any) => [c.participant_id, costSummary(c.learning_models, c.answers)]));
  const tr = await trackingFor(caps.data || []);
  return people.filter((x) => ch[x.id]?.title).map((x) => {
    const c = cap[x.id];
    const approved = c?.status === 'approved';
    return {
      participant_id: x.id, full_name: x.full_name, initiative: String(ch[x.id].title).trim(), objective: ch[x.id].objective || null,
      scope: x.work_scope || null, status: c?.status || 'draft', status_title: (STATUS_TITLES as Record<string, string>)[c?.status || 'draft'],
      readiness: c?.readiness ?? null, approved_at: c?.approved_at || null,
      cost: approved ? (c.snapshot?.cost?.withContingency ?? co[x.id]?.withContingency ?? null) : null,
      tracking: tr[x.id] || null,
      benefits: approved ? (c.snapshot?.sections || []).find((s: any) => s.key === 'benefits-register')?.fields?.find((f: any) => f.key === 'benefits')?.value?.length ?? null : null,
    };
  });
}

export async function orgDoc(orgId: string, b: Body, permissions: unknown = null) {
  const p = await participantRow(b.participant_id);
  if (p.organization_id !== orgId) throw new Fail('هذا المشارك ليس من جهتك', 403);
  const { data: c } = await db.from('capstones').select('status').eq('participant_id', p.id).maybeSingle();
  if (c?.status !== 'approved') throw new Fail('تُعرض الوثيقة للجهة بعد اعتمادها', 403, 'not_approved');
  // D18: مستوى الوثيقة ومسارها للمنسق بصلاحية المستويات وموافقة المشارك معًا، كما في لوحة الجهة
  const show = coordPermissions(permissions).scores && !!p.org_share_consented_at;
  return { success: true, doc: await withTracking(docLevelsFor(await recordFor(p, 'org'), show), p.id) };
}
