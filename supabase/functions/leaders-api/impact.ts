// ════════════════════════════════════════════════════════════════
// قياس الأثر: المقارنة بين القياس المبدئي والبعدي، والمقيّمون الخارجيون
// ════════════════════════════════════════════════════════════════
// المنطق الحسابي في logic.js (يُختبر في vitest)، وهنا جمع البيانات فقط.
// المشارك يرى ملخصًا واحدًا، والإدارة ترى التفصيل لكل إطار والدفعة كاملة.
import { all, allFor, audit, CONFIG, db, Fail, hash, logConsent, must, randomToken, raterConfirmMail, raterMail, raterRejectedMail, sendMail } from './core.ts';
import { RATER_FLAG_AR, RATER_VERIFICATION_AR, raterVerification } from './domains.js';
import { advisorOf } from './advisor.ts';
import { lastBaseline, postInstrumentFor, requirePostOpen } from './participant.ts';
import { requirementIdByCode } from './programs.ts';
import { scopeOrg } from './admin.ts';
import {
  compareAssessments, compositeReliability, coordPermissions, DIMENSIONS, effectLabel, equate, formOffsets, IMPACT_DEFAULTS, isEmail, normalizeEmail,
  levelGainReport, overallChange, pairComparable, pairedStats, practiceEffect, anchorRepeat, anchorShareOf, raterPercents, raterProspective, surveySummary,
  linkAfterDecisionOk, LINK_CLOSED_AR,
} from './logic.js';
import { cleanOpenAnswers, CONTACT_FREQ, feedbackPromiseAr, OPEN_KEYS, raterItems } from './feedback360.js';
import { appSettings } from './settings.ts';
import { FEEDBACK_OPEN_AR } from './labels.js';

type Body = Record<string, any>;

const RATER_LIMIT = 3;
export const RELATION_AR: Record<string, string> = { manager: 'المدير المباشر', peer: 'زميل', report: 'أحد أعضاء الفريق', stakeholder: 'أحد أصحاب المصلحة' };
// مقيّمو قياس الأثر بمرحلتيهم وحدهما: مقيّم تقييم 360 (phase f360) للتطوير، لا يدخل الأثر ولا قائمة الأثر ولا عدّاده
export const IMPACT_PHASES = ['pre', 'post'];

// آخر قياس مُرسل من كل نوع لكل مشارك، بنتائجه. زوج أداتاه غير متطابقتين
// (pairs_with البعدي لا يساوي مفتاح المبدئي) يُعلَّم غير قابل للمقارنة ولا
// تُقرأ نتائجه.
async function latestResults(ids: string[] | null) {
  const rows = await allFor(ids, () => db.from('assessments').select('id, participant_id, submitted_at, instrument_id, form, instruments(kind, key, pairs_with)')
    .eq('status', 'submitted').order('submitted_at', { ascending: false }).order('id'));
  const pick: Record<string, { baseline?: any; post?: any; comparable?: boolean; reason?: string | null }> = {};
  for (const a of rows) {
    const kind = a.instruments?.kind;
    if (kind !== 'baseline' && kind !== 'post') continue;
    const x = (pick[a.participant_id] ||= {});
    if (!(x as any)[kind]) (x as any)[kind] = a;
  }
  for (const x of Object.values(pick)) {
    if (!x.baseline || !x.post) continue;
    const c = pairComparable(x.baseline.instruments, x.post.instruments);
    x.comparable = c.comparable; x.reason = c.reason;
  }
  const aids = Object.values(pick).filter((x) => x.comparable).flatMap((x) => [x.baseline?.id, x.post?.id]).filter(Boolean) as string[];
  const results: Record<string, Record<string, any>> = {};
  for (let i = 0; i < aids.length; i += 200) {
    const part = must(await db.from('assessment_results').select('*').in('assessment_id', aids.slice(i, i + 200))) as any[] ?? [];
    for (const r of part) {
      (results[r.assessment_id] ||= {})[r.dimension] = {
        knowledge: num(r.knowledge_pct), skill: num(r.skill_pct), behavior: num(r.behavior_pct),
        behavior_before: num(r.behavior_before_pct), composite: num(r.composite_pct), level: r.level,
        skill_anchor: num(r.skill_anchor_pct), skill_form: num(r.skill_form_pct),
        behavior_common: num(r.behavior_common_pct), behavior_pre_common: num(r.behavior_pre_common_pct),
        level_gain: num(r.level_gain_pct), level_gain_n: num(r.level_gain_n), level_gain_level: r.level_gain_level ?? null,
      };
    }
  }
  return { pick, results };
}
const num = (x: unknown) => (x == null ? null : Number(x));

