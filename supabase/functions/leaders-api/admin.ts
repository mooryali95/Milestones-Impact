// ════════════════════════════════════════════════════════════════
// إجراءات الإدارة لوحدة القادة
// ════════════════════════════════════════════════════════════════
// الدخول هو نفسه دخول لوحة الإدارة: نفس توكن admin-api، يُتحقق منه في
// جدول public.api_sessions بنفس الهاش (sha256 بلا ملح) الذي تكتبه admin-api.
import { all, allFor, approvedMail, audit, CONFIG, reminderMail, retakeMail, stuckMail, reviewMail, BUCKET, db, Fail, hash, must, publicDb, sendMail, storage, secretEquals } from './core.ts';
import { pickCohort, cleanConfig, cleanContentItem, curriculumFor, trackLevels, DEFAULT_MODEL, DIMENSIONS, acquiescenceFor, evaluatePlacement, tierMaxPointsOf, filterHandbookMd, handbookModulesFor, hardcodedFacts, cleanStageRules, stageRulesIssues, itemsToFlip, strengthsLine, unknownTokens, LEVELS, lintHandbookMd, SCOPES, modelsFor, overallLevel, quizFor, RANKS, rankFor, trackKey, VERIFIED_KINDS, isEmail, normalizeEmail, normalizePhone, approvalOf, overrideNeedsReason, OVERRIDE_REASON_MIN, orgAccessState, inProgram } from './logic.js';
import { journeyFor, mePayload, pointsOf } from './participant.ts';
import { MILESTONE_GRACE_DAYS } from './milestones.js';
import { DIM_AR, expertRoleAr, RUBRIC_SCALE } from './labels.js';
import { hostOf, INVITE_CODE_RE, INVITE_CODE_RULE_AR, orgDomainIssue } from './domains.js';
import { pinSponsorFor, programPaymentDue } from './entitlements.ts';
import { checkImport, importCounts, importLimitIssue } from './import.js';
import { trackProject } from './capstone.js';
import { labSummary } from './lab.js';
import { displayTitles, profileFor } from './profiles.ts';
import { cleanProfile } from './certificates.ts';
import { defaultProgramId, journeyDefinition, orgCohortSetups, runningCohort } from './programs.ts';
import { privateFile } from './guards.js';
import { closeOnDelete as closeErasure } from './privacy.ts';
import { lockedChanges, removeLocked, REPO_EDIT_AR } from './content-lock.js';
import { reviewAnswers } from './answer-review.js';
import { saveEffort } from './effort.ts';
import { inboxOf } from './inbox.js';
import * as OB from './observations.ts';
import { cleanStatusReason, MODEL_RETURN_COUNT, RULES, statusNeedsReason } from './notice-rules.js';
import { canRequestRetake, openRetake, RETAKE_MAIL_SUBJECT, retakeReason, retakeText } from './retake.js';
import { onboardingOf, REMIND_GAP_DAYS, servedTotal, STUCK_MAIL_SUBJECT, STUCK_STEPS, stuckMailText } from './onboarding.js';
import { appSettings } from './settings.ts';

type Body = Record<string, any>;
export type Admin = { email: string; role: 'super_admin' | 'admin' | 'viewer'; method?: string };
// من يُنفّذ إجراء مشتركًا بين اللوحة وبوابة الخبير: المدير (admin) أو الخبير بهويته (system + بريده في السجل)
export type Actor = { email: string; actor?: 'admin' | 'system' };

async function sha256hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

// صف المدير الحي. تعذّر القراءة (لا غياب الصف) يُسقط الطلب: لا صلاحية بلا تحقق
async function liveAdmin(subject: unknown): Promise<{ email: string; role_id: string; is_active: boolean; passkey_only: boolean } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(String(subject || ''))) return null;
  const { data, error } = await publicDb.from('admin_users').select('email, role_id, is_active, passkey_only').eq('id', String(subject)).limit(1);
  if (error) throw new Fail('تعذّر التحقق من صلاحية الحساب، حاول بعد قليل', 503, 'db_error');
  return (data?.[0] as any) || null;
}

export async function adminFromToken(token: unknown): Promise<Admin> {
  if (typeof token !== 'string' || token.length < 32) throw new Fail('جلسة الإدارة منتهية', 401, 'session');
  const { data } = await publicDb.from('api_sessions').select('subject, meta, expires_at')
    .eq('token_hash', await sha256hex(token)).eq('kind', 'admin').limit(1);
  const s = data?.[0];
  if (!s || new Date(s.expires_at).getTime() < Date.now()) throw new Fail('جلسة الإدارة منتهية', 401, 'session');
  // الدور والتفعيل من admin_users الآن لا من نسخة الجلسة (كما في admin-api): سحب الصلاحية أو إيقاف الحساب يسري فورًا،
  // لا بعد انتهاء الجلسة (التدقيق الأمني 2026-11-04، M6). حساب «مفتاح المرور وحده» لا تُقبل له جلسة برمز البريد.
  const live = await liveAdmin(s.subject);
  if (!live || live.is_active === false) throw new Fail('جلسة الإدارة منتهية', 401, 'session');
  // كما في admin-api: حساب «مفتاح المرور وحده» لا تُقبل له إلا جلسة مفتاح مرور (لا رمز بريد ولا TOTP)
  if (live.passkey_only && s.meta?.method !== 'passkey') throw new Fail('جلسة الإدارة منتهية', 401, 'session');
  return { email: String(live.email || s.meta?.email || ''), role: live.role_id as Admin['role'], method: s.meta?.method };
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
// الإجراءات الخطرة (حذف جهة أو مشارك أو منسق، استرجاع برنامج، إعدادات الدفع، إعادة إصدار
// شهادات جهة، إعادة ضبط العرض) للمدير الأعلى وحده، بالعامل الثاني نفسه
export function requireSuper(a: Admin) {
  requireWrite(a);
  if (a.role !== 'super_admin') throw new Fail('هذا الإجراء للمدير الأعلى وحده', 403, 'super_required');
}
export const superWriter = <T>(a: Admin, fn: (a: Admin, b: Body) => Promise<T>, b: Body) => { requireWrite(a); requireSuper(a); return fn(a, b); };

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
    withdrawn: rows.filter((r) => !inProgram(r.status)).length,
  };
}
// حساب العرض لا يدخل القوائم ولا الإحصاءات. وحساب الاختبار (is_test، قرار المالك 2026-11-11) لا يدخل الإحصاءات
// ولوحة الجهة وحدها: يظهر في القوائم التشغيلية بشارة «اختبار»، ويبقى حسابًا عاديًا في كل ما سوى ذلك.
// 'none' = بلا جهة. المصدر الواحد لهذه القاعدة، ويستعمله تقرير الأثر كذلك (impact.ts).
// col يسمح بالتصفية على جدول مضمَّن (participants.organization_id مع participants!inner)
export const scopeOrg = (q: any, org: unknown, col = 'organization_id') => (org === 'none' ? q.is(col, null) : org ? q.eq(col, String(org)) : q);
export const forStats = (q: any) => q.eq('is_demo', false).eq('is_test', false);
const orgFilter = (q: any, org: unknown) => scopeOrg(forStats(q), org);   // الإحصاءات وصفحة الجهة ولوحة منسقها
const listFilter = (q: any, org: unknown) => scopeOrg(q.eq('is_demo', false), org);   // قائمة المشاركين

export async function orgs() {
  const [{ data: list }, { data: ps }, { data: coords }] = await Promise.all([
    db.from('organizations').select('*').order('created_at'),
    all((f, t) => forStats(db.from('participants').select('id, status, organization_id, organization_name, last_login_at')).order('id').range(f, t)).then((data) => ({ data })),
    db.from('org_coordinators').select('id, organization_id, email, status, expires_at, invited_at, last_login_at'),
  ]);
  const weekAgo = Date.now() - 7 * 864e5;
  const stats = (rows: any[]) => ({ ...funnel(rows), total: rows.length, active_week: rows.filter((r) => r.last_login_at && Date.parse(r.last_login_at) > weekAgo).length });
  const unassigned = (ps || []).filter((p: any) => !p.organization_id);
  // ما كتبه غير المربوطين في خانة الجهة، لربطهم بجهة بنقرة
  const typed: Record<string, number> = {};
  for (const p of unassigned) { const n = String(p.organization_name || '').trim(); if (n) typed[n] = (typed[n] || 0) + 1; }
  // حال دفعة كل جهة فعّالة بجاهزيتها (orgCohortSetups، المصدر نفسه لصفحة الجهة)، لسطرها في النظرة العامة.
  // تعذّر قراءتها لا يُفشل القائمة: يُترك الحقل فلا يظهر بند الدفعة ناقصًا بلا سبب
  const setups = await orgCohortSetups((list || []).filter((o: any) => o.status === 'active').map((o: any) => o.id)).catch(() => null);
  return {
    success: true,
    orgs: (list || []).map((o: any) => ({ ...o, stats: stats((ps || []).filter((p: any) => p.organization_id === o.id)),
      access: orgAccessState(o, (coords || []).filter((c: any) => c.organization_id === o.id)),
      ...(setups && o.id in setups ? { cohort_setup: setups[o.id] || { cohort: null, setup: [], setup_missing: 0 } } : {}) })),
    unassigned: { ...stats(unassigned), typed: Object.entries(typed).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, n]) => ({ name, n })) },
  };
}

