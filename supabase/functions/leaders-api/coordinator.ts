// ════════════════════════════════════════════════════════════════
// منسق الجهة: الدخول، ولوحة جهته، وتحكم المدير، والملخص الأسبوعي
// ════════════════════════════════════════════════════════════════
// المنسق يرى جهته فقط: الجهة تُشتق من جلسته على الخادم ولا تُقبل من
// الطلب أبدًا، والحقول تمر عبر coordParticipant حسب صلاحياته.
import { journeyFor } from './participant.ts';
import { rolesOf, wrongDoor } from './doors.ts';
import {
  allFor, audit, CONFIG, consentNeeded, coordinatorInviteMail, logConsent, orgAccessMail, coordinatorSignInMail, coordinatorWeeklyMail, db, Fail, hash, mailGuard, must, randomCode, randomToken, reserveCodeAttempt, sendMail, sendOrDiscard,
} from './core.ts';
import { coordParticipant, coordPermissions, COORD_TEMPLATES, isEmail, MIN_COHORT, orgVisibility, templateOf, viewerActive, isoWeek, normalizeEmail, normalizePhone } from './logic.js';
import { org as orgPayload, requireWrite } from './admin.ts';
import { adminReport as impactReport, awaitingFor, confirmRater } from './impact.ts';
import { orgList as initiativesFor } from './capstone.ts';
import { portfolioOutcomes } from './tracking.js';

type Ctx = { ip: string | null; ua: string | null };
type Body = Record<string, any>;
type Admin = import('./admin.ts').Admin;

const SENT = { success: true, sent: true };   // رد واحد سواء كان البريد منسقًا أم لا


async function coordinatorByEmail(email: string) {
  const { data } = await db.from('org_coordinators').select('*, organizations(id, name, status)').eq('email', email).maybeSingle();
  return data;
}
const usable = (c: any) => viewerActive(c);

// ── 1. الدخول بالبريد ──
export async function authStart(b: Body, ctx: Ctx) {
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('البريد الإلكتروني غير صحيح');
  // الحارس قبل البحث عن المنسق: الرد واحد لكل بريد، مسجلًا كان أو لا
  await mailGuard(b, ctx);
  const c = await coordinatorByEmail(email);
  if (!usable(c)) { await wrongDoor(email, 'org'); return SENT; }

  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const { count } = await db.from('coordinator_challenges').select('id', { count: 'exact', head: true })
    .eq('email', email).gte('created_at', hourAgo);
  if ((count ?? 0) >= 5) throw new Fail('طلبات كثيرة لهذا البريد، حاول بعد ساعة', 429, 'rate');

  const code = randomCode();
  const link = randomToken(24);
  const row = must(await db.from('coordinator_challenges').insert({
    coordinator_id: c.id, email, code_hash: await hash(code), link_token_hash: await hash(link), ip: ctx.ip,
    expires_at: new Date(Date.now() + CONFIG.codeMinutes * 6e4).toISOString(),
  }).select('id').single()) as { id: string };
  await sendOrDiscard('coordinator_challenges', row.id, email, 'رمز الدخول إلى لوحة الجهة',
    coordinatorSignInMail(c.full_name, code, `${CONFIG.appUrl}/org/verify?e=${encodeURIComponent(email)}&t=${link}`));
  return SENT;
}