// إعدادات الحكم: من نموذج التسكين، ثم من بيانات الدفعة إن كفى عددها:
// ثبات طبقي موزون لكل إطار وللمؤشر الكلي (ولحكم الاختبار وحده)، ومعادلة
// الصيغتين من القياس المبدئي، وأثر تكرار المواقف من أزواج القياسين.
async function impactConfig() {
  const model = must(await db.from('placement_model').select('*').eq('id', 1).maybeSingle()) as any;
  const cfg: any = {
    rci_reliability: Number(model?.rci_reliability ?? IMPACT_DEFAULTS.rci_reliability),
    rci_sd: Number(model?.rci_sd ?? IMPACT_DEFAULTS.rci_sd),
    min_n: Number(model?.impact_min_n ?? IMPACT_DEFAULTS.min_n),
    rater_threshold: Number(model?.rater_threshold ?? IMPACT_DEFAULTS.rater_threshold),
    rci_practice: Number(model?.rci_practice ?? IMPACT_DEFAULTS.rci_practice),
    reliability: {}, sd: {}, test_reliability: {}, test_sd: {}, practice: {}, source: {}, offsets: null,
  };
  const { data: base } = await db.from('instruments').select('id, key').eq('kind', 'baseline').eq('active', true)
    .order('version', { ascending: false }).limit(1).maybeSingle();
  // ثبات منخفض جدًا لا يُستعمل: يجعل كل تغير "غير موثوق" ويخفي ضعف الأداة
  const usable = (r: any) => r && r.n >= cfg.min_n && r.alpha != null && r.alpha > 0.3;
  let full: any = { dims: {}, overall: null };
  let share: Record<string, number> = {};
  if (base) {
    const [qs, sessions] = await Promise.all([
      all((f, t) => db.from('questions').select('id, code, dimension, tier, options, form, active, anchor_code, min_level').eq('instrument_id', base.id).eq('active', true).range(f, t)),
      all((f, t) => db.from('assessments').select('id, form').eq('instrument_id', base.id).eq('status', 'submitted').range(f, t)),
    ]);
    const rows: any[] = [];
    for (let i = 0; i < sessions.length; i += 200) {
      const part = sessions.slice(i, i + 200).map((x: any) => x.id);
      rows.push(...await all((f, t) => db.from('assessment_answers').select('assessment_id, question_id, score').in('assessment_id', part).range(f, t)));
    }
    const forms = Object.fromEntries(sessions.map((x: any) => [x.id, x.form]));
    full = compositeReliability(qs, rows, { forms, model }) as any;
    share = anchorShareOf(qs);   // حصة المواقف المشتركة من الأداة المفعّلة (3/6 في v4، 3/8 في v5)
    const test: any = compositeReliability(qs, rows, { forms, model, tiers: ['knowledge', 'skill'] });
    for (const d of DIMENSIONS) {
      if (usable(full.dims[d])) { cfg.reliability[d] = Math.min(0.95, full.dims[d].alpha); cfg.sd[d] = full.dims[d].sd; }
      if (usable(test.dims[d])) { cfg.test_reliability[d] = Math.min(0.95, test.dims[d].alpha); cfg.test_sd[d] = test.dims[d].sd; }
    }
    if (usable(full.overall)) { cfg.overall_reliability = Math.min(0.97, full.overall.alpha); cfg.overall_sd = full.overall.sd; }
    if (usable(test.overall)) { cfg.overall_test_reliability = Math.min(0.97, test.overall.alpha); cfg.overall_test_sd = test.overall.sd; }
    // معادلة الصيغتين: متوسط كل صيغة في المبدئي
    if (sessions.some((x: any) => x.form)) {
      const res: any[] = [];
      for (let i = 0; i < sessions.length; i += 200) {
        const part = sessions.slice(i, i + 200).map((x: any) => x.id);
        res.push(...await all((f, t) => db.from('assessment_results').select('assessment_id, dimension, knowledge_pct, skill_pct').in('assessment_id', part).range(f, t)));
      }
      const by: Record<string, any> = {};
      for (const r of res) ((by[r.assessment_id] ||= { form: forms[r.assessment_id], dims: {} }).dims[r.dimension] = { knowledge: num(r.knowledge_pct), skill: num(r.skill_pct) });
      cfg.offsets = formOffsets(Object.values(by), { minN: cfg.min_n });
    }
  }
  for (const d of DIMENSIONS) {
    const s = full.dims[d];
    cfg.source[d] = { n: s?.n || 0, alpha: s?.alpha ?? null, sd: s?.sd ?? null, from_data: !!cfg.reliability[d] };
  }
  cfg.source.overall = { n: full.overall?.n || 0, alpha: full.overall?.alpha ?? null, from_data: cfg.overall_reliability != null };
  // أثر التكرار من كل أزواج القياسين التي فيها مواقف مشتركة وموازية
  const { pick, results } = await latestResults(null);
  for (const d of DIMENSIONS) {
    const pairs = Object.values(pick).filter((x) => x.baseline && x.post).map((x) => ({
      pre: { anchor: results[x.baseline.id]?.[d]?.skill_anchor, form: results[x.baseline.id]?.[d]?.skill_form },
      post: { anchor: results[x.post.id]?.[d]?.skill_anchor, form: results[x.post.id]?.[d]?.skill_form },
    }));
    const pe = practiceEffect(pairs, { anchorShare: share[d] ?? 0.5 });
    cfg.source[d].practice_n = pe.n;
    cfg.source[d].anchor_share = share[d] ?? 0.5;
    if (pe.n >= cfg.min_n && pe.points != null) cfg.practice[d] = pe.points;
  }
  return { model, cfg, baseline: base };
}

