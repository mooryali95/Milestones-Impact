// ════════════════════════════════════════════════════════════════
// إجراءات الإدارة لوحدة القادة
// ════════════════════════════════════════════════════════════════
// الدخول هو نفسه دخول لوحة الإدارة: نفس توكن admin-api، يُتحقق منه في
// جدول public.api_sessions بنفس الهاش (sha256 بلا ملح) الذي تكتبه admin-api.
import { approvedMail, audit, CONFIG, reminderMail, reviewMail, BUCKET, db, Fail, must, publicDb, sendMail, storage } from './core.ts';
import { cleanConfig, cleanContentItem, curriculumFor, trackLevels, DEFAULT_MODEL, DIMENSIONS, evaluatePlacement, filterHandbookMd, handbookModulesFor, LEVELS, modelsFor, overallLevel, parseQuiz, RANKS, rankFor, trackKey, VERIFIED_KINDS } from './logic.js';
import { hostOf, mePayload, pointsOf } from './participant.ts';
import { cleanProfile, issueOnCompletion } from './certificates.ts';
import { defaultProgramId } from './programs.ts';

type Body = Record<string, any>;
export type Admin = { email: string; role: 'super_admin' | 'admin' | 'viewer'; method?: string };

async function sha256hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function adminFromToken(token: unknown): Promise<Admin> {
  if (typeof token !== 'string' || token.length < 32) throw new Fail('جلسة الإدارة منتهية', 401, 'session');
  const { data } = await publicDb.from('api_sessions').select('meta, expires_at')
    .eq('token_hash', await sha256hex(token)).eq('kind', 'admin').limit(1);
  const s = data?.[0];
  if (!s || new Date(s.expires_at).getTime() < Date.now()) throw new Fail('جلسة الإدارة منتهية', 401, 'session');
  return { email: String(s.meta?.email || ''), role: s.meta?.role, method: s.meta?.method };
}

const canWrite = (a: Admin) => a.role === 'admin' || a.role === 'super_admin';
// رمز البريد وحده عامل واحد: من دخل به يقرأ، ولا يعدّل بيانات المشاركين
// حتى يدخل بمفتاح المرور أو تطبيق المصادقة
export const needsSecondFactor = (a: Admin) => canWrite(a) && a.method === 'email';
export function requireWrite(a: Admin) {
  if (!canWrite(a)) throw new Fail('صلاحيتك للعرض فقط', 403, 'forbidden');
  if (needsSecondFactor(a)) throw new Fail('التعديل يتطلب الدخول بمفتاح المرور أو تطبيق المصادقة. فعّل أحدهما من الإعدادات ثم ادخل به', 403, 'mfa_required');
}
export const writer = <T>(a: Admin, fn: (a: Admin, b: Body) => Promise<T>, b: Body) => { requireWrite(a); return fn(a, b); };

// ── الجهات ──
// ترتيب الحالة في القمع: سجّل، أكمل الملف، أنهى القياس، اعتُمد، أنهى البرنامج
const STAGE_RANK: Record<string, number> = {
  registered: 0, profiled: 1, assessing: 1, pending_approval: 2, placed: 3, enrolled: 3, completed: 4,
};
function funnel(rows: any[]) {
  const live = rows.filter((r) => r.status in STAGE_RANK);
  const at = (n: number) => live.filter((r) => STAGE_RANK[r.status] >= n).length;
  return {
    registered: at(0), profiled: at(1), assessed: at(2), approved: at(3), completed: at(4),
    pending_approval: rows.filter((r) => r.status === 'pending_approval').length,
    withdrawn: rows.filter((r) => r.status === 'withdrawn' || r.status === 'suspended').length,
  };
}
const orgFilter = (q: any, org: unknown) => (org === 'none' ? q.is('organization_id', null) : org ? q.eq('organization_id', String(org)) : q);

export async function orgs() {
  const [{ data: list }, { data: ps }] = await Promise.all([
    db.from('organizations').select('*').order('created_at'),
    db.from('participants').select('id, status, organization_id, organization_name, last_login_at'),
  ]);
  const weekAgo = Date.now() - 7 * 864e5;
  const stats = (rows: any[]) => ({ ...funnel(rows), total: rows.length, active_week: rows.filter((r) => r.last_login_at && Date.parse(r.last_login_at) > weekAgo).length });
  const unassigned = (ps || []).filter((p: any) => !p.organization_id);
  // ما كتبه غير المربوطين في خانة الجهة، لربطهم بجهة بنقرة
  const typed: Record<string, number> = {};
  for (const p of unassigned) { const n = String(p.organization_name || '').trim(); if (n) typed[n] = (typed[n] || 0) + 1; }
  return {
    success: true,
    orgs: (list || []).map((o: any) => ({ ...o, stats: stats((ps || []).filter((p: any) => p.organization_id === o.id)) })),
    unassigned: { ...stats(unassigned), typed: Object.entries(typed).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, n]) => ({ name, n })) },
  };
}

// لوحة جهة واحدة: مشاركوها بمساراتهم وحالاتهم، وتوزيعهم على المسارات
export async function org(b: Body) {
  const id = String(b.id || '');
  const o = id === 'none' ? { id: 'none', name: 'بدون جهة' } : must(await db.from('organizations').select('*').eq('id', id).maybeSingle());
  if (!o) throw new Fail('الجهة غير موجودة', 404);
  const rows = must(await orgFilter(db.from('participants')
    .select('id, full_name, email, phone, job_title, organization_name, status, source, org_via, campaign, referrer_host, created_at, last_login_at, placements(dimension, level, approved_at)'), id)
    .order('created_at', { ascending: false }).limit(2000)) as any[] ?? [];
  const { data: tracks } = await db.from('tracks').select('key, title_ar');
  const titles = Object.fromEntries((tracks || []).map((t: any) => [t.key, t.title_ar]));
  const participants = rows.map((p: any) => {
    const lv = Object.fromEntries((p.placements || []).map((x: any) => [x.dimension, x.level]));
    const key = trackKey(lv);
    const { placements: _p, ...rest } = p;
    return { ...rest, track: key, track_title: key ? titles[key] || null : null, approved: (p.placements || []).length === 3 && p.placements.every((x: any) => x.approved_at) };
  });
  const byTrack: Record<string, number> = {};
  // من أين جاؤوا: طريقة الانتساب، والحملة، والموقع
  const byVia: Record<string, number> = {};
  const byCampaign: Record<string, number> = {};
  const bySite: Record<string, number> = {};
  for (const p of participants) {
    if (p.track) byTrack[p.track] = (byTrack[p.track] || 0) + 1;
    const v = p.org_via || 'none';
    byVia[v] = (byVia[v] || 0) + 1;
    if (p.campaign) byCampaign[p.campaign] = (byCampaign[p.campaign] || 0) + 1;
    if (p.referrer_host) bySite[p.referrer_host] = (bySite[p.referrer_host] || 0) + 1;
  }
  return { success: true, org: o, participants, funnel: funnel(participants), by_track: byTrack, by_via: byVia, by_campaign: byCampaign, by_site: bySite };
}

