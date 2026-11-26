// ════════════════════════════════════════════════════════════════
// قياس الأثر: المقارنة بين القياس المبدئي والبعدي، والمقيّمون الخارجيون
// ════════════════════════════════════════════════════════════════
// المنطق الحسابي في logic.js (يُختبر في vitest)، وهنا جمع البيانات فقط.
// المشارك يرى ملخصًا واحدًا، والإدارة ترى التفصيل لكل إطار والدفعة كاملة.
import { actionDeadline, all, allFor, audit, CONFIG, db, Fail, hash, logConsent, must, randomToken, raterConfirmMail, raterMail, raterRejectedMail, resolveNotes, sendMail } from './core.ts';
import { RATER_FLAG_AR, RATER_VERIFICATION_AR, raterVerification } from './domains.js';
import { advisorOf } from './advisor.ts';
import { lastBaseline, postInstrumentFor, requirePostOpen } from './participant.ts';
import { cohortOf, requirementIdByCode } from './programs.ts';
import { managerItems, managerPreAllowed, managerView, NO_MANAGER, NO_MANAGER_AR, NO_PRE_RUNNING_AR, SELF_ONLY_AR } from './manager-rating.js';
import { scopeOrg } from './admin.ts';
import {
  compareAssessments, compositeReliability, coordPermissions, DIMENSIONS, effectLabel, equate, formOffsets, IMPACT_DEFAULTS, isEmail, normalizeEmail,
  levelGainReport, overallChange, pairComparable, pairedStats, practiceEffect, anchorRepeat, anchorShareOf, raterPercents, raterProspective, surveySummary,
  linkAfterDecisionOk, LINK_CLOSED_AR,
} from './logic.js';
import { cleanOpenAnswers, CONTACT_FREQ, feedbackPromiseAr, OPEN_KEYS, raterItems } from './feedback360.js';
import { appSettings } from './settings.ts';
import { FEEDBACK_OPEN_AR } from './labels.js';
import { missingColumn } from './missing-column.ts';
import { FEATURE_OFF_AR, RATER_PAUSED_AR } from './features.js';
import { features } from './features.ts';
import { counted } from './counting.ts';

type Body = Record<string, any>;

const RATER_LIMIT = 3;
// دعوات اليوم الواحد لكل مشارك، ومنها ما أُلغي وأُعيد (مدير ومقيّمون ثلاثة وبعض التصحيح)
const RATER_INVITES_PER_DAY = 8;
export const RELATION_AR: Record<string, string> = { manager: 'المدير المباشر', peer: 'زميل', report: 'أحد أعضاء الفريق', stakeholder: 'أحد أصحاب المصلحة' };
// مقيّمو قياس الأثر بمرحلتيهم وحدهما: مقيّم تقييم 360 (phase f360) للتطوير، لا يدخل الأثر ولا قائمة الأثر ولا عدّاده
export const IMPACT_PHASES = ['pre', 'post'];