export async function authVerify(b: Body, ctx: Ctx) {
  const email = normalizeEmail(b.email);
  let ch: any = null;
  if (b.link) {
    const { data } = await db.from('coordinator_challenges').select('*').eq('link_token_hash', await hash(String(b.link))).maybeSingle();
    if (data && data.email === email) ch = data;
  } else {
    const { data } = await db.from('coordinator_challenges').select('*').eq('email', email).is('consumed_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    ch = data;
    if (ch) {
      // المحاولة تُحجز ذريًا قبل المقارنة (الملحق 1، M2)
      await reserveCodeAttempt('coordinator_challenges', ch);
      if (ch.code_hash !== await hash(String(b.code || '').trim())) throw new Fail('الرمز غير صحيح', 400, 'code');
    }
  }
  if (!ch || ch.consumed_at || new Date(ch.expires_at) < new Date()) throw new Fail('الرابط أو الرمز منتهي، اطلب رمزًا جديدًا', 400, 'expired');
  const { data: used } = await db.from('coordinator_challenges').update({ consumed_at: new Date().toISOString() })
    .eq('id', ch.id).is('consumed_at', null).select('id');
  if (!used?.length) throw new Fail('الرابط أو الرمز مستخدم من قبل', 400, 'used');

  const c = await coordinatorByEmail(email);
  // البريد قد يكون تغيّر بعد إرسال الرمز: الرمز يخص المنسق الذي صدر له
  if (!usable(c) || c.id !== ch.coordinator_id) throw new Fail('لا يوجد حساب اطلاع فعّال لهذا البريد', 403, 'denied');

  const token = randomToken();
  must(await db.from('coordinator_sessions').insert({
    coordinator_id: c.id, token_hash: await hash(token), method: b.link ? 'email_link' : 'email_code', ip: ctx.ip, user_agent: ctx.ua,
    expires_at: new Date(Date.now() + CONFIG.coordinatorDays * 864e5).toISOString(),
  }));
  await db.from('org_coordinators').update({ last_login_at: new Date().toISOString(), status: 'active' }).eq('id', c.id);
  await audit('coordinator', c.email, 'coordinator.login', 'org_coordinators', c.id);
  return { success: true, token, ...(await mePayload(c)), switch_to: (await rolesOf(c.email)).filter((d) => d !== 'org'), consent_needed: await consentNeeded('coordinator', c.id) };
}

// ── 2. الجلسة ──
export async function fromToken(token: unknown) {
  if (typeof token !== 'string' || token.length < 20) throw new Fail('الجلسة منتهية، سجّل الدخول من جديد', 401, 'session');
  const { data: s } = await db.from('coordinator_sessions').select('id, coordinator_id, expires_at, revoked_at')
    .eq('token_hash', await hash(token)).maybeSingle();
  if (!s || s.revoked_at || new Date(s.expires_at) < new Date()) throw new Fail('الجلسة منتهية، سجّل الدخول من جديد', 401, 'session');
  const { data: c } = await db.from('org_coordinators').select('*, organizations(id, name, status)').eq('id', s.coordinator_id).maybeSingle();
  if (!usable(c)) throw new Fail('أُوقف حساب الاطلاع، تواصل مع الإدارة', 403, 'suspended');
  db.from('coordinator_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', s.id).then(() => {});
  return { coordinator: c, sessionId: s.id as string };
}

const mePayload = (c: any) => ({
  coordinator: { full_name: c.full_name, email: c.email, permissions: coordPermissions(c.permissions), template: c.template || 'program', expires_at: c.expires_at || null, weekly_report: c.weekly_report },
  org: { name: c.organizations.name },
});
export const me = async (c: any) => ({ success: true, ...mePayload(c), switch_to: (await rolesOf(c.email)).filter((d) => d !== 'org'),
  consent_needed: await consentNeeded('coordinator', c.id) });
// سطر الموافقة عند أول دخول (D18): المنسق يطّلع على بيانات مشاركي جهته بموجب السياسة النافذة
export async function consent(c: any) {
  await logConsent('coordinator', c.id, 'accept');
  await audit('coordinator', c.email, 'coordinator.consent', 'org_coordinators', c.id);
  return me(c);
}
// D19: المنسق يؤكد مقيّمي مشاركي جهته إن كان يرى قائمتهم
export async function raterConfirm(c: any, b: Record<string, any>) {
  if (!coordPermissions(c.permissions).list) throw new Fail('تأكيد المقيّمين لمن يرى قائمة المشاركين', 403, 'forbidden');
  return confirmRater({ kind: 'coordinator', email: c.email }, b, async (pid) => {
    const { data } = await db.from('participants').select('id').eq('id', pid).eq('organization_id', c.organization_id).maybeSingle();
    return !!data;
  });
}

export async function logout(sessionId: string) {
  await db.from('coordinator_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId);
  return { success: true };
}

// ── 3. لوحة الجهة كما يراها المنسق ──
export async function dashboardFor(c: any) {
  const perms = coordPermissions(c.permissions);
  const d: any = await orgPayload({ id: c.organization_id });
  const ids = d.participants.map((p: any) => p.id);

  // نسبة التقدم بالحساب نفسه الذي يراه المشارك في رحلته (journeyFor)، لا بعدّ منفصل
  const [rows, levels] = await Promise.all([
    allFor(ids, () => db.from('participants').select('*').order('id'), 'id'),
    perms.scores ? allFor(ids, () => db.from('placements').select('participant_id, dimension, level').order('participant_id').order('dimension')) : Promise.resolve([]),
  ]);
  const progressBy: Record<string, number> = {};
  const queue = [...(rows as any[])];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let r = queue.shift(); r; r = queue.shift()) progressBy[r.id] = (await journeyFor(r)).progress;
  }));
  const levelsBy: Record<string, Record<string, string>> = {};
  for (const l of levels as any[]) (levelsBy[l.participant_id] ||= {})[l.dimension] = l.level;
  // المستويات لا تخرج للجهة إلا بموافقة المشارك المسجلة (org_share_consented_at)، فوق صلاحية المنسق
  const shared = new Set((rows as any[]).filter((r: any) => r.org_share_consented_at).map((r: any) => r.id));

  // الأرقام المجمّعة من كل مشاركي الجهة، والصفوف الفردية تمر عبر الصلاحيات (بلا «القائمة» لا صف واحد)
  const full = d.participants.map((p: any) => ({ ...p, progress: progressBy[p.id] ?? 0, levels: shared.has(p.id) ? levelsBy[p.id] || null : null }));
  const participants = full.map((p: any) => coordParticipant(p, perms)).filter(Boolean);
  // D18: المسار مشتق من المستويات، فيُحصى لمن خرجت مستوياته وحدهم (صلاحية المستويات وموافقة المشارك)،
  // لا من by_track الإداري الذي يعدّ الجميع
  const byTrack: Record<string, number> = {};
  for (const p of full) if (p.levels && p.track) byTrack[p.track] = (byTrack[p.track] || 0) + 1;
  const weekAgo = Date.now() - 7 * 864e5;
  const avg = full.length ? Math.round(full.reduce((a: number, p: any) => a + p.progress, 0) / full.length) : 0;
  // استهلاك مقاعد العقد (D20): من ثبتت رعايته، ومن ينتظر قرار الرعاية لامتلائها أو لخروجه عن مدة العقد
  const [{ data: seated }, { count: waiting }] = await Promise.all([
    db.from('entitlements').select('participant_id').eq('organization_id', c.organization_id).eq('source', 'sponsor').is('revoked_at', null),
    db.from('sponsor_requests').select('id', { count: 'exact', head: true }).eq('organization_id', c.organization_id).eq('status', 'pending').in('kind', ['seats', 'contract']).then((r: any) => (r.error ? { count: 0 } : r)),
  ]);
  const seatsUsed = new Set((seated || []).map((e: any) => e.participant_id)).size;
  return {
    success: true,
    org: { name: d.org.name, short_name: d.org.short_name, color: d.org.color, seats: d.org.seats, sector: d.org.sector },
    permissions: perms,
    funnel: d.funnel, by_track: byTrack, by_via: d.by_via,
    kpis: {
      total: full.length,
      joined_week: full.filter((p: any) => Date.parse(p.created_at) > weekAgo).length,
      // عدد مجمّع من الصفوف الأصلية: يظهر ولو لم تُمنح صلاحية النشاط الفردي
      active_week: (rows as any[]).filter((p: any) => p.last_login_at && Date.parse(p.last_login_at) > weekAgo).length,
      approved: d.funnel.approved, completed: d.funnel.completed, avg_progress: avg,
      seats: d.org.seats ?? null, seats_used: seatsUsed, seats_waiting: waiting ?? 0,
    },
    participants,
  };
}
// أثر الجهة: القياس المبدئي مقابل البعدي لمشاركيها. الأرقام المجمعة للجميع،
// وصفوف المشاركين بأسمائهم فقط لمن مُنح صلاحية المستويات، وبلا بريد دائمًا.
export async function impactFor(c: any) {
  const r: any = await impactReport({ organization_id: c.organization_id });
  const scores = coordPermissions(c.permissions).scores;
  // دون الحد الأدنى تكشف المتوسطات درجة الفرد: تبقى الأعداد وتُحجب المقارنة
  if ((r.counts?.paired ?? 0) < MIN_COHORT) return { counts: r.counts, cohort: null, transfer: null, caution: null, suppressed: MIN_COHORT, participants: [] };
  // الصفوف بالأسماء لمن وافق على اطلاع جهته على مستوياته فقط
  const { data: ok } = await db.from('participants').select('id').eq('organization_id', c.organization_id).not('org_share_consented_at', 'is', null);
  const shared = new Set((ok || []).map((x: any) => x.id));
  return {
    counts: r.counts, cohort: r.cohort, transfer: r.transfer, caution: r.caution,
    participants: scores ? r.participants.filter((p: any) => p.dimensions && shared.has(p.id)).map((p: any) => ({ full_name: p.full_name, dimensions: p.dimensions })) : [],
  };
}
export async function dashboard(c: any) {
  const r: any = await dashboardFor(c);
  r.impact = await impactFor(c);
  // محفظة مبادرات الدفعة: المعتمدة وحدها، فالمسودة عمل المشارك قبل أن يكتمل
  // والأسماء فيها لمن يرى قائمة المشاركين فقط
  const list = coordPermissions(c.permissions).list;
  r.initiatives = (await initiativesFor(c.organization_id)).filter((x: any) => x.status === 'approved')
    .map((x: any) => (list ? x : { ...x, participant_id: null, full_name: null }));
  // أثر المبادرات في الجهة: من ملخص المتابعة نفسه الذي يراه القائد والمستشار
  r.outcomes = portfolioOutcomes(r.initiatives.map((x: any) => ({ summary: x.tracking, cost: x.cost })));
  // D19: مقيّمون بانتظار تأكيد المنسق، لمن يرى قائمة المشاركين
  r.raters_pending = list ? await awaitingFor((r.participants || []).map((p: any) => p.id)) : [];
  await audit('coordinator', c.email, 'coordinator.view', 'org_coordinators', c.id);
  return r;
}

