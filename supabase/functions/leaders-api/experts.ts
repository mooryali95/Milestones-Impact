// ════════════════════════════════════════════════════════════════
// الخبراء: طلب الانضمام، والدعوة، والاعتماد، والملف في لوحة الإدارة
// ════════════════════════════════════════════════════════════════
// ملف واحد للشخص بعدة أدوار. لا يعمل خبير قبل اعتماده (active)، وسعر الساعة
// والملاحظة الداخلية للإدارة وحدها: expertPublic يحذفهما من كل رد لغيرها.
import { esc, mailButton, mailCode, mailNote, mailShell, mailText } from '../_shared/mail.ts';
import { GOOGLE_CLIENT_ID, SITES } from '../_shared/sites.js';
import { verifyGoogleToken } from './google.ts';
import { audit, CONFIG, consentNeeded, db, Fail, hash, logConsent, mailGuard, must, randomCode, randomToken, reserveCodeAttempt, sendMail, sendOrDiscard } from './core.ts';
import { requireWrite } from './admin.ts';
import { DOOR, rolesOf, wrongDoor } from './doors.ts';
import { cleanExpert, cleanRating, expertPublic, linkAfterDecisionOk, LINK_CLOSED_AR, expertStats, googleIdentity, isEmail, MATCH_WEIGHTS, normalizeEmail, normalizePhone, OFFER_HOURS, rankExperts, ratingSummary, teamFirst } from './logic.js';
import { cohortOf } from './programs.ts';
import { CONSULT_CONTEXT, CONSULT_ROLES, DIM_AR, EXPERT_REQUEST_STATUS, EXPERT_ROLE_AR, EXPERT_STATUS, LEVEL_AR, RATE_TO_EXPERT, RATE_TO_PARTICIPANT } from './labels.js';

type Body = Record<string, any>;
type Ctx = { ip: string | null };
type Admin = import('./admin.ts').Admin;

const shell = (title: string, body: string, preheader = '') => mailShell(title, body, { family: 'experts', preheader });
import { firstName } from './hall.js';

// ── طلب الانضمام (مفتوح) ──
// بريد واحد لملف واحد، وحد لكل شبكة في الساعة، ولا يكشف الرد إن كان البريد مسجلًا
export async function apply(b: Body, ctx: Ctx) {
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('البريد الإلكتروني غير صحيح');
  const fields = cleanExpert(b);
  if (!fields.full_name || fields.full_name.length < 3) throw new Fail('اكتب اسمك الكامل');
  if (!fields.roles.length) throw new Fail('اختر دورًا واحدًا على الأقل');
  if (!fields.dimensions.length) throw new Fail('اختر بُعدًا واحدًا على الأقل من أبعاد البرنامج');
  if (!fields.bio || fields.bio.length < 80) throw new Fail('عرّف بخبرتك في 80 حرفًا على الأقل');
  const phone = b.phone ? normalizePhone(b.phone) : null;
  if (b.phone && !phone) throw new Fail('رقم الجوال غير صحيح');
  if (ctx.ip) {
    const { count } = await db.from('experts').select('id', { count: 'exact', head: true })
      .eq('applied_ip', ctx.ip).gte('created_at', new Date(Date.now() - 36e5).toISOString());
    if ((count ?? 0) >= 5) throw new Fail('طلبات كثيرة من هذه الشبكة، حاول بعد ساعة', 429, 'rate');
  }
  const { data: exists } = await db.from('experts').select('id').eq('email', email).maybeSingle();
  if (exists) return { success: true, received: true };
  const row = must(await db.from('experts').insert({ ...fields, email, phone, status: 'applied', source: 'application', applied_ip: ctx.ip }).select('id').single()) as any;
  await audit('system', email, 'expert.apply', 'experts', row.id);
  sendMail(email, 'وصل طلب انضمامك إلى شبكة الخبراء', shell(`شكرًا ${firstName(fields.full_name)}`,
    mailText('وصلنا طلب انضمامك إلى شبكة خبراء برنامج القادة. نراجع الطلبات خلال خمسة أيام عمل، ونراسلك بالنتيجة على هذا البريد.'))).catch(() => {});
  if (CONFIG.alertEmail) {
    sendMail(CONFIG.alertEmail, `طلب انضمام خبير: ${fields.full_name}`, shell('طلب انضمام خبير جديد',
      mailText(`${esc(fields.full_name)}${fields.title ? ` · ${fields.title}` : ''}`) + mailButton(`${SITES.admin}/#/leaders/experts`, 'راجع الطلب'))).catch(() => {});
  }
  return { success: true, received: true };
}

// ── لوحة الإدارة ──
export async function adminList() {
  const [rows, { data: sessions }] = await Promise.all([
    db.from('experts').select('*').order('created_at', { ascending: false }).limit(500).then((r) => must(r) as any[]),
    db.from('coaching_sessions').select('expert_id, participant_id, status, starts_at, ends_at').not('expert_id', 'is', null).limit(5000),
  ]);
  const by: Record<string, any[]> = {};
  for (const x of sessions || []) (by[x.expert_id] ||= []).push(x);
  return { success: true, experts: rows.map((e) => ({ ...e, stats: expertStats(by[e.id] || [], e.hourly_rate) })) };
}

export async function adminGet(_a: Admin, b: Body) {
  const e = must(await db.from('experts').select('*').eq('id', String(b.id || '')).maybeSingle());
  if (!e) throw new Fail('الخبير غير موجود', 404);
  const count = (t: string) => db.from(t).select('participant_id', { count: 'exact', head: true }).eq('reviewed_by', e.email);
  const [{ data: log }, { data: sessions }, reqs, models, caps] = await Promise.all([
    db.from('audit_log').select('actor, action, created_at').eq('entity', 'experts').eq('entity_id', e.id).order('created_at', { ascending: false }).limit(30),
    db.from('coaching_sessions').select('id, participant_id, status, starts_at, ends_at, participants(full_name)').eq('expert_id', e.id).order('starts_at', { ascending: false }).limit(500),
    count('participant_requirements'), count('model_submissions'), count('capstones'),
  ]);
  // المراجعات تُنسب بالبريد: المستشار يراجع من حسابه في لوحة الإدارة بالبريد نفسه
  const reviews = { requirements: reqs.count ?? 0, models: models.count ?? 0, capstones: caps.count ?? 0 };
  return {
    success: true, expert: e, activity: log || [],
    service: { ...expertStats(sessions || [], e.hourly_rate), reviews, recent: (sessions || []).slice(0, 12) },
    ratings: await expertRatings(e.id),
  };
}