export async function assignOrg(a: Admin, b: Body) {
  requireWrite(a);
  const ids = (Array.isArray(b.participant_ids) ? b.participant_ids : []).map(String).slice(0, 1000);
  let target: any = null;
  if (b.organization_id) {
    target = must(await db.from('organizations').select('id, name').eq('id', String(b.organization_id)).maybeSingle());
    if (!target) throw new Fail('الجهة غير موجودة', 404);
  }
  // ربط كل من كتب اسمًا معينًا في خانة الجهة دفعة واحدة
  let q = db.from('participants').update({ organization_id: target?.id || null, org_via: target ? 'admin' : null, ...(target ? { organization_name: target.name } : {}) });
  if (b.typed_name) q = q.is('organization_id', null).eq('organization_name', String(b.typed_name));
  else if (ids.length) q = q.in('id', ids);
  else throw new Fail('لم يُحدَّد مشاركون');
  const done = must(await q.select('id')) ?? [];
  await audit('admin', a.email, 'participant.org', 'organizations', target?.id || 'none', null, { count: done.length, typed_name: b.typed_name || null });
  return { success: true, moved: done.length };
}

// ── نظرة عامة ──
export async function overview(b: Body = {}) {
  const { data } = await orgFilter(db.from('participants').select('id, status, organization_id, organization_name, org_via, created_at, last_login_at'), b.org);
  const byStatus: Record<string, number> = {};
  for (const r of data || []) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  const { count: pendingReviews } = await db.from('participant_requirements')
    .select('participant_id', { count: 'exact', head: true }).eq('status', 'submitted');
  const ids = new Set((data || []).map((r: any) => r.id));
  const { data: gridAll } = await db.from('placements').select('participant_id, dimension, level');
  const grid = (gridAll || []).filter((p: any) => ids.has(p.participant_id));
  const matrix: Record<string, Record<string, number>> = {};
  for (const d of DIMENSIONS) matrix[d] = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const p of grid) matrix[p.dimension][p.level]++;
  // أكثر المسارات مشاركين
  const lv: Record<string, Record<string, string>> = {};
  for (const p of grid) (lv[p.participant_id] ||= {})[p.dimension] = p.level;
  const byTrack: Record<string, number> = {};
  for (const x of Object.values(lv)) { const k = trackKey(x); if (k) byTrack[k] = (byTrack[k] || 0) + 1; }
  const { data: tracks } = await db.from('tracks').select('key, title_ar');
  const titles = Object.fromEntries((tracks || []).map((t: any) => [t.key, t.title_ar]));
  const top_tracks = Object.entries(byTrack).sort((a, c) => c[1] - a[1]).slice(0, 6).map(([key, n]) => ({ key, n, title: titles[key] || null }));
  const rows = data || [];
  const weekAgo = Date.now() - 7 * 864e5;
  // المستوى العام الواحد لكل مشارك اكتملت أطره الثلاثة
  const overall: Record<string, number> = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const x of Object.values(lv)) { if (Object.keys(x).length === DIMENSIONS.length) { const o = overallLevel(x); if (o) overall[o]++; } }
  // الجهات ومصادر الانتساب
  const orgN: Record<string, { name: string; n: number }> = {};
  const via: Record<string, number> = {};
  for (const r of rows) {
    if (r.organization_id) (orgN[r.organization_id] ||= { name: r.organization_name || '', n: 0 }).n++;
    const v = r.organization_id ? (r.org_via || 'none') : 'unassigned';
    via[v] = (via[v] || 0) + 1;
  }
  const top_orgs = Object.entries(orgN).sort((a, c) => c[1].n - a[1].n).slice(0, 6).map(([id, o]) => ({ id, ...o }));
  return {
    success: true, total: rows.length, by_status: byStatus, pending_reviews: pendingReviews ?? 0, matrix,
    funnel: funnel(rows), top_tracks, tracks_used: Object.keys(byTrack).length,
    new_week: rows.filter((r: any) => Date.parse(r.created_at) > weekAgo).length,
    active_week: rows.filter((r: any) => r.last_login_at && Date.parse(r.last_login_at) > weekAgo).length,
    overall, top_orgs, orgs_count: Object.keys(orgN).length, via,
    ...(await overviewMore([...ids] as string[])),
  };
}