// ── 4. تحكم المدير ──
// مطّلع بعينه (id) من الجهة، أو الأول فيها (جهة التواصل في بطاقة الجهة) حين لا يُحدَّد
async function coordinatorOf(orgId: string, id?: unknown) {
  let q = db.from('org_coordinators').select('*').eq('organization_id', orgId);
  q = id ? q.eq('id', String(id)) : q.order('created_at').limit(1);
  const { data } = await q;
  return (data || [])[0] || null;
}
async function viewersOf(orgId: string) {
  const { data } = await db.from('org_coordinators').select('*').eq('organization_id', orgId).order('created_at');
  return (data || []).map((c: any) => ({ ...c, permissions: coordPermissions(c.permissions), template: c.template || templateOf(c.permissions), live: viewerActive(c) }));
}

// حالة المنسق وجلساته ونشاطه الأخير
export async function adminGet(_a: Admin, b: Body) {
  const orgId = String(b.organization_id || '');
  const [c, coordinators] = await Promise.all([coordinatorOf(orgId, b.id), viewersOf(orgId)]);
  if (!c) return { success: true, coordinator: null, coordinators };
  const [{ data: sessions }, { data: log }] = await Promise.all([
    db.from('coordinator_sessions').select('id, method, ip, user_agent, created_at, last_seen_at, expires_at, revoked_at')
      .eq('coordinator_id', c.id).order('created_at', { ascending: false }).limit(10),
    db.from('audit_log').select('actor_type, actor, action, created_at').eq('entity', 'org_coordinators').eq('entity_id', c.id)
      .order('created_at', { ascending: false }).limit(30),
  ]);
  const now = Date.now();
  return {
    success: true,
    coordinator: { ...c, permissions: coordPermissions(c.permissions), template: c.template || templateOf(c.permissions) },
    coordinators,
    sessions: (sessions || []).map((s: any) => ({ ...s, active: !s.revoked_at && Date.parse(s.expires_at) > now })),
    activity: log || [],
  };
}