// إضافة خبير من الإدارة (يُدعى) أو تعديل ملف قائم
export async function adminSave(a: Admin, b: Body) {
  requireWrite(a);
  const fields = cleanExpert(b, { withAdmin: true });
  if (!fields.full_name || fields.full_name.length < 3) throw new Fail('اكتب اسم الخبير');
  const phone = b.phone ? normalizePhone(b.phone) : null;
  if (b.phone && !phone) throw new Fail('رقم الجوال غير صحيح');
  const now = new Date().toISOString();
  if (b.id) {
    const before = must(await db.from('experts').select('*').eq('id', String(b.id)).maybeSingle());
    if (!before) throw new Fail('الخبير غير موجود', 404);
    const saved = must(await db.from('experts').update({ ...fields, phone, updated_at: now }).eq('id', before.id).select('*').single());
    await audit('admin', a.email, 'expert.update', 'experts', saved.id, before, saved);
    return { success: true, expert: saved };
  }
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('بريد الخبير غير صحيح');
  const { data: dup } = await db.from('experts').select('id, status').eq('email', email).maybeSingle();
  if (dup) throw new Fail(`لهذا البريد ملف خبير قائم (${(EXPERT_STATUS as Record<string, string>)[dup.status] || dup.status})`, 409);
  const saved = must(await db.from('experts').insert({ ...fields, email, phone, status: 'invited', source: 'admin', invited_at: now }).select('*').single());
  await audit('admin', a.email, 'expert.create', 'experts', saved.id, null, saved);
  if (b.send_invite !== false) await invite(saved);
  return { success: true, expert: saved, invited: b.send_invite !== false };
}

// الدعوة رابط دخول إلى لوحة الخبير نفسها (لا إلى تطبيق المشارك): رمز طويل صالح سبعة أيام ولمرة واحدة،
// يمر بمسار التحقق نفسه (expert_challenges)، فيدخل المدعو ويستكمل ملفه بأسئلة الخبير ثم ينتظر الاعتماد.
const INVITE_DAYS = 7;
export const portalUrl = () => `${SITES.leaders}/x`;
async function invite(e: any) {
  const code = randomToken();
  must(await db.from('expert_challenges').insert({ expert_id: e.id, email: e.email, code_hash: await hash(code), ip: null, expires_at: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString() }));
  const link = `${portalUrl()}#invite=${encodeURIComponent(e.email)}.${code}`;
  await sendMail(e.email, 'دعوة إلى شبكة خبراء برنامج القادة', shell(`أهلًا ${firstName(e.full_name)}`,
    mailText('يسعدنا أن ندعوك للانضمام إلى شبكة خبراء برنامج القادة، لتقديم خبرتك لقادة المشاريع في مراحل البرنامج.')
    + (e.status === 'active'
      ? mailText('ملفك معتمد في الشبكة. ادخل إلى لوحتك لتتابع طلبات الخدمة وجلساتك وساعات خبرتك.') + mailButton(link, 'ادخل إلى لوحة الخبير')
      : mailText('ابدأ باستكمال ملفك كخبير: أدوارك، والأبعاد التي تتقنها، ونبذة عن خبرتك. نراجعه ثم نفعّل لوحتك.') + mailButton(link, 'استكمل ملفك كخبير'))
    + mailNote(`الرابط شخصي، صالح ${INVITE_DAYS} أيام ولمرة واحدة. بعدها تدخل من ${portalUrl()} ببريدك هذا.`)));
  await db.from('experts').update({ invited_at: new Date().toISOString() }).eq('id', e.id);
}

export async function adminInvite(a: Admin, b: Body) {
  requireWrite(a);
  const e = must(await db.from('experts').select('*').eq('id', String(b.id || '')).maybeSingle());
  if (!e) throw new Fail('الخبير غير موجود', 404);
  if (['suspended', 'rejected'].includes(e.status)) throw new Fail('غيّر حالة الخبير أولًا ثم أعد الدعوة');
  await invite(e);
  await audit('admin', a.email, 'expert.invite', 'experts', e.id);
  return { success: true };
}

// الاعتماد والإيقاف والرفض: الانتقالات المسموحة فقط، ورسالة للخبير عند الاعتماد أو الرفض
const MOVES: Record<string, string[]> = {
  applied: ['active', 'rejected'], invited: ['active', 'rejected'], active: ['paused', 'suspended'],
  paused: ['active', 'suspended'], suspended: ['active'], rejected: ['active'],
};
export async function adminSetStatus(a: Admin, b: Body) {
  requireWrite(a);
  const e = must(await db.from('experts').select('*').eq('id', String(b.id || '')).maybeSingle());
  if (!e) throw new Fail('الخبير غير موجود', 404);
  const to = String(b.status || '');
  if (!(MOVES[e.status] || []).includes(to)) throw new Fail('لا يمكن نقل الخبير إلى هذه الحالة من حالته الآن');
  if (to === 'active' && !e.roles?.length) throw new Fail('حدّد دورًا واحدًا على الأقل قبل الاعتماد');
  const now = new Date().toISOString();
  const patch: Body = { status: to, updated_at: now, ...(to === 'active' && !e.approved_at ? { approved_by: a.email, approved_at: now } : {}) };
  const saved = must(await db.from('experts').update(patch).eq('id', e.id).select('*').single());
  await audit('admin', a.email, `expert.${to}`, 'experts', e.id, { status: e.status }, { status: to, reason: b.reason || null });
  if (to === 'active' && ['applied', 'invited', 'rejected'].includes(e.status)) {
    sendMail(e.email, 'اعتُمدت في شبكة خبراء برنامج القادة', shell(`مرحبًا بك ${firstName(e.full_name)}`,
      mailText('اعتُمد ملفك في شبكة خبراء برنامج القادة. ستصلك طلبات الخدمة المناسبة لأدوارك وتخصصك، وتتابعها من لوحة الخبير.')
      + mailButton(portalUrl(), 'افتح لوحة الخبير'))).catch(() => {});
  }
  if (to === 'rejected' && e.status === 'applied') {
    sendMail(e.email, 'بخصوص طلب انضمامك إلى شبكة الخبراء', shell(`شكرًا ${firstName(e.full_name)}`,
      mailText('نقدّر اهتمامك بالانضمام إلى شبكة خبراء برنامج القادة. لا تتوافق احتياجات الدفعة الحالية مع ملفك، وسنحتفظ به لدفعات قادمة.'))).catch(() => {});
  }
  return { success: true, expert: saved };
}