// القياس والكتاب والنماذج لمجموعة مشاركين
async function overviewMore(ids: string[]) {
  const set = new Set(ids);
  const [as, prog, subs, ledger] = await Promise.all([
    db.from('assessments').select('id, participant_id, instruments(key, kind, title_ar, active), assessment_results(dimension, composite_pct)').eq('status', 'submitted'),
    db.from('handbook_progress').select('participant_id, quiz_score, quiz_total'),
    db.from('model_submissions').select('participant_id, status, rating'),
    db.from('points_ledger').select('participant_id, points'),
  ]);
  const mine = (r: any) => set.has(r.participant_id);
  // القياس: لكل أداة عدد من أنهوها ومتوسط النسبة المركبة لكل إطار
  const inst: Record<string, any> = {};
  for (const a of ((as.data || []) as any[]).filter(mine)) {
    const k = a.instruments?.key || '?';
    const x = (inst[k] ||= { key: k, kind: a.instruments?.kind, title: a.instruments?.title_ar, active: !!a.instruments?.active, n: 0, sum: {}, cnt: {} });
    x.n++;
    for (const r of a.assessment_results || []) if (r.composite_pct != null) { x.sum[r.dimension] = (x.sum[r.dimension] || 0) + Number(r.composite_pct); x.cnt[r.dimension] = (x.cnt[r.dimension] || 0) + 1; }
  }
  const instruments = Object.values(inst).map((x: any) => ({
    key: x.key, kind: x.kind, title: x.title, active: x.active, n: x.n,
    avg: Object.fromEntries(DIMENSIONS.map((d) => [d, x.cnt[d] ? Math.round(x.sum[d] / x.cnt[d]) : null])),
  }));
  // الكتاب والنماذج والنقاط
  const p = ((prog.data || []) as any[]).filter(mine);
  const s = ((subs.data || []) as any[]).filter(mine);
  const rated = s.filter((x) => x.rating);
  const pts: Record<string, number> = {};
  for (const r of ((ledger.data || []) as any[]).filter(mine)) pts[r.participant_id] = (pts[r.participant_id] || 0) + r.points;
  const ranks = Object.fromEntries(RANKS.map((r: any) => [r.title, 0]));
  for (const n of Object.values(pts)) ranks[rankFor(n).title]++;
  const totals = Object.values(pts);
  return {
    instruments,
    book: {
      readers: new Set(p.map((x) => x.participant_id)).size, chapters: p.length,
      accuracy: p.reduce((a, x) => a + x.quiz_total, 0) ? Math.round((p.reduce((a, x) => a + x.quiz_score, 0) / p.reduce((a, x) => a + x.quiz_total, 0)) * 100) : null,
      submitted: s.filter((x) => x.status !== 'draft').length, to_review: s.filter((x) => x.status === 'submitted').length,
      drafts: s.filter((x) => x.status === 'draft').length,
      rating: rated.length ? Math.round((rated.reduce((a, x) => a + x.rating, 0) / rated.length) * 10) / 10 : null,
      points_avg: totals.length ? Math.round(totals.reduce((a, n) => a + n, 0) / totals.length) : 0, ranks,
    },
  };
}

