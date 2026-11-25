// ════════════════════════════════════════════════════════════════
// تقييم 360 للتطوير: الدورة والمجموعات واعتماد المستشار والتذكير والإغلاق (تصور 2026-11-11، اعتمده المالك)
// ════════════════════════════════════════════════════════════════
// المنطق الصافي في feedback360.js (vitest)، والقيم القابلة للضبط من الإعدادات العامة (appSettings().feedback360).
// يبني على بنية المقيّمين القائمة ولا يكررها: صف raters نفسه، ورابطه وبصمته (raterFrom)، والتحقق من النطاق
// (raterCheck، D19)، والموافقة (logConsent في raterSubmit، D18)، والبريد بمرجع rater:<id> وحصته (sendMail
// بنوع bulk يدخل الطابور عند الحد)، والسجل (audit).
// للتطوير وحده: لا يقرؤه التقييم الختامي ولا الشهادة ولا تقارير الجهة الفردية (يحرسه eval360.test.js).
// المشارك يرى أعدادًا لكل مجموعة بعد فتح النافذة، لا من أرسل ومن لم يرسل.
import { actionDeadline, audit, CONFIG, db, enqueueMail, Fail, FEEDBACK_MAIL, feedbackMail, hash, must, randomToken, raterMail, resolveNotes, sendMail } from './core.ts';
import { advisorOf, myParticipantIds } from './advisor.ts';
import { lastBaseline } from './participant.ts';
import { raterCheck, RELATION_AR, tokenPatch } from './impact.ts';
import { appSettings } from './settings.ts';
import * as FT from './features.ts';
import { RATER_FLAG_AR, RATER_VERIFICATION_AR } from './domains.js';
import { isEmail, journeyApproved, normalizeEmail } from './logic.js';
import { requireWrite, type Admin } from './admin.ts';
import {
  closesAtRiyadh, CYCLE_STATUS_AR, feedbackPromiseAr, feedbackReport, groupCaps, groupCounts, nextWave, NOMINEE_GROUPS, nominationCheck, orgTotals, raterItems, remindersDue, reportItems,
} from './feedback360.js';
import { FEEDBACK_GROUP_AR } from './labels.js';
import { requireVisible, visibilityOfParticipant } from './visibility.ts';
import { listed } from './counting.ts';

type Body = Record<string, any>;
type Settings = Awaited<ReturnType<typeof appSettings>>['feedback360'];
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v || ''));
const missingTable = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || /feedback_cycles/.test(String(e.message || '')));
// اليوم بتوقيت الرياض: موعد قرب منتصف الليل بالتوقيت العالمي يُعرض بيومه عند المقيّم لا بيوم الخادم (P1-14)
export const dayAr = (d: string | null) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh' }) : '');

// دورات المشارك؛ null إن لم يُرحَّل الجدول بعد (tolerant)
async function cyclesOf(participantId: string): Promise<any[] | null> {
  const { data, error } = await db.from('feedback_cycles').select('*').eq('participant_id', participantId).order('created_at');
  if (error) { if (missingTable(error)) return null; throw error; }
  return data || [];
}
async function cycleRaters(cycleId: string) {
  return (must(await db.from('raters').select('*').eq('cycle_id', cycleId).neq('status', 'revoked').order('invited_at')) as any[]) ?? [];
}
async function ownCycle(p: any, id: unknown) {
  if (!isUuid(id)) throw new Fail('بيانات ناقصة');
  const c = must(await db.from('feedback_cycles').select('*').eq('id', String(id)).eq('participant_id', p.id).maybeSingle()) as any;
  if (!c) throw new Fail('هذه الدورة ليست لك', 404, 'not_found');
  return c;
}
// العبارات لكل مجموعة من الأداة: الذات ترى ما يُعرض عليها (ومنها المعكوسة)، والمقيّم ما يشهده
async function items(instrumentId: string, relation: string) {
  const qs = must(await db.from('questions').select('*').eq('instrument_id', instrumentId).eq('active', true).eq('tier', 'behavior').order('sort')) as any[] ?? [];
  return raterItems(qs, relation);
}

// ── المشارك ──
// ما يراه من دورته: قبل الفتح قائمته التي كتبها هو (ليعدلها)، وبعده أعداد لكل مجموعة لا أسماء
function participantView(c: any, raters: any[]) {
  const before = ['nominating', 'approval'].includes(c.status);
  return {
    id: c.id, wave: c.wave, status: c.status, status_ar: (CYCLE_STATUS_AR as Record<string, string>)[c.status],
    self_done: !!c.self_submitted_at, return_note: c.status === 'nominating' ? c.return_note : null,
    opens_at: c.opens_at, closes_at: c.closes_at, closed_at: c.closed_at, released_at: c.released_at,
    nominees: before ? raters.map((r) => ({ id: r.id, email: r.email, full_name: r.full_name, relation: r.relation,
      verification_ar: r.verification ? (RATER_VERIFICATION_AR as Record<string, string>)[r.verification] : null,
      flags_ar: (r.verification_flags || []).map((f: string) => (RATER_FLAG_AR as Record<string, string>)[f] || f) })) : [],
    counts: groupCounts(raters),
  };
}
function publicSettings(s: Settings) {
  return { min_group: s.min_group, min_others: s.min_others, caps: groupCaps(s), window_days: s.window_days, round_gap_days: s.round_gap_days, scale_labels: s.scale_labels };
}

