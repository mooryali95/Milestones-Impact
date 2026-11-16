// ════════════════════════════════════════════════════════════════
// التذكير الموحد على الخادم (المرحلة P3، اعتمدها المالك 2026-11-16)
// ════════════════════════════════════════════════════════════════
// كل مرسل يمر هنا: يبني المحرك (nudge.js) التذكير من رحلة المشارك نفسها، ويُفحص الحد المشترك من السجل الواحد
// (leaders.nudges)، ثم يُرسل ويُكتب. القراءة نفسها تغذي المعاينة قبل الإرسال، وسجل ملف المشارك وأثر كل تذكير.
// إن غاب الجدول (قبل ترحيله) يعمل الإرسال كما كان: reminded_at وحده حدّ مشترك، ولا سجل.
import { audit, db, Fail, nudgeMail, sendMail } from './core.ts';
import { journeyFor } from './participant.ts';
import { onboardingOf } from './onboarding.js';
import { gate, groupPreview, ledgerSummary, NUDGE_GAP_DAYS, NUDGE_SENDER_AR, nudgeFor } from './nudge.js';
import { baselineProgress } from './admin.ts';

export const NUDGE_MAX = 50; // في الطلب الواحد، كحد الإجراء الجماعي في اللوحة
export type Sender = { kind: 'admin' | 'mentor' | 'assistant' | 'coordinator' | 'auto'; label: string; by: string; ref?: string | null; signature?: string };

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
export const cleanIds = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(String).filter(isUuid))].slice(0, NUDGE_MAX) as string[];
const missingTable = (e: any) => e?.code === '42P01' || /relation .*nudges.* does not exist/i.test(String(e?.message || ''));

/** آخر تذكير لكل مشارك من أي مرسل، من السجل، وإلا من reminded_at (قبل الترحيل أو لتذكير أقدم منه) */
async function lastBy(rows: any[]) {
  const ids = rows.map((r) => r.id);
  const out = new Map<string, any>();
  const { data, error } = ids.length
    ? await db.from('nudges').select('participant_id, sender, sender_label, created_at').in('participant_id', ids).order('created_at', { ascending: false }).limit(ids.length * 5)
    : { data: [], error: null };
  if (error && !missingTable(error)) throw error;
  for (const n of data || []) if (!out.has(n.participant_id)) out.set(n.participant_id, n);
  for (const r of rows) {
    const l = out.get(r.id);
    if (r.reminded_at && (!l || Date.parse(r.reminded_at) > Date.parse(l.created_at) + 6e4)) out.set(r.id, { sender: 'auto', sender_label: 'تذكير سابق', created_at: r.reminded_at });
  }
  return { last: out, ledger: !error };
}

/** المشاركون بما يلزم المحرك: صفوفهم، وتقدمهم في القياس قبل الاعتماد، ورحلتهم بعده (journeyFor نفسه الذي يراه المشارك) */
async function subjects(ids: string[]) {
  if (!ids.length) return [];
  const { data: rows, error } = await db.from('participants').select('*').in('id', ids);
  if (error) throw error;
  const pre = (rows || []).filter((r: any) => !['placed', 'enrolled', 'completed'].includes(r.status));
  const progress = await baselineProgress(pre.map((r: any) => r.id));
  const out: any[] = [];
  const queue = [...(rows || [])];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const onboarding = onboardingOf(p, progress[p.id]?.id ? progress[p.id] : null);
      let journey: any[] = [], pct = 0, dates: any[] = [];
      if (['placed', 'enrolled'].includes(p.status)) {
        const j: any = await journeyFor(p, { lite: true });
        journey = j.journey || []; pct = j.progress || 0;
        dates = [p.profile_completed_at, j.baselineAt, ...((j.pl || []) as any[]).map((x: any) => x.approved_at)];
      }
      out.push({ p, nudge: nudgeFor({ p, onboarding, journey, progress: pct, dates }) });
    }
  }));
  return out;
}

/** ما سيصل كل واحد قبل الإرسال، مجمّعًا بالمرحلة، ومن يُتخطى ولماذا (ومنه «ذكّره المرشد قبل يومين») */
export async function previewNudges(ids: string[]) {
  const subs = await subjects(ids);
  const { last } = await lastBy(subs.map((s) => s.p));
  return groupPreview(subs.map(({ p, nudge }) => {
    const g = gate(last.get(p.id));
    return { id: p.id, name: p.full_name, nudge: nudge.ok && !g.ok ? { ok: false, why: 'recent' } : nudge, last: g.last || null };
  }));
}

