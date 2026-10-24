// ════════════════════════════════════════════════════════════════
// قياس الأثر: المقارنة بين القياس المبدئي والبعدي، والمقيّمون الخارجيون
// ════════════════════════════════════════════════════════════════
// المنطق الحسابي في logic.js (يُختبر في vitest)، وهنا جمع البيانات فقط.
// المشارك يرى ملخصًا واحدًا، والإدارة ترى التفصيل لكل إطار والدفعة كاملة.
import { audit, CONFIG, db, Fail, hash, must, randomToken, raterMail, sendMail } from './core.ts';
import { requirePostOpen } from './participant.ts';
import { requirementIdByCode } from './programs.ts';
import {
  compareAssessments, DIMENSIONS, effectLabel, IMPACT_DEFAULTS, isEmail, normalizeEmail, pairedStats, raterPercents,
} from './logic.js';

type Body = Record<string, any>;

const RATER_LIMIT = 3;
const RELATION_AR: Record<string, string> = { manager: 'المدير المباشر', peer: 'زميل', report: 'أحد أعضاء الفريق' };

// آخر قياس مُرسل من كل نوع لكل مشارك، بنتائجه
async function latestResults(ids: string[] | null) {
  let q = db.from('assessments').select('id, participant_id, submitted_at, instrument_id, instruments(kind, key)').eq('status', 'submitted');
  if (ids) q = q.in('participant_id', ids);
  const rows = must(await q.order('submitted_at', { ascending: false }).limit(5000)) as any[] ?? [];
  const pick: Record<string, { baseline?: any; post?: any }> = {};
  for (const a of rows) {
    const kind = a.instruments?.kind;
    if (kind !== 'baseline' && kind !== 'post') continue;
    const x = (pick[a.participant_id] ||= {});
    if (!(x as any)[kind]) (x as any)[kind] = a;
  }
  const aids = Object.values(pick).flatMap((x) => [x.baseline?.id, x.post?.id]).filter(Boolean) as string[];
  const results: Record<string, Record<string, any>> = {};
  for (let i = 0; i < aids.length; i += 200) {
    const part = must(await db.from('assessment_results').select('*').in('assessment_id', aids.slice(i, i + 200))) as any[] ?? [];
    for (const r of part) {
      (results[r.assessment_id] ||= {})[r.dimension] = {
        knowledge: num(r.knowledge_pct), skill: num(r.skill_pct), behavior: num(r.behavior_pct),
        behavior_before: num(r.behavior_before_pct), composite: num(r.composite_pct), level: r.level,
      };
    }
  }
  return { pick, results };
}
const num = (x: unknown) => (x == null ? null : Number(x));

// إعدادات الحكم: من نموذج التسكين، ثم من بيانات الدفعة إن كفى عددها
async function impactConfig() {
  const model = must(await db.from('placement_model').select('*').eq('id', 1).maybeSingle()) as any;
  const cfg: any = {
    rci_reliability: Number(model?.rci_reliability ?? IMPACT_DEFAULTS.rci_reliability),
    rci_sd: Number(model?.rci_sd ?? IMPACT_DEFAULTS.rci_sd),
    min_n: Number(model?.impact_min_n ?? IMPACT_DEFAULTS.min_n),
    rater_threshold: Number(model?.rater_threshold ?? IMPACT_DEFAULTS.rater_threshold),
    reliability: {}, sd: {}, source: {},
  };
  const { data: base } = await db.from('instruments').select('id, key').eq('kind', 'baseline').eq('active', true).maybeSingle();
  let stats: any[] = [];
  if (base) {
    const { data, error } = await db.rpc('instrument_reliability', { p_instrument: base.id });
    if (!error) stats = data || [];
  }
  for (const d of DIMENSIONS) {
    const s = stats.find((x: any) => x.dimension === d);
    const enough = s && Number(s.n) >= cfg.min_n;
    // ثبات منخفض جدًا لا يُستعمل: يجعل كل تغير "غير موثوق" ويخفي ضعف الأداة
    if (enough && s.alpha != null && Number(s.alpha) > 0.3) cfg.reliability[d] = Math.min(0.95, Number(s.alpha));
    if (enough && s.sd != null && Number(s.sd) > 0) cfg.sd[d] = Number(s.sd);
    cfg.source[d] = { n: s ? Number(s.n) : 0, alpha: s?.alpha != null ? Number(s.alpha) : null, sd: s?.sd != null ? Number(s.sd) : null, from_data: !!enough };
  }
  return { model, cfg, baseline: base };
}

