// ════════════════════════════════════════════════════════════════
// التذكير الموحد على الخادم (المرحلة P3، اعتمدها المالك 2026-11-16)
// ════════════════════════════════════════════════════════════════
// كل مرسل يمر هنا: يبني المحرك (nudge.js) التذكير من رحلة المشارك نفسها، ويُفحص الحد المشترك من السجل الواحد
// (leaders.nudges)، ثم يُرسل ويُكتب. القراءة نفسها تغذي المعاينة قبل الإرسال، وسجل ملف المشارك وأثر كل تذكير.
// إن غاب الجدول (قبل ترحيله) يعمل الإرسال كما كان: reminded_at وحده حدّ مشترك، ولا سجل.
import { audit, db, Fail, nudgeMail, sendMail } from './core.ts';
import { journeyFor } from './participant.ts';
import { onboardingOf } from './onboarding.js';
import { effectReport, NUDGE_REPORT_WINDOWS, gate, groupPreview, ledgerSummary, NUDGE_GAP_DAYS, NUDGE_SENDER_AR, nudgeFor, weeklyPlan } from './nudge.js';
import { baselineProgress } from './admin.ts';
import { coordPermissions } from './logic.js';
import { COORD_NUDGE_DAILY, COORD_NUDGE_GROUPS, inCoordGroup } from './coord-groups.js';

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
async function subjects(ids: string[], lanes = 6) {
  if (!ids.length) return [];
  const { data: rows, error } = await db.from('participants').select('*').in('id', ids);
  if (error) throw error;
  const pre = (rows || []).filter((r: any) => !['placed', 'enrolled', 'completed'].includes(r.status));
  const progress = await baselineProgress(pre.map((r: any) => r.id));
  const out: any[] = [];
  const queue = [...(rows || [])];
  await Promise.all(Array.from({ length: lanes }, async () => {
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
        stage_key: nudge.key, stage_title: nudge.stage, step: nudge.step, channels: ['email', 'banner'], subject: nudge.subject, body: nudge.text, snapshot: nudge.snapshot,
      });
      if (error && !missingTable(error)) throw error;
    }
    // المصدر الواحد لآخر تذكير هو السجل (خارطة 16 نوفمبر، المرحلة 3). reminded_at يُكتب فقط إن غاب السجل
    // (قبل ترحيله)، ويبقى للقراءة في lastBy لما سبق السجل من تذكيرات
    if (!ledger) await db.from('participants').update({ reminded_at: now }).eq('id', p.id);
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

// ── المرشد (مشرف الرحلة)، والمساعد نيابة عنه إلى أن يرد (قرار المالك 2026-11-16) ──
// المرشد: الخبير المسند للمشارك بدور mentor بطلب مقبول (expert_requests). يذكّر من أُسند إليه وحدهم.
// المساعد: في التذكير الأسبوعي، من له مرشد يصله التذكير موقّعًا «المساعد نيابة عن مرشدك»، ما لم يذكّره مرشده
// بنفسه خلال MENTOR_ACTIVE_DAYS: المرشد إن رد وتابع بنفسه توقف المساعد عن النيابة عنه.
export const MENTOR_ACTIVE_DAYS = 14;
const firstOf = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';

/** مرشد كل مشارك من القائمة: { participant_id → { id, name, email } } */
export async function mentorsOf(ids: string[]) {
  const out = new Map<string, { id: string; name: string; email: string }>();
  if (!ids.length) return out;
  const { data } = await db.from('expert_requests').select('participant_id, expert_id, experts(full_name, email, status)')
    .in('participant_id', ids).eq('role', 'mentor').eq('status', 'accepted');
  for (const r of (data || []) as any[]) {
    if (r.experts && r.experts.status !== 'paused' && !out.has(r.participant_id)) out.set(r.participant_id, { id: r.expert_id, name: r.experts.full_name, email: r.experts.email });
  }
  return out;
}

export const mentorSender = (e: { id: string; full_name: string; email: string }): Sender => ({
  kind: 'mentor', label: `المرشد ${firstOf(e.full_name)}`, by: e.email, ref: e.id, signature: `— ${e.full_name}، مرشدك في برنامج القادة`,
});
export const assistantSender = (m: { id: string; name: string }): Sender => ({
  kind: 'assistant', label: `المساعد نيابة عن المرشد ${firstOf(m.name)}`, by: 'cron', ref: m.id,
  signature: `— المساعد الآلي في برنامج القادة، نيابة عن مرشدك ${m.name}`,
});

/** من أُسند إلى هذا الخبير مرشدًا، من بين المطلوبين. غيرهم يُرفض: لا يذكّر المرشد إلا من يرشدهم */
async function assignedMentees(e: { id: string }, ids: string[]) {
  const { data, error } = await db.from('expert_requests').select('participant_id').eq('expert_id', e.id).eq('role', 'mentor').eq('status', 'accepted');
  if (error) throw new Fail('تعذّر قراءة من ترشدهم الآن، حاول بعد قليل', 503, 'busy');
  const mine = new Set((data || []).map((r: any) => r.participant_id));
  const ok = ids.filter((id) => mine.has(id));
  if (!ok.length) throw new Fail('تذكّر من ترشدهم وحدهم', 403, 'forbidden');
  return ok;
}
export async function expertPreview(e: any, b: Record<string, any>) {
  return { success: true, ...(await previewNudges(await assignedMentees(e, cleanIds(b.participant_ids)))) };
}
export async function expertSend(e: any, b: Record<string, any>) {
  return sendNudges(mentorSender(e), await assignedMentees(e, cleanIds(b.participant_ids)));
}
export async function expertLedger(e: any, b: Record<string, any>) {
  const [id] = await assignedMentees(e, cleanIds([b.participant_id]));
  const r: any = await nudgeLedger(id);
  // الخبير يرى من ذكّر ومتى وأثره، بلا بداية بريد المدير المرسل
  return { ...r, rows: r.rows.map((n: any) => ({ ...n, by: n.sender === 'admin' ? 'الإدارة' : n.by })) };
}

/** التذكير الأسبوعي: من له مرشد لم يتابعه بنفسه مؤخرًا يذكّره المساعد نيابة عنه، وغيره التذكير الآلي */
export async function weeklyNudges(ids: string[]) {
  const mentors = await mentorsOf(ids);
  const since = new Date(Date.now() - MENTOR_ACTIVE_DAYS * 864e5).toISOString();
  const { data: active } = mentors.size
    ? await db.from('nudges').select('participant_id').in('participant_id', [...mentors.keys()]).eq('sender', 'mentor').gte('created_at', since)
    : { data: [] as any[] };
  const busy = new Set((active || []).map((r: any) => r.participant_id));
  let sent = 0;
  for (const g of weeklyPlan(ids, mentors, busy)) {
    const sender: Sender = g.mentor ? assistantSender(g.mentor) : { kind: 'auto', label: 'التذكير الآلي', by: 'cron', signature: '' };
    for (let i = 0; i < g.ids.length; i += NUDGE_MAX) {
      const r = await sendNudges(sender, g.ids.slice(i, i + NUDGE_MAX)).catch((e) => { console.error('weekly nudges:', e); return { sent: 0 }; });
      sent += r.sent;
    }
  }
  return { sent, mentor_active: busy.size };
}

// ── منسق الجهة (P4، قرار المالك 2026-11-16) ──
// يذكّر مجموعتي «يحتاج تدخلك» (coord-groups.js) بالمحرك نفسه والحد المشترك، موقّعًا باسم الجهة، بحد يومي للجهة.
// الخادم يختار من يُذكَّر من مشاركي جهته (لا معرّفات من الواجهة)، والمعاينة أعداد بالمرحلة بلا نص ولا مستوى:
// النص يبنيه الخادم ويصل المشارك وحده. مفعّل افتراضيًا، وللإدارة إيقافه لجهة (organizations.coord_nudges).
async function coordTargets(c: any, group: string) {
  const perms = coordPermissions(c.permissions, c.template);
  if (!perms.list) throw new Fail('التذكير لمن يرى قائمة المشاركين', 403, 'forbidden');
  if (!(group in COORD_NUDGE_GROUPS)) throw new Fail('اختر من تذكّرهم');
  if (group === 'stale' && !perms.activity) throw new Fail('تذكير المتوقفين لمن يرى آخر دخول', 403, 'forbidden');
  const { data: org } = await db.from('organizations').select('*').eq('id', c.organization_id).maybeSingle();
  if (!org) throw new Fail('الجهة غير موجودة', 404);
  if (org.coord_nudges === false) throw new Fail('التذكير من بوابة جهتك موقوف بقرار إدارة البرنامج', 403, 'disabled');
  const { data: ps, error } = await db.from('participants').select('id, status, last_login_at, is_demo').eq('organization_id', org.id).eq('is_demo', false);
  if (error) throw new Fail('تعذّر قراءة مشاركي جهتك الآن، حاول بعد قليل', 503, 'busy');
  const now = Date.now();
  return { org, ids: (ps || []).filter((p: any) => inCoordGroup(p, group, now)).map((p: any) => p.id) as string[] };
}
async function coordLeft(orgId: string) {
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from('nudges').select('id', { count: 'exact', head: true }).eq('sender', 'coordinator').eq('sender_ref', orgId).gte('created_at', since);
  return Math.max(0, COORD_NUDGE_DAILY - (count || 0));
}
const coordSender = (c: any, org: any): Sender => ({ kind: 'coordinator', label: `منسق ${org.short_name || org.name}`, by: c.email, ref: org.id, signature: `— ${org.name}` });
async function previewAll(ids: string[]) {
  const parts = [];
  for (let i = 0; i < ids.length; i += NUDGE_MAX) parts.push(await previewNudges(ids.slice(i, i + NUDGE_MAX)));
  return { groups: parts.flatMap((p) => p.groups), skipped: parts.flatMap((p) => p.skipped) };
}

/** ما سيصل مجموعة من «يحتاج تدخلك»: أعداد بالمرحلة، ومن يُتخطى بسببه، وما بقي من حد الجهة اليوم. بلا أسماء ولا نص */
export async function coordPreview(c: any, b: Record<string, any>) {
  const group = String(b.group || '');
  const { org, ids } = await coordTargets(c, group);
  const p = await previewAll(ids);
  const stages = new Map<string, number>();
  for (const g of p.groups) stages.set(g.stage, (stages.get(g.stage) || 0) + g.people.length);
  const skipped: Record<string, number> = {};
  for (const s of p.skipped) skipped[s.why] = (skipped[s.why] || 0) + 1;
  const count = [...stages.values()].reduce((n, x) => n + x, 0);
  return { success: true, group, label: (COORD_NUDGE_GROUPS as Record<string, string>)[group], count, stages: [...stages].map(([stage, n]) => ({ stage, n })), skipped, left: await coordLeft(org.id), signed: org.name, gap_days: NUDGE_GAP_DAYS };
}
export async function coordSend(c: any, b: Record<string, any>) {
  const { org, ids } = await coordTargets(c, String(b.group || ''));
  const left = await coordLeft(org.id);
  if (!left) throw new Fail(`بلغت جهتك حد التذكير اليومي (${COORD_NUDGE_DAILY})، ويتجدد بعد 24 ساعة`, 429, 'rate');
  // من يجتاز المحرك والحد المشترك وحدهم يُحسبون من حد اليوم
  const p = await previewAll(ids);
  const ready = p.groups.flatMap((g) => g.people.map((x: any) => x.id)).slice(0, left);
  let sent = 0;
  const skipped: Record<string, number> = {};
  for (let i = 0; i < ready.length; i += NUDGE_MAX) {
    const r = await sendNudges(coordSender(c, org), ready.slice(i, i + NUDGE_MAX));
    sent += r.sent;
    for (const [k, n] of Object.entries(r.skipped)) skipped[k] = (skipped[k] || 0) + (n as number);
  }
  for (const s of p.skipped) skipped[s.why] = (skipped[s.why] || 0) + 1;
  return { success: true, sent, skipped, left: Math.max(0, left - sent) };
}

// ── تقرير فاعلية التذكير (P5): للإدارة، من السجل الواحد وحال كل مشارك الآن (effectReport في nudge.js) ──
const REPORT_PEOPLE_MAX = 300; // حال كل مشارك من رحلته (journeyFor)؛ النافذة الأوسع تُقصّ على الأحدث
export async function adminReport(_a: unknown, b: Record<string, any>) {
  const t0 = Date.now();
  const days = NUDGE_REPORT_WINDOWS.includes(Number(b.days)) ? Number(b.days) : 30;
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await db.from('nudges').select('participant_id, sender, stage_key, stage_title, snapshot, created_at, seen_at')
    .gte('created_at', since).order('created_at', { ascending: false }).limit(3000);
  if (error) {
    if (missingTable(error)) return { success: true, ledger: false, days };
    throw error;
  }
  const order = [...new Set((data || []).map((r: any) => r.participant_id))];
  const ids = order.slice(0, REPORT_PEOPLE_MAX);
  const keep = new Set(ids);
  // اثنا عشر مسارًا متوازيًا: التقرير يقرأ رحلة كل مشارك في النافذة، فالتوازي أوسع من الإرسال (المرحلة 2)
  const subs = await subjects(ids, 12);
  const current = new Map(subs.map((s) => [s.p.id, s.nudge]));
  const names = new Map(subs.map((s) => [s.p.id, s.p.full_name]));
  const rows = (data || []).filter((r: any) => keep.has(r.participant_id));
  // ms: زمن الحساب، يظهر في التقرير فيُقاس على الإنتاج لا يُقدَّر
  return { success: true, ledger: true, days, capped: order.length > ids.length, ...effectReport(rows, current, names), ms: Date.now() - t0 };
}

/** من ذُكِّر خلال days يومًا من أي مرسل: من السجل الواحد، وإلا (قبل ترحيله) من reminded_at */
export async function recentlyNudged(rows: { id: string; reminded_at?: string | null }[], days: number) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const ids = rows.map((r) => r.id);
  const { data, error } = ids.length
    ? await db.from('nudges').select('participant_id').in('participant_id', ids).gte('created_at', since)
    : { data: [], error: null };
  if (error && !missingTable(error)) throw error;
  if (error) return new Set(rows.filter((r) => r.reminded_at && r.reminded_at >= since).map((r) => r.id));
  return new Set((data || []).map((r: any) => r.participant_id));
}