// لوحة جهة واحدة: مشاركوها بمساراتهم وحالاتهم، وتوزيعهم على المسارات
export async function org(b: Body) {
  const id = String(b.id || '');
  const o = id === 'none' ? { id: 'none', name: 'بدون جهة' } : must(await db.from('organizations').select('*').eq('id', id).maybeSingle());
  if (!o) throw new Fail('الجهة غير موجودة', 404);
  const rows = await all((f, t) => orgFilter(db.from('participants')
    .select('id, full_name, email, phone, job_title, organization_name, status, source, org_via, campaign, referrer_host, created_at, last_login_at, placements(dimension, level, approved_at)'), id)
    .order('created_at', { ascending: false }).order('id').range(f, t));
  // ما تراه الجهة اسم ملف التعريف لا عنوان المسار الداخلي
  const shown = await displayTitles();
  const titles = Object.fromEntries(Object.entries(shown).map(([k, v]) => [k, v.ar]));
  const participants = rows.map((p: any) => {
    const lv = Object.fromEntries((p.placements || []).map((x: any) => [x.dimension, x.level]));
    const key = trackKey(lv);
    const { placements: _p, ...rest } = p;
    return { ...rest, track: key, track_title: key ? titles[key] || null : null, approved: approvalOf(p.placements).approved };
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
  let q = db.from('participants').update({ organization_id: target?.id || null, org_via: target ? 'admin' : null });   // جهة العمل يكتبها المشارك ولا تُستبدل
  if (b.typed_name) q = q.is('organization_id', null).eq('organization_name', String(b.typed_name));
  else if (ids.length) q = q.in('id', ids);
  else throw new Fail('لم يُحدَّد مشاركون');
  const done = must(await q.select('id')) ?? [];
  // النقل أو الفك يُلغي إعفاء الراعي السابق: ما ثُبّت لجهة لا يبقى بعد مغادرتها
  // (الجهة الجديدة تثبّت إعفاءها عند أول دخول للمشارك، كالمعتاد في access())
  let revoked = 0;
  const moved = done.map((x: any) => String(x.id));
  for (let i = 0; i < moved.length; i += 150) {
    let rv = db.from('entitlements').update({ revoked_at: new Date().toISOString(), revoked_by: a.email })
      .in('participant_id', moved.slice(i, i + 150)).eq('source', 'sponsor').is('revoked_at', null);
    if (target) rv = rv.neq('organization_id', target.id);
    revoked += (must(await rv.select('id')) ?? []).length;
  }
  // الجهة الجديدة تثبّت إعفاءها لحظة الربط (لا عند أول دخول للمشارك)
  let pinned = 0;
  if (target) for (const id of moved) if (await pinSponsorFor(id)) pinned += 1;
  await audit('admin', a.email, 'participant.org', 'organizations', target?.id || 'none', null, { count: done.length, typed_name: b.typed_name || null, revoked_sponsor: revoked, pinned });
  return { success: true, moved: done.length, revoked_sponsor: revoked, pinned };
}

// ── نظرة عامة ──
export async function overview(b: Body = {}) {
  const data = await all((f, t) => orgFilter(db.from('participants').select('id, status, organization_id, organization_name, org_via, created_at, last_login_at'), b.org).order('id').range(f, t));
  const byStatus: Record<string, number> = {};
  for (const r of data || []) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  // بفلتر الجهة نفسه الذي تُحسب به بقية الأرقام، وبلا حساب العرض كقائمة المراجعة
  const { count: pendingReviews } = await scopeOrg(db.from('participant_requirements')
    .select('participant_id, participants!inner(organization_id, is_demo)', { count: 'exact', head: true }).eq('status', 'submitted')
    .eq('participants.is_demo', false), b.org, 'participants.organization_id');
  const ids = new Set((data || []).map((r: any) => r.id));
  // مع تصفية الجهة تُقرأ صفوف مشاركيها فقط، وبدونها الكل
  const scope = b.org ? [...ids] as string[] : null;
  const grid = await allFor(scope, () => db.from('placements').select('participant_id, dimension, level').order('participant_id').order('dimension'));
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
    ...(await overviewMore(scope)),
  };
}

// القياس والكتاب والنماذج لمجموعة مشاركين
// ids = null: كل المشاركين. القراءة بصفحات، فلا تقف الأرقام عند أول 1000 صف
async function overviewMore(ids: string[] | null) {
  const [as, p, s, ledger] = await Promise.all([
    allFor(ids, () => db.from('assessments').select('id, participant_id, instruments(key, kind, title_ar, active), assessment_results(dimension, composite_pct)').eq('status', 'submitted').order('id')),
    allFor(ids, () => db.from('handbook_progress').select('participant_id, quiz_score, quiz_total').order('participant_id').order('module_id')),
    allFor(ids, () => db.from('model_submissions').select('participant_id, status, rating').order('id')),
    allFor(ids, () => db.from('points_ledger').select('participant_id, points').order('id')),
  ]);
  // القياس: لكل أداة عدد من أنهوها ومتوسط النسبة المركبة لكل إطار
  const inst: Record<string, any> = {};
  for (const a of as) {
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
  const rated = s.filter((x) => x.rating);
  const pts: Record<string, number> = {};
  for (const r of ledger) pts[r.participant_id] = (pts[r.participant_id] || 0) + r.points;
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
// حد القوائم واحد، والرد يقول صراحةً إن بُلغ (capped) فتنبّه اللوحة أن ما بعده لا يُرى إلا ببحث على الخادم
export const LIST_LIMIT = 500;
export const capInfo = (rows: any[], limit = LIST_LIMIT) => (rows.length >= limit ? { capped: true, limit } : {});
export async function participants(b: Body) {
  let q = db.from('participants')
    .select('id, full_name, email, phone, job_title, organization_id, organization_name, years_experience, status, created_at, last_login_at, is_test, placements(dimension, level, approved_at)')
    .order('created_at', { ascending: false }).limit(LIST_LIMIT);
  q = listFilter(q, b.org);
  if (b.status) q = q.eq('status', String(b.status));
  if (b.search) {
    const s = String(b.search).replace(/[%,()]/g, ' ').trim();
    if (s) q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,organization_name.ilike.%${s}%`);
  }
  const rows = (must(await q) ?? []) as any[];
  const progress = await baselineProgress(rows.map((r) => r.id));
  // دفعة كل مشارك بالقاعدة نفسها التي تحكم رحلته (pickCohort): تسجيله الصريح، ثم دفعة جهته، ثم الافتراضية. لفلتر «الدفعات» في القائمة
  const [cohorts, enr] = await Promise.all([
    db.from('cohorts').select('id, name, status, is_default, organization_id, starts_on, created_at').then((r) => (r.data || []) as any[]),
    allFor(rows.map((r) => r.id), () => db.from('enrollments').select('participant_id, cohort_id, status, created_at').order('participant_id').order('cohort_id')).catch(() => [] as any[]),
  ]);
  const enrBy = new Map<string, any[]>();
  for (const e of enr as any[]) { if (!enrBy.has(e.participant_id)) enrBy.set(e.participant_id, []); enrBy.get(e.participant_id)!.push(e); }
  const cohortId = (r: any) => pickCohort({ enrollments: enrBy.get(r.id) || [], cohorts, organizationId: r.organization_id || null }).cohort?.id || null;
  // effort وretake من سجل القياس نفسه (المصدر الواحد): وسم المستعجل وفلتره، وطلب الإعادة القائم
  return { success: true, participants: rows.map((r) => {
    const g = progress[r.id] || null;
    return { ...r, cohort_id: cohortId(r), onboarding: onboardingOf(r, g?.id ? g : null), effort: g?.status === 'submitted' ? g.effort || null : null, retake: g?.retake || null, can_retake: canRequestRetake(r, g?.id ? g : null) };
  }), cohorts: cohorts.map((c) => ({ id: c.id, name: c.name })), ...capInfo(rows) };
}

// تذكير يدوي لمن لم يكمل التسجيل: بريد يسمّي ما بقي على كل شخص (ملفه، أو القياس وكم أجاب منه).
// يتخطى من أكمل، ومن ذُكِّر (آليًا أو يدويًا) خلال REMIND_GAP_DAYS، والبريد من حصة الرسائل الجماعية فيُصفّ عند بلوغ الحد اليومي.
export async function remindStuck(a: Admin, b: Body) {
  requireWrite(a);
  const ids = [...new Set((Array.isArray(b.participant_ids) ? b.participant_ids : []).map(String).filter(isUuid))].slice(0, 50) as string[];
  if (!ids.length) throw new Fail('اختر من تذكّرهم');
  const rows = (must(await db.from('participants').select('id, full_name, email, phone, job_title, organization_name, years_experience, status, reminded_at, is_demo').in('id', ids)) ?? []) as any[];
  const progress = await baselineProgress(ids);
  const since = Date.now() - REMIND_GAP_DAYS * 864e5;
  let sent = 0, done = 0, recent = 0;
  for (const p of rows) {
    const o = onboardingOf(p, progress[p.id] || null);
    const text = stuckMailText(o);
    if (p.is_demo || !p.email || !STUCK_STEPS.includes(o.step) || !text) { done += 1; continue; }
    if (p.reminded_at && Date.parse(p.reminded_at) > since) { recent += 1; continue; }
    await db.from('participants').update({ reminded_at: new Date().toISOString() }).eq('id', p.id);
    await sendMail(p.email, STUCK_MAIL_SUBJECT, stuckMail(p.full_name, text), [], { kind: 'bulk', ref: `participant:${p.id}` });
    await audit('admin', a.email, 'participant.remind', 'participants', p.id, null, { step: o.step });
    sent += 1;
  }
  return { success: true, sent, skipped: { done, recent }, gap_days: REMIND_GAP_DAYS };
}

// القياس المبدئي الأحدث غير الملغى لكل مشارك: حالته وكم أجاب من كم (بصيغته)، وآخر حفظ لإجابة.
// قراءتان ثابتتان مهما كثر المشاركون: القياسات بعدّ إجاباتها، وأسئلة الأدوات المعنية.
export async function baselineProgress(ids: string[]) {
  const out: Record<string, any> = {};
  if (!ids.length) return out;
  const { data: as } = await db.from('assessments')
    .select('id, participant_id, instrument_id, status, started_at, submitted_at, form, effort, retake_requested_at, retake_reason, instruments!inner(kind), assessment_answers(count)')
    .in('participant_id', ids).eq('instruments.kind', 'baseline').order('started_at', { ascending: false });
  const latest = new Map<string, any>();
  const all = new Map<string, any[]>();
  for (const a of as || []) {
    if (!all.has(a.participant_id)) all.set(a.participant_id, []);
    all.get(a.participant_id)!.push(a);
    if (a.status !== 'void' && !latest.has(a.participant_id)) latest.set(a.participant_id, a);
  }
  const instIds = [...new Set([...latest.values()].map((a) => a.instrument_id))];
  const { data: qs } = instIds.length
    ? await db.from('questions').select('instrument_id, form').in('instrument_id', instIds).eq('active', true).limit(5000)
    : { data: [] };
  // ما سُلّم قبل عمود المؤشر يُحسب ويُحفظ عند أول قراءة، بحد لكل طلب حتى لا يثقل القائمة
  let backfill = 25;
  for (const [pid, list] of all) {
    const a = latest.get(pid) || null;
    let effort = a?.effort ?? null;
    if (a && a.status === 'submitted' && !effort && backfill > 0) { backfill -= 1; effort = await saveEffort(a).catch(() => null); }
    out[pid] = {
      ...(a ? {
        id: a.id, status: a.status, started_at: a.started_at, submitted_at: a.submitted_at,
        answered: Number(a.assessment_answers?.[0]?.count) || 0,
        total: servedTotal((qs || []).filter((x: any) => x.instrument_id === a.instrument_id), a.form),
      } : {}),
      effort, retake: openRetake(list),
    };
  }
  return out;
}

export async function participant(b: Body) {
  const p = must(await db.from('participants').select('*').eq('id', String(b.id)).maybeSingle());
  if (!p) throw new Fail('المشارك غير موجود', 404);
  const [results, reqs, views, audits] = await Promise.all([
    db.from('assessments').select('id, status, started_at, submitted_at, instrument_id, form, instruments(key, kind), assessment_results(*)')
      .eq('participant_id', p.id).order('started_at', { ascending: false }),
    db.from('participant_requirements').select('*, stage_requirements(code, title_ar, stage_key, kind)').eq('participant_id', p.id),
    db.from('handbook_views').select('viewed_at').eq('participant_id', p.id).order('viewed_at', { ascending: false }).limit(1),
    // الخط الزمني: ما جرى عليه (entity_id) وما فعله هو (actor بمعرّفه)، لا آخر ثلاثين على كيانه وحده
    db.from('audit_log').select('*').or(`entity_id.eq.${p.id},actor.eq.${p.id}`).order('created_at', { ascending: false }).limit(150),
  ]);
  const [state, { data: model }] = await Promise.all([
    mePayload(p, 'admin'),
    db.from('placement_model').select('*').eq('id', 1).maybeSingle(),
  ]);
  // تقييم كل نتيجة بالنموذج الحالي: المؤشر المركّب، والمستوى المقترح وسببه،
  // وهل الحالة حدّية، وكم سؤالًا يفصله عن المستوى التالي. يُحسب عند العرض
  // فيصلح للنتائج القديمة أيضًا.
  // الموافقة المطلقة تحتاج الإجابات نفسها (كل عبارات الممارسة بأعلى درجة)
  const submittedIds = (results.data || []).filter((a: any) => a.status === 'submitted').map((a: any) => a.id);
  const { data: behaviorAnswers } = submittedIds.length
    ? await db.from('assessment_answers').select('assessment_id, question_id, value, questions!inner(id, dimension, tier, options)')
      .in('assessment_id', submittedIds).eq('questions.tier', 'behavior')
    : { data: [] };
  const acqOf = (id: string) => {
    const rows = (behaviorAnswers || []).filter((x: any) => x.assessment_id === id);
    return acquiescenceFor(rows.map((x: any) => x.questions), Object.fromEntries(rows.map((x: any) => [x.question_id, x.value?.k])));
  };
  // نقاط كل جانب من أسئلة أداة القياس نفسها، حتى يُحسب «كم سؤالًا يفصله» بعدد أسئلتها الفعلي
  const instrumentIds = [...new Set((results.data || []).map((a: any) => a.instrument_id).filter(Boolean))];
  const { data: flipQs } = instrumentIds.length
    ? await db.from('questions').select('instrument_id, code, dimension, tier, options, weight, form, active, anchor_code, min_level').in('instrument_id', instrumentIds).eq('active', true)
    : { data: [] };
  const assessments = (results.data || []).map((a: any) => {
    const acq: Record<string, boolean> = acqOf(a.id);
    const ownQs = (flipQs || []).filter((q: any) => q.instrument_id === a.instrument_id);
    return {
      ...a,
      assessment_results: (a.assessment_results || []).map((r: any) => {
        const pcts = { knowledge: r.knowledge_pct, skill: r.skill_pct, behavior: r.behavior_pct };
        const evaluation = evaluatePlacement(pcts, model || DEFAULT_MODEL, { acquiescence: acq[r.dimension] });
        return { ...r, evaluation: { ...evaluation, items_to_flip: itemsToFlip({ ...pcts, ...evaluation }, model || DEFAULT_MODEL, tierMaxPointsOf(ownQs, { dimension: r.dimension, form: a.form })) } };
      }),
    };
  });
  // السيرة لا تُوقَّع هنا لكل من يفتح الملف: تُفتح بطلب صريح عبر admin.evidence-url (للمدير، ويُسجَّل الفتح)
  const [pts, { data: book }, { data: subs }, { data: labTries }] = await Promise.all([
    pointsOf(p.id),
    db.from('handbook_progress').select('module_id, quiz_score, quiz_total, reflection, completed_at, handbook_modules(title_ar, dimension)').eq('participant_id', p.id),
    db.from('model_submissions').select('id, status, rating, bonus, submitted_at, updated_at, learning_models(title_ar, dimension, points)').eq('participant_id', p.id),
    // المختبر للمستشار: بـ* لتحمل عمود التلميحات قبل ترحيل 20261111120200 وبعده
    db.from('lab_attempts').select('*, lab_items(title_ar, dimension, spec)').eq('participant_id', p.id).not('finished_at', 'is', null),
  ]);
  // سطر لكل أداة جرّبها: أفضل نتيجة، والمحاولات، والتلميحات، وأكثر خلط بين مجموعات اللوحة
  const labGroups: Record<string, any[]> = {};
  for (const a of labTries || []) (labGroups[a.item_id] ||= []).push(a);
  const labs = Object.entries(labGroups).map(([item_id, list]) => ({ item_id, title: list[0]?.lab_items?.title_ar || '', dimension: list[0]?.lab_items?.dimension || null, ...labSummary(list, list[0]?.lab_items?.spec) }));
  // مؤشر الجهد لآخر قياس مبدئي مُسلَّم: من مراجعة الإجابات نفسها (reviewAnswers)، يظهر في بطاقة المستوى قبل الاعتماد
  // أين توقف قبل الاعتماد: الملف ثم القياس (كم أجاب من كم، وآخر حفظ)، من المصدر نفسه الذي تقرؤه القائمة
  const g = (await baselineProgress([p.id]))[p.id] || null;
  const prog = g?.id ? g : null;
  const effort = prog?.status === 'submitted' ? prog.effort || null : null;
  const lastAnswer = prog && prog.status === 'in_progress' && prog.answered
    ? (await db.from('assessment_answers').select('answered_at').eq('assessment_id', prog.id).order('answered_at', { ascending: false }).limit(1)).data?.[0]?.answered_at || null
    : null;
  return {
    success: true, participant: p, effort, retake: g?.retake || null, can_retake: canRequestRetake(p, prog), onboarding: { ...onboardingOf(p, prog), started_at: prog?.started_at || null, last_answer_at: lastAnswer }, profile: state.profile, journey: state.journey, progress: state.progress, milestones: state.milestones, milestone_summary: state.milestone_summary, group: state.group, continuous: state.continuous,
    program: state.program || null,   // دفعته وبرنامجه كما يراهما الخادم (للعرض والتسجيل الصريح في دفعة)
    assessments, requirements: reqs.data || [], last_view: views.data?.[0]?.viewed_at || null,
    placement_model: model || DEFAULT_MODEL,   // حدود مقياس المؤشر في بطاقة المستوى (للعرض وحده)
    history: audits.data || [],
    points: pts, book: book || [], models: subs || [], labs,
  };
}

// ── تصحيح بيانات المشارك من اللوحة (كان يتطلب تعديل القاعدة يدويًا) ──
// الحقول الخمسة الأساسية فقط، بتدقيق قبل/بعد للحقول التي تغيّرت. تغيير البريد يُسقط توثيقه فيُوثَّق عند الدخول التالي.
export async function participantSave(a: Admin, b: Body) {
  requireWrite(a);
  const id = String(b.participant_id || '');
  const p = must(await db.from('participants').select('id, full_name, email, phone, job_title, organization_name, is_demo, is_test').eq('id', id).maybeSingle()) as any;
  if (!p) throw new Fail('المشارك غير موجود', 404);
  if (p.is_demo) throw new Fail('حساب العرض لا يُعدَّل من هنا', 409);
  const f = b.fields && typeof b.fields === 'object' ? b.fields : {};
  const row: Record<string, unknown> = {};
  if ('full_name' in f) { const v = String(f.full_name || '').trim(); if (v.length < 3) throw new Fail('الاسم مطلوب (3 أحرف على الأقل)'); row.full_name = v.slice(0, 120); }
  if ('email' in f) { const v = normalizeEmail(f.email); if (!isEmail(v)) throw new Fail('البريد غير صحيح'); if (v !== p.email) { row.email = v; row.email_verified_at = null; } }
  if ('phone' in f) { const raw = String(f.phone || '').trim(); const v = raw ? normalizePhone(raw) : null; if (raw && !v) throw new Fail('رقم الجوال غير صحيح. اكتبه بصيغة 05XXXXXXXX.'); row.phone = v; }
  if ('job_title' in f) row.job_title = String(f.job_title || '').trim().slice(0, 120) || null;
  if ('organization_name' in f) row.organization_name = String(f.organization_name || '').trim().slice(0, 200) || null;
  // حساب اختبار داخلي: يُستبعد من الإحصاءات وحدها (forStats)، ويُسجَّل تغييره في السجل كبقية الحقول
  if ('is_test' in f) row.is_test = f.is_test === true;
  const changed = Object.keys(row).filter((k) => k !== 'email_verified_at' && row[k] !== p[k]);
  if (!changed.length) return { success: true, changed: [] };
  const saved = must(await db.from('participants').update(row).eq('id', id).select('*').single(), 'تعذّر الحفظ؛ قد يكون البريد مسجلًا لمشارك آخر');
  await audit('admin', a.email, 'participant.edit', 'participants', id,
    Object.fromEntries(changed.map((k) => [k, p[k]])), Object.fromEntries(changed.map((k) => [k, row[k]])));
  return { success: true, changed, participant: saved };
}

// ── حذف مشارك بأثر (طلب محو، أو تسجيل مكرر) ──
// يُعرض أولًا ما سيُمحى وما يمنع الحذف: شهادة سارية يتحقق منها الناس برقمها، أو دفع مؤكد.
// الحذف للمدير الأعلى، بكتابة البريد للتأكيد، ويمحو ملفاته من المخزن الخاص، ويترك في السجل
// المعرّف وبصمة البريد والأعداد دون أي بيانات شخصية.
async function countRows(t: string, id: string, extra?: (q: any) => any) {
  let q: any = db.from(t).select('*', { count: 'exact', head: true }).eq('participant_id', id);
  if (extra) q = extra(q);
  const { count } = await q;
  return count ?? 0;
}
export async function participantImpact(b: Body) {
  const id = String(b.participant_id || '');
  const p = must(await db.from('participants').select('id, full_name, email, is_demo').eq('id', id).maybeSingle()) as any;
  if (!p) throw new Fail('المشارك غير موجود', 404);
  const [assessments, submissions, capstones, certificates, valid_certificates, payments, paid_payments, requirements, sessions] = await Promise.all([
    countRows('assessments', id), countRows('model_submissions', id), countRows('capstones', id),
    countRows('certificates', id), countRows('certificates', id, (q) => q.eq('status', 'valid')),
    countRows('payments', id), countRows('payments', id, (q) => q.eq('status', 'paid')),
    countRows('participant_requirements', id), countRows('auth_sessions', id),
  ]);
  const blockers: string[] = [];
  if (p.is_demo) blockers.push('حساب العرض يُعاد ضبطه من النظرة العامة ولا يُحذف من هنا');
  if (valid_certificates) blockers.push('له شهادة سارية يتحقق منها الناس برقمها؛ ألغِها أولًا، أو أوقف الحساب بدل حذفه');
  if (paid_payments) blockers.push('له دفع مؤكد، والحذف يفصل المال عن صاحبه؛ أوقف الحساب بدل حذفه');
  return {
    success: true, participant: { id, full_name: p.full_name, email: p.email },
    counts: { assessments, submissions, capstones, certificates, payments, requirements, sessions }, blockers,
  };
}
export async function participantDelete(a: Admin, b: Body) {
  requireSuper(a);
  const impact = await participantImpact(b);
  if (impact.blockers.length) throw new Fail(impact.blockers[0], 409, 'blocked');
  const { id, email } = impact.participant;
  if (String(b.confirm_email || '').trim().toLowerCase() !== email) throw new Fail('اكتب بريد المشارك كما هو للتأكيد', 400, 'confirm');
  // ملفاته في المخزن الخاص: <id>/<الغرض>/<ملف>
  const { data: folders } = await storage.from(BUCKET).list(id, { limit: 100 });
  const paths: string[] = [];
  for (const f of folders || []) {
    if (f.id) { paths.push(`${id}/${f.name}`); continue; }
    const { data: files } = await storage.from(BUCKET).list(`${id}/${f.name}`, { limit: 1000 });
    for (const x of files || []) if (x.id) paths.push(`${id}/${f.name}/${x.name}`);
  }
  if (paths.length) await storage.from(BUCKET).remove(paths);
  // طلب الحذف القائم يُغلق بتنفيذه، ويبقى أثره بعد حذف صاحبه
  await closeErasure(id, a.email);
  must(await db.from('participants').delete().eq('id', id), 'تعذّر الحذف');
  await audit('admin', a.email, 'participant.delete', 'participants', id, null, { email_hash: await hash(email), files: paths.length, ...impact.counts });
  return { success: true, files: paths.length };
}

// قائمة المراجعة: كل ما أرسله المشاركون وينتظر قرار المستشار
// b.org (اختياري): جهة واحدة أو 'none' كفلتر النظرة العامة، فلا تختلط قائمتها بجهات أخرى
export async function reviews(b: Body = {}) {
  // حساب العرض لا يدخل طوابير المراجعة (participants!inner يسمح بالفلترة على المشارك)
  const rows = must(await scopeOrg(db.from('participant_requirements')
    .select('participant_id, requirement_id, status, evidence_path, note, completed_at, participants!inner(full_name, email, is_demo, organization_id), stage_requirements(code, title_ar, stage_key, kind)')
    .eq('status', 'submitted').eq('participants.is_demo', false), b.org, 'participants.organization_id').limit(200)) ?? [];
  const { data: waiting } = await scopeOrg(db.from('participants').select('id, full_name, email, organization_name, updated_at')
    .eq('status', 'pending_approval').eq('is_demo', false), b.org).order('updated_at', { ascending: true }).limit(200);
  return { success: true, submitted: rows, pending_approval: waiting || [] };
}

// ── صندوق «ينتظرني»: كل ما ينتظر قرار الإدارة من جداوله، في قائمة واحدة بعمره (inbox.js) ──
// قراءات متوازية، وتعذّر مصدر واحد لا يُسقط الصندوق: يظهر الباقي ويُسمّى المتعذّر في skipped.
export async function inbox(_b: Body = {}) {
  const P = 'participants!inner(full_name, is_demo)';
  const q = {
    approval: db.from('participants').select('id, full_name, organization_name, updated_at').eq('status', 'pending_approval').eq('is_demo', false).limit(200),
    requirement: db.from('participant_requirements').select(`participant_id, requirement_id, completed_at, ${P}, stage_requirements(title_ar)`).eq('status', 'submitted').eq('participants.is_demo', false).limit(200),
    model: db.from('model_submissions').select(`id, participant_id, submitted_at, ${P}, learning_models(title_ar)`).eq('status', 'submitted').eq('participants.is_demo', false).limit(200),
    capstone: db.from('capstones').select(`participant_id, submitted_at, ${P}`).eq('status', 'submitted').eq('participants.is_demo', false).limit(200),
    expert_application: db.from('experts').select('id, full_name, title, created_at').eq('status', 'applied').limit(100),
    expert_unmatched: db.from('expert_requests').select(`id, participant_id, role, created_at, ${P}`).eq('status', 'unmatched').limit(100),
    sponsor: db.from('sponsor_requests').select(`id, participant_id, kind, created_at, ${P}`).eq('status', 'pending').limit(100),
    erasure: db.from('erasure_requests').select(`id, participant_id, created_at, ${P}`).eq('status', 'pending').limit(100),
    coaching_confirm: db.from('coaching_sessions').select(`id, participant_id, starts_at, ends_at, ${P}`).eq('status', 'booked').lt('ends_at', new Date().toISOString()).limit(100),
  };
  const keys = Object.keys(q) as (keyof typeof q)[];
  const res = await Promise.all(keys.map((k) => q[k]));
  const rows: Record<string, any[]> = {}, skipped: string[] = [];
  keys.forEach((k, i) => { if (res[i].error) skipped.push(k); rows[k] = (res[i].data || []) as any[]; });
  const name = (r: any) => r.participants?.full_name || '';
  const src = {
    approval: rows.approval.map((r) => ({ id: r.id, participant_id: r.id, title: r.full_name, sub: r.organization_name || '', at: r.updated_at })),
    requirement: rows.requirement.map((r) => ({ id: `${r.participant_id}:${r.requirement_id}`, participant_id: r.participant_id, title: name(r), sub: r.stage_requirements?.title_ar || '', at: r.completed_at })),
    model: rows.model.map((r) => ({ id: r.id, participant_id: r.participant_id, title: name(r), sub: r.learning_models?.title_ar || '', at: r.submitted_at })),
    // وثيقة المبادرة مفتاحها المشارك، وصفحتها في تبويب مشاريع التخرج بمعرّفه
    capstone: rows.capstone.map((r) => ({ id: r.participant_id, title: name(r), sub: 'وثيقة المبادرة', at: r.submitted_at })),
    expert_application: rows.expert_application.map((r) => ({ id: r.id, title: r.full_name, sub: r.title || '', at: r.created_at })),
    expert_unmatched: rows.expert_unmatched.map((r) => ({ id: r.id, participant_id: r.participant_id, title: name(r), sub: expertRoleAr(r.role), at: r.created_at })),
    sponsor: rows.sponsor.map((r) => ({ id: r.id, participant_id: r.participant_id, title: name(r), sub: r.kind === 'contract' ? 'خارج مدة العقد' : 'المقاعد ممتلئة', at: r.created_at })),
    erasure: rows.erasure.map((r) => ({ id: r.id, participant_id: r.participant_id, title: name(r), sub: 'مهلته 30 يومًا', at: r.created_at })),
    coaching_confirm: rows.coaching_confirm.map((r) => ({ id: r.id, participant_id: r.participant_id, title: name(r), sub: 'حضر أم لم يحضر؟', at: r.ends_at || r.starts_at })),
  };
  return { success: true, ...inboxOf(src), skipped };
}

// الملفات الخاصة (السيرة والأدلة): للمدير وحده لا للمراقب، بمسار على شكل مسارات الرفع يبدأ بمعرّف
// المشارك المطلوب نفسه (guards.js)، وكل فتح يُسجَّل قبل أن يُسلَّم الرابط المؤقت (الملحق 4، R7)
export async function evidenceUrl(a: Admin, b: Body) {
  if (!canWrite(a)) throw new Fail('فتح الملفات الخاصة للمدير وحده، لا للمراقب', 403, 'forbidden');
  requireWrite(a);   // والعامل الثاني كأي كتابة: السير الذاتية والأدلة لا تُفتح بجلسة رمز بريد وحده (N10)
  const pid = String(b.participant_id || '');
  const file = privateFile(b.path, pid);
  if (!file) throw new Fail('مسار الملف لا يخص هذا المشارك', 400, 'bad_path');
  const { data } = await storage.from(BUCKET).createSignedUrl(file.path, 600);
  if (!data) throw new Fail('الملف غير موجود', 404);
  await audit('admin', a.email, 'admin.file-open', 'participants', pid, null, { path: file.path, kind: file.kind });
  return { success: true, url: data.signedUrl };
}

// ── إجابات القياس للمراجعة (تصور بطاقة المستوى وإجابات القياس، المرحلة 2، قرار المالك 2026-11-11) ──
// للقراءة وحدها: كل سؤال بخياراته ودرجاتها (المفتاح) وما اختاره المشارك، وزمن تقديري من وقت الحفظ.
// المفتاح سر من أسرار البنك، فلا يصل إلا المدير ذا الكتابة (assessmentAnswers) ومستشار الدفعة لمن
// يشرف عليهم (file.ts بـrequireAdvisorOf)، وكل اطلاع يُسجَّل في السجل كما يُسجَّل فتح السيرة.
// الزمن مؤشر مراجعة لا يدخل أي قرار آلي (answer-review.js).
export type AnswersViewer = { type: 'admin' | 'system'; email: string; action: string };
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v || ''));
export async function answersReview(participantId: string, assessmentId: unknown, viewer: AnswersViewer) {
  if (!isUuid(participantId)) throw new Fail('بيانات ناقصة');
  const list = must(await db.from('assessments')
    .select('id, status, form, started_at, submitted_at, instrument_id, instruments(kind, title_ar), assessment_results(dimension, knowledge_pct, skill_pct, behavior_pct)')
    .eq('participant_id', participantId).eq('status', 'submitted').order('submitted_at', { ascending: false })) ?? [];
  if (!list.length) throw new Fail('لم يُرسل المشارك قياسًا بعد', 404, 'no_assessment');
  // المبدئي أولًا (أساس التسكين)، ويُختار البعدي من القائمة
  const a: any = assessmentId ? list.find((x: any) => x.id === String(assessmentId)) : (list.find((x: any) => x.instruments?.kind === 'baseline') || list[0]);
  if (!a) throw new Fail('هذا القياس ليس للمشارك', 404, 'not_found');
  const [qs, rows] = await Promise.all([
    db.from('questions').select('id, code, dimension, tier, kind, text_ar, options, sort, retro, form').eq('instrument_id', a.instrument_id),
    db.from('assessment_answers').select('question_id, value, score, answered_at').eq('assessment_id', a.id),
  ]);
  // نسب الأقسام من assessment_results نفسها، فتطابق ما في بطاقة المستوى
  const stored = Object.fromEntries((a.assessment_results || []).map((r: any) => [r.dimension, { knowledge: r.knowledge_pct, skill: r.skill_pct, behavior: r.behavior_pct }]));
  // حدود الزمن من الإعدادات العامة (answer_review) يضبطها المالك من اللوحة
  const timing = (await appSettings()).answer_review;
  const review = reviewAnswers({ questions: must(qs) ?? [], rows: must(rows) ?? [], startedAt: a.started_at, submittedAt: a.submitted_at, results: Object.keys(stored).length ? stored : null, timing });
  await audit(viewer.type, viewer.email, viewer.action, 'participants', participantId, null, { assessment_id: a.id });
  return {
    success: true,
    assessment: { id: a.id, kind: a.instruments?.kind || null, title: a.instruments?.title_ar || null, form: a.form || null, started_at: a.started_at, submitted_at: a.submitted_at },
    assessments: list.map((x: any) => ({ id: x.id, kind: x.instruments?.kind || null, form: x.form || null, submitted_at: x.submitted_at })),
    ...review,
  };
}
export async function assessmentAnswers(a: Admin, b: Body) {
  if (!canWrite(a)) throw new Fail('إجابات القياس للمدير وحده، لا لدور العرض', 403, 'forbidden');
  requireWrite(a);   // والعامل الثاني: مفتاح الإجابات سر من أسرار البنك (N10)
  return answersReview(String(b.participant_id || ''), b.assessment_id, { type: 'admin', email: a.email, action: 'admin.answers-view' });
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
    // مخالفة المستوى القائم (المحسوب أو المعتمد قبله) تلزمها علة مكتوبة تُحفظ في admin_note
    if (overrideNeedsReason(old?.level, level, b.notes?.[d])) throw new Fail(`اكتب سبب مخالفة المستوى المحسوب في ${DIM_AR[d]} (${OVERRIDE_REASON_MIN} أحرف على الأقل)`, 400, 'override_reason');
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
  const pay = await programPaymentDue(id).catch(() => false);
  sendMail(p.email, pay ? 'اعتُمد مسارك في برنامج القادة' : 'اعتُمد مستواك في برنامج القادة', approvedMail(p.full_name, pay), [], { ref: `participant:${id}` }).catch((e) => console.error(e));
  return { success: true };
}

// تغيير الحالة، المدخل الواحد لشخص من ملفه أو لمجموعة من القائمة (participant_ids، حتى BULK_MAX):
// القواعد نفسها لكل واحد: سبب مكتوب للإيقاف والانسحاب يُحفظ في ملفه ويُبلَّغ به، ورد المقعد لمن ينسحب قبل أول باب.
export const BULK_MAX = 50;
export async function setStatus(a: Admin, b: Body) {
  requireWrite(a);
  const allowed = ['registered', 'profiled', 'assessing', 'pending_approval', 'placed', 'enrolled', 'completed', 'withdrawn', 'suspended'];
  if (!allowed.includes(b.status)) throw new Fail('حالة غير صالحة');
  const bulk = Array.isArray(b.participant_ids);
  const ids = [...new Set((bulk ? b.participant_ids : [b.participant_id]).map(String).filter(isUuid))] as string[];
  if (!ids.length) throw new Fail('اختر من تُغيَّر حالتهم');
  if (ids.length > BULK_MAX) throw new Fail(`الحد ${BULK_MAX} مشاركًا في المرة الواحدة`);
  // الإيقاف والانسحاب بسبب مكتوب: يُحفظ في السجل، ويُكتب في ملف المشارك ويُبلَّغ به بالبريد (notice-rules.js)
  const reason = statusNeedsReason(b.status) ? cleanStatusReason(b.reason) : null;
  if (statusNeedsReason(b.status) && !reason) throw new Fail('اكتب سبب الإيقاف أو الانسحاب: يُحفظ في ملف المشارك ويُبلَّغ به', 400, 'reason');
  // من هو على الحالة المطلوبة أصلًا يُتخطى: لا سجل ولا بريد مكرر
  const current = (must(await db.from('participants').select('id, status').in('id', ids)) ?? []) as any[];
  const todo = current.filter((p) => p.status !== b.status).map((p) => p.id as string);
  for (const pid of todo) {
    must(await db.from('participants').update({ status: b.status }).eq('id', pid));
    await audit('admin', a.email, 'participant.status', 'participants', pid, null, { status: b.status, ...(reason ? { reason } : {}), ...(bulk ? { bulk: ids.length } : {}) });
    if (reason) await OB.record(pid, { code: 'account_status', ref: `${b.status}:${new Date().toISOString().slice(0, 10)}`, ...RULES.account_status({ status: b.status, reason }) });
    // D20: من ينسحب قبل فتح أول باب يُرد مقعده إلى عقد جهته
    if (b.status === 'withdrawn') {
      const { count } = await db.from('handbook_progress').select('module_id', { count: 'exact', head: true }).eq('participant_id', pid);
      if (!count) {
        const { data: back } = await db.from('entitlements').update({ revoked_at: new Date().toISOString(), revoked_by: 'seat-return' })
          .eq('participant_id', pid).eq('source', 'sponsor').is('revoked_at', null).select('organization_id');
        if (back?.length) await audit('admin', a.email, 'sponsor.seat-returned', 'organizations', back[0].organization_id, null, { participant: pid });
      }
    }
  }
  // D05: الحالة لا تُصدر شهادة؛ تصدر من اعتماد التقييم الختامي بقرار اجتاز أو اجتاز بملاحظات (final.ts)
  return { success: true, certificate: null, done: todo.length, skipped: ids.length - todo.length };
}

// إعادة القياس: يُلغى القياس الحالي ويُفتح جديد، والمستوى المعتمد يبقى حتى يُعتمد غيره
// إعادة القياس، المدخل الواحد (لشخص من ملفه أو لمجموعة من القائمة): يلغي القياس القائم ويسجّل الطلب عليه (من ومتى ولماذا)،
// فيرى المشارك بطاقة في الموقع حتى يسلّم قياسًا جديدًا، ويصله بريد بالنص نفسه (retake.js). السبب من مؤشر الجهد المحفوظ.
// الطلب الجماعي لمن سلّم ولم يُعتمد مستواه وحده (canRequestRetake)، والفردي كما كان: لأي مشارك.
export async function resetAssessment(a: Admin, b: Body) {
  requireWrite(a);
  const bulk = Array.isArray(b.participant_ids);
  const ids = [...new Set((bulk ? b.participant_ids : [b.participant_id]).map(String).filter(isUuid))].slice(0, 50) as string[];
  if (!ids.length) throw new Fail('اختر من تُطلب منهم الإعادة');
  const rows = (must(await db.from('participants').select('id, full_name, email, status, is_demo').in('id', ids)) ?? []) as any[];
  const progress = await baselineProgress(ids);
  const { data: inst } = await db.from('instruments').select('est_minutes').eq('kind', 'baseline').eq('active', true).limit(1).maybeSingle();
  const now = new Date().toISOString();
  let done = 0, skipped = 0;
  for (const p of rows) {
    const g = progress[p.id] || null;
    const cur = g?.id ? g : null;
    if (bulk && !canRequestRetake(p, cur)) { skipped += 1; continue; }
    const reason = retakeReason(cur?.status === 'submitted' ? cur.effort : null);
    if (cur) {
      must(await db.from('assessments').update({ status: 'void', retake_requested_at: now, retake_requested_by: a.email, retake_reason: reason }).eq('id', cur.id));
    }
    await db.from('assessments').update({ status: 'void' }).eq('participant_id', p.id).neq('status', 'void');
    await db.from('placements').delete().eq('participant_id', p.id).is('approved_at', null);
    await db.from('participants').update({ status: 'profiled' }).eq('id', p.id);
    await audit('admin', a.email, 'assessment.reset', 'participants', p.id, null, { reason, assessment_id: cur?.id || null });
    // البريد من حصة الرسائل الجماعية (يُصفّ عند بلوغ الحد اليومي)، وتعذّره لا يُسقط الطلب المسجَّل: البطاقة في الموقع تكفي
    if (cur && p.email && !p.is_demo) {
      await sendMail(p.email, RETAKE_MAIL_SUBJECT, retakeMail(p.full_name, retakeText(reason, inst?.est_minutes ?? null)), [], { kind: 'bulk', ref: `participant:${p.id}` }).catch((e) => console.error('retake mail:', e));
    }
    done += 1;
  }
  return { success: true, done, skipped };
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

// تدخل في مرحلة لمشارك بعينه: يفتحها، أو يعتمد اكتمالها، أو يعفيه منها؛ وstage_action فارغ يلغي التدخل.
// يخص برنامج المشارك الحالي، فلا يسري إن انتقل إلى برنامج آخر.
// الفعل في stage_action لا action: حقل action في الطلب اسم الإجراء نفسه (admin.stage-override) الذي يوزَّع عليه،
// فكان الفعل والاسم يتنازعان الحقل ولا يصل التدخل أبدًا (تدقيق الجاهزية، admin-core-1)
export async function stageOverride(a: Admin, b: Body) {
  requireWrite(a);
  // غياب الحقل لا يُفهم إلغاءً: الإلغاء يحذف التدخل، فلا يكون إلا بقيمة فارغة صريحة
  if (!('stage_action' in b)) throw new Fail('حدّد الإجراء على المرحلة');
  const p = must(await db.from('participants').select('id, organization_id').eq('id', String(b.participant_id || '')).maybeSingle());
  if (!p) throw new Fail('المشارك غير موجود', 404);
  const def = await journeyDefinition(p);
  const stage = def.stages.find((s: any) => s.key === String(b.stage_key || ''));
  if (!stage) throw new Fail('المرحلة ليست في رحلة هذا المشارك', 404);
  const action = b.stage_action == null || b.stage_action === '' ? null : String(b.stage_action);
  if (action && !['open', 'complete', 'skip'].includes(action)) throw new Fail('إجراء غير معروف');
  const key = { participant_id: p.id, program_id: def.program_id, stage_key: stage.key };
  if (action) {
    must(await db.from('participant_stage_overrides').upsert({ ...key, action, note: b.note ? String(b.note).slice(0, 1000) : null, by_email: a.email, created_at: new Date().toISOString() }));
  } else {
    must(await db.from('participant_stage_overrides').delete().match(key));
  }
  await audit('admin', a.email, action ? `stage.${action}` : 'stage.reset', 'participants', p.id, null, { stage: stage.key, program: def.program_id, note: b.note || null });
  return { success: true };
}

// مرحلة جديدة في برنامج: مفتاح يُولَّد، وتأتي آخر الرحلة، وقواعدها تُضبط بعدها من «تحرير»
export async function stageCreate(a: Admin, b: Body) {
  requireWrite(a);
  const pid = /^[0-9a-f-]{36}$/.test(String(b.program_id || '')) ? String(b.program_id) : await defaultProgramId();
  const title = String(b.title_ar || '').trim().slice(0, 120);
  if (!title) throw new Fail('اسم المرحلة مطلوب');
  const why = hardcodedFacts(title);
  if (why) throw new Fail(why, 400, 'hardcoded');
  const phase = ['admission', 'qualification', 'impact'].includes(b.phase) ? b.phase : 'qualification';
  const { data: rows } = await db.from('journey_stages').select('sort').eq('program_id', pid).order('sort', { ascending: false }).limit(1);
  const key = `s-${Date.now().toString(36)}`;
  const row = must(await db.from('journey_stages').insert({
    program_id: pid, key, title_ar: title, phase, sort: (rows?.[0]?.sort || 0) + 1, duration_label: '', duration_days: 0, active: true, rules: {},
  }).select('*').single(), 'تعذّر إنشاء المرحلة');
  await audit('admin', a.email, 'journey_stages.create', 'journey_stages', `${pid}:${key}`, null, { title_ar: title, phase });
  return { success: true, row };
}

// ── الإعدادات القابلة للتحرير: كل ما يشكّل المنهجية ──
// قائمة بيضاء بالجداول وحقولها، فلا يكتب أحد في جدول أو عمود غير مقصود.
const ENTITIES: Record<string, { table: string; key: string[]; fields: string[]; sortable?: boolean }> = {
  grid_cells:         { table: 'grid_cells', key: ['dimension', 'level'], fields: ['description_ar', 'path_title_ar'] },
  placement_model:    { table: 'placement_model', key: ['id'],
                        fields: ['w_knowledge', 'w_skill', 'w_behavior', 'min_intermediate', 'min_advanced', 'floor_intermediate', 'floor_advanced', 'borderline',
                                 'rci_reliability', 'rci_sd', 'impact_min_n', 'rater_threshold', 'min_behavior_items', 'rci_practice'] },
  journey_stages:     { table: 'journey_stages', key: ['program_id', 'key'], sortable: true,
                        fields: ['title_ar', 'duration_label', 'duration_days', 'description_ar', 'activities_ar', 'outcome_ar', 'phase', 'active', 'sort',
                                 'mode', 'mode_note_ar', 'builds_on_ar', 'rules'] },
  stage_requirements: { table: 'stage_requirements', key: ['id'], sortable: true,
                        fields: ['program_id', 'stage_key', 'dimension', 'level', 'code', 'title_ar', 'help_ar', 'kind', 'required', 'needs_review', 'active', 'sort', 'config'] },
  questions:          { table: 'questions', key: ['id'], sortable: true,
                        fields: ['instrument_id', 'dimension', 'code', 'tier', 'text_ar', 'help_ar', 'kind', 'options', 'weight', 'active', 'sort', 'competency_ar', 'chapter_key',
                                 'anchor_code', 'retro', 'text_rater_ar', 'form'] },
  handbook_modules:   { table: 'handbook_modules', key: ['id'], sortable: true,
                        fields: ['dimension', 'chapter_key', 'title_ar', 'min_level', 'body_md', 'sort', 'reflection_ar', 'quiz_md'] },
  learning_models:    { table: 'learning_models', key: ['id'], sortable: true,
                        fields: ['dimension', 'key', 'sort', 'title_ar', 'icon', 'summary_ar', 'when_ar', 'steps_ar', 'source_ar', 'min_level', 'points', 'fields', 'active', 'capstone_sort', 'scopes'] },
  content_items:      { table: 'content_items', key: ['id'], sortable: true,
                        fields: ['kind', 'title_ar', 'description_ar', 'url', 'minutes', 'dimension', 'min_level', 'only_level', 'track_keys', 'exclude_tracks', 'required', 'min_pct', 'sort', 'active'] },
  tracks:             { table: 'tracks', key: ['key'], sortable: true,
                        fields: ['title_ar', 'title_en', 'summary_ar', 'focus_ar', 'journey_ar', 'priority_dimension'] },
  organizations:      { table: 'organizations', key: ['id'],
                        fields: ['name', 'name_en', 'logo', 'cert_cobrand', 'cert', 'short_name', 'sector', 'seats', 'color', 'invite_code', 'domains', 'contact_name', 'contact_email', 'contact_phone', 'status', 'notes', 'contract_cents', 'show_value', 'contract_starts', 'contract_ends'] },
  instruments:        { table: 'instruments', key: ['id'], fields: ['title_ar', 'intro_ar', 'est_minutes', 'active'] },
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
      // التأسيسي بصفوف أقل: لا يُحفظ إلا إن كان أقل من العام
      const mb = Math.round(Number(f.min_rows_beginner) || 0);
      if (mb >= 1 && mb < out.min_rows) out.min_rows_beginner = mb;
      // جدول يُبنى على جدول نموذج آخر: يستورد المشارك صفوفه منه بنقرة
      const im = f.import && typeof f.import === 'object' ? f.import : null;
      if (im && /^[a-z0-9-]{2,60}$/.test(String(im.model || '')) && /^[a-z0-9_-]{1,40}$/.test(String(im.field || ''))) out.import = { model: im.model, field: im.field };
    }
    // التعمق داخل النموذج نفسه: حقل من مستوى أعلى، أو لنطاقات بعينها
    if (LEVELS.includes(f?.min_level) && f.min_level !== 'beginner') out.min_level = f.min_level;
    const scopes = (Array.isArray(f?.scopes) ? f.scopes : []).filter((x: string) => SCOPES.includes(x));
    if (scopes.length && scopes.length < SCOPES.length) out.scopes = [...new Set(scopes)];
    // حقل اسم المشروع يأخذ قيمته من بطاقة المبادرة، فلا يكتبه المشارك مرتين
    if (type === 'text' && f?.bind === 'initiative') out.bind = 'initiative';
    // حقل تعمق المسار: يظهر لمن بُعد النموذج محور الأولوية في مساره فقط
    if (f?.track === true) out.track = true;
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
  const [t, byP, mods, models] = await Promise.all([
    db.from('tracks').select('*').eq('key', key).maybeSingle(),
    placementsByParticipant(),
    db.from('handbook_modules').select('*'),
    db.from('learning_models').select('id, key, dimension, min_level, active, scopes, capstone_sort, title_ar').not('capstone_sort', 'is', null),
  ]);
  const ids = Object.entries(byP).filter(([, x]) => trackKey(x.levels) === key).map(([id, x]) => ({ id, approved: x.approved === 3 }));
  const { data: ps } = ids.length
    ? await db.from('participants').select('id, full_name, email, organization_name, status').in('id', ids.map((x) => x.id))
    : { data: [] };
  const approved = new Set(ids.filter((x) => x.approved).map((x) => x.id));
  const priority = (t.data as any)?.priority_dimension || null;
  return {
    success: true, track: t.data || { key }, levels,
    // ما يراه المشارك فعلًا: ملف التعريف وسطر أقوى أطره
    profile: await profileFor(levels, priority), strengths: strengthsLine(levels, priority),
    // المشروع التطبيقي مشتق من فصول الوثيقة بنطاق المشروع، ولا يُكتب يدويًا
    project: trackProject(models.data || [], levels, 'project', (t.data as any)?.priority_dimension || null),
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
  // بنود الأسئلة تتراكم مع كل إصدار، فتُقرأ بصفحات كي لا تقف عند حد الألف
  const res = await Promise.all(names.map((n) => all((f, t) => {
    const e = ENTITIES[n];
    let q = db.from(e.table).select('*');
    if (PROGRAM_SCOPED.has(n)) q = q.eq('program_id', programId);
    if (e.sortable) q = q.order('sort');
    return e.key.reduce((x: any, k: string) => x.order(k), q).range(f, t);
  })));
  const out: Body = { success: true, program_id: programId };
  names.forEach((n, i) => { out[n] = res[i]; });
  // أي أداة لها إجابات مُرسلة؟ تعديل أسئلتها يتطلب إصدارًا جديدًا
  const used = await all((f, t) => db.from('assessments').select('instrument_id').eq('status', 'submitted').order('id').range(f, t));
  out.locked_instruments = [...new Set(used.map((u: any) => u.instrument_id))];
  // مختبرات كل باب: يراها المحرر ويُنبَّه بها قبل حذف الباب
  const { data: labs } = await db.from('lab_items').select('key, dimension, chapter_key, title_ar, min_level, active').order('sort');
  out.lab_links = labs || [];
  out.track_stats = await trackStats();
  out.book_stats = await bookStats();
  // D07: دفعة جارية تقفل معيار التسكين (save أدناه)؛ تُعرض قبل التعديل لا بعد الضغط على حفظ
  out.running_cohort = await runningCohort(null);
  return out;
}

// ── الكتاب والنماذج: التتبع والتقييم ──
// لكل باب: كم أتمّه ومتوسط نتيجة اختباره. لكل نموذج: المسودات والمسلّم والمقيّم ومتوسط التقييم.
async function bookStats() {
  // سجلات التقدم والنقاط تتجاوز الألف بسرعة (مشارك × 27 بابًا)، فتُقرأ كلها بصفحات
  const [prog, subs, pts] = await Promise.all([
    all((f, t) => db.from('handbook_progress').select('module_id, quiz_score, quiz_total').order('participant_id').order('module_id').range(f, t)),
    all((f, t) => db.from('model_submissions').select('model_id, status, rating').order('id').range(f, t)),
    all((f, t) => db.from('points_ledger').select('participant_id, points').order('id').range(f, t)),
  ]);
  const chapters: Record<string, { done: number; score: number; total: number }> = {};
  for (const r of prog) {
    const c = (chapters[r.module_id] ||= { done: 0, score: 0, total: 0 });
    c.done++; c.score += r.quiz_score; c.total += r.quiz_total;
  }
  const models: Record<string, { draft: number; submitted: number; reviewed: number; returned: number; rated: number; rating: number }> = {};
  for (const r of subs) {
    const m = (models[r.model_id] ||= { draft: 0, submitted: 0, reviewed: 0, returned: 0, rated: 0, rating: 0 });
    m[r.status as 'draft']++;
    if (r.rating) { m.rated++; m.rating += r.rating; }
  }
  const per: Record<string, number> = {};
  for (const r of pts) per[r.participant_id] = (per[r.participant_id] || 0) + r.points;
  const totals = Object.values(per);
  return {
    chapters, models,
    readers: totals.length,
    points: { participants: totals.length, total: totals.reduce((a, n) => a + n, 0), avg: totals.length ? Math.round(totals.reduce((a, n) => a + n, 0) / totals.length) : 0 },
    to_review: subs.filter((r: any) => r.status === 'submitted').length,
  };
}

// الكتاب والنماذج كما يراها مشارك في مسار معين، مع الإجابات الصحيحة للإدارة
export async function bookPreview(b: Body) {
  const key = String(b.track || '');
  if (!/^M[1-3]I[1-3]L[1-3]$/.test(key)) throw new Fail('رمز مسار غير صالح');
  const levels = Object.fromEntries(DIMENSIONS.map((d, i) => [d, LEVELS[Number(key[i * 2 + 1]) - 1]]));
  // النطاق يغيّر الكتاب كالمستوى: بلا نطاق تُعرض كتل البرامج والمحافظ كلها كما يراها من لم يحدد نطاقه
  const scope = SCOPES.includes(String(b.scope)) ? String(b.scope) : null;
  const [t, mods, models, labs] = await Promise.all([
    db.from('tracks').select('*').eq('key', key).maybeSingle(),
    db.from('handbook_modules').select('*'),
    db.from('learning_models').select('*'),
    db.from('lab_items').select('key, dimension, chapter_key, title_ar, min_level, active').eq('active', true).order('sort'),
  ]);
  return {
    success: true, track: t.data || { key }, levels, scope,
    chapters: handbookModulesFor(mods.data || [], levels).map((m: any) => ({
      id: m.id, dimension: m.dimension, title: m.title_ar, min_level: m.min_level,
      md: filterHandbookMd(m.body_md, levels[m.dimension], scope), reflection: m.reflection_ar || '', quiz: quizFor(m.quiz_md, levels[m.dimension], scope),
      // مختبرات الباب التي تصل هذا المسار، كما تظهر للمشارك أسفل الباب
      labs: (labs.data || []).filter((l: any) => l.dimension === m.dimension && l.chapter_key === m.chapter_key
        && LEVELS.indexOf(levels[l.dimension]) >= LEVELS.indexOf(l.min_level)).map((l: any) => ({ key: l.key, title: l.title_ar })),
    })),
    // بلا نطاق تُعرض نماذج النطاقات كلها، كما تُعرض كتلها في الكتاب
    models: scope ? modelsFor(models.data || [], levels, scope) : modelsFor((models.data || []).map((m: any) => ({ ...m, scopes: [] })), levels),
  };
}

export async function submissions(b: Body) {
  let q = db.from('model_submissions')
    .select('id, status, rating, bonus, submitted_at, reviewed_at, updated_at, model_id, participant_id, participants!inner(full_name, email, organization_name, is_demo), learning_models(title_ar, dimension, points)')
    .neq('status', 'draft').eq('participants.is_demo', false).order('submitted_at', { ascending: false }).limit(LIST_LIMIT);
  if (b.status) q = q.eq('status', String(b.status));
  if (b.model_id) q = q.eq('model_id', String(b.model_id));
  const rows = (must(await q) ?? []) as any[];
  return { success: true, submissions: rows, ...capInfo(rows) };
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
  return reviewSubmissionBy(a.email, 'admin', b);
}

// التقييم نفسه للإدارة وللمستشار الأساسي من بوابته؛ المقيّم يُسجَّل باسمه (reviewed_by)
export async function reviewSubmissionBy(reviewer: string, actor: 'admin' | 'system', b: Body) {
  const status = b.status === 'returned' ? 'returned' : 'reviewed';
  // D08: السلّم الرباعي الواحد (labels.js)
  const rating = b.rating ? Math.max(1, Math.min(RUBRIC_SCALE.levels.length, Math.round(Number(b.rating)))) : null;
  const bonus = Math.max(0, Math.min(100, Math.round(Number(b.bonus) || 0)));
  const s = must(await db.from('model_submissions').update({
    status, rating, bonus, feedback_ar: String(b.feedback || '').slice(0, 4000) || null,
    reviewed_at: new Date().toISOString(), reviewed_by: reviewer,
  }).eq('id', String(b.id)).select('id, participant_id, learning_models(title_ar)').single()) as any;
  if (status === 'reviewed' && bonus) {
    await db.from('points_ledger').upsert({ participant_id: s.participant_id, source: 'review', ref_id: s.id, points: bonus, note: `تميّز: ${s.learning_models?.title_ar || ''}` },
      { onConflict: 'participant_id,source,ref_id' });
  }
  await audit(actor, reviewer, 'submission.review', 'model_submissions', s.id, null, { status, rating, bonus, scale: RUBRIC_SCALE.version });
  // الإعادة الثانية فما بعدها للنموذج نفسه: تُعدّ من سجل التدقيق (ملاحظة الإعادة تُكتب فوق سابقتها)، وتُكتب في الملف
  if (status === 'returned') {
    const { data: prior } = await db.from('audit_log').select('after').eq('entity_id', s.id).eq('action', 'submission.review').limit(50);
    const times = (prior || []).filter((x: any) => x.after?.status === 'returned').length;
    if (times >= MODEL_RETURN_COUNT) await OB.record(s.participant_id, { code: 'model_returned_again', ref: `${s.id}:${times}`, ...RULES.model_returned_again({ title: s.learning_models?.title_ar, times }) });
  }
  const { data: who } = await db.from('participants').select('full_name, email').eq('id', s.participant_id).single();
  if (who?.email) {
    sendMail(who.email, status === 'returned' ? 'ملاحظة على نموذجك' : 'اعتُمد نموذجك',
      reviewMail(who.full_name, s.learning_models?.title_ar || 'النموذج التعليمي', status === 'returned', b.feedback)).catch((e) => console.error(e));
  }
  return { success: true };
}



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

  // الصف المخزن: لقفل المحتوى المُقاس (D01)، وللقيمة السابقة في السجل
  let current: Body | null = null;
  if (!isNew) {
    let cq = db.from(e.table).select('*');
    for (const k of e.key) cq = cq.eq(k, b.row[k]);
    current = (await cq.maybeSingle()).data || null;
  }
  // D07: معيار التسكين لا يُعدَّل أثناء دفعة جارية إلا للمدير الأعلى بتعليل مكتوب (ويُثبَّت في لقطة الدفعة)
  let runningReason: string | null = null;
  if (b.entity === 'placement_model' && !isNew) {
    const running = await runningCohort(null);
    if (running && (a.role !== 'super_admin' || String(b.reason || '').trim().length < 10)) {
      throw new Fail(`دفعة «${running}» جارية. معيار التسكين مقفل أثناءها إلا للمدير الأعلى بتعليل مكتوب`, 409, 'cohort_running');
    }
    if (running) runningReason = `${running}: ${String(b.reason).trim().slice(0, 500)}`;
  }
  const lock = lockedChanges(b.entity, row, current);
  if (lock.length) throw new Fail(lock[0].msg, 409, 'content_locked', { fields: lock.map((x) => x.field) });



  // رقم جلسات أو مدة مكتوب نصًا في وصف الرحلة يتباعد عن إعداد النشاط؛ يُكتب برمز يُملأ من مصدره
  if (b.entity === 'journey_stages' || b.entity === 'stage_requirements') {
    const TEXT = ['title_ar', 'duration_label', 'description_ar', 'activities_ar', 'outcome_ar', 'mode_note_ar', 'builds_on_ar', 'help_ar'].filter((f) => f in row);
    for (const f of TEXT) {
      const why = hardcodedFacts(row[f]);
      if (why) throw new Fail(why, 400, 'hardcoded');
    }
    if (TEXT.some((f) => String(row[f] || '').includes('{'))) {
      const pid = b.row?.program_id || row.program_id
        || (!isNew && b.entity === 'stage_requirements' ? (await db.from('stage_requirements').select('program_id').eq('id', b.row.id).maybeSingle()).data?.program_id : null)
        || await defaultProgramId();
      const codes = [...((await db.from('stage_requirements').select('code').eq('program_id', pid)).data || []), ...(row.code ? [{ code: row.code }] : [])];
      const unknown = TEXT.flatMap((f) => unknownTokens(row[f], codes));
      if (unknown.length) throw new Fail(`الرمز يشير إلى نشاط غير موجود: ${[...new Set(unknown)].join('، ')}`, 400, 'token');
    }
  }

  // قواعد المرحلة: قيم معروفة فقط، ولا حلقة ولا مرجع لمرحلة مخفية في الرحلة بعد الحفظ
  if (b.entity === 'journey_stages' && 'rules' in row) {
    const pid = String(b.row.program_id);
    const { data: siblings } = await db.from('journey_stages').select('key, title_ar, sort, active, rules').eq('program_id', pid);
    const list = siblings || [];
    try { row.rules = cleanStageRules(row.rules, list.map((s: any) => s.key), String(b.row.key)); }
    catch (err) { throw new Fail((err as Error).message, 400, 'rules'); }
    const after = list.map((s: any) => (s.key === b.row.key ? { ...s, ...row } : s));
    const bad = stageRulesIssues(after).find((x: any) => x.level === 'error' && (x.stage === b.row.key || /حلقة/.test(x.msg)));
    if (bad) throw new Fail(bad.msg, 400, 'rules');
  }

  // كتلة لم تُغلق أو وسم غير معروف يغيّر ما يصل كل مسار، فلا يُحفظ
  if (b.entity === 'handbook_modules' && 'body_md' in row) {
    const level = row.min_level || (isNew ? 'beginner' : (await db.from('handbook_modules').select('min_level').eq('id', b.row.id).single()).data?.min_level);
    const bad = lintHandbookMd(row.body_md, level).filter((x: any) => x.level === 'error');
    if (bad.length) throw new Fail(`السطر ${bad[0].line}: ${bad[0].msg}`, 400, 'blocks');
  }

  if (b.entity === 'organizations') {
    // D20: رمز الدعوة عشرة أحرف عشوائية على الأقل، وتفريغ الحقل وحفظه يدوّر الرمز. الرمز القائم يمر بلا فحص حتى يُدوَّر
    if (isNew || ('invite_code' in row && String(row.invite_code || '').trim().toLowerCase() !== String(current?.invite_code || ''))) {
      const code = String(row.invite_code || '').trim().toLowerCase() || inviteCode();
      if (!INVITE_CODE_RE.test(code)) throw new Fail(`رمز الدعوة: ${INVITE_CODE_RULE_AR}. اتركه فارغًا ليُولَّد رمز عشوائي`);
      row.invite_code = code;
    }
    if (isNew && !String(row.name || '').trim()) throw new Fail('اسم الجهة مطلوب');
    // تخصيص شهادة الجهة: ما لا يُذكر يُورث من الإعداد العام
    if ('cert' in row) row.cert = cleanProfile(row.cert && typeof row.cert === 'object' ? row.cert : {}, true);
    if ('domains' in row) {
      // يقبل الروابط الكاملة أو النطاقات، مفصولة بفواصل أو أسطر؛ ويرفض اللواحق العامة ونطاقات البريد العام (domains.js)
      const raw = Array.isArray(row.domains) ? row.domains : String(row.domains || '').split(/[\s,،]+/);
      const list = [...new Set(raw.map((d: unknown) => String(d || '').trim()).filter(Boolean).map((d: string) => {
        const why = orgDomainIssue(d);
        if (why) throw new Fail(`${why}: ${d}`);
        return hostOf(d) as string;
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
    if ('capstone_sort' in row) {
      const n = row.capstone_sort === '' || row.capstone_sort == null ? null : Math.round(Number(row.capstone_sort));
      row.capstone_sort = n != null && Number.isFinite(n) && n >= 1 && n <= 999 ? n : null;
    }
    if ('scopes' in row) {
      const sc = [...new Set((Array.isArray(row.scopes) ? row.scopes : []).filter((x: string) => SCOPES.includes(x)))];
      row.scopes = sc.length === SCOPES.length ? [] : sc;
    }
    if (isNew && !String(row.title_ar || '').trim()) throw new Fail('اسم النموذج مطلوب');
    row.updated_at = new Date().toISOString();
  }

  // ختم المصدر (D01، 20261107100000_leaders_content_provenance): بريد المشرف ووقت الحفظ، إلزامي فلا يُحفظ بلا ختم
  const stamp: Body = STAMPED.has(b.entity) ? { updated_at: new Date().toISOString(), updated_by: a.email } : {};
  const write = (extra: Body) => {
    if (isNew) return db.from(e.table).insert({ ...row, ...extra }).select('*').single();
    let q = db.from(e.table).update({ ...row, ...extra });
    for (const k of e.key) q = q.eq(k, b.row[k]);
    return q.select('*').single();
  };
  const saved = must(await write(stamp), isNew ? 'تعذّر الحفظ، تأكد من عدم تكرار الرمز' : 'تعذّر الحفظ') as Body;
  const before = current ? Object.fromEntries(Object.keys(row).filter((k) => JSON.stringify(row[k] ?? null) !== JSON.stringify(current![k] ?? null)).map((k) => [k, current![k] ?? null])) : null;
  await audit('admin', a.email, `${b.entity}.save`, b.entity, e.key.map((k) => saved[k]).join(':'), before, row);
  if (runningReason) await audit('admin', a.email, 'placement_model.running-change', 'placement_model', '1', before, { reason: runningReason });
  return { success: true, row: saved };
}

// رمز دعوة عشوائي من 12 حرفًا بلا الأحرف الملتبسة (0 وo و1 وl)
const INVITE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export const inviteCode = (n = 12) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => INVITE_ALPHABET[x % INVITE_ALPHABET.length]).join('');

// جداول المحتوى التي تحمل updated_at وupdated_by
const STAMPED = new Set(['handbook_modules', 'questions', 'instruments', 'learning_models', 'content_items', 'tracks', 'grid_cells', 'journey_stages', 'stage_requirements']);

export async function remove(a: Admin, b: Body) {
  requireWrite(a);
  const e = ENTITIES[b.entity];
  if (!e || e.key[0] !== 'id') throw new Fail('لا يمكن حذف هذا النوع، عطّله بدل حذفه');
  if (removeLocked(b.entity)) throw new Fail(`لا يُحذف هذا من اللوحة: ${REPO_EDIT_AR}`, 409, 'content_locked');
  if (b.entity === 'learning_models') {
    const { count } = await db.from('model_submissions').select('id', { count: 'exact', head: true }).eq('model_id', b.id);
    if (count) throw new Fail('لهذا النموذج أعمال مشاركين؛ أوقفه بدل حذفه حتى لا تضيع أعمالهم', 409);
  }
  if (b.entity === 'handbook_modules') {
    // حذف الباب يمحو تقدم قرائه ونتائج اختبارهم (cascade)، فلا يُحذف باب له قراء
    const { count } = await db.from('handbook_progress').select('module_id', { count: 'exact', head: true }).eq('module_id', b.id);
    if (count) throw new Fail(`أتمّ هذا الباب ${count} مشارك، وحذفه يمحو تقدمهم ونقاطهم. حرّر محتواه بدل حذفه`, 409, 'in_use');
  }
  if (b.entity === 'content_items') {
    const { count } = await db.from('content_progress').select('item_id', { count: 'exact', head: true }).eq('item_id', b.id);
    if (count) throw new Fail('لهذه المادة تقدم مشاركين؛ أوقفها بدل حذفها حتى لا يضيع', 409);
  }
  if (b.entity === 'organizations') {
    requireSuper(a);   // حذف جهة نهائي: للمدير الأعلى وحده
    const [{ count: ps }, { count: rs }] = await Promise.all([
      db.from('participants').select('id', { count: 'exact', head: true }).eq('organization_id', b.id),
      db.from('reports').select('id', { count: 'exact', head: true }).eq('organization_id', b.id),
    ]);
    if (ps || rs) throw new Fail(`للجهة ${ps || 0} مشارك و${rs || 0} تقرير؛ انقلهم أولًا أو أوقف الجهة بدل حذفها`, 409, 'org_in_use');
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
// D01 وD03: الإصدار من مولّد المستودع (scripts/questions) والتفعيل بترحيل محروس. كان الإجراء ينسخ الأداة أو يفعّلها
// من اللوحة، فيتخطى حارس ما قبل التفعيل ويطفئ أداة بعدية يحتاجها من بدأ على المبدئي السابق.
export async function cloneInstrument(a: Admin, _b: Body) {
  requireWrite(a);
  throw new Fail(`إصدار أداة القياس يُبنى في المستودع: ${REPO_EDIT_AR}`, 409, 'content_locked');
}

// كما في cloneInstrument: التفعيل بترحيل محروس
export async function activateInstrument(a: Admin, _b: Body) {
  requireWrite(a);
  throw new Fail('تفعيل أداة القياس بترحيل محروس بعد توقيع لجنة القياس (D03)، لا من اللوحة', 409, 'content_locked');
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

// ── استيراد المشاركين دفعة واحدة (جهة بخمسين مشاركًا لا تُدخَل واحدًا واحدًا) ──
// dry_run: يتحقق ويعيد حال كل صف ولا يكتب. بدونه يضيف الصفوف الجاهزة وحدها، ولا يمس مسجلًا من قبل.
// لا بريد يُرسل: المضاف يدخل بريده في صفحة الدخول فيصله رمزه كأي مشارك، والمنسق يشارك رابط الجهة.
// المقاعد لا تُحجز هنا: يُثبَّت الراعي لكل مضاف بالمسار القائم (pinSponsorFor) فيأخذ مقعدًا إن بقي.
export async function participantsImport(a: Admin, b: Body) {
  requireWrite(a);
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) throw new Fail('لا صفوف في الجدول');
  const over = importLimitIssue(rows.length);
  if (over) throw new Fail(over);
  let org: any = null;
  if (b.organization_id) {
    org = must(await db.from('organizations').select('id, name, status').eq('id', String(b.organization_id)).maybeSingle());
    if (!org) throw new Fail('الجهة غير موجودة', 404);
  }
  const emails = [...new Set(rows.map((r: any) => normalizeEmail(r?.email)).filter(isEmail))];
  const existing = new Set<string>();
  for (let i = 0; i < emails.length; i += 100) {
    const found = must(await db.from('participants').select('email').in('email', emails.slice(i, i + 100))) as any[];
    for (const f of found || []) existing.add(f.email);
  }
  const checked = checkImport(rows, existing) as any[];
  if (b.dry_run) return { success: true, dry_run: true, rows: checked, counts: importCounts(checked), organization: org?.name || null };
  const ready = checked.filter((r) => r.status === 'ok');
  let seated = 0;
  for (const r of ready) {
    const { data, error } = await db.from('participants').insert({
      email: r.email, full_name: r.full_name, phone: r.phone, job_title: r.job_title, source: 'import',
      organization_name: org?.name || null, ...(org ? { organization_id: org.id, org_via: 'admin' } : {}),
    }).select('id').single();
    // سباق مع تسجيل ذاتي بالبريد نفسه بين الفحص والكتابة: يُعد مسجلًا ولا تفشل الدفعة
    if (error || !data) { r.status = 'failed'; r.reason = 'تعذّرت إضافته؛ قد يكون سُجّل للتو'; continue; }
    r.status = 'created';
    if (org && await pinSponsorFor(data.id)) seated += 1;
  }
  const counts = importCounts(checked);
  await audit('admin', a.email, 'participants.import', 'participants', org?.id || null, null, { organization: org?.name || null, counts, seated });
  return { success: true, rows: checked, counts, seated, organization: org?.name || null };
}

// ── تذكير أسبوعي (يُشغّله pg_cron بسرّ LEADERS_CRON_SECRET) ──
// يُذكَّر من غاب 7 أيام وأمامه عمل: بنود أعادها المستشار، أو تسجيل لم يكتمل.
// لا يُذكَّر أحد أكثر من مرة في الأسبوع، والحد 200 رسالة في التشغيلة.
export async function lateMilestoneNotices(limit = 200) {
  const { data: people } = await db.from('participants').select('*').in('status', ['placed', 'enrolled']).eq('is_demo', false).limit(limit);
  let n = 0;
  for (const p of people || []) {
    const j: any = await journeyFor(p, { lite: true }).catch(() => null);
    for (const m of (j?.milestones || []).filter((x: any) => x.status === 'late' && x.late_days > MILESTONE_GRACE_DAYS)) {
      const saved = await OB.record(p.id, { code: 'milestone_late', ref: String(m.id || m.key), ...RULES.milestone_late({ title: m.title_ar || m.title, late_days: m.late_days }) });
      if (saved) n += 1;
    }
  }
  return n;
}

export async function reminders(b: Record<string, any>) {
  if (!secretEquals(b.secret, CONFIG.cronSecret)) throw new Fail('غير مصرّح', 403, 'forbidden');
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: people } = await db.from('participants')
    .select('id, full_name, email, status')
    .neq('status', 'suspended').eq('is_demo', false)
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
    await sendMail(p.email, 'رحلتك القيادية بانتظارك', reminderMail(p.full_name, open), [], { kind: 'bulk', ref: `participant:${p.id}` }).catch((e) => console.error(e));
    sent += 1;
  }
  // المعالم المتأخرة: تُكتب في ملف صاحبها ويُبلَّغ بها مرة لكل معلم (كانت تظهر في الموقع وحده بلا بريد ولا أثر)
  const late = await lateMilestoneNotices().catch((e) => { console.error('late milestones:', e); return 0; });
  return { success: true, sent, late };
}
