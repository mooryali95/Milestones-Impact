// ════════════════════════════════════════════════════════════════
// إجراءات المشارك: الدخول بالبريد، الملف، القياس، الرحلة
// ════════════════════════════════════════════════════════════════
import {
  audit, BUCKET, CONFIG, db, Fail, hash, mailGuard, must, randomCode, randomToken, sendMail, signInMail, storage,
} from './core.ts';
import {
  AUTO_CHECKS, SCOPES, buildJourney, googleIdentity, chapterPoints, cleanAnswers, filterHandbookMd, gradeQuiz, handbookModulesFor, missingFields, modelsFor, parseQuiz, rankFor, shuffleQuiz, overallLevel, isEmail, trackKey, journeyProgress, normalizeEmail, normalizePhone, placementFromAnswers, scoreFor,
  seededShuffle, beforePercents, DEFAULT_MODEL, formFor, forForm, usesForms, skillSplit, commonBehavior,
  VERIFIED_KINDS, readingVerdict, fieldsFor,
} from './logic.js';
import { bindAnswers, CHARTER_KEY, importRows, initiativeOf } from './capstone.js';
import { evidenceFor, participantItem } from './activities.ts';
import { journeyDefinition, requirementFor } from './programs.ts';
import { GOOGLE_CLIENT_ID } from '../_shared/sites.js';

type Ctx = { ip: string | null; ua: string | null };
type Body = Record<string, any>;

// ── الجلسة ──
export async function issueSession(participantId: string, method: string, ctx: Ctx) {
  const token = randomToken();
  const expires = new Date(Date.now() + CONFIG.sessionDays * 864e5).toISOString();
  must(await db.from('auth_sessions').insert({
    participant_id: participantId, token_hash: await hash(token), method, ip: ctx.ip, user_agent: ctx.ua, expires_at: expires,
  }));
  await db.from('participants').update({ last_login_at: new Date().toISOString() }).eq('id', participantId);
  return token;
}

export async function participantFromToken(token: unknown) {
  if (typeof token !== 'string' || token.length < 20) throw new Fail('الجلسة منتهية، سجّل الدخول من جديد', 401, 'session');
  const { data: s } = await db.from('auth_sessions')
    .select('id, participant_id, expires_at, revoked_at').eq('token_hash', await hash(token)).maybeSingle();
  if (!s || s.revoked_at || new Date(s.expires_at) < new Date()) throw new Fail('الجلسة منتهية، سجّل الدخول من جديد', 401, 'session');
  const p = must(await db.from('participants').select('*').eq('id', s.participant_id).single());
  if (p.status === 'suspended') throw new Fail('الحساب موقوف، تواصل مع الإدارة', 403, 'suspended');
  // الاستعمال يجدد المدة: تنتهي الجلسة بعد sessionDays من آخر نشاط لا من الدخول
  const now = Date.now();
  const touch: Record<string, string> = { last_seen_at: new Date(now).toISOString() };
  if (new Date(s.expires_at).getTime() - now < (CONFIG.sessionDays - 1) * 864e5) touch.expires_at = new Date(now + CONFIG.sessionDays * 864e5).toISOString();
  db.from('auth_sessions').update(touch).eq('id', s.id).then(() => {});
  return { participant: p, sessionId: s.id as string };
}

// ── نسب المشارك لجهته ──
// الأولوية: رمز الرابط ثم نطاق الموقع الذي جاء منه (أو أحد نطاقاته الأم)
const ORG_COLS = 'id, name, short_name, color, status';
const live = (o: any) => (o && o.status !== 'inactive' ? o : null);

async function orgByCode(code: unknown) {
  const c = String(code || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{4,40}$/.test(c)) return null;
  const { data } = await db.from('organizations').select(ORG_COLS).ilike('invite_code', c).maybeSingle();
  return live(data);
}

export function hostOf(ref: unknown) {
  const s = String(ref || '').trim().toLowerCase();
  if (!s) return null;
  try {
    const h = new URL(s.includes('://') ? s : `https://${s}`).hostname.replace(/^www\./, '');
    return /^[a-z0-9.-]{3,120}$/.test(h) && h.includes('.') ? h : null;
  } catch { return null; }
}

async function orgByHost(host: string | null) {
  if (!host) return null;
  // mi.manzoma.sa تطابق mi.manzoma.sa ثم manzoma.sa، والأدق يفوز
  const parts = host.split('.');
  const candidates = parts.slice(0, -1).map((_, i) => parts.slice(i).join('.'));
  const { data } = await db.from('organizations').select(`${ORG_COLS}, domains`).overlaps('domains', candidates);
  for (const c of candidates) {
    const hit = (data || []).find((o: any) => live(o) && (o.domains || []).includes(c));
    if (hit) return hit;
  }
  return null;
}