/** الإرسال: المحرك نفسه، والحد المشترك، ثم البريد والسجل. يعيد كم أُرسل وكم تُخطّي ولماذا */
export async function sendNudges(sender: Sender, ids: string[]) {
  if (!ids.length) throw new Fail('اختر من تذكّرهم');
  const subs = await subjects(ids);
  const { last, ledger } = await lastBy(subs.map((s) => s.p));
  let sent = 0;
  const skipped: Record<string, number> = {};
  const sign = sender.signature ?? (sender.kind === 'auto' ? '' : `— ${sender.label}`);
  for (const { p, nudge } of subs) {
    const g = gate(last.get(p.id));
    const why = !nudge.ok ? nudge.why : !g.ok ? 'recent' : null;
    if (why) { skipped[why] = (skipped[why] || 0) + 1; continue; }
    const now = new Date().toISOString();
    if (ledger) {
      const { error } = await db.from('nudges').insert({
        participant_id: p.id, sender: sender.kind, sender_label: sender.label, sender_ref: sender.ref || null,
        stage_key: nudge.key, stage_title: nudge.stage, step: nudge.step, channels: ['email'], subject: nudge.subject, body: nudge.text, snapshot: nudge.snapshot,
      });
      if (error && !missingTable(error)) throw error;
    }
    // reminded_at يبقى حدًا مشتركًا لما يقرؤه قبل السجل (الجدولة الأسبوعية وقائمة المشاركين)
    await db.from('participants').update({ reminded_at: now }).eq('id', p.id);
    await sendMail(p.email, nudge.subject, nudgeMail(p.full_name, nudge.subject, nudge.text, sign), [], { kind: 'bulk', ref: `participant:${p.id}` });
    await audit(sender.kind === 'admin' ? 'admin' : 'system', sender.by, 'participant.nudge', 'participants', p.id, null, { sender: sender.kind, stage: nudge.key });
    sent += 1;
  }
  return { success: true, sent, skipped, gap_days: NUDGE_GAP_DAYS };
}

/** سجل التذكير لملف المشارك: كل تذكير بمرسله ومرحلته وأثره، والتذكير الذي يناسبه الآن وهل يُسمح به */
export async function nudgeLedger(participantId: string) {
  const [sub] = await subjects([participantId]);
  if (!sub) throw new Fail('المشارك غير موجود', 404);
  const { data, error } = await db.from('nudges').select('id, sender, sender_label, stage_key, stage_title, step, channels, subject, body, snapshot, created_at, seen_at')
    .eq('participant_id', participantId).order('created_at', { ascending: false }).limit(100);
  if (error && !missingTable(error)) throw error;
  const { last } = await lastBy([sub.p]);
  const g = gate(last.get(participantId));
  const summary = ledgerSummary(data || [], sub.nudge);
  return {
    success: true, ledger: !error, ...summary,
    now: sub.nudge.ok ? { ...sub.nudge, allowed: g.ok } : { ok: false, why: sub.nudge.why },
    last: g.last || null, gap_days: NUDGE_GAP_DAYS, senders: NUDGE_SENDER_AR,
  };
}

// ── إجراءات اللوحة: المعاينة والإرسال من الإدارة، وسجل الملف ──
// توقيع الإدارة ببداية بريد المرسل (قرار المالك 2026-11-16 في وسم المراجع): يرى الزملاء من ذكّر، ولا يُكشف البريد كاملًا
export const adminSender = (a: { email: string }): Sender => {
  const who = String(a.email || '').split('@')[0];
  return { kind: 'admin', label: who ? `الإدارة (${who})` : 'الإدارة', by: a.email, ref: a.email, signature: '— فريق برنامج القادة' };
};
export const adminPreview = (_a: unknown, b: Record<string, any>) => previewNudges(cleanIds(b.participant_ids)).then((r) => ({ success: true, ...r }));
export const adminSend = (a: { email: string }, b: Record<string, any>) => sendNudges(adminSender(a), cleanIds(b.participant_ids));
export const adminLedger = (_a: unknown, b: Record<string, any>) => {
  const id = String(b.participant_id || '');
  if (!isUuid(id)) throw new Fail('معرّف المشارك غير صالح');
  return nudgeLedger(id);
};
