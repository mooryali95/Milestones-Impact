// ════════════════════════════════════════════════════════════════
// ملف المشارك من مصدر واحد (المرحلة 9): للإدارة من اللوحة، وللخبير من بوابته
// ════════════════════════════════════════════════════════════════
// participantFile يبني على admin.participant نفسه (mePayload وما حوله) ويضيف ما ينقص الصفحة الواحدة:
// الدفعة والفريق، الجلسات والطلبات، طلبات الأقران، التقييم الختامي، وسطر «المطلوب منك الآن».
// الخبير يرى مشاركي الدفعات التي هو مستشارها (كامل الصلاحية: الختامي والمعالم والقاعة)، ومن أُسند
// إليه بطلب خدمة مقبول (قراءة الملف فقط). ما لا يحق له لا يُرسل أصلًا.
import { audit, db, Fail } from './core.ts';
import { awaitingFor, confirmRater } from './impact.ts';
import { participant as adminParticipant, answersReview } from './admin.ts';
import type { Actor } from './admin.ts';
import { advisorCohorts, myParticipantIds } from './advisor.ts';
import * as F from './final.ts';
import * as H from './hall.ts';
import { participantMilestone } from './programs.ts';
import { mePayload } from './participant.ts';
import { forParticipant as peerFor } from './peer.ts';
import { needsFor } from './peer.js';
import { firstName, HALL_TEAM_AR } from './hall.js';
import { overallLevel } from './logic.js';
import * as OB from './observations.ts';
import { requireVisible, visibilityOfCohort, visibilityOfParticipant } from './visibility.ts';
import { flagsOf, timelineOf } from './observations.js';
import { EXPERT_REQUEST_STATUS, expertRoleAr as roleAr, LEVEL_AR, SUBMISSION_STATUS_ADMIN } from './labels.js';

type Body = Record<string, any>;
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v || ''));