// ════════════════════════════════════════════════════════════════
// الإسناد: طلب ← ترشيح ← عرض 24 ساعة ← قبول، أو انتقال للتالي
// ════════════════════════════════════════════════════════════════
// حالة الطلب في expert_requests وحدها. tried يحفظ كل من عُرض عليه فلا يعود إليه،
// وقيد «طلب قائم واحد لكل مشارك ودور» في القاعدة يمنع التكرار.
const LIVE = ['open', 'offered', 'accepted'];
const roleAr = (r: string) => (EXPERT_ROLE_AR as Record<string, string[]>)[r]?.[0] || r;

// ما يحتاجه المشارك: مستواه في البُعد المطلوب (من تسكينه) وقطاعه
async function needFor(participantId: string, role: string, dimension: string | null) {
  const p = must(await db.from('participants').select('id, full_name, email, sector, placements(dimension, level)').eq('id', participantId).maybeSingle()) as any;
  if (!p) throw new Fail('المشارك غير موجود', 404);
  if (!(EXPERT_ROLE_AR as Record<string, unknown>)[role]) throw new Fail('دور غير معروف');
  const dim = dimension && (DIM_AR as Record<string, string>)[dimension] ? dimension : null;
  const level = dim ? (p.placements || []).find((x: any) => x.dimension === dim)?.level || null : null;
  return { p, need: { role, dimension: dim, level, sector: p.sector || null } };
}

// الخبراء بحِملهم الحالي، وهل خدموا المشارك من قبل
async function candidates(need: any, participantId: string, tried: string[] = []) {
  const now = new Date().toISOString();
  let [{ data: experts }, { data: reqs }, { data: upcoming }, { data: past }, { data: me }] = await Promise.all([
    db.from('experts').select('*').eq('status', 'active').contains('roles', [need.role]),
    db.from('expert_requests').select('expert_id').in('status', ['offered', 'accepted']).not('expert_id', 'is', null),
    db.from('coaching_sessions').select('expert_id').eq('status', 'booked').gte('starts_at', now).not('expert_id', 'is', null),
    db.from('coaching_sessions').select('expert_id').eq('participant_id', participantId).not('expert_id', 'is', null),
    db.from('participants').select('id, email, organization_id').eq('id', participantId).maybeSingle(),
  ]);
  // الخبير لا يُرشَّح لنفسه حين يكون مشاركًا بالبريد نفسه
  const self = String((me as any)?.email || '').toLowerCase();
  if (self) experts = (experts || []).filter((e: any) => String(e.email || '').toLowerCase() !== self) as any;
  const tally = (rows: any[] | null) => {
    const m: Record<string, number> = {};
    for (const x of rows || []) m[x.expert_id] = (m[x.expert_id] || 0) + 1;
    return m;
  };
  const r = tally(reqs), u = tally(upcoming), served = new Set((past || []).map((x: any) => x.expert_id));
  const ratings = await ratingsBy((experts || []).map((e: any) => e.id));
  const ranked = rankExperts((experts || []).map((e: any) => ({ ...e, load: { requests: r[e.id] || 0, upcoming: u[e.id] || 0 }, served: served.has(e.id), rating: ratings[e.id] || null })), need, tried);
  return teamFirst(ranked, await cohortTeam(me));
}

// فريق دفعة المشارك: مستشارها الأساسي وخبراء cohort_experts. خطأ القراءة لا يوقف طلب الخبير: يُعرض الترتيب العام.
export async function cohortTeam(p: any): Promise<string[]> {
  if (!p?.id) return [];
  try {
    const { cohort } = await cohortOf(p);
    const c: any = cohort;
    if (!c?.id) return [];
    const { data } = await db.from('cohort_experts').select('expert_id').eq('cohort_id', c.id);
    return [...new Set([c.advisor_expert_id, ...(data || []).map((x: any) => x.expert_id)].filter(Boolean))] as string[];
  } catch { return []; }
}

// معاينة الترشيح للإدارة قبل الإسناد، بتفصيل النقاط
export async function adminMatch(_a: Admin, b: Body) {
  const { need } = await needFor(String(b.participant_id || ''), String(b.role || ''), b.dimension || null);
  const list = await candidates(need, String(b.participant_id));
  return {
    success: true, need, weights: MATCH_WEIGHTS,
    candidates: list.slice(0, 8).map((e: any) => ({ id: e.id, full_name: e.full_name, title: e.title, roles: e.roles, dimensions: e.dimensions, levels: e.levels, weekly_hours: e.weekly_hours, load: e.load, served: e.served, match: e.match })),
  };
}

// يعرض الطلب على التالي في الترتيب (أو على خبير بعينه)، ويغلقه «لا خبير مطابق» حين تنفد القائمة
async function offerNext(req: any, pick?: any) {
  const { p, need } = await needFor(req.participant_id, req.role, req.dimension);
  const list = pick ? [pick] : await candidates(need, req.participant_id, req.tried || []);
  const now = new Date();
  if (!list.length) {
    await db.from('expert_requests').update({ status: 'unmatched', expert_id: null, offer_token_hash: null, expires_at: null, updated_at: now.toISOString() }).eq('id', req.id);
    await audit('system', null, 'expert-request.unmatched', 'expert_requests', req.id);
    if (CONFIG.alertEmail) {
      sendMail(CONFIG.alertEmail, `لا خبير متاح: ${roleAr(req.role)} لـ ${p.full_name}`, shell('طلب بلا خبير مطابق',
        mailText(`لم يقبل أحد من الخبراء المطابقين طلب ${roleAr(req.role)} للمشارك ${esc(p.full_name)}، أو لا أحد متاح. أسنده يدويًا أو أضف خبيرًا.`)
        + mailButton(`${SITES.admin}/#/leaders/experts?view=requests`, 'افتح الطلبات'))).catch(() => {});
    }
    return { status: 'unmatched' };
  }
  const e = list[0];
  const token = randomToken();
  const expires = new Date(now.getTime() + OFFER_HOURS * 36e5);
  must(await db.from('expert_requests').update({
    status: 'offered', expert_id: e.id, offer_token_hash: await hash(token), offered_at: now.toISOString(), expires_at: expires.toISOString(),
    score: e.match?.total ?? null, updated_at: now.toISOString(),
  }).eq('id', req.id));
  await audit('system', null, 'expert-request.offered', 'expert_requests', req.id, null, { expert_id: e.id, score: e.match?.total ?? null });
  const what = [roleAr(req.role), need.dimension ? (DIM_AR as Record<string, string>)[need.dimension] : null, need.level ? `مستوى ${(LEVEL_AR as Record<string, string>)[need.level]}` : null].filter(Boolean).join(' · ');
  sendMail(e.email, `طلب خدمة: ${roleAr(req.role)}`, shell(`أهلًا ${firstName(e.full_name)}`,
    mailText(`رشّحك النظام لخدمة مشارك في برنامج القادة: <b>${esc(what)}</b>.`)
    + (req.note ? mailNote(`<b>ما يحتاجه:</b> ${esc(req.note)}`) : '')
    + mailText(`لديك ${OFFER_HOURS} ساعة لتقبل أو تعتذر، وبعدها يُعرض الطلب على الخبير التالي.`)
    + mailButton(`${SITES.leaders}/offer?t=${token}`, 'راجع الطلب'))).catch(() => {});
  return { status: 'offered', expert_id: e.id };
}

