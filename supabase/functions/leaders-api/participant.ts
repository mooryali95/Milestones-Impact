// ════════════════════════════════════════════════════════════════
// إجراءات المشارك: الدخول بالبريد، الملف، القياس، الرحلة
// ════════════════════════════════════════════════════════════════
import {
  audit, BUCKET, CONFIG, db, Fail, hash, must, randomCode, randomToken, sendMail, signInMail, storage,
} from './core.ts';
import {
  AUTO_CHECKS, buildJourney, isEmail, journeyProgress, normalizeEmail, normalizePhone, placementFromAnswers, scoreFor,
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
    pending = { full_name: name.slice(0, 120), phone };
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
      email_verified_at: new Date().toISOString(), source: 'self',
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

export async function mePayload(p: any) {
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
  const cellOf = (d: string, l: string) => (cells.data || []).find((c: any) => c.dimension === d && c.level === l);

  return {
    participant: {
      id: p.id, email: p.email, full_name: p.full_name, phone: p.phone, job_title: p.job_title,
      organization_name: p.organization_name, sector: p.sector, years_experience: p.years_experience,
      bio: p.bio, linkedin_url: p.linkedin_url, has_cv: !!p.cv_path, status: p.status,
    },
    // المستوى يظهر مبدئيًا فور القياس، ويُعلَّم معتمدًا بعد قرار المستشار
    profile: pl.length ? {
      approved,
      dimensions: pl.map((x: any) => ({
        dimension: x.dimension, level: x.level, approved: !!x.approved_at, note: x.admin_note,
        description: cellOf(x.dimension, x.level)?.description_ar || null,
        path: cellOf(x.dimension, x.level)?.path_title_ar || null,
      })),
    } : null,
    journey,
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
  const [qs, ans, rules] = await Promise.all([
    db.from('questions').select('*').eq('instrument_id', a.instrument_id).eq('active', true),
    db.from('assessment_answers').select('question_id, value').eq('assessment_id', a.id),
    db.from('level_rules').select('*'),
  ]);
  const questions = qs.data || [];
  const answers = Object.fromEntries((ans.data || []).map((x: any) => [x.question_id, x.value?.k]));
  const missing = questions.filter((q: any) => answers[q.id] == null).length;
  if (missing) throw new Fail(`بقي ${missing} من الأسئلة دون إجابة`, 400, 'incomplete');

  const result = placementFromAnswers(questions, answers, rules.data || []);
  const now = new Date().toISOString();
  must(await db.from('assessment_results').upsert(result.map((r: any) => ({
    assessment_id: a.id, dimension: r.dimension, level: r.level,
    score: Math.round(((r.knowledge ?? 0) + (r.skill ?? 0) + (r.behavior ?? 0)) / 3 * 100) / 100,
    knowledge_pct: r.knowledge, skill_pct: r.skill, behavior_pct: r.behavior,
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
