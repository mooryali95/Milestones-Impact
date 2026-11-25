// ════════════════════════════════════════════════════════════════
// البرامج (القوالب) ونسخها، والدفعات
// ════════════════════════════════════════════════════════════════
// البرنامج: المراحل والمتطلبات وإعداد كل نشاط، يُبنى مرة ويُحفظ بنسخ.
// الدفعة: جهة + برنامج + نسخة مثبتة + تواريخ + طريقة التنفيذ. كل دفعة تُثبَّت على نسخة عند إنشائها (ترحيل
// 20261116110000 ثبّت القائم)، فتعديل البرنامج يمس مسودته وحدها حتى تُحفظ نسخة وتُرقّى إليها كل دفعة بنفسها.
// رحلة المشارك تُبنى من دفعته، فكل ما يقرأ متطلبًا للمشارك يمر من هنا.
import { all, allFor, audit, db, Fail, must } from './core.ts';
import { baselineMinutes } from './assessment-time.ts';
import { journeyApproved, cleanSupervision, cleanRubricScores, autoGroups, cohortsAfter, hideBreaksMessage, hideBreaksStage, enrollImpact, moveConfirmText, moveImpact, newlyBroken, programLockedText, cleanGroupSettings, cleanTeamIds, cleanStageModes, contentLevels, cleanDelivery, cleanDueOverride, cleanMilestone, approvalOf, cohortDefinition, cohortDefinitionView, orgProgram, pickCohort, programDiff, programSnapshot, removedRequirementIds, renderJourney, restorePlan, stageRulesIssues, BLOCKING_RULES, postInTrack, POST_IN_TRACK_AR, postInService, POST_IN_SERVICE_AR, upgradePlan } from './logic.js';
import { READY_MIN } from './capstone.js';
import { planUpgradeBlock } from './cohort-plan.js';
import { cohortSetup, sessionsFor, setupMissing, undatedFor } from './cohort-setup.js';
import type { Actor, Admin } from './admin.ts';
import { cleanProfile } from './certificates.ts';
import { seatsUsedByOrg } from './entitlements.ts';
import { features } from './features.ts';
import { featureHiddenCodes, featureHiddenFor } from './features.js';
import { isRunning, LIVE } from './cohort-running.js';
import { listed } from './counting.ts';
import { demoCohortOf, refuseDemo, removeCohortDemo } from './demo-cohort.ts';
import { eachWorkshop } from './optional.js';
import { sessionCols } from './workshop-optional.ts';
import { cleanConfig } from './logic.js';
import { missingTable } from './missing-column.ts';

type Body = Record<string, any>;

// كل الأعمدة لا قائمة صريحة: عمود مضاف في ترحيل لم يُطبَّق بعد (مثل supervision) كان يُفشل القراءة كلها (42703)
// فيفقد كل مشارك دفعته وتختفي الدفعات من اللوحة حتى يُطبَّق الترحيل. الأعمدة الغائبة تُقرأ undefined وتُعامل كافتراضي.
const COHORT_COLS = '*';
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v || ''));

// يُقرأ في كل طلب بلا تخزين: التخزين في الذاكرة يبقى على القيمة القديمة في بقية نسخ دالة الحافة بعد تغيير
// البرنامج الافتراضي، والقراءة استعلام واحد صغير (P4)
export async function defaultProgramId() {
  const { data } = await db.from('programs').select('id').eq('is_default', true).maybeSingle();
  if (!data) throw new Fail('لا يوجد برنامج افتراضي', 500);
  return data.id as string;
}

async function liveRows(programId: string) {
  const [st, rq] = await Promise.all([
    db.from('journey_stages').select('*').eq('program_id', programId).order('sort'),
    db.from('stage_requirements').select('*').eq('program_id', programId).order('sort'),
  ]);
  return { stages: must(st) ?? [], requirements: must(rq) ?? [] };
}

// أحدث نسخة للبرنامج بلا لقطتها. نسخ البرنامج قليلة فتُقرأ كلها ويُختار أكبرها رقمًا، فلا يتعلق الحكم بترتيب القراءة
async function latestVersion(programId: string): Promise<{ id: string; number: number; label: string; created_at?: string } | null> {
  const rows = (must(await db.from('program_versions').select('id, number, label, created_at').eq('program_id', programId)) || []) as any[];
  return rows.reduce((m: any, v: any) => (!m || Number(v.number) > Number(m.number) ? v : m), null);
}

// ما يمنع حفظ نسخة من البرنامج كما هو: برنامج بلا متطلب فعّال (نسخة فارغة تصير «أحدث نسخة» فتُثبَّت عليها دفعات بلا
// رحلة)، و«تبدأ مع» يُعاد فحصه، فمرجع صار بعدها بالترتيب أو مخفيًا أو محذوفًا يقفلها إلى الأبد. يقرؤه حفظ النسخة وإنشاء
// البرنامج وإنشاء نسخة الدفعة الأولى، فلا تُكتب نسخة فارغة ولا بقاعدة كاسرة من أي مدخل
function versionBlock(live: { stages: any[]; requirements: any[] }): { code: string; msg: string } | null {
  if (!live.requirements.some((r: any) => r.active !== false)) return { code: 'program_empty', msg: 'البرنامج بلا متطلبات بعد، فلا تُحفظ له نسخة. ابنِ رحلته أولًا.' };
  // «تبدأ مع»، وطبيعة المسار المستمر وما يشترطه وحلقته (T1): كلها تقفل من يمر بها إلى الأبد
  const bad = stageRulesIssues(live.stages).find((x: any) => x.level === 'error' && BLOCKING_RULES.includes(x.rule));
  if (bad) return { code: 'rules', msg: `لا تُحفظ النسخة: ${bad.msg}` };
  if (postInTrack(live.stages, live.requirements)) return { code: 'rules', msg: `لا تُحفظ النسخة: ${POST_IN_TRACK_AR}` };
  return postInService(live.stages, live.requirements) ? { code: 'rules', msg: `لا تُحفظ النسخة: ${POST_IN_SERVICE_AR}` } : null;
}

// ── للمشارك ──
// strict: خطأ القراءة يرمي بدل أن يُقرأ «بلا دفعة» (ختم الإصدار D02 لا يسقط بصمت)
export async function cohortOf(p: { id?: string | null; organization_id?: string | null }, { strict = false } = {}) {
  // حساب الدفعة التجريبي (demo-cohort.ts): دفعته من عموده وحده، كأنها إلحاق صريح، ولا صف له في enrollments. فيرى خطة
  // دفعته ونسختها ومواعيدها وما أُوقف من مراحلها كما يراها أعضاؤها، ولا تجده قراءة بالدفعة. دفعة لم تعد موجودة: القاعدة العامة
  const demoCohort = demoCohortOf(p as any);
  const [enr, cohorts] = await Promise.all([
    p.id && !demoCohort ? db.from('enrollments').select('cohort_id, status, created_at').eq('participant_id', p.id) : Promise.resolve({ data: [] as any[], error: null }),
    db.from('cohorts').select(COHORT_COLS),
  ]);
  if (strict) { must(enr); must(cohorts); }
  const enrollments = demoCohort ? [{ cohort_id: demoCohort, status: 'active', created_at: '' }] : enr.data || [];
  return pickCohort({ enrollments, cohorts: cohorts.data || [], organizationId: (p.organization_id || null) as any });
}

// إصدار محتوى دفعة المشارك (D02): رقمه، وأبواب الكتاب فيه لحساب بند القراءة على إصدار الدفعة.
// null لدفعة لم يُقطع إصدارها وحدها، فيُحسب كل شيء على المحتوى الحي؛ وخطأ القراءة يرمي
export async function releaseOf(p: { id?: string | null; organization_id?: string | null }) {
  const { cohort } = await cohortOf(p, { strict: true });
  const id = (cohort as any)?.content_release || null;
  if (!id) return null;
  const data = must(await db.from('content_releases').select('id, manifest').eq('id', id).maybeSingle());
  const items = (data as any)?.manifest?.areas?.handbook_modules?.items;
  return { id, modules: items ? Object.values(items).map((x: any) => x.id).filter(Boolean) as string[] : null };
}

// تعريف رحلة المشارك: المراحل والمتطلبات كما تسري عليه بعد تخصيص دفعته
// forCohort: تعريف دفعة بعينها بلا مشارك (خريطة رحلة الدفعة في ملفها، adminCohortJourney)، بالحساب نفسه بعد اختيار الدفعة
export async function journeyDefinition(p: { id?: string | null; organization_id?: string | null }, forCohort: any = null) {
  const { cohort, via } = forCohort ? { cohort: forCohort, via: 'cohort' } : await cohortOf(p);
  const programId = cohort?.program_id || await defaultProgramId();
  let version: any = null;
  if (cohort?.program_version_id) {
    version = (await db.from('program_versions').select('id, number, label, data').eq('id', cohort.program_version_id).maybeSingle()).data;
  }
  // بعد ترحيل التثبيت لا تبقى دفعة بلا نسخة، فالقراءة الحية هنا ملاذ لما لم يُثبَّت بعد (أو بلا دفعة أصلًا)
  if (cohort && !cohort.program_version_id) console.warn('cohort without program version:', cohort.id);
  const live = version ? null : await liveRows(programId);
  const def = cohortDefinition({ live, version, cohort });
  // بنود أخفتها الدفعة: تختفي من رحلة أعضائها فورًا، ولا يُحذف ما أُنجز منها
  const cohortHidden = ((cohort as any)?.hidden_requirements || []) as string[];
  // وبنود يخفيها مفتاح ميزة مطفأ (تقدير المدير والزملاء مع 360): الطبقة نفسها، فلا تُمس النسخة ولا الصفوف وتعود حين يُظهَر
  const fh = featureHiddenFor({ stages: def.stages, requirements: def.requirements, cohortHidden, flags: await features(), breaks: hideBreaksStage });
  if (fh.kept.length) console.warn('feature-hidden kept to avoid a stuck stage:', fh.kept.join(','), cohort?.id || '');
  const hidden = new Set([...cohortHidden, ...fh.hidden]);
  if (hidden.size) def.requirements = def.requirements.filter((r: any) => !hidden.has(r.code));
  if (version) {
    // توفر الموجّه للاتصال الفوري حالة تشغيلية لا جزء من النسخة؛ تُقرأ من البرنامج الحالي
    const ids = def.requirements.filter((r: any) => r.kind === 'coaching').map((r: any) => r.id);
    if (ids.length) {
      const { data } = await db.from('stage_requirements').select('id, config').in('id', ids);
      // ومعها رابط الغرفة إن لم يكن في النسخة: توفر يُعلن على الصف الحي (activities.ts) لا يُرى بلا رابطه. رابط الدفعة أو النسخة أولى
      const live = new Map((data || []).map((r: any) => [r.id, r.config || {}]));
      def.requirements = def.requirements.map((r: any) => {
        const c: any = live.get(r.id);
        if (!c?.instant_until) return r;
        return { ...r, config: { ...r.config, instant_until: c.instant_until, ...(!r.config?.instant_url && c.instant_url ? { instant_url: c.instant_url } : {}) } };
      });
    }
  }
  // نصوص المراحل تُملأ رموزها من إعدادات المتطلبات، فلا يُكتب رقم في وصف
  const rendered = renderJourney(def, { readyMin: READY_MIN, assessmentMinutes: await baselineMinutes() });
  return {
    ...rendered, via, program_id: programId, feature_hidden: fh.hidden,
    // الموقوفة في خطة الدفعة (R2b): خارج الرحلة، وتُعرض باهتة في خريطة ملف الدفعة
    stages_off: def.stages_off || [],
    requirements_off: (def as any).requirements_off || [],
    cohort: cohort ? { id: cohort.id, name: cohort.name, is_default: !!cohort.is_default, starts_on: cohort.starts_on, ends_on: cohort.ends_on, schedule: cohort.schedule || {},
      level_mode: cohort.level_mode || 'mixed', content_level: cohort.content_level || null, stage_modes: cohort.stage_modes || {}, project_mode: cohort.project_mode || 'individual' } : null,
    milestones: ((await db.from('program_milestones').select('*').eq('program_id', programId).eq('active', true).order('sort')).data || []),
    version: version ? { id: version.id, number: version.number, label: version.label } : null,
  };
}