// إنشاء أو تحديث المنسق. تغيير البريد ينهي كل جلساته فورًا، والدعوة تُرسل عند الإنشاء أو تغيير البريد.
export async function adminSave(a: Admin, b: Body) {
  requireWrite(a);
  const orgId = String(b.organization_id || '');
  const o = must(await db.from('organizations').select('id, name').eq('id', orgId).maybeSingle());
  if (!o) throw new Fail('الجهة غير موجودة', 404);
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('بريد المنسق غير صحيح');
  const phone = b.phone ? normalizePhone(b.phone) : null;
  if (b.phone && !phone) throw new Fail('جوال المنسق غير صحيح');
  // جديد صراحة (new)، أو مطّلع بعينه (id)، أو الأول في الجهة (توافق مع بطاقة الجهة)
  const before = b.new ? null : await coordinatorOf(orgId, b.id);
  const seenBefore = orgVisibility(await viewersOf(orgId));
  if (b.id && !before) throw new Fail('المطّلع غير موجود في هذه الجهة', 404);
  // البريد لمطّلع واحد: الدخول برمز البريد يحدد صاحبه
  const { data: others } = await db.from('org_coordinators').select('id, organization_id, organizations(name)').eq('email', email);
  const other = (others || []).find((x: any) => x.id !== before?.id);
  if (other) throw new Fail(other.organization_id === orgId ? 'هذا البريد مطّلع في هذه الجهة بالفعل' : `هذا البريد مطّلع لجهة ${(other.organizations as any)?.name || 'أخرى'}`, 409);

  const template = ['executive', 'program', 'hr'].includes(b.template) ? b.template : null;
  const permissions = coordPermissions(b.permissions ?? (template ? (COORD_TEMPLATES as any)[template] : before?.permissions));
  const expires = b.expires_at ? new Date(String(b.expires_at)) : null;
  if (expires && (Number.isNaN(+expires) || +expires < Date.now())) throw new Fail('تاريخ انتهاء الاطلاع يجب أن يكون في المستقبل');
  const row = {
    organization_id: orgId, email, full_name: String(b.full_name || '').trim().slice(0, 120) || null, phone,
    permissions, template: templateOf(permissions), expires_at: 'expires_at' in b ? (expires ? expires.toISOString() : null) : before?.expires_at ?? null,
    weekly_report: b.weekly_report !== false, updated_at: new Date().toISOString(),
  };
  const emailChanged = !before || before.email !== email;
  let saved;
  if (before) {
    saved = must(await db.from('org_coordinators').update({ ...row, ...(emailChanged ? { status: 'invited', last_login_at: null } : {}) })
      .eq('id', before.id).select('*').single());
    if (emailChanged) await revokeAll(before.id);
  } else {
    saved = must(await db.from('org_coordinators').insert({ ...row, created_by: a.email }).select('*').single());
  }
  // جهة التواصل في بطاقة الجهة هي أول مطّلع فيها
  const first = await coordinatorOf(orgId);
  if (first?.id === saved.id) await db.from('organizations').update({ contact_name: row.full_name, contact_email: email, contact_phone: phone }).eq('id', orgId);
  await audit('admin', a.email, before ? 'coordinator.update' : 'coordinator.create', 'org_coordinators', saved.id, before, saved);
  await notifyNewAccess(orgId, o.name, seenBefore);
  let invited = false;
  if (emailChanged && saved.status !== 'suspended' && b.send_invite !== false) invited = await sendInvite(saved, o.name);
  return { success: true, coordinator: saved, invited };
}

