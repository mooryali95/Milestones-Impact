// ════════════════════════════════════════════════════════════════
// منسق الجهة: الدخول، ولوحة جهته، وتحكم المدير، والملخص الأسبوعي
// ════════════════════════════════════════════════════════════════
// المنسق يرى جهته فقط: الجهة تُشتق من جلسته على الخادم ولا تُقبل من
// الطلب أبدًا، والحقول تمر عبر coordParticipant حسب صلاحياته.
import { journeyDefinition } from './programs.ts';
import {
  allFor, audit, CONFIG, coordinatorInviteMail, coordinatorSignInMail, coordinatorWeeklyMail, db, Fail, hash, mailGuard, must, randomCode, randomToken, sendMail,
} from './core.ts';
import { coordParticipant, coordPermissions, isEmail, isoWeek, normalizeEmail, normalizePhone, progressPct } from './logic.js';
import { org as orgPayload, requireWrite } from './admin.ts';
import { adminReport as impactReport } from './impact.ts';
import { orgList as initiativesFor } from './capstone.ts';

type Ctx = { ip: string | null; ua: string | null };
type Body = Record<string, any>;
type Admin = import('./admin.ts').Admin;

const SENT = { success: true, sent: true };   // رد واحد سواء كان البريد منسقًا أم لا


async function coordinatorByEmail(email: string) {
  const { data } = await db.from('org_coordinators').select('*, organizations(id, name, status)').eq('email', email).maybeSingle();
  return data;
}
const usable = (c: any) => c && c.status !== 'suspended' && c.organizations?.status !== 'inactive';

// ── 1. الدخول بالبريد ──
export async function authStart(b: Body, ctx: Ctx) {
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('البريد الإلكتروني غير صحيح');
  // الحارس قبل البحث عن المنسق: الرد واحد لكل بريد، مسجلًا كان أو لا
  await mailGuard(b, ctx);
  const c = await coordinatorByEmail(email);
  if (!usable(c)) return SENT;

  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const { count } = await db.from('coordinator_challenges').select('id', { count: 'exact', head: true })
    .eq('email', email).gte('created_at', hourAgo);
  if ((count ?? 0) >= 5) throw new Fail('طلبات كثيرة لهذا البريد، حاول بعد ساعة', 429, 'rate');

  const code = randomCode();
  const link = randomToken(24);
  must(await db.from('coordinator_challenges').insert({
    coordinator_id: c.id, email, code_hash: await hash(code), link_token_hash: await hash(link), ip: ctx.ip,
    expires_at: new Date(Date.now() + CONFIG.codeMinutes * 6e4).toISOString(),
  }));
  await sendMail(email, 'رمز الدخول إلى لوحة الجهة',
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
      if (ch.attempts >= 5) throw new Fail('محاولات كثيرة، اطلب رمزًا جديدًا', 429, 'attempts');
      if (ch.code_hash !== await hash(String(b.code || '').trim())) {
        await db.from('coordinator_challenges').update({ attempts: ch.attempts + 1 }).eq('id', ch.id);
        throw new Fail('الرمز غير صحيح', 400, 'code');
      }
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
  return { success: true, token, ...(await mePayload(c)) };
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
  coordinator: { full_name: c.full_name, email: c.email, permissions: coordPermissions(c.permissions), weekly_report: c.weekly_report },
  org: { name: c.organizations.name },
});
export const me = async (c: any) => ({ success: true, ...mePayload(c) });