// متطلب من رحلة المشارك نفسها، بإعداد دفعته
export async function requirementFor(p: any, id: unknown, kind?: string) {
  const def = await journeyDefinition(p);
  const r = def.requirements.find((x: any) => x.id === String(id || ''));
  if (!r || (kind && r.kind !== kind)) throw new Fail('النشاط غير موجود', 404);
  return { r, def };
}

// معرف متطلب برمزه في برنامج المشارك (E-MGR، E-CASE...)
export async function requirementIdByCode(p: any, code: string) {
  const def = await journeyDefinition(p);
  return def.requirements.find((x: any) => x.code === code)?.id || null;
}

// الدفعة وأعضاؤها الفعليون (pickCohort بالقاعدة نفسها التي تعدّ بها memberCounts)، بلا حساب العرض ولا حساب الاختبار
// كما تستبعدهما خريطة الجهة. للخريطة في ملف الدفعة (adminCohortJourney). null إن لم توجد الدفعة. وتختلف عن cohortMembers أدناه (القاعة والمجموعات) بأنها تعد أعضاء الدفعة المفتوحة ممن ليس لهم جهة
export async function cohortMemberIds(cohortId: string) {
  // المشاركون والإلحاقات بصفحات (all): القراءة الواحدة تقف عند max_rows (1000) بلا خطأ، فلا يسقط عضو بصمت كما في خريطة الجهة
  const [cohorts, enr, people] = await Promise.all([
    db.from('cohorts').select(COHORT_COLS).then((r: any) => must(r) as any[]),
    all((f, t) => db.from('enrollments').select('participant_id, cohort_id, status, created_at').order('participant_id').order('cohort_id').range(f, t)),
    all((f, t) => listed(db.from('participants').select('id, organization_id, is_test')).order('id').range(f, t)),
  ]);
  const list = cohorts || [];
  const cohort = list.find((c: any) => c.id === cohortId) || null;
  if (!cohort) return null;
  const byP = new Map<string, any[]>();
  for (const e of enr) { if (!byP.has(e.participant_id)) byP.set(e.participant_id, []); byP.get(e.participant_id)!.push(e); }
  const ids = people.filter((p: any) => !p.is_test && pickCohort({ enrollments: byP.get(p.id) || [], cohorts: list, organizationId: p.organization_id || null }).cohort?.id === cohortId).map((p: any) => p.id as string);
  // متى أُلحق كل عضو بهذه الدفعة (صف إلحاقه إن وُجد): لسطر «انضموا للدفعة» في «منذ آخر زيارة». من دخلها بجهته بلا إلحاق لا صف له
  const joined: Record<string, string> = {};
  for (const id of ids) { const e = (byP.get(id) || []).find((x: any) => x.cohort_id === cohortId); if (e?.created_at) joined[id] = e.created_at; }
  return { cohort, ids, joined };
}

// عدد أعضاء كل دفعة فعلًا، من قراءة واحدة لكل مصدر ثم pickCohort في الذاكرة
// keep: يُعدّ من الأعضاء من يحقق الشرط فقط (مثل بانتظار الاعتماد)، بالقاعدة نفسها فلا عدّ ثانٍ
export function memberCounts(participants: any[], enrollments: any[], cohorts: any[], keep: (p: any) => boolean = () => true) {
  const out: Record<string, number> = {};
  for (const id of Object.values(memberOf(participants, enrollments, cohorts, keep))) if (id) out[id] = (out[id] || 0) + 1;
  return out;
}
// دفعة كل مشارك بالقاعدة نفسها (pickCohort)، وهي ما تعدّه memberCounts: مكتب اليوم (today-desk.ts) يقرؤها من هنا
export function memberOf(participants: any[], enrollments: any[], cohorts: any[], keep: (p: any) => boolean = () => true) {
  const byP = new Map<string, any[]>();
  for (const e of enrollments) { if (!byP.has(e.participant_id)) byP.set(e.participant_id, []); byP.get(e.participant_id)!.push(e); }
  const out: Record<string, string | null> = {};
  for (const p of participants || []) {
    if (!keep(p)) continue;
    out[p.id] = pickCohort({ enrollments: byP.get(p.id) || [], cohorts, organizationId: p.organization_id || null }).cohort?.id || null;
  }
  return out;
}

// جاهزية الدفعة الفعلية لكل جهة (pickCohort ثم cohortSetup)، من قراءة واحدة لكل مصدر. المصدر الواحد لصفحة
// الجهة (adminJourney) وقائمة الجهات (admin.orgs ← سطر الجهة في النظرة العامة)، فلا تختلفان في حال الدفعة.
// orgIds: الجهات المطلوبة. يُرجع لكل جهة دفعتها بجاهزيتها، أو null إن لم تكن لها دفعة مفتوحة أو جارية.
export async function orgCohortSetups(orgIds: string[]) {
  const out: Record<string, any> = {};
  if (!orgIds.length) return out;
  const [cohorts, enr, people, team, sess, progs] = await Promise.all([
    db.from('cohorts').select(COHORT_COLS),
    db.from('enrollments').select('participant_id, cohort_id, status, created_at'),
    listed(db.from('participants').select('id, organization_id')).limit(5000),
    db.from('cohort_experts').select('cohort_id, expert_id'),
    db.from('workshop_sessions').select(await sessionCols('cohort_id, active, starts_at, ends_at')).eq('active', true).or(`starts_at.is.null,starts_at.gte.${new Date(Date.now() - 60 * 864e5).toISOString()}`).limit(5000),
    db.from('programs').select('id, name, archived_at'),
  ]);
  for (const r of [cohorts, enr, people, team, sess]) if (r.error) throw r.error;
  const all = cohorts.data || [];
  const members = memberCounts(people.data || [], enr.data || [], all);
  const own: Record<string, any> = {};
  for (const id of orgIds) {
    const c: any = pickCohort({ enrollments: [], cohorts: all, organizationId: id }).cohort;
    own[id] = c && c.organization_id === id ? c : null;
  }
  const advIds = [...new Set(Object.values(own).map((c: any) => c?.advisor_expert_id).filter(Boolean))] as string[];
  // journey-guard: اسم المستشار المعيَّن للعرض في قائمة الدفعات، والتعيين نفسه يحرسه journeyApproved عند الحفظ
  const advs = advIds.length ? must(await db.from('experts').select('id, full_name, status, roles').in('id', advIds)) as any[] : [];
  const advName = new Map(advs.map((x: any) => [x.id, x.full_name]));
  const serving = new Set(advs.filter(journeyApproved).map((x: any) => x.id));
  for (const id of orgIds) {
    const c = own[id];
    if (!c) { out[id] = null; continue; }
    const setup = cohortSetup({
      cohort: c, advisorName: advName.get(c.advisor_expert_id) || null, advisorServes: serving.has(c.advisor_expert_id),
      teamCount: (team.data || []).filter((t: any) => t.cohort_id === c.id).length,
      members: members[c.id] || 0, upcomingSessions: sessionsFor(c, (sess.data || []) as any[]), undatedSessions: undatedFor(c, (sess.data || []) as any[]),
    });
    // برنامج الجهة للقراءة (P4): مشتق بترتيب pickCohort نفسه (orgProgram)، وتعذّر قراءة البرامج يتركه فارغًا
    const op = progs.error ? null : orgProgram(all, progs.data || [], id);
    out[id] = { cohort: { id: c.id, name: c.name, status: c.status }, setup, setup_missing: setupMissing(setup),
      program: op ? { id: op.program_id, name: op.program_name, via: op.via, cohort_id: op.cohort_id, cohort_name: op.cohort_name } : null };
  }
  return out;
}

// ── للإدارة ──
// هل في مسودة كل برنامج ما لم يُحفظ في أحدث نسخه؟ بالفرق نفسه الذي يعرضه admin.program (unsaved)، من ثلاث قراءات
// للبرامج كلها لا قراءة لكل برنامج. تعذّر القراءة يترك الحكم فارغًا فلا تُعرض شارة خاطئة
async function draftChanges(programIds: string[], versions: any[]): Promise<Record<string, boolean>> {
  const latest = new Map<string, any>();
  for (const v of versions) if (programIds.includes(v.program_id) && (!latest.has(v.program_id) || v.number > latest.get(v.program_id).number)) latest.set(v.program_id, v);
  if (!latest.size) return {};
  try {
    const ids = [...latest.keys()];
    const [st, rq, data] = await Promise.all([
      allFor(ids, () => db.from('journey_stages').select('*').order('program_id').order('key'), 'program_id'),
      allFor(ids, () => db.from('stage_requirements').select('*').order('id'), 'program_id'),
      allFor([...latest.values()].map((v) => v.id), () => db.from('program_versions').select('id, program_id, data').order('id'), 'id'),
    ]);
    const out: Record<string, boolean> = {};
    for (const v of data) {
      const d = programDiff(v.data, programSnapshot(st.filter((x: any) => x.program_id === v.program_id), rq.filter((x: any) => x.program_id === v.program_id)));
      out[v.program_id] = !!(d.added.length || d.removed.length || d.changed.length || d.stages.added.length || d.stages.removed.length || d.stages.changed.length);
    }
    return out;
  } catch (e) { console.error('draftChanges:', (e as Error).message); return {}; }
}