// ── المشاركون ──
export async function participants(b: Body) {
  let q = db.from('participants')
    .select('id, full_name, email, phone, job_title, organization_id, organization_name, status, created_at, last_login_at, placements(dimension, level, approved_at)')
    .order('created_at', { ascending: false }).limit(500);
  q = orgFilter(q, b.org);
  if (b.status) q = q.eq('status', String(b.status));
  if (b.search) {
    const s = String(b.search).replace(/[%,()]/g, ' ').trim();
    if (s) q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,organization_name.ilike.%${s}%`);
  }
  return { success: true, participants: must(await q) };
}

export async function participant(b: Body) {
  const p = must(await db.from('participants').select('*').eq('id', String(b.id)).maybeSingle());
  if (!p) throw new Fail('المشارك غير موجود', 404);
  const [results, reqs, views, audits] = await Promise.all([
    db.from('assessments').select('id, status, started_at, submitted_at, instruments(key, kind), assessment_results(*)')
      .eq('participant_id', p.id).order('started_at', { ascending: false }),
    db.from('participant_requirements').select('*, stage_requirements(code, title_ar, stage_key, kind)').eq('participant_id', p.id),
    db.from('handbook_views').select('viewed_at').eq('participant_id', p.id).order('viewed_at', { ascending: false }).limit(1),
    db.from('audit_log').select('*').eq('entity_id', p.id).order('created_at', { ascending: false }).limit(30),
  ]);
  const [state, { data: model }] = await Promise.all([
    mePayload(p, 'admin'),
    db.from('placement_model').select('*').eq('id', 1).maybeSingle(),
  ]);
  // تقييم كل نتيجة بالنموذج الحالي: المؤشر المركّب، والمستوى المقترح وسببه،
  // وهل الحالة حدّية. يُحسب عند العرض فيصلح للنتائج القديمة أيضًا.
  const assessments = (results.data || []).map((a: any) => ({
    ...a,
    assessment_results: (a.assessment_results || []).map((r: any) => ({
      ...r,
      evaluation: evaluatePlacement({ knowledge: r.knowledge_pct, skill: r.skill_pct, behavior: r.behavior_pct }, model || DEFAULT_MODEL),
    })),
  }));
  let cvUrl = null;
  if (p.cv_path) cvUrl = (await storage.from(BUCKET).createSignedUrl(p.cv_path, 600)).data?.signedUrl || null;
  const [pts, { data: book }, { data: subs }] = await Promise.all([
    pointsOf(p.id),
    db.from('handbook_progress').select('module_id, quiz_score, quiz_total, reflection, completed_at, handbook_modules(title_ar, dimension)').eq('participant_id', p.id),
    db.from('model_submissions').select('id, status, rating, bonus, submitted_at, updated_at, learning_models(title_ar, dimension, points)').eq('participant_id', p.id),
  ]);
  return {
    success: true, participant: p, cv_url: cvUrl, profile: state.profile, journey: state.journey, progress: state.progress,
    assessments, requirements: reqs.data || [], last_view: views.data?.[0]?.viewed_at || null,
    history: audits.data || [],
    points: pts, book: book || [], models: subs || [],
  };
}

// قائمة المراجعة: كل ما أرسله المشاركون وينتظر قرار المستشار
export async function reviews() {
  const rows = must(await db.from('participant_requirements')
    .select('participant_id, requirement_id, status, evidence_path, note, completed_at, participants(full_name, email), stage_requirements(code, title_ar, stage_key, kind)')
    .eq('status', 'submitted').limit(200)) ?? [];
  const { data: waiting } = await db.from('participants').select('id, full_name, email, organization_name, updated_at')
    .eq('status', 'pending_approval').order('updated_at', { ascending: true }).limit(200);
  return { success: true, submitted: rows, pending_approval: waiting || [] };
}

export async function evidenceUrl(b: Body) {
  const path = String(b.path || '');
  const { data } = await storage.from(BUCKET).createSignedUrl(path, 600);
  if (!data) throw new Fail('الملف غير موجود', 404);
  return { success: true, url: data.signedUrl };
}

// اعتماد المستوى: يعتمد الثلاثة دفعة واحدة، مع إمكان تعديل أي منها
export async function approve(a: Admin, b: Body) {
  requireWrite(a);
  const id = String(b.participant_id);
  const p = must(await db.from('participants').select('*').eq('id', id).maybeSingle());
  if (!p) throw new Fail('المشارك غير موجود', 404);
  const before = must(await db.from('placements').select('*').eq('participant_id', id)) ?? [];
  const levels: Record<string, string> = b.levels || {};
  const now = new Date().toISOString();
  const rows = DIMENSIONS.map((d) => {
    const old = before.find((x: any) => x.dimension === d);
    const level = levels[d] || old?.level;
    if (!LEVELS.includes(level)) throw new Fail('حدّد مستوى كل بُعد');
    const changed = old && old.level !== level;
    return {
      participant_id: id, dimension: d, level, source: changed || !old ? 'admin' : old.source,
      assessment_id: old?.assessment_id || null, decided_by: changed ? a.email : old?.decided_by || null,
      decided_at: changed ? now : old?.decided_at || now, approved_at: now, approved_by: a.email,
      admin_note: b.notes?.[d] ? String(b.notes[d]).slice(0, 500) : old?.admin_note || null,
    };
  });
  must(await db.from('placements').upsert(rows));
  await db.from('participants').update({ status: 'placed' }).eq('id', id);
  await audit('admin', a.email, 'placement.approve', 'participants', id, before, rows);
  sendMail(p.email, 'اعتُمد مستواك في برنامج القادة', approvedMail(p.full_name)).catch((e) => console.error(e));
  return { success: true };
}

export async function setStatus(a: Admin, b: Body) {
  requireWrite(a);
  const allowed = ['registered', 'profiled', 'assessing', 'pending_approval', 'placed', 'enrolled', 'completed', 'withdrawn', 'suspended'];
  if (!allowed.includes(b.status)) throw new Fail('حالة غير صالحة');
  must(await db.from('participants').update({ status: b.status }).eq('id', String(b.participant_id)));
  await audit('admin', a.email, 'participant.status', 'participants', String(b.participant_id), null, { status: b.status });
  // إنهاء البرنامج يُصدر الشهادة تلقائيًا (مرة واحدة)
  const cert = b.status === 'completed' ? await issueOnCompletion(String(b.participant_id), a.email) : null;
  return { success: true, certificate: cert };
}

// إعادة القياس: يُلغى القياس الحالي ويُفتح جديد، والمستوى المعتمد يبقى حتى يُعتمد غيره
export async function resetAssessment(a: Admin, b: Body) {
  requireWrite(a);
  const id = String(b.participant_id);
  await db.from('assessments').update({ status: 'void' }).eq('participant_id', id).neq('status', 'void');
  await db.from('placements').delete().eq('participant_id', id).is('approved_at', null);
  await db.from('participants').update({ status: 'profiled' }).eq('id', id);
  await audit('admin', a.email, 'assessment.reset', 'participants', id);
  return { success: true };
}

// مراجعة متطلب أرسله المشارك (سجل معالم، خطة تطوير…) أو تسجيل جلسة
// بريد للمشارك بقرار المراجعة؛ فشله لا يُفشل القرار نفسه
async function notifyReview(participantId: string, requirementId: string, returned: boolean, note?: unknown) {
  const [{ data: p }, { data: r }] = await Promise.all([
    db.from('participants').select('full_name, email').eq('id', participantId).single(),
    db.from('stage_requirements').select('title_ar').eq('id', requirementId).single(),
  ]);
  if (!p?.email) return;
  sendMail(p.email, returned ? 'ملاحظة من المستشار على رحلتك' : 'اعتُمد بند في رحلتك',
    reviewMail(p.full_name, r?.title_ar || 'بند في رحلتك', returned, note ? String(note) : null)).catch((e) => console.error(e));
}

export async function reviewRequirement(a: Admin, b: Body) {
  requireWrite(a);
  const status = b.status === 'done' ? 'done' : b.status === 'returned' ? 'returned' : b.status === 'pending' ? 'pending' : null;
  if (!status) throw new Fail('حالة غير صالحة');
  const now = new Date().toISOString();
  must(await db.from('participant_requirements').upsert({
    participant_id: String(b.participant_id), requirement_id: String(b.requirement_id), status,
    note: b.note ? String(b.note).slice(0, 1000) : null, reviewed_by: a.email, reviewed_at: now,
    completed_at: status === 'done' ? now : null,
  }));
  await audit('admin', a.email, 'requirement.review', 'participants', String(b.participant_id), null, { requirement: b.requirement_id, status });
  if (status !== 'pending') notifyReview(String(b.participant_id), String(b.requirement_id), status === 'returned', b.note);
  return { success: true };
}

// ── الإعدادات القابلة للتحرير: كل ما يشكّل المنهجية ──
// قائمة بيضاء بالجداول وحقولها، فلا يكتب أحد في جدول أو عمود غير مقصود.
const ENTITIES: Record<string, { table: string; key: string[]; fields: string[]; sortable?: boolean }> = {
  grid_cells:         { table: 'grid_cells', key: ['dimension', 'level'], fields: ['description_ar', 'path_title_ar'] },
  placement_model:    { table: 'placement_model', key: ['id'],
                        fields: ['w_knowledge', 'w_skill', 'w_behavior', 'min_intermediate', 'min_advanced', 'floor_intermediate', 'floor_advanced', 'borderline',
                                 'rci_reliability', 'rci_sd', 'impact_min_n', 'rater_threshold'] },
  level_rules:        { table: 'level_rules', key: ['dimension', 'level'], fields: ['min_knowledge', 'min_skill', 'min_behavior'] },
  journey_stages:     { table: 'journey_stages', key: ['program_id', 'key'], sortable: true,
                        fields: ['title_ar', 'duration_label', 'duration_days', 'description_ar', 'activities_ar', 'outcome_ar', 'phase', 'active', 'sort',
                                 'mode', 'mode_note_ar', 'builds_on_ar'] },
  stage_requirements: { table: 'stage_requirements', key: ['id'], sortable: true,
                        fields: ['program_id', 'stage_key', 'dimension', 'level', 'code', 'title_ar', 'help_ar', 'kind', 'required', 'needs_review', 'active', 'sort', 'config'] },
  questions:          { table: 'questions', key: ['id'], sortable: true,
                        fields: ['instrument_id', 'dimension', 'code', 'tier', 'text_ar', 'help_ar', 'kind', 'options', 'weight', 'active', 'sort', 'competency_ar', 'chapter_key',
                                 'anchor_code', 'retro', 'text_rater_ar'] },
  handbook_modules:   { table: 'handbook_modules', key: ['id'], sortable: true,
                        fields: ['dimension', 'chapter_key', 'title_ar', 'min_level', 'body_md', 'sort', 'reflection_ar', 'quiz_md'] },
  learning_models:    { table: 'learning_models', key: ['id'], sortable: true,
                        fields: ['dimension', 'key', 'sort', 'title_ar', 'icon', 'summary_ar', 'when_ar', 'steps_ar', 'source_ar', 'min_level', 'points', 'fields', 'active'] },
  content_items:      { table: 'content_items', key: ['id'], sortable: true,
                        fields: ['kind', 'title_ar', 'description_ar', 'url', 'minutes', 'dimension', 'min_level', 'only_level', 'track_keys', 'exclude_tracks', 'required', 'min_pct', 'sort', 'active'] },
  tracks:             { table: 'tracks', key: ['key'], sortable: true,
                        fields: ['title_ar', 'title_en', 'summary_ar', 'focus_ar', 'project_ar', 'journey_ar', 'priority_dimension'] },
  organizations:      { table: 'organizations', key: ['id'],
                        fields: ['name', 'name_en', 'logo', 'cert_cobrand', 'cert', 'short_name', 'sector', 'seats', 'color', 'invite_code', 'domains', 'contact_name', 'contact_email', 'contact_phone', 'status', 'notes'] },
  instruments:        { table: 'instruments', key: ['id'], fields: ['title_ar', 'intro_ar', 'est_minutes', 'active'] },
  dimensions:         { table: 'dimensions', key: ['key'], fields: ['title_ar', 'title_en'] },
  levels:             { table: 'levels', key: ['key'], fields: ['title_ar', 'title_en'] },
};

// حقول النموذج التعليمي: قائمة مضبوطة الأنواع، بمفاتيح ثابتة لا تتغير بتغيير العنوان
const FIELD_TYPES = new Set(['text', 'textarea', 'select', 'table']);
function cleanModelFields(input: unknown) {
  const list = Array.isArray(input) ? input : [];
  const keys = new Set<string>();
  return list.slice(0, 30).map((f: any, i: number) => {
    const type = FIELD_TYPES.has(f?.type) ? f.type : 'textarea';
    let key = String(f?.key || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || `f${i + 1}`;
    while (keys.has(key)) key += '_';
    keys.add(key);
    const label = String(f?.label || '').trim().slice(0, 200);
    if (!label) throw new Fail(`الحقل ${i + 1} بلا عنوان`);
    const out: Body = { key, label, type, hint: String(f?.hint || '').slice(0, 300), required: f?.required !== false };
    if (type === 'select') {
      out.options = (Array.isArray(f.options) ? f.options : []).map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 20);
      if (out.options.length < 2) throw new Fail(`الحقل "${label}" يحتاج خيارين على الأقل`);
    }
    if (type === 'table') {
      out.columns = (Array.isArray(f.columns) ? f.columns : []).map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 10);
      if (!out.columns.length) throw new Fail(`الجدول "${label}" يحتاج عمودًا واحدًا على الأقل`);
      out.min_rows = Math.max(1, Math.min(30, Math.round(Number(f.min_rows) || 1)));
    }
    return out;
  });
}

// ── المسارات الـ27 ──
// مسار كل مشارك من مستوياته الحالية. "مفعّل" = اعتُمدت مستوياته الثلاثة.
async function placementsByParticipant() {
  const { data } = await db.from('placements').select('participant_id, dimension, level, approved_at');
  const byP: Record<string, { levels: Record<string, string>; approved: number }> = {};
  for (const r of data || []) {
    const x = (byP[r.participant_id] ||= { levels: {}, approved: 0 });
    x.levels[r.dimension] = r.level;
    if (r.approved_at) x.approved++;
  }
  return byP;
}

async function trackStats() {
  const [byP, { data: ps }] = await Promise.all([placementsByParticipant(), db.from('participants').select('id, status')]);
  const status = Object.fromEntries((ps || []).map((p: any) => [p.id, p.status]));
  const out: Record<string, { total: number; active: number; pending: number; completed: number }> = {};
  for (const [id, x] of Object.entries(byP)) {
    const k = trackKey(x.levels);
    if (!k) continue;
    const t = (out[k] ||= { total: 0, active: 0, pending: 0, completed: 0 });
    t.total++;
    if (status[id] === 'completed') t.completed++;
    else if (x.approved === 3) t.active++;
    else t.pending++;
  }
  return out;
}

// تفصيل مسار: هويته، ومشاركوه، وكتيبه كما يراه المشارك بابًا بابًا
export async function track(b: Body) {
  const key = String(b.key || '');
  if (!/^M[1-3]I[1-3]L[1-3]$/.test(key)) throw new Fail('رمز مسار غير صالح');
  const levels = Object.fromEntries(DIMENSIONS.map((d, i) => [d, LEVELS[Number(key[i * 2 + 1]) - 1]]));
  const [t, byP, mods] = await Promise.all([
    db.from('tracks').select('*').eq('key', key).maybeSingle(),
    placementsByParticipant(),
    db.from('handbook_modules').select('*'),
  ]);
  const ids = Object.entries(byP).filter(([, x]) => trackKey(x.levels) === key).map(([id, x]) => ({ id, approved: x.approved === 3 }));
  const { data: ps } = ids.length
    ? await db.from('participants').select('id, full_name, email, organization_name, status').in('id', ids.map((x) => x.id))
    : { data: [] };
  const approved = new Set(ids.filter((x) => x.approved).map((x) => x.id));
  return {
    success: true, track: t.data || { key }, levels,
    participants: (ps || []).map((p: any) => ({ ...p, approved: approved.has(p.id) })),
    handbook: handbookModulesFor(mods.data || [], levels).map((m: any) => ({
      id: m.id, dimension: m.dimension, title: m.title_ar, min_level: m.min_level,
      md: filterHandbookMd(m.body_md, levels[m.dimension]),
    })),
  };
}

// مراحل البرنامج ومتطلباته: البرنامج المطلوب، أو الافتراضي
const PROGRAM_SCOPED = new Set(['journey_stages', 'stage_requirements']);
// منهج مسار كما يراه صاحبه: مواد البنك التي تخصه، وأبواب الكتيب
export async function curriculum(b: Body) {
  const levels = trackLevels(b.track);
  if (!levels) throw new Fail('اختر مسارًا');
  const [items, mods] = await Promise.all([
    db.from('content_items').select('*').eq('active', true),
    db.from('handbook_modules').select('id, dimension, sort, min_level, title_ar').not('body_md', 'is', null).neq('body_md', ''),
  ]);
  return {
    success: true, track: b.track,
    items: curriculumFor(items.data || [], levels),
    chapters: handbookModulesFor((mods.data || []).map((m: any) => ({ ...m, body_md: '1' })), levels).map((m: any) => ({ id: m.id, dimension: m.dimension, title: m.title_ar })),
  };
}

export async function catalog(b: Body = {}) {
  const programId = /^[0-9a-f-]{36}$/.test(String(b.program_id || '')) ? String(b.program_id) : await defaultProgramId();
  const names = Object.keys(ENTITIES);
  const res = await Promise.all(names.map((n) => {
    const e = ENTITIES[n];
    let q = db.from(e.table).select('*');
    if (PROGRAM_SCOPED.has(n)) q = q.eq('program_id', programId);
    return e.sortable ? q.order('sort') : q;
  }));
  const out: Body = { success: true, program_id: programId };
  names.forEach((n, i) => { out[n] = res[i].data || []; });
  // أي أداة لها إجابات مُرسلة؟ تعديل أسئلتها يتطلب إصدارًا جديدًا
  const { data: used } = await db.from('assessments').select('instrument_id').eq('status', 'submitted');
  out.locked_instruments = [...new Set((used || []).map((u: any) => u.instrument_id))];
  out.track_stats = await trackStats();
  out.book_stats = await bookStats();
  return out;
}

// ── الكتاب والنماذج: التتبع والتقييم ──
// لكل باب: كم أتمّه ومتوسط نتيجة اختباره. لكل نموذج: المسودات والمسلّم والمقيّم ومتوسط التقييم.
async function bookStats() {
  const [{ data: prog }, { data: subs }, { data: pts }] = await Promise.all([
    db.from('handbook_progress').select('module_id, quiz_score, quiz_total'),
    db.from('model_submissions').select('model_id, status, rating'),
    db.from('points_ledger').select('participant_id, points'),
  ]);
  const chapters: Record<string, { done: number; score: number; total: number }> = {};
  for (const r of prog || []) {
    const c = (chapters[r.module_id] ||= { done: 0, score: 0, total: 0 });
    c.done++; c.score += r.quiz_score; c.total += r.quiz_total;
  }
  const models: Record<string, { draft: number; submitted: number; reviewed: number; returned: number; rated: number; rating: number }> = {};
  for (const r of subs || []) {
    const m = (models[r.model_id] ||= { draft: 0, submitted: 0, reviewed: 0, returned: 0, rated: 0, rating: 0 });
    m[r.status as 'draft']++;
    if (r.rating) { m.rated++; m.rating += r.rating; }
  }
  const per: Record<string, number> = {};
  for (const r of pts || []) per[r.participant_id] = (per[r.participant_id] || 0) + r.points;
  const totals = Object.values(per);
  return {
    chapters, models,
    readers: totals.length,
    points: { participants: totals.length, total: totals.reduce((a, n) => a + n, 0), avg: totals.length ? Math.round(totals.reduce((a, n) => a + n, 0) / totals.length) : 0 },
    to_review: (subs || []).filter((r: any) => r.status === 'submitted').length,
  };
}

// الكتاب والنماذج كما يراها مشارك في مسار معين، مع الإجابات الصحيحة للإدارة
export async function bookPreview(b: Body) {
  const key = String(b.track || '');
  if (!/^M[1-3]I[1-3]L[1-3]$/.test(key)) throw new Fail('رمز مسار غير صالح');
  const levels = Object.fromEntries(DIMENSIONS.map((d, i) => [d, LEVELS[Number(key[i * 2 + 1]) - 1]]));
  const [t, mods, models] = await Promise.all([
    db.from('tracks').select('*').eq('key', key).maybeSingle(),
    db.from('handbook_modules').select('*'),
    db.from('learning_models').select('*'),
  ]);
  return {
    success: true, track: t.data || { key }, levels,
    chapters: handbookModulesFor(mods.data || [], levels).map((m: any) => ({
      id: m.id, dimension: m.dimension, title: m.title_ar, min_level: m.min_level,
      md: filterHandbookMd(m.body_md, levels[m.dimension]), reflection: m.reflection_ar || '', quiz: parseQuiz(m.quiz_md),
    })),
    models: modelsFor(models.data || [], levels),
  };
}

export async function submissions(b: Body) {
  let q = db.from('model_submissions')
    .select('id, status, rating, bonus, submitted_at, reviewed_at, updated_at, model_id, participant_id, participants(full_name, email, organization_name), learning_models(title_ar, dimension, points)')
    .neq('status', 'draft').order('submitted_at', { ascending: false }).limit(500);
  if (b.status) q = q.eq('status', String(b.status));
  if (b.model_id) q = q.eq('model_id', String(b.model_id));
  return { success: true, submissions: must(await q) ?? [] };
}

export async function submission(b: Body) {
  const s = must(await db.from('model_submissions')
    .select('*, participants(id, full_name, email, organization_name, job_title), learning_models(*)').eq('id', String(b.id)).maybeSingle());
  if (!s) throw new Fail('التسليم غير موجود', 404);
  return { success: true, submission: s };
}

// تقييم المستشار: يُعتمد التسليم أو يُعاد للتعديل، ومعه تقييم وملاحظات ونقاط تميّز اختيارية
export async function reviewSubmission(a: Admin, b: Body) {
  requireWrite(a);
  const status = b.status === 'returned' ? 'returned' : 'reviewed';
  const rating = b.rating ? Math.max(1, Math.min(5, Math.round(Number(b.rating)))) : null;
  const bonus = Math.max(0, Math.min(100, Math.round(Number(b.bonus) || 0)));
  const s = must(await db.from('model_submissions').update({
    status, rating, bonus, feedback_ar: String(b.feedback || '').slice(0, 4000) || null,
    reviewed_at: new Date().toISOString(), reviewed_by: a.email,
  }).eq('id', String(b.id)).select('id, participant_id, learning_models(title_ar)').single()) as any;
  if (status === 'reviewed' && bonus) {
    await db.from('points_ledger').upsert({ participant_id: s.participant_id, source: 'review', ref_id: s.id, points: bonus, note: `تميّز: ${s.learning_models?.title_ar || ''}` },
      { onConflict: 'participant_id,source,ref_id' });
  }
  await audit('admin', a.email, 'submission.review', 'model_submissions', s.id, null, { status, rating, bonus });
  const { data: who } = await db.from('participants').select('full_name, email').eq('id', s.participant_id).single();
  if (who?.email) {
    sendMail(who.email, status === 'returned' ? 'ملاحظة على نموذجك' : 'اعتُمد نموذجك',
      reviewMail(who.full_name, s.learning_models?.title_ar || 'النموذج التعليمي', status === 'returned', b.feedback)).catch((e) => console.error(e));
  }
  return { success: true };
}

async function instrumentLocked(instrumentId: string) {
  const { count } = await db.from('assessments').select('id', { count: 'exact', head: true })
    .eq('instrument_id', instrumentId).eq('status', 'submitted');
  return (count ?? 0) > 0;
}

// تغيير الدرجات أو الخيارات أو الحذف في أداة استُخدمت يُفسد نتائج من سبق.
// تعديل الصياغة والترتيب مسموح، وما عداه يحتاج إصدارًا جديدًا.
const SAFE_QUESTION_FIELDS = new Set(['text_ar', 'help_ar', 'sort', 'text_rater_ar']);

export async function save(a: Admin, b: Body) {
  requireWrite(a);
  const e = ENTITIES[b.entity];
  if (!e) throw new Fail('نوع غير معروف');
  const row: Body = {};
  for (const f of e.fields) if (b.row && f in b.row) row[f] = b.row[f];
  const isNew = e.key.some((k) => !b.row?.[k]) && e.key[0] === 'id';
  // المرحلة والمتطلب داخل برنامج؛ الافتراضي إن لم يُحدَّد
  if (PROGRAM_SCOPED.has(b.entity) && (isNew || b.entity === 'journey_stages') && !b.row?.program_id) {
    b.row = { ...b.row, program_id: await defaultProgramId() };
    if (isNew) row.program_id = b.row.program_id;
  }

  if (b.entity === 'questions') {
    if (row.options && (!Array.isArray(row.options) || row.options.length < 2
      || row.options.some((o: any) => !o?.label || !Number.isFinite(Number(o.score))))) {
      throw new Fail('كل سؤال يحتاج خيارين على الأقل، لكل منهما نص ودرجة');
    }
    const instrumentId = row.instrument_id || (isNew ? null : (await db.from('questions').select('instrument_id').eq('id', b.row.id).single()).data?.instrument_id);
    if (instrumentId && await instrumentLocked(instrumentId)) {
      const unsafe = isNew || Object.keys(row).some((k) => !SAFE_QUESTION_FIELDS.has(k));
      if (unsafe) throw new Fail('هذه الأداة لها نتائج سابقة. أنشئ إصدارًا جديدًا لتعديل الخيارات أو الدرجات أو إضافة أسئلة', 409, 'locked');
    }
  }

  if (b.entity === 'organizations') {
    if ('invite_code' in row || isNew) {
      const code = String(row.invite_code || '').trim().toLowerCase() || crypto.randomUUID().slice(0, 8);
      if (!/^[a-z0-9-]{4,40}$/.test(code)) throw new Fail('رمز الدعوة: أحرف إنجليزية صغيرة وأرقام وشرطة، من 4 إلى 40');
      row.invite_code = code;
    }
    if (isNew && !String(row.name || '').trim()) throw new Fail('اسم الجهة مطلوب');
    // تخصيص شهادة الجهة: ما لا يُذكر يُورث من الإعداد العام
    if ('cert' in row) row.cert = cleanProfile(row.cert && typeof row.cert === 'object' ? row.cert : {}, true);
    if ('domains' in row) {
      // يقبل الروابط الكاملة أو النطاقات، مفصولة بفواصل أو أسطر
      const raw = Array.isArray(row.domains) ? row.domains : String(row.domains || '').split(/[\s,،]+/);
      const list = [...new Set(raw.map((d: unknown) => String(d || '').trim()).filter(Boolean).map((d: string) => {
        const h = hostOf(d);
        if (!h) throw new Fail(`نطاق غير صحيح: ${d}`);
        return h;
      }))].slice(0, 20) as string[];
      if (list.length) {
        const { data: taken } = await db.from('organizations').select('id, name, domains').overlaps('domains', list);
        const clash = (taken || []).find((o: any) => o.id !== b.row.id);
        if (clash) throw new Fail(`النطاق ${list.find((d) => clash.domains.includes(d))} مرتبط بجهة ${clash.name}`);
      }
      row.domains = list;
    }
  }

  // إعداد النشاط الموثق: حقول مضبوطة بحسب النوع، مع حفظ توفر الاتصال الفوري
  if (b.entity === 'stage_requirements' && ('config' in row || 'kind' in row)) {
    const prev = isNew ? null : (await db.from('stage_requirements').select('kind, config').eq('id', b.row.id).maybeSingle()).data;
    const kind = row.kind || prev?.kind;
    try { row.config = cleanConfig(kind, 'config' in row ? row.config : prev?.config, prev?.config || {}); }
    catch (e) { throw new Fail((e as Error).message); }
    if (VERIFIED_KINDS.includes(kind)) row.needs_review = false;
  }

  if (b.entity === 'content_items') {
    try { Object.assign(row, cleanContentItem(row, isNew)); } catch (e) { throw new Fail((e as Error).message); }
    row.updated_at = new Date().toISOString();
  }

  if (b.entity === 'learning_models') {
    if (isNew && !row.key) row.key = `m-${Date.now().toString(36)}`;
    if ('fields' in row) row.fields = cleanModelFields(row.fields);
    if (isNew && !String(row.title_ar || '').trim()) throw new Fail('اسم النموذج مطلوب');
    row.updated_at = new Date().toISOString();
  }

  let saved;
  if (isNew) {
    saved = must(await db.from(e.table).insert(row).select('*').single(), 'تعذّر الحفظ، تأكد من عدم تكرار الرمز');
  } else {
    let q = db.from(e.table).update(row);
    for (const k of e.key) q = q.eq(k, b.row[k]);
    saved = must(await q.select('*').single(), 'تعذّر الحفظ');
  }
  await audit('admin', a.email, `${b.entity}.save`, b.entity, e.key.map((k) => saved[k]).join(':'), null, row);
  return { success: true, row: saved };
}

export async function remove(a: Admin, b: Body) {
  requireWrite(a);
  const e = ENTITIES[b.entity];
  if (!e || e.key[0] !== 'id') throw new Fail('لا يمكن حذف هذا النوع، عطّله بدل حذفه');
  if (b.entity === 'learning_models') {
    const { count } = await db.from('model_submissions').select('id', { count: 'exact', head: true }).eq('model_id', b.id);
    if (count) throw new Fail('لهذا النموذج أعمال مشاركين؛ أوقفه بدل حذفه حتى لا تضيع أعمالهم', 409);
  }
  if (b.entity === 'content_items') {
    const { count } = await db.from('content_progress').select('item_id', { count: 'exact', head: true }).eq('item_id', b.id);
    if (count) throw new Fail('لهذه المادة تقدم مشاركين؛ أوقفها بدل حذفها حتى لا يضيع', 409);
  }
  if (b.entity === 'organizations') {
    const [{ count: ps }, { count: rs }] = await Promise.all([
      db.from('participants').select('id', { count: 'exact', head: true }).eq('organization_id', b.id),
      db.from('reports').select('id', { count: 'exact', head: true }).eq('organization_id', b.id),
    ]);
    if (ps || rs) throw new Fail(`للجهة ${ps || 0} مشارك و${rs || 0} تقرير؛ انقلهم أولًا أو أوقف الجهة بدل حذفها`, 409, 'org_in_use');
  }
  if (b.entity === 'questions') {
    const q = (await db.from('questions').select('instrument_id').eq('id', b.id).single()).data;
    if (q && await instrumentLocked(q.instrument_id)) throw new Fail('لا يُحذف سؤال له إجابات سابقة، عطّله بدل ذلك', 409, 'locked');
  }
  const { error } = await db.from(e.table).delete().eq('id', b.id);
  if (error) throw new Fail('لا يمكن حذفه لارتباطه ببيانات مشاركين، عطّله بدل ذلك', 409);
  await audit('admin', a.email, `${b.entity}.delete`, b.entity, String(b.id));
  return { success: true };
}

export async function reorder(a: Admin, b: Body) {
  requireWrite(a);
  const e = ENTITIES[b.entity];
  if (!e?.sortable || !Array.isArray(b.ids)) throw new Fail('ترتيب غير صالح');
  // المراحل تتكرر مفاتيحها بين البرامج، فيُرتَّب داخل برنامج واحد
  const programId = b.entity === 'journey_stages' ? (/^[0-9a-f-]{36}$/.test(String(b.program_id || '')) ? String(b.program_id) : await defaultProgramId()) : null;
  await Promise.all(b.ids.map((id: string, i: number) => {
    let q = db.from(e.table).update({ sort: i + 1 }).eq(e.key[programId ? 1 : 0], id);
    if (programId) q = q.eq('program_id', programId);
    return q;
  }));
  await audit('admin', a.email, `${b.entity}.reorder`, b.entity, null, null, b.ids);
  return { success: true };
}

// إصدار جديد من أداة القياس: نسخة كاملة من الأسئلة تصبح هي الفعالة
export async function cloneInstrument(a: Admin, b: Body) {
  requireWrite(a);
  const src = must(await db.from('instruments').select('*').eq('id', String(b.id)).single());
  const base = src.key.replace(/-v\d+$/, '');
  const version = (src.version || 1) + 1;
  const copy = must(await db.from('instruments').insert({
    key: `${base}-v${version}`, title_ar: src.title_ar, kind: src.kind, intro_ar: src.intro_ar,
    est_minutes: src.est_minutes, version, active: false,
  }).select('*').single(), 'يوجد إصدار بهذا الرقم');
  const qs = must(await db.from('questions').select('*').eq('instrument_id', src.id)) ?? [];
  if (qs.length) {
    must(await db.from('questions').insert(qs.map(({ id: _id, instrument_id: _i, ...q }: any) => ({ ...q, instrument_id: copy.id }))));
  }
  await audit('admin', a.email, 'instrument.clone', 'instruments', copy.id, null, { from: src.key });
  return { success: true, instrument: copy };
}

export async function activateInstrument(a: Admin, b: Body) {
  requireWrite(a);
  const inst = must(await db.from('instruments').select('*').eq('id', String(b.id)).single());
  await db.from('instruments').update({ active: false }).eq('kind', inst.kind).neq('id', inst.id);
  await db.from('instruments').update({ active: true }).eq('id', inst.id);
  await audit('admin', a.email, 'instrument.activate', 'instruments', inst.id);
  return { success: true };
}

// إضافة مشارك يدويًا (ترشيح جهة، أو تحويل طلب تواصل)
export async function createParticipant(a: Admin, b: Body) {
  requireWrite(a);
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Fail('البريد غير صحيح');
  const name = String(b.full_name || '').trim();
  if (name.length < 3) throw new Fail('الاسم مطلوب');
  const row = must(await db.from('participants').insert({
    email, full_name: name.slice(0, 120), organization_name: b.organization_name || null, job_title: b.job_title || null,
    source: b.contact_request_id ? 'contact' : 'admin', contact_request_id: b.contact_request_id ? String(b.contact_request_id) : null,
  }).select('*').single(), 'هذا البريد مسجل من قبل');
  await audit('admin', a.email, 'participant.create', 'participants', row.id, null, row);
  return { success: true, participant: row };
}

// ── تذكير أسبوعي (يُشغّله pg_cron بسرّ LEADERS_CRON_SECRET) ──
// يُذكَّر من غاب 7 أيام وأمامه عمل: بنود أعادها المستشار، أو تسجيل لم يكتمل.
// لا يُذكَّر أحد أكثر من مرة في الأسبوع، والحد 200 رسالة في التشغيلة.
export async function reminders(b: Record<string, any>) {
  if (!CONFIG.cronSecret || b.secret !== CONFIG.cronSecret) throw new Fail('غير مصرّح', 403, 'forbidden');
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: people } = await db.from('participants')
    .select('id, full_name, email, status')
    .neq('status', 'suspended')
    .lt('last_login_at', weekAgo)
    .or(`reminded_at.is.null,reminded_at.lt.${weekAgo}`)
    .limit(200);
  let sent = 0;
  for (const p of people || []) {
    const { count } = await db.from('participant_requirements')
      .select('requirement_id', { count: 'exact', head: true }).eq('participant_id', p.id).eq('status', 'returned');
    const onboarding = ['registered', 'profiled', 'assessing'].includes(p.status) ? 1 : 0;
    const open = (count ?? 0) + onboarding;
    if (!open || !p.email) continue;
    await db.from('participants').update({ reminded_at: new Date().toISOString() }).eq('id', p.id);
    await sendMail(p.email, 'رحلتك القيادية بانتظارك', reminderMail(p.full_name, open)).catch((e) => console.error(e));
    sent += 1;
  }
  return { success: true, sent };
}