async function raterData(ids: string[] | null) {
  let q = db.from('raters').select('participant_id, instrument_id, relation, answers, status').eq('status', 'submitted');
  if (ids) q = q.in('participant_id', ids);
  const rows = must(await q) as any[] ?? [];
  const insts = [...new Set(rows.map((r) => r.instrument_id))];
  const qs = insts.length ? (must(await db.from('questions').select('id, dimension, options, tier').in('instrument_id', insts)) as any[] ?? []) : [];
  const by: Record<string, any> = {};
  for (const r of rows) {
    const mine = qs.filter((x: any) => x.tier === 'behavior');
    (by[r.participant_id] ||= []).push({ relation: r.relation, pcts: raterPercents(mine, r.answers || {}) });
  }
  // متوسط المقيّمين لكل إطار، ويُقدَّم المدير إن وُجد
  const out: Record<string, any> = {};
  for (const [pid, list] of Object.entries(by) as [string, any[]][]) {
    const use = list.some((x) => x.relation === 'manager') ? list.filter((x) => x.relation === 'manager') : list;
    out[pid] = Object.fromEntries(DIMENSIONS.map((d) => {
      const vals = use.map((x) => x.pcts[d]).filter(Boolean);
      if (!vals.length) return [d, null];
      const avg = (k: 'now' | 'before') => Math.round(vals.reduce((a, v) => a + v[k], 0) / vals.length * 10) / 10;
      return [d, { now: avg('now'), before: avg('before'), n: vals.length }];
    }));
  }
  return out;
}

async function evidenceDone(ids: string[] | null) {
  // E-CASE في كل البرامج: لكل برنامج متطلبه بالرمز نفسه
  const { data: reqs } = await db.from('stage_requirements').select('id').eq('code', 'E-CASE');
  if (!reqs?.length) return new Set<string>();
  let q = db.from('participant_requirements').select('participant_id').in('requirement_id', reqs.map((r: any) => r.id)).eq('status', 'done');
  if (ids) q = q.in('participant_id', ids);
  return new Set(((must(await q) as any[]) ?? []).map((r) => r.participant_id));
}

// المقارنة لعدد من المشاركين (أو للجميع إن كان ids فارغًا)
export async function compareFor(ids: string[] | null) {
  const [{ pick, results }, { model, cfg }, raters, evidence] = await Promise.all([
    latestResults(ids), impactConfig(), raterData(ids), evidenceDone(ids),
  ]);
  const out: Record<string, any> = {};
  for (const [pid, x] of Object.entries(pick)) {
    if (!x.baseline || !x.post) { out[pid] = { pid, baseline_at: x.baseline?.submitted_at || null, post_at: x.post?.submitted_at || null, dimensions: null }; continue; }
    out[pid] = {
      pid, baseline_at: x.baseline.submitted_at, post_at: x.post.submitted_at,
      baseline_key: x.baseline.instruments?.key, post_key: x.post.instruments?.key,
      dimensions: compareAssessments({
        pre: results[x.baseline.id] || {}, post: results[x.post.id] || {}, model, impact: cfg,
        rater: raters[pid] || null, evidence: evidence.has(pid),
      }),
    };
  }
  return { rows: out, cfg };
}