// ما يسبق الملف لكل جمهور: الفريق، وجلسات التوجيه وطلبات الخبراء، وطلبات الأقران، والتقييم الختامي
async function around(p: any, cohortId: string | null, viewer: { email: string } | null) {
  const [team, sessions, reqs, peer, fe] = await Promise.all([
    cohortId ? db.from('cohort_roles').select('team').eq('cohort_id', cohortId).eq('participant_id', p.id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('coaching_sessions').select('id, status, starts_at, ends_at, expert_id, experts(full_name)').eq('participant_id', p.id).order('starts_at', { ascending: false }).limit(50),
    db.from('expert_requests').select('id, role, dimension, status, accepted_at, created_at, experts(full_name)').eq('participant_id', p.id).order('created_at', { ascending: false }).limit(50),
    peerFor(p.id),
    F.get({ participant_id: p.id }, viewer || undefined).catch(() => null),
  ]);
  return {
    team: team.data?.team || null, team_ar: team.data?.team ? (HALL_TEAM_AR as Record<string, string>)[team.data.team] : null,
    sessions: (sessions.data || []).map((s: any) => ({ id: s.id, status: s.status, starts_at: s.starts_at, ends_at: s.ends_at, expert: s.experts?.full_name || null })),
    expert_requests: (reqs.data || []).map((r: any) => ({ id: r.id, role: r.role, role_ar: roleAr(r.role), dimension: r.dimension, status: r.status, status_ar: (EXPERT_REQUEST_STATUS as Record<string, string>)[r.status] || r.status, expert: r.experts?.full_name || null, at: r.accepted_at || r.created_at })),
    peer,
    final: fe && (fe as any).success ? { live: (fe as any).live, record: (fe as any).record, frozen: (fe as any).frozen, approval: (fe as any).approval, vote_block: (fe as any).vote_block, program: (fe as any).program, current_version: (fe as any).current_version } : null,
  };
}

// ما كان غائبًا عن الملف: وثيقة المبادرة، ودورات تقييم 360، وحضور الورش. قراءة فقط، وتعذّر جدول لا يُسقط الملف
async function moreFor(pid: string) {
  const [cap, f360, att] = await Promise.all([
    db.from('capstones').select('id, status, readiness, revisions, review_note, submitted_at, updated_at').eq('participant_id', pid).maybeSingle(),
    db.from('feedback_cycles').select('wave, status, opens_at, closes_at, released_at').eq('participant_id', pid).order('created_at'),
    db.from('workshop_attendance').select('checked_in_at, method, workshop_sessions(title_ar, starts_at)').eq('participant_id', pid).order('checked_in_at', { ascending: false }).limit(50),
  ]);
  return {
    capstone: cap.error ? null : cap.data || null,
    feedback360: f360.error ? [] : f360.data || [],
    attendance: att.error ? [] : (att.data || []).map((x: any) => ({ at: x.checked_in_at, method: x.method, title: x.workshop_sessions?.title_ar || null, starts_at: x.workshop_sessions?.starts_at || null })),
  };
}

// «عاين بعين…»: ما يصل مستشار الدفعة أو الخبير المسند عن هذا المشارك بمفاتيح الرؤية النافذة الآن. لا حساب خبير
// ولا جلسة: الحمولة تُبنى بالدالة نفسها (participantFile) ويُختصر منها ما يُرى وما حُجب، ويُسجَّل الفتح باسم المدير.
export async function adminPreviewAs(a: { email: string }, b: Body) {
  const id = String(b.participant_id || '');
  if (!isUuid(id)) throw new Fail('بيانات ناقصة');
  const advisor = b.as !== 'assigned';
  const f: any = await participantFile(id, 'expert', { advisor });
  await audit('admin', a.email, 'admin.preview-as', 'participants', id, null, { as: advisor ? 'advisor' : 'assigned' });
  const has = (v: any) => (Array.isArray(v) ? v.length > 0 : v != null && v !== '');
  return {
    success: true, as: advisor ? 'advisor' : 'assigned', name: f.participant.full_name, can: f.can,
    sees: [
      { label: 'وسائل التواصل', visible: has(f.participant.email) || has(f.participant.phone), value: f.participant.email || null },
      { label: 'المستويات ونتيجة القياس', visible: !!f.profile, value: null },
      { label: 'تعليل الإدارة لتعديل المستوى', visible: !!(f.profile?.dimensions || []).some((d: any) => d.note), value: null },
      { label: 'النماذج واختبارات الكتيب', visible: has(f.models) || has(f.book), value: null },
      { label: 'التقييم المستمر', visible: !!f.continuous, value: null },
      { label: 'التقييم الختامي', visible: !!f.final, value: f.final?.record && 'votes' in (f.final.record || {}) ? 'كاملًا' : f.final ? 'ملخصًا' : null },
      { label: 'مؤشر الجهد', visible: !!f.effort, value: null },
      { label: 'ملاحظات الملف', visible: has(f.observations), value: has(f.observations) ? `${f.observations.length}` : null },
      { label: 'ملخص الأعلام', visible: has(f.flags), value: null },
    ],
  };
}

// ملاحظة المستشار على مشارك في دفعته (xp.observation-add)
export async function observationAdd(e: any, b: Body) {
  await requireAdvisorOf(e, String(b.participant_id || ''));
  requireVisible(await visibilityOfParticipant(String(b.participant_id || '')), 'adv_observations_write');
  return OB.advisorAdd({ email: e.email }, b);
}

export async function participantFile(id: string, audience: 'admin' | 'expert', opts: { viewer?: { email: string }; advisor?: boolean } = {}) {
  const base: any = await adminParticipant({ id });
  const cohort = base.program?.cohort || null;
  const extra = await around(base.participant, cohort?.id || null, opts.viewer || null);
  const needs = needsFor({ submissions: base.models || [], milestones: base.milestones || [], final: extra.final?.record || null, peerAnswers: extra.peer.pending_answers, sessions: [] });
  const common = { ...extra, needs, cohort: cohort ? { id: cohort.id, name: cohort.name, starts_on: cohort.starts_on, ends_on: cohort.ends_on, supervision: cohort.supervision || 'peers_expert', content_release: cohort.content_release ?? null } : null };
  // ملف المشارك الكامل (تصور 2026-11-13): الملاحظات، وما لم يكن يُعرض (المبادرة و360 والحضور)، ثم ملخص الأعلام
  // والخط الزمني مشتقين مما سبق. للإدارة كاملًا، ولمستشار الدفعة بلا سجل التدقيق.
  const observations = await OB.listFor(base.participant.id);
  if (audience === 'admin') {
    const more = await moreFor(base.participant.id);
    const file = { ...base, ...common, ...more, observations };
    return { ...file, flags: flagsOf(file), timeline: timelineOf({ history: base.history || [], observations }) };
  }
  // للخبير: بلا سجل الإدارة ولا السيرة ولا حقول الحساب الداخلية. ما يراه مستشار الدفعة والخبير المسند تحسمه مفاتيح
  // الرؤية (visibility.js): الإعداد العام ثم استثناء الدفعة، لا شرط مكتوب هنا. تعليل الإدارة لتعديل المستوى لا يخرج للمسند أبدًا.
  const p = base.participant;
  const adv = !!opts.advisor;
  const vis = await visibilityOfCohort(cohort?.id || null);
  const on = (k: string) => vis[k] !== false;
  const contact = adv ? on('adv_contact') : on('asg_contact');
  const levels = adv || on('asg_levels');
  const withNotes = adv && on('adv_admin_notes');
  const work = adv || on('asg_models');
  const profile = !levels || !base.profile ? null
    : { ...base.profile, dimensions: (base.profile.dimensions || []).map((d: any) => (withNotes ? d : { ...d, note: null })) };
  const finalSummary = common.final ? { live: { score: common.final.live?.score ?? null, decision: common.final.live?.decision ?? null }, record: common.final.record ? { status: common.final.record.status } : null } : null;
  const seen = adv && on('adv_observations_read') ? observations : [];
  return {
    success: true,
    participant: { id: p.id, full_name: p.full_name, email: contact ? p.email : null, phone: contact ? p.phone : null, job_title: p.job_title, organization_name: p.organization_name, sector: p.sector, years_experience: p.years_experience, work_scope: p.work_scope || null, status: p.status, bio: p.bio || null, linkedin_url: p.linkedin_url || null },
    profile, journey: base.journey, progress: base.progress, milestones: base.milestones, milestone_summary: base.milestone_summary, group: base.group,
    continuous: adv || on('asg_continuous') ? base.continuous : null,
    program: base.program ? { id: base.program.id } : null,
    // أين توقف قبل الاعتماد لكل خبير مرتبط، ومؤشر الجهد للمستشار بمفتاحه
    onboarding: base.onboarding || null, effort: adv && on('adv_effort') ? base.effort || null : null,
    assessments: !levels ? [] : (base.assessments || []).filter((a: any) => a.status === 'submitted').map((a: any) => ({ id: a.id, kind: a.instruments?.kind, submitted_at: a.submitted_at,
      results: (a.assessment_results || []).map((r: any) => ({ dimension: r.dimension, level: r.level, composite_pct: r.composite_pct })) })),
    models: !work ? [] : (base.models || []).map((m: any) => ({ id: m.id, status: m.status, status_ar: (SUBMISSION_STATUS_ADMIN as Record<string, string>)[m.status], rating: m.rating, submitted_at: m.submitted_at, title: m.learning_models?.title_ar || '' })),
    points: base.points, book: !work ? [] : (base.book || []).map((b: any) => ({ title: b.handbook_modules?.title_ar, quiz_score: b.quiz_score, quiz_total: b.quiz_total, completed_at: b.completed_at })),
    ...common,
    final: adv ? (on('adv_final_edit') ? common.final : finalSummary) : (on('asg_final') ? finalSummary : null),
    observations: seen,
    flags: adv && on('adv_flags') ? flagsOf({ participant: p, effort: on('adv_effort') ? base.effort : null, retake: base.retake, onboarding: base.onboarding, milestone_summary: base.milestone_summary, sessions: extra.sessions, models: base.models, continuous: base.continuous, observations: seen }) : [],
    // ما يحق له فعله بمفاتيحه: الواجهة تخفي الزر، والخادم يرفض الفعل نفسه (requireVisible)
    can: { answers: adv && on('adv_answers'), observe: adv && on('adv_observations_write'), final_edit: adv && on('adv_final_edit'), hall: adv && on('adv_hall_control') },
    scope: adv ? 'advisor' : 'assigned',
  };
}

// ── نطاق الخبير ──
export async function expertScope(e: any) {
  const [adv, { data: reqs }] = await Promise.all([
    myParticipantIds(e.id),
    db.from('expert_requests').select('participant_id, role').eq('expert_id', e.id).eq('status', 'accepted'),
  ]);
  return { advisor: new Set<string>(adv), assigned: new Map<string, string>((reqs || []).map((r: any) => [r.participant_id, r.role])) };
}
async function requireAdvisorOf(e: any, participantId: string) {
  if (!isUuid(participantId)) throw new Fail('بيانات ناقصة');
  const adv = await myParticipantIds(e.id);
  if (!adv.includes(participantId)) throw new Fail('هذا المشارك ليس في دفعة أنت مستشارها', 403);
}
async function requireAdvisorCohort(e: any, cohortId: unknown) {
  const ids = (await advisorCohorts(e.id)).map((c: any) => c.id);
  if (!isUuid(cohortId) || !ids.includes(String(cohortId))) throw new Fail('هذه الدفعة لست مستشارها', 403);
}
const actorOf = (e: any): Actor => ({ email: e.email, actor: 'system' });

// قائمة مشاركي الخبير بموجز يُقرأ في لمحة؛ مصدره mePayload نفسه، على دفعات من خمسة
export async function participants(e: any) {
  const scope = await expertScope(e);
  const ids = [...new Set([...scope.advisor, ...scope.assigned.keys()])].slice(0, 60);
  if (!ids.length) return { success: true, items: [], cohorts: await advisorCohorts(e.id), raters_pending: [] };
  const { data: ps } = await db.from('participants').select('*').in('id', ids).eq('is_demo', false).order('full_name');
  const items: any[] = [];
  for (let i = 0; i < (ps || []).length; i += 5) {
    const chunk = (ps || []).slice(i, i + 5);
    const got = await Promise.all(chunk.map(async (p: any) => {
      const st: any = await mePayload(p, 'admin');
      // الخبير المسند (غير مستشار الدفعة) يرى المستوى والمؤشر المستمر بمفتاحيهما، كما في ملف المشارك (N6)
      const isAdv = scope.advisor.has(p.id);
      const vis = isAdv ? null : await visibilityOfParticipant(p.id);
      const [subs, fe, peer] = await Promise.all([
        db.from('model_submissions').select('id', { count: 'exact', head: true }).eq('participant_id', p.id).eq('status', 'submitted'),
        db.from('final_evaluations').select('status').eq('participant_id', p.id).eq('program_id', st.program?.id || '').maybeSingle(),
        db.from('peer_requests').select('id').eq('participant_id', p.id).eq('status', 'answered'),
      ]);
      const current = st.journey.find((s: any) => s.status === 'active');
      const level = vis && vis.asg_levels === false ? null : overallLevel(Object.fromEntries((st.profile?.dimensions || []).map((d: any) => [d.dimension, d.level])));
      const needs = needsFor({ submissions: Array.from({ length: subs.count || 0 }, () => ({ status: 'submitted' })), milestones: st.milestones, final: fe.data, peerAnswers: (peer.data || []).map(() => ({ status: 'pending' })) });
      return {
        id: p.id, name: p.full_name, first: firstName(p.full_name), title: p.job_title || null, org: p.organization_name || null, status: p.status,
        cohort: st.program?.cohort?.name || null, advisor: scope.advisor.has(p.id), role_ar: scope.assigned.has(p.id) ? roleAr(scope.assigned.get(p.id)!) : null,
        level, level_ar: level ? (LEVEL_AR as Record<string, string>)[level] : null, approved: !!st.profile?.approved,
        stage: current?.title_ar || null, progress: st.progress, late: st.milestone_summary?.late || 0, continuous: vis && vis.asg_continuous === false ? null : st.continuous?.index ?? null,
        needs: needs.reduce((n: number, x: any) => n + x.n, 0),
      };
    }));
    items.push(...got);
  }
  // D19: مقيّمو مشاركي المستشار بانتظار تأكيده قبل إرسال دعواتهم
  return { success: true, items, cohorts: (await advisorCohorts(e.id)).map((c: any) => ({ id: c.id, name: c.name, supervision: c.supervision })),
    raters_pending: await awaitingFor([...scope.advisor]) };
}

export async function raterConfirm(e: any, b: Body) {
  return confirmRater({ kind: 'expert', email: e.email }, b, async (pid) => (await expertScope(e)).advisor.has(pid));
}

export async function participant(e: any, b: Body) {
  const id = String(b.id || '');
  const scope = await expertScope(e);
  if (!scope.advisor.has(id) && !scope.assigned.has(id)) throw new Fail('هذا المشارك ليس من مشاركيك', 403);
  return participantFile(id, 'expert', { viewer: { email: e.email }, advisor: scope.advisor.has(id) });
}

// ── إجابات القياس من البوابة: لمستشار الدفعة فيمن يشرف عليهم (قرار المالك 2026-11-11) ──
// الدالة نفسها التي تراها الإدارة، ويُسجَّل الاطلاع باسم الخبير. الخبير المسند بطلب خدمة وحده لا يراها.
export async function assessmentAnswers(e: any, b: Body) {
  const pid = String(b.participant_id || '');
  await requireAdvisorOf(e, pid);
  requireVisible(await visibilityOfParticipant(pid), 'adv_answers');
  return answersReview(pid, b.assessment_id, { type: 'system', email: e.email, action: 'expert.answers-view' });
}

// ── الختامي والمعالم من البوابة: لمستشار الدفعة ──
// بلا مفتاح adv_final_edit يرى المستشار الدرجة والقرار وحدهما: الأصوات والتعديلات وأسماء أصحابها لا تخرج (N6)
export async function finalGet(e: any, b: Body) {
  const pid = String(b.participant_id || '');
  await requireAdvisorOf(e, pid);
  const r: any = await F.get(b, { email: e.email });
  if ((await visibilityOfParticipant(pid)).adv_final_edit !== false) return r;
  const rec = r.record ? { status: r.record.status, score: r.record.score, decision: r.record.decision, decided_at: r.record.decided_at } : null;
  return { ...r, record: rec, approval: null, vote_block: null, can_withdraw: false, read_only: true };
}
async function requireFinalEdit(e: any, b: Body) { const pid = String(b.participant_id || ''); await requireAdvisorOf(e, pid); requireVisible(await visibilityOfParticipant(pid), 'adv_final_edit'); }
export async function finalSave(e: any, b: Body) { await requireFinalEdit(e, b); return F.save(actorOf(e), b); }
export async function finalVote(e: any, b: Body) { await requireFinalEdit(e, b); return F.vote(actorOf(e), b); }
export async function milestone(e: any, b: Body) { await requireAdvisorOf(e, String(b.participant_id || '')); return participantMilestone(actorOf(e), b); }

// ── القاعة من البوابة: دفعات المستشار وحدها ──
export async function hall(e: any, b: Body) { await requireAdvisorCohort(e, b.cohort_id); return H.adminState(b); }
export async function hallOpen(e: any, b: Body) { await requireAdvisorCohort(e, b.cohort_id); requireVisible(await visibilityOfCohort(String(b.cohort_id)), 'adv_hall_control'); return H.open(actorOf(e), b); }
async function hallSessionOf(e: any, b: Body) { const s = await H.adminSession(b); await requireAdvisorCohort(e, s.cohort_id); requireVisible(await visibilityOfCohort(s.cohort_id), 'adv_hall_control'); }
export async function hallStep(e: any, b: Body) { await hallSessionOf(e, b); return H.step(actorOf(e), b); }
export async function hallSplit(e: any, b: Body) { await hallSessionOf(e, b); return H.split(actorOf(e), b); }
export async function hallAssign(e: any, b: Body) { await hallSessionOf(e, b); return H.assign(actorOf(e), b); }
export async function hallClose(e: any, b: Body) { await hallSessionOf(e, b); return H.close(actorOf(e), b); }