// إسناد من الإدارة: تلقائي للأنسب، أو لخبير بعينه بسبب مسجّل إن لم يكن الأول في الترتيب
export async function adminAssign(a: Admin, b: Body) {
  requireWrite(a);
  const participantId = String(b.participant_id || '');
  const role = String(b.role || '');
  const { need } = await needFor(participantId, role, b.dimension || null);
  const { data: live } = await db.from('expert_requests').select('id, status').eq('participant_id', participantId).eq('role', role).in('status', LIVE).maybeSingle();
  if (live) throw new Fail(`للمشارك طلب ${roleAr(role)} قائم (${(EXPERT_STATUS as any)[live.status] || live.status}). ألغِه أولًا`, 409);
  let pick = null;
  if (b.expert_id) {
    const list = await candidates(need, participantId);
    pick = list.find((e: any) => e.id === b.expert_id);
    if (!pick) throw new Fail('الخبير المختار غير متاح لهذا الدور (غير نشط، أو بلا هذا الدور، أو اكتملت طاقته)');
    if (list[0]?.id !== pick.id && !String(b.reason || '').trim()) throw new Fail('اكتب سبب اختيار غير الأول في الترشيح');
  }
  const req = must(await db.from('expert_requests').insert({
    participant_id: participantId, role, dimension: need.dimension, status: 'open', created_by: a.email,
    manual_reason: pick ? String(b.reason || '').trim().slice(0, 500) || null : null, note: b.note ? String(b.note).slice(0, 1000) : null,
  }).select('*').single()) as any;
  await audit('admin', a.email, 'expert-request.create', 'expert_requests', req.id, null, { participant_id: participantId, role, expert_id: pick?.id || null });
  const r = await offerNext(req, pick);
  return { success: true, request_id: req.id, ...r };
}

export async function adminRequests() {
  const { data } = await db.from('expert_requests').select('*, participants(full_name, email), experts(full_name)').order('created_at', { ascending: false }).limit(300);
  return { success: true, requests: data || [] };
}

export async function adminCancelRequest(a: Admin, b: Body) {
  requireWrite(a);
  const r = must(await db.from('expert_requests').select('id, status').eq('id', String(b.id || '')).maybeSingle()) as any;
  if (!r) throw new Fail('الطلب غير موجود', 404);
  if (!LIVE.includes(r.status)) throw new Fail('الطلب مغلق أصلًا');
  await db.from('expert_requests').update({ status: 'cancelled', offer_token_hash: null, updated_at: new Date().toISOString() }).eq('id', r.id);
  await audit('admin', a.email, 'expert-request.cancel', 'expert_requests', r.id, { status: r.status }, { reason: b.reason || null });
  return { success: true };
}

// إغلاق طلب مقبول بعد أداء الخدمة: يحرر سعة الخبير، ويفتح تقييمه (المرحلة 5)
export async function adminCompleteRequest(a: Admin, b: Body) {
  requireWrite(a);
  const r = must(await db.from('expert_requests').select('id, status').eq('id', String(b.id || '')).maybeSingle()) as any;
  if (!r || r.status !== 'accepted') throw new Fail('يُغلق الطلب المقبول فقط');
  await db.from('expert_requests').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', r.id);
  await audit('admin', a.email, 'expert-request.complete', 'expert_requests', r.id);
  return { success: true };
}

// إعادة المحاولة لطلب «لا خبير مطابق» بعد إضافة خبراء: يبدأ الترتيب من جديد بلا من اعتذر
export async function adminRetryRequest(a: Admin, b: Body) {
  requireWrite(a);
  const r = must(await db.from('expert_requests').select('*').eq('id', String(b.id || '')).maybeSingle()) as any;
  if (!r || r.status !== 'unmatched') throw new Fail('إعادة المحاولة لطلب بلا خبير مطابق فقط');
  await audit('admin', a.email, 'expert-request.retry', 'expert_requests', r.id);
  return { success: true, ...(await offerNext(r)) };
}

// ── رد الخبير برابط العرض (مفتوح، الرمز وحده هو الإذن) ──
async function offerByToken(t: unknown) {
  if (typeof t !== 'string' || t.length < 20) throw new Fail('الرابط غير صحيح', 404);
  const r = must(await db.from('expert_requests').select('*, experts(full_name), participants(full_name, placements(dimension, level))').eq('offer_token_hash', await hash(t)).maybeSingle()) as any;
  if (!r) throw new Fail('انتهى هذا العرض أو لم يعد لك', 404, 'gone');
  // العرض المقبول يعرض اسم المشارك كاملًا: يُطّلع عليه 30 يومًا بعد القرار ثم يُغلق (4.5). المنتظر تحكمه مهلته
  if (r.status !== 'offered' && !linkAfterDecisionOk(r.accepted_at || r.updated_at)) throw new Fail(LINK_CLOSED_AR, 410, 'gone');
  return r;
}
export async function offerGet(b: Body) {
  const r = await offerByToken(b.t);
  const lvl = r.dimension ? (r.participants?.placements || []).find((x: any) => x.dimension === r.dimension)?.level : null;
  return {
    success: true,
    offer: {
      status: r.status, expert: r.experts?.full_name, role: r.role, role_ar: roleAr(r.role),
      dimension_ar: r.dimension ? (DIM_AR as Record<string, string>)[r.dimension] : null, level_ar: lvl ? (LEVEL_AR as Record<string, string>)[lvl] : null,
      // قبل القبول: الاسم الأول وحده
      participant: r.status === 'accepted' ? r.participants?.full_name : firstName(r.participants?.full_name), expires_at: r.expires_at,
      note: r.note || null, context: r.manual_reason?.startsWith('اختيار المشارك') ? r.manual_reason.split(' · ')[1] || null : null,
    },
  };
}
export async function offerRespond(b: Body) {
  const r = await offerByToken(b.t);
  if (r.status !== 'offered') throw new Fail('لم يعد هذا العرض قائمًا', 409, 'gone');
  const now = new Date().toISOString();
  if (b.accept === true) {
    if (Date.parse(r.expires_at) < Date.now()) throw new Fail('انتهت مهلة هذا العرض', 409, 'gone');
    must(await db.from('expert_requests').update({ status: 'accepted', accepted_at: now, updated_at: now }).eq('id', r.id));
    await audit('system', null, 'expert-request.accepted', 'expert_requests', r.id, null, { expert_id: r.expert_id });
    const { data: p } = await db.from('participants').select('full_name, email').eq('id', r.participant_id).maybeSingle();
    if (p?.email) {
      sendMail(p.email, `خبيرك في برنامج القادة: ${r.experts?.full_name}`, shell(`أهلًا ${firstName(p.full_name)}`,
        mailText(`أُسند إليك <b>${esc(r.experts?.full_name)}</b> ${roleAr(r.role)} في رحلتك. ستجده في رحلتك، وتصلك منه مواعيد الجلسات.`)
        + mailButton(SITES.leaders, 'افتح رحلتك'))).catch(() => {});
    }
    return { success: true, accepted: true };
  }
  // اعتذار: يُسجّل ويُعرض الطلب على التالي
  const tried = [...new Set([...(r.tried || []), r.expert_id].filter(Boolean))];
  await db.from('expert_requests').update({ status: 'open', expert_id: null, offer_token_hash: null, tried, updated_at: now }).eq('id', r.id);
  await audit('system', null, 'expert-request.declined', 'expert_requests', r.id, null, { expert_id: r.expert_id, reason: b.reason ? String(b.reason).slice(0, 300) : null });
  await offerNext({ ...r, tried });
  return { success: true, accepted: false };
}