// ملخص المشارك: مؤشر واحد عام، دون تفصيل الأطر (قرار المالك 22 أكتوبر)
export function participantSummary(row: any) {
  if (!row?.dimensions) return null;
  const dims = row.dimensions.filter((d: any) => d.composite_pre != null);
  if (!dims.length) return null;
  const avg = (k: string) => Math.round(dims.reduce((a: number, d: any) => a + d[k], 0) / dims.length * 10) / 10;
  const beh = row.dimensions.filter((d: any) => d.post.behavior != null && d.post.behavior_before != null);
  const bavg = (k: string) => beh.length ? Math.round(beh.reduce((a: number, d: any) => a + d.post[k], 0) / beh.length * 10) / 10 : null;
  return {
    before: avg('composite_pre'), after: avg('composite_post'),
    reliable_up: dims.filter((d: any) => d.direction === 'up').length,
    practice_then: bavg('behavior_before'), practice_now: bavg('behavior'),
    at: row.post_at,
  };
}

// ── المشارك: ملخصه بعد القياس البعدي، ودعوة مقيّميه ──
export async function mine(p: any) {
  const { rows } = await compareFor([p.id]);
  const raters = must(await db.from('raters').select('id, email, full_name, relation, status, invited_at, submitted_at')
    .eq('participant_id', p.id).neq('status', 'revoked').order('invited_at')) ?? [];
  return { success: true, summary: participantSummary(rows[p.id]), raters, limit: RATER_LIMIT };
}

async function postInstrument() {
  const { data } = await db.from('instruments').select('id').eq('kind', 'post').eq('active', true)
    .order('version', { ascending: false }).limit(1).maybeSingle();
  if (!data) throw new Fail('القياس البعدي لم يُفعَّل بعد', 503, 'no_instrument');
  return data;
}

export async function invite(p: any, b: Body) {
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('البريد غير صحيح');
  if (email === normalizeEmail(p.email)) throw new Fail('ادعُ مديرك أو زميلك، لا بريدك');
  const relation = ['manager', 'peer', 'report'].includes(b.relation) ? b.relation : 'manager';
  const name = String(b.full_name || '').trim().slice(0, 120) || null;
  await requirePostOpen(p);
  const inst = await postInstrument();
  const existing = must(await db.from('raters').select('id, email, status').eq('participant_id', p.id).neq('status', 'revoked')) as any[] ?? [];
  if (!existing.some((r: any) => r.email === email) && existing.length >= RATER_LIMIT) throw new Fail(`الحد ${RATER_LIMIT} مقيّمين`);
  const token = randomToken();
  const row = { participant_id: p.id, instrument_id: inst.id, email, full_name: name, relation, token_hash: await hash(token),
    status: 'invited', invited_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString() };
  const { data: prev } = await db.from('raters').select('id, status, invited_at').eq('participant_id', p.id).eq('email', email).maybeSingle();
  if (prev?.status === 'submitted') throw new Fail('أرسل هذا المقيّم تقديره من قبل');
  if (prev && Date.now() - new Date(prev.invited_at).getTime() < 10 * 60e3) throw new Fail('أُرسلت الدعوة قبل قليل، أعد الإرسال بعد عشر دقائق', 429, 'rate');
  if (prev) must(await db.from('raters').update(row).eq('id', prev.id));
  else must(await db.from('raters').insert(row));
  const link = `${CONFIG.appUrl}/rate?t=${encodeURIComponent(token)}`;
  await sendMail(email, `طلب تقدير من ${p.full_name || 'مشارك في برنامج القادة'}`, raterMail(name, p.full_name || 'زميلك', link));
  await audit('participant', p.id, 'rater.invite', 'raters', null, null, { email, relation });
  return mine(p);
}

export async function revoke(p: any, b: Body) {
  must(await db.from('raters').update({ status: 'revoked' }).eq('id', String(b.id || '')).eq('participant_id', p.id).eq('status', 'invited'));
  return mine(p);
}

