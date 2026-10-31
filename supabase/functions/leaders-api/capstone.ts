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
import { esc, mailNote, mailShell, mailText } from '../_shared/mail.ts';
import { award, CAPSTONE_LOCKED, initiativeFor, mePayload } from './participant.ts';
import { cohortOf } from './programs.ts';
import { isEmail, normalizeEmail, overallLevel, trackKey } from './logic.js';
import {
  APPROVAL_POINTS, bindAnswers, canSubmit, capstoneChecks, capstoneModels, CHARTER_KEY, cleanRubric, costSummary, leaderComposite, MAX_REVISIONS,
  modelFields, READY_MIN, readiness, RUBRIC, rubricFor, rubricScore, SCOPE_TITLES, sectionState, STATUS_TITLES, trackProject } from './capstone.js';
import type { Admin } from './admin.ts';
import { trackingFor, trackingOf } from './tracking.ts';

type Body = Record<string, any>;

const SPONSOR_DAYS = 21;
const MODEL_COLS = 'id, key, dimension, sort, min_level, active, scopes, capstone_sort, title_ar, icon, summary_ar, points, fields';

async function levelsOf(participantId: string) {
  const pl = must(await db.from('placements').select('dimension, level, approved_at').eq('participant_id', participantId)) as any[] ?? [];
  return { levels: Object.fromEntries(pl.map((x) => [x.dimension, x.level])) as Record<string, string>, approved: pl.length === 3 && pl.every((x) => x.approved_at) };
}

