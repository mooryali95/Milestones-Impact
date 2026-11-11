// ════════════════════════════════════════════════════════════════
// متابعة تنفيذ المبادرة وأثرها: للقائد والراعي والمستشار والجهة
// ════════════════════════════════════════════════════════════════
// الخطة من لقطة الوثيقة المعتمدة، والمنطق في tracking.js (يُختبر في
// vitest)، وهنا القراءة والكتابة والبريد فقط. كل شاشة وتقرير يقرأ
// الملخص نفسه من trackingSummary، فلا يُحسب «على المسار» بطريقتين.
import { audit, CONFIG, db, Fail, hash, mailButton, must, randomToken, sendMail } from './core.ts';
import { esc, mailNote, mailShell, mailText } from '../_shared/mail.ts';
import { award } from './participant.ts';
import { isEmail, linkAfterDecisionOk, LINK_CLOSED_AR, normalizeEmail } from './logic.js';
import {
  CHECKPOINTS, cleanUpdate, HEALTH, latestState, M_STATUS, periodOf, portfolioOutcomes, saveTarget, trackingPlan, trackingSummary,
  UPDATE_POINTS, VERIFIED_POINTS, VERIFY, verifyOf,
} from './tracking.js';

type Body = Record<string, any>;
const VERIFY_DAYS = 21;
const UPDATE_COLS = 'id, participant_id, period, checkpoint, milestones, benefits, narrative, blockers, support, verify_name, verify_status, verify_note, verify_at, verify_expires_at, created_at, updated_at';

const initiativeOf = (snapshot: any) => snapshot?.meta?.initiative || 'المبادرة';

// المتابعة لمجموعة مبادرات معتمدة في استعلامين، للقوائم والمحافظ
export async function trackingFor(caps: any[]) {
  const approved = caps.filter((c) => c.status === 'approved' && c.snapshot);
  if (!approved.length) return {} as Record<string, any>;
  const rows = must(await db.from('capstone_updates').select(UPDATE_COLS).in('participant_id', approved.map((c) => c.participant_id))) as any[] ?? [];
  const by: Record<string, any[]> = {};
  for (const r of rows) (by[r.participant_id] ||= []).push(r);
  return Object.fromEntries(approved.map((c) => {
    const plan = trackingPlan(c.snapshot);
    return [c.participant_id, trackingSummary(plan, by[c.participant_id] || [], c.approved_at)];
  }));
}

async function load(participantId: string) {
  const cap = must(await db.from('capstones').select('participant_id, status, approved_at, snapshot, sponsor_name, sponsor_email').eq('participant_id', participantId).maybeSingle()) as any;
  if (cap?.status !== 'approved' || !cap.snapshot) return null;
  const updates = must(await db.from('capstone_updates').select(UPDATE_COLS).eq('participant_id', participantId).order('period')) as any[] ?? [];
  const plan = trackingPlan(cap.snapshot);
  return { cap, plan, updates, summary: trackingSummary(plan, updates, cap.approved_at)!, state: latestState(plan, updates) };
}

const updateView = (u: any) => ({
  id: u.id, period: u.period, checkpoint: u.checkpoint, checkpoint_title: CHECKPOINTS.find((c) => c.key === u.checkpoint)?.title || null,
  milestones: u.milestones || {}, benefits: u.benefits || {}, narrative: u.narrative, blockers: u.blockers, support: u.support,
  verify: u.checkpoint ? { status: verifyOf(u), title: (VERIFY as Record<string, string>)[verifyOf(u)!], name: u.verify_name, note: u.verify_note, at: u.verify_at } : null,
  updated_at: u.updated_at,
});

// الملخص والحالة والسجل: ما يعرضه كل طرف، والتقرير المطبوع
export function trackingView(t: any) {
  if (!t) return null;
  return {
    summary: t.summary, plan: { start: t.plan.start, end: t.plan.end }, state: t.state,
    updates: t.updates.map(updateView).reverse(),
    statuses: M_STATUS, health: HEALTH, checkpoints: CHECKPOINTS,
  };
}
export async function trackingOf(participantId: string) {
  return trackingView(await load(participantId));
}