export async function mine(p: any) {
  const s = (await appSettings()).feedback360;
  const cycles = await cyclesOf(p.id);
  if (cycles === null) return { success: true, enabled: false, ready: false };
  if (!s.enabled && !cycles.length) return { success: true, enabled: false, ready: true };
  const views = await Promise.all(cycles.map(async (c) => participantView(c, await cycleRaters(c.id))));
  const current = cycles.filter((c) => c.status !== 'cancelled').at(-1) || null;
  // نموذج الذات للدورة الجارية قبل إرسال القائمة: العبارات بصيغة المتكلم، ومراسي السلم من الإعدادات
  const self = current && ['nominating', 'approval', 'open'].includes(current.status)
    ? (await items(current.instrument_id, 'self')).map((q: any) => ({ id: q.id, dimension: q.dimension, text: q.text_ar,
      options: (q.options || []).map((o: any, k: number) => ({ k, label: o.score < 0 ? 'لا ينطبق على عملي' : s.scale_labels[Number(o.score)] ?? o.label })) }))
    : [];
  const next = s.enabled ? nextWave(cycles, s) : { ok: false, reason: 'disabled' };
  return {
    success: true, enabled: s.enabled, ready: true, settings: publicSettings(s), cycles: views, self_items: self,
    self_answers: current?.self_answers || {}, next,
    groups: Object.fromEntries(NOMINEE_GROUPS.map((g) => [g, (FEEDBACK_GROUP_AR as Record<string, string>)[g]])),
  };
}

export async function start(p: any) {
  const s = (await appSettings()).feedback360;
  if (!s.enabled) throw new Fail('تقييم 360 غير مفعّل بعد', 409, 'disabled');
  const cycles = await cyclesOf(p.id);
  if (cycles === null) throw new Fail('تقييم 360 غير متاح بعد', 409, 'not_migrated');
  const n = nextWave(cycles, s);
  if (!n.ok) throw new Fail(n.reason === 'gap' ? `تبدأ الموجة الثانية بعد ${dayAr(n.at as string)}` : n.reason === 'done' ? 'أكملت الموجتين' : 'أكمل الموجة الجارية أولًا', 409, n.reason);
  // الأداة: أداة قياسك المبدئي (عباراتها بصيغة الغائب للمقيّم)، والموجة الثانية بأداة الأولى نفسها لتُقارن
  const t1 = cycles.find((c) => c.wave === 't1' && c.status !== 'cancelled');
  const instrumentId = n.wave === 't2' ? t1.instrument_id : (await lastBaseline(p.id))?.instrument_id;
  if (!instrumentId) throw new Fail('أرسل قياسك المبدئي أولًا، فعباراته هي عبارات 360', 409, 'no_baseline');
  const c = must(await db.from('feedback_cycles').insert({ participant_id: p.id, wave: n.wave, instrument_id: instrumentId }).select('id').single()) as any;
  // الموجة الثانية: المقيّمون أنفسهم مرشحون سلفًا، ويعدّل المشارك القائمة قبل إرسالها
  if (n.wave === 't2') {
    const prev = await cycleRaters(t1.id);
    for (const r of prev.filter((x) => x.status === 'submitted')) {
      await db.from('raters').insert(await nomineeRow(p, c.id, instrumentId, r.email, r.full_name, r.relation, { verdict: r.verification === 'org_domain' ? 'org_domain' : 'pending', flags: r.verification_flags || [] }, s));
    }
  }
  await audit('participant', p.id, 'f360.start', 'feedback_cycles', c.id, null, { wave: n.wave });
  return mine(p);
}

export async function saveSelf(p: any, b: Body) {
  const c = await ownCycle(p, b.cycle_id);
  if (!['nominating', 'approval', 'open'].includes(c.status)) throw new Fail('أُغلقت هذه الدورة', 409, 'closed');
  const qs = await items(c.instrument_id, 'self');
  const input = b.answers || {};
  const answers: Record<string, number> = {};
  for (const q of qs) {
    const k = input[q.id];
    if (!Number.isInteger(k) || k < 0 || k >= (q.options || []).length) throw new Fail('أكمل تقديرك لكل عبارة', 400, 'incomplete');
    answers[q.id] = k;
  }
  must(await db.from('feedback_cycles').update({ self_answers: answers, self_submitted_at: new Date().toISOString() }).eq('id', c.id));
  await audit('participant', p.id, 'f360.self', 'feedback_cycles', c.id);
  return mine(p);
}

// صف المرشح: بلا رابط صالح (البصمة لرمز عشوائي لا يُرسل)، وبحكم التحقق من النطاق (D19) يُعرض للمستشار
async function nomineeRow(p: any, cycleId: string, instrumentId: string, email: string, name: string | null, relation: string, check: { verdict: string; flags: string[] }, s: Settings) {
  return {
    participant_id: p.id, cycle_id: cycleId, instrument_id: instrumentId, phase: 'f360', email, full_name: name, relation,
    status: 'nominated', token_hash: await hash(randomToken()), invited_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + (s.window_days + 30) * 864e5).toISOString(),
    verification: check.verdict, verification_flags: check.flags,
  };
}