// الشفافية: حين يتسع ما تراه الجهة عن مشاركيها (حقل لم يكن يراه أي مطّلع نافذ)، يُبلَّغ كل مشارك بما فُتح
const SENSITIVE: Record<string, string> = { list: 'اسمك وتقدّمك في الرحلة', activity: 'آخر دخول لك', contact: 'بريدك وجوالك', scores: 'مسارك ومستوياتك في الأبعاد الثلاثة إن وافقت' };
async function notifyNewAccess(orgId: string, orgName: string, before: Record<string, any>) {
  const after: Record<string, any> = orgVisibility(await viewersOf(orgId));
  const opened = Object.keys(SENSITIVE).filter((k) => after[k] && !before[k]).map((k) => SENSITIVE[k]);
  if (!opened.length) return;
  await audit('system', null, 'org.access-widened', 'organizations', orgId, null, { opened });
  const { data: people } = await db.from('participants').select('full_name, email').eq('organization_id', orgId).neq('status', 'withdrawn').limit(500);
  for (const p of people || []) {
    if (p.email) sendMail(p.email, `${orgName} تطّلع على رحلتك`, orgAccessMail(p.full_name, orgName, opened)).catch((e) => console.error('org access mail', e));
  }
}

async function sendInvite(c: any, orgName: string) {
  await sendMail(c.email, `لوحة ${orgName} في برنامج القادة`, coordinatorInviteMail(c.full_name, orgName));
  await db.from('org_coordinators').update({ invited_at: new Date().toISOString() }).eq('id', c.id);
  return true;
}