// ── المقيّم: رابط بريد بلا حساب ──
async function raterFrom(t: unknown) {
  const token = String(t || '');
  if (token.length < 20) throw new Fail('الرابط غير صالح', 400, 'invalid');
  const r = must(await db.from('raters').select('*, participants(full_name)').eq('token_hash', await hash(token)).maybeSingle()) as any;
  if (!r || r.status === 'revoked') throw new Fail('الرابط غير صالح أو أُلغي', 404, 'invalid');
  if (new Date(r.expires_at) < new Date() && r.status !== 'submitted') throw new Fail('انتهت صلاحية الرابط، اطلب دعوة جديدة', 410, 'expired');
  return r;
}

async function raterQuestions(instrumentId: string) {
  const qs = must(await db.from('questions').select('id, dimension, code, text_ar, text_rater_ar, options, sort, tier')
    .eq('instrument_id', instrumentId).eq('active', true).eq('tier', 'behavior').order('sort')) as any[] ?? [];
  return qs;
}

export async function raterGet(b: Body) {
  const r = await raterFrom(b.t);
  if (!r.opened_at) await db.from('raters').update({ opened_at: new Date().toISOString() }).eq('id', r.id);
  const qs = await raterQuestions(r.instrument_id);
  return {
    success: true, done: r.status === 'submitted',
    participant: r.participants?.full_name || null, relation: RELATION_AR[r.relation] || null, rater: r.full_name,
    questions: qs.map((q) => ({
      id: q.id, dimension: q.dimension, text: q.text_rater_ar || q.text_ar,
      options: (q.options || []).map((o: any, k: number) => ({ k, label: o.score < 0 ? 'لا أستطيع الحكم' : o.label })),
    })),
  };
}