// ── القائد ──
export async function mine(p: any) {
  const t = await load(p.id);
  if (!t) throw new Fail('تبدأ المتابعة بعد اعتماد وثيقة مبادرتك', 403, 'not_approved');
  const current = t.updates.find((u) => u.period === t.summary.current) || null;
  return { success: true, tracking: trackingView(t), current: current ? updateView(current) : null };
}

export async function save(p: any, b: Body) {
  const t = await load(p.id);
  if (!t) throw new Fail('تبدأ المتابعة بعد اعتماد وثيقة مبادرتك', 403, 'not_approved');
  if (!t.summary.can_update) throw new Fail('انتهت مدة المتابعة لهذه المبادرة', 409, 'closed');
  // صف الشهر الجاري، أو صف المراجعة التي اعترض عليها الراعي أو انقضى رابطه ولو من شهر سابق
  const { period, existing, redo, locked, checkpoint } = saveTarget(t.summary, t.updates, !!b.checkpoint);
  if (locked) throw new Fail(locked === 'pending' ? 'مراجعة الأثر عند الراعي ليؤكدها، فلا تُعدَّل الآن' : 'أكّد الراعي هذه المراجعة، فلا تُعدَّل', 409, 'verifying');
  let clean;
  try { clean = cleanUpdate(t.plan, b, checkpoint); } catch (e) { throw new Fail((e as Error).message); }
  const now = new Date().toISOString();
  const row = must(await db.from('capstone_updates').upsert({
    participant_id: p.id, period, checkpoint, ...clean, updated_at: now,
    ...(existing?.verify_status === 'disputed' ? { verify_status: null, verify_note: null, verify_at: null } : {}),
  }, { onConflict: 'participant_id,period' }).select('id').single()) as any;
  if (!existing) await award(p.id, 'tracking', row.id, UPDATE_POINTS, `تحديث متابعة ${period}: ${initiativeOf(t.cap.snapshot)}`);
  await audit('participant', p.email, checkpoint ? 'tracking.checkpoint' : 'tracking.update', 'capstone_updates', row.id, null, { period, checkpoint, resend: redo });
  const invite = checkpoint ? await inviteVerifier(p, t.cap, row.id, checkpoint) : 'none';
  const r = await mine(p);
  return { ...r, invited: invite === 'sent', mail_failed: invite === 'failed' };
}

// ── تأكيد الراعي ──
function verifyMail(sponsor: string | null, who: string, initiative: string, title: string, link: string) {
  return mailShell(`تأكيد أثر مبادرة: ${initiative}`,
    mailText(`${sponsor ? `أهلًا ${esc(sponsor)}،` : 'أهلًا،'} أرسل ${esc(who)} «${esc(title)}» لمبادرة «${esc(initiative)}» التي أيدتها راعيًا لها في جهتك.`)
    + mailText('نطلب منك تأكيد الأرقام: هل تعكس قيم المؤشرات وحالة المعالم ما تراه فعلًا في الجهة؟ تقرأها من الرابط، ثم تؤكد أو تعترض بملاحظة.')
    + mailButton(link, 'راجع الأرقام وأكّدها')
    + mailNote(`الرابط خاص بك وصالح ${VERIFY_DAYS} يومًا.`),
    { family: 'capstone', preheader: `${who} يطلب تأكيد أثر مبادرة «${initiative}»`, footnote: '' });
}

async function inviteVerifier(p: any, cap: any, updateId: string, checkpoint: string): Promise<'sent' | 'failed' | 'none'> {
  const email = normalizeEmail(cap.sponsor_email || cap.snapshot?.meta?.sponsor_email || '');
  if (!isEmail(email)) return 'none';
  const token = randomToken();
  must(await db.from('capstone_updates').update({
    verify_name: cap.sponsor_name || cap.snapshot?.meta?.sponsor || null, verify_email: email, verify_token_hash: await hash(token),
    verify_status: 'pending', verify_note: null, verify_at: null, verify_expires_at: new Date(Date.now() + VERIFY_DAYS * 864e5).toISOString(),
  }).eq('id', updateId));
  const title = CHECKPOINTS.find((c) => c.key === checkpoint)?.title || 'مراجعة الأثر';
  try {
    await sendMail(email, `تأكيد أثر مبادرة «${initiativeOf(cap.snapshot)}»`,
      verifyMail(cap.sponsor_name || null, p.full_name || 'مشارك في برنامج القادة', initiativeOf(cap.snapshot), title, `${CONFIG.appUrl}/outcome?t=${encodeURIComponent(token)}`));
    return 'sent';
  } catch (e) {
    // لم يصل الرابط: يُغلق الآن فتعود المراجعة إلى القائد ليعيد إرسالها، بدل «بانتظار الراعي» حتى تنقضي مهلته
    console.error('verify mail:', e);
    const { error } = await db.from('capstone_updates').update({ verify_token_hash: null, verify_expires_at: new Date().toISOString() }).eq('id', updateId);
    if (error) console.error('verify close:', error);
    return 'failed';
  }
}