export async function nominate(p: any, b: Body) {
  const s = (await appSettings()).feedback360;
  const c = await ownCycle(p, b.cycle_id);
  if (c.status !== 'nominating') throw new Fail('أُرسلت القائمة، فلا تُعدَّل إلا إن أعادها المستشار', 409, 'locked');
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('البريد غير صحيح');
  const relation = NOMINEE_GROUPS.includes(b.relation) ? b.relation : null;
  if (!relation) throw new Fail('اختر صلته بك');
  const check = await raterCheck(p, email);
  if (check.verdict === 'reject') throw new Fail('رشّح من يعمل معك، لا بريدك');
  const list = await cycleRaters(c.id);
  if (list.some((r) => r.email === email)) throw new Fail('رشّحت هذا البريد من قبل');
  const cap = (groupCaps(s) as Record<string, number>)[relation];
  if (list.filter((r) => r.relation === relation).length >= cap) throw new Fail(relation === 'manager' ? 'رشّحت مديرك من قبل' : `الحد في «${(FEEDBACK_GROUP_AR as Record<string, string>)[relation]}» ${cap}`, 409, 'over_cap');
  const name = String(b.full_name || '').trim().slice(0, 120) || null;
  const saved = must(await db.from('raters').insert(await nomineeRow(p, c.id, c.instrument_id, email, name, relation, check, s)).select('id').single()) as any;
  await audit('participant', p.id, 'f360.nominate', 'raters', saved.id, null, { cycle_id: c.id, relation, verification: check.verdict });
  return mine(p);
}

export async function removeNominee(p: any, b: Body) {
  const id = String(b.id || '');
  if (!isUuid(id)) throw new Fail('بيانات ناقصة');
  const r = must(await db.from('raters').select('id, cycle_id, status').eq('id', id).eq('participant_id', p.id).eq('phase', 'f360').maybeSingle()) as any;
  if (!r || r.status !== 'nominated') throw new Fail('لا مرشح بهذا المعرّف', 404, 'not_found');
  const c = await ownCycle(p, r.cycle_id);
  if (c.status !== 'nominating') throw new Fail('أُرسلت القائمة، فلا تُعدَّل إلا إن أعادها المستشار', 409, 'locked');
  must(await db.from('raters').delete().eq('id', id).eq('status', 'nominated'));
  return mine(p);
}

// إرسال القائمة إلى المستشار الفعلي (advisorOf: خبير المجموعة ثم مستشار الدفعة)
export async function submitList(p: any, b: Body) {
  const s = (await appSettings()).feedback360;
  const c = await ownCycle(p, b.cycle_id);
  if (c.status !== 'nominating') throw new Fail('أُرسلت القائمة من قبل', 409, 'locked');
  const chk = nominationCheck(await cycleRaters(c.id), s, { selfDone: !!c.self_submitted_at });
  if (!chk.ok) {
    throw new Fail(chk.reason === 'too_few' ? `رشّح ${chk.need} آخرين على الأقل من غير مديرك، فالتقرير لا يصدر بأقل من ${s.min_others}`
      : chk.reason === 'self' ? 'أكمل تقديرك الذاتي أولًا، فالتقرير يقارن به' : 'تجاوزت حد إحدى المجموعات', 400, chk.reason);
  }
  const adv = await advisorOf(p);
  if (!adv) throw new Fail('لم يُعيَّن مستشار لدفعتك بعد، فلا أحد يعتمد القائمة. تواصل مع الإدارة', 409, 'no_advisor');
  must(await db.from('feedback_cycles').update({ status: 'approval', submitted_at: new Date().toISOString(), return_note: null }).eq('id', c.id).eq('status', 'nominating'));
  await audit('participant', p.id, 'f360.submit', 'feedback_cycles', c.id, null, { advisor: adv.email, counts: chk.counts });
  await sendMail(adv.email, FEEDBACK_MAIL.list.subject(p.full_name || 'مشارك'), feedbackMail('list', adv.full_name, p.full_name || 'مشارك', { url: `${CONFIG.appUrl}/x` }), [], { category: 'expert_work', ref: `participant:${p.id}`, noteRef: `f360:${c.id}`, actionUntil: actionDeadline(), recipient: { kind: 'expert', id: adv.id }, about: p.id })
    .catch((e) => console.error('f360 list mail', e));
  return mine(p);
}

// ── المستشار: اعتماد القائمة ──
// المستشار الفعلي وحده (لا كل خبير في الدفعة): اعتماد القائمة قرار ضبط جودة لا يُفوَّض
async function requireEffectiveAdvisor(e: any, participantId: string) {
  const { data: p } = await db.from('participants').select('id, full_name, email, organization_id, is_demo').eq('id', participantId).maybeSingle();
  const adv = p ? await advisorOf(p as any) : null;
  if (!p || adv?.id !== e.id) throw new Fail('أنت لست مستشار هذا المشارك', 403, 'forbidden');
  return p as any;
}

export async function advisorList(e: any) {
  if (!journeyApproved(e)) return { success: true, approvals: [], reports: [] };
  const ids = await myParticipantIds(e.id);
  if (!ids.length) return { success: true, approvals: [], reports: [] };
  const { data, error } = await db.from('feedback_cycles').select('*, participants(id, full_name, email, organization_id, is_demo)')
    .in('participant_id', ids).in('status', ['approval', 'open', 'closed', 'released']).order('submitted_at');
  if (error) { if (missingTable(error)) return { success: true, approvals: [], reports: [] }; throw error; }
  const approvals: any[] = [];
  const reports: any[] = [];
  for (const c of data || []) {
    // المستشار الفعلي وحده يرى دورة المشارك (خبير المجموعة يغلب مستشار الدفعة)
    if ((await advisorOf(c.participants))?.id !== e.id) continue;
    const raters = await cycleRaters(c.id);
    const base = { id: c.id, wave: c.wave, status: c.status, participant: c.participants?.full_name || null, participant_id: c.participant_id };
    if (c.status === 'approval') {
      approvals.push({ ...base, submitted_at: c.submitted_at, self_done: !!c.self_submitted_at,
        nominees: raters.map((r) => ({ id: r.id, email: r.email, full_name: r.full_name, relation: r.relation, relation_ar: RELATION_AR[r.relation] || r.relation,
          flags_ar: (r.verification_flags || []).map((f: string) => (RATER_FLAG_AR as Record<string, string>)[f] || f) })) });
    } else {
      // جلسات المشارك مع هذا المستشار: يختار منها جلسة الاستلام عند التسليم
      const { data: sessions } = await db.from('coaching_sessions').select('id, starts_at, status').eq('participant_id', c.participant_id).eq('expert_id', e.id).order('starts_at', { ascending: false }).limit(10);
      reports.push({ ...base, closes_at: c.closes_at, closed_at: c.closed_at, released_at: c.released_at, counts: groupCounts(raters), sessions: sessions || [] });
    }
  }
  return { success: true, approvals, reports };
}