// ── بناء الوثيقة من مصادرها ──
async function build(p: any) {
  const { levels, approved } = await levelsOf(p.id);
  if (!approved) throw new Fail('يُفتح مشروع التخرج بعد اعتماد مسارك', 403, 'locked');
  const scope = p.work_scope || null;
  const key = trackKey(levels);
  const [models, subs, cap, track] = await Promise.all([
    db.from('learning_models').select(MODEL_COLS).not('capstone_sort', 'is', null),
    db.from('model_submissions').select('model_id, status, rating, feedback_ar, answers, updated_at').eq('participant_id', p.id),
    db.from('capstones').select('*').eq('participant_id', p.id).maybeSingle(),
    key ? db.from('tracks').select('key, title_ar, priority_dimension').eq('key', key).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const by = Object.fromEntries((subs.data || []).map((s: any) => [s.model_id, s]));
  const all = must(models) ?? [];
  const priority = (track as any).data?.priority_dimension || null;
  const mine = capstoneModels(all, levels, scope);
  const charter = mine.find((m: any) => m.key === CHARTER_KEY);
  const charterAnswers = charter ? by[charter.id]?.answers || {} : {};
  const initiative = String(charterAnswers.title || '').trim() || null;
  const sections = mine.map((m: any) => {
    const fields = modelFields(m, levels, scope, priority);
    const sub = by[m.id];
    const answers = bindAnswers(fields, sub?.answers || {}, m.key === CHARTER_KEY ? null : initiative);
    return { model: m, fields, answers, sub, state: sectionState(m, fields, { ...sub, answers }) };
  });
  const checks = capstoneChecks({
    scope,
    models: Object.fromEntries(sections.map((s: any) => [s.model.key, { ...s.model, fields: s.fields }])),
    answers: Object.fromEntries(sections.map((s: any) => [s.model.key, s.answers])),
  });
  const ready = readiness(sections.map((s: any) => s.state), checks);
  return { levels, scope, priority, project: trackProject(all, levels, scope, priority), track: (track as any).data || null, capstone: (cap as any).data || null, sections, checks, readiness: ready, initiative, charter: charterAnswers };
}

const sectionView = (s: any) => ({
  id: s.model.id, key: s.model.key, title: s.model.title_ar, icon: s.model.icon || '◆', dimension: s.model.dimension, points: s.model.points,
  complete: s.state.complete, missing: s.state.missing.length, status: s.state.status, rating: s.state.rating,
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

// ── المشارك ──
export async function get(p: any) {
  const d = await build(p);
  const c = d.capstone;
  const status = c?.status || 'draft';
  const gate = canSubmit({ status, scope: d.scope, initiative: d.initiative, sections: d.sections.map((s: any) => ({ ...s.state, title: s.model.title_ar })), readiness: d.readiness, checks: d.checks });
  return {
    success: true,
    scope: d.scope, scope_title: d.scope ? (SCOPE_TITLES as Record<string, string>)[d.scope] : null, level: overallLevel(d.levels),
    track: d.track ? { title: d.track.title_ar, brief: d.project?.text || null, priority: d.priority } : null,
    initiative: d.initiative,
    sections: d.sections.map(sectionView),
    checks: d.checks, readiness: d.readiness, ready_min: READY_MIN,
    capstone: {
      status, status_title: (STATUS_TITLES as Record<string, string>)[status], summary: c?.summary_ar || '', revisions: c?.revisions || 0, max_revisions: MAX_REVISIONS,
      submitted_at: c?.submitted_at || null, approved_at: c?.approved_at || null,
      // الملاحظات تصل المشارك فور المراجعة، والدرجات بعد الاعتماد
      review: reviewView(c, status === 'approved'), sponsor: sponsorView(c),
    },
    can_submit: gate.ok, blocker: gate.ok ? null : gate.reason,
    rubric: rubricFor(d.levels).map((r) => ({ key: r.key, title: r.title, dimension: r.dimension, level: r.level, anchors: r.anchors })),
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
  const gate = canSubmit({ status, scope: d.scope, initiative: d.initiative, sections: d.sections.map((s: any) => ({ ...s.state, title: s.model.title_ar })), readiness: d.readiness, checks: d.checks });
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
  const d = await build(p);
  const c = d.capstone;
  const [org, { cohort }] = await Promise.all([
    p.organization_id ? db.from('organizations').select('name, logo, color').eq('id', p.organization_id).maybeSingle().then((r: any) => r.data) : null,
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
      org: org ? { name: org.name, logo: org.logo || null, color: org.color || null } : (p.organization_name ? { name: p.organization_name, logo: null, color: null } : null),
      cohort: cohort && !cohort.is_default ? cohort.name : null,
      track: d.track ? { title: d.track.title_ar, priority: d.track.priority_dimension || null } : null,
      level: overallLevel(d.levels), scope: d.scope, scope_title: d.scope ? (SCOPE_TITLES as Record<string, string>)[d.scope] : null,
      initiative: d.initiative, sponsor: d.charter.sponsor || null, start: d.charter.start || null, end: d.charter.end || null,
      readiness: d.readiness,
    },
    summary: c?.summary_ar || '',
    sections: d.sections.map((s: any) => ({
      key: s.model.key, title: s.model.title_ar, icon: s.model.icon || '◆', dimension: s.model.dimension,
      fields: s.fields.map((f: any) => ({ key: f.key, label: f.label, type: f.type, columns: f.columns || null, value: s.answers[f.key] ?? null })),
    })),
    cost: cost ? costSummary({ ...cost.model, fields: cost.fields }, cost.answers) : null,
    checks: d.checks,
    review: showReview && c?.scores ? { score: c.score, scores: c.scores, notes: c.notes || {}, note: c.review_note || null, priority: d.track?.priority_dimension || null } : null,
    sponsor: sponsorView(c),
    rubric: RUBRIC.map((r) => ({ key: r.key, title: r.title, dimension: r.dimension })),
  };
}

// المعتمدة تُعرض من لقطتها، فلا يغيّرها تعديل لاحق على نموذج أو حقل
async function recordFor(p: any, audience: 'participant' | 'admin' | 'sponsor' | 'org') {
  const { data: c } = await db.from('capstones').select('status, snapshot').eq('participant_id', p.id).maybeSingle();
  if (c?.status === 'approved' && c.snapshot) {
    const doc = c.snapshot;
    if (audience !== 'admin' && audience !== 'participant') doc.review = null;
    return doc;
  }
  return docFor(p, audience);
}

// الوثيقة المعتمدة تحمل متابعتها، فيطبع التقرير الخطة وما تحقق منها معًا
async function withTracking(doc: any, participantId: string) {
  return doc?.meta?.status === 'approved' ? { ...doc, tracking: await trackingOf(participantId) } : doc;
}

export async function doc(p: any) {
  return { success: true, doc: await withTracking(await recordFor(p, 'participant'), p.id) };
}

// ── المستشار ──
export async function adminList(b: Body) {
  let q = db.from('capstones').select('participant_id, status, readiness, revisions, submitted_at, reviewed_at, score, sponsor_status, approved_at, participants(full_name, email, organization_name, work_scope)')
    .order('submitted_at', { ascending: false, nullsFirst: false }).limit(300);
  if (b.status) q = q.eq('status', String(b.status));
  const rows = must(await q) as any[] ?? [];
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

async function participantRow(id: unknown) {
  const p = must(await db.from('participants').select('*').eq('id', String(id || '')).maybeSingle());
  if (!p) throw new Fail('المشارك غير موجود', 404);
  return p as any;
}

// نتيجة القائد بأوزانها المعتمدة: تُعرض في تقريره، ولا تظهر في الشهادة
async function leaderScore(p: any, capstoneScore: number | null) {
  const [hp, lab, reqs] = await Promise.all([
    db.from('handbook_progress').select('quiz_score, quiz_total').eq('participant_id', p.id),
    db.from('lab_attempts').select('item_id, pct').eq('participant_id', p.id).not('finished_at', 'is', null),
    mePayload(p, 'admin').catch(() => null),
  ]);
  const q = (hp.data || []).reduce((a: any, r: any) => ({ s: a.s + (r.quiz_score || 0), t: a.t + (r.quiz_total || 0) }), { s: 0, t: 0 });
  const best: Record<string, number> = {};
  for (const r of lab.data || []) best[r.item_id] = Math.max(best[r.item_id] ?? 0, Number(r.pct) || 0);
  const labs = Object.values(best);
  return leaderComposite({
    quizzes: q.t ? (q.s / q.t) * 100 : null,
    lab: labs.length ? labs.reduce((a, b) => a + b, 0) / labs.length : null,
    capstone: capstoneScore,
    participation: reqs ? (reqs as any).progress ?? null : null,
  });
}

export async function adminGet(b: Body) {
  const p = await participantRow(b.participant_id);
  const [document, state] = await Promise.all([recordFor(p, 'admin'), build(p)]);
  const c = state.capstone;
  return {
    success: true, doc: await withTracking(document, p.id),
    capstone: c ? { ...c, sponsor_token_hash: undefined, snapshot: undefined } : { status: 'draft' },
    sections: state.sections.map(sectionView), checks: state.checks, readiness: state.readiness,
    priority: state.track?.priority_dimension || null, max_revisions: MAX_REVISIONS,
    rubric: rubricFor(state.levels), leader: await leaderScore(p, c?.score != null ? Number(c.score) : null),
  };
}

function sponsorMail(sponsor: string | null, who: string, initiative: string, link: string) {
  return mailShell(`طلب تأييد مبادرة: ${initiative}`,
    mailText(`${sponsor ? `أهلًا ${esc(sponsor)}،` : 'أهلًا،'} أعدّ ${esc(who)} وثيقة مبادرة «${esc(initiative)}» مشروعًا ختاميًا في برنامج القادة من Milestone Impact، وسمّاك راعيًا لها في جهتكم.`)
    + mailText('راجعها المستشار وقبلها. نطلب تأييدك: أنها مبادرة حقيقية تخدم أولويات جهتكم، وأن خطتها واقعية. تقرأ الوثيقة كاملة من الرابط، ثم تؤيد أو تطلب تعديلًا بملاحظة.')
    + mailButton(link, 'اقرأ الوثيقة وأيّدها')
    + mailNote(`الرابط خاص بك وصالح ${SPONSOR_DAYS} يومًا.`),
    { family: 'capstone', preheader: `${who} يطلب تأييدك لمبادرة «${initiative}»`, footnote: '' });
}

async function inviteSponsor(p: any, c: any) {
  const charter = (await build(p)).charter;
  const email = normalizeEmail(charter.sponsor_email);
  if (!isEmail(email)) throw new Fail('لا بريد صحيح للراعي في بطاقة المبادرة. اعتمد دون تأييد بسبب مكتوب، أو أعدها للمشارك ليصحح البريد', 400, 'sponsor_email');
  if (c?.sponsor_invited_at && Date.now() - Date.parse(c.sponsor_invited_at) < 10 * 60e3) throw new Fail('أُرسلت الدعوة قبل قليل، أعد الإرسال بعد عشر دقائق', 429, 'rate');
  const token = randomToken();
  must(await db.from('capstones').update({
    sponsor_name: String(charter.sponsor || '').trim().slice(0, 200) || null, sponsor_email: email, sponsor_token_hash: await hash(token),
    sponsor_status: 'pending', sponsor_invited_at: new Date().toISOString(), sponsor_expires_at: new Date(Date.now() + SPONSOR_DAYS * 864e5).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('participant_id', p.id));
  const initiative = String(charter.title || '').trim() || 'المبادرة';
  await sendMail(email, `طلب تأييد مبادرة «${initiative}»`, sponsorMail(charter.sponsor || null, p.full_name || 'مشارك في برنامج القادة', initiative, `${CONFIG.appUrl}/sponsor?t=${encodeURIComponent(token)}`));
}

async function approve(p: any, by: string, waived: string | null = null) {
  const now = new Date().toISOString();
  must(await db.from('capstones').update({ status: 'approved', approved_at: now, approved_by: by, sponsor_waived: waived, updated_at: now }).eq('participant_id', p.id));
  // لقطة السجل بعد الاعتماد، بمعيار المستشار
  const snapshot = await docFor(p, 'admin');
  must(await db.from('capstones').update({ snapshot }).eq('participant_id', p.id));
  const initiative = await initiativeFor(p.id);
  await award(p.id, 'capstone', p.id, APPROVAL_POINTS, `اعتماد مشروع التخرج: ${initiative || ''}`.trim());
  sendMail(p.email, 'اعتُمدت وثيقة مبادرتك', reviewMail(p.full_name, `وثيقة مبادرة «${initiative || 'مشروع التخرج'}»`, false))
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
    sendMail(p.email, 'ملاحظات المستشار على وثيقة مبادرتك', reviewMail(p.full_name, 'وثيقة مبادرتك', true, note)).catch((e) => console.error(e));
    return adminGet({ participant_id: p.id });
  }
  if (b.decision !== 'accept') throw new Fail('قرار غير صالح');
  let rubric;
  try { rubric = cleanRubric(b.scores, b.notes); } catch (e) { throw new Fail((e as Error).message); }
  const { levels } = await levelsOf(p.id);
  const key = trackKey(levels);
  const { data: t } = key ? await db.from('tracks').select('priority_dimension').eq('key', key).maybeSingle() : { data: null };
  const score = rubricScore(rubric.scores, (t as any)?.priority_dimension || null);
  must(await db.from('capstones').update({
    status: 'accepted', scores: rubric.scores, notes: rubric.notes, review_note: note, score, reviewed_by: a.email, reviewed_at: now, updated_at: now,
  }).eq('participant_id', p.id));
  await audit('admin', a.email, 'capstone.accept', 'capstones', p.id, null, { score });
  const waive = String(b.waive_sponsor || '').trim().slice(0, 500);
  if (waive) await approve(p, a.email, waive);
  else await inviteSponsor(p, c);
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
  return c;
}

export async function sponsorGet(b: Body) {
  const c = await sponsorFrom(b.t);
  return {
    success: true, done: c.sponsor_status !== 'pending', decision: c.sponsor_status,
    sponsor: c.sponsor_name, doc: await recordFor(c.participants, 'sponsor'),
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
    sendMail(p.email, 'ملاحظات راعي مبادرتك', reviewMail(p.full_name, 'وثيقة مبادرتك (من الراعي)', true, note)).catch((e) => console.error(e));
  } else throw new Fail('قرار غير صالح');
  await audit('system', c.sponsor_email, `capstone.sponsor-${b.decision}`, 'capstones', p.id, null, {});
  return { success: true, done: true, decision: b.decision === 'endorse' ? 'endorsed' : 'declined' };
}

// ── الجهة: محفظة مبادرات الدفعة ──
// المنسق يرى عناوين مبادرات جهته وحالتها، والوثيقة كاملة بعد اعتمادها فقط
export async function orgList(orgId: string) {
  const people = must(await db.from('participants').select('id, full_name, work_scope').eq('organization_id', orgId)) as any[] ?? [];
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

export async function orgDoc(orgId: string, b: Body) {
  const p = await participantRow(b.participant_id);
  if (p.organization_id !== orgId) throw new Fail('هذا المشارك ليس من جهتك', 403);
  const { data: c } = await db.from('capstones').select('status').eq('participant_id', p.id).maybeSingle();
  if (c?.status !== 'approved') throw new Fail('تُعرض الوثيقة للجهة بعد اعتمادها', 403, 'not_approved');
  return { success: true, doc: await withTracking(await recordFor(p, 'org'), p.id) };
}