async function verifyFrom(tk: unknown) {
  const token = String(tk || '');
  if (token.length < 20) throw new Fail('الرابط غير صالح', 400, 'invalid');
  // المتابعة مربوطة بالوثيقة لا بالمشارك مباشرة، فيُقرأ صاحبها في استعلام ثانٍ
  const u = must(await db.from('capstone_updates').select('*').eq('verify_token_hash', await hash(token)).maybeSingle()) as any;
  if (!u) throw new Fail('الرابط غير صالح أو استُبدل بطلب أحدث', 404, 'invalid');
  u.participants = must(await db.from('participants').select('id, full_name, email').eq('id', u.participant_id).maybeSingle());
  if (u.verify_status === 'pending' && new Date(u.verify_expires_at) < new Date()) throw new Fail('انتهت صلاحية الرابط، يرسل القائد المراجعة من جديد ليصلك رابط آخر', 410, 'expired');
  // بعد القرار: اطلاع محدود المدة (4.5)
  if (u.verify_status && u.verify_status !== 'pending' && !linkAfterDecisionOk(u.verify_at)) throw new Fail(LINK_CLOSED_AR, 410, 'closed');
  return u;
}

export async function verifyGet(b: Body) {
  const u = await verifyFrom(b.t);
  const t = await load(u.participant_id);
  if (!t) throw new Fail('المبادرة غير متاحة', 404, 'invalid');
  // ما سُجّل حتى هذه المراجعة، لا ما أضيف بعدها
  const upto = t.updates.filter((x) => x.period <= u.period);
  const meta = t.cap.snapshot.meta || {};
  return {
    success: true, done: u.verify_status !== 'pending', decision: u.verify_status, sponsor: u.verify_name,
    initiative: meta.initiative || null, leader: u.participants?.full_name || null, org: meta.org?.name || null,
    checkpoint: CHECKPOINTS.find((c) => c.key === u.checkpoint)?.title || 'مراجعة الأثر', period: u.period,
    state: latestState(t.plan, upto), narrative: u.narrative, blockers: u.blockers, support: u.support, statuses: M_STATUS,
  };
}

export async function verifySubmit(b: Body) {
  const u = await verifyFrom(b.t);
  if (u.verify_status !== 'pending') throw new Fail('سُجّل قرارك من قبل، شكرًا لك', 409, 'done');
  const note = String(b.note || '').trim().slice(0, 2000) || null;
  if (b.decision !== 'confirm' && b.decision !== 'dispute') throw new Fail('قرار غير صالح');
  if (b.decision === 'dispute' && !note) throw new Fail('اكتب للقائد ما الذي لا يطابق ما تراه');
  const now = new Date().toISOString();
  const status = b.decision === 'confirm' ? 'confirmed' : 'disputed';
  must(await db.from('capstone_updates').update({ verify_status: status, verify_note: note, verify_at: now }).eq('id', u.id));
  const p = u.participants;
  if (status === 'confirmed') await award(p.id, 'capstone', u.id, VERIFIED_POINTS, 'تأكيد الراعي لأثر المبادرة');
  else if (p?.email) {
    sendMail(p.email, 'ملاحظة راعي مبادرتك على مراجعة الأثر', mailShell('ملاحظة الراعي على مراجعة الأثر',
      mailText(`أهلًا ${esc(p.full_name || '')}، راجع راعي مبادرتك أرقام «مراجعة الأثر» وكتب:`) + mailNote(esc(note || ''))
      + mailText('صحّح التحديث من صفحة «مبادرتي» ثم أرسله من جديد، فيصل الراعي رابط آخر.')
      + mailButton(CONFIG.appUrl, 'افتح مبادرتي'), { family: 'capstone', footnote: '' })).catch((e) => console.error(e));
  }
  await audit('system', u.verify_email, `tracking.verify-${status}`, 'capstone_updates', u.id, null, {});
  return { success: true, done: true, decision: status };
}