export async function advisorDecide(e: any, b: Body) {
  if (!isUuid(b.cycle_id)) throw new Fail('بيانات ناقصة');
  const c = must(await db.from('feedback_cycles').select('*').eq('id', String(b.cycle_id)).maybeSingle()) as any;
  if (!c || c.status !== 'approval') throw new Fail('لا قائمة بانتظار اعتمادك بهذا المعرّف', 404, 'not_found');
  const p = await requireEffectiveAdvisor(e, c.participant_id);
  const who = `expert:${e.email}`;
  // القرار، اعتمادًا أو إعادة، يُغلق «ينتظرك» في صندوقه (المرحلة 2ج)
  await resolveNotes(`f360:${c.id}`);
  if (b.decision === 'return') {
    const note = String(b.note || '').trim().slice(0, 500);
    if (note.length < 5) throw new Fail('اكتب ملاحظتك ليعدّل المشارك قائمته');
    must(await db.from('feedback_cycles').update({ status: 'nominating', return_note: note }).eq('id', c.id).eq('status', 'approval'));
    await audit('system', who, 'f360.return', 'feedback_cycles', c.id, null, { participant_id: p.id, note });
    if (p.email) await sendMail(p.email, FEEDBACK_MAIL.returned.subject(), feedbackMail('returned', p.full_name, p.full_name, { note, url: CONFIG.appUrl }), [], { category: 'experts', ref: `participant:${p.id}` }).catch((x) => console.error('f360 return mail', x));
    return { success: true, decision: 'return' };
  }
  const s = (await appSettings()).feedback360;
  const now = new Date();
  const closes = closesAtRiyadh(now.getTime(), s.window_days);
  must(await db.from('feedback_cycles').update({ status: 'open', approved_by: who, approved_at: now.toISOString(), opens_at: now.toISOString(), closes_at: closes, reminded_days: [] })
    .eq('id', c.id).eq('status', 'approval'));
  // اعتماد المستشار للقائمة تأكيد لكل بريد فيها (D19: المستشار من يؤكد البريد خارج النطاق)، ثم دعوة كل مقيّم برابطه
  const raters = (await cycleRaters(c.id)).filter((r) => r.status === 'nominated');
  let queued = 0;
  for (const r of raters) {
    const token = randomToken();
    // رمز الترشيح لم يُرسل لأحد، فالدعوة تبدأ بالرمز الجديد وحده
    must(await db.from('raters').update({ status: 'invited', ...tokenPatch(r, await hash(token)), invited_at: now.toISOString(), expires_at: closes,
      ...(r.verification === 'org_domain' ? {} : { verification: 'confirmed', verified_by: who, verified_at: now.toISOString() }) }).eq('id', r.id).eq('status', 'nominated'));
    const link = `${CONFIG.appUrl}/rate?t=${encodeURIComponent(token)}`;
    // bulk: يدخل طابور البريد عند بلوغ الحصة اليومية، فلا تضيع دعوة ولا يتجاوز سقف البريد (D15). ومؤرخة بإغلاق الدورة:
    // دعوة انتظرت حتى أُغلقت النافذة تُترك (expiresAt)
    await sendMail(r.email, `طلب تقدير من ${p.full_name || 'مشارك في برنامج القادة'}`, raterMail(r.full_name, p.full_name || 'زميلك', link, 'f360', { promise: feedbackPromiseAr(r.relation, s), closes: dayAr(closes) }), [], { category: 'request', kind: 'bulk', ref: `rater:${r.id}`, expiresAt: closes })
      .then(() => { queued += 1; }).catch((x) => console.error('f360 invite mail', r.id, x));
  }
  await audit('system', who, 'f360.approve', 'feedback_cycles', c.id, null, { participant_id: p.id, invited: raters.length, mailed: queued });
  return { success: true, decision: 'approve', invited: raters.length, mailed: queued };
}

