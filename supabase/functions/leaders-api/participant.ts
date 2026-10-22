// ════════════════════════════════════════════════════════════════
// إجراءات المشارك: الدخول بالبريد، الملف، القياس، الرحلة
// ════════════════════════════════════════════════════════════════
import {
  audit, BUCKET, CONFIG, db, Fail, hash, must, randomCode, randomToken, sendMail, signInMail, storage,
} from './core.ts';
import {
  AUTO_CHECKS, buildJourney, chapterPoints, cleanAnswers, filterHandbookMd, gradeQuiz, handbookModulesFor, missingFields, modelsFor, parseQuiz, rankFor, overallLevel, isEmail, trackKey, journeyProgress, normalizeEmail, normalizePhone, placementFromAnswers, scoreFor,
  seededShuffle,
} from './logic.js';

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
  db.from('auth_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', s.id).then(() => {});
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
  if (ctx.ip) {
    const { count: perIp } = await db.from('email_challenges').select('id', { count: 'exact', head: true })
      .eq('ip', ctx.ip).gte('created_at', hourAgo);
    if ((perIp ?? 0) >= 30) throw new Fail('طلبات كثيرة، حاول بعد قليل', 429, 'rate');
  }

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

export async function logout(sessionId: string) {
  await db.from('auth_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId);
  return { success: true };
}

// ── 3. حالة المشارك كاملة ──
async function activeInstrument(kind = 'baseline') {
  const { data } = await db.from('instruments').select('*').eq('kind', kind).eq('active', true)
    .order('version', { ascending: false }).limit(1).maybeSingle();
  return data;
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

export async function mePayload(p: any, audience: 'participant' | 'admin' = 'participant') {
  const [placements, stages, reqs, progress, assessments, passkeys, cells, reports] = await Promise.all([
    db.from('placements').select('dimension, level, approved_at, admin_note').eq('participant_id', p.id),
    db.from('journey_stages').select('*').eq('active', true),
    db.from('stage_requirements').select('*').eq('active', true),
    db.from('participant_requirements').select('*').eq('participant_id', p.id),
    db.from('assessments').select('id, status, submitted_at, instruments(kind)').eq('participant_id', p.id),
    db.from('passkeys').select('id', { count: 'exact', head: true }).eq('participant_id', p.id),
    db.from('grid_cells').select('dimension, level, description_ar, path_title_ar'),
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
  const journey = buildJourney({ stages: stages.data || [], requirements: reqs.data || [], progress: prog, levels, state });
  const track = trackView(await trackFor(levels), audience);
  const cellOf = (d: string, l: string) => (cells.data || []).find((c: any) => c.dimension === d && c.level === l);

  return {
    participant: {
      id: p.id, email: p.email, full_name: p.full_name, phone: p.phone, job_title: p.job_title,
      organization_name: p.organization_name, sector: p.sector, years_experience: p.years_experience,
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
      : journey.map((st: any) => ({ ...st, items: st.items.map(({ dimension: _d, level: _l, ...it }: any) => it) })),
    progress: journeyProgress(journey),
    passkeys: passkeys.count ?? 0,
    prompt_passkey: (passkeys.count ?? 0) === 0 && !p.passkey_dismissed_at,
  };
}

export async function me(p: any) {
  return { success: true, ...(await mePayload(p)) };
}

// ── 4. الملف الشخصي ──
const PROFILE_FIELDS: Record<string, number> = {
  full_name: 120, job_title: 120, organization_name: 200, sector: 120, bio: 2000, linkedin_url: 300,
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
  if ('years_experience' in f) {
    const y = Number(f.years_experience);
    patch.years_experience = Number.isFinite(y) && y >= 0 && y <= 60 ? Math.round(y) : null;
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
export async function assessmentGet(p: any) {
  if (!p.profile_completed_at) throw new Fail('أكمل ملفك الشخصي أولًا', 400, 'profile');
  const inst = await activeInstrument('baseline');
  if (!inst) throw new Fail('القياس غير متاح حاليًا', 503, 'no_instrument');

  let { data: a } = await db.from('assessments').select('*').eq('participant_id', p.id).eq('instrument_id', inst.id)
    .neq('status', 'void').order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (!a) {
    a = must(await db.from('assessments').insert({ participant_id: p.id, instrument_id: inst.id }).select('*').single());
    if (p.status === 'profiled' || p.status === 'registered') await db.from('participants').update({ status: 'assessing' }).eq('id', p.id);
  }
  const qs = must(await db.from('questions').select('id, dimension, code, tier, text_ar, help_ar, kind, options, sort')
    .eq('instrument_id', inst.id).eq('active', true)) ?? [];
  const answers = must(await db.from('assessment_answers').select('question_id, value').eq('assessment_id', a.id)) ?? [];
  const order = ['milestone', 'impact', 'leadership'];
  const tierOrder = ['knowledge', 'skill', 'behavior'];
  qs.sort((x: any, y: any) => order.indexOf(x.dimension) - order.indexOf(y.dimension)
    || tierOrder.indexOf(x.tier) - tierOrder.indexOf(y.tier) || x.sort - y.sort);

  return {
    success: true,
    assessment: { id: a.id, status: a.status, est_minutes: inst.est_minutes, intro: inst.intro_ar, title: inst.title_ar },
    questions: qs.map((q: any) => {
      const opts = (q.options || []).map((o: any, k: number) => ({ k, label: o.label }));
      return {
        id: q.id, dimension: q.dimension, tier: q.tier, text: q.text_ar, help: q.help_ar, kind: q.kind,
        // مقياس التكرار يبقى بترتيبه الطبيعي، والاختيارات تُخلط
        options: q.kind === 'likert' ? opts : seededShuffle(opts, p.id + q.id),
      };
    }),
    answers: Object.fromEntries(answers.map((x: any) => [x.question_id, x.value?.k])),
  };
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
  if (!q) throw new Fail('سؤال غير صالح');
  const k = Number(b.k);
  const score = scoreFor(q, k);
  if (!Number.isInteger(k) || score == null) throw new Fail('إجابة غير صالحة');
  must(await db.from('assessment_answers').upsert({
    assessment_id: a.id, question_id: q.id, value: { k }, score, answered_at: new Date().toISOString(),
  }));
  return { success: true };
}

export async function assessmentSubmit(p: any, b: Body) {
  const a = await openAssessment(p, String(b.assessment_id));
  const [qs, ans, rules, model] = await Promise.all([
    db.from('questions').select('*').eq('instrument_id', a.instrument_id).eq('active', true),
    db.from('assessment_answers').select('question_id, value').eq('assessment_id', a.id),
    db.from('level_rules').select('*'),
    db.from('placement_model').select('*').eq('id', 1).maybeSingle(),
  ]);
  const questions = qs.data || [];
  const answers = Object.fromEntries((ans.data || []).map((x: any) => [x.question_id, x.value?.k]));
  const missing = questions.filter((q: any) => answers[q.id] == null).length;
  if (missing) throw new Fail(`بقي ${missing} من الأسئلة دون إجابة`, 400, 'incomplete');

  // النموذج المركّب إن وُجد (الترحيل 008)، وإلا قواعد level_rules القديمة
  const result = placementFromAnswers(questions, answers, rules.data || [], model.data || null);
  const now = new Date().toISOString();
  must(await db.from('assessment_results').upsert(result.map((r: any) => ({
    assessment_id: a.id, dimension: r.dimension, level: r.level,
    score: Math.round(((r.knowledge ?? 0) + (r.skill ?? 0) + (r.behavior ?? 0)) / 3 * 100) / 100,
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

// ── 6. متطلبات الرحلة ──
// المشارك يُنجز ما يخصه فقط، في مرحلته الحالية أو ما قبلها.
export async function requirementUpdate(p: any, b: Body) {
  const r = must(await db.from('stage_requirements').select('*').eq('id', String(b.requirement_id)).maybeSingle());
  if (!r || !r.active) throw new Fail('متطلب غير موجود', 404);
  if (r.kind === 'auto' || r.kind === 'meeting' || r.code in AUTO_CHECKS) throw new Fail('هذا المتطلب يُحدَّث تلقائيًا أو من المستشار');
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

async function approvedLevels(p: any) {
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
async function award(participantId: string, source: string, refId: string, points: number, note: string) {
  if (!points) return 0;
  const { error } = await db.from('points_ledger').insert({ participant_id: participantId, source, ref_id: refId, points, note });
  return error ? 0 : points;
}

export async function handbookToc(p: any) {
  const levels = await approvedLevels(p);
  const [mods, prog, models, subs, pts] = await Promise.all([
    db.from('handbook_modules').select('id, dimension, chapter_key, sort, title_ar, min_level, body_md, quiz_md'),
    db.from('handbook_progress').select('module_id, quiz_score, quiz_total, completed_at').eq('participant_id', p.id),
    db.from('learning_models').select('id, dimension, sort, min_level, active, points'),
    db.from('model_submissions').select('model_id, status').eq('participant_id', p.id),
    pointsOf(p.id),
  ]);
  const chapters = handbookModulesFor(must(mods) ?? [], levels);
  const done = Object.fromEntries((prog.data || []).map((r: any) => [r.module_id, r]));
  const mine = modelsFor(models.data || [], levels);
  const submitted = new Set((subs.data || []).filter((s: any) => s.status !== 'draft').map((s: any) => s.model_id));
  return {
    success: true,
    level: overallLevel(levels),
    track: trackView(await trackFor(levels), 'participant'),
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
  const { data: done } = await db.from('handbook_progress').select('*').eq('participant_id', p.id).eq('module_id', m.id).maybeSingle();
  return {
    success: true,
    chapter: { id: m.id, dimension: m.dimension, title: m.title_ar, md: filterHandbookMd(m.body_md, levels[m.dimension]) },
    // الأسئلة بلا الإجابات الصحيحة؛ التصحيح على الخادم فقط
    quiz: parseQuiz(m.quiz_md).map((q) => ({ q: q.q, options: q.options })),
    reflection: m.reflection_ar || '',
    done: done ? { score: done.quiz_score, total: done.quiz_total, reflection: done.reflection, at: done.completed_at } : null,
    watermark: `${p.full_name} · ${p.email}`,
  };
}

// إتمام الباب: يصحح الاختبار، ويحفظ التأمل، ويمنح النقاط أول مرة فقط
export async function handbookComplete(p: any, b: Body) {
  const levels = await approvedLevels(p);
  const m = must(await db.from('handbook_modules').select('id, dimension, min_level, body_md, quiz_md, title_ar').eq('id', String(b.id)).maybeSingle());
  if (!m || !handbookModulesFor([m], levels).length) throw new Fail('هذا الباب لا يخص مسارك', 404);
  const quiz = parseQuiz(m.quiz_md);
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
  if (!m || !modelsFor([m], levels).length) throw new Fail('هذا النموذج لا يخص مسارك', 404);
  return m;
}

export async function modelsList(p: any) {
  const levels = await approvedLevels(p);
  const [models, subs, pts] = await Promise.all([
    db.from('learning_models').select('id, dimension, key, sort, title_ar, icon, summary_ar, min_level, points, active'),
    db.from('model_submissions').select('model_id, status, rating, bonus, submitted_at, updated_at').eq('participant_id', p.id),
    pointsOf(p.id),
  ]);
  const by = Object.fromEntries((subs.data || []).map((s: any) => [s.model_id, s]));
  return {
    success: true,
    models: modelsFor(must(models) ?? [], levels).map((m: any) => ({ ...m, submission: by[m.id] || null })),
    points: { total: pts.total, rank: pts.rank },
  };
}

export async function modelGet(p: any, b: Body) {
  const m = await myModel(p, b.id);
  const { data: sub } = await db.from('model_submissions').select('*').eq('participant_id', p.id).eq('model_id', m.id).maybeSingle();
  return { success: true, model: m, submission: sub || null };
}

// حفظ مسودة أو تسليم نهائي؛ التسليم يمنح نقاط النموذج مرة واحدة
export async function modelSave(p: any, b: Body) {
  const m = await myModel(p, b.id);
  const answers = cleanAnswers(m.fields, b.answers);
  const { data: prev } = await db.from('model_submissions').select('id, status').eq('participant_id', p.id).eq('model_id', m.id).maybeSingle();
  if (prev?.status === 'reviewed') throw new Fail('قُيّم هذا النموذج ولا يمكن تعديله');
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