// ── كل ساعة: العروض المنتهية تنتقل للتالي ──
export async function sweepOffers(b: Body) {
  if (!CONFIG.cronSecret || b.secret !== CONFIG.cronSecret) throw new Fail('غير مصرّح', 403, 'forbidden');
  const { data: due } = await db.from('expert_requests').select('*').eq('status', 'offered').lt('expires_at', new Date().toISOString()).limit(100);
  let moved = 0;
  for (const r of due || []) {
    const tried = [...new Set([...(r.tried || []), r.expert_id].filter(Boolean))];
    await db.from('expert_requests').update({ status: 'open', expert_id: null, offer_token_hash: null, tried, updated_at: new Date().toISOString() }).eq('id', r.id).eq('status', 'offered');
    await audit('system', null, 'expert-request.expired', 'expert_requests', r.id, null, { expert_id: r.expert_id });
    await offerNext({ ...r, tried });
    moved += 1;
  }
  return { success: true, moved };
}

// ════════════════════════════════════════════════════════════════
// التقييم في الاتجاهين
// ════════════════════════════════════════════════════════════════
// مصدر التقييم expert_ratings وحده: تقييم واحد لكل اتجاه لكل جلسة أو طلب (فهرس فريد).
// المجمّع يدخل الترشيح (MATCH_WEIGHTS.quality) ولا يُعرض رقمه لغير الإدارة قبل MIN_RATINGS.
async function ratingsBy(ids: string[]) {
  if (!ids.length) return {};
  const { data } = await db.from('expert_ratings').select('expert_id, overall').eq('direction', 'to_expert').in('expert_id', ids);
  const by: Record<string, any[]> = {};
  for (const x of data || []) (by[x.expert_id] ||= []).push(x);
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, ratingSummary(v)]));
}
async function expertRatings(expertId: string) {
  const { data } = await db.from('expert_ratings').select('direction, scores, overall, comment, created_at, participants(full_name)')
    .eq('expert_id', expertId).order('created_at', { ascending: false }).limit(200);
  const to = (data || []).filter((x: any) => x.direction === 'to_expert');
  const avgOf = (k: string) => (to.length ? Math.round((to.reduce((a: number, x: any) => a + Number(x.scores?.[k] || 0), 0) / to.length) * 10) / 10 : null);
  return {
    summary: ratingSummary(to),
    criteria: Object.fromEntries(Object.keys(RATE_TO_EXPERT).map((k) => [k, avgOf(k)])),
    comments: to.filter((x: any) => x.comment).slice(0, 20).map((x: any) => ({ comment: x.comment, overall: x.overall, created_at: x.created_at })),
    given: (data || []).filter((x: any) => x.direction === 'to_participant').length,
  };
}

// ما ينتظر تقييم المشارك: جلساته المنعقدة مع خبير، وطلباته المكتملة، مما لم يقيّمه بعد (آخر 60 يومًا)
export async function pendingRatings(p: any) {
  const since = new Date(Date.now() - 60 * 864e5).toISOString();
  const [{ data: sessions }, { data: reqs }, { data: done }] = await Promise.all([
    db.from('coaching_sessions').select('id, starts_at, expert_id, experts(full_name, title)').eq('participant_id', p.id).eq('status', 'attended')
      .not('expert_id', 'is', null).gte('starts_at', since).order('starts_at', { ascending: false }),
    db.from('expert_requests').select('id, role, updated_at, expert_id, experts(full_name, title)').eq('participant_id', p.id).eq('status', 'completed').gte('updated_at', since),
    db.from('expert_ratings').select('session_id, request_id').eq('participant_id', p.id).eq('direction', 'to_expert'),
  ]);
  const rated = new Set((done || []).flatMap((x: any) => [x.session_id, x.request_id]).filter(Boolean));
  const items = [
    ...(sessions || []).filter((x: any) => !rated.has(x.id)).map((x: any) => ({ kind: 'session', id: x.id, when: x.starts_at, expert: x.experts?.full_name, title: x.experts?.title || null, what: 'جلسة توجيه' })),
    ...(reqs || []).filter((x: any) => !rated.has(x.id)).map((x: any) => ({ kind: 'request', id: x.id, when: x.updated_at, expert: x.experts?.full_name, title: x.experts?.title || null, what: roleAr(x.role) })),
  ];
  return { success: true, items, criteria: RATE_TO_EXPERT };
}