const campaignOf = (c: unknown) => {
  const s = String(c || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(s) ? s : null;
};

async function resolveOrg(b: Body) {
  const byCode = await orgByCode(b.org);
  if (byCode) return { org: byCode, via: 'link' as const };
  const byHost = await orgByHost(hostOf(b.ref));
  return byHost ? { org: byHost, via: 'domain' as const } : null;
}

// يعرض اسم الجهة في شاشة التسجيل قبل إدخال البريد
export async function orgInfo(b: Body) {
  const r = await resolveOrg(b);
  if (!r) return { success: false, message: 'رابط الجهة غير صالح أو منتهٍ', code: 'org' };
  return { success: true, via: r.via, org: { name: r.org.name, short_name: r.org.short_name, color: r.org.color } };
}

// ── 1. بدء الدخول أو التسجيل ──
// بريد واحد يحمل رابطًا ورمزًا. لبريد جديد نطلب الاسم أولًا (needs_profile)،
// ولا نكشف أبدًا هل البريد مسجل لغير صاحبه: الرد واحد في الحالتين بعد الإرسال.
export async function authStart(b: Body, ctx: Ctx) {
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('البريد الإلكتروني غير صحيح');

  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const { count: perEmail } = await db.from('email_challenges').select('id', { count: 'exact', head: true })
    .eq('email', email).gte('created_at', hourAgo);
  if ((perEmail ?? 0) >= 5) throw new Fail('طلبات كثيرة لهذا البريد، حاول بعد ساعة', 429, 'rate');

  const { data: existing } = await db.from('participants').select('id, full_name').eq('email', email).maybeSingle();
  let pending: Body | null = null;
  if (!existing) {
    const name = String(b.full_name || '').trim();
    if (name.length < 3) return { success: true, needs_name: true };
    const phone = b.phone ? normalizePhone(b.phone) : null;
    if (b.phone && !phone) throw new Fail('رقم الجوال غير صحيح');
    // التسجيل عبر رابط جهة أو من موقعها: يُنسب المشارك لها تلقائيًا
    const r = await resolveOrg(b);
    pending = {
      full_name: name.slice(0, 120), phone, campaign: campaignOf(b.campaign), referrer_host: hostOf(b.ref),
      ...(r ? { organization_id: r.org.id, organization_name: r.org.name, org_via: r.via } : {}),
    };
  }

  await mailGuard(b, ctx);
  const code = randomCode();
  const link = randomToken(24);
  must(await db.from('email_challenges').insert({
    email, purpose: existing ? 'login' : 'register', code_hash: await hash(code), link_token_hash: await hash(link),
    pending_profile: pending, ip: ctx.ip, expires_at: new Date(Date.now() + CONFIG.codeMinutes * 6e4).toISOString(),
  }));
  const url = `${CONFIG.appUrl}/verify?e=${encodeURIComponent(email)}&t=${link}`;
  await sendMail(email, existing ? 'رمز الدخول إلى رحلتك' : 'أكمل تسجيلك في برنامج القادة',
    signInMail(existing?.full_name || pending?.full_name || '', code, url, !existing));
  return { success: true, sent: true };
}

// ── 2. التحقق بالرمز أو الرابط ──
export async function authVerify(b: Body, ctx: Ctx) {
  const email = normalizeEmail(b.email);
  let ch: any = null;
  if (b.link) {
    const { data } = await db.from('email_challenges').select('*').eq('link_token_hash', await hash(String(b.link))).maybeSingle();
    if (data && data.email === email) ch = data;
  } else {
    const { data } = await db.from('email_challenges').select('*').eq('email', email).is('consumed_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    ch = data;
    if (ch) {
      if (ch.attempts >= 5) throw new Fail('محاولات كثيرة، اطلب رمزًا جديدًا', 429, 'attempts');
      if (ch.code_hash !== await hash(String(b.code || '').trim())) {
        await db.from('email_challenges').update({ attempts: ch.attempts + 1 }).eq('id', ch.id);
        throw new Fail('الرمز غير صحيح', 400, 'code');
      }
    }
  }
  if (!ch || ch.consumed_at || new Date(ch.expires_at) < new Date()) {
    throw new Fail('الرابط أو الرمز منتهي، اطلب رمزًا جديدًا', 400, 'expired');
  }
  // استهلاك ذري: لو سبق استخدامه في طلب موازٍ لا يُحدَّث أي صف
  const { data: used } = await db.from('email_challenges').update({ consumed_at: new Date().toISOString() })
    .eq('id', ch.id).is('consumed_at', null).select('id');
  if (!used?.length) throw new Fail('الرابط أو الرمز مستخدم من قبل', 400, 'used');

  let { data: p } = await db.from('participants').select('*').eq('email', email).maybeSingle();
  if (!p) {
    if (ch.purpose !== 'register' || !ch.pending_profile) throw new Fail('ابدأ التسجيل من جديد', 400, 'restart');
    p = must(await db.from('participants').insert({
      email, full_name: ch.pending_profile.full_name, phone: ch.pending_profile.phone,
      organization_id: ch.pending_profile.organization_id || null, organization_name: ch.pending_profile.organization_name || null,
      org_via: ch.pending_profile.org_via || null, campaign: ch.pending_profile.campaign || null, referrer_host: ch.pending_profile.referrer_host || null,
      email_verified_at: new Date().toISOString(), source: ch.pending_profile.organization_id ? 'invite' : 'self',
    }).select('*').single());
    await audit('participant', p.id, 'participant.register', 'participants', p.id);
  } else if (!p.email_verified_at) {
    await db.from('participants').update({ email_verified_at: new Date().toISOString() }).eq('id', p.id);
  }
  const token = await issueSession(p.id, b.link ? 'email_link' : 'email_code', ctx);
  return { success: true, token, ...(await mePayload(p)) };
}

// ── 3. الدخول بحساب Google ──
// يتحقق Google من التوقيع (tokeninfo)، ونتحقق نحن من العميل والمُصدر والصلاحية والبريد الموثّق.
// البريد الموجود يُفتح حسابه، والجديد يُنشأ بالاسم من جوجل ويُكمل ملفه كالمعتاد.
export async function authGoogle(b: Body, ctx: Ctx) {
  const credential = String(b.credential || '');
  if (credential.length < 100) throw new Fail('لم يكتمل الدخول بجوجل، حاول مرة أخرى');
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!res.ok) throw new Fail('تعذّر التحقق من حساب جوجل، حاول مرة أخرى', 401, 'google');
  const id: any = googleIdentity(await res.json(), GOOGLE_CLIENT_ID);
  if (id.error) throw new Fail(id.error, 401, 'google');

  let { data: p } = await db.from('participants').select('*').eq('email', id.email).maybeSingle();
  if (!p) {
    const r = await resolveOrg(b);
    p = must(await db.from('participants').insert({
      email: id.email, full_name: id.name || id.email.split('@')[0], email_verified_at: new Date().toISOString(),
      campaign: campaignOf(b.campaign), referrer_host: hostOf(b.ref),
      ...(r ? { organization_id: r.org.id, organization_name: r.org.name, org_via: r.via } : {}),
      source: r ? 'invite' : 'self',
    }).select('*').single());
    await audit('participant', p.id, 'participant.register', 'participants', p.id, null, { via: 'google' });
  } else if (!p.email_verified_at) {
    await db.from('participants').update({ email_verified_at: new Date().toISOString() }).eq('id', p.id);
  }
  if (p.status === 'suspended') throw new Fail('الحساب موقوف، تواصل مع الإدارة', 403, 'suspended');
  const token = await issueSession(p.id, 'google', ctx);
  return { success: true, token, ...(await mePayload(p)) };
}

export async function logout(sessionId: string) {
  await db.from('auth_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId);
  return { success: true };
}

// أجهزة المشارك: الجلسات السارية، وإنهاء غير الحالية
export async function sessionsList(p: any, sessionId: string) {
  const { data } = await db.from('auth_sessions').select('id, method, user_agent, created_at, last_seen_at')
    .eq('participant_id', p.id).is('revoked_at', null).gt('expires_at', new Date().toISOString())
    .order('last_seen_at', { ascending: false, nullsFirst: false }).limit(20);
  return { success: true, sessions: (data || []).map((x) => ({ ...x, current: x.id === sessionId })) };
}

export async function sessionsRevoke(p: any, b: Body, sessionId: string) {
  let q = db.from('auth_sessions').update({ revoked_at: new Date().toISOString() }).eq('participant_id', p.id).is('revoked_at', null).neq('id', sessionId);
  if (b.id) q = q.eq('id', String(b.id));
  must(await q);
  return sessionsList(p, sessionId);
}

// ── 3. حالة المشارك كاملة ──
async function activeInstrument(kind = 'baseline') {
  const { data } = await db.from('instruments').select('*').eq('kind', kind).eq('active', true)
    .order('version', { ascending: false }).limit(1).maybeSingle();
  return data;
}

// آخر قياس مبدئي أرسله المشارك، بأداته وصيغته
export async function lastBaseline(participantId: string) {
  const { data } = await db.from('assessments').select('id, form, instrument_id, instruments!inner(key, kind)')
    .eq('participant_id', participantId).eq('status', 'submitted').eq('instruments.kind', 'baseline')
    .order('submitted_at', { ascending: false }).limit(1).maybeSingle();
  return data as any;
}

// الأداة البعدية التي تقابل قياس المشارك المبدئي (pairs_with)، فمن بدأ على
// v3 يُختم بـ post-v1 ومن بدأ على v4 بـ post-v2. وإلا أحدث أداة بعدية مفعّلة.
export async function postInstrumentFor(participantId: string) {
  const [{ data: posts }, base] = await Promise.all([
    db.from('instruments').select('*').eq('kind', 'post').eq('active', true).order('version', { ascending: false }),
    lastBaseline(participantId),
  ]);
  const list = posts || [];
  const key = base?.instruments?.key;
  return list.find((i: any) => key && i.pairs_with === key) || list.find((i: any) => !i.pairs_with) || list[0] || null;
}

// audience 'participant' (الافتراضي): مستوى واحد ملخص دون تفصيل الأبعاد.
// audience 'admin': التفصيل الكامل لكل بُعد.
// هوية المسار: للمشارك اسمه ووصفه فقط، وللإدارة الرمز ومحور الأولوية أيضًا.
const TRACK_FIELDS = 'key, title_ar, summary_ar, focus_ar, project_ar, journey_ar, priority_dimension';
async function trackFor(levels: Record<string, string>) {
  const key = trackKey(levels);
  if (!key) return null;
  const { data } = await db.from('tracks').select(TRACK_FIELDS).eq('key', key).maybeSingle();
  return data || { key };
}
const trackView = (t: any, audience: 'participant' | 'admin') => !t ? null : {
  ...(audience === 'admin' ? { key: t.key, priority_dimension: t.priority_dimension || null } : {}),
  title: t.title_ar || null, summary: t.summary_ar || null, focus: t.focus_ar || null,
  project: t.project_ar || null, journey: t.journey_ar || null,
};

// الرحلة ونسبة التقدم من مصدر واحد: يستعملها المشارك والإدارة ومنسق الجهة، فلا يرى أحدهم رقمًا غير الآخر
export async function journeyFor(p: any) {
  const [placements, def, progress, assessments, reports] = await Promise.all([
    db.from('placements').select('dimension, level, approved_at, admin_note').eq('participant_id', p.id),
    journeyDefinition(p),
    db.from('participant_requirements').select('*').eq('participant_id', p.id),
    db.from('assessments').select('id, status, submitted_at, instruments(kind)').eq('participant_id', p.id),
    db.from('reports').select('id, issued_at').eq('participant_id', p.id).not('issued_at', 'is', null),
  ]);
  const pl = placements.data || [];
  const levels = Object.fromEntries(pl.map((x: any) => [x.dimension, x.level]));
  const approved = pl.length === 3 && pl.every((x: any) => x.approved_at);
  const submitted = (kind: string) => (assessments.data || []).some((a: any) => a.status === 'submitted' && a.instruments?.kind === kind);
  const state = {
    profileCompleted: !!p.profile_completed_at,
    hasCv: !!p.cv_path,
    baselineSubmitted: submitted('baseline'),
    placementApproved: approved,
    postSubmitted: submitted('post'),
    reportIssued: (reports.data || []).length > 0,
  };
  const prog = Object.fromEntries((progress.data || []).map((r: any) => [r.requirement_id, r]));
  const activity = await evidenceFor(p, def.requirements, levels, approved, def.cohort?.id || null);
  const journey = buildJourney({ stages: def.stages, requirements: def.requirements, progress: prog, levels, state, activity });
  return { pl, levels, approved, def, journey, progress: journeyProgress(journey) };
}

export async function mePayload(p: any, audience: 'participant' | 'admin' = 'participant') {
  const [{ pl, levels, approved, def, journey, progress }, passkeys, cells, org] = await Promise.all([
    journeyFor(p),
    db.from('passkeys').select('id', { count: 'exact', head: true }).eq('participant_id', p.id),
    db.from('grid_cells').select('dimension, level, description_ar, path_title_ar'),
    p.organization_id
      ? db.from('organizations').select('name, short_name, color, status, updated_at, has_logo').eq('id', p.organization_id).maybeSingle().then((r: any) => r.data)
      : null,
  ]);
  const track = trackView(await trackFor(levels), audience);
  const cellOf = (d: string, l: string) => (cells.data || []).find((c: any) => c.dimension === d && c.level === l);

  return {
    participant: {
      id: p.id, email: p.email, full_name: p.full_name, name_en: p.name_en || null, name_locked: !!p.name_locked_at, phone: p.phone, job_title: p.job_title,
      organization_name: p.organization_name, organization_linked: !!p.organization_id, sector: p.sector, years_experience: p.years_experience, work_scope: p.work_scope || null,
      bio: p.bio, linkedin_url: p.linkedin_url, has_cv: !!p.cv_path, status: p.status,
    },
    // المستوى يظهر مبدئيًا فور القياس، ويُعلَّم معتمدًا بعد قرار المستشار
    profile: !pl.length ? null : audience === 'admin' ? {
      approved, track,
      dimensions: pl.map((x: any) => ({
        dimension: x.dimension, level: x.level, approved: !!x.approved_at, note: x.admin_note,
        description: cellOf(x.dimension, x.level)?.description_ar || null,
        path: cellOf(x.dimension, x.level)?.path_title_ar || null,
      })),
    } : { approved, level: overallLevel(levels), track },
    journey: audience === 'admin' ? journey
      : journey.map((st: any) => ({ ...st, items: st.items.map(({ dimension: _d, level: _l, ...it }: any) => participantItem(it, p)) })),
    progress,
    // هوية الجهة: يرى المشارك شعارها ولونها بجانب Milestone Impact
    // الشعار نفسه كبير، فيُجلب مرة بـ org.logo ويُخزَّن على الجهاز بنسخته (logo_v)
    org: org && org.status === 'active'
      ? { name: org.name, short_name: org.short_name || null, color: org.color || null, logo_v: org.has_logo ? org.updated_at : null }
      : null,
    // الدفعة: اسمها وتواريخها للمشارك، ومصدرها والبرنامج ونسخته للإدارة
    cohort: !def.cohort || def.cohort.is_default ? null : { name: def.cohort.name, starts_on: def.cohort.starts_on, ends_on: def.cohort.ends_on },
    ...(audience === 'admin' ? { program: { id: def.program_id, cohort: def.cohort, via: def.via, version: def.version } } : {}),
    passkeys: passkeys.count ?? 0,
    prompt_passkey: (passkeys.count ?? 0) === 0 && !p.passkey_dismissed_at,
  };
}

export async function me(p: any) {
  return { success: true, ...(await mePayload(p)) };
}

export async function orgLogo(p: any) {
  if (!p.organization_id) return { success: true, logo: null };
  const { data } = await db.from('organizations').select('logo, status, updated_at').eq('id', p.organization_id).maybeSingle();
  return { success: true, logo: data?.status === 'active' ? data.logo || null : null, v: data?.updated_at || null };
}

// ── 4. الملف الشخصي ──
const PROFILE_FIELDS: Record<string, number> = {
  full_name: 120, name_en: 120, job_title: 120, organization_name: 200, sector: 120, bio: 2000, linkedin_url: 300,
};

export async function profileSave(p: any, b: Body) {
  const f = b.fields || {};
  const patch: Body = {};
  for (const [k, max] of Object.entries(PROFILE_FIELDS)) {
    if (k in f) patch[k] = String(f[k] ?? '').trim().slice(0, max) || null;
  }
  if ('phone' in f) {
    const phone = f.phone ? normalizePhone(f.phone) : null;
    if (f.phone && !phone) throw new Fail('رقم الجوال غير صحيح');
    patch.phone = phone;
  }
  // الجهة المرتبطة مصدر اسمها: لا يُكتب اسم ثانٍ بجانبها
  if (p.organization_id) delete patch.organization_name;
  if ('work_scope' in f) {
    patch.work_scope = SCOPES.includes(f.work_scope) ? f.work_scope : null;
    // النطاق يحدد فصول وثيقة المبادرة، فلا يتغير وهي عند المراجعة أو معتمدة
    if (patch.work_scope !== (p.work_scope || null) && CAPSTONE_LOCKED.includes(await capstoneStatus(p.id))) {
      throw new Fail('نطاق عملك مثبت في وثيقة مبادرتك المسلّمة، ولا يتغير حتى تعود إليك', 409, 'scope_locked');
    }
  }
  if ('years_experience' in f) {
    const y = Number(f.years_experience);
    patch.years_experience = Number.isFinite(y) && y >= 0 && y <= 60 ? Math.round(y) : null;
  }
  // بعد إصدار الشهادة يُقفل الاسم؛ التصحيح بإعادة الإصدار من الإدارة
  if (p.name_locked_at) {
    if (('full_name' in patch && patch.full_name !== p.full_name) || ('name_en' in patch && patch.name_en !== (p.name_en || null))) {
      throw new Fail('اسمك مقفل بعد إصدار الشهادة. لتصحيحه تواصل مع إدارة البرنامج', 409, 'name_locked');
    }
  }
  if (patch.name_en && !/^[A-Za-z][A-Za-z .'-]{1,119}$/.test(patch.name_en)) {
    throw new Fail('الاسم بالإنجليزية بأحرف لاتينية فقط');
  }
  if (patch.linkedin_url && !/^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(patch.linkedin_url)) {
    throw new Fail('رابط LinkedIn غير صحيح');
  }
  const merged = { ...p, ...patch };
  const complete = merged.full_name && merged.phone && merged.job_title && merged.organization_name && merged.years_experience != null;
  if (complete && !p.profile_completed_at) {
    patch.profile_completed_at = new Date().toISOString();
    if (p.status === 'registered') patch.status = 'profiled';
  }
  const updated = must(await db.from('participants').update(patch).eq('id', p.id).select('*').single());
  return { success: true, ...(await mePayload(updated)) };
}

// رفع السيرة الذاتية أو دليل متطلب: رابط رفع موقّع إلى مخزن خاص
export async function uploadUrl(p: any, b: Body) {
  const purpose = b.purpose === 'cv' ? 'cv' : 'evidence';
  const ext = String(b.ext || '').toLowerCase();
  if (!['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg'].includes(ext)) throw new Fail('نوع الملف غير مدعوم');
  const path = `${p.id}/${purpose}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Fail('تعذّر تجهيز الرفع', 500);
  return { success: true, path, url: data.signedUrl, token: data.token };
}

export async function cvAttach(p: any, b: Body) {
  const path = String(b.path || '');
  if (!path.startsWith(`${p.id}/cv/`)) throw new Fail('مسار غير صالح');
  const updated = must(await db.from('participants').update({ cv_path: path }).eq('id', p.id).select('*').single());
  return { success: true, ...(await mePayload(updated)) };
}

// ── 5. القياس ──
// الأسئلة تُرسل بلا درجات، والخيارات مخلوطة بترتيب ثابت لكل مشارك،
// وكل خيار يحمل فهرسه الأصلي k الذي يُعاد عند الإجابة.
export async function assessmentGet(p: any, b: Body = {}) {
  if (!p.profile_completed_at) throw new Fail('أكمل ملفك الشخصي أولًا', 400, 'profile');
  const kind = b.kind === 'post' ? 'post' : 'baseline';
  if (kind === 'post') await requirePostOpen(p);
  const inst = kind === 'post' ? await postInstrumentFor(p.id) : await activeInstrument(kind);
  if (!inst) throw new Fail(kind === 'post' ? 'القياس البعدي لم يُفعَّل بعد، وسيصلك إشعار حين يُتاح' : 'القياس غير متاح حاليًا', 503, 'no_instrument');

  let { data: a } = await db.from('assessments').select('*').eq('participant_id', p.id).eq('instrument_id', inst.id)
    .neq('status', 'void').order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (!a) {
    a = must(await db.from('assessments').insert({ participant_id: p.id, instrument_id: inst.id }).select('*').single());
  }
  let qs = must(await db.from('questions').select('id, dimension, code, tier, text_ar, help_ar, kind, options, sort, retro, form')
    .eq('instrument_id', inst.id).eq('active', true)) ?? [];
  // أداة بصيغتين: المبدئي صيغة ثابتة للمشارك، والبعدي الصيغة الأخرى
  if (usesForms(qs)) {
    if (!a.form) {
      const prev = kind === 'post' ? (await lastBaseline(p.id))?.form : null;
      a.form = formFor(p.id, prev);
      must(await db.from('assessments').update({ form: a.form }).eq('id', a.id));
    }
    qs = forForm(qs, a.form);
  }
  const answers = must(await db.from('assessment_answers').select('question_id, value').eq('assessment_id', a.id)) ?? [];
  const order = ['milestone', 'impact', 'leadership'];
  // الممارسة أولًا ثم المواقف ثم المعرفة: يقدّر المشارك ممارسته قبل أن تلمّح
  // أسئلة المعرفة والمواقف إلى ما يُنتظر منه، وتأتي المعرفة بعد المواقف
  // فلا تدله على إجاباتها.
  const tierOrder = ['behavior', 'skill', 'knowledge'];
  // بنود انتقال التعلم في القياس البعدي تأتي آخرًا، بعد الأطر الثلاثة
  const last = (q: any) => (q.tier === 'transfer' ? 1 : 0);
  qs.sort((x: any, y: any) => last(x) - last(y) || order.indexOf(x.dimension) - order.indexOf(y.dimension)
    || tierOrder.indexOf(x.tier) - tierOrder.indexOf(y.tier) || x.sort - y.sort);

  return {
    success: true,
    assessment: { id: a.id, kind, status: a.status, est_minutes: inst.est_minutes, intro: inst.intro_ar, title: inst.title_ar },
    questions: qs.map((q: any) => {
      // na يميّز "لا ينطبق" في مقياس التكرار فقط، فلا يكشف إجابة صحيحة
      const opts = (q.options || []).map((o: any, k: number) => ({ k, label: o.label, ...(q.kind === 'likert' && Number(o.score) < 0 ? { na: true } : {}) }));
      return {
        id: q.id, dimension: q.dimension, tier: q.tier, text: q.text_ar, help: q.help_ar, kind: q.kind, retro: !!q.retro,
        // مقياس التكرار يبقى بترتيبه الطبيعي، والاختيارات تُخلط
        options: q.kind === 'likert' ? opts : seededShuffle(opts, p.id + q.id),
      };
    }),
    answers: Object.fromEntries(answers.map((x: any) => [x.question_id, x.value?.k])),
    before: Object.fromEntries(answers.filter((x: any) => x.value?.before != null).map((x: any) => [x.question_id, x.value.before])),
  };
}

// القياس البعدي يُفتح حين يصل المشارك إلى مرحلة التقييم في رحلته
export async function requirePostOpen(p: any) {
  const st = await mePayload(p);
  if (!st.profile?.approved) throw new Fail('يُفتح القياس البعدي بعد اعتماد مسارك', 403, 'locked');
  const stage = st.journey.find((s: any) => s.items.some((i: any) => i.code === 'E-POST'));
  if (stage && stage.status === 'locked') throw new Fail('يُفتح القياس البعدي حين تصل إلى مرحلة التقييم', 403, 'locked');
}

async function openAssessment(p: any, id: string) {
  const a = must(await db.from('assessments').select('*').eq('id', id).eq('participant_id', p.id).maybeSingle());
  if (!a) throw new Fail('القياس غير موجود', 404);
  if (a.status !== 'in_progress') throw new Fail('القياس مُرسَل من قبل', 400, 'submitted');
  return a;
}

export async function assessmentAnswer(p: any, b: Body) {
  const a = await openAssessment(p, String(b.assessment_id));
  const q = must(await db.from('questions').select('*').eq('id', String(b.question_id)).eq('instrument_id', a.instrument_id).maybeSingle());
  if (!q || (q.form && a.form && q.form !== a.form)) throw new Fail('سؤال غير صالح');
  const k = Number(b.k);
  const score = scoreFor(q, k);
  if (!Number.isInteger(k) || score == null) throw new Fail('إجابة غير صالحة');
  // القياس الرجعي: تقدير "قبل البرنامج" بجانب تقدير الآن، ولا يدخل في الدرجة
  let before: number | null = null;
  if (q.retro && b.before != null) {
    before = Number(b.before);
    if (!Number.isInteger(before) || scoreFor(q, before) == null) throw new Fail('إجابة غير صالحة');
  }
  must(await db.from('assessment_answers').upsert({
    assessment_id: a.id, question_id: q.id, value: q.retro ? { k, before } : { k }, score, answered_at: new Date().toISOString(),
  }));
  return { success: true };
}

export async function assessmentSubmit(p: any, b: Body) {
  const a = await openAssessment(p, String(b.assessment_id));
  const [qs, ans, model] = await Promise.all([
    db.from('questions').select('*').eq('instrument_id', a.instrument_id).eq('active', true),
    db.from('assessment_answers').select('question_id, value').eq('assessment_id', a.id),
    db.from('placement_model').select('*').eq('id', 1).maybeSingle(),
  ]);
  const questions = a.form ? forForm(qs.data || [], a.form) : (qs.data || []);
  const answers = Object.fromEntries((ans.data || []).map((x: any) => [x.question_id, x.value?.k]));
  const missing = questions.filter((q: any) => answers[q.id] == null).length;
  if (missing) throw new Fail(`بقي ${missing} من الأسئلة دون إجابة`, 400, 'incomplete');
  const { data: inst } = await db.from('instruments').select('kind').eq('id', a.instrument_id).maybeSingle();
  if (inst?.kind === 'post') return postSubmit(p, a, questions, ans.data || [], model.data || null);

  // المعيار المركّب وحده، من جدوله أو من قيمه الافتراضية في logic.js
  const result = placementFromAnswers(questions, answers, [], model.data || DEFAULT_MODEL);
  const split = skillSplit(questions, answers);
  const now = new Date().toISOString();
  must(await db.from('assessment_results').upsert(result.map((r: any) => ({
    assessment_id: a.id, dimension: r.dimension, level: r.level,
    skill_anchor_pct: split[r.dimension]?.anchor ?? null, skill_form_pct: split[r.dimension]?.form ?? null,
    // الدرجة هي المؤشر المركّب نفسه حتى لا يختلف رقم التقرير عن سبب المستوى
    score: r.composite ?? Math.round(((r.knowledge ?? 0) + (r.skill ?? 0) + (r.behavior ?? 0)) / 3 * 100) / 100,
    knowledge_pct: r.knowledge, skill_pct: r.skill, behavior_pct: r.behavior,
    ...(r.composite !== undefined ? { composite_pct: r.composite, borderline: r.borderline, reason_ar: r.reason } : {}),
  }))));
  // مستوى مبدئي، لا يُكتب فوق مستوى اعتمده المستشار
  const { data: current } = await db.from('placements').select('dimension, approved_at').eq('participant_id', p.id);
  const locked = new Set((current || []).filter((c: any) => c.approved_at).map((c: any) => c.dimension));
  const fresh = result.filter((r: any) => !locked.has(r.dimension));
  if (fresh.length) {
    must(await db.from('placements').upsert(fresh.map((r: any) => ({
      participant_id: p.id, dimension: r.dimension, level: r.level, source: 'assessment',
      assessment_id: a.id, decided_at: now, approved_at: null, approved_by: null,
    }))));
  }
  await db.from('assessments').update({ status: 'submitted', submitted_at: now }).eq('id', a.id);
  const updated = must(await db.from('participants').update({ status: locked.size === 3 ? 'placed' : 'pending_approval' })
    .eq('id', p.id).select('*').single());
  await audit('participant', p.id, 'assessment.submit', 'assessments', a.id, null, result);
  return { success: true, ...(await mePayload(updated)) };
}

// القياس البعدي: النتيجة تُحفظ للمقارنة، ولا تغيّر المستوى المعتمد ولا الرحلة.
// "لا ينطبق" في الآن يُغني عن تقدير ما قبل البرنامج.
async function postSubmit(p: any, a: any, questions: any[], rows: any[], model: any) {
  const values = Object.fromEntries(rows.map((x: any) => [x.question_id, x.value || {}]));
  const answers = Object.fromEntries(rows.map((x: any) => [x.question_id, x.value?.k]));
  const noBefore = questions.filter((q: any) => q.retro && (scoreFor(q, answers[q.id]) ?? 0) >= 0 && values[q.id]?.before == null).length;
  if (noBefore) throw new Fail(`بقي تقدير "قبل البرنامج" في ${noBefore} من العبارات`, 400, 'incomplete');
  const scored = questions.filter((q: any) => q.tier !== 'transfer');
  const m = model || DEFAULT_MODEL;
  const result = placementFromAnswers(scored, answers, [], m);
  const minBehavior = Number(m.min_behavior_items ?? DEFAULT_MODEL.min_behavior_items);
  const before: any = beforePercents(scored, values, { minBehavior });
  const split = skillSplit(scored, answers);
  // الممارسة على العبارات المجابة في القياسين معًا
  let common: Record<string, any> = {};
  const base = await lastBaseline(p.id);
  if (base) {
    const [bq, ba] = await Promise.all([
      db.from('questions').select('id, code, dimension, tier, options').eq('instrument_id', base.instrument_id).eq('tier', 'behavior'),
      db.from('assessment_answers').select('question_id, value').eq('assessment_id', base.id),
    ]);
    const preAnswers = Object.fromEntries((ba.data || []).map((x: any) => [x.question_id, x.value?.k]));
    common = commonBehavior(bq.data || [], preAnswers, scored, answers, { minBehavior });
  }
  must(await db.from('assessment_results').upsert(result.map((r: any) => ({
    assessment_id: a.id, dimension: r.dimension, level: r.level, score: r.composite ?? 0,
    knowledge_pct: r.knowledge, skill_pct: r.skill, behavior_pct: r.behavior,
    composite_pct: r.composite, borderline: r.borderline, reason_ar: r.reason,
    behavior_before_pct: before[r.dimension]?.behavior ?? null,
    skill_anchor_pct: split[r.dimension]?.anchor ?? null, skill_form_pct: split[r.dimension]?.form ?? null,
    behavior_common_pct: common[r.dimension]?.post ?? null, behavior_pre_common_pct: common[r.dimension]?.pre ?? null,
  }))));
  await db.from('assessments').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', a.id);
  await audit('participant', p.id, 'assessment.submit-post', 'assessments', a.id, null, result);
  return { success: true, ...(await mePayload(p)) };
}

// ── 6. متطلبات الرحلة ──
// المشارك يُنجز ما يخصه فقط، في مرحلته الحالية أو ما قبلها.
export async function requirementUpdate(p: any, b: Body) {
  const { r } = await requirementFor(p, b.requirement_id).catch(() => { throw new Fail('متطلب غير موجود', 404); });
  if (r.kind === 'auto' || r.kind === 'meeting' || r.code in AUTO_CHECKS) throw new Fail('هذا المتطلب يُحدَّث تلقائيًا أو من المستشار');
  if (VERIFIED_KINDS.includes(r.kind)) throw new Fail('هذا النشاط يُوثَّق بإنجازه الفعلي لا بالتأشير');
  const state = await mePayload(p);
  const stage = state.journey.find((s: any) => s.key === r.stage_key);
  if (!stage || stage.status === 'locked') throw new Fail('هذه المرحلة لم تُفتح بعد', 400, 'locked');
  if (!stage.items.some((i: any) => i.id === r.id)) throw new Fail('هذا المتطلب لا يخص مسارك');

  const evidence = b.evidence_path ? String(b.evidence_path) : null;
  if (evidence && !evidence.startsWith(`${p.id}/evidence/`)) throw new Fail('مسار غير صالح');
  if (r.kind === 'upload' && !evidence) throw new Fail('ارفع الملف أولًا');
  const undo = b.undo === true && !r.needs_review;
  const status = undo ? 'pending' : r.needs_review ? 'submitted' : 'done';
  must(await db.from('participant_requirements').upsert({
    participant_id: p.id, requirement_id: r.id, status,
    evidence_path: evidence, note: b.note ? String(b.note).slice(0, 1000) : null,
    completed_at: status === 'done' ? new Date().toISOString() : null,
  }));
  return { success: true, ...(await mePayload(p)) };
}

export async function passkeyDismiss(p: any) {
  await db.from('participants').update({ passkey_dismissed_at: new Date().toISOString() }).eq('id', p.id);
  return { success: true };
}

// ── 7. الكتيب الشخصي ──
// يُفتح بعد اعتماد المستوى. المحتوى يُرسل بابًا بابًا بعد تصفيته بمستوى
// المشارك، ويُسجَّل كل فتح في handbook_views. العرض في المتصفح رسم على
// لوحة (canvas) بعلامة مائية باسم المشارك، فلا نص قابل للنسخ في الصفحة.
const HANDBOOK_VIEWS_PER_HOUR = 120;

export async function approvedLevels(p: any) {
  const pl = must(await db.from('placements').select('dimension, level, approved_at').eq('participant_id', p.id)) ?? [];
  if (pl.length < 3 || pl.some((x: any) => !x.approved_at)) throw new Fail('يُفتح الكتيب بعد اعتماد مسارك', 403, 'locked');
  return Object.fromEntries(pl.map((x: any) => [x.dimension, x.level])) as Record<string, string>;
}

// نقاط المشارك ولقبه من سجل النقاط
export async function pointsOf(participantId: string) {
  const rows = must(await db.from('points_ledger').select('source, ref_id, points, note, created_at')
    .eq('participant_id', participantId).order('created_at', { ascending: false })) ?? [];
  const total = rows.reduce((a: number, r: any) => a + (r.points || 0), 0);
  return { total, rank: rankFor(total), ledger: rows };
}

// يمنح النقاط مرة واحدة لكل إنجاز (قيد فريد على المصدر والمرجع)
export async function award(participantId: string, source: string, refId: string, points: number, note: string) {
  if (!points) return 0;
  const { error } = await db.from('points_ledger').insert({ participant_id: participantId, source, ref_id: refId, points, note });
  if (!error) return points;
  // المنح المكرر يمنعه القيد الفريد (23505) وهذا مقصود؛ أي خطأ آخر يُسجَّل فلا تضيع النقاط بصمت
  if (error.code !== '23505') {
    console.error('award', { participantId, source, refId, error });
    await audit('system', null, 'points.award-failed', 'points_ledger', participantId, null, { source, ref_id: refId, points, code: error.code, message: error.message }).catch(() => {});
  }
  return 0;
}

export async function handbookToc(p: any) {
  const levels = await approvedLevels(p);
  const [mods, prog, models, subs, pts] = await Promise.all([
    db.from('handbook_modules').select('id, dimension, chapter_key, sort, title_ar, min_level, body_md, quiz_md'),
    db.from('handbook_progress').select('module_id, quiz_score, quiz_total, completed_at').eq('participant_id', p.id),
    db.from('learning_models').select('id, dimension, sort, min_level, active, points, scopes'),
    db.from('model_submissions').select('model_id, status').eq('participant_id', p.id),
    pointsOf(p.id),
  ]);
  const chapters = handbookModulesFor(must(mods) ?? [], levels);
  const done = Object.fromEntries((prog.data || []).map((r: any) => [r.module_id, r]));
  const mine = modelsFor(models.data || [], levels, p.work_scope);
  const submitted = new Set((subs.data || []).filter((s: any) => s.status !== 'draft').map((s: any) => s.model_id));
  return {
    success: true,
    level: overallLevel(levels),
    // الكتاب عام: يُعرض رمز المسار فقط
    code: trackKey(levels),
    chapters: chapters.map((m: any) => ({
      id: m.id, dimension: m.dimension, title: m.title_ar, quiz: parseQuiz(m.quiz_md).length,
      done: done[m.id] ? { score: done[m.id].quiz_score, total: done[m.id].quiz_total, at: done[m.id].completed_at } : null,
    })),
    models: { total: mine.length, submitted: mine.filter((m: any) => submitted.has(m.id)).length,
      points: mine.reduce((a: number, m: any) => a + (m.points || 0), 0) },
    points: { total: pts.total, rank: pts.rank },
    name: p.full_name,
  };
}

export async function handbookChapter(p: any, b: Body, ctx: Ctx) {
  const levels = await approvedLevels(p);
  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const { count } = await db.from('handbook_views').select('id', { count: 'exact', head: true })
    .eq('participant_id', p.id).gte('viewed_at', hourAgo);
  if ((count ?? 0) >= HANDBOOK_VIEWS_PER_HOUR) throw new Fail('فتحت صفحات كثيرة خلال ساعة، تابع بعد قليل', 429, 'rate');
  const m = must(await db.from('handbook_modules').select('*').eq('id', String(b.id)).maybeSingle());
  if (!m || !handbookModulesFor([m], levels).length) throw new Fail('هذا الباب لا يخص مسارك', 404);
  await db.from('handbook_views').insert({ participant_id: p.id, module_id: m.id, ip: ctx.ip, user_agent: ctx.ua });
  const [{ data: done }, { data: rd }] = await Promise.all([
    db.from('handbook_progress').select('*').eq('participant_id', p.id).eq('module_id', m.id).maybeSingle(),
    db.from('reading_progress').select('words, active_seconds, slices').eq('participant_id', p.id).eq('module_id', m.id).maybeSingle(),
  ]);
  return {
    success: true,
    reading: readingVerdict(rd),
    chapter: { id: m.id, dimension: m.dimension, chapter_key: m.chapter_key, title: m.title_ar, md: filterHandbookMd(m.body_md, levels[m.dimension], p.work_scope) },
    // الأسئلة بلا الإجابات الصحيحة، وخياراتها مخلوطة بترتيب ثابت لهذا المشارك؛ التصحيح على الخادم فقط
    quiz: shuffleQuiz(parseQuiz(m.quiz_md), p.id + m.id).map((q: any) => ({ q: q.q, options: q.options })),
    reflection: m.reflection_ar || '',
    done: done ? { score: done.quiz_score, total: done.quiz_total, reflection: done.reflection, at: done.completed_at } : null,
    watermark: `${p.full_name} · ${p.email}`,
  };
}

// نسخة شخصية PDF من الكتاب: أبواب المسار نفسها المصفّاة بمستوى المشارك،
// برقم إصدار يُطبع في العلامة المائية لكل صفحة. ثلاث نسخ يوميًا.
const HANDBOOK_EXPORTS_PER_DAY = 3;
export async function handbookExport(p: any, ctx: Ctx) {
  const levels = await approvedLevels(p);
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from('handbook_exports').select('id', { count: 'exact', head: true })
    .eq('participant_id', p.id).gte('created_at', dayAgo);
  if ((count ?? 0) >= HANDBOOK_EXPORTS_PER_DAY) throw new Fail('بلغت حد النسخ اليومي (3 نسخ). تتاح نسخة جديدة بعد 24 ساعة', 429, 'rate');
  const [mods, models] = await Promise.all([
    db.from('handbook_modules').select('id, dimension, chapter_key, sort, title_ar, min_level, body_md, reflection_ar'),
    db.from('learning_models').select('*'),
  ]);
  const chapters = handbookModulesFor(must(mods) ?? [], levels);
  if (!chapters.length) throw new Fail('لا أبواب في كتابك بعد', 404);
  const now = new Date();
  const ref = `MI-BK-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomToken(8).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5).padEnd(5, 'X')}`;
  must(await db.from('handbook_exports').insert({ ref, participant_id: p.id, chapters: chapters.length, ip: ctx.ip, user_agent: ctx.ua }));
  await audit('participant', p.email, 'handbook.export', 'participants', p.id, null, { ref, chapters: chapters.length });
  return {
    success: true,
    book: {
      // الكتاب عام: لا شيء من بيانات المسار إلا رمزه
      ref, issued_at: now.toISOString(), name: p.full_name, email: p.email, code: trackKey(levels),
      chapters: chapters.map((m: any) => ({ id: m.id, dimension: m.dimension, title: m.title_ar, md: filterHandbookMd(m.body_md, levels[m.dimension], p.work_scope), reflection: m.reflection_ar || '' })),
      tools: modelsFor(models.data || [], levels, p.work_scope).map((m: any) => ({ dimension: m.dimension, title: m.title_ar, summary: m.summary_ar || '', when: m.when_ar || '', steps: m.steps_ar || '', source: m.source_ar || '' })),
    },
  };
}

// إتمام الباب: يصحح الاختبار، ويحفظ التأمل، ويمنح النقاط أول مرة فقط
export async function handbookComplete(p: any, b: Body) {
  const levels = await approvedLevels(p);
  const m = must(await db.from('handbook_modules').select('id, dimension, min_level, body_md, quiz_md, title_ar').eq('id', String(b.id)).maybeSingle());
  if (!m || !handbookModulesFor([m], levels).length) throw new Fail('هذا الباب لا يخص مسارك', 404);
  // بالترتيب نفسه الذي عُرض به، فرقم الإجابة ورقم الصحيحة في النتيجة من القائمة المعروضة
  const quiz = shuffleQuiz(parseQuiz(m.quiz_md), p.id + m.id);
  const g = gradeQuiz(quiz, b.answers);
  if (quiz.length && (!Array.isArray(b.answers) || b.answers.length < quiz.length || b.answers.some((x: any) => x === null || x === undefined))) {
    throw new Fail('أجب عن كل الأسئلة أولًا');
  }
  const reflection = String(b.reflection || '').trim().slice(0, 4000) || null;
  const { data: prev } = await db.from('handbook_progress').select('quiz_score, quiz_total').eq('participant_id', p.id).eq('module_id', m.id).maybeSingle();
  // أول محاولة هي التي تُحتسب؛ الإعادة للتعلم وتحديث التأمل فقط
  if (prev) await db.from('handbook_progress').update({ reflection }).eq('participant_id', p.id).eq('module_id', m.id);
  else must(await db.from('handbook_progress').insert({ participant_id: p.id, module_id: m.id, quiz_score: g.score, quiz_total: g.total, reflection }));
  const gained = prev ? 0 : await award(p.id, 'chapter', m.id, chapterPoints(g.score, reflection), m.title_ar);
  const pts = await pointsOf(p.id);
  return { success: true, ...g, first: !prev, counted: prev || { quiz_score: g.score, quiz_total: g.total }, gained, points: { total: pts.total, rank: pts.rank } };
}

// ── 8. النماذج التعليمية ──
async function myModel(p: any, id: unknown) {
  const levels = await approvedLevels(p);
  const m = must(await db.from('learning_models').select('*').eq('id', String(id || '')).maybeSingle());
  if (!m || !modelsFor([m], levels, p.work_scope).length) throw new Fail('هذا النموذج لا يخص مسارك', 404);
  // الحقول كما تخص المشارك: بمستواه في بُعد النموذج ونطاق عمله
  return { ...m, fields: fieldsFor(m.fields, levels[m.dimension], p.work_scope) };
}

// اسم المبادرة من مصدره الوحيد: بطاقة المبادرة في مكتبة النماذج
export async function initiativeFor(participantId: string) {
  const { data } = await db.from('model_submissions').select('answers, learning_models!inner(key)')
    .eq('participant_id', participantId).eq('learning_models.key', CHARTER_KEY).maybeSingle();
  return initiativeOf((data as any)?.answers);
}

// فصول الوثيقة تُقفل ما دامت الوثيقة عند المستشار أو الراعي أو معتمدة
export const CAPSTONE_LOCKED = ['submitted', 'accepted', 'approved'];
export async function capstoneStatus(participantId: string) {
  const { data } = await db.from('capstones').select('status').eq('participant_id', participantId).maybeSingle();
  return (data as any)?.status || 'draft';
}

export async function modelsList(p: any) {
  const levels = await approvedLevels(p);
  const [models, subs, pts] = await Promise.all([
    db.from('learning_models').select('id, dimension, key, sort, title_ar, icon, summary_ar, min_level, points, active, fields, scopes, capstone_sort'),
    db.from('model_submissions').select('model_id, status, rating, bonus, answers, submitted_at, updated_at').eq('participant_id', p.id),
    pointsOf(p.id),
  ]);
  const by = Object.fromEntries((subs.data || []).map((s: any) => [s.model_id, s]));
  return {
    success: true,
    // تقدم كل نموذج: الحقول الإلزامية المكتملة من مجموعها، دون إرسال الإجابات نفسها
    models: modelsFor(must(models) ?? [], levels, p.work_scope).map(({ fields: all, scopes: _s, capstone_sort, ...m }: any) => {
      const fields = fieldsFor(all, levels[m.dimension], p.work_scope);
      const sub = by[m.id];
      const total = fields.filter((f: any) => f.required !== false).length;
      const filled = total - missingFields(fields, sub?.answers || {}).length;
      return { ...m, capstone: capstone_sort != null, fields_n: fields.length, progress: { filled, total },
        submission: sub ? { status: sub.status, rating: sub.rating, bonus: sub.bonus, submitted_at: sub.submitted_at, updated_at: sub.updated_at } : null };
    }),
    points: { total: pts.total, rank: pts.rank },
  };
}

// الجداول المستوردة: صفوف المصدر بأعمدة هذا الجدول، ليستوردها المشارك بنقرة
async function importsFor(p: any, fields: any[]) {
  const want = fields.filter((f: any) => f.type === 'table' && f.import?.model);
  if (!want.length) return {};
  const keys = [...new Set(want.map((f: any) => f.import.model))];
  const { data } = await db.from('model_submissions').select('answers, learning_models!inner(key, title_ar, fields)')
    .eq('participant_id', p.id).in('learning_models.key', keys);
  const src = Object.fromEntries((data || []).map((r: any) => [r.learning_models.key, r]));
  const out: Record<string, any> = {};
  for (const f of want) {
    const s = src[f.import.model];
    const sf = (s?.learning_models?.fields || []).find((x: any) => x.key === f.import.field);
    out[f.key] = { model: f.import.model, title: s?.learning_models?.title_ar || null,
      rows: s && sf ? importRows(f.columns, sf.columns, s.answers?.[f.import.field]) : [] };
  }
  return out;
}

export async function modelGet(p: any, b: Body) {
  const m = await myModel(p, b.id);
  const [{ data: sub }, initiative, status] = await Promise.all([
    db.from('model_submissions').select('*').eq('participant_id', p.id).eq('model_id', m.id).maybeSingle(),
    initiativeFor(p.id),
    m.capstone_sort != null ? capstoneStatus(p.id) : null,
  ]);
  const submission = sub ? { ...sub, answers: bindAnswers(m.fields, sub.answers, m.key === CHARTER_KEY ? null : initiative) } : null;
  return {
    success: true, model: m, submission, initiative,
    imports: await importsFor(p, m.fields),
    capstone: m.capstone_sort != null ? { status, locked: CAPSTONE_LOCKED.includes(status as string) } : null,
  };
}

// حفظ مسودة أو تسليم نهائي؛ التسليم يمنح نقاط النموذج مرة واحدة
export async function modelSave(p: any, b: Body) {
  const m = await myModel(p, b.id);
  const [{ data: prev }, initiative, status] = await Promise.all([
    db.from('model_submissions').select('id, status').eq('participant_id', p.id).eq('model_id', m.id).maybeSingle(),
    m.key === CHARTER_KEY ? null : initiativeFor(p.id),
    m.capstone_sort != null ? capstoneStatus(p.id) : null,
  ]);
  if (prev?.status === 'reviewed') throw new Fail('قُيّم هذا النموذج ولا يمكن تعديله');
  if (CAPSTONE_LOCKED.includes(status as string)) throw new Fail('هذا فصل في وثيقة مبادرتك، وهي عند المراجعة أو معتمدة فلا يُعدَّل الآن', 409, 'capstone_locked');
  // الحقل المربوط باسم المبادرة لا يُكتب هنا: يأتي من بطاقة المبادرة دائمًا
  const answers = bindAnswers(m.fields, cleanAnswers(m.fields, b.answers), initiative);
  const submit = !!b.submit;
  if (submit) {
    const missing = missingFields(m.fields, answers);
    if (missing.length) throw new Fail(`أكمل قبل التسليم: ${missing.join('، ')}`, 400, 'incomplete');
  }
  const row: Body = { participant_id: p.id, model_id: m.id, answers, updated_at: new Date().toISOString() };
  if (submit) Object.assign(row, { status: 'submitted', submitted_at: new Date().toISOString() });
  else if (!prev) row.status = 'draft';
  const saved = must(await db.from('model_submissions').upsert(row, { onConflict: 'participant_id,model_id' }).select('*').single());
  const gained = submit ? await award(p.id, 'model', m.id, m.points, m.title_ar) : 0;
  const pts = await pointsOf(p.id);
  return { success: true, submission: saved, gained, points: { total: pts.total, rank: pts.rank } };
}

export async function achievements(p: any) {
  await approvedLevels(p);
  const pts = await pointsOf(p.id);
  return { success: true, ...pts };
}