export async function logout(sessionId: string) {
  await db.from('coordinator_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId);
  return { success: true };
}

// ── 3. لوحة الجهة كما يراها المنسق ──
export async function dashboardFor(c: any) {
  const perms = coordPermissions(c.permissions);
  const d: any = await orgPayload({ id: c.organization_id });
  const ids = d.participants.map((p: any) => p.id);

  // متطلبات المنجزة لكل المشاركين تتجاوز حد القراءة الواحدة بسرعة، فتُقرأ بصفحات ودفعات
  const [requiredTotal, done, levels] = await Promise.all([
    // متطلبات برنامج دفعة الجهة الجارية
    journeyDefinition({ organization_id: c.organization_id }).then((def) => def.requirements.filter((r: any) => r.required).length),
    allFor(ids, () => db.from('participant_requirements').select('participant_id').eq('status', 'done').order('participant_id').order('requirement_id')),
    perms.scores ? allFor(ids, () => db.from('placements').select('participant_id, dimension, level').order('participant_id').order('dimension')) : Promise.resolve([]),
  ]);
  const doneBy: Record<string, number> = {};
  for (const r of done) doneBy[r.participant_id] = (doneBy[r.participant_id] || 0) + 1;
  const levelsBy: Record<string, Record<string, string>> = {};
  for (const l of levels as any[]) (levelsBy[l.participant_id] ||= {})[l.dimension] = l.level;

  const participants = d.participants.map((p: any) => coordParticipant(
    { ...p, progress: progressPct(doneBy[p.id] || 0, requiredTotal ?? 0), levels: levelsBy[p.id] || null }, perms));
  const weekAgo = Date.now() - 7 * 864e5;
  const avg = participants.length ? Math.round(participants.reduce((a: number, p: any) => a + p.progress, 0) / participants.length) : 0;
  return {
    success: true,
    org: { name: d.org.name, short_name: d.org.short_name, color: d.org.color, seats: d.org.seats, sector: d.org.sector },
    permissions: perms,
    funnel: d.funnel, by_track: d.by_track, by_via: d.by_via,
    kpis: {
      total: participants.length,
      joined_week: participants.filter((p: any) => Date.parse(p.created_at) > weekAgo).length,
      active_week: participants.filter((p: any) => p.last_login_at && Date.parse(p.last_login_at) > weekAgo).length,
      approved: d.funnel.approved, completed: d.funnel.completed, avg_progress: avg,
    },
    participants,
  };
}
// أثر الجهة: القياس المبدئي مقابل البعدي لمشاركيها. الأرقام المجمعة للجميع،
// وصفوف المشاركين بأسمائهم فقط لمن مُنح صلاحية المستويات، وبلا بريد دائمًا.
export async function impactFor(c: any) {
  const r: any = await impactReport({ organization_id: c.organization_id });
  const scores = coordPermissions(c.permissions).scores;
  return {
    counts: r.counts, cohort: r.cohort, transfer: r.transfer, caution: r.caution,
    participants: scores ? r.participants.filter((p: any) => p.dimensions).map((p: any) => ({ full_name: p.full_name, dimensions: p.dimensions })) : [],
  };
}
export async function dashboard(c: any) {
  const r: any = await dashboardFor(c);
  r.impact = await impactFor(c);
  // محفظة مبادرات الدفعة: مشاريع التخرج لمشاركي الجهة
  r.initiatives = await initiativesFor(c.organization_id);
  await audit('coordinator', c.email, 'coordinator.view', 'org_coordinators', c.id);
  return r;
}

// ── 4. تحكم المدير ──
async function coordinatorOf(orgId: string) {
  const { data } = await db.from('org_coordinators').select('*').eq('organization_id', orgId).maybeSingle();
  return data;
}

// حالة المنسق وجلساته ونشاطه الأخير
export async function adminGet(_a: Admin, b: Body) {
  const c = await coordinatorOf(String(b.organization_id || ''));
  if (!c) return { success: true, coordinator: null };
  const [{ data: sessions }, { data: log }] = await Promise.all([
    db.from('coordinator_sessions').select('id, method, ip, user_agent, created_at, last_seen_at, expires_at, revoked_at')
      .eq('coordinator_id', c.id).order('created_at', { ascending: false }).limit(10),
    db.from('audit_log').select('actor_type, actor, action, created_at').eq('entity', 'org_coordinators').eq('entity_id', c.id)
      .order('created_at', { ascending: false }).limit(30),
  ]);
  const now = Date.now();
  return {
    success: true,
    coordinator: { ...c, permissions: coordPermissions(c.permissions) },
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
  const { data: other } = await db.from('org_coordinators').select('organization_id, organizations(name)').eq('email', email).neq('organization_id', orgId).maybeSingle();
  if (other) throw new Fail(`هذا البريد منسق لجهة ${other.organizations?.name || 'أخرى'}`, 409);

  const before = await coordinatorOf(orgId);
  const row = {
    organization_id: orgId, email, full_name: String(b.full_name || '').trim().slice(0, 120) || null, phone,
    permissions: coordPermissions(b.permissions), weekly_report: b.weekly_report !== false, updated_at: new Date().toISOString(),
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
  // بيانات المنسق تبقى متزامنة مع بطاقة الجهة
  await db.from('organizations').update({ contact_name: row.full_name, contact_email: email, contact_phone: phone }).eq('id', orgId);
  await audit('admin', a.email, before ? 'coordinator.update' : 'coordinator.create', 'org_coordinators', saved.id, before, saved);
  let invited = false;
  if (emailChanged && saved.status !== 'suspended' && b.send_invite !== false) invited = await sendInvite(saved, o.name);
  return { success: true, coordinator: saved, invited };
}

async function sendInvite(c: any, orgName: string) {
  await sendMail(c.email, `لوحة ${orgName} في برنامج القادة`, coordinatorInviteMail(c.full_name, orgName));
  await db.from('org_coordinators').update({ invited_at: new Date().toISOString() }).eq('id', c.id);
  return true;
}

export async function adminInvite(a: Admin, b: Body) {
  requireWrite(a);
  const c = await coordinatorOf(String(b.organization_id || ''));
  if (!c) throw new Fail('لا يوجد منسق لهذه الجهة', 404);
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
  const c = await coordinatorOf(String(b.organization_id || ''));
  if (!c) throw new Fail('لا يوجد منسق لهذه الجهة', 404);
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
  const c = await coordinatorOf(String(b.organization_id || ''));
  if (!c) throw new Fail('لا يوجد منسق لهذه الجهة', 404);
  await revokeAll(c.id);
  await audit('admin', a.email, 'coordinator.revoke-sessions', 'org_coordinators', c.id);
  return { success: true };
}

export async function adminRemove(a: Admin, b: Body) {
  requireWrite(a);
  const c = await coordinatorOf(String(b.organization_id || ''));
  if (!c) return { success: true };
  await audit('admin', a.email, 'coordinator.remove', 'org_coordinators', c.id, c, null);
  must(await db.from('org_coordinators').delete().eq('id', c.id));
  return { success: true };
}

// المعاينة بعين المنسق: نفس البيانات التي يراها تمامًا، بصلاحياته الحالية
export async function adminPreview(_a: Admin, b: Body) {
  const c = await coordinatorOf(String(b.organization_id || ''));
  if (!c) throw new Fail('لا يوجد منسق لهذه الجهة', 404);
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
      await sendMail(c.email, `ملخص ${c.organizations.name} الأسبوعي`, coordinatorWeeklyMail(c.full_name, c.organizations.name, d.kpis));
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