export async function rateExpert(p: any, b: Body) {
  const r = cleanRating(b.scores, Object.keys(RATE_TO_EXPERT));
  if (!r) throw new Fail('قيّم كل معيار من 1 إلى 5');
  let expertId: string | null = null, session_id = null, request_id = null;
  if (b.kind === 'session') {
    const s = must(await db.from('coaching_sessions').select('id, participant_id, status, expert_id').eq('id', String(b.id || '')).maybeSingle()) as any;
    if (!s || s.participant_id !== p.id || s.status !== 'attended' || !s.expert_id) throw new Fail('لا تُقيَّم إلا جلستك المنعقدة', 403);
    expertId = s.expert_id; session_id = s.id;
  } else {
    const q = must(await db.from('expert_requests').select('id, participant_id, status, expert_id').eq('id', String(b.id || '')).maybeSingle()) as any;
    if (!q || q.participant_id !== p.id || q.status !== 'completed' || !q.expert_id) throw new Fail('لا تُقيَّم إلا خدمتك المكتملة', 403);
    expertId = q.expert_id; request_id = q.id;
  }
  const { error } = await db.from('expert_ratings').insert({
    direction: 'to_expert', expert_id: expertId, participant_id: p.id, session_id, request_id,
    scores: r.scores, overall: r.overall, comment: b.comment ? String(b.comment).trim().slice(0, 1000) || null : null,
  });
  if (error) throw new Fail(error.code === '23505' ? 'قيّمت هذه الخدمة من قبل' : 'تعذّر حفظ التقييم', error.code === '23505' ? 409 : 500);
  await audit('participant', p.email, 'expert.rated', 'experts', expertId);
  return { success: true };
}

// ════════════════════════════════════════════════════════════════
// لوحة الخبير: leaders.sunkvalue.com/x
// ════════════════════════════════════════════════════════════════
// يدخل الخبير النشط برمز البريد. يرى نفسه وطلباته وجلساته ومشاركيه المقبولين فقط،
// ولا يرى سعر ساعته ولا تكلفته ولا ملاحظة الإدارة (expertPublic)، ولا متوسط تقييمه قبل MIN_RATINGS.
const SESSION_DAYS = 14;
// الدخول للمعتمد وللمدعو ومن قدّم طلبه؛ العمل (الطلبات والجلسات والتقييم) للمعتمد وحده
const portalOk = (e: any) => e && ['active', 'paused', 'invited', 'applied'].includes(e.status);
export const portalWorking = (e: any) => ['active', 'paused'].includes(e?.status);
const SENT = { success: true, sent: true };

export async function portalStart(b: Body, ctx: Ctx) {
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('البريد الإلكتروني غير صحيح');
  await mailGuard(b, ctx);
  const { data: e } = await db.from('experts').select('id, full_name, status').eq('email', email).maybeSingle();
  if (!portalOk(e)) { await wrongDoor(email, 'expert'); return SENT; }   // الرد واحد مسجلًا كان البريد أو لا، والدلالة في بريده
  const { count } = await db.from('expert_challenges').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', new Date(Date.now() - 36e5).toISOString());
  if ((count ?? 0) >= 5) throw new Fail('طلبات كثيرة لهذا البريد، حاول بعد ساعة', 429, 'rate');
  const code = randomCode();
  const row = must(await db.from('expert_challenges').insert({ expert_id: e!.id, email, code_hash: await hash(code), ip: ctx.ip, expires_at: new Date(Date.now() + CONFIG.codeMinutes * 6e4).toISOString() })
    .select('id').single()) as { id: string };
  await sendOrDiscard('expert_challenges', row.id, email, 'رمز الدخول إلى لوحة الخبير', shell('رمز الدخول إلى لوحة الخبير',
    mailText(`أهلًا ${esc(firstName(e!.full_name))}، أدخل الرمز في صفحة الدخول.`) + mailCode(code, `صالح ${CONFIG.codeMinutes} دقيقة ولمرة واحدة.`)));
  return SENT;
}