// آخر قياس مُرسل من كل نوع لكل مشارك، بنتائجه. زوج أداتاه غير متطابقتين
// (pairs_with البعدي لا يساوي مفتاح المبدئي) يُعلَّم غير قابل للمقارنة ولا
// تُقرأ نتائجه.
async function latestResults(ids: string[] | null) {
  // ids = null يقرأ قياسات الجميع (أثر التكرار في impactConfig): بقاعدة العد (counted). وبمعرّفات، المستدعي مسؤول عنها
  // (تقرير الإدارة يمررها من قائمة counted، والمشارك يقرأ قياسه هو ولو كان حساب العرض)
  const COLS = 'id, participant_id, submitted_at, instrument_id, form, instruments(kind, key, pairs_with)';
  const rows = await allFor(ids, () => (ids ? db.from('assessments').select(COLS) : counted(db.from('assessments').select(`${COLS}, participants!inner(is_demo, is_test)`), 'participants'))
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
      // ثبات الأداة من قياسات من يُعدّون وحدهم (counted): إجابات حساب العرض النمطية كانت تدخل ألفا وانحرافها المعياري
      all((f, t) => counted(db.from('assessments').select('id, form, participants!inner(is_demo, is_test)').eq('instrument_id', base.id).eq('status', 'submitted'), 'participants').range(f, t)),
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
// مفتاح 360 مطفأ: تقييم المدير قياسي بخانة واحدة (تصور المرحلة 3، القرار 2، manager_only)، ودعوة الزملاء مع 360.
// المشارك يرى متوسط المدير لكل بُعد (manager) لا إجاباته (القرار 4)، و«ذاتي فقط» لمن اختاره (self_only)
export async function mine(p: any) {
  const on = (await features()).f360;
  const [{ rows }, raters, pre] = await Promise.all([
    compareFor([p.id]),
    // كل الأعمدة حتى لا يُفشل عمود لم يُرحَّل القراءة (D19)، ثم ما يحق للمشارك رؤيته وحده
    db.from('raters').select('*').eq('participant_id', p.id).neq('status', 'revoked').in('phase', IMPACT_PHASES).order('invited_at')
      .then((r: any) => ((must(r) ?? []) as any[]).map(raterView)),
    preRating(p),
  ]);
  const nm = noManagerOf(p);
  const list = on ? raters : raters.filter((r: any) => r.relation === 'manager');
  return {
    success: true, summary: participantSummary(rows[p.id]), manager: managerView(rows[p.id]?.dimensions), self_only: nm === 'self',
    raters: list, limit: on ? RATER_LIMIT : 1, pre_available: !!pre.ok && nm !== 'self', pre_reason: pre.ok ? null : pre.reason,
    invite: nm !== 'self', manager_only: !on, no_manager: nm, no_manager_options: NO_MANAGER_AR,
  };
}
const noManagerOf = (p: any): string | null => (NO_MANAGER.includes(p?.no_manager) ? p.no_manager : null);

// «لا يوجد مدير متاح» (القرار 3): زميل أعلى يختاره في خانة المدير (senior)، أو «ذاتي فقط» (self) يكمل بندي المدير بلا حبس.
// null يعيد خانة المدير. لا يُحبس المشارك في أي حال
export async function noManager(p: any, b: Body) {
  const choice = b.choice == null || b.choice === '' ? null : String(b.choice);
  if (choice !== null && !NO_MANAGER.includes(choice)) throw new Fail('اختر: زميل أعلى أو ذاتي فقط');
  const { error } = await db.from('participants').update({ no_manager: choice, no_manager_at: choice ? new Date().toISOString() : null }).eq('id', p.id);
  must({ data: null, error });
  if (choice === 'self') {
    // إفادة المدير بعد البرنامج تكتمل «ذاتي فقط»، وT-360 يكتمل من الحالة نفسها (AUTO_CHECKS selfOnly)
    const reqId = await requirementIdByCode(p, 'E-MGR');
    if (reqId) {
      const { data: prev } = await db.from('participant_requirements').select('status').eq('participant_id', p.id).eq('requirement_id', reqId).maybeSingle();
      if (prev?.status !== 'done') await db.from('participant_requirements').upsert({ participant_id: p.id, requirement_id: reqId, status: 'done', note: SELF_ONLY_AR, completed_at: new Date().toISOString() });
    }
  }
  await audit('participant', p.id, 'rater.no-manager', 'participants', p.id, null, { choice });
  return mine({ ...p, no_manager: choice });
}

async function postInstrument(p: any) {
  const data = await postInstrumentFor(p.id);
  if (!data) throw new Fail('القياس البعدي لم يُفعَّل بعد', 409, 'no_instrument');
  return data;
}

// تقدير المدير قبل البرنامج: بعد القياس المبدئي وقبل البعدي، وبأداة فيها
// صيغة الغائب لعبارات الممارسة (baseline-v4 فما بعد).
async function preRating(p: any) {
  // القبلي للدفعات الجديدة وحدها (تصور المرحلة 3، القرار 2): الجارية يأتيها البعدي الاسترجاعي
  if (!managerPreAllowed((await cohortOf(p)).cohort)) return { ok: false, reason: NO_PRE_RUNNING_AR };
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
// raterId: مرجع عنصر «ينتظرك» في صندوق المستشار (rater-confirm:<id>)، يُغلق عند التأكيد أو الرفض
async function notifyConfirmers(p: any, flags: string[], raterId: string) {
  const why = flags.map((f) => (RATER_FLAG_AR as Record<string, string>)[f] || f).join('، ');
  const adv = await advisorOf(p).catch(() => null);
  const to: [string, string, 'expert_work' | 'coord_work', string | null][] = adv ? [[adv.email, `${CONFIG.appUrl}/x`, 'expert_work', adv.id]] : [];
  if (p.organization_id) {
    const { data: coords } = await db.from('org_coordinators').select('email, status, permissions').eq('organization_id', p.organization_id).neq('status', 'suspended');
    for (const c of coords || []) if (coordPermissions((c as any).permissions).list) to.push([(c as any).email, `${CONFIG.appUrl}/org`, 'coord_work', null]);
  }
  for (const [email, url, category, xid] of to) await sendMail(email, `مقيّم بانتظار تأكيدك: ${p.full_name || 'مشارك'}`, raterConfirmMail(p.full_name || 'مشارك', why, url), [], { category, ...(xid ? { recipient: { kind: 'expert' as const, id: xid }, about: p.id } : {}), ref: `participant:${p.id}`, noteRef: `rater-confirm:${raterId}`, actionUntil: actionDeadline() }).catch((e) => console.error('rater confirm notify', e));
  return to.length;
}

// حارس ثانٍ داخل الفعل لمسارات لا تمر بالحارس المركزي (تأكيد المنسق، والدفعات): مقيّم 360 وحده خلف مفتاحه،
// ومقيّمو الأثر (pre وpost) خرجوا منه (تصور المرحلة 3، القرار 2)
async function require360For(phase: string | null | undefined) {
  if (!IMPACT_PHASES.includes(String(phase)) && !(await features()).f360) throw new Fail(FEATURE_OFF_AR, 404, 'f360_off');
}

export async function invite(p: any, b: Body) {
  if (noManagerOf(p) === 'self') throw new Fail('اخترت «ذاتي فقط». لتدعو مديرك أو زميلًا أعلى أعد خانة المدير أولًا', 409, 'self_only');
  const managerOnly = !(await features()).f360;
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('البريد غير صحيح');
  const check = await raterCheck(p, email);
  if (check.verdict === 'reject') throw new Fail('ادعُ مديرك أو زميلك، لا بريدك');
  const phase = b.phase === 'pre' ? 'pre' : 'post';
  // قبل البرنامج: المدير المباشر وحده، فهو من يُعاد تقديره بعد البرنامج
  // والمفتاح مطفأ: خانة المدير وحدها في البعدي أيضًا (الزميل الأعلى لمن لا مدير له يشغلها)
  const relation = phase === 'pre' || managerOnly ? 'manager' : ['manager', 'peer', 'report'].includes(b.relation) ? b.relation : 'manager';
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
  // سقف يومي للدعوات يشمل الملغاة: حلقة «ادعُ ثم ألغِ» كانت ترسل بريدًا بلا حد وتستنزف حصة الإشعارات (N5)
  const { count: invitedToday } = await db.from('audit_log').select('id', { count: 'exact', head: true })
    .eq('actor_type', 'participant').eq('actor', p.id).eq('action', 'rater.invite').gte('created_at', new Date(Date.now() - 864e5).toISOString());
  if ((invitedToday ?? 0) >= RATER_INVITES_PER_DAY) throw new Fail('بلغت حد دعوات اليوم. أعد المحاولة غدًا.', 429, 'rate');
  const limit = phase === 'pre' || managerOnly ? 1 : RATER_LIMIT;
  const existing = (must(await db.from('raters').select('id, email, status, relation').eq('participant_id', p.id).eq('phase', phase).neq('status', 'revoked')) as any[] ?? [])
    .filter((r: any) => !managerOnly || r.relation === 'manager');
  if (!existing.some((r: any) => r.email === email) && existing.length >= limit) throw new Fail(limit === 1 ? 'دعوت مديرك من قبل' : `الحد ${limit} مقيّمين`);
  const token = randomToken();
  // D19: من نطاق الجهة يُرسل فورًا، وما سواه awaiting حتى يؤكده المستشار أو المنسق. العلامات من أول دعوة
  const awaiting = check.verdict === 'pending';
  const row: Record<string, unknown> = { participant_id: p.id, instrument_id: instrumentId, email, full_name: name, relation, phase, token_hash: await hash(token),
    status: awaiting ? 'awaiting' : 'invited', invited_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
    verification: check.verdict, verification_flags: check.flags, verified_by: awaiting ? null : 'system:org_domain', verified_at: awaiting ? null : new Date().toISOString() };
  // كل الأعمدة حتى لا يُفشل token_hashes قبل ترحيله القراءة
  const { data: prev } = await db.from('raters').select('*').eq('participant_id', p.id).eq('email', email).eq('phase', phase).maybeSingle();
  if (prev?.status === 'submitted') throw new Fail('أرسل هذا المقيّم تقديره من قبل');
  if (prev && Date.now() - new Date(prev.invited_at).getTime() < 10 * 60e3) throw new Fail('أُرسلت الدعوة قبل قليل، أعد الإرسال بعد عشر دقائق', 429, 'rate');
  // إعادة الإرسال لدعوة جارية تضيف الرابط ولا تميت الأول (P1-14)؛ وبعد الإلغاء أو للمنتظر تأكيدًا تبدأ بالجديد وحده
  if (prev) Object.assign(row, tokenPatch(prev, row.token_hash as string, prev.status === 'invited' && !awaiting));
  const write = (r: Record<string, unknown>) => (prev ? db.from('raters').update(r).eq('id', prev.id).select('id').single() : db.from('raters').insert(r).select('id').single());
  // D19: تعذّر الحفظ (ومنه قيد الحالة أو الحكم) يفشل الدعوة، ولا تُرسل بلا علامات ولا تحقق
  const saved = must(await write(row)) as { id: string };
  if (awaiting) {
    const told = await notifyConfirmers(p, check.flags, saved.id);
    await audit('participant', p.id, 'rater.invite', 'raters', saved.id, null, { email, relation, phase, verification: 'pending', flags: check.flags, confirmers: told });
    return mine(p);
  }
  const link = `${CONFIG.appUrl}/rate?t=${encodeURIComponent(token)}`;
  // ref المقيّم: منه نسب استجابة المقيّمين في سجل الإرسال (D15)
  await sendMail(email, `طلب تقدير من ${p.full_name || 'مشارك في برنامج القادة'}`, raterMail(name, p.full_name || 'زميلك', link, phase), [], { category: 'request', ref: `rater:${saved.id}` });
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
  // مفتاح 360 مطفأ: لا تأكيد الآن، فالقائمة فارغة عند المستشار والمنسق (المنتظر باقٍ ويعود حين يُظهَر)
  // ومقيّمو الأثر (pre وpost) خارجه: يُؤكَّدون والمفتاح مطفأ
  if (!ids.length) return [];
  const on = (await features()).f360;
  const data = must(await db.from('raters').select('id, participant_id, email, full_name, relation, phase, verification_flags, invited_at, participants(full_name)')
    .in('participant_id', ids).eq('status', 'awaiting').order('invited_at')) as any[];
  return (data || []).filter((r: any) => on || IMPACT_PHASES.includes(r.phase)).map((r: any) => ({ id: r.id, participant_id: r.participant_id, participant: r.participants?.full_name || null, email: r.email, full_name: r.full_name,
    relation_ar: RELATION_AR[r.relation] || r.relation, phase: r.phase, invited_at: r.invited_at,
    flags_ar: (r.verification_flags || []).map((f: string) => (RATER_FLAG_AR as Record<string, string>)[f] || f) }));
}

// التأكيد يرسل الدعوة برابط جديد (الرمز لا يُستعاد من بصمته)، وعدم الاعتماد بسبب يُبلَّغ به المشارك.
// allowed يحصر الصلاحية في نطاق المؤكِّد؛ وكل قرار في السجل بمن اتخذه
export async function confirmRater(by: { kind: 'expert' | 'coordinator'; email: string }, b: Body, allowed: (participantId: string) => Promise<boolean>) {
  const id = String(b.id || '');
  const r = must(await db.from('raters').select('*, participants(full_name, email)').eq('id', id).maybeSingle()) as any;
  await require360For(r?.phase);
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
    await resolveNotes(`rater-confirm:${id}`);
    if (r.participants?.email) await sendMail(r.participants.email, 'لم يُعتمد أحد مقيّميك', raterRejectedMail(r.participants.full_name, r.full_name || r.email, reason), [], { category: 'experts', ref: `participant:${r.participant_id}` }).catch((e) => console.error('rater reject mail', e));
    return { success: true, decision: 'reject' };
  }
  const token = randomToken();
  // رمز المنتظر لم يُرسل، فالدعوة المؤكدة تبدأ بالجديد وحده
  must(await db.from('raters').update({ status: 'invited', verification: 'confirmed', verified_by: who, verified_at: now, ...tokenPatch(r, await hash(token)),
    invited_at: now, expires_at: new Date(Date.now() + 30 * 864e5).toISOString() }).eq('id', id).eq('status', 'awaiting'));
  const link = `${CONFIG.appUrl}/rate?t=${encodeURIComponent(token)}`;
  await sendMail(r.email, `طلب تقدير من ${r.participants?.full_name || 'مشارك في برنامج القادة'}`, raterMail(r.full_name, r.participants?.full_name || 'زميلك', link, r.phase), [], { category: 'request', ref: `rater:${id}` });
  await audit(actorType, who, 'rater.confirm', 'raters', id, null, { participant_id: r.participant_id });
  await resolveNotes(`rater-confirm:${id}`);
  return { success: true, decision: 'confirm' };
}

// ── المقيّم: رابط بريد بلا حساب ──
// P1-14: token_hashes بصمات كل رمز صادر للدعوة الجارية (التذكير وإعادة الإرسال يضيفان)، وtoken_hash أحدثها.
// keep يضيف إلى ما صدر، وبدونه تبدأ الدعوة بالرمز الجديد وحده. صف بلا العمود (قبل الترحيل) يُكتب له token_hash وحده كما كان
export const TOKEN_HASHES_MAX = 12;
export function tokenPatch(r: any, h: string, keep = false): Record<string, unknown> {
  if (!r || !Array.isArray(r.token_hashes)) return { token_hash: h };
  const prev = keep ? [...new Set([...r.token_hashes, r.token_hash].filter((x) => x && x !== h))] : [];
  return { token_hash: h, token_hashes: [...prev, h].slice(-TOKEN_HASHES_MAX) };
}
// الأحدث أولًا بالقيد الفريد، ثم ما صدر قبله. غياب العمود قبل الترحيل لا يُفشل الرابط الأحدث
async function raterByToken(h: string) {
  const sel = '*, participants(full_name)';
  const r = must(await db.from('raters').select(sel).eq('token_hash', h).maybeSingle());
  if (r) return r;
  const { data, error } = await db.from('raters').select(sel).contains('token_hashes', [h]).limit(1).maybeSingle();
  if (error) { if (missingColumn(error)) return null; throw error; }
  // نسخة سابقة كتبت token_hash وحده بعد الترحيل (إعادة دعوة بعد إلغاء مثلًا): المصفوفة قديمة فلا يُوثق بها، والأحدث وحده يعمل
  if (data?.token_hash && Array.isArray(data.token_hashes) && !data.token_hashes.includes(data.token_hash)) return null;
  return data;
}
// paused: حارس «متوقف مؤقتًا» (raterPaused) يسبق فحص الانتهاء، فرابط انقضت مهلته أثناء الإخفاء لا يُقال عنه «انتهى، اطلب دعوة»
// وهو يعود حين يُظهَر 360 (resumeFrozen يمده)، ولا دعوة جديدة تُطلب ما دام مطفأ
async function raterFrom(t: unknown, paused: (r: any) => Promise<void> = async () => {}) {
  const token = String(t || '');
  if (token.length < 20) throw new Fail('الرابط غير صالح', 400, 'invalid');
  // رمز لا يُعرف صفه لا يُعلم أهو رابط قديم أم غير صالح، فالرسالة العامة نفسها
  const r = await raterByToken(await hash(token)) as any;
  // nominated: رشّحه المشارك في تقييم 360 ولم يعتمد المستشار القائمة بعد، فلا رابط له
  if (!r || r.status === 'revoked' || r.status === 'nominated') throw new Fail('الرابط غير صالح أو أُلغي', 404, 'invalid');
  await paused(r);
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
// ومدير قياس الأثر (pre وpost): ثماني فقرات من فقرات المرحلة نفسها (تصور المرحلة 3 §5.1، managerItems). العرض والتحقق بها معًا
async function raterForm(r: any) {
  const qs = await raterQuestions(r.instrument_id, r.relation);
  return r.relation === 'manager' && IMPACT_PHASES.includes(String(r.phase || 'post')) ? managerItems(qs) : qs;
}


// مقيّم 360 برابطه حين يُخفى 360 (feedback360.enabled): الدورة متجمدة، لا نموذج ولا إرسال، ورده «متوقف مؤقتًا» بلا اسم
// الميزة، وصفه باقٍ. ومقيّمو الأثر (pre وpost) خرجوا من المفتاح (تصور المرحلة 3، القرار 2) فيعملون والمفتاح مطفأ
async function raterPaused(r: any) {
  if (IMPACT_PHASES.includes(String(r?.phase || 'post'))) return;
  if ((await features()).f360) return;
  throw new Fail(RATER_PAUSED_AR, 409, 'f360_off', { paused: true, phase: r.phase || 'post' });
}

export async function raterGet(b: Body) {
  const r = await raterFrom(b.t, raterPaused);
  if (!r.opened_at) await db.from('raters').update({ opened_at: new Date().toISOString() }).eq('id', r.id);
  const qs = await raterForm(r);
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
  const r = await raterFrom(b.t, raterPaused);
  if (r.status === 'submitted') throw new Fail('أُرسل التقدير من قبل، شكرًا لك', 409, 'done');
  // تقييم 360: بعد إغلاق الدورة (ولو مبكرًا من الإدارة) لا يُقبل تقدير يغيّر تقريرًا سُلِّم (N15)
  if (r.cycle_id) {
    const { data: cyc } = await db.from('feedback_cycles').select('status, closes_at').eq('id', r.cycle_id).maybeSingle();
    if (!cyc || cyc.status !== 'open' || (cyc.closes_at && Date.parse(cyc.closes_at) <= Date.now())) throw new Fail('أُغلقت دورة التقييم. شكرًا لاستعدادك.', 409, 'closed');
  }
  const qs = await raterForm(r);
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
    let q = counted(db.from('participants').select('id, full_name, email, organization_id, status, organizations(name)'));
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
  // counting-exempt: قياسات معرّفات من قائمة تقرير الأثر المقروءة بـcounted
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

// ما يراه المستشار وحده (تصور المرحلة 3، القرار 4): فقرات تقدير خانة المدير بنصها وإجاباتها، مادةً لحديث الجلسة.
// لا يصل المشارك ولا الجهة. تعذّر القراءة يعيد null فلا يسقط ملف المشارك
export async function managerItemsFor(participantId: string) {
  const { data, error } = await db.from('raters').select('phase, relation, answers, submitted_at, instrument_id')
    .eq('participant_id', participantId).eq('status', 'submitted').eq('relation', 'manager').in('phase', IMPACT_PHASES);
  if (error || !data?.length) return null;
  const ids = [...new Set(data.flatMap((r: any) => Object.keys(r.answers || {})))];
  const { data: qs } = ids.length ? await db.from('questions').select('id, dimension, text_rater_ar, text_ar, options').in('id', ids) : { data: [] as any[] };
  const byId = new Map((qs || []).map((q: any) => [q.id, q]));
  const label = (q: any, k: unknown) => (k == null ? null : (q?.options || [])[Number(k)]?.label ?? null);
  return data.map((r: any) => ({
    phase: r.phase, submitted_at: r.submitted_at,
    items: Object.entries(r.answers || {}).map(([id, a]: [string, any]) => {
      const q = byId.get(id);
      return { dimension: q?.dimension || null, text: q?.text_rater_ar || q?.text_ar || '', now: label(q, a?.now), before: label(q, a?.before) };
    }),
  }));
}