// تقدير المقيّمين لكل مشارك. من قدّر قبل البرنامج وبعده يُقارن تقديراه
// (قياس قبلي وبعدي حقيقي)، وإلا يُستعمل تقديره الرجعي "قبل البرنامج".
async function raterData(ids: string[] | null) {
  const rows = await allFor(ids, () => db.from('raters').select('participant_id, instrument_id, relation, answers, status, email, phase').eq('status', 'submitted').in('phase', IMPACT_PHASES).order('id'));
  const insts = [...new Set(rows.map((r) => r.instrument_id))];
  const qs = insts.length ? (must(await db.from('questions').select('id, code, anchor_code, dimension, options, tier, instrument_id')
    .in('instrument_id', insts).eq('tier', 'behavior')) as any[] ?? []) : [];
  const qsOf = (id: string) => qs.filter((x: any) => x.instrument_id === id);
  const by: Record<string, any> = {};
  for (const r of rows.filter((x) => x.phase !== 'pre')) {
    const pre = rows.find((x) => x.phase === 'pre' && x.participant_id === r.participant_id && x.email === r.email);
    const pcts = pre
      ? raterProspective(qsOf(pre.instrument_id), pre.answers || {}, qsOf(r.instrument_id), r.answers || {})
      : raterPercents(qsOf(r.instrument_id), r.answers || {});
    (by[r.participant_id] ||= []).push({ relation: r.relation, pcts });
  }
  // متوسط المقيّمين لكل إطار، ويُقدَّم المدير إن وُجد
  const out: Record<string, any> = {};
  for (const [pid, list] of Object.entries(by) as [string, any[]][]) {
    const use = list.some((x) => x.relation === 'manager') ? list.filter((x) => x.relation === 'manager') : list;
    out[pid] = Object.fromEntries(DIMENSIONS.map((d) => {
      const vals = use.map((x) => x.pcts[d]).filter(Boolean);
      if (!vals.length) return [d, null];
      const avg = (k: 'now' | 'before') => Math.round(vals.reduce((a, v) => a + v[k], 0) / vals.length * 10) / 10;
      return [d, { now: avg('now'), before: avg('before'), n: vals.length, prospective: vals.every((v) => v.prospective) }];
    }));
  }
  return out;
}

async function evidenceDone(ids: string[] | null) {
  // E-CASE في كل البرامج: لكل برنامج متطلبه بالرمز نفسه
  const { data: reqs } = await db.from('stage_requirements').select('id').eq('code', 'E-CASE');
  if (!reqs?.length) return new Set<string>();
  const rows = await allFor(ids, () => db.from('participant_requirements').select('participant_id').in('requirement_id', reqs.map((r: any) => r.id)).eq('status', 'done'));
  return new Set(rows.map((r) => r.participant_id));
}