export async function portalVerify(b: Body, ctx: Ctx & { ua?: string | null }) {
  const email = normalizeEmail(b.email);
  const { data: ch } = await db.from('expert_challenges').select('*').eq('email', email).is('consumed_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!ch || new Date(ch.expires_at) < new Date()) throw new Fail('الرمز منتهي، اطلب رمزًا جديدًا', 400, 'expired');
  // المحاولة تُحجز ذريًا قبل المقارنة (الملحق 1، M2)
  await reserveCodeAttempt('expert_challenges', ch);
  if (ch.code_hash !== await hash(String(b.code || '').trim())) throw new Fail('الرمز غير صحيح', 400, 'code');
  const { data: used } = await db.from('expert_challenges').update({ consumed_at: new Date().toISOString() }).eq('id', ch.id).is('consumed_at', null).select('id');
  if (!used?.length) throw new Fail('الرمز مستخدم من قبل', 400, 'used');
  const { data: e } = await db.from('experts').select('*').eq('id', ch.expert_id).maybeSingle();
  if (!portalOk(e) || e.email !== email) throw new Fail('لا يوجد ملف خبير لهذا البريد', 403, 'denied');
  return { success: true, token: await openSession(e, ctx, 'code'), expert: { full_name: e.full_name } };
}

// الدخول بحساب جوجل: البريد الموثّق من جوجل يجب أن يطابق بريد ملف خبير معتمد. لا إنشاء حساب من هنا
export async function portalGoogle(b: Body, ctx: Ctx & { ua?: string | null }) {
  const credential = String(b.credential || '');
  if (credential.length < 100) throw new Fail('لم يكتمل الدخول بحساب Google، حاول مرة أخرى');
  const id: any = googleIdentity(await verifyGoogleToken(credential), GOOGLE_CLIENT_ID);
  if (id.error) throw new Fail(id.error, 401, 'google');
  const { data: e } = await db.from('experts').select('*').eq('email', id.email).maybeSingle();
  if (!portalOk(e)) {
    // الهوية موثقة من Google: يصح أن نعرض لصاحبها بوابته الصحيحة
    const doors = (await rolesOf(id.email)).filter((d) => d !== 'expert');
    throw new Fail(doors.length ? `هذا الحساب غير مسجل في شبكة الخبراء، وهو مسجل في ${doors.map((d) => DOOR[d].title).join(' و')}.` : 'لا يوجد ملف خبير لهذا الحساب. ادخل بالبريد المسجل في شبكة الخبراء', 403, doors.length ? `door:${doors.join(',')}` : 'denied');
  }
  return { success: true, token: await openSession(e, ctx, 'google'), expert: { full_name: e.full_name } };
}

async function openSession(e: any, ctx: Ctx & { ua?: string | null }, method: string) {
  const token = randomToken();
  must(await db.from('expert_sessions').insert({ expert_id: e.id, token_hash: await hash(token), ip: ctx.ip, user_agent: ctx.ua || null, expires_at: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString() }));
  await db.from('experts').update({ last_login_at: new Date().toISOString() }).eq('id', e.id);
  await audit('system', e.email, `expert.login.${method}`, 'experts', e.id);
  return token;
}

export async function expertFromToken(token: unknown) {
  if (typeof token !== 'string' || token.length < 20) throw new Fail('الجلسة منتهية، سجّل الدخول من جديد', 401, 'session');
  const { data: s } = await db.from('expert_sessions').select('id, expert_id, expires_at, revoked_at').eq('token_hash', await hash(token)).maybeSingle();
  if (!s || s.revoked_at || new Date(s.expires_at) < new Date()) throw new Fail('الجلسة منتهية، سجّل الدخول من جديد', 401, 'session');
  const { data: e } = await db.from('experts').select('*').eq('id', s.expert_id).maybeSingle();
  if (!portalOk(e)) throw new Fail('ملفك غير فعّال، تواصل مع الإدارة', 403, 'suspended');
  db.from('expert_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', s.id).then(() => {});
  return { expert: e, sessionId: s.id as string };
}
export async function portalLogout(sessionId: string) {
  await db.from('expert_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId);
  return { success: true };
}

// كل ما يراه الخبير في لوحته، من مصادره نفسها (expert_requests وcoaching_sessions وexpert_ratings)
// سطر الموافقة للخبير (D18): يعالج بيانات مشاركيه بموجب السياسة النافذة
export async function portalConsent(e: any) {
  await logConsent('expert', e.id, 'accept');
  await audit('system', `expert:${e.email}`, 'expert.consent', 'experts', e.id);
  return portalDashboard(e);
}

export async function portalDashboard(e: any) {
  // قبل الاعتماد: الملف وحده (يستكمله المدعو، ويراجعه من قدّم طلبه)
  const switch_to = (await rolesOf(e.email)).filter((d) => d !== 'expert');
  // D18: سطر الموافقة عند أول دخول، قبل أي بيانات مشاركين
  const consent_needed = await consentNeeded('expert', e.id);
  if (!portalWorking(e)) return { success: true, onboarding: true, switch_to, consent_needed, expert: expertPublic({ ...e, hourly_rate: undefined, admin_note: undefined }) };
  const [{ data: reqs }, { data: sessions }, { data: rated }, ratings] = await Promise.all([
    db.from('expert_requests').select('id, participant_id, role, dimension, status, expires_at, accepted_at, updated_at, participants(full_name, email, phone, job_title, organization_name, placements(dimension, level))')
      .eq('expert_id', e.id).in('status', ['offered', 'accepted', 'completed']).order('updated_at', { ascending: false }).limit(200),
    db.from('coaching_sessions').select('id, participant_id, status, starts_at, ends_at, join_url, participants(full_name)').eq('expert_id', e.id).order('starts_at', { ascending: false }).limit(500),
    db.from('expert_ratings').select('session_id, request_id').eq('expert_id', e.id).eq('direction', 'to_participant'),
    expertRatings(e.id),
  ]);
  const done = new Set((rated || []).flatMap((x: any) => [x.session_id, x.request_id]).filter(Boolean));
  const now = Date.now();
  // قبل القبول: الاسم الأول والبُعد والمستوى؛ بعده: التواصل لأداء الخدمة
  const req = (x: any) => {
    const lvl = x.dimension ? (x.participants?.placements || []).find((y: any) => y.dimension === x.dimension)?.level : null;
    const open = x.status !== 'offered';
    return {
      id: x.id, status: x.status, role: x.role, role_ar: roleAr(x.role), dimension_ar: x.dimension ? (DIM_AR as Record<string, string>)[x.dimension] : null,
      level_ar: lvl ? (LEVEL_AR as Record<string, string>)[lvl] : null, expires_at: x.expires_at, accepted_at: x.accepted_at,
      participant: open ? { name: x.participants?.full_name, email: x.participants?.email, phone: x.participants?.phone, job_title: x.participants?.job_title, org: x.participants?.organization_name }
        : { name: firstName(x.participants?.full_name) },
      to_rate: x.status === 'completed' && !done.has(x.id),
    };
  };
  const stats = expertStats(sessions || [], null);
  const advisorCohorts = ((await db.from('cohorts').select('*').eq('advisor_expert_id', e.id).neq('status', 'closed')).data || []).map((c: any) => ({ id: c.id, name: c.name, supervision: c.supervision || 'peers_expert' }));
  return {
    success: true, switch_to, consent_needed,
    // دفعاته بصفته مستشارها: للقاعة من بوابته (المرحلة 9)
    advisor_cohorts: advisorCohorts,
    expert: expertPublic({ ...e, hourly_rate: undefined, admin_note: undefined }),
    stats: { hours: stats.hours, participants: stats.participants, attended: stats.attended, upcoming: stats.upcoming, no_show: stats.no_show },
    rating: ratings.summary.visible ? { avg: ratings.summary.avg, count: ratings.summary.count, criteria: ratings.criteria } : { count: ratings.summary.count, min: 5 },
    requests: (reqs || []).map(req),
    sessions: (sessions || []).map((x: any) => ({ id: x.id, status: x.status, starts_at: x.starts_at, ends_at: x.ends_at, join_url: x.status === 'booked' && Date.parse(x.ends_at) > now ? x.join_url : null,
      participant: x.participants?.full_name, to_rate: x.status === 'attended' && !done.has(x.id) })),
    criteria: RATE_TO_PARTICIPANT,
  };
}

// الخبير قبل اعتماده يستكمل ملفه بأسئلة الخبير نفسها في طلب الانضمام، فينتقل «مدعو» إلى «بانتظار المراجعة»
export async function portalProfileSave(e: any, b: Body) {
  if (portalWorking(e)) throw new Fail('ملفك معتمد؛ تعديله من الإدارة', 409);
  const fields = cleanExpert(b);
  if (!fields.full_name || fields.full_name.length < 3) throw new Fail('اكتب اسمك الكامل');
  if (!fields.roles.length) throw new Fail('اختر دورًا واحدًا على الأقل');
  if (!fields.dimensions.length) throw new Fail('اختر بُعدًا واحدًا على الأقل من أبعاد البرنامج');
  if (!fields.bio || fields.bio.length < 80) throw new Fail('عرّف بخبرتك في 80 حرفًا على الأقل');
  const phone = b.phone ? normalizePhone(b.phone) : null;
  if (b.phone && !phone) throw new Fail('رقم الجوال غير صحيح');
  const first = e.status === 'invited';
  const saved = must(await db.from('experts').update({ ...fields, phone, status: 'applied', updated_at: new Date().toISOString() }).eq('id', e.id).select('*').single());
  await audit('system', e.email, 'expert.profile', 'experts', e.id, { status: e.status }, { status: 'applied' });
  if (first && CONFIG.alertEmail) {
    sendMail(CONFIG.alertEmail, `خبير مدعو استكمل ملفه: ${fields.full_name}`, shell('ملف خبير جاهز للاعتماد',
      mailText(`${esc(fields.full_name)}${fields.title ? ` · ${fields.title}` : ''}`) + mailButton(`${SITES.admin}/#/leaders/experts`, 'راجع الملف'))).catch(() => {});
  }
  return { success: true, expert: expertPublic({ ...saved, hourly_rate: undefined, admin_note: undefined }) };
}

// رد الخبير من لوحته على عرض قائم له (الرابط في البريد يعمل أيضًا)
export async function portalRespond(e: any, b: Body) {
  const r = must(await db.from('expert_requests').select('id, expert_id, status').eq('id', String(b.id || '')).maybeSingle()) as any;
  if (!r || r.expert_id !== e.id || r.status !== 'offered') throw new Fail('لم يعد هذا العرض قائمًا لك', 409, 'gone');
  const token = randomToken();
  await db.from('expert_requests').update({ offer_token_hash: await hash(token) }).eq('id', r.id).eq('status', 'offered');
  return offerRespond({ t: token, accept: b.accept === true, reason: b.reason });
}

// الخبير يقيّم المشارك بعد جلسة منعقدة أو خدمة مكتملة له
export async function portalRate(e: any, b: Body) {
  const r = cleanRating(b.scores, Object.keys(RATE_TO_PARTICIPANT));
  if (!r) throw new Fail('قيّم كل معيار من 1 إلى 5');
  let participantId = null, session_id = null, request_id = null;
  if (b.kind === 'session') {
    const s = must(await db.from('coaching_sessions').select('id, participant_id, status, expert_id').eq('id', String(b.id || '')).maybeSingle()) as any;
    if (!s || s.expert_id !== e.id || s.status !== 'attended') throw new Fail('تُقيَّم جلستك المنعقدة فقط', 403);
    participantId = s.participant_id; session_id = s.id;
  } else {
    const q = must(await db.from('expert_requests').select('id, participant_id, status, expert_id').eq('id', String(b.id || '')).maybeSingle()) as any;
    if (!q || q.expert_id !== e.id || q.status !== 'completed') throw new Fail('تُقيَّم خدمتك المكتملة فقط', 403);
    participantId = q.participant_id; request_id = q.id;
  }
  const { error } = await db.from('expert_ratings').insert({ direction: 'to_participant', expert_id: e.id, participant_id: participantId, session_id, request_id,
    scores: r.scores, overall: r.overall, comment: b.comment ? String(b.comment).trim().slice(0, 1000) || null : null });
  if (error) throw new Fail(error.code === '23505' ? 'قيّمت هذا من قبل' : 'تعذّر حفظ التقييم', error.code === '23505' ? 409 : 500);
  await audit('system', e.email, 'expert.rated-participant', 'participants', participantId);
  return { success: true };
}

// ════════════════════════════════════════════════════════════════
// المشارك يختار خبيره: ثلاثة مرشحين بالاسم والتقييم، والعرض على من اختاره
// ════════════════════════════════════════════════════════════════
// الترشيح نفسه (candidates وMATCH_WEIGHTS)، والطلب نفسه (expert_requests وofferNext):
// المشارك يختار من الثلاثة الأوائل فقط، والتقييم يظهر بعد MIN_RATINGS وحده، ولا سعر ولا حِمل.
const publicCard = (e: any) => ({
  id: e.id, full_name: e.full_name, title: e.title || null, bio: e.bio ? String(e.bio).slice(0, 280) : null,
  years: e.years_experience ?? null, sectors: (e.sectors || []).slice(0, 3), languages: e.languages || [],
  rating: e.rating?.visible ? { avg: e.rating.avg, count: e.rating.count } : null,
  // من فريق دفعة المشارك: تقولها الواجهة بجوار اسمه
  team: !!e.team,
});

const consultRole = (r: any) => (CONSULT_ROLES.includes(r) ? r : 'coach');
const consultContext = (c: any) => ((CONSULT_CONTEXT as Record<string, string>)[c] ? c : 'program');
const liveView = (x: any) => ({ id: x.id, role: x.role, role_ar: roleAr(x.role), status: x.status,
  status_ar: (EXPERT_REQUEST_STATUS as Record<string, string>)[x.status] || x.status, dimension: x.dimension,
  note: x.note || null, expert: x.experts?.full_name || null, title: x.experts?.title || null, expires_at: x.expires_at });

// الاستشارة متى احتاجها المشارك: طلباته القائمة، وأنسب ثلاثة للدور والمحور المختارين
export async function mySuggestions(p: any, b: Body) {
  const role = consultRole(b.role);
  const { data: live } = await db.from('expert_requests').select('id, role, status, dimension, note, expires_at, experts(full_name, title)')
    .eq('participant_id', p.id).in('status', LIVE).order('created_at', { ascending: false });
  const requests = (live || []).map(liveView);
  const busy = requests.some((x) => x.role === role);
  const roles = CONSULT_ROLES.map((r) => ({ key: r, title: roleAr(r), hint: (EXPERT_ROLE_AR as Record<string, string[]>)[r][1] }));
  const base = { success: true, role, role_ar: roleAr(role), roles, contexts: CONSULT_CONTEXT, dimensions: DIM_AR, requests };
  if (busy) return { ...base, candidates: [] };
  const { need } = await needFor(p.id, role, b.dimension || null);
  return { ...base, candidates: (await candidates(need, p.id)).slice(0, 3).map(publicCard) };
}

export async function myChoose(p: any, b: Body) {
  const role = consultRole(b.role);
  const context = consultContext(b.context);
  const note = b.note ? String(b.note).trim().slice(0, 1000) : null;
  const { need } = await needFor(p.id, role, b.dimension || null);
  const top = (await candidates(need, p.id)).slice(0, 3);
  const pick = top.find((e: any) => e.id === b.expert_id);
  if (!pick) throw new Fail('اختر أحد الخبراء المقترحين لك', 400);
  const { data, error } = await db.from('expert_requests').insert({
    participant_id: p.id, role, dimension: need.dimension, status: 'open', created_by: p.email, note,
    manual_reason: `اختيار المشارك · ${(CONSULT_CONTEXT as Record<string, string>)[context]}`,
  }).select('*').single();
  if (error) throw new Fail(error.code === '23505' ? `لديك طلب ${roleAr(role)} قائم` : 'تعذّر حفظ اختيارك', error.code === '23505' ? 409 : 500);
  await audit('participant', p.email, 'expert-request.chosen', 'expert_requests', data.id, null, { expert_id: pick.id, context });
  const r = await offerNext(data, pick);
  return { success: true, status: r.status, expert: pick.full_name };
}