// ── المهمة الساعية: التذكير في أيامه، والإغلاق عند انقضاء النافذة وإبلاغ المستشار ──
// و360 المخفي (feedback360.enabled مطفأ) متجمد: لا تذكير ولا إغلاق ولا بريد، والدورات على حالها حتى يُظهَر فتُستأنف منها
export async function sweep() {
  const s = (await appSettings()).feedback360;
  if (!s.enabled) return { skipped: 'off', reminded: 0, closed: 0 };
  const { data, error } = await db.from('feedback_cycles').select('*, participants(id, full_name, email, organization_id, is_demo)').eq('status', 'open');
  if (error) { if (missingTable(error)) return { reminded: 0, closed: 0 }; throw error; }
  let reminded = 0, closed = 0;
  const now = Date.now();
  for (const c of data || []) {
    if (c.closes_at && Date.parse(c.closes_at) <= now) {
      must(await db.from('feedback_cycles').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', c.id).eq('status', 'open'));
      closed += 1;
      await audit('system', 'cron', 'f360.close', 'feedback_cycles', c.id);
      const adv = await advisorOf(c.participants).catch(() => null);
      if (adv) await sendMail(adv.email, FEEDBACK_MAIL.ready.subject(c.participants?.full_name || 'مشارك'), feedbackMail('ready', adv.full_name, c.participants?.full_name || 'مشارك', { url: `${CONFIG.appUrl}/x` }), [], { category: 'expert_digest', kind: 'bulk', ref: `participant:${c.participant_id}`, recipient: { kind: 'expert', id: adv.id }, about: c.participant_id }).catch((x) => console.error('f360 ready mail', x));
      continue;
    }
    const due = remindersDue(c, s, now);
    if (!due.length) continue;
    // يُسجَّل اليوم قبل الإرسال: تشغيلة متداخلة لا تكرر التذكير. بلا إخبار المشارك بمن لم يرسل
    must(await db.from('feedback_cycles').update({ reminded_days: [...(c.reminded_days || []), ...due] }).eq('id', c.id));
    const late = (await cycleRaters(c.id)).filter((r) => r.status === 'invited');
    for (const r of late) {
      // رابط جديد في التذكير (الرمز لا يُستعاد من بصمته)، بالمهلة نفسها. بصمته تُضاف ولا تستبدل (P1-14): رابط الدعوة
      // الأولى، والدعوة المنتظرة في الطابور، والنموذج المفتوح برمزه، تبقى صالحة حتى الإغلاق كما وعدت الدعوة
      const token = randomToken();
      must(await db.from('raters').update(tokenPatch(r, await hash(token), true)).eq('id', r.id).eq('status', 'invited'));
      await sendMail(r.email, `تذكير: تقديرك لـ${c.participants?.full_name || 'زميلك'}`, raterMail(r.full_name, c.participants?.full_name || 'زميلك', `${CONFIG.appUrl}/rate?t=${encodeURIComponent(token)}`, 'f360', { promise: feedbackPromiseAr(r.relation, s), closes: dayAr(c.closes_at), reminder: true }), [], { category: 'request', kind: 'bulk', ref: `rater:${r.id}`, expiresAt: c.closes_at })
        .then(() => { reminded += 1; }).catch((x) => console.error('f360 reminder', r.id, x));
    }
  }
  return { reminded, closed };
}

// ── الإدارة: حالة الدورات ونسب الاستجابة، بلا نتيجة فرد ──
export async function adminList(b: Body) {
  let q = listed(db.from('feedback_cycles').select('id, participant_id, wave, status, submitted_at, opens_at, closes_at, closed_at, released_at, participants!inner(full_name, organization_id, is_demo, is_test)'), 'participants').order('created_at', { ascending: false }).limit(500);
  if (b.status) q = q.eq('status', String(b.status));
  const { data, error } = await q;
  if (error) { if (missingTable(error)) return { success: true, ready: false, cycles: [], totals: null }; throw error; }
  const ids = (data || []).map((c: any) => c.id);
  const raters = ids.length ? ((must(await db.from('raters').select('cycle_id, relation, status').in('cycle_id', ids)) as any[]) ?? []) : [];
  const cycles = (data || []).map((c: any) => {
    const own = raters.filter((r) => r.cycle_id === c.id);
    const counts = groupCounts(own);
    const invited = NOMINEE_GROUPS.reduce((n, g) => n + (counts as any)[g].invited, 0);
    const submitted = NOMINEE_GROUPS.reduce((n, g) => n + (counts as any)[g].submitted, 0);
    return { id: c.id, participant_id: c.participant_id, participant: c.participants?.full_name, is_test: !!c.participants?.is_test, wave: c.wave, status: c.status,
      status_ar: (CYCLE_STATUS_AR as Record<string, string>)[c.status], closes_at: c.closes_at, released_at: c.released_at, counts, invited, submitted };
  });
  const live = cycles.filter((c: any) => !c.is_test);
  const sum = (k: 'invited' | 'submitted') => live.filter((c: any) => c.status !== 'nominating').reduce((n: number, c: any) => n + c[k], 0);
  return { success: true, ready: true, cycles,
    totals: { cycles: live.length, open: live.filter((c: any) => c.status === 'open').length, invited: sum('invited'), submitted: sum('submitted'),
      response_pct: sum('invited') ? Math.round((sum('submitted') / sum('invited')) * 100) : null } };
}

export async function adminClose(a: { email: string }, b: Body) {
  if (!isUuid(b.cycle_id)) throw new Fail('بيانات ناقصة');
  const c = must(await db.from('feedback_cycles').update({ closes_at: new Date().toISOString() }).eq('id', String(b.cycle_id)).eq('status', 'open').select('id').maybeSingle()) as any;
  if (!c) throw new Fail('الدورة ليست مفتوحة', 409, 'not_open');
  await audit('admin', a.email, 'admin.f360-close', 'feedback_cycles', c.id);
  // والمخفي: إغلاق المدير قراره فيُنفَّذ، ولا تجري المهمة الساعية على غيرها. بريد «التقرير جاهز» للمستشار يدخل الطابور
  // ولا يُرسل الآن: يمسكه heldMail ما دام 360 مخفيًا، ويخرج حين يُظهَر، فلا يضيع إبلاغ المستشار (الاستئناف)
  if (!(await appSettings()).feedback360.enabled) {
    const row = must(await db.from('feedback_cycles').select('id, participant_id, participants(id, full_name, email, organization_id, is_demo)').eq('id', c.id).maybeSingle()) as any;
    must(await db.from('feedback_cycles').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', c.id).eq('status', 'open'));
    const adv = row?.participants ? await advisorOf(row.participants).catch(() => null) : null;
    const name = row?.participants?.full_name || 'مشارك';
    const queued = adv ? await enqueueMail(adv.email, FEEDBACK_MAIL.ready.subject(name), feedbackMail('ready', adv.full_name, name, { url: `${CONFIG.appUrl}/x` }), `participant:${row.participant_id}`, 'bulk', 'f360_off') : false;
    return { success: true, closed: 1, reminded: 0, mailed: false, queued };
  }
  return { success: true, ...(await sweep()) };
}

// ── استئناف 360 بعد إخفائه: الساعة توقفت معه ──
// النافذة لا تنقضي وهو مخفي، فحين يُظهَر تُمدّ كل دورة مفتوحة بقدر ما بقي مخفيًا من عمرها، ومعها روابط مقيّميها
// المنتظرين (expires_at = closes_at)، فيعمل الرابط نفسه كما وعدت صفحة «متوقف مؤقتًا». بداية الإخفاء: آخر حفظ أطفأه
// (سجل admin.settings-save)، أو نشر المفاتيح (20261116100000) إن كان مطفأ قبله، أيهما أحدث. ما لم تُعرف بدايته لا يُمد.
export const F360_FREEZE_MIGRATION = '20261116100000_leaders_t360_rename';
export async function pausedSince(): Promise<number | null> {
  const [{ data: logs }, { data: mig }] = await Promise.all([
    db.from('audit_log').select('created_at, before, after').eq('action', 'admin.settings-save').eq('entity_id', 'feedback360').order('created_at', { ascending: false }).limit(100),
    db.from('schema_migrations').select('applied_at').eq('name', F360_FREEZE_MIGRATION).maybeSingle(),
  ]);
  const off = ((logs || []) as any[])
    .filter((l) => l?.before?.value?.enabled === true && l?.after?.value?.enabled !== true)
    .map((l) => Date.parse(l.created_at)).filter(Number.isFinite);
  const times = [...off, Date.parse((mig as any)?.applied_at)].filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}
// مقيّمو الأثر (pre وpost) لم يتوقفوا مع 360 إلا منذ نُشر ربطهم به (قرار المالك 2026-11-16)، فبداية إخفائهم لا تسبق ذلك:
// علامة rater.pause-start تُكتب مرة واحدة في أول تشغيل للمهمة الساعية بعد النشر (أو قبل استئناف من الإعدادات إن سبقها)،
// وبداية إخفائهم آخر حفظ أطفأ 360 أو تلك العلامة، أيهما أحدث. بلا أي منهما لا يُمد شيء (لا تُعرف البداية)
export const IMPACT_PAUSE_MARK = 'rater.pause-start';
export async function markImpactPause() {
  const { data, error } = await db.from('audit_log').select('id').eq('action', IMPACT_PAUSE_MARK).limit(1);
  if (error) throw error;
  if ((data || []).length) return false;
  await audit('system', 'cron', IMPACT_PAUSE_MARK, 'raters', null, null, null);
  return true;
}
export async function impactPausedSince(): Promise<number | null> {
  const [{ data: logs }, { data: marks }] = await Promise.all([
    db.from('audit_log').select('created_at, before, after').eq('action', 'admin.settings-save').eq('entity_id', 'feedback360').order('created_at', { ascending: false }).limit(100),
    db.from('audit_log').select('created_at').eq('action', IMPACT_PAUSE_MARK).order('created_at', { ascending: true }).limit(1),
  ]);
  const off = ((logs || []) as any[])
    .filter((l) => l?.before?.value?.enabled === true && l?.after?.value?.enabled !== true)
    .map((l) => Date.parse(l.created_at)).filter(Number.isFinite);
  const times = [...off, ...((marks || []) as any[]).map((m) => Date.parse(m.created_at))].filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}

export async function resumeFrozen(by: string, now = Date.now()) {
  const since = await pausedSince();
  const live = since !== null && since < now;
  // الدورات: جدولها قد لا يكون مرحّلًا بعد، فيُتخطى ولا يمنع استئناف مقيّمي الأثر (لا يعتمدون عليه)
  let extended = 0;
  const cycles = live ? await db.from('feedback_cycles').select('id, closes_at, opens_at').eq('status', 'open') : { data: [], error: null };
  if (cycles.error && !missingTable(cycles.error)) throw cycles.error;
  for (const c of (cycles.error ? [] : cycles.data || []) as any[]) {
    const closes = Date.parse(c.closes_at);
    // ما انقضت نافذته قبل الإخفاء يُغلق كما كان، وما فُتح أثناءه يُمد بقدر ما مضى منذ فتحه
    if (!Number.isFinite(closes) || closes <= (since as number)) continue;
    const from = Math.max(since as number, Date.parse(c.opens_at) || (since as number));
    const delta = now - from;
    if (delta <= 0) continue;
    const next = new Date(closes + delta).toISOString();
    must(await db.from('feedback_cycles').update({ closes_at: next }).eq('id', c.id).eq('status', 'open'));
    const raters = (must(await db.from('raters').select('id, expires_at').eq('cycle_id', c.id).eq('phase', 'f360').eq('status', 'invited')) ?? []) as any[];
    for (const r of raters) {
      const exp = Date.parse(r.expires_at);
      if (Number.isFinite(exp)) must(await db.from('raters').update({ expires_at: new Date(exp + delta).toISOString() }).eq('id', r.id).eq('status', 'invited'));
    }
    await audit('system', by, 'f360.resume', 'feedback_cycles', c.id, { closes_at: c.closes_at }, { closes_at: next, paused_ms: delta });
    extended += 1;
  }
  // مقيّمو الأثر (pre وpost) مؤجلون مع 360: رابط دعوة جارية لم تنقض مهلته قبل إخفائهم يُمد بقدر ما مضى منه في الإخفاء،
  // فلا يجد المقيّم رابطه منتهيًا لأن المفتاح أُطفئ. ما انقضى قبل الإخفاء يبقى كما كان
  const isince = await impactPausedSince();
  const ilive = isince !== null && isince < now;
  let raters = 0;
  if (ilive) {
    const { data: imp, error: ie } = await db.from('raters').select('id, expires_at, invited_at').in('phase', ['pre', 'post']).eq('status', 'invited').gt('expires_at', new Date(isince).toISOString());
    if (ie) throw ie;
    for (const r of (imp || []) as any[]) {
      const exp = Date.parse(r.expires_at);
      const delta = now - Math.max(isince, Date.parse(r.invited_at) || isince);
      if (!Number.isFinite(exp) || delta <= 0) continue;
      must(await db.from('raters').update({ expires_at: new Date(exp + delta).toISOString() }).eq('id', r.id).eq('status', 'invited'));
      raters += 1;
    }
    if (raters) await audit('system', by, 'rater.resume', 'raters', null, null, { raters, paused_ms: now - isince });
  }
  // وبريدهما الممسَك في الطابور: لا يُعد ما مضى مخفيًا من عمره، فلا يُترك «فائتًا» عند أول تفريغ
  const mail = live || ilive ? await FT.resumeHeldMail({ f360: live ? since : null, impact: ilive ? isince : null }, now) : 0;
  if (mail) await audit('system', by, 'mail.resume', 'mail_queue', null, null, { messages: mail });
  return { extended, raters, mail, paused_ms: live ? now - (since as number) : 0 };
}


// ── المرحلة 3: التقرير والاستلام ──
// التقرير من feedbackReport وحدها (feedback360.js)، لكل جمهور البيانات نفسها: المشارك بعد التسليم، والمستشار
// الفعلي من الإغلاق، والإدارة للدعم الفني بسطر في السجل. للموجة الثانية تُضاف أرقام الأولى لكل إطار.
async function buildReport(c: any, s: Settings) {
  const [qs, raters] = await Promise.all([
    db.from('questions').select('*').eq('instrument_id', c.instrument_id).eq('active', true).eq('tier', 'behavior').order('sort'),
    cycleRaters(c.id),
  ]);
  const items = reportItems((must(qs) as any[]) ?? []);
  let previous = null;
  if (c.wave === 't2') {
    const t1 = must(await db.from('feedback_cycles').select('*').eq('participant_id', c.participant_id).eq('wave', 't1').in('status', ['closed', 'released']).maybeSingle()) as any;
    if (t1) previous = feedbackReport({ items, selfAnswers: t1.self_answers || {}, raters: await cycleRaters(t1.id), s, seed: t1.id });
  }
  return feedbackReport({ items, selfAnswers: c.self_answers || {}, raters, s, seed: c.id, previous });
}
const reportMeta = (c: any, who: string | null) => ({ cycle: { id: c.id, wave: c.wave, status: c.status, closed_at: c.closed_at, released_at: c.released_at, plan: c.plan || null }, participant: who });

export async function participantReport(p: any, b: Body) {
  const c = await ownCycle(p, b.cycle_id);
  if (c.status !== 'released') throw new Fail('يسلّمك مستشارك تقريرك في جلسة التوجيه، فتقرؤه معه أول مرة', 403, 'not_released');
  const s = (await appSettings()).feedback360;
  return { success: true, ...reportMeta(c, p.full_name), report: await buildReport(c, s) };
}

// خطة التطوير بعد الاستلام: سلوكان أو ثلاثة وما سيفعله في كل منها
export async function savePlan(p: any, b: Body) {
  const c = await ownCycle(p, b.cycle_id);
  if (c.status !== 'released') throw new Fail('الخطة بعد استلام التقرير', 409, 'not_released');
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 3)
    .map((x: any) => ({ behavior: String(x?.behavior || '').trim().slice(0, 300), action: String(x?.action || '').trim().slice(0, 500) }))
    .filter((x: any) => x.behavior);
  if (!items.length) throw new Fail('اكتب سلوكًا واحدًا على الأقل تعمل عليه');
  must(await db.from('feedback_cycles').update({ plan: { items }, plan_at: new Date().toISOString() }).eq('id', c.id));
  await audit('participant', p.id, 'f360.plan', 'feedback_cycles', c.id, null, { items: items.length });
  return { success: true, plan: { items } };
}

async function cycleById(id: unknown) {
  if (!isUuid(id)) throw new Fail('بيانات ناقصة');
  const c = must(await db.from('feedback_cycles').select('*').eq('id', String(id)).maybeSingle()) as any;
  if (!c) throw new Fail('لا دورة بهذا المعرّف', 404, 'not_found');
  return c;
}

// المستشار يقرأ التقرير من الإغلاق، قبل المشارك، ليستعد لجلسة الاستلام. كل اطلاع في السجل باسمه
export async function advisorReport(e: any, b: Body) {
  const c = await cycleById(b.cycle_id);
  const p = await requireEffectiveAdvisor(e, c.participant_id);
  requireVisible(await visibilityOfParticipant(c.participant_id), 'adv_f360');
  if (!['closed', 'released'].includes(c.status)) throw new Fail('يُتاح التقرير بعد إغلاق النافذة', 409, 'not_closed');
  const s = (await appSettings()).feedback360;
  await audit('system', `expert:${e.email}`, 'expert.f360-report-view', 'feedback_cycles', c.id, null, { participant_id: p.id });
  return { success: true, ...reportMeta(c, p.full_name), report: await buildReport(c, s) };
}

// التسليم في جلسة التوجيه: المستشار وحده يتيح التقرير للمشارك، ويُربط بالجلسة إن اختارها
export async function advisorRelease(e: any, b: Body) {
  const c = await cycleById(b.cycle_id);
  const p = await requireEffectiveAdvisor(e, c.participant_id);
  if (c.status !== 'closed') throw new Fail(c.status === 'released' ? 'سُلّم التقرير من قبل' : 'يُسلَّم التقرير بعد إغلاق النافذة', 409, 'not_closed');
  let session: string | null = null;
  if (b.session_id) {
    const { data } = await db.from('coaching_sessions').select('id').eq('id', String(b.session_id)).eq('participant_id', p.id).maybeSingle();
    if (!data) throw new Fail('هذه الجلسة ليست للمشارك', 400, 'bad_session');
    session = (data as any).id;
  }
  must(await db.from('feedback_cycles').update({ status: 'released', released_by: `expert:${e.email}`, released_at: new Date().toISOString(), debrief_session_id: session }).eq('id', c.id).eq('status', 'closed'));
  await audit('system', `expert:${e.email}`, 'f360.release', 'feedback_cycles', c.id, null, { participant_id: p.id, session_id: session });
  if (p.email) await sendMail(p.email, FEEDBACK_MAIL.released.subject(), feedbackMail('released', p.full_name, p.full_name, { url: CONFIG.appUrl }), [], { category: 'experts', ref: `participant:${p.id}` }).catch((x) => console.error('f360 release mail', x));
  return { success: true };
}

// الإدارة: تقرير فرد للدعم الفني، للمدير ذي الكتابة وحده، وكل فتح في السجل
export async function adminReport(a: Admin, b: Body) {
  requireWrite(a);
  if (!isUuid(b.cycle_id)) throw new Fail('بيانات ناقصة');
  const c = must(await db.from('feedback_cycles').select('*, participants(full_name)').eq('id', String(b.cycle_id)).maybeSingle()) as any;
  if (!c) throw new Fail('لا دورة بهذا المعرّف', 404, 'not_found');
  if (!['closed', 'released'].includes(c.status)) throw new Fail('يُتاح التقرير بعد إغلاق النافذة', 409, 'not_closed');
  const s = (await appSettings()).feedback360;
  await audit('admin', a.email, 'admin.f360-report-view', 'feedback_cycles', c.id, null, { participant_id: c.participant_id });
  // معرّف المقيّم لحجب ملاحظة، بلا اسمه ولا بريده: الإدارة ترى نص الملاحظة كما يراه المشارك
  const notes = (await cycleRaters(c.id)).filter((r) => r.status === 'submitted' && r.open_answers).map((r) => ({ rater_id: r.id, hidden: !!r.comment_hidden, open: r.open_answers }));
  return { success: true, ...reportMeta(c, c.participants?.full_name || null), report: await buildReport(c, s), notes };
}

// حجب ملاحظة تكشف صاحبها أو تسيء، قبل التسليم وبعده، بسطر في السجل
export async function adminHideComment(a: Admin, b: Body) {
  requireWrite(a);
  if (!isUuid(b.rater_id)) throw new Fail('بيانات ناقصة');
  const hidden = b.hidden !== false;
  const r = must(await db.from('raters').update({ comment_hidden: hidden }).eq('id', String(b.rater_id)).eq('phase', 'f360').select('id, cycle_id').maybeSingle()) as any;
  if (!r) throw new Fail('لا مقيّم 360 بهذا المعرّف', 404, 'not_found');
  await audit('admin', a.email, 'admin.f360-comment', 'raters', r.id, null, { cycle_id: r.cycle_id, hidden });
  return { success: true, hidden };
}

// الجهة: أعداد ونسبة استجابة، ومتوسط كل إطار فوق org_min وحده (orgTotals). ids: مشاركو الجهة بقاعدة الإحصاء
// نفسها (forStats في لوحة المنسق). null إن لم يُرحَّل الجدول
export async function orgFeedback(ids: string[]) {
  if (!ids.length) return null;
  const s = (await appSettings()).feedback360;
  const { data, error } = await db.from('feedback_cycles').select('*').in('participant_id', ids).in('status', ['open', 'closed', 'released']);
  if (error) { if (missingTable(error)) return null; throw error; }
  if (!data?.length) return null;
  const reports = [];
  for (const c of data) reports.push(c.status === 'released' ? await buildReport(c, s) : { releasable: false, ...(await responseOf(c.id)) });
  return orgTotals(reports, s);
}
async function responseOf(cycleId: string) {
  const counts = groupCounts(await cycleRaters(cycleId));
  const invited = NOMINEE_GROUPS.reduce((n, g) => n + (counts as any)[g].invited, 0);
  const submitted = NOMINEE_GROUPS.reduce((n, g) => n + (counts as any)[g].submitted, 0);
  return { response: { invited, submitted } };
}