// المقارنة لعدد من المشاركين (أو للجميع إن كان ids فارغًا)
export async function compareFor(ids: string[] | null) {
  const [{ pick, results }, { model, cfg }, raters, evidence] = await Promise.all([
    latestResults(ids), impactConfig(), raterData(ids), evidenceDone(ids),
  ]);
  // أثر التكرار يُطرح ممن أعاد المواقف المشتركة فعلًا: ربع المشاركين (anchorRepeat) على أداة
  // بعدية ذات توائم، والجميع على أداة بلا توائم (post-v1)
  const { data: twinRows } = await db.from('questions').select('instrument_id, code, anchor_code').not('anchor_code', 'is', null);
  const twinned = new Set((twinRows || []).filter((q: any) => q.anchor_code !== q.code).map((q: any) => q.instrument_id));
  const out: Record<string, any> = {};
  for (const [pid, x] of Object.entries(pick)) {
    if (!x.baseline || !x.post) { out[pid] = { pid, baseline_at: x.baseline?.submitted_at || null, post_at: x.post?.submitted_at || null, dimensions: null }; continue; }
    // أداتان غير متطابقتين: لا مقارنة، ويظهر السبب للإدارة
    if (!x.comparable) {
      out[pid] = {
        pid, baseline_at: x.baseline.submitted_at, post_at: x.post.submitted_at,
        baseline_key: x.baseline.instruments?.key, post_key: x.post.instruments?.key,
        comparable: false, reason: x.reason, dimensions: null,
      };
      continue;
    }
    // معادلة الصيغتين قبل المقارنة: كل نتيجة بصيغتها
    const repeat = twinned.has(x.post.instrument_id) ? anchorRepeat(pid) : true;
    const dimensions = compareAssessments({
      pre: equate(results[x.baseline.id] || {}, x.baseline.form, cfg.offsets),
      post: equate(results[x.post.id] || {}, x.post.form, cfg.offsets),
      model, impact: cfg, rater: raters[pid] || null, evidence: evidence.has(pid), repeat,
    });
    out[pid] = {
      pid, baseline_at: x.baseline.submitted_at, post_at: x.post.submitted_at,
      baseline_key: x.baseline.instruments?.key, post_key: x.post.instruments?.key,
      repeat_group: repeat,   // أعاد المواقف المشتركة فطُرح منه أثر التكرار (إن قُدّر)
      // «مكتسبات المستوى»: فقرات البعدي الخاصة بالمستوى، خارج فرق القبلي والبعدي
      level_gains: levelGainReport(results[x.post.id] || {}),
      forms: x.baseline.form || x.post.form ? [x.baseline.form, x.post.form] : null,
      dimensions, overall: overallChange(dimensions, cfg, evidence.has(pid)),
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
    before: row.overall?.composite_pre ?? avg('composite_pre'), after: row.overall?.composite_post ?? avg('composite_post'),
    reliable: row.overall?.direction ?? null,
    reliable_up: dims.filter((d: any) => d.direction === 'up').length,
    practice_then: bavg('behavior_before'), practice_now: bavg('behavior'),
    at: row.post_at,
  };
}

// ── المشارك: ملخصه بعد القياس البعدي، ودعوة مقيّميه ──
export async function mine(p: any) {
  const [{ rows }, raters, pre] = await Promise.all([
    compareFor([p.id]),
    // كل الأعمدة حتى لا يُفشل عمود لم يُرحَّل القراءة (D19)، ثم ما يحق للمشارك رؤيته وحده
    db.from('raters').select('*').eq('participant_id', p.id).neq('status', 'revoked').in('phase', IMPACT_PHASES).order('invited_at')
      .then((r: any) => ((must(r) ?? []) as any[]).map(raterView)),
    preRating(p),
  ]);
  return { success: true, summary: participantSummary(rows[p.id]), raters, limit: RATER_LIMIT, pre_available: !!pre.ok };
}

async function postInstrument(p: any) {
  const data = await postInstrumentFor(p.id);
  if (!data) throw new Fail('القياس البعدي لم يُفعَّل بعد', 409, 'no_instrument');
  return data;
}

// تقدير المدير قبل البرنامج: بعد القياس المبدئي وقبل البعدي، وبأداة فيها
// صيغة الغائب لعبارات الممارسة (baseline-v4 فما بعد).
async function preRating(p: any) {
  const base = await lastBaseline(p.id);
  if (!base) return { ok: false, reason: 'أرسل قياسك المبدئي أولًا' };
  const { count: posts } = await db.from('assessments').select('id, instruments!inner(kind)', { count: 'exact', head: true })
    .eq('participant_id', p.id).eq('status', 'submitted').eq('instruments.kind', 'post');
  if (posts) return { ok: false, reason: 'أرسلت قياسك البعدي، فتقدير ما قبل البرنامج لم يعد ممكنًا' };
  const { count } = await db.from('questions').select('id', { count: 'exact', head: true })
    .eq('instrument_id', base.instrument_id).eq('tier', 'behavior').eq('active', true).not('text_rater_ar', 'is', null);
  if (!count) return { ok: false, reason: 'نسخة قياسك المبدئي لا تدعم تقدير المدير قبل البرنامج' };
  return { ok: true, instrument_id: base.instrument_id };
}

// expired: دعوة مرسلة انقضت مهلتها فالرابط يقول للمقيّم «انتهت صلاحية الرابط»؛ كانت تظهر للمشارك «بانتظار تقديره»
// بلا ما يدل على أن عليه إعادة الإرسال (p-capstone-6، تدقيق 2026-11-11). ومثلها مهلة الرابط في raterFrom
const raterExpired = (r: any) => r.status === 'invited' && !!r.expires_at && new Date(r.expires_at) < new Date();
export const raterView = (r: any) => ({ id: r.id, email: r.email, full_name: r.full_name, relation: r.relation, status: r.status, invited_at: r.invited_at, submitted_at: r.submitted_at, phase: r.phase,
  expired: raterExpired(r),
  verification: r.verification ?? null, verification_ar: r.verification ? (RATER_VERIFICATION_AR as Record<string, string>)[r.verification] : null,
  flags_ar: (r.verification_flags || []).map((f: string) => (RATER_FLAG_AR as Record<string, string>)[f] || f) });

// D19: حكم التحقق من بريد المقيّم بنطاقات جهة المشارك المسجلة
export async function raterCheck(p: any, email: string) {
  const org = p.organization_id ? (await db.from('organizations').select('domains').eq('id', p.organization_id).maybeSingle()).data : null;
  return raterVerification(email, { participantEmails: [p.email], orgDomains: (org as any)?.domains || [], linked: !!p.organization_id });
}

// من يؤكد مقيّمًا منتظرًا: مستشار دفعة المشارك، ومنسقو جهته ممن يرون قائمة المشاركين. بريد بلا عنوان المقيّم
async function notifyConfirmers(p: any, flags: string[]) {
  const why = flags.map((f) => (RATER_FLAG_AR as Record<string, string>)[f] || f).join('، ');
  const adv = await advisorOf(p).catch(() => null);
  const to: [string, string][] = adv ? [[adv.email, `${CONFIG.appUrl}/x`]] : [];
  if (p.organization_id) {
    const { data: coords } = await db.from('org_coordinators').select('email, status, permissions').eq('organization_id', p.organization_id).neq('status', 'suspended');
    for (const c of coords || []) if (coordPermissions((c as any).permissions).list) to.push([(c as any).email, `${CONFIG.appUrl}/org`]);
  }
  for (const [email, url] of to) await sendMail(email, `مقيّم بانتظار تأكيدك: ${p.full_name || 'مشارك'}`, raterConfirmMail(p.full_name || 'مشارك', why, url), [], { ref: `participant:${p.id}` }).catch((e) => console.error('rater confirm notify', e));
  return to.length;
}

export async function invite(p: any, b: Body) {
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('البريد غير صحيح');
  const check = await raterCheck(p, email);
  if (check.verdict === 'reject') throw new Fail('ادعُ مديرك أو زميلك، لا بريدك');
  const phase = b.phase === 'pre' ? 'pre' : 'post';
  // قبل البرنامج: المدير المباشر وحده، فهو من يُعاد تقديره بعد البرنامج
  const relation = phase === 'pre' ? 'manager' : ['manager', 'peer', 'report'].includes(b.relation) ? b.relation : 'manager';
  const name = String(b.full_name || '').trim().slice(0, 120) || null;
  let instrumentId: string;
  if (phase === 'pre') {
    const pre = await preRating(p);
    if (!pre.ok) throw new Fail(pre.reason as string);
    instrumentId = pre.instrument_id as string;
  } else {
    await requirePostOpen(p);
    instrumentId = (await postInstrument(p)).id;
  }
  const limit = phase === 'pre' ? 1 : RATER_LIMIT;
  const existing = must(await db.from('raters').select('id, email, status').eq('participant_id', p.id).eq('phase', phase).neq('status', 'revoked')) as any[] ?? [];
  if (!existing.some((r: any) => r.email === email) && existing.length >= limit) throw new Fail(limit === 1 ? 'دعوت مديرك من قبل' : `الحد ${limit} مقيّمين`);
  const token = randomToken();
  // D19: من نطاق الجهة يُرسل فورًا، وما سواه awaiting حتى يؤكده المستشار أو المنسق. العلامات من أول دعوة
  const awaiting = check.verdict === 'pending';
  const row: Record<string, unknown> = { participant_id: p.id, instrument_id: instrumentId, email, full_name: name, relation, phase, token_hash: await hash(token),
    status: awaiting ? 'awaiting' : 'invited', invited_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
    verification: check.verdict, verification_flags: check.flags, verified_by: awaiting ? null : 'system:org_domain', verified_at: awaiting ? null : new Date().toISOString() };
  const { data: prev } = await db.from('raters').select('id, status, invited_at').eq('participant_id', p.id).eq('email', email).eq('phase', phase).maybeSingle();
  if (prev?.status === 'submitted') throw new Fail('أرسل هذا المقيّم تقديره من قبل');
  if (prev && Date.now() - new Date(prev.invited_at).getTime() < 10 * 60e3) throw new Fail('أُرسلت الدعوة قبل قليل، أعد الإرسال بعد عشر دقائق', 429, 'rate');
  const write = (r: Record<string, unknown>) => (prev ? db.from('raters').update(r).eq('id', prev.id).select('id').single() : db.from('raters').insert(r).select('id').single());
  // D19: تعذّر الحفظ (ومنه قيد الحالة أو الحكم) يفشل الدعوة، ولا تُرسل بلا علامات ولا تحقق
  const saved = must(await write(row)) as { id: string };
  if (awaiting) {
    const told = await notifyConfirmers(p, check.flags);
    await audit('participant', p.id, 'rater.invite', 'raters', saved.id, null, { email, relation, phase, verification: 'pending', flags: check.flags, confirmers: told });
    return mine(p);
  }
  const link = `${CONFIG.appUrl}/rate?t=${encodeURIComponent(token)}`;
  // ref المقيّم: منه نسب استجابة المقيّمين في سجل الإرسال (D15)
  await sendMail(email, `طلب تقدير من ${p.full_name || 'مشارك في برنامج القادة'}`, raterMail(name, p.full_name || 'زميلك', link, phase), [], { ref: `rater:${saved.id}` });
  await audit('participant', p.id, 'rater.invite', 'raters', saved.id, null, { email, relation, phase, verification: check.verdict });
  return mine(p);
}

export async function revoke(p: any, b: Body) {
  must(await db.from('raters').update({ status: 'revoked' }).eq('id', String(b.id || '')).eq('participant_id', p.id).in('phase', IMPACT_PHASES).in('status', ['invited', 'awaiting']));
  return mine(p);
}

// ── D19: المقيّمون المنتظرون ومن يؤكدهم ──
// القائمة لمشاركين بأعينهم (مشاركو المستشار، أو مشاركو جهة المنسق). تعذّر القراءة يرمي، فلا تظهر قائمة فارغة بصمت
export async function awaitingFor(ids: string[]) {
  if (!ids.length) return [];
  const data = must(await db.from('raters').select('id, participant_id, email, full_name, relation, phase, verification_flags, invited_at, participants(full_name)')
    .in('participant_id', ids).eq('status', 'awaiting').order('invited_at')) as any[];
  return (data || []).map((r: any) => ({ id: r.id, participant_id: r.participant_id, participant: r.participants?.full_name || null, email: r.email, full_name: r.full_name,
    relation_ar: RELATION_AR[r.relation] || r.relation, phase: r.phase, invited_at: r.invited_at,
    flags_ar: (r.verification_flags || []).map((f: string) => (RATER_FLAG_AR as Record<string, string>)[f] || f) }));
}

// التأكيد يرسل الدعوة برابط جديد (الرمز لا يُستعاد من بصمته)، وعدم الاعتماد بسبب يُبلَّغ به المشارك.
// allowed يحصر الصلاحية في نطاق المؤكِّد؛ وكل قرار في السجل بمن اتخذه
export async function confirmRater(by: { kind: 'expert' | 'coordinator'; email: string }, b: Body, allowed: (participantId: string) => Promise<boolean>) {
  const id = String(b.id || '');
  const r = must(await db.from('raters').select('id, participant_id, email, full_name, relation, phase, status, participants(full_name, email)').eq('id', id).maybeSingle()) as any;
  if (!r || r.status !== 'awaiting') throw new Fail('لا مقيّم بانتظار التأكيد بهذا المعرّف', 404, 'not_found');
  if (!(await allowed(r.participant_id))) throw new Fail('هذا المقيّم لمشارك ليس من نطاقك', 403, 'forbidden');
  const who = `${by.kind}:${by.email}`;
  const now = new Date().toISOString();
  const actorType = by.kind === 'coordinator' ? 'coordinator' : 'system';
  if (b.decision === 'reject') {
    const reason = String(b.reason || '').trim().slice(0, 500);
    if (reason.length < 5) throw new Fail('اكتب سبب عدم الاعتماد ليصل المشارك');
    must(await db.from('raters').update({ status: 'revoked', verification: 'rejected', verified_by: who, verified_at: now }).eq('id', id).eq('status', 'awaiting'));
    await audit(actorType, who, 'rater.reject', 'raters', id, null, { participant_id: r.participant_id, reason });
    if (r.participants?.email) await sendMail(r.participants.email, 'لم يُعتمد أحد مقيّميك', raterRejectedMail(r.participants.full_name, r.full_name || r.email, reason), [], { ref: `participant:${r.participant_id}` }).catch((e) => console.error('rater reject mail', e));
    return { success: true, decision: 'reject' };
  }
  const token = randomToken();
  must(await db.from('raters').update({ status: 'invited', verification: 'confirmed', verified_by: who, verified_at: now, token_hash: await hash(token),
    invited_at: now, expires_at: new Date(Date.now() + 30 * 864e5).toISOString() }).eq('id', id).eq('status', 'awaiting'));
  const link = `${CONFIG.appUrl}/rate?t=${encodeURIComponent(token)}`;
  await sendMail(r.email, `طلب تقدير من ${r.participants?.full_name || 'مشارك في برنامج القادة'}`, raterMail(r.full_name, r.participants?.full_name || 'زميلك', link, r.phase), [], { ref: `rater:${id}` });
  await audit(actorType, who, 'rater.confirm', 'raters', id, null, { participant_id: r.participant_id });
  return { success: true, decision: 'confirm' };
}

// ── المقيّم: رابط بريد بلا حساب ──
async function raterFrom(t: unknown) {
  const token = String(t || '');
  if (token.length < 20) throw new Fail('الرابط غير صالح', 400, 'invalid');
  const r = must(await db.from('raters').select('*, participants(full_name)').eq('token_hash', await hash(token)).maybeSingle()) as any;
  // nominated: رشّحه المشارك في تقييم 360 ولم يعتمد المستشار القائمة بعد، فلا رابط له
  if (!r || r.status === 'revoked' || r.status === 'nominated') throw new Fail('الرابط غير صالح أو أُلغي', 404, 'invalid');
  if (new Date(r.expires_at) < new Date() && r.status !== 'submitted') throw new Fail('انتهت صلاحية الرابط، اطلب دعوة جديدة', 410, 'expired');
  // بعد الإرسال: اطلاع محدود المدة (4.5)
  if (r.status === 'submitted' && !linkAfterDecisionOk(r.submitted_at)) throw new Fail(LINK_CLOSED_AR, 410, 'closed');
  return r;
}

// عبارات المقيّم بحسب مجموعته (تقييم 360، المرحلة 1): observable_by إن عُلِّمت، والمعكوسة لا تُعرض عليه.
// كل الأعمدة حتى لا يُفشل observable_by قبل ترحيله القراءة
async function raterQuestions(instrumentId: string, relation: string) {
  const qs = must(await db.from('questions').select('*')
    .eq('instrument_id', instrumentId).eq('active', true).eq('tier', 'behavior').order('sort')) as any[] ?? [];
  return raterItems(qs, relation);
}

// كتابة متسامحة: عمود لم يُرحَّل بعد (42703 أو PGRST204) لا يُفشل الحفظ، فيُعاد بلا الأعمدة الجديدة
const missingColumn = (e: any) => e && (e.code === '42703' || e.code === 'PGRST204');

export async function raterGet(b: Body) {
  const r = await raterFrom(b.t);
  if (!r.opened_at) await db.from('raters').update({ opened_at: new Date().toISOString() }).eq('id', r.id);
  const qs = await raterQuestions(r.instrument_id, r.relation);
  // تقييم 360: مراسي السلم ووعد الإخفاء من الإعدادات العامة (scale_labels وmin_group)، بحسب مجموعة المقيّم
  const f360 = r.phase === 'f360' ? (await appSettings()).feedback360 : null;
  const label = (o: any) => (o.score < 0 ? 'لا أستطيع الحكم' : f360 ? f360.scale_labels[Number(o.score)] ?? o.label : o.label);
  return {
    success: true, done: r.status === 'submitted', phase: r.phase || 'post',
    participant: r.participants?.full_name || null, relation: RELATION_AR[r.relation] || null, rater: r.full_name,
    ...(f360 ? { promise: feedbackPromiseAr(r.relation, f360), closes_at: r.expires_at } : {}),
    questions: qs.map((q) => ({
      id: q.id, dimension: q.dimension, text: q.text_rater_ar || q.text_ar,
      options: (q.options || []).map((o: any, k: number) => ({ k, label: label(o) })),
    })),
  };
}

export async function raterSubmit(b: Body) {
  const r = await raterFrom(b.t);
  if (r.status === 'submitted') throw new Fail('أُرسل التقدير من قبل، شكرًا لك', 409, 'done');
  const qs = await raterQuestions(r.instrument_id, r.relation);
  const input = b.answers || {};
  // سؤال الصلة في أول النموذج: إلزامي بنقرة واحدة
  const contact_freq = CONTACT_FREQ.includes(b.contact_freq) ? b.contact_freq : null;
  if (!contact_freq) throw new Fail('اختر كم مرة ترى عمله', 400, 'incomplete');
  const open_answers = cleanOpenAnswers(b.open) as Record<string, string> | null;
  // تقدير الآن وحده قبل البرنامج وفي تقييم 360، وتقديران (الآن وقبل البرنامج) في تقدير الأثر البعدي وحده
  const pre = r.phase !== 'post';
  const answers: Record<string, { now: number; before?: number }> = {};
  for (const q of qs) {
    const a = input[q.id];
    const ok = (k: unknown) => Number.isInteger(k) && (k as number) >= 0 && (k as number) < (q.options || []).length;
    if (!a || !ok(a.now) || (!pre && !ok(a.before))) throw new Fail(pre ? 'أكمل التقدير لكل عبارة' : 'أكمل التقديرين لكل عبارة', 400, 'incomplete');
    answers[q.id] = pre ? { now: a.now } : { now: a.now, before: a.before };
  }
  // الملاحظة القديمة الواحدة باقية لنسخة واجهة سابقة، والأسئلة الثلاثة في open_answers
  const comment = b.comment ? String(b.comment).trim().slice(0, 2000) || null : null;
  // D18: سطر موافقة المقيّم بإرساله تقديره بعد إشعار الخصوصية، قبل الحفظ: تعذّره يفشل الإرسال فيعيده، ولا تقدير بلا موافقته
  await logConsent('rater', r.id, 'accept');
  const base = { answers, status: 'submitted', submitted_at: new Date().toISOString() };
  const saved = await db.from('raters').update({ ...base, comment, open_answers, contact_freq }).eq('id', r.id);
  if (missingColumn(saved.error)) {
    // قبل ترحيل 20261111130000: الأسئلة المفتوحة في الملاحظة الواحدة حتى لا يضيع نصها
    const text = open_answers ? OPEN_KEYS.filter((k) => open_answers[k]).map((k) => `${(FEEDBACK_OPEN_AR as Record<string, string>)[k]} ${open_answers[k]}`).join('\n') : null;
    must(await db.from('raters').update({ ...base, comment: [comment, text].filter(Boolean).join('\n').slice(0, 2000) || null }).eq('id', r.id));
  } else must(saved);
  // إفادة المدير في الرحلة تكتمل بتقديره المنظم بعد البرنامج
  if (r.relation === 'manager' && r.phase === 'post') {
    const { data: who } = await db.from('participants').select('id, organization_id').eq('id', r.participant_id).maybeSingle();
    const reqId = who ? await requirementIdByCode(who, 'E-MGR') : null;
    if (reqId) {
      await db.from('participant_requirements').upsert({
        participant_id: r.participant_id, requirement_id: reqId, status: 'done',
        note: 'اكتملت بتقدير المدير المباشر في المنصة', completed_at: new Date().toISOString(),
      });
    }
  }
  await audit('system', null, 'rater.submit', 'raters', r.id, null, { participant_id: r.participant_id, relation: r.relation, phase: r.phase, ...(r.cycle_id ? { cycle_id: r.cycle_id } : {}) });
  return { success: true };
}

// ── الإدارة: تقرير الأثر للدفعة أو للجهة ──
export async function adminReport(b: Body) {
  const people = await all((f, t) => {
    // حساب العرض خارج إحصاءات الأثر كما في النظرة العامة (التدقيق 2026-11-10، البند 9.8: 6 هنا مقابل 5 هناك)
    // وحساب الاختبار خارجه كذلك (is_test، قرار المالك 2026-11-11)
    let q = db.from('participants').select('id, full_name, email, organization_id, status, organizations(name)').eq('is_demo', false).eq('is_test', false);
    q = scopeOrg(q, b.organization_id);   // 'none' = بلا جهة، كما في فلتر النظرة العامة وشاشة الأثر
    if (b.participant_id) q = q.eq('id', String(b.participant_id));
    return q.order('id').range(f, t);
  });
  // بلا تصفية يُقرأ الكل مباشرة، فلا تُمرَّر آلاف المعرّفات في الروابط
  const scoped = b.organization_id || b.participant_id ? people.map((p) => p.id) : null;
  const { rows, cfg } = await compareFor(scoped);
  const raters = scoped && !scoped.length ? [] : await allFor(scoped, () => db.from('raters').select('participant_id, status').in('phase', IMPACT_PHASES).order('id'));
  const rCount = (pid: string, s: string) => raters.filter((r: any) => r.participant_id === pid && r.status === s).length;

  const list = people.map((p) => ({
    id: p.id, full_name: p.full_name, email: p.email, organization: p.organizations?.name || null, status: p.status,
    baseline_at: rows[p.id]?.baseline_at || null, post_at: rows[p.id]?.post_at || null,
    raters_invited: rCount(p.id, 'invited') + rCount(p.id, 'submitted'), raters_done: rCount(p.id, 'submitted'),
    dimensions: rows[p.id]?.dimensions || null, overall: rows[p.id]?.overall || null, forms: rows[p.id]?.forms || null,
    // زوج غير قابل للمقارنة: الأداتان غير متطابقتين، يظهر سببه بدل الأرقام
    comparable: rows[p.id]?.comparable ?? null, reason: rows[p.id]?.reason || null,
    baseline_key: rows[p.id]?.baseline_key || null, post_key: rows[p.id]?.post_key || null,
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
  // الحكم الفردي الرسمي على المؤشر الكلي، وإحصاؤه للدفعة
  const whole = paired.filter((x) => x.overall);
  const overallVerdicts: Record<string, number> = {};
  for (const x of whole) overallVerdicts[x.overall.verdict.key] = (overallVerdicts[x.overall.verdict.key] || 0) + 1;
  const ps = pairedStats(whole.map((x) => [x.overall.composite_pre, x.overall.composite_post]));
  const overall = {
    ...ps, effect: effectLabel(ps.dz), verdicts: overallVerdicts,
    reliable_up: whole.filter((x) => x.overall.direction === 'up').length,
    reliable_down: whole.filter((x) => x.overall.direction === 'down').length,
  };
  const [transfer, reaction] = await Promise.all([transferStats(paired.map((x) => x.id)), scoped && !scoped.length ? null : reactionStats(scoped)]);
  return {
    success: true,
    counts: { participants: list.length, baseline: list.filter((x) => x.baseline_at).length, post: list.filter((x) => x.post_at).length, paired: paired.length },
    cohort, overall, transfer, reaction, config: cfg, participants: list,
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

// رد الفعل (كيركباتريك المستوى 1): استبانة «رأيك في أيام التدريب» (T-REACT) مجمّعة لكل سؤال،
// بأسئلة المتطلب الأكثر إجابة إن تعددت نسخه بين البرامج. كانت تُحفظ ولا تُقرأ في أي تقرير.
async function reactionStats(ids: string[] | null) {
  const { data: reqs } = await db.from('stage_requirements').select('id, config').eq('code', 'T-REACT').eq('kind', 'survey');
  if (!reqs?.length) return null;
  const rows = await allFor(ids, () => db.from('participant_requirements').select('participant_id, requirement_id, answers')
    .in('requirement_id', reqs.map((r: any) => r.id)).not('answers', 'is', null).order('participant_id'));
  const count: Record<string, number> = {};
  for (const r of rows) count[r.requirement_id] = (count[r.requirement_id] || 0) + 1;
  const main = [...reqs].sort((a: any, b: any) => (count[b.id] || 0) - (count[a.id] || 0))[0];
  return surveySummary(main.config, rows.filter((r: any) => r.requirement_id === main.id).map((r: any) => r.answers));
}

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