export async function raterSubmit(b: Body) {
  const r = await raterFrom(b.t);
  if (r.status === 'submitted') throw new Fail('أُرسل التقدير من قبل، شكرًا لك', 409, 'done');
  const qs = await raterQuestions(r.instrument_id);
  const input = b.answers || {};
  const answers: Record<string, { now: number; before: number }> = {};
  for (const q of qs) {
    const a = input[q.id];
    const ok = (k: unknown) => Number.isInteger(k) && (k as number) >= 0 && (k as number) < (q.options || []).length;
    if (!a || !ok(a.now) || !ok(a.before)) throw new Fail('أكمل التقديرين لكل عبارة', 400, 'incomplete');
    answers[q.id] = { now: a.now, before: a.before };
  }
  const comment = b.comment ? String(b.comment).trim().slice(0, 2000) || null : null;
  must(await db.from('raters').update({ answers, comment, status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', r.id));
  // إفادة المدير في الرحلة تكتمل بتقديره المنظم
  if (r.relation === 'manager') {
    const { data: who } = await db.from('participants').select('id, organization_id').eq('id', r.participant_id).maybeSingle();
    const reqId = who ? await requirementIdByCode(who, 'E-MGR') : null;
    if (reqId) {
      await db.from('participant_requirements').upsert({
        participant_id: r.participant_id, requirement_id: reqId, status: 'done',
        note: 'اكتملت بتقدير المدير المباشر في المنصة', completed_at: new Date().toISOString(),
      });
    }
  }
  await audit('system', null, 'rater.submit', 'raters', r.id, null, { participant_id: r.participant_id, relation: r.relation });
  return { success: true };
}

// ── الإدارة: تقرير الأثر للدفعة أو للجهة ──
export async function adminReport(b: Body) {
  let q = db.from('participants').select('id, full_name, email, organization_id, status, organizations(name)');
  if (b.organization_id) q = q.eq('organization_id', String(b.organization_id));
  if (b.participant_id) q = q.eq('id', String(b.participant_id));
  const people = must(await q.limit(2000)) as any[] ?? [];
  const ids = people.map((p) => p.id);
  const { rows, cfg } = await compareFor(ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  const raters = must(await db.from('raters').select('participant_id, status').in('participant_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])) as any[] ?? [];
  const rCount = (pid: string, s: string) => raters.filter((r: any) => r.participant_id === pid && r.status === s).length;

  const list = people.map((p) => ({
    id: p.id, full_name: p.full_name, email: p.email, organization: p.organizations?.name || null, status: p.status,
    baseline_at: rows[p.id]?.baseline_at || null, post_at: rows[p.id]?.post_at || null,
    raters_invited: rCount(p.id, 'invited') + rCount(p.id, 'submitted'), raters_done: rCount(p.id, 'submitted'),
    dimensions: rows[p.id]?.dimensions || null,
  }));
  const paired = list.filter((x) => x.dimensions);
  const cohort = Object.fromEntries(DIMENSIONS.map((d) => {
    const dims = paired.map((x) => x.dimensions.find((y: any) => y.dimension === d)).filter((y: any) => y && y.composite_pre != null);
    const s = pairedStats(dims.map((y: any) => [y.composite_pre, y.composite_post]));
    const verdicts: Record<string, number> = {};
    for (const y of dims) verdicts[y.verdict.key] = (verdicts[y.verdict.key] || 0) + 1;
    const raterPairs = dims.filter((y: any) => y.rater).map((y: any) => [y.rater.before, y.rater.now]);
    return [d, {
      ...s, effect: effectLabel(s.dz),
      reliable_up: dims.filter((y: any) => y.direction === 'up').length,
      reliable_down: dims.filter((y: any) => y.direction === 'down').length,
      level_up: dims.filter((y: any) => rank(y.post.level) > rank(y.pre.level)).length,
      verdicts, rater: pairedStats(raterPairs),
      response_shift: avg(dims.map((y: any) => y.response_shift)),
    }];
  }));
  const transfer = await transferStats(paired.map((x) => x.id));
  return {
    success: true,
    counts: { participants: list.length, baseline: list.filter((x) => x.baseline_at).length, post: list.filter((x) => x.post_at).length, paired: paired.length },
    cohort, transfer, config: cfg, participants: list,
    // تنبيه منهجي يظهر فوق الأرقام حين تكون الدفعة صغيرة
    caution: paired.length < cfg.min_n
      ? `العدد ${paired.length} أقل من ${cfg.min_n}: الأرقام وصفية لهذه الدفعة ولا تُعمَّم، والثبات المستعمل افتراضي.`
      : null,
  };
}
const RANKS: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const rank = (l: string | null) => (l && l in RANKS ? RANKS[l] : -1);
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null;
};

// بنود انتقال التعلم: نسبة الموافقة (أوافق وأوافق بشدة) لكل بند
async function transferStats(ids: string[]) {
  if (!ids.length) return [];
  const posts = must(await db.from('assessments').select('id, instruments!inner(kind)').eq('status', 'submitted')
    .eq('instruments.kind', 'post').in('participant_id', ids)) as any[] ?? [];
  if (!posts.length) return [];
  const answers: any[] = [];
  for (let i = 0; i < posts.length; i += 200) {
    answers.push(...((must(await db.from('assessment_answers').select('question_id, score, questions!inner(code, text_ar, tier, sort)')
      .in('assessment_id', posts.slice(i, i + 200).map((x: any) => x.id)).eq('questions.tier', 'transfer')) as any[]) ?? []));
  }
  const by: Record<string, { code: string; text: string; sort: number; n: number; agree: number; sum: number }> = {};
  for (const a of answers) {
    const x = (by[a.question_id] ||= { code: a.questions.code, text: a.questions.text_ar, sort: a.questions.sort, n: 0, agree: 0, sum: 0 });
    x.n++; x.sum += Number(a.score) || 0; if (Number(a.score) >= 3) x.agree++;
  }
  return Object.values(by).sort((a, b) => a.sort - b.sort)
    .map((x) => ({ code: x.code, text: x.text, n: x.n, agree_pct: Math.round((x.agree / x.n) * 100), mean: Math.round((x.sum / x.n) * 100) / 100 }));
}