export async function adminInvite(a: Admin, b: Body) {
  requireWrite(a);
  const c = await coordinatorOf(String(b.organization_id || ''), b.id);
  if (!c) throw new Fail('لا يوجد مطّلع بهذا التحديد في الجهة', 404);
  if (c.status === 'suspended') throw new Fail('فعّل الحساب أولًا ثم أعد إرسال الدعوة');
  const { data: o } = await db.from('organizations').select('name').eq('id', c.organization_id).single();
  await sendInvite(c, o?.name || '');
  await audit('admin', a.email, 'coordinator.invite', 'org_coordinators', c.id);
  return { success: true };
}

async function revokeAll(coordinatorId: string) {
  await db.from('coordinator_sessions').update({ revoked_at: new Date().toISOString() }).eq('coordinator_id', coordinatorId).is('revoked_at', null);
}

export async function adminSetStatus(a: Admin, b: Body) {
  requireWrite(a);
  const c = await coordinatorOf(String(b.organization_id || ''), b.id);
  if (!c) throw new Fail('لا يوجد مطّلع بهذا التحديد في الجهة', 404);
  const suspend = b.suspended === true;
  await db.from('org_coordinators').update({
    status: suspend ? 'suspended' : (c.last_login_at ? 'active' : 'invited'), updated_at: new Date().toISOString(),
  }).eq('id', c.id);
  if (suspend) await revokeAll(c.id);
  await audit('admin', a.email, suspend ? 'coordinator.suspend' : 'coordinator.resume', 'org_coordinators', c.id);
  return { success: true };
}

export async function adminRevokeSessions(a: Admin, b: Body) {
  requireWrite(a);
  const c = await coordinatorOf(String(b.organization_id || ''), b.id);
  if (!c) throw new Fail('لا يوجد مطّلع بهذا التحديد في الجهة', 404);
  await revokeAll(c.id);
  await audit('admin', a.email, 'coordinator.revoke-sessions', 'org_coordinators', c.id);
  return { success: true };
}

export async function adminRemove(a: Admin, b: Body) {
  requireWrite(a);
  const c = await coordinatorOf(String(b.organization_id || ''), b.id);
  if (!c) return { success: true };
  await audit('admin', a.email, 'coordinator.remove', 'org_coordinators', c.id, c, null);
  must(await db.from('org_coordinators').delete().eq('id', c.id));
  return { success: true };
}

// المعاينة بعين المنسق: نفس البيانات التي يراها تمامًا، بصلاحياته الحالية
export async function adminPreview(_a: Admin, b: Body) {
  const c = await coordinatorOf(String(b.organization_id || ''), b.id);
  if (!c) throw new Fail('لا يوجد مطّلع بهذا التحديد في الجهة', 404);
  return dashboardFor(c);
}

// ── 5. الملخص الأسبوعي (من cron.reminders) ──
// مرة في الأسبوع لكل منسق فعّال لجهة نشطة، ولا يُكرر في الأسبوع نفسه.
export async function weeklyReports() {
  const { data: list } = await db.from('org_coordinators').select('*, organizations(id, name, status)')
    .eq('weekly_report', true).neq('status', 'suspended').limit(500);
  const week = isoWeek();
  let sent = 0;
  for (const c of list || []) {
    if (!usable(c)) continue;
    if (c.last_report_at && isoWeek(new Date(c.last_report_at)) === week) continue;
    try {
      const d = await dashboardFor(c);
      await db.from('org_coordinators').update({ last_report_at: new Date().toISOString() }).eq('id', c.id);
      await sendMail(c.email, `ملخص ${c.organizations.name} الأسبوعي`, coordinatorWeeklyMail(c.full_name, c.organizations.name, d.kpis), [], { kind: 'bulk', ref: `coordinator:${c.id}` });
      await audit('system', null, 'coordinator.weekly-report', 'org_coordinators', c.id);
      sent += 1;
    } catch (e) { console.error('weekly report', c.id, e); }
  }
  return sent;
}

// ── 6. أثر حذف الجهة: يُعرض على المدير قبل التأكيد ──
export async function orgImpact(_a: Admin, b: Body) {
  const id = String(b.id || '');
  const [{ count: participants }, { count: reports }, coord] = await Promise.all([
    db.from('participants').select('id', { count: 'exact', head: true }).eq('organization_id', id),
    db.from('reports').select('id', { count: 'exact', head: true }).eq('organization_id', id),
    coordinatorOf(id),
  ]);
  return { success: true, participants: participants ?? 0, reports: reports ?? 0, coordinator: !!coord };
}