// opt.desk لمكتب اليوم وحده (today-desk.ts): يضيف إلى الرد عضوية كل مشارك وصفوف الورش من القراءة نفسها، فلا يُعاد
// قراءة المشاركين والتسجيلات والدفعات والورش مرة ثانية. لا يصل إلى ردّ admin.programs
export async function list(_b: Body = {}, opt: { desk?: boolean } = {}) {
  const [programs, versions, cohorts, enr, orgs, reqs] = await Promise.all([
    db.from('programs').select('*').order('created_at'),
    db.from('program_versions').select('id, program_id, number, label, created_by, created_at').order('number', { ascending: false }),
    db.from('cohorts').select(COHORT_COLS).order('created_at', { ascending: false }),
    db.from('enrollments').select('participant_id, cohort_id, status, created_at'),
    db.from('organizations').select('id, name, short_name, delivery_default, invite_code, status, seats, contract_starts, contract_ends').order('name'),
    db.from('stage_requirements').select('program_id, kind, active'),
  ]);
  // فريق خبراء كل دفعة (الترحيل 20261110190000 مطبّق على الإنتاج منذ 2026-11-10)
  const teamRows = must(await db.from('cohort_experts').select('cohort_id, expert_id')) as any[];
  const teams: Record<string, string[]> = {};
  for (const t of teamRows || []) (teams[t.cohort_id] ||= []).push(t.expert_id);
  const count = (rows: any[], f: (r: any) => boolean) => rows.filter(f).length;
  const enrolled: Record<string, number> = {};
  for (const e of enr.data || []) if (e.status !== 'withdrawn') enrolled[e.cohort_id] = (enrolled[e.cohort_id] || 0) + 1;
  // الأعضاء الفعليون بالقاعدة نفسها التي تعمل بها المجموعات والقاعة والفريق (pickCohort): المسجّل صراحة،
  // ومن يتبع الدفعة بجهته. عمود الجدول كان يعدّ التسجيل الصريح وحده فيُظهر صفرًا لدفعة فيها أعضاء.
  const people = must(await listed(db.from('participants').select('id, organization_id, status, is_test')).limit(5000)) as any[];
  const members = memberCounts(people, enr.data || [], cohorts.data || []);
  // لملف الدفعة: من ينتظر الاعتماد فيها، وجلساتها القادمة، واسم مستشارها، من قراءة واحدة لكل مصدر
  // العدد يستبعد حساب الاختبار كما في صفحة الجهة والنظرة العامة (forStats)، والقائمة تعرضه بشارته
  const pending = memberCounts(people, enr.data || [], cohorts.data || [], (p) => p.status === 'pending_approval' && !p.is_test);
  const advIds = [...new Set((cohorts.data || []).map((c: any) => c.advisor_expert_id).filter(Boolean))] as string[];
  const [sess, advs] = await Promise.all([
    // الجلسات الفعّالة الحديثة والقادمة، وبلا دفعة كذلك (تعمّ الدفعات)، ثم sessionsFor لكل دفعة: القاعدة الواحدة
    db.from('workshop_sessions').select(await sessionCols('cohort_id, active, starts_at, ends_at')).eq('active', true).or(`starts_at.is.null,starts_at.gte.${new Date(Date.now() - 60 * 864e5).toISOString()}`).limit(5000),
    // journey-guard: اسم المستشار المعيَّن للعرض، والتعيين نفسه يحرسه journeyApproved عند الحفظ
    advIds.length ? db.from('experts').select('id, full_name, status, roles').in('id', advIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const advisorName = new Map((advs.data || []).map((x: any) => [x.id, x.full_name]));
  // جاهزية «المستشار الأساسي» في ملف الدفعة (cohort-hub.js): يُحتسب من يخدم في الرحلة وحده
  const advisorServing = new Set((advs.data || []).filter(journeyApproved).map((x: any) => x.id));
  const seated = await seatsUsedByOrg().catch(() => null);
  const drafts = await draftChanges((programs.data || []).filter((p: any) => !p.archived_at).map((p: any) => p.id), versions.data || []);
  return {
    success: true,
    programs: (programs.data || []).map((pr: any) => {
      const vs = (versions.data || []).filter((v: any) => v.program_id === pr.id);
      // كم دفعة على كل نسخة، والجارية منها: «قيد الاستعمال» في قائمة النسخ
      const on = (vid: string, live = false) => (cohorts.data || []).filter((c: any) => c.program_version_id === vid && (!live || c.status === 'open' || c.status === 'running')).length;
      return {
        ...pr,
        requirements: count(reqs.data || [], (r) => r.program_id === pr.id && r.active !== false),
        versions: vs.map((v: any) => ({ ...v, cohorts: on(v.id), live_cohorts: on(v.id, true) })),
        draft_changed: pr.id in drafts ? drafts[pr.id] : null,
        unpinned_cohorts: (cohorts.data || []).filter((c: any) => c.program_id === pr.id && !c.program_version_id).length,
      };
    }),
    cohorts: (cohorts.data || []).map((c: any) => ({
      ...c, enrolled: enrolled[c.id] || 0, members: members[c.id] || 0, team_expert_ids: teams[c.id] || [], team_ready: true,
      // قراءة لم تنجح تترك الحقل فارغًا، فلا يظهر في الملف بند خاطئ
      pending_approval: pending[c.id] || 0, upcoming_sessions: sess.error ? null : sessionsFor(c, (sess.data || []) as any[]), undated_sessions: sess.error ? null : undatedFor(c, (sess.data || []) as any[]),
      advisor_name: c.advisor_expert_id ? advisorName.get(c.advisor_expert_id) || null : null,
      advisor_serves: c.advisor_expert_id ? advisorServing.has(c.advisor_expert_id) : null,
    })),
    // عقد الجهة مصدرًا لسطر المقاعد في نموذج دفعتها: الحد والمستهلك من العقد كله (seatsUsedByOrg)، والدفعة التي
    // يدخلها أعضاؤها الجدد الآن (pickCohort). تعذّر عد المقاعد يترك seats_used فارغًا فلا يُعرض رقم خاطئ
    organizations: (orgs.data || []).map((o: any) => {
      const auto = pickCohort({ enrollments: [], cohorts: cohorts.data || [], organizationId: o.id });
      return { ...o, seats_used: seated ? seated[o.id] || 0 : null, auto_cohort: auto.cohort ? { id: auto.cohort.id, name: auto.cohort.name, via: auto.via } : null };
    }),
    // هل فريق خبراء الدفعة جاهز (الدالة منشورة والجدول مطبّق)؟ اللوحة لا تعرض حقله قبل ذلك حتى لا يُحفظ فريق يُتجاهل
    // team_ready باقٍ للوحة المنشورة التي تُظهر حقل الفريق به؛ الجدول مطبّق فهو صحيح دائمًا
    team_ready: true,
    ...(opt.desk ? { desk: {
      member_of: enr.error || cohorts.error ? null : memberOf(people, enr.data || [], cohorts.data || []),
      workshops: sess.error ? null : sess.data || [],
    } } : {}),
  };
}

export async function program(b: Body) {
  const id = isUuid(b.id) ? String(b.id) : await defaultProgramId();
  const pr = must(await db.from('programs').select('*').eq('id', id).maybeSingle());
  if (!pr) throw new Fail('البرنامج غير موجود', 404);
  const live = await liveRows(id);
  const { data: last } = await db.from('program_versions').select('id, number, label, data').eq('program_id', id).order('number', { ascending: false }).limit(1);
  const latest = last?.[0] || null;
  // اسم مرحلة كل متطلب وقاعدتها معه: نموذج الدفعة يميز بها العناوين المتطابقة ويكشف الإخفاء الكاسر قبل الحفظ
  const stageOf = new Map(live.stages.map((st: any) => [st.key, st]));
  const requirements = live.requirements.map((r: any) => ({ ...r, stage_title_ar: stageOf.get(r.stage_key)?.title_ar || null, stage_rules: stageOf.get(r.stage_key)?.rules || {}, stage_active: stageOf.get(r.stage_key)?.active !== false }));
  return {
    success: true, program: pr, ...live, requirements,
    latest: latest ? { id: latest.id, number: latest.number, label: latest.label } : null,
    // ما تغيّر في المسودة منذ آخر نسخة محفوظة
    unsaved: latest ? programDiff(latest.data, programSnapshot(live.stages, live.requirements)) : null,
  };
}

// برنامج جديد: نسخة من برنامج قائم (الافتراضي إن لم يُحدَّد) أو من نسخة محفوظة منه
export async function programSave(a: Admin, b: Body) {
  const name = String(b.name || '').trim().slice(0, 120);
  const description_ar = b.description_ar == null ? undefined : String(b.description_ar).trim().slice(0, 2000) || null;
  if (isUuid(b.id)) {
    const patch: Body = { updated_at: new Date().toISOString() };
    if (name) patch.name = name;
    if (description_ar !== undefined) patch.description_ar = description_ar;
    // شهادة البرنامج: ما يختلف عن الإعداد العام فقط
    if (b.cert && typeof b.cert === 'object') patch.cert = cleanProfile(b.cert, true);
    const row = must(await db.from('programs').update(patch).eq('id', b.id).select('*').single());
    await audit('admin', a.email, 'program.save', 'programs', row.id, null, { ...patch, ...(patch.cert?.signatory ? { cert: { ...patch.cert, signatory: patch.cert.signatory.name } } : {}) });
    return { success: true, program: row };
  }
  if (!name) throw new Fail('اسم البرنامج مطلوب');
  let source: { stages: any[]; requirements: any[] };
  if (isUuid(b.from_version)) {
    const v = must(await db.from('program_versions').select('data').eq('id', b.from_version).maybeSingle());
    if (!v) throw new Fail('النسخة غير موجودة', 404);
    source = v.data;
  } else {
    source = await liveRows(isUuid(b.from) ? String(b.from) : await defaultProgramId());
  }
  const base = isUuid(b.from) ? (await db.from('programs').select('cert').eq('id', b.from).maybeSingle()).data : null;
  const pr = must(await db.from('programs').insert({ name, description_ar: description_ar ?? null, cert: base?.cert || {}, created_by: a.email }).select('*').single());
  const strip = ({ program_id: _p, created_at: _c, updated_at: _u, ...r }: any) => r;
  if (source.stages.length) must(await db.from('journey_stages').insert(source.stages.map((s) => ({ ...strip(s), program_id: pr.id }))));
  if (source.requirements.length) {
    must(await db.from('stage_requirements').insert(source.requirements.map((r) => {
      const { id: _id, ...rest } = strip(r);
      return { ...rest, program_id: pr.id };
    })));
  }
  // كل برنامج يولد بنسخته الأولى، فأول دفعة عليه تُثبَّت على شيء محفوظ. برنامج بلا متطلبات أو بقاعدة «تبدأ مع»
  // كاسرة لا تُحفظ له نسخة الآن، وتُنشأ عند أول دفعة بعد إصلاحه (cohortSave)
  let version: any = null;
  if (!versionBlock(source)) {
    version = await snapshotVersion(a, pr.id, 'النسخة 1');
    await audit('admin', a.email, 'program.version', 'program_versions', version.id, null, { number: version.number, label: version.label, auto: 'program.create' });
  }
  await audit('admin', a.email, 'program.create', 'programs', pr.id, null, { from: b.from || null, from_version: b.from_version || null });
  return { success: true, program: pr, version };
}

export async function programArchive(a: Admin, b: Body) {
  const pr = must(await db.from('programs').select('*').eq('id', String(b.id || '')).maybeSingle());
  if (!pr) throw new Fail('البرنامج غير موجود', 404);
  const archive = b.archive !== false;
  if (archive && pr.is_default) throw new Fail('البرنامج الافتراضي لا يُؤرشف');
  if (archive) {
    const { count } = await db.from('cohorts').select('id', { count: 'exact', head: true }).eq('program_id', pr.id).neq('status', 'closed');
    if (count) throw new Fail(`للبرنامج ${count} دفعة غير مغلقة؛ أغلقها أو انقلها أولًا`, 409);
  }
  must(await db.from('programs').update({ archived_at: archive ? new Date().toISOString() : null }).eq('id', pr.id));
  await audit('admin', a.email, archive ? 'program.archive' : 'program.unarchive', 'programs', pr.id);
  return { success: true };
}

// لقطة من البرنامج كما هو برقم بعد أحدث نسخه. حفظان في اللحظة نفسها يأخذان الرقم نفسه فيرد القيد الفريد
// (program_id, number) الثاني: يُعاد بالرقم التالي مرتين، ثم رسالة بالعربية لا «تعذّر تنفيذ العملية».
// reuse: من يريد «أي نسخة من البرنامج» لا نسخة جديدة بعينها (النسخة 1 لأول دفعة) يأخذ النسخة التي سبقته بدل أن يكرر لقطتها
async function snapshotVersion(a: Admin, programId: string, label: string, { reuse = false } = {}): Promise<any> {
  const live = await liveRows(programId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await latestVersion(programId);
    if (reuse && last) return { ...last, reused: true };
    const number = (last?.number || 0) + 1;
    const res = await db.from('program_versions').insert({
      program_id: programId, number, label: label.slice(0, 160) || `النسخة ${number}`,
      data: programSnapshot(live.stages, live.requirements), created_by: a.email,
    }).select('id, number, label, created_at').single();
    if ((res.error as any)?.code === '23505') continue;
    return must(res);
  }
  throw new Fail('حُفظت نسخة أخرى لهذا البرنامج في اللحظة نفسها. أعد المحاولة.', 409, 'version_race');
}

// حفظ نسخة: لقطة ثابتة من البرنامج كما هو الآن
export async function programPublish(a: Admin, b: Body) {
  const id = String(b.id || '');
  if (!isUuid(id)) throw new Fail('اختر البرنامج');
  const block = versionBlock(await liveRows(id));
  if (block) throw new Fail(block.msg, 400, block.code);
  const v = await snapshotVersion(a, id, String(b.label || '').trim());
  await audit('admin', a.email, 'program.version', 'program_versions', v.id, null, { number: v.number, label: v.label });
  // الترقية التلقائية (قرار المالك 2026-11-23): كل دفعة غير مغلقة مثبتة على نسخة أقدم تُرقّى إلى النسخة الجديدة إن كانت
  // آمنة: لا مانع، ولا أحد له تقدم فيما يُحذف، ولا إعداد للدفعة يسقط. غير ذلك يبقى للمدير بمعاينته وسببه. وغير المثبتة
  // (قبل ترحيل التثبيت) تُثبَّت يدويًا كما كانت، فلا تتغير رحلة أعضائها دون معاينة
  const rows = ((must(await db.from('cohorts').select('id, name, status, program_version_id').eq('program_id', id)) || []) as any[])
    .filter((c) => c.status !== 'closed' && c.program_version_id !== v.id);
  const upgraded: string[] = [];
  const held: { id: string; name: string; reason: string }[] = [];
  for (const c of rows) {
    if (!c.program_version_id) { held.push({ id: c.id, name: c.name, reason: 'غير مثبتة على نسخة: ثبّتها من ملفها بعد المعاينة' }); continue; }
    try {
      // بلا version_id: الهدف أحدث نسخة، وهي التي حُفظت للتو
      const pre: any = await cohortUpgrade(a, { id: c.id });
      if (pre.unchanged) { upgraded.push(c.name); continue; }
      if (pre.to?.id !== v.id) { held.push({ id: c.id, name: c.name, reason: 'حُفظت نسخة أحدث في اللحظة نفسها: رقِّها من ملفها' }); continue; }
      const reason = pre.blocked || (pre.affected ? `${pre.affected} من أعضائها لهم تقدم فيما يُحذف` : '') || (pre.dropped?.length ? 'يسقط من إعدادها ما يحتاج مراجعتك' : '');
      if (reason) { held.push({ id: c.id, name: c.name, reason }); continue; }
      await cohortUpgrade(a, { id: c.id, confirm: true, auto: true });
      upgraded.push(c.name);
    } catch (e) {
      held.push({ id: c.id, name: c.name, reason: (e as any)?.message || 'تعذّرت الترقية' });
    }
  }
  return { success: true, version: v, behind: held.length, upgraded, held };
}

// استرجاع نسخة إلى البرنامج. يُحفظ الوضع الحالي نسخةً أولًا فلا يضيع شيء،
// وما ليس في النسخة المسترجعة يُعطَّل ولا يُحذف.
export async function programRestore(a: Admin, b: Body) {
  const v = must(await db.from('program_versions').select('*').eq('id', String(b.version_id || '')).maybeSingle());
  if (!v) throw new Fail('النسخة غير موجودة', 404);
  const backup = await snapshotVersion(a, v.program_id, `قبل استرجاع النسخة ${v.number}`);
  const live = await liveRows(v.program_id);
  const plan = restorePlan(v.data, live);
  if (plan.stages.length) must(await db.from('journey_stages').upsert(plan.stages.map((s: any) => ({ ...s, program_id: v.program_id })), { onConflict: 'program_id,key' }));
  if (plan.disableStages.length) must(await db.from('journey_stages').update({ active: false }).eq('program_id', v.program_id).in('key', plan.disableStages));
  if (plan.requirements.length) must(await db.from('stage_requirements').upsert(plan.requirements.map((r: any) => ({ ...r, program_id: v.program_id }))));
  if (plan.disableRequirements.length) must(await db.from('stage_requirements').update({ active: false }).in('id', plan.disableRequirements));
  // المسترجع يُحفظ نسخةً أحدث من النسخة الاحتياطية: «أحدث نسخة» (الدفعة الجديدة، وتغيير البرنامج، وزر الترقية) تقرأ
  // ما اختار المدير الرجوع إليه، لا ما تراجع عنه. نسخة مسترجعة لا تُحفظ (فارغة أو بقاعدة كاسرة) تُترك للمسودة ويُقال ذلك
  const after = await liveRows(v.program_id);
  const block = versionBlock(after);
  const restoredAs = block ? null : await snapshotVersion(a, v.program_id, `استرجاع النسخة ${v.number}`);
  if (restoredAs) await audit('admin', a.email, 'program.version', 'program_versions', restoredAs.id, null, { number: restoredAs.number, label: restoredAs.label, auto: 'program.restore' });
  await audit('admin', a.email, 'program.restore', 'program_versions', v.id, null, { number: v.number, backup: backup.number, restored_as: restoredAs?.number ?? null });
  // الدفعات مثبتة على نسخها: الاسترجاع لا يصل إلى دفعة قائمة حتى تُرقّى إلى النسخة المسترجعة
  return { success: true, restored: v.number, backup, restored_as: restoredAs, ...(block ? { restored_note: block.msg } : {}) };
}

// الفرق بين نسخة والبرنامج الحالي
export async function programCompare(b: Body) {
  const v = must(await db.from('program_versions').select('program_id, number, label, data').eq('id', String(b.version_id || '')).maybeSingle());
  if (!v) throw new Fail('النسخة غير موجودة', 404);
  const live = await liveRows(v.program_id);
  return { success: true, version: { number: v.number, label: v.label }, diff: programDiff(v.data, programSnapshot(live.stages, live.requirements)) };
}

// ── الدفعات ──
const STATUSES = ['planned', 'open', 'running', 'closed'];
const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

// حراس المشاركين الأحياء قبل أي كتابة: التقدم مربوط بمعرف المتطلب، فلا يُنقل أحد بين برنامجين بصمت،
// ولا يُترك إخفاء مرحلة بلا بند يكملها، ولا يتغير برنامج دفعة لأعضائها تقدم.
// كل قراءة بصفحات (all/allFor): القراءة الواحدة تقف عند max_rows بلا خطأ، والرابط بمعرفات كثيرة يتجاوز حده
async function liveWorld(scope: { orgs: (string | null)[]; cohortId: string | null; everyone: boolean }) {
  const cohorts = await all((f, t) => db.from('cohorts').select(COHORT_COLS).order('id').range(f, t));
  let ids: string[] | null = null;
  if (!scope.everyone) {
    const set = new Set<string>();
    if (scope.cohortId) {
      for (const e of await all((f, t) => db.from('enrollments').select('participant_id').eq('cohort_id', scope.cohortId).neq('status', 'withdrawn').order('id').range(f, t))) set.add(e.participant_id);
    }
    for (const o of new Set(scope.orgs.filter(Boolean))) {
      for (const r of await all((f, t) => listed(db.from('participants').select('id').eq('organization_id', o)).order('id').range(f, t))) set.add(r.id);
    }
    ids = [...set];
    if (!ids.length) return { cohorts, participants: [] as any[], enrollments: [] as any[], progress: [] as any[] };
  }
  const [participants, enrollments, progress] = await Promise.all([
    allFor(ids, () => listed(db.from('participants').select('id, organization_id')).order('id'), 'id'),
    allFor(ids, () => db.from('enrollments').select('participant_id, cohort_id, status, created_at').order('id')),
    // يكفي وجود صف: من له صف تقدم واحد يفقده بالنقل
    allFor(ids, () => db.from('participant_requirements').select('participant_id').order('participant_id').order('requirement_id')),
  ]);
  return { cohorts, participants, enrollments, progress };
}
// تعريف الدفعة من مصدره الواحد: لقطة نسختها المثبتة، أو صفوف برنامجها الحية. منه يقرأ الحارس والجدول ووضع المراحل
// وتخصيص التنفيذ والمجموعات ونافذة admin.cohort-definition، فلا تعرض نافذة مراحل غير التي يتحقق بها الخادم (P5)
export const defOf = async (vid: string | null | undefined, programId: string) => vid
  ? ((await db.from('program_versions').select('data').eq('id', vid).single()).data?.data || { stages: [], requirements: [] })
  : await liveRows(programId);

// admin.cohort-definition: مراحل الدفعة ومتطلباتها كما تسري عليها، والمخفي بعلامة hidden لا محذوفًا.
// program_id وprogram_version_id اختياريان لما يختاره المحرر قبل الحفظ: 'latest' أحدث نسخة محفوظة (وبلا نسخة البرنامج
// كما هو، وهو ما تُنشأ منه نسخته الأولى عند الحفظ، كما في cohortSave)، و'' معاينة البرنامج كما هو الآن (المسودة)
export async function cohortDefinitionFor(b: Body) {
  const c = isUuid(b.cohort_id) ? must(await db.from('cohorts').select(COHORT_COLS).eq('id', b.cohort_id).maybeSingle()) : null;
  if (b.cohort_id && !c) throw new Fail('الدفعة غير موجودة', 404);
  const programId = isUuid(b.program_id) ? String(b.program_id) : c?.program_id || await defaultProgramId();
  let vid: string | null = 'program_version_id' in b ? (b.program_version_id || null) : (c && c.program_id === programId ? c.program_version_id || null : null);
  if (vid === 'latest') vid = (await latestVersion(programId))?.id || null;
  let version: any = null;
  if (vid) {
    if (!isUuid(vid)) throw new Fail('نسخة غير صالحة');
    version = must(await db.from('program_versions').select('id, number, label, data').eq('id', vid).eq('program_id', programId).maybeSingle());
    if (!version) throw new Fail('النسخة لا تخص هذا البرنامج');
  }
  const view = cohortDefinitionView({ live: version ? null : await liveRows(programId), version, cohort: c });
  // جلسات الدفعة لخطها الزمني (J1b): موعد كل جلسة جماعية أو «يُحدد لاحقًا»، قراءة فقط وبلا السر
  const wsIds = c ? view.requirements.filter((r: any) => r.kind === 'workshop' && r.id).map((r: any) => r.id) : [];
  const sessions = wsIds.length
    ? (must(await db.from('workshop_sessions').select(await sessionCols('id, requirement_id, cohort_id, title_ar, starts_at, ends_at, mode, active')).in('requirement_id', wsIds)) || [])
      .filter((s: any) => !s.cohort_id || s.cohort_id === c.id)
    : [];
  // خطة الدفعة كما هي الآن (R2a): يقرؤها تبويب «الرحلة» مع التعريف نفسه، فلا تعرض المعاينة خطة أقدم من قائمة الدفعات
  const cohort_plan = c ? { schedule: c.schedule || {}, starts_on: c.starts_on || null, ends_on: c.ends_on || null, is_default: !!c.is_default,
    status: c.status || null, program_version_id: c.program_version_id || null, updated_at: c.updated_at || null } : null;
  return { success: true, program_id: programId, version: version ? { id: version.id, number: version.number, label: version.label } : null, ...view, sessions, cohort_plan };
}
async function guardLive(b: Body, row: Body, prev: any, programId: string) {
  const programChanged = !!(prev && row.program_id && row.program_id !== prev.program_id);
  const hidden = ('hidden_requirements' in row ? row.hidden_requirements : prev?.hidden_requirements) || [];
  const vid = 'program_version_id' in row ? row.program_version_id : prev?.program_version_id ?? null;
  const versionChanged = !!prev && vid !== (prev.program_version_id ?? null);
  if (hidden.length && ('hidden_requirements' in row || programChanged || versionChanged)) {
    const def = await defOf(vid, programId);
    // وما يخفيه مفتاح ميزة مطفأ الآن (بنود تقدير المدير والزملاء مع 360) يُحسب مع إخفاء الدفعة: بند يبقيه featureHiddenFor
    // ظاهرًا لئلا تفرغ مرحلته لا يكتمل ما دام المفتاح مطفأ، فلا يُسمح بإخفاء يجعله وحده ما يكمل مرحلة
    const fcodes = featureHiddenCodes(await features());
    const broken = hideBreaksStage(def.stages || [], def.requirements || [], [...hidden, ...fcodes]);
    // يُرفض ما يزيد الكسر وحده: مجموعة قائمة كاسرة لم تُمس لا تمنع إغلاق الدفعة ولا تعديل اسمها، ولا كسر من شكل البرنامج والمفتاح وحدهما
    const was = !broken.length ? []
      : prev?.hidden_requirements?.length
        ? await defOf(prev.program_version_id, prev.program_id).then((d: any) => hideBreaksStage(d.stages || [], d.requirements || [], [...prev.hidden_requirements, ...fcodes]))
        : hideBreaksStage(def.stages || [], def.requirements || [], fcodes);
    const worse = newlyBroken(broken, was);
    if (worse.length) {
      const byFeature = fcodes.length && newlyBroken(worse, hideBreaksStage(def.stages || [], def.requirements || [], hidden)).length > 0;
      throw new Fail(hideBreaksMessage(worse) + (byFeature ? ' وبنود تقدير المدير والزملاء مخفية الآن مع تقييم 360، فلا تُحسب مما يكمل المرحلة.' : ''), 400, 'hide_breaks_stage', { stages: worse.map((s: any) => s.key) });
    }
  }
  const touched = !prev || ['status', 'organization_id', 'starts_on', 'program_id'].some((k) => k in row && row[k] !== prev[k]);
  // الدفعة المفتوحة ملاذ من لا دفعة له أيًا كانت حالتها (pickCohort)، فلا يتغير لأعضائها إلا البرنامج
  if (!touched || (prev?.is_default && !programChanged)) return;
  const next = { ...(prev || {}), ...row, id: prev?.id || 'new', created_at: prev?.created_at || new Date().toISOString() };
  // من قد تتغير دفعته: أعضاء الجهة قبل الحفظ وبعده، والملحقون بالدفعة، والجميع إن كانت الدفعة المفتوحة
  const w = await liveWorld({ orgs: [prev?.organization_id ?? null, next.organization_id ?? null], cohortId: prev?.id || null, everyone: !!next.is_default });
  const impact = moveImpact(w, w.cohorts, cohortsAfter(w.cohorts, next));
  if (programChanged && impact.stay) throw new Fail(programLockedText(impact.stay), 409, 'program_locked', { affected: impact.stay });
  if (b.confirm_move === true || !impact.moved) return;
  const extra = { affected: impact.moved, from: impact.from, to: impact.to };
  throw new Fail(`${moveConfirmText(extra)} أكّد النقل إن كان مقصودًا، أو أبقِ الدفعة على حالها حتى تُغلق السابقة.`, 409, 'confirm_move', extra);
}

export async function cohortSave(a: Admin, b: Body) {
  const prev = isUuid(b.id) ? must(await db.from('cohorts').select('*').eq('id', b.id).maybeSingle()) : null;
  if (isUuid(b.id) && !prev) throw new Fail('الدفعة غير موجودة', 404);
  const row: Body = {};
  if ('name' in b) row.name = String(b.name || '').trim().slice(0, 160);
  if (!prev && !row.name) throw new Fail('اسم الدفعة مطلوب');
  if ('organization_id' in b) {
    if (prev?.is_default && b.organization_id) throw new Fail('الدفعة المفتوحة لا ترتبط بجهة');
    row.organization_id = isUuid(b.organization_id) ? b.organization_id : null;
    row.track = row.organization_id ? 'institutional' : 'individual';
  }
  if ('hidden_requirements' in b) {
    row.hidden_requirements = (Array.isArray(b.hidden_requirements) ? b.hidden_requirements : []).map((x: any) => String(x).trim()).filter((x: string) => /^[A-Z0-9-]{2,30}$/i.test(x)).slice(0, 100);
  }
  // المستشار الأساسي: خبير معتمد، أو لا أحد
  if ('advisor_expert_id' in b) {
    if (b.advisor_expert_id && !isUuid(b.advisor_expert_id)) throw new Fail('مستشار غير صالح');
    if (b.advisor_expert_id) {
      // خدمة الرحلة بدور «مستشار» (journeyApproved): عضو اللجنة بلا دور لا يُعيَّن مستشارًا
      const { data: e } = await db.from('experts').select('status, roles').eq('id', b.advisor_expert_id).maybeSingle();
      if (!journeyApproved(e)) throw new Fail('اختر خبيرًا معتمدًا في خدمة الرحلة مستشارًا للدفعة');
      if (!(e?.roles || []).includes('advisor')) throw new Fail('ليس في ملف هذا الخبير دور «مستشار». أضف الدور إلى ملفه من «الخبراء» ثم عيّنه');
    }
    row.advisor_expert_id = b.advisor_expert_id || null;
  }
  // نمط الإشراف في طلبات الأقران (المرحلة 8): الأقران ويؤكّد الخبير، أو الخبير وحده، أو معًا
  if ('supervision' in b) row.supervision = cleanSupervision(b.supervision);
  if ('program_id' in b || !prev) {
    const pid = isUuid(b.program_id) ? String(b.program_id) : await defaultProgramId();
    const pr = must(await db.from('programs').select('id, archived_at').eq('id', pid).maybeSingle());
    if (!pr || pr.archived_at) throw new Fail('اختر برنامجًا فعالًا');
    row.program_id = pid;
  }
  const programId = row.program_id || prev?.program_id;
  // النسخة: كل دفعة مثبتة على نسخة من برنامجها، ولا تُحفظ دفعة «تتبع آخر تعديل» (ترحيل 20261116110000).
  // الدفعة الجديدة وتغيير البرنامج: النسخة المسماة من البرنامج، وإلا أحدث نسخه، وبرنامج بلا نسخة تُنشأ نسخته الأولى من
  // حاله الآن بعد أن تمر الحراس (pinNew). الدفعة القائمة على برنامجها نفسه لا تتغير نسختها من هنا أبدًا: الانتقال إلى
  // نسخة أخرى (أو تثبيت غير المثبتة على نسخة قائمة) بالترقية وحدها (cohortUpgrade)، بمعاينة من له تقدم فيما يختفي وما يُسقط
  // من الجدول ووضع المراحل والتنفيذ. ما يرسله المحرر مع كل حفظ (نسختها نفسها، أو الفارغ لغير المثبتة) لا يغيّر شيئًا،
  // إلا غير المثبتة على برنامج بلا نسخة: تُنشأ نسخته الأولى من حاله الآن، وهو ما يمر به أعضاؤها بالضبط فلا فرق يُراجع.
  // وإن تعذّرت تلك النسخة (برنامج بلا متطلبات أو بقاعدة كاسرة) يُحفظ الباقي وتبقى غير مثبتة، فلا يقف تعديل لا صلة له
  const programChanged = !!(prev && row.program_id && row.program_id !== prev.program_id);
  const askedVersion = 'program_version_id' in b ? b.program_version_id : undefined;
  const asked = isUuid(askedVersion) ? String(askedVersion) : askedVersion === 'latest' ? 'latest' : askedVersion == null || askedVersion === '' ? '' : 'bad';
  let pinNew = false;
  const pinTo = async (strict: boolean) => {
    const latest = await latestVersion(programId);
    if (latest) { row.program_version_id = latest.id; return; }
    const block = versionBlock(await liveRows(programId));
    if (block && strict) throw new Fail(block.code === 'program_empty' ? 'البرنامج بلا متطلبات بعد، فلا نسخة تُثبَّت عليها الدفعة. ابنِ رحلته أولًا.' : block.msg, 400, block.code);
    // الحراس والتعريف يقرؤون البرنامج كما هو، وهو ما تُكتب منه النسخة 1 بعدها
    if (!block) { row.program_version_id = null; pinNew = true; }
  };
  if (!prev || programChanged) {
    if (isUuid(asked)) {
      const { data } = await db.from('program_versions').select('id').eq('id', asked).eq('program_id', programId).maybeSingle();
      if (!data) throw new Fail('النسخة لا تخص هذا البرنامج');
      row.program_version_id = data.id;
    } else await pinTo(true);
  } else if (askedVersion !== undefined) {
    if (prev.program_version_id) {
      const same = asked === prev.program_version_id || (asked === 'latest' && (await latestVersion(programId))?.id === prev.program_version_id);
      if (asked === '' || asked === 'bad') throw new Fail('الدفعة مثبتة على نسخة من برنامجها ولا يُلغى تثبيتها. لتغيير ما يمر به أعضاؤها رقِّها إلى نسخة أحدث.', 400, 'version_required');
      if (!same) throw new Fail('نسخة الدفعة تتغير بالترقية من ملفها، بعد معاينة ما يتغير على أعضائها.', 400, 'use_upgrade');
    } else if (asked === '' || asked === 'latest') {
      if (await latestVersion(programId)) {
        if (asked === 'latest') throw new Fail('الدفعة غير مثبتة: ثبّتها من ملفها بعد معاينة الفرق بين ما تمر به الآن والنسخة.', 400, 'use_upgrade');
      } else await pinTo(false);
    } else throw new Fail('الدفعة غير مثبتة: ثبّتها من ملفها بعد معاينة الفرق بين ما تمر به الآن والنسخة.', 400, 'use_upgrade');
  }
  if ('starts_on' in b) row.starts_on = day(b.starts_on);
  if ('ends_on' in b) row.ends_on = day(b.ends_on);
  const s = row.starts_on ?? prev?.starts_on, e = row.ends_on ?? prev?.ends_on;
  if (s && e && e < s) throw new Fail('تاريخ النهاية قبل البداية');
  if ('capacity' in b) row.capacity = b.capacity === '' || b.capacity == null ? null : Math.max(0, Math.min(30000, Math.round(Number(b.capacity)) || 0));
  if ('status' in b) {
    if (!STATUSES.includes(b.status)) throw new Fail('حالة غير معروفة');
    if (prev?.is_default && b.status === 'closed') throw new Fail('الدفعة المفتوحة لا تُغلق؛ هي ملاذ من ليس له دفعة');
    row.status = b.status;
  }
  if ('notes_ar' in b) row.notes_ar = String(b.notes_ar || '').trim().slice(0, 2000) || null;
  // تعريف الدفعة بعد هذا الحفظ (برنامجها ونسختها)، يُقرأ مرة لما يحتاجه: التنفيذ والجدول ووضع المراحل
  const vidAfter = 'program_version_id' in row ? row.program_version_id : prev?.program_version_id;
  let defAfter: any = null;
  const def = async () => (defAfter ||= await defOf(vidAfter, programId));
  if ('delivery' in b) {
    try { row.delivery = cleanDelivery(b.delivery, (await def()).requirements || []); }
    catch (err) { throw new Fail((err as Error).message); }
  }
  // خطة المراحل كاتبها الوحيد تبويب «الرحلة» (admin.cohort-plan، القرار 23): الحفظ من هنا كان يمحو ما لا يعرفه من الخطة
  // (الفجوة 6أ)، فيُرفض برسالة تدل على التبويب بدل أن يُتجاهل بصمت
  if ('schedule' in b || 'distribute' in b) {
    throw new Fail('مواعيد المراحل ومددها تُضبط من تبويب «الرحلة» في ملف الدفعة، بمعاينة أثرها قبل الحفظ. لم يُحفظ شيء.', 400, 'use_cohort_plan');
  }
  // نمط المجموعة: تجانس المستوى ونمط المشروع، ونمط العمل لكل مرحلة
  try { Object.assign(row, cleanGroupSettings(b)); }
  catch (err) { throw new Fail((err as Error).message); }
  if ((row.level_mode ?? prev?.level_mode) === 'uniform' && !(row.content_level !== undefined ? row.content_level : prev?.content_level)) {
    throw new Fail('اختر مستوى المحتوى للدفعة المتجانسة');
  }
  if ('stage_modes' in b) {
    row.stage_modes = cleanStageModes(b.stage_modes, ((await def()).stages || []).map((x: any) => x.key));
  }
  // فريق خبراء الدفعة: خبراء معتمدون يُعرضون على مشاركيها أولًا. المستشار الأساسي يبقى في advisor_expert_id وحده
  let team: string[] | null = null;
  if ('team_expert_ids' in b) {
    try { team = cleanTeamIds(b.team_expert_ids, isUuid); }
    catch (err) { throw new Fail((err as Error).message); }
    if (team.length) {
      const ok = ((must(await db.from('experts').select('id, status, roles').in('id', team)) as any[]) || []).filter(journeyApproved);
      if (ok.length !== team.length) throw new Fail('في فريق الدفعة خبير لا يخدم في الرحلة (غير معتمد، أو عضو لجنة بلا دور). اختر من خبراء الرحلة المعتمدين');
    }
  }
  await guardLive(b, row, prev, programId);
  let versionCreated: any = null;
  if (pinNew) {
    // حفظان متزامنان على برنامج بلا نسخة: الثاني يُثبَّت على النسخة التي أنشأها الأول، لا يرد بخطأ ولا يكرر لقطتها
    const v = await snapshotVersion(a, programId, 'النسخة 1', { reuse: true });
    if (!v.reused) {
      versionCreated = v;
      await audit('admin', a.email, 'program.version', 'program_versions', v.id, null, { number: v.number, label: v.label, auto: 'cohort.pin' });
    }
    row.program_version_id = v.id;
  }
  row.updated_at = new Date().toISOString();
  // نسخة أُنشئت لهذا الحفظ ثم رُفض حفظ الدفعة نفسه: تُحذف فلا تبقى نسخة بلا سبب (لم تُثبَّت عليها دفعة بعد)
  const writeCohort = async (q: any, msg?: string) => {
    const res = await q;
    if (res.error && versionCreated) {
      await db.from('program_versions').delete().eq('id', versionCreated.id).then(() => {}, () => {});
      versionCreated = null;
    }
    return must(res, msg);
  };
  const saved: any = prev
    ? await writeCohort(db.from('cohorts').update(row).eq('id', prev.id).select(COHORT_COLS).single())
    : await writeCohort(db.from('cohorts').insert(row).select(COHORT_COLS).single(), 'تعذّر إنشاء الدفعة');
  if (team) {
    // استبدال كامل: القائمة المرسلة هي الفريق
    must(await db.from('cohort_experts').delete().eq('cohort_id', saved.id), 'تعذّر حفظ فريق الخبراء');
    if (team.length) must(await db.from('cohort_experts').insert(team.map((expert_id) => ({ cohort_id: saved.id, expert_id, added_by: a.email }))), 'تعذّر حفظ فريق الخبراء');
  }
  await audit('admin', a.email, prev ? 'cohort.save' : 'cohort.create', 'cohorts', saved.id, null, team ? { ...row, team_expert_ids: team } : row);
  // إغلاق الدفعة يحذف حسابها التجريبي ويلغي روابط تجربته (القرار 10 في تصور الحساب التجريبي). الدفعة حُفظت مغلقة قبله:
  // تعذّر الحذف لا يرد الحفظ، ويُعلن في الرد وفي السجل، والحساب الباقي لا يُفتح لدفعة مغلقة ويُحذف بإعادة ضبطه
  let demo: { removed: number; links: number } | { failed: true } | null = null;
  if (prev && prev.status !== 'closed' && saved.status === 'closed') {
    demo = await removeCohortDemo(a.email, saved.id, 'cohort-close').catch(async (e) => {
      console.error('cohort close demo cleanup:', (e as Error)?.message);
      await audit('admin', a.email, 'demo.cohort-close-failed', 'cohorts', saved.id, null, { error: String((e as Error)?.message || '').slice(0, 200) }).catch(() => {});
      return { failed: true as const };
    });
  }
  return { success: true, cohort: { ...saved, team_expert_ids: team ?? undefined }, ...(demo && ('failed' in demo || demo.removed || demo.links) ? { demo_closed: demo } : {}),
    ...(versionCreated ? { version_created: { id: versionCreated.id, number: versionCreated.number, label: versionCreated.label } } : {}) };
}

// ترقية دفعة إلى نسخة من برنامجها (أحدثها ما لم تُسمَّ version_id)، مع ما سيتغير على مشاركيها. بلا confirm معاينة:
// الفرق في المتطلبات والمراحل، وكم عضوًا له تقدم فيما يختفي، وما يُسقط من إعداد الدفعة، وما يمنع الترقية.
// بالتأكيد يمر الحارس نفسه الذي في cohortSave (الإخفاء الكاسر في النسخة الهدف)، ويُعاد ضبط التنفيذ والجدول ووضع
// المراحل على الهدف. التقدم لا يُحذف: ما أنجزه العضو من متطلب اختفى يبقى محفوظًا ويعود إن عاد المتطلب
export async function cohortUpgrade(a: Admin, b: Body) {
  const c = must(await db.from('cohorts').select('*').eq('id', String(b.id || '')).maybeSingle());
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  let toId: string | null;
  if (b.version_id != null && b.version_id !== '') {
    if (!isUuid(b.version_id)) throw new Fail('نسخة غير صالحة');
    toId = String(b.version_id);
  } else toId = (await latestVersion(c.program_id))?.id || null;
  if (!toId) throw new Fail('لا توجد نسخة محفوظة لهذا البرنامج');
  const to = must(await db.from('program_versions').select('id, number, label, data').eq('id', toId).eq('program_id', c.program_id).maybeSingle());
  if (!to) throw new Fail('النسخة لا تخص برنامج الدفعة');
  if (to.id === c.program_version_id) return { success: true, unchanged: true };
  let from;
  if (c.program_version_id) from = (await db.from('program_versions').select('data').eq('id', c.program_version_id).single()).data?.data;
  else { const live = await liveRows(c.program_id); from = programSnapshot(live.stages, live.requirements); }
  const plan = upgradePlan({ cohort: c, from, to: to.data });
  // مرحلة موقوفة لهذه الدفعة تصير محمية في النسخة الهدف (بند يحسمه النظام أو بوابة): الإيقاف يُسقط بندها من رحلة كل عضو،
  // فلا تُرقّى قبل أن يعيدها المدير من تبويب «الرحلة» بأثرها (الإعفاء أو الإعادة، القرار 12)
  const offBlocked = planUpgradeBlock({ stages: to.data?.stages || [], requirements: to.data?.requirements || [], schedule: plan.patch.schedule });
  if (offBlocked && !plan.blocked) plan.blocked = offBlocked;
  const affected = await progressOn(c, removedRequirementIds(from, to.data));
  const out = { success: true, to: { id: to.id, number: to.number, label: to.label }, diff: plan.diff, dropped: plan.dropped, affected, blocked: plan.blocked || null };
  if (b.confirm !== true) return { ...out, preview: true };
  if (plan.blocked) throw new Fail(plan.blocked, 400, 'upgrade_blocked');
  const fromN = c.program_version_id ? (await db.from('program_versions').select('number').eq('id', c.program_version_id).maybeSingle()).data?.number ?? null : null;
  must(await db.from('cohorts').update({ program_version_id: to.id, ...plan.patch, updated_at: new Date().toISOString() }).eq('id', c.id));
  await audit('admin', a.email, 'cohort.upgrade', 'cohorts', c.id, null, { from: fromN, to: to.number, affected, dropped: plan.dropped, ...(b.auto === true ? { auto: true } : {}) });
  return out;
}

// ── المسار الموجّه: ورشة في مرحلة بلا نشاط حضور (قرار المالك 2026-11-21، تصور تشغيل الدفعة القسم 4.3 البند 6) ──
// الجلسة دليل لنشاط دائمًا، فلا جلسة حرة: يُضاف إلى برنامج الدفعة نشاط «ورش إضافية» في المرحلة (config.each، optional.js)،
// وتُحفظ نسخة به وتُثبَّت الدفعة عليها. النشاط خامد حتى تُضاف له ورشة إلزامية، فلا يغيّر عدًّا في هذه الدفعة ولا في دفعة
// أخرى تُرقّى إلى النسخة لاحقًا. «البرنامج قالب» محفوظ: التغيير يمر بنسخة، ولا تُحفظ النسخة إن كان في مسودة البرنامج
// تعديل آخر لم يُحفظ (فلا يُنشر تعديل لم يُرِده المدير)، ولا إن كانت الدفعة على نسخة أقدم (فلا تُرقّى بغير معاينتها).
// طلب معاد بعد انقطاع يجد النشاط في المسودة فيكمل من حيث وقف ولا ينشئ ثانيًا.
export const EXTRA_WORKSHOPS_TITLE = 'ورش إضافية';
const NO_GUIDED_STAGES = ['profile', 'assessment'];
/** نشاط الورش الإضافية لمرحلة في رحلة الدفعة. create=false قراءة وحدها: req فارغ إن لم يكن في نسختها بعد */
export async function extraWorkshopReq(a: Admin, cohortId: string, stageKey: string, { create = false } = {}): Promise<{ req: any | null; created?: any }> {
  const c = isUuid(cohortId) ? must(await db.from('cohorts').select('*').eq('id', cohortId).maybeSingle()) as any : null;
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  const version = c.program_version_id ? must(await db.from('program_versions').select('id, number, label, data').eq('id', c.program_version_id).maybeSingle()) as any : null;
  if (!version) throw new Fail('الدفعة بلا نسخة مثبتة من برنامجها. ثبّتها من ملفها أولًا', 409, 'cohort_unpinned');
  const active = (rows: any[]) => (rows || []).filter((r: any) => r.active !== false);
  const stage = active(version.data?.stages).find((s: any) => s.key === stageKey);
  if (!stage) throw new Fail('المرحلة ليست في رحلة هذه الدفعة', 404, 'stage_missing');
  if (NO_GUIDED_STAGES.includes(stageKey)) throw new Fail('مرحلتا الملف والقياس تكملهما شاشتاهما، فلا تُضاف إليهما ورشة. أضفها في مرحلة بعدهما', 400, 'stage_gate');
  const inStage = active(version.data?.requirements).filter((r: any) => r.stage_key === stageKey && r.kind === 'workshop');
  const pinned = inStage.find(eachWorkshop);
  if (pinned) return { req: pinned };
  if (inStage.length) throw new Fail('في هذه المرحلة نشاط حضور. أضف الورشة إليه من بطاقة المرحلة', 400, 'stage_has_attendance');
  if (!create) return { req: null };
  const latest = await latestVersion(c.program_id);
  if (latest && latest.id !== version.id) throw new Fail('الدفعة على نسخة أقدم من برنامجها. رقِّها إلى أحدث نسخة من ملفها، ثم أضف الورشة', 409, 'cohort_behind');
  const live = await liveRows(c.program_id);
  let req = active(live.requirements).find((r: any) => r.stage_key === stageKey && eachWorkshop(r)) || null;
  // مسودة البرنامج تطابق نسخة الدفعة، إلا نشاط الورش الإضافية نفسه إن بقي من طلب انقطع قبل حفظ نسخته
  const d = programDiff(version.data, programSnapshot(live.stages, live.requirements));
  const extra = d.added.filter((x: any) => x.code !== req?.code);
  if (extra.length || d.removed.length || d.changed.length || d.stages.added.length || d.stages.removed.length || d.stages.changed.length) {
    throw new Fail('في رحلة البرنامج تعديلات لم تُحفظ نسخةً بعد. احفظها نسخة ورقِّ الدفعة إليها (أو تراجع عنها) من «البرامج»، ثم أضف الورشة', 409, 'program_draft');
  }
  if (!req) {
    const codes = new Set(live.requirements.map((r: any) => r.code));
    let n = 1;
    while (codes.has(`W-EXTRA-${n}`)) n += 1;
    const sort = Math.max(0, ...live.requirements.filter((r: any) => r.stage_key === stageKey).map((r: any) => Number(r.sort) || 0)) + 1;
    req = must(await db.from('stage_requirements').insert({
      program_id: c.program_id, stage_key: stageKey, code: `W-EXTRA-${n}`, title_ar: EXTRA_WORKSHOPS_TITLE, kind: 'workshop', required: true, needs_review: false, active: true, sort,
      help_ar: 'ورش يضيفها فريق البرنامج عند الحاجة. الإلزامية منها مطلوبة لإكمال المرحلة، والاختيارية لا تُحسب في تقدمك.',
      config: cleanConfig('workshop', { each: true, sessions_required: 1, verify: 'qr' }, {}),
    }).select('*').single(), 'تعذّرت إضافة نشاط الورش') as any;
    await audit('admin', a.email, 'requirement.create', 'stage_requirements', req.id, null, { code: req.code, stage_key: stageKey, auto: 'workshop.extra', cohort_id: c.id });
  }
  const after = await liveRows(c.program_id);
  const block = versionBlock(after);
  if (block) throw new Fail(block.msg, 400, block.code);
  const v = await snapshotVersion(a, c.program_id, `${EXTRA_WORKSHOPS_TITLE} في «${stage.title_ar || stageKey}»`);
  await audit('admin', a.email, 'program.version', 'program_versions', v.id, null, { number: v.number, label: v.label, auto: 'workshop.extra' });
  // النسخة الجديدة = نسخة الدفعة ومعها النشاط الخامد وحده، فالتثبيت لا يغيّر على أعضائها شيئًا ولا يُسقط من إعدادها شيئًا
  must(await db.from('cohorts').update({ program_version_id: v.id, updated_at: new Date().toISOString() }).eq('id', c.id));
  await audit('admin', a.email, 'cohort.upgrade', 'cohorts', c.id, null, { from: version.number, to: v.number, affected: 0, auto: 'workshop.extra' });
  return { req, created: { id: v.id, number: v.number, label: v.label } };
}

// كم عضوًا في الدفعة له تقدم في متطلبات تختفي من رحلته: صفوف التقدم في هذه المتطلبات وحدها، ثم العضوية بقاعدة
// pickCohort نفسها التي تحدد دفعة كل مشارك، فلا يُعد من له تقدم فيها وهو في دفعة أخرى على البرنامج نفسه
async function progressOn(c: any, requirementIds: string[]) {
  if (!requirementIds.length) return 0;
  const rows = await allFor(requirementIds, () => db.from('participant_requirements').select('participant_id, requirement_id').order('participant_id').order('requirement_id'), 'requirement_id');
  const ids = [...new Set(rows.map((r: any) => r.participant_id))] as string[];
  if (!ids.length) return 0;
  const [cohorts, people, enrollments] = await Promise.all([
    all((f, t) => db.from('cohorts').select(COHORT_COLS).order('id').range(f, t)),
    allFor(ids, () => listed(db.from('participants').select('id, organization_id')).order('id'), 'id'),
    allFor(ids, () => db.from('enrollments').select('participant_id, cohort_id, status, created_at').order('id')),
  ]);
  const byP = new Map<string, any[]>();
  for (const e of enrollments) { if (!byP.has(e.participant_id)) byP.set(e.participant_id, []); byP.get(e.participant_id)!.push(e); }
  return people.filter((p: any) => pickCohort({ enrollments: byP.get(p.id) || [], cohorts, organizationId: p.organization_id || null }).cohort?.id === c.id).length;
}

// تسجيل مشاركين في دفعة. تسجيلاتهم السابقة تُعلَّم منسحبة. التقدم يبقى داخل البرنامج نفسه (معرفات متطلباته ثابتة)،
// ويضيع بالنقل إلى دفعة على برنامج آخر، فذلك لا يمر إلا بتأكيد صريح (enrollImpact وconfirm_move).
// والنقل اليدوي يتجاوز سعة الدفعة (capacity) عمدًا: السعة تحكم الإلحاق الآلي وحده (place_participant)، وتنبّه واجهة النقل حين تمتلئ.
export async function cohortEnroll(a: Admin, b: Body) {
  const c = must(await db.from('cohorts').select('id, name, program_id, organization_id').eq('id', String(b.cohort_id || '')).maybeSingle());
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  const ids = [...new Set((Array.isArray(b.participant_ids) ? b.participant_ids : []).filter(isUuid))].slice(0, 500) as string[];
  if (!ids.length) throw new Fail('اختر مشاركًا واحدًا على الأقل');
  await refuseDemo(ids);
  // حارس النقل كما في حفظ الدفعة (P1): من له تقدم وتنقله الإلحاقة إلى دفعة على برنامج آخر يفقد رحلته، فلا يُنقل بصمت
  if (b.confirm_move !== true) {
    const [cohorts, participants, enrollments, progress] = await Promise.all([
      all((f, t) => db.from('cohorts').select(COHORT_COLS).order('id').range(f, t)),
      // counting-exempt: جهات معرّفات اختارها المدير من قائمته (listFilter) لحارس النقل، لا عدّ
      allFor(ids, () => db.from('participants').select('id, organization_id').order('id'), 'id'),
      allFor(ids, () => db.from('enrollments').select('participant_id, cohort_id, status, created_at').order('id')),
      allFor(ids, () => db.from('participant_requirements').select('participant_id').order('participant_id').order('requirement_id')),
    ]);
    const impact = enrollImpact({ participants, enrollments, progress, cohorts }, cohorts.find((x: any) => x.id === c.id) || c);
    if (impact.moved) {
      const extra = { affected: impact.moved, from: impact.from, to: impact.to };
      throw new Fail(`${moveConfirmText(extra)} أكّد النقل إن كان مقصودًا.`, 409, 'confirm_move', extra);
    }
  }
  const now = new Date().toISOString();
  must(await db.from('enrollments').update({ status: 'withdrawn', updated_at: now }).in('participant_id', ids).neq('cohort_id', c.id).neq('status', 'withdrawn'));
  must(await db.from('enrollments').upsert(ids.map((participant_id) => ({ participant_id, cohort_id: c.id, status: 'active', updated_at: now })), { onConflict: 'participant_id,cohort_id' }));
  await audit('admin', a.email, 'cohort.enroll', 'cohorts', c.id, null, { participants: ids.length });
  // سجل الإلحاق بمصدره (cohort_placements، ترحيل 20261128160000): النقل اليدوي «الإدارة». قبل الترحيل لا جدول فلا سطر
  const placed = await db.from('cohort_placements').insert(ids.map((participant_id) => ({ participant_id, cohort_id: c.id, wanted_cohort_id: c.id, organization_id: (c as any).organization_id || null, source: 'manual', outcome: 'placed', actor: a.email })));
  if (placed.error && !missingTable(placed.error)) must(placed);
  return { success: true, enrolled: ids.length };
}

// ── المعالم ──
export async function milestones(b: Body) {
  const pid = isUuid(b.program_id) ? String(b.program_id) : await defaultProgramId();
  const { data } = await db.from('program_milestones').select('*').eq('program_id', pid).order('sort');
  return { success: true, program_id: pid, milestones: data || [] };
}

export async function milestoneSave(a: Admin, b: Body) {
  const pid = isUuid(b.program_id) ? String(b.program_id) : await defaultProgramId();
  const { stages } = await liveRows(pid);
  let row: any;
  try { row = cleanMilestone(b.row || {}, stages.map((s: any) => s.key)); }
  catch (err) { throw new Fail((err as Error).message); }
  row.updated_at = new Date().toISOString();
  let saved;
  if (isUuid(b.row?.id)) {
    saved = must(await db.from('program_milestones').update(row).eq('id', b.row.id).eq('program_id', pid).select('*').single(), 'المعلم غير موجود');
  } else {
    const { data: last } = await db.from('program_milestones').select('sort').eq('program_id', pid).order('sort', { ascending: false }).limit(1);
    saved = must(await db.from('program_milestones').insert({ ...row, program_id: pid, sort: (last?.[0]?.sort || 0) + 1 }).select('*').single());
  }
  await audit('admin', a.email, 'milestone.save', 'program_milestones', saved.id, null, row);
  return { success: true, row: saved };
}

// حذف معلم له سجلات مشاركين يمحوها؛ يُعطَّل بدلًا من ذلك
export async function milestoneDelete(a: Admin, b: Body) {
  const id = String(b.id || '');
  const { count } = await db.from('participant_milestones').select('milestone_id', { count: 'exact', head: true }).eq('milestone_id', id);
  if (count) {
    must(await db.from('program_milestones').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id));
    await audit('admin', a.email, 'milestone.disable', 'program_milestones', id);
    return { success: true, disabled: true };
  }
  must(await db.from('program_milestones').delete().eq('id', id));
  await audit('admin', a.email, 'milestone.delete', 'program_milestones', id);
  return { success: true };
}

// لمشارك بعينه: اعتماد إنجاز المعلم أو إلغاؤه، أو تمديد موعده له وحده
export async function participantMilestone(a: Actor, b: Body) {
  const pid = String(b.participant_id || ''), mid = String(b.milestone_id || '');
  if (!isUuid(pid) || !isUuid(mid)) throw new Fail('بيانات ناقصة');
  const prev = (await db.from('participant_milestones').select('*').eq('participant_id', pid).eq('milestone_id', mid).maybeSingle()).data;
  const rec: Body = { participant_id: pid, milestone_id: mid, by_email: a.email, updated_at: new Date().toISOString(), note: b.note ? String(b.note).slice(0, 1000) : prev?.note || null };
  if ('done' in b) rec.done_at = b.done ? new Date().toISOString() : null;
  if ('scores' in b) rec.scores = cleanRubricScores(b.scores);
  // فارغ يلغي التمديد صراحة؛ والتاريخ بأرقام عربية يُقبل، وغير الصالح يُرفض برسالة لا يُحفظ null بصمت
  if ('due_override' in b) {
    try { rec.due_override = cleanDueOverride(b.due_override); } catch (err) { throw new Fail((err as Error).message, 400, 'bad_date'); }
  }
  must(await db.from('participant_milestones').upsert({ ...(prev || {}), ...rec }));
  await audit(a.actor || 'admin', a.email, 'milestone.participant', 'participants', pid, null, { milestone: mid, done: b.done ?? null, due_override: rec.due_override ?? null, scores: rec.scores ?? null, note: rec.note });
  return { success: true };
}

// ── نمط المجموعة ──
// مستويات المحتوى للمشارك: مستواه من القياس، أو مستوى دفعته الموحد إن كانت متجانسة
export async function contentLevelsFor(p: any, levels: Record<string, string>) {
  const { cohort } = await cohortOf(p);
  return contentLevels(levels, cohort) as Record<string, string>;
}

// مشاركو الدفعة فعلًا: من سُجّل فيها، ومن تتبعها تلقائيًا بجهته (ما لم يُسجَّل في غيرها)
export async function cohortMembers(c: any) {
  const [enr, cohorts] = await Promise.all([
    db.from('enrollments').select('participant_id, cohort_id, status, created_at'),
    db.from('cohorts').select(COHORT_COLS),
  ]);
  let ids = new Set((enr.data || []).filter((e: any) => e.cohort_id === c.id && e.status !== 'withdrawn').map((e: any) => e.participant_id));
  // counting-exempt: معرّفات تُصفّى بعد سطرين بـlisted قبل أن تُعاد
  const extra = c.organization_id ? ((await db.from('participants').select('id').eq('organization_id', c.organization_id)).data || []).map((r: any) => r.id) : [];
  const all = [...new Set([...ids, ...extra])] as string[];
  if (!all.length) return [];
  // حساب العرض ليس عضوًا في أي دفعة: لا يظهر في القاعة ولا المجموعات ولا الحضور
  const { data: ps } = await listed(db.from('participants').select('id, full_name, email, organization_id, organization_name, job_title, status').in('id', all));
  const byP = new Map<string, any[]>();
  for (const e of enr.data || []) { if (!byP.has(e.participant_id)) byP.set(e.participant_id, []); byP.get(e.participant_id)!.push(e); }
  const mine = (ps || []).filter((p: any) => pickCohort({ enrollments: byP.get(p.id) || [], cohorts: cohorts.data || [], organizationId: p.organization_id }).cohort?.id === c.id);
  const { data: pl } = await db.from('placements').select('participant_id, dimension, level, approved_at').in('participant_id', mine.map((p: any) => p.id));
  return mine.map((p: any) => {
    const a = approvalOf((pl || []).filter((x: any) => x.participant_id === p.id));
    // approved: مساره معتمد (approvalOf)، به تحصر القاعة أعضاءها فيمن تفتح له بوابة البرنامج (P1-04)
    return { id: p.id, name: p.full_name, email: p.email, status: p.status, title: p.job_title || null, org: p.organization_name || null, levels: a.levels, approved: a.approved };
  });
}

export async function cohortGroups(b: Body) {
  const c = must(await db.from('cohorts').select(COHORT_COLS).eq('id', String(b.cohort_id || '')).maybeSingle());
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  const [members, groups, links, live] = await Promise.all([
    cohortMembers(c),
    db.from('cohort_groups').select('*').eq('cohort_id', c.id).order('sort'),
    db.from('cohort_group_members').select('participant_id, group_id').eq('cohort_id', c.id),
    defOf(c.program_version_id, c.program_id).then((r: any) => r.stages || []),
  ]);
  const gOf = new Map((links.data || []).map((l: any) => [l.participant_id, l.group_id]));
  // الخبراء المعتمدون، وفريق الدفعة منهم أولًا في القائمة
  const [experts, team] = await Promise.all([
    // خبراء الرحلة المعتمدون (journeyApproved): عضو اللجنة بلا دور لا يُعرض خبيرًا للمجموعة
    db.from('experts').select('id, full_name, status, roles').in('status', ['active', 'paused']).order('full_name'),
    db.from('cohort_experts').select('expert_id').eq('cohort_id', c.id),
  ]);
  const inTeam = new Set([c.advisor_expert_id, ...((team.data || []).map((t: any) => t.expert_id))].filter(Boolean));
  const list = (experts.data || []).filter(journeyApproved).map((e: any) => ({ id: e.id, full_name: e.full_name, team: inTeam.has(e.id) }));
  return {
    success: true, cohort: c,
    // group_advisor_ready باقٍ للوحة المنشورة التي تُظهر الاختيار به؛ العمود مطبّق فهو صحيح دائمًا
    group_advisor_ready: true,
    experts: [...list.filter((e: any) => e.team), ...list.filter((e: any) => !e.team)],
    stages: (live as any[]).filter((s) => s.active !== false).sort((a, b) => a.sort - b.sort).map((s) => ({ key: s.key, title_ar: s.title_ar })),
    groups: groups.data || [],
    members: members.map((m: any) => ({ ...m, group_id: gOf.get(m.id) || null })),
  };
}

export async function cohortGroupSave(a: Admin, b: Body) {
  const c = must(await db.from('cohorts').select('id').eq('id', String(b.cohort_id || '')).maybeSingle());
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  if (b.delete && isUuid(b.id)) {
    must(await db.from('cohort_groups').delete().eq('id', b.id).eq('cohort_id', c.id));
    await audit('admin', a.email, 'group.delete', 'cohorts', c.id, null, { group: b.id });
    return { success: true };
  }
  // خبير المجموعة: خبير معتمد، أو لا أحد فيعود أعضاؤها لمستشار الدفعة. يُحفظ وحده بلا تغيير الاسم
  if (isUuid(b.id) && 'advisor_expert_id' in b && !('name' in b)) {
    const adv = b.advisor_expert_id || null;
    if (adv && !isUuid(adv)) throw new Fail('خبير غير صالح');
    if (adv) {
      const { data: e } = await db.from('experts').select('status, roles').eq('id', adv).maybeSingle();
      if (!journeyApproved(e)) throw new Fail('اختر خبيرًا معتمدًا في خدمة الرحلة لهذه المجموعة');
    }
    const up = await db.from('cohort_groups').update({ advisor_expert_id: adv }).eq('id', b.id).eq('cohort_id', c.id).select('*').maybeSingle();
    if (up.error) throw new Fail('تعذّر حفظ خبير المجموعة الآن، حاول بعد قليل', 503, 'busy');
    if (!up.data) throw new Fail('المجموعة غير موجودة', 404);
    await audit('admin', a.email, 'group.advisor', 'cohorts', c.id, null, { group: b.id, advisor_expert_id: adv });
    return { success: true, group: up.data };
  }
  const name = String(b.name || '').trim().slice(0, 80);
  if (!name) throw new Fail('اسم المجموعة مطلوب');
  const row = isUuid(b.id)
    ? must(await db.from('cohort_groups').update({ name }).eq('id', b.id).eq('cohort_id', c.id).select('*').single())
    : must(await db.from('cohort_groups').insert({ cohort_id: c.id, name, sort: ((await db.from('cohort_groups').select('id', { count: 'exact', head: true }).eq('cohort_id', c.id)).count || 0) + 1 }).select('*').single());
  await audit('admin', a.email, 'group.save', 'cohorts', c.id, null, { group: row.id, name });
  return { success: true, group: row };
}

// نقل مشارك إلى مجموعة، أو إخراجه منها (group_id فارغ)
export async function cohortGroupAssign(a: Admin, b: Body) {
  const cid = String(b.cohort_id || ''), pid = String(b.participant_id || '');
  if (!isUuid(cid) || !isUuid(pid)) throw new Fail('بيانات ناقصة');
  await refuseDemo([pid]);
  if (isUuid(b.group_id)) {
    const g = must(await db.from('cohort_groups').select('id').eq('id', b.group_id).eq('cohort_id', cid).maybeSingle());
    if (!g) throw new Fail('المجموعة لا تخص هذه الدفعة');
    must(await db.from('cohort_group_members').upsert({ cohort_id: cid, participant_id: pid, group_id: g.id }));
  } else {
    must(await db.from('cohort_group_members').delete().eq('cohort_id', cid).eq('participant_id', pid));
  }
  await audit('admin', a.email, 'group.assign', 'participants', pid, null, { cohort: cid, group: b.group_id || null });
  return { success: true };
}

// توزيع آلي: يستبدل مجموعات الدفعة بعدد جديد، متقاربة المستوى أو متنوعة
export async function cohortGroupsAuto(a: Admin, b: Body) {
  const c = must(await db.from('cohorts').select(COHORT_COLS).eq('id', String(b.cohort_id || '')).maybeSingle());
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  const n = Math.round(Number(b.count));
  if (!(n >= 1 && n <= 50)) throw new Fail('عدد المجموعات من 1 إلى 50');
  const members = await cohortMembers(c);
  if (!members.length) throw new Fail('لا مشاركين في هذه الدفعة بعد');
  const split = autoGroups(members, n, b.by === 'level' ? 'level' : 'mixed');
  must(await db.from('cohort_groups').delete().eq('cohort_id', c.id));
  const groups = must(await db.from('cohort_groups').insert(split.map((_ids, i) => ({ cohort_id: c.id, name: `المجموعة ${i + 1}`, sort: i + 1 }))).select('id, sort')) as any[];
  const bySort = new Map(groups.map((g) => [g.sort, g.id]));
  const rows = split.flatMap((ids, i) => ids.map((pid: string) => ({ cohort_id: c.id, participant_id: pid, group_id: bySort.get(i + 1) })));
  // demo-member-exempt: الأعضاء من cohortMembers (listed)، والحساب التجريبي ليس منهم
  if (rows.length) must(await db.from('cohort_group_members').insert(rows));
  await audit('admin', a.email, 'group.auto', 'cohorts', c.id, null, { count: n, by: b.by === 'level' ? 'level' : 'mixed', members: rows.length });
  return { success: true, groups: n, members: rows.length };
}

// مجموعة المشارك في دفعته الحالية واسمها وعدد أعضائها
export async function groupOf(participantId: string, cohortId: string | null) {
  if (!cohortId) return null;
  const { data: link } = await db.from('cohort_group_members').select('group_id, cohort_groups(name)').eq('cohort_id', cohortId).eq('participant_id', participantId).maybeSingle();
  if (!link) return null;
  const { count } = await db.from('cohort_group_members').select('participant_id', { count: 'exact', head: true }).eq('group_id', link.group_id);
  return { id: link.group_id, name: (link as any).cohort_groups?.name || '', members: count || 1 };
}

// دفعة جارية في البرنامج: بدأت ولم تنتهِ (يُقفل أثناءها ما يُقاس به)
// «جارية» بالتعريف الواحد (cohort-running.js، P10): الاستعلام يضيّق بالتاريخ، والحكم لـisRunning نفسه
export async function runningCohort(programId: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  let q = db.from('cohorts').select('name, status, starts_on, ends_on').lte('starts_on', today).or(`ends_on.is.null,ends_on.gte.${today}`).in('status', [...LIVE]).limit(50);
  if (programId) q = q.eq('program_id', programId);
  const { data } = await q;
  return (data || []).find((c: any) => isRunning(c, today))?.name || null;
}