// ── الإدارة والجهة: الأثر على مستوى المحفظة ──
async function outcomeRows(filter: (q: any) => any) {
  const caps = must(await filter(db.from('capstones').select('participant_id, status, approved_at, snapshot, participants!inner(full_name, organization_id, organization_name, work_scope)').eq('status', 'approved'))) as any[] ?? [];
  const tr = await trackingFor(caps);
  return caps.map((c) => ({
    participant_id: c.participant_id, full_name: c.participants?.full_name, organization: c.participants?.organization_name || null,
    scope: c.participants?.work_scope || null, initiative: c.snapshot?.meta?.initiative || null, approved_at: c.approved_at,
    cost: c.snapshot?.cost?.withContingency ?? null, summary: tr[c.participant_id] || null,
  }));
}

export async function adminOutcomes(b: Body) {
  const rows = await outcomeRows((q) => (b.organization_id ? q.eq('participants.organization_id', String(b.organization_id)) : q));
  return { success: true, totals: portfolioOutcomes(rows), initiatives: rows, health: HEALTH };
}

export async function orgOutcomes(orgId: string) {
  const rows = await outcomeRows((q) => q.eq('participants.organization_id', orgId));
  return { totals: portfolioOutcomes(rows), by: Object.fromEntries(rows.map((r) => [r.participant_id, r.summary])) };
}

// ── التذكير الشهري: من cron.reminders، مرة لكل شهر ──
export async function reminders() {
  const caps = must(await db.from('capstones').select('participant_id, status, approved_at, snapshot, tracking_reminded_at, participants(full_name, email, status)')
    .eq('status', 'approved').gte('approved_at', new Date(Date.now() - 215 * 864e5).toISOString()).limit(500)) as any[] ?? [];
  const tr = await trackingFor(caps);
  const period = periodOf(Date.now());
  let sent = 0;
  for (const c of caps) {
    const s = tr[c.participant_id];
    const p = c.participants;
    if (!s || !p?.email || p.status === 'suspended') continue;
    if (!s.due.update && !s.due.checkpoint) continue;
    if (c.tracking_reminded_at && periodOf(c.tracking_reminded_at) === period) continue;
    const title = s.due.checkpoint ? CHECKPOINTS.find((x) => x.key === s.due.checkpoint)!.title : 'تحديث هذا الشهر';
    await db.from('capstones').update({ tracking_reminded_at: new Date().toISOString() }).eq('participant_id', c.participant_id);
    await sendMail(p.email, `${title}: ${initiativeOf(c.snapshot)}`, mailShell(title,
      mailText(s.due.resubmit
        ? `أهلًا ${esc(p.full_name || '')}، لم يؤكد الراعي أرقام «${esc(title)}» لمبادرة «${esc(initiativeOf(c.snapshot))}»: اعترض عليها أو لم يعد رابطه صالحًا.`
        : `أهلًا ${esc(p.full_name || '')}، حان «${esc(title)}» لمبادرة «${esc(initiativeOf(c.snapshot))}».`)
      + mailText(s.due.resubmit ? 'صحّح ما يلزم من صفحة «مبادرتي» ثم أرسلها من جديد، فيصل الراعي رابط آخر.'
        : s.due.checkpoint ? 'تقيس فيها كل منافع الوثيقة بأرقامها الحالية، ويؤكدها راعي المبادرة في جهتك.' : 'دقائق تحدّث فيها حالة المعالم وما تحرك من المؤشرات، فتبقى جهتك ومستشارك على اطلاع.')
      + mailButton(CONFIG.appUrl, 'حدّث متابعتي'), { family: 'capstone', footnote: '' }), [], { kind: 'bulk', ref: `participant:${c.participant_id}` }).catch((e) => console.error(e));
    sent += 1;
  }
  return { sent };
}
