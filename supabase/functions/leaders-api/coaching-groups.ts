// ════════════════════════════════════════════════════════════════
// الجلسة الجماعية مع المستشار (تصور تشغيل الدفعة 2026-11-19، القسم 4.4، المرحلة 5، الترحيل 20261121100000)
// ════════════════════════════════════════════════════════════════
// كيان واحد للجلسة (coaching_groups) وتحته صف لكل مشارك في coaching_sessions القائم (group_id). فالرصيد (coachingStatus)
// والتذكير قبل يوم (sessionReminders) وتنبيه الغياب (coaching_no_show) تعمل لكل مشارك بلا قاعدة ثانية، وكل جمع لجلسات خبير
// يعدّ الكيان مرة واحدة (sessionUnits وtallyOnce في logic.js، والحارس group_once_guard_test.ts).
// القرارات المعتمدة: 7 تأخذ جلسة من رصيد كل مشارك إلا بخانة «لا تُحسب من الرصيد» (off_allowance على صفه)، 8 ساعات المستشار
// مرة واحدة، 9 يؤكد الحضور المستشار صاحبها أو المدير وما لم يؤكَّد بعد يومين يظهر في «ينتظرني»، 10 من استنفد رصيده يُنبَّه عليه
// في المعاينة ويُتخطى أو يُضاف استثناءً مسجلًا.
// الخصوصية: المدعو لا يرى أسماء بقية المدعوين ولا عددهم (لا في رحلته ولا في بريده)، والمستشار يرى جلساته وحدها وأسماء
// مدعويها وحدها بلا بريد ولا جوال. والبريد لا يصل حساب العرض ولا حسابات الاختبار (counted)، ويمر بحصة البريد وطابورها.
// المتابعات (2026-11-22، بلا ترحيل): إضافة مدعوين إلى جلسة قائمة بالمعاينة نفسها (addPreview وaddMembers)، وإعادة إرسال الدعوة بمهلة
// (resend)، وملف إلغاء تقويم عند الإلغاء والإزالة. رقم تسلسل ملف التقويم من وقت آخر تعديل للجلسة أو لصف المدعو (updated_at): يكبر
// مع كل تغيير، ويبقى كما هو في إعادة الإرسال. وحالة بريد الدعوة تُقرأ من سجل البريد وطابوره القائمين (mail_events وmail_queue)
// قبل الترحيل: groupsReady يعيد false، فتقول اللوحة «غير مفعّل بعد»، وتُرفض الكتابة بـnot_migrated، ولا يُقرأ عمود جديد.
import { auditMany, type AuditRow, db, Fail, GROUP_EXPERT_MAIL, GROUP_SESSION_MAIL, groupExpertMail, groupSessionMail, must, sendMail } from './core.ts';
import { missingTable } from './missing-column.ts';
import { counted, listed } from './counting.ts';
import * as OB from './observations.ts';
import { RULES } from './notice-rules.js';
import { cohortMembers, journeyDefinition } from './programs.ts';
import { journeyFor } from './participant.ts';
import { cohortTrainers } from './activities.ts';
import { addressHash, icsEvent, icsSequence } from '../_shared/mail.ts';
import { groupMemberState, inProgram, journeyApproved, sessionsMax, sessionUnits, tallyOnce } from './logic.js';
import { GROUP_REFUSAL_AR, GROUP_SKIP_AR } from './labels.js';

type Body = Record<string, any>;
type Row = Record<string, any>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (UUID_RE.test(String(v || '')) ? String(v) : '');
export const GROUP_MEMBERS_MAX = 50;          // حد الإجراء الجماعي في اللوحة (BULK_MAX)
export const GROUP_INBOX_DAYS = 2;            // القرار 9: ما لم يؤكَّد بعد يومين يظهر في «ينتظرني»
export const GROUP_SHEET_DAYS = 7;            // ورقة المستشار: من قبل الجلسة بساعة إلى أسبوع بعدها، كما ورقة المدرب
const NOT_READY_AR = 'الجلسة الجماعية غير مفعّلة بعد';
const notReady = () => new Fail(NOT_READY_AR, 503, 'not_migrated');
const whenAr = (iso: string) => new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });

// ── الجاهزية (قبل الترحيل وبعده) ──
// مخزنة في العامل: الجاهز يبقى جاهزًا، والغائب يُعاد فحصه بعد دقيقة (ترحيل طُبق والعامل حي: عامل آخر قد يكتب جلسة جماعية، فلا
// يبقى هذا يجمع صفوفها بلا عمود الربط أكثر من دقيقة). تعذّر لا يُعرف سببه لا يُخزَّن
const RECHECK_MS = 60_000;
const state: { ready: boolean | null; at: number } = { ready: null, at: 0 };
export function resetGroupsReady() { state.ready = null; state.at = 0; }
export async function groupsReady(): Promise<boolean> {
  if (state.ready === true) return true;
  if (state.ready === false && Date.now() - state.at < RECHECK_MS) return false;
  const { error } = await db.from('coaching_groups').select('id').limit(1);
  if (!error) { state.ready = true; return true; }
  if (missingTable(error)) { state.ready = false; state.at = Date.now(); } else console.error('coaching groups probe', error.message);
  return false;
}
/** أعمدة قراءة جلسات التوجيه ومعها عمود الربط حين يوجد: كل قراءة تجمع جلسات خبير تمر منها ثم من sessionUnits أو tallyOnce */
export const groupCols = async (cols: string) => (await groupsReady() ? `${cols}, group_id` : cols);

// ── ما يراه المشارك من جلسته الجماعية: عنوانها ومستشارها ومكانها. لا أسماء ولا عدد ──
/** يحمّل صفوف المشارك الجماعية بـgroup (يقرؤه coachingStatus). تعذّر القراءة يبقي الصف بعلامته وحدها ولا يُسقط الرحلة */
export async function decorateGroupRows(rows: Row[]) {
  const ids = [...new Set((rows || []).map((s) => s.group_id).filter(Boolean))];
  if (!ids.length) return rows;
  try {
    const groups = (must(await db.from('coaching_groups').select('id, title_ar, mode, location_ar, expert_id').in('id', ids)) ?? []) as Row[];
    const eids = [...new Set(groups.map((g) => g.expert_id).filter(Boolean))];
    // اسم المستشار لمن يخدم في الرحلة وحده (journeyApproved)، كاسم مدرب الورشة: من أُوقف بعد تكليفه لا يُعرض اسمه للمشارك
    const experts = eids.length ? ((must(await db.from('experts').select('id, full_name, status, roles').in('id', eids)) ?? []) as Row[]) : [];
    const nameOf = new Map(experts.filter(journeyApproved).map((e) => [e.id, e.full_name]));
    const by = new Map(groups.map((g) => [g.id, { title: g.title_ar, mode: g.mode, location: g.mode === 'in_person' ? g.location_ar || null : null, with: nameOf.get(g.expert_id) || null }]));
    for (const s of rows) if (s.group_id && by.has(s.group_id)) s.group = by.get(s.group_id);
  } catch (e) { console.error('group rows', (e as Error).message); }
  return rows;
}

// ── عالم الدفعة: متطلبات الاستشارة في برنامجها، وخبراؤها بالربط القائم، وأعضاؤها ──
async function cohortWorld(cohortId: unknown) {
  const id = uuid(cohortId);
  const cohort = id ? (must(await db.from('cohorts').select('*').eq('id', id).maybeSingle()) as Row | null) : null;
  if (!cohort) throw new Fail('الدفعة غير موجودة', 404);
  const def = await journeyDefinition({}, cohort);
  const stageOf = new Map((def.stages || []).map((s: any) => [s.key, s.title_ar]));
  const requirements = (def.requirements || []).filter((r: any) => r.kind === 'coaching' && r.active !== false)
    .map((r: any) => ({ id: r.id, title: r.title_ar, stage: stageOf.get(r.stage_key) || '', minutes: Number(r.config?.minutes) || 60, max: sessionsMax(r.config), mode: r.config?.mode === 'in_person' ? 'in_person' : 'online', location: r.config?.location_ar || '' }));
  const experts = (await cohortTrainers([cohort.id]))[cohort.id] || [];
  return { cohort, requirements, experts };
}

// حِمل خبراء الدفعة: جلساتهم المحجوزة القادمة، والجماعية مرة واحدة
async function upcomingLoad(expertIds: string[]) {
  if (!expertIds.length) return {} as Record<string, number>;
  // group-once: tallyOnce
  const rows = (must(await db.from('coaching_sessions').select(await groupCols('expert_id')).eq('status', 'booked').gte('starts_at', new Date().toISOString()).in('expert_id', expertIds)) ?? []) as Row[];
  return tallyOnce(rows) as Record<string, number>;
}

// تعارض المستشار: جلسة توجيه قائمة له (فردية أو جماعية أخرى) أو ورشة سُمّي مدربها، تتقاطع مع الموعد. تنبيه لا منع
async function expertConflicts(expertId: string, startsAt: string, endsAt: string, exceptGroup: string | null = null) {
  // group-once: sessionUnits
  const rows = (must(await db.from('coaching_sessions').select(await groupCols('id, expert_id, status, starts_at, ends_at')).eq('expert_id', expertId).in('status', ['booked', 'requested'])
    .lt('starts_at', endsAt).gt('ends_at', startsAt)) ?? []) as Row[];
  const units = sessionUnits(rows.filter((s) => !exceptGroup || s.group_id !== exceptGroup));
  // optional-exempt: تعارض موعد المدرب: الورشة الاختيارية تشغل وقته كغيرها، وليس عدًّا
  const ws = (must(await db.from('workshop_sessions').select('id, title_ar, starts_at, ends_at, active').eq('expert_id', expertId).eq('active', true).lt('starts_at', endsAt).gt('ends_at', startsAt)) ?? []) as Row[];
  return [
    ...units.map((u: any) => ({ kind: u.group ? 'group' : 'session', starts_at: u.starts_at, ends_at: u.ends_at })),
    ...ws.map((s) => ({ kind: 'workshop', title: s.title_ar, starts_at: s.starts_at, ends_at: s.ends_at })),
  ];
}

// ── تصنيف المختارين (المعاينة والحفظ بالحكم نفسه) ──
// ok يُدعى. at_max استنفد رصيده، وlocked لم تُفتح له الخدمة بعد: يُتخطيان أو يُضافان استثناءً مسجلًا (القرار 10).
// ineligible لا يُضاف أبدًا، بسببه: ليس من الدفعة، خارج البرنامج، حساب العرض، لا خدمة استشارة في برنامجه، أو مدعو أصلًا
export type MemberVerdict = { id: string; name: string; category: 'ok' | 'at_max' | 'locked' | 'ineligible'; code: string; reason: string; used?: number; max?: number | null; test?: boolean; busy?: boolean };
async function classify(cohort: Row, requirementId: string, ids: string[], opt: { counts: boolean; startsAt?: string; endsAt?: string; inGroup?: Set<string> } = { counts: true }): Promise<MemberVerdict[]> {
  if (!ids.length) return [];
  // counting-exempt: صفوف بمعرّفاتها المختارة لتُصنَّف واحدًا واحدًا، وحساب العرض يُرفض بسببه المكتوب (demo) وحساب الاختبار يُعلَّم
  const rows = (must(await db.from('participants').select('*').in('id', ids)) ?? []) as Row[];
  const byId = new Map(rows.map((p) => [p.id, p]));
  const members = new Set(((await cohortMembers(cohort)) as Row[]).map((m) => m.id));
  // مشغول: له جلسة توجيه قائمة تتقاطع مع الموعد (علامة في المعاينة، لا منع)
  const busy = new Set<string>();
  if (opt.startsAt && opt.endsAt) {
    const clash = (must(await db.from('coaching_sessions').select('participant_id').in('participant_id', ids).in('status', ['booked', 'requested']).lt('starts_at', opt.endsAt).gt('ends_at', opt.startsAt)) ?? []) as Row[];
    for (const x of clash) busy.add(x.participant_id);
  }
  const out = new Map<string, MemberVerdict>();
  const no = (id: string, name: string, code: keyof typeof GROUP_SKIP_AR): MemberVerdict => ({ id, name, category: 'ineligible', code, reason: GROUP_SKIP_AR[code] });
  const live: Row[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) out.set(id, no(id, '', 'unknown'));
    else if (p.is_demo) out.set(id, no(id, p.full_name, 'demo'));
    else if (!members.has(id)) out.set(id, no(id, p.full_name, 'not_member'));
    else if (!inProgram(p.status)) out.set(id, no(id, p.full_name, 'out'));
    else if (opt.inGroup?.has(id)) out.set(id, no(id, p.full_name, 'already'));
    else live.push(p);
  }
  for (let i = 0; i < live.length; i += 5) {
    await Promise.all(live.slice(i, i + 5).map(async (p) => {
      const base = { id: p.id, name: p.full_name, ...(p.is_test ? { test: true } : {}), ...(busy.has(p.id) ? { busy: true } : {}) };
      try {
        const { journey, approved } = await journeyFor(p, { lite: true, cohort });
        const st = journey.find((s: any) => s.items.some((x: any) => x.id === requirementId));
        const act = st?.items.find((x: any) => x.id === requirementId)?.activity;
        if (!st || !act) { out.set(p.id, no(p.id, p.full_name, 'no_service')); return; }
        const used = act.used ?? 0, max = act.max ?? null;
        // الخدمة مفتوحة له بقاعدة الحجز الفردي نفسها (sessionOpen): المعتمد مساره، أو من فتحت له مرحلتها
        if (!(approved || st.status !== 'locked')) out.set(p.id, { ...base, category: 'locked', code: 'locked', reason: GROUP_SKIP_AR.locked, used, max });
        else if (opt.counts && max != null && act.at_max) out.set(p.id, { ...base, category: 'at_max', code: 'at_max', reason: `استنفد رصيده (${used} من ${max})`, used, max });
        else out.set(p.id, { ...base, category: 'ok', code: 'ok', reason: '', used, max });
      } catch (e) { console.error('group classify', p.id, (e as Error).message); out.set(p.id, no(p.id, p.full_name, 'unreadable')); }
    }));
  }
  return ids.map((id) => out.get(id)!);
}

const cleanIds = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(uuid).filter(Boolean))];
function cleanWhen(b: Body, fallbackMinutes: number) {
  const starts = new Date(String(b.starts_at || ''));
  if (!b.starts_at || isNaN(starts.getTime())) throw new Fail('حدد موعد الجلسة', 400, 'starts_at');
  const m = Math.round(Number(b.minutes) || fallbackMinutes);
  if (!(m >= 15 && m <= 480)) throw new Fail('المدة من 15 إلى 480 دقيقة', 400, 'minutes');
  return { starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + m * 6e4).toISOString(), minutes: m };
}
function cleanPlace(b: Body) {
  const mode = b.mode === 'in_person' ? 'in_person' : 'online';
  const join_url = mode === 'online' ? String(b.join_url || '').trim().slice(0, 500) : '';
  if (join_url && !/^https:\/\/[^\s]+$/i.test(join_url)) throw new Fail('رابط الجلسة يبدأ بـhttps://', 400, 'join_url');
  const location_ar = mode === 'in_person' ? String(b.location_ar || '').trim().slice(0, 300) : '';
  if (mode === 'in_person' && !location_ar) throw new Fail('اكتب مكان الجلسة الحضورية', 400, 'location');
  return { mode, join_url: join_url || null, location_ar: location_ar || null };
}

// ── المعاينة (admin.coaching-group-preview): قراءة بلا أثر ──
export async function preview(b: Body) {
  if (!(await groupsReady())) return { success: true, ready: false, message: NOT_READY_AR };
  const w = await cohortWorld(b.cohort_id);
  const ids = cleanIds(b.participant_ids);
  if (ids.length > GROUP_MEMBERS_MAX) throw new Fail(`الحد ${GROUP_MEMBERS_MAX} مشاركًا في الجلسة الواحدة`, 400, 'too_many');
  const req = w.requirements.find((r: any) => r.id === b.requirement_id) || (w.requirements.length === 1 ? w.requirements[0] : null);
  const load = await upcomingLoad(w.experts.map((e) => e.id));
  const base = { success: true, ready: true, cohort: { id: w.cohort.id, name: w.cohort.name }, requirements: w.requirements, experts: w.experts.map((e) => ({ ...e, upcoming: load[e.id] || 0 })), max_members: GROUP_MEMBERS_MAX };
  if (!req) return { ...base, requirement_id: null, members: [], conflicts: [] };
  let when: ReturnType<typeof cleanWhen> | null = null;
  try { when = b.starts_at ? cleanWhen(b, req.minutes) : null; } catch { when = null; }
  const members = await classify(w.cohort, req.id, ids, { counts: b.counts !== false, startsAt: when?.starts_at, endsAt: when?.ends_at });
  const expertId = w.experts.some((e) => e.id === b.expert_id) ? String(b.expert_id) : '';
  const conflicts = expertId && when ? await expertConflicts(expertId, when.starts_at, when.ends_at) : [];
  return { ...base, requirement_id: req.id, members, conflicts };
}

// ── البريد ──
type MailTally = { sent: number; queued: number; failed: number; skipped: number };
const groupView = (g: Row, expertName: string | null) => ({ title: g.title_ar, when: whenAr(g.starts_at), expert: expertName, where: g.mode === 'in_person' ? g.location_ar || null : null, joinUrl: g.mode === 'online' ? g.join_url || null : null, counts: g.counts_allowance !== false });
// مؤرخ بموعد الجلسة (expiresAt): إن انتظر في الطابور حتى بدأت يُترك ولا يخرج بعدها. وجلسة مضى موعدها لا يخرج لها بريد أصلًا
const mailable = (g: Row) => Date.parse(g.starts_at) > Date.now();
// ملف التقويم: دعوة أو تحديث (PUBLISH)، أو إلغاء (CANCEL) بالمعرّف نفسه. رقم التسلسل من آخر تعديل للجلسة أو لصف المدعو
const calendarFile = (uid: string, g: Row, view: ReturnType<typeof groupView>, cancel: boolean, ...touched: unknown[]) => icsEvent({ uid, start: g.starts_at, end: g.ends_at, title: `${g.title_ar} · برنامج القادة`,
  description: view.where || 'Milestone Impact · Leaders Program', url: view.joinUrl || '', sequence: icsSequence(g.updated_at, ...touched), ...(cancel ? { method: 'CANCEL' as const } : {}) });
/** بريد للمدعوين: الحقيقيون وحدهم (counted: لا حساب العرض ولا حساب اختبار). rows صفوفهم في coaching_sessions (معرّف الصف معرّف دعوة تقويمه).
 * الدعوة والتحديث بملف تقويم، والإلغاء والإزالة بملف إلغائه. g.updated_at وقت آخر تعديل كما كُتب (يمرره المستدعي بعد الكتابة) */
async function mailMembers(kind: keyof typeof GROUP_SESSION_MAIL, g: Row, rows: Row[], expertName: string | null): Promise<MailTally> {
  const out: MailTally = { sent: 0, queued: 0, failed: 0, skipped: 0 };
  if (!rows.length) return out;
  const people = (must(await counted(db.from('participants').select('id, full_name, email').in('id', rows.map((r) => r.participant_id)))) ?? []) as Row[];
  const byId = new Map(people.map((p) => [p.id, p]));
  const view = groupView(g, expertName);
  const live = kind === 'invite' || kind === 'change';
  for (const r of rows) {
    const p = byId.get(r.participant_id);
    if (!p?.email) { out.skipped += 1; continue; }
    const ics = [calendarFile(r.id, g, view, !live, r.updated_at)];
    try {
      const res = await sendMail(p.email, GROUP_SESSION_MAIL[kind].subject, groupSessionMail(kind, p.full_name, view), ics, { kind: 'bulk', ref: g.id, ...(live ? { expiresAt: g.starts_at } : {}) });
      if (res === 'queued') out.queued += 1; else out.sent += 1;
    } catch (e) { out.failed += 1; console.error('group mail', kind, g.id, (e as Error).message); }
  }
  return out;
}
// journey-guard: بريد مستشار الجلسة بمعرّفه ليُبلَّغ بتكليفه أو تغيّر جلسته أو إلغائها، ولو أُوقف بعد التكليف (الأهلية تُفحص عند التكليف: cohortTrainers)
async function mailExpert(kind: keyof typeof GROUP_EXPERT_MAIL, g: Row, expertId: string | null, count: number, cohortName: string | null): Promise<'sent' | 'queued' | 'failed' | 'none'> {
  if (!expertId) return 'none';
  const e = (await db.from('experts').select('id, full_name, email').eq('id', expertId).maybeSingle()).data as Row | null;
  if (!e?.email) return 'none';
  const view = { ...groupView(g, null), count, cohort: cohortName };
  const ics = [calendarFile(g.id, g, view, kind === 'cancel')];
  try {
    const res = await sendMail(e.email, GROUP_EXPERT_MAIL[kind].subject, groupExpertMail(kind, e.full_name, view), ics, { kind: 'bulk', ref: g.id, ...(kind === 'cancel' ? {} : { expiresAt: g.starts_at }) });
    return res === 'queued' ? 'queued' : 'sent';
  } catch (err) { console.error('group expert mail', kind, g.id, (err as Error).message); return 'failed'; }
}
// journey-guard: اسم مستشار الجلسة في بريد مدعويها بمعرّفه، وقد فُحصت أهليته عند تكليفه (cohortTrainers)
const expertNameOf = async (id: string | null) => (id ? ((await db.from('experts').select('full_name').eq('id', id).maybeSingle()).data as Row | null)?.full_name || null : null);

// ── صفوف الجلسة ──
async function groupRows(groupId: string): Promise<Row[]> {
  return (must(await db.from('coaching_sessions').select('*').eq('group_id', groupId)) ?? []) as Row[];
}
const activeRows = (rows: Row[]) => rows.filter((r) => groupMemberState(r) !== 'removed');
const marked = (rows: Row[]) => rows.some((r) => r.status === 'attended' || r.status === 'no_show');
async function loadGroup(id: unknown) {
  if (!(await groupsReady())) throw notReady();
  const gid = uuid(id);
  const g = gid ? (must(await db.from('coaching_groups').select('*').eq('id', gid).maybeSingle()) as Row | null) : null;
  if (!g) throw new Fail('الجلسة الجماعية غير موجودة', 404);
  return g;
}

// ── الحفظ (admin.coaching-group-save): إنشاء، أو تعديل بمعرّفها ──
export async function save(a: any, b: Body) {
  if (!(await groupsReady())) throw notReady();
  return b.id ? update(a, b) : create(a, b);
}

async function create(a: any, b: Body) {
  const w = await cohortWorld(b.cohort_id);
  const req = w.requirements.find((r: any) => r.id === b.requirement_id);
  if (!req) throw new Fail('اختر نشاط الاستشارة من برنامج الدفعة', 400, 'requirement');
  const expert = w.experts.find((e) => e.id === b.expert_id);
  if (!expert) throw new Fail('المستشار ليس من خبراء هذه الدفعة. اختره من مستشارها أو فريقها', 400, 'expert_not_in_cohort');
  const when = cleanWhen(b, req.minutes);
  const place = cleanPlace(b);
  const title = String(b.title_ar || '').trim().slice(0, 200) || `جلسة جماعية: ${req.title}`;
  const counts = b.counts !== false;
  const ids = cleanIds(b.participant_ids);
  if (!ids.length) throw new Fail('اختر المشاركين أولًا', 400, 'empty');
  if (ids.length > GROUP_MEMBERS_MAX) throw new Fail(`الحد ${GROUP_MEMBERS_MAX} مشاركًا في الجلسة الواحدة`, 400, 'too_many');

  // إعادة المحاولة لا تنشئ جلسة ثانية ولا ترسل دعوة ثانية: الجلسة نفسها (الدفعة والمستشار والموعد) قائمة فتُرفض بمعرّفها
  const twin = (must(await db.from('coaching_groups').select('id').eq('cohort_id', w.cohort.id).eq('expert_id', expert.id).eq('starts_at', when.starts_at).eq('status', 'scheduled').limit(1)) ?? []) as Row[];
  if (twin.length) throw new Fail('هذه الجلسة مسجلة من قبل: المستشار نفسه في الموعد نفسه لهذه الدفعة', 409, 'duplicate', { id: twin[0].id });
  const conflicts = await expertConflicts(expert.id, when.starts_at, when.ends_at);
  if (conflicts.length && b.confirm_conflict !== true) throw new Fail('للمستشار موعد آخر في هذا الوقت. راجع الموعد، أو أكّد الحفظ معه', 409, 'expert_conflict', { conflicts });

  const verdicts = await classify(w.cohort, req.id, ids, { counts, startsAt: when.starts_at, endsAt: when.ends_at });
  const exceptions = new Set(cleanIds(b.exceptions));
  const picked = verdicts.filter((v) => v.category === 'ok' || ((v.category === 'at_max' || v.category === 'locked') && exceptions.has(v.id)));
  const skipped = verdicts.filter((v) => !picked.includes(v)).map((v) => ({ id: v.id, name: v.name, code: v.code, reason: v.reason }));
  if (!picked.length) throw new Fail('لا أحد من المختارين يُدعى إلى هذه الجلسة. راجع المعاينة', 400, 'no_members', { skipped });

  const now = new Date().toISOString();
  const g = must(await db.from('coaching_groups').insert({
    cohort_id: w.cohort.id, requirement_id: req.id, expert_id: expert.id, title_ar: title, starts_at: when.starts_at, ends_at: when.ends_at, ...place,
    counts_allowance: counts, status: 'scheduled', created_by: a.email, updated_at: now,
  }).select('*').single()) as Row;
  // صف لكل مشارك: يدوي بلا معرّف حجز خارجي (فلا يصله webhook منصة الحجز)، محجوز، بموعد الجلسة ورابطها ومستشارها
  const ins = await db.from('coaching_sessions').insert(picked.map((v) => ({
    participant_id: v.id, requirement_id: req.id, kind: 'manual', provider: 'manual', status: 'booked', starts_at: when.starts_at, ends_at: when.ends_at,
    join_url: place.join_url, expert_id: expert.id, group_id: g.id, ...(counts ? {} : { off_allowance: true }), updated_at: now,
  }))).select('id, participant_id');
  if (ins.error) {
    // لا جلسة بلا مدعوين: يُحذف الكيان إن تعذّرت صفوفه، فلا يبقى نصف حفظ
    await db.from('coaching_groups').delete().eq('id', g.id);
    throw new Fail('تعذّر حفظ الجلسة الجماعية. أعد المحاولة', 500, 'db_error');
  }
  const rows = (ins.data || []) as Row[];
  const logs: AuditRow[] = [{ actorType: 'admin', actor: a.email, action: 'coaching.group-create', entity: 'coaching_groups', entityId: g.id,
    after: { cohort_id: w.cohort.id, requirement_id: req.id, expert_id: expert.id, starts_at: when.starts_at, minutes: when.minutes, mode: place.mode, counts, members: picked.length, exceptions: picked.filter((v) => v.category !== 'ok').length, ...(conflicts.length ? { conflict_confirmed: true } : {}) } }];
  for (const v of picked) {
    logs.push({ actorType: 'admin', actor: a.email, action: v.category === 'ok' ? 'coaching.group-add' : 'coaching.group-exception', entity: 'participants', entityId: v.id,
      after: { group_id: g.id, starts_at: when.starts_at, counts, ...(v.category === 'ok' ? {} : { exception: v.code, used: v.used ?? null, max: v.max ?? null }) } });
  }
  // السجل شرط الحفظ: إن تعذّر يُتراجع عن الجلسة وصفوفها، فلا تبقى جلسة بلا أثر ولا دعوة (وإعادة المحاولة تنشئها من جديد)
  try { await auditMany(logs); } catch (e) {
    await db.from('coaching_sessions').delete().eq('group_id', g.id);
    await db.from('coaching_groups').delete().eq('id', g.id);
    throw e;
  }
  const mail = mailable(g) ? await mailMembers('invite', g, rows, expert.full_name) : { sent: 0, queued: 0, failed: 0, skipped: 0 };
  const expert_mail = mailable(g) ? await mailExpert('assign', g, expert.id, rows.length, w.cohort.name) : 'none';
  return { success: true, id: g.id, added: picked.length, exceptions: picked.filter((v) => v.category !== 'ok').length, skipped, mail, expert_mail, past: !mailable(g) };
}

async function update(a: any, b: Body) {
  const g = await loadGroup(b.id);
  if (g.status !== 'scheduled') throw new Fail('هذه الجلسة ملغاة، فلا تُعدَّل', 409, 'cancelled');
  const w = await cohortWorld(g.cohort_id);
  const rows = activeRows(await groupRows(g.id));
  const next: Row = {};
  if ('title_ar' in b) { const t = String(b.title_ar || '').trim().slice(0, 200); if (!t) throw new Fail('اكتب عنوان الجلسة', 400, 'title'); if (t !== g.title_ar) next.title_ar = t; }
  if ('starts_at' in b || 'minutes' in b) {
    const cur = Math.round((Date.parse(g.ends_at) - Date.parse(g.starts_at)) / 6e4);
    const when = cleanWhen({ starts_at: b.starts_at ?? g.starts_at, minutes: b.minutes ?? cur }, cur);
    if (Date.parse(when.starts_at) !== Date.parse(g.starts_at) || Date.parse(when.ends_at) !== Date.parse(g.ends_at)) Object.assign(next, { starts_at: when.starts_at, ends_at: when.ends_at });
  }
  if ('mode' in b || 'join_url' in b || 'location_ar' in b) {
    const place = cleanPlace({ mode: b.mode ?? g.mode, join_url: 'join_url' in b ? b.join_url : g.join_url, location_ar: 'location_ar' in b ? b.location_ar : g.location_ar });
    for (const k of ['mode', 'join_url', 'location_ar'] as const) if ((place[k] || null) !== (g[k] || null)) next[k] = place[k];
  }
  if ('expert_id' in b && String(b.expert_id || '') !== String(g.expert_id || '')) {
    if (!w.experts.some((e) => e.id === b.expert_id)) throw new Fail('المستشار ليس من خبراء هذه الدفعة. اختره من مستشارها أو فريقها', 400, 'expert_not_in_cohort');
    next.expert_id = String(b.expert_id);
  }
  if (!Object.keys(next).length) return { success: true, unchanged: true };
  const whenChanged = 'starts_at' in next, whereChanged = 'mode' in next || 'join_url' in next || 'location_ar' in next, expertChanged = 'expert_id' in next;
  // بعد تسجيل الحضور يبقى العنوان وحده قابلًا للتعديل: الموعد والمستشار صارا واقعة محسوبة
  if ((whenChanged || whereChanged || expertChanged) && marked(rows)) throw new Fail('سُجّل حضور هذه الجلسة، فلا يتغير موعدها ولا مكانها ولا مستشارها. تراجع عن الحضور أولًا', 409, 'marked');
  const now = new Date().toISOString();
  // after يحمل وقت هذا التعديل: منه رقم تسلسل ملف التقويم، فيحدّث الموعد في تقويم المدعو ولا يضيف ثانيًا
  const after: Row = { ...g, ...next, updated_at: now };
  if (whenChanged || expertChanged) {
    const conflicts = after.expert_id ? await expertConflicts(after.expert_id, after.starts_at, after.ends_at, g.id) : [];
    if (conflicts.length && b.confirm_conflict !== true) throw new Fail('للمستشار موعد آخر في هذا الوقت. راجع الموعد، أو أكّد الحفظ معه', 409, 'expert_conflict', { conflicts });
  }
  must(await db.from('coaching_groups').update({ ...next, updated_at: now }).eq('id', g.id));
  const booked = rows.filter((r) => r.status === 'booked' || r.status === 'requested');
  if ((whenChanged || whereChanged || expertChanged) && booked.length) {
    // تغيّر الموعد يعيد فتح تذكير اليوم السابق (reminded_at)، فيخرج للموعد الجديد
    must(await db.from('coaching_sessions').update({ starts_at: after.starts_at, ends_at: after.ends_at, join_url: after.mode === 'online' ? after.join_url || null : null, expert_id: after.expert_id || null, updated_at: now, ...(whenChanged ? { reminded_at: null } : {}) })
      .eq('group_id', g.id).in('status', ['booked', 'requested']));
  }
  const pick = (x: Row) => Object.fromEntries(Object.keys(next).map((k) => [k, x[k] ?? null]));
  await auditMany([{ actorType: 'admin', actor: a.email, action: 'coaching.group-update', entity: 'coaching_groups', entityId: g.id, before: pick(g), after: pick(after) }]);
  let mail: MailTally = { sent: 0, queued: 0, failed: 0, skipped: 0 };
  let expert_mail: string = 'none';
  // الإبلاغ عند تغيّر ما يهم المدعو: الموعد أو المكان أو المستشار. والعنوان وحده لا بريد له
  if ((whenChanged || whereChanged || expertChanged) && b.notify !== false && mailable(after)) {
    mail = await mailMembers('change', after, booked, await expertNameOf(after.expert_id));
    if (expertChanged) {
      if (g.expert_id) await mailExpert('cancel', { ...g, updated_at: now }, g.expert_id, booked.length, w.cohort.name);
      expert_mail = await mailExpert('assign', after, after.expert_id, booked.length, w.cohort.name);
    } else expert_mail = await mailExpert('change', after, after.expert_id, booked.length, w.cohort.name);
  }
  return { success: true, id: g.id, changed: Object.keys(next), mail, expert_mail };
}

// ── الإلغاء (admin.coaching-group-cancel): الجلسة كلها، ويُبلَّغ من دُعي ──
export async function cancel(a: any, b: Body) {
  const g = await loadGroup(b.id);
  if (g.status === 'cancelled') return { success: true, already: true };
  const rows = activeRows(await groupRows(g.id));
  if (marked(rows)) throw new Fail('سُجّل حضور هذه الجلسة، فلا تُلغى. تراجع عن الحضور أولًا', 409, 'marked');
  const now = new Date().toISOString();
  // الشرط على الحالة: طلبان معًا يلغي أحدهما وحده، فلا بريد إلغاء مرتين
  const hit = (must(await db.from('coaching_groups').update({ status: 'cancelled', cancelled_by: a.email, cancelled_at: now, updated_at: now }).eq('id', g.id).eq('status', 'scheduled').select('id')) ?? []) as Row[];
  if (!hit.length) return { success: true, already: true };
  const booked = rows.filter((r) => r.status === 'booked' || r.status === 'requested');
  // الصفوف الملغاة تخرج من الرصيد وحدها (coachingStatus لا يعدّ الملغى)، فيعود لكل مدعو ما أُخذ منه
  must(await db.from('coaching_sessions').update({ status: 'cancelled', confirmed_by: null, confirmed_at: null, updated_at: now }).eq('group_id', g.id).in('status', ['booked', 'requested']));
  const reason = String(b.reason || '').trim().slice(0, 300);
  await auditMany([{ actorType: 'admin', actor: a.email, action: 'coaching.group-cancel', entity: 'coaching_groups', entityId: g.id, before: { status: 'scheduled', members: booked.length }, after: { status: 'cancelled', ...(reason ? { reason } : {}) } },
    ...booked.map((r): AuditRow => ({ actorType: 'admin', actor: a.email, action: 'coaching.group-cancelled', entity: 'participants', entityId: r.participant_id, after: { group_id: g.id, starts_at: g.starts_at } }))]);
  const tell = b.notify !== false && mailable(g);
  // ملف الإلغاء بوقت الإلغاء رقمَ تسلسل: أعلى من الدعوة ومن كل تحديث سبقه
  const gone = { ...g, updated_at: now };
  const mail = tell ? await mailMembers('cancel', gone, booked, await expertNameOf(g.expert_id)) : { sent: 0, queued: 0, failed: 0, skipped: 0 };
  const cohortName = g.cohort_id ? ((await db.from('cohorts').select('name').eq('id', g.cohort_id).maybeSingle()).data as Row | null)?.name || null : null;
  const expert_mail = tell ? await mailExpert('cancel', gone, g.expert_id, booked.length, cohortName) : 'none';
  return { success: true, cancelled: booked.length, mail, expert_mail };
}

// ── إزالة مشارك واحد (admin.coaching-group-remove): يعود رصيده، ويُبلَّغ ──
export async function removeMember(a: any, b: Body) {
  const g = await loadGroup(b.id);
  if (g.status !== 'scheduled') throw new Fail('هذه الجلسة ملغاة', 409, 'cancelled');
  const pid = uuid(b.participant_id);
  const rows = await groupRows(g.id);
  const row = rows.find((r) => r.participant_id === pid);
  if (!row || groupMemberState(row) === 'removed') return { success: true, already: true };
  if (row.status === 'attended' || row.status === 'no_show') throw new Fail('سُجّل حضوره أو غيابه في هذه الجلسة. تراجع عنه أولًا ثم أزله', 409, 'marked');
  if (activeRows(rows).length <= 1) throw new Fail('هو آخر مدعو في الجلسة. ألغِ الجلسة بدل إزالته', 409, 'last_member');
  const now = new Date().toISOString();
  // مشروط بحالته كما قُرئت: إزالة مكررة لا تكتب ولا تبلّغ مرتين
  const hit = (must(await db.from('coaching_sessions').update({ status: 'cancelled', confirmed_by: null, confirmed_at: null, note: null, updated_at: now }).eq('id', row.id).eq('status', row.status).select('id')) ?? []) as Row[];
  if (!hit.length) return { success: true, already: true };
  const reason = String(b.reason || '').trim().slice(0, 300);
  await auditMany([{ actorType: 'admin', actor: a.email, action: 'coaching.group-remove', entity: 'participants', entityId: pid, before: { group_id: g.id, state: groupMemberState(row) }, after: { group_id: g.id, restored: !row.off_allowance, ...(reason ? { reason } : {}) } }]);
  const wasBooked = row.status === 'booked' || row.status === 'requested';
  const mail = wasBooked && b.notify !== false && mailable(g) ? await mailMembers('removed', g, [{ ...row, updated_at: now }], await expertNameOf(g.expert_id)) : { sent: 0, queued: 0, failed: 0, skipped: 0 };
  return { success: true, removed: true, mail };
}

// ── إضافة مدعوين إلى جلسة قائمة (admin.coaching-group-candidates وadmin.coaching-group-add) ──
// بالمعاينة نفسها وحكمها (classify): من يُدعى، ومن استنفد رصيده أو لم تُفتح له الخدمة (يُتخطى أو يُضاف استثناءً مسجلًا)، ومن لا يُضاف بسببه.
// قبل تسجيل الحضور وقبل نهاية الجلسة وحدهما: بعدهما صارت الجلسة واقعة محسوبة، ومن حضر بلا دعوة يُسجَّل له لقاء فردي. خانة الجلسة
// «لا تُحسب من الرصيد» تسري على الجدد. من أُزيل أو اعتذر يعود بصفه نفسه (فهرس العضو الفريد)، فمعرّف دعوة تقويمه واحد.
// الدعوة للجدد وحدهم، ولا بريد للمدعوين القائمين. والمستشار لا يُراسَل: العدد والأسماء في بوابته لحظة بلحظة، والإزالة لا تراسله كذلك،
// وبريد لكل إضافة ضجيج. إعادة الطلب نفسه: الكل «مدعو أصلًا»، فلا صف ثانٍ ولا دعوة ثانية
const ADD_BLOCK_AR = { cancelled: 'هذه الجلسة ملغاة، فلا يُضاف إليها أحد', ended: 'انتهت هذه الجلسة، فلا يُضاف إليها أحد', marked: 'سُجّل حضور هذه الجلسة، فلا يُضاف إليها أحد. تراجع عن الحضور أولًا' } as const;
function addBlock(g: Row, rows: Row[], now = Date.now()): keyof typeof ADD_BLOCK_AR | null {
  if (g.status !== 'scheduled') return 'cancelled';
  if (Date.parse(g.ends_at) <= now) return 'ended';
  return marked(rows) ? 'marked' : null;
}
const invitedNow = (rows: Row[]) => new Set(rows.filter((r) => groupMemberState(r) === 'booked').map((r) => r.participant_id as string));
export async function addPreview(b: Body) {
  if (!(await groupsReady())) return { success: true, ready: false, message: NOT_READY_AR };
  const g = await loadGroup(b.id);
  const rows = await groupRows(g.id);
  const block = addBlock(g, rows);
  const session = { id: g.id, title: g.title_ar, starts_at: g.starts_at, ends_at: g.ends_at, counts: g.counts_allowance !== false, past: !mailable(g) };
  if (block) return { success: true, ready: true, session, blocked: ADD_BLOCK_AR[block], candidates: [], members: [], room: 0 };
  const w = await cohortWorld(g.cohort_id);
  const inGroup = invitedNow(rows);
  const was = new Map(rows.filter((r) => !inGroup.has(r.participant_id)).map((r) => [r.participant_id, groupMemberState(r)]));
  // أعضاء الدفعة ممن في البرنامج وليسوا مدعوين الآن (cohortMembers: بلا الحساب التجريبي)
  const candidates = ((await cohortMembers(w.cohort)) as Row[]).filter((m) => inProgram(m.status) && !inGroup.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, ...(was.has(m.id) ? { was: was.get(m.id) } : {}) })).sort((x, y) => String(x.name).localeCompare(String(y.name), 'ar'));
  const ids = cleanIds(b.participant_ids);
  if (ids.length > GROUP_MEMBERS_MAX) throw new Fail(`الحد ${GROUP_MEMBERS_MAX} مشاركًا في الجلسة الواحدة`, 400, 'too_many');
  const members = await classify(w.cohort, g.requirement_id, ids, { counts: session.counts, startsAt: g.starts_at, endsAt: g.ends_at, inGroup });
  return { success: true, ready: true, session, blocked: null, candidates, members, room: Math.max(0, GROUP_MEMBERS_MAX - activeRows(rows).length), max_members: GROUP_MEMBERS_MAX };
}
export async function addMembers(a: any, b: Body) {
  const g = await loadGroup(b.id);
  const rows = await groupRows(g.id);
  const block = addBlock(g, rows);
  if (block) throw new Fail(ADD_BLOCK_AR[block], 409, block);
  const w = await cohortWorld(g.cohort_id);
  const ids = cleanIds(b.participant_ids);
  if (!ids.length) throw new Fail('اختر من تضيفهم أولًا', 400, 'empty');
  if (ids.length > GROUP_MEMBERS_MAX) throw new Fail(`الحد ${GROUP_MEMBERS_MAX} مشاركًا في الجلسة الواحدة`, 400, 'too_many');
  const counts = g.counts_allowance !== false;
  const verdicts = await classify(w.cohort, g.requirement_id, ids, { counts, startsAt: g.starts_at, endsAt: g.ends_at, inGroup: invitedNow(rows) });
  const exceptions = new Set(cleanIds(b.exceptions));
  const picked = verdicts.filter((v) => v.category === 'ok' || ((v.category === 'at_max' || v.category === 'locked') && exceptions.has(v.id)));
  const skipped = verdicts.filter((v) => !picked.includes(v)).map((v) => ({ id: v.id, name: v.name, code: v.code, reason: v.reason }));
  const none = { sent: 0, queued: 0, failed: 0, skipped: 0 };
  if (!picked.length) {
    // إعادة المحاولة بعد نجاحها: الكل مدعو أصلًا، فلا كتابة ولا بريد
    if (skipped.length && skipped.every((x) => x.code === 'already')) return { success: true, id: g.id, added: 0, exceptions: 0, readded: 0, already: true, skipped, mail: none, past: !mailable(g) };
    throw new Fail('لا أحد من المختارين يُضاف إلى هذه الجلسة. راجع المعاينة', 400, 'no_members', { skipped });
  }
  const old = new Map(rows.map((r) => [r.participant_id as string, r]));
  const fresh = picked.filter((v) => !old.has(v.id));
  if (activeRows(rows).length + picked.filter((v) => !old.has(v.id) || groupMemberState(old.get(v.id)) === 'removed').length > GROUP_MEMBERS_MAX) throw new Fail(`الحد ${GROUP_MEMBERS_MAX} مشاركًا في الجلسة الواحدة`, 400, 'too_many');
  const now = new Date().toISOString();
  const place = { starts_at: g.starts_at, ends_at: g.ends_at, join_url: g.mode === 'online' ? g.join_url || null : null, expert_id: g.expert_id || null };
  const added: Row[] = [];
  const back: Row[] = [];
  // من أُزيل أو اعتذر: صفه نفسه يعود محجوزًا بموعد الجلسة الآن وخانة رصيدها، مشروطًا بحالته كما قُرئت (طلبان معًا يكتب أحدهما وحده)
  for (const v of picked.filter((x) => old.has(x.id))) {
    const row = old.get(v.id)!;
    const hit = (must(await db.from('coaching_sessions').update({ status: 'booked', confirmed_by: null, confirmed_at: null, note: null, reminded_at: null, off_allowance: counts ? null : true, updated_at: now, ...place })
      .eq('id', row.id).eq('status', 'cancelled').select('id')) ?? []) as Row[];
    if (hit.length) { added.push({ id: row.id, participant_id: v.id, updated_at: now }); back.push(row); }
  }
  let inserted: Row[] = [];
  if (fresh.length) {
    const ins = await db.from('coaching_sessions').insert(fresh.map((v) => ({
      participant_id: v.id, requirement_id: g.requirement_id, kind: 'manual', provider: 'manual', status: 'booked', group_id: g.id, ...place, ...(counts ? {} : { off_allowance: true }), updated_at: now,
    }))).select('id, participant_id');
    if (ins.error) {
      // تعذّر الإدراج (أو سبقه طلب آخر بالعضو نفسه: الفهرس الفريد): يُتراجع عمّن أُعيد، فلا نصف إضافة. وإعادة المحاولة نظيفة
      for (const r of back) await db.from('coaching_sessions').update({ status: 'cancelled', confirmed_by: r.confirmed_by ?? null, confirmed_at: r.confirmed_at ?? null, off_allowance: r.off_allowance ?? null, updated_at: now }).eq('id', r.id);
      throw new Fail('تعذّرت إضافة المدعوين. أعد المحاولة', 500, 'db_error');
    }
    inserted = ((ins.data || []) as Row[]).map((r) => ({ ...r, updated_at: now }));
    added.push(...inserted);
  }
  const got = new Set(added.map((r) => r.participant_id));
  const done = picked.filter((v) => got.has(v.id));
  // من سبقه طلب آخر بين القراءة والكتابة: مدعو أصلًا
  for (const v of picked) if (!got.has(v.id)) skipped.push({ id: v.id, name: v.name, code: 'already', reason: GROUP_SKIP_AR.already });
  if (!done.length) return { success: true, id: g.id, added: 0, exceptions: 0, readded: 0, already: true, skipped, mail: none, past: !mailable(g) };
  const n = { exceptions: done.filter((v) => v.category !== 'ok').length, readded: back.length };
  const logs: AuditRow[] = [{ actorType: 'admin', actor: a.email, action: 'coaching.group-add-members', entity: 'coaching_groups', entityId: g.id,
    before: { members: activeRows(rows).length }, after: { added: done.length, ...n, counts } }];
  for (const v of done) {
    const prev = old.has(v.id) ? groupMemberState(old.get(v.id)) : null;
    logs.push({ actorType: 'admin', actor: a.email, action: v.category === 'ok' ? 'coaching.group-add' : 'coaching.group-exception', entity: 'participants', entityId: v.id,
      after: { group_id: g.id, starts_at: g.starts_at, counts, late: true, ...(prev ? { was: prev } : {}), ...(v.category === 'ok' ? {} : { exception: v.code, used: v.used ?? null, max: v.max ?? null }) } });
  }
  // السجل شرط الحفظ كما في الإنشاء: إن تعذّر يُتراجع عن الإضافة، فلا مدعو بلا أثر ولا دعوة
  try { await auditMany(logs); } catch (e) {
    if (inserted.length) await db.from('coaching_sessions').delete().in('id', inserted.map((r) => r.id));
    for (const r of back) await db.from('coaching_sessions').update({ status: 'cancelled', confirmed_by: r.confirmed_by ?? null, confirmed_at: r.confirmed_at ?? null, off_allowance: r.off_allowance ?? null, updated_at: now }).eq('id', r.id);
    throw e;
  }
  const mail = mailable(g) ? await mailMembers('invite', g, added, await expertNameOf(g.expert_id)) : none;
  return { success: true, id: g.id, added: done.length, ...n, skipped, mail, past: !mailable(g) };
}

// ── حالة بريد الدعوة لكل مدعو، من سجل البريد وطابوره القائمين (لا مصدر ثانٍ) ──
// بريد الجلسة يحمل معرّفها مرجعًا (ref)، والسجل يحمل بصمة العنوان وعنوان الرسالة. الدعوة وإشعار التغيير كلاهما يحمل موعدها وملف
// تقويمها، فآخر أحدهما هو «آخر دعوة». sent خرجت، وwaiting تنتظر في صندوق «لم يُرسل»، وfailed لم تخرج (تعذّرت أو فات أوانها في الطابور)
export const GROUP_RESEND_MINUTES = 60;
type InviteMail = { state: 'sent' | 'waiting' | 'failed'; at: string; resend_at?: string };
const INVITE_SUBJECTS = [GROUP_SESSION_MAIL.invite.subject, GROUP_SESSION_MAIL.change.subject];
const lower = (v: unknown) => String(v || '').trim().toLowerCase();
/** rows: صفوف المدعوين وفيها participants.email. يعيد null إن تعذّرت قراءة السجل (فلا تُعرض حالة، ولا تُعاد دعوة على عمى) */
async function inviteMail(groupIds: string[], rows: Row[], now = Date.now()): Promise<Map<string, InviteMail> | null> {
  const out = new Map<string, InviteMail>();
  if (!groupIds.length || !rows.length) return out;
  const ev = await db.from('mail_events').select('ref, to_hash, status, created_at').in('ref', groupIds).in('subject', INVITE_SUBJECTS).order('created_at', { ascending: false }).limit(5000);
  if (ev.error) { console.error('group mail state', ev.error.message); return null; }
  const qu = await db.from('mail_queue').select('ref, to_email, created_at').in('ref', groupIds).in('subject', INVITE_SUBJECTS).is('sent_at', null).is('gave_up_at', null).order('created_at', { ascending: false }).limit(2000);
  if (qu.error) { console.error('group mail queue', qu.error.message); return null; }
  const hashes = new Map<string, string>();
  for (const r of rows) {
    const email = lower(r.participants?.email);
    if (!email || r.participants?.is_test || r.participants?.is_demo) continue;
    if (!hashes.has(email)) hashes.set(email, await addressHash(email));
    const mine = ((ev.data || []) as Row[]).filter((e) => e.ref === r.group_id && e.to_hash === hashes.get(email));
    const last = mine[0], sent = mine.find((e) => e.status === 'sent');
    const waiting = ((qu.data || []) as Row[]).find((m) => m.ref === r.group_id && lower(m.to_email) === email);
    const until = sent ? Date.parse(sent.created_at) + GROUP_RESEND_MINUTES * 6e4 : 0;
    const hold = until > now ? { resend_at: new Date(until).toISOString() } : {};
    if (waiting && (!sent || Date.parse(waiting.created_at) > Date.parse(sent.created_at))) out.set(r.id, { state: 'waiting', at: waiting.created_at });
    else if (last?.status === 'sent') out.set(r.id, { state: 'sent', at: last.created_at, ...hold });
    else if (last) out.set(r.id, { state: 'failed', at: last.created_at, ...hold });
  }
  return out;
}

// ── إعادة إرسال الدعوة (admin.coaching-group-resend): لمدعو واحد، أو لكل من لم يُسجَّل حضوره بعد ──
// المهلة: لا تُعاد لمدعو خرجت له دعوة أو تحديث خلال GROUP_RESEND_MINUTES، ولا لمن دعوته تنتظر في الطابور (تخرج وحدها). فالنقر
// المتكرر وإعادة الطلب لا يرسلان مرتين. بقالب الدعوة نفسه وملف تقويمه برقم تسلسله الحالي (لا يضيف موعدًا ثانيًا)، وبحصة البريد
// وطابورها، مؤرخة بموعد الجلسة. لا لجلسة ملغاة ولا لجلسة بدأت، ولا لحساب اختبار أو عرض
export async function resend(a: any, b: Body) {
  const g = await loadGroup(b.id);
  if (g.status !== 'scheduled') throw new Fail('هذه الجلسة ملغاة، فلا تُعاد دعوتها', 409, 'cancelled');
  if (!mailable(g)) throw new Fail('بدأت هذه الجلسة أو مضى موعدها، فلا تُعاد دعوتها', 409, 'past');
  const one = b.participant_id ? uuid(b.participant_id) : '';
  if (b.participant_id && !one) throw new Fail('المدعو غير موجود', 404);
  // مدعوو جلسة بعينها بمعرّفها (listed: حساب الاختبار يظهر بصفته ولا يصله بريد، وحساب العرض لا يكون عضوًا)
  const all = (must(await listed(db.from('coaching_sessions').select('*, participants!inner(full_name, email, is_demo, is_test)').eq('group_id', g.id), 'participants')) ?? []) as Row[];
  const pending = all.filter((r) => groupMemberState(r) === 'booked' && (!one || r.participant_id === one));
  if (one && !pending.length) throw new Fail('ليس مدعوًّا ينتظر هذه الجلسة، فلا دعوة تُعاد له', 409, 'not_pending');
  const real = pending.filter((r) => !r.participants?.is_test && r.participants?.email);
  if (one && !real.length) throw new Fail('حساب اختبار: يُدعى ولا يصله بريد', 409, 'test_account');
  const states = await inviteMail([g.id], real);
  if (!states) throw new Fail('تعذّرت قراءة سجل البريد الآن، فلم تُعد الدعوة. حاول بعد قليل', 503, 'mail_unreadable');
  const held = (r: Row) => { const m = states.get(r.id); return !!m && (m.state === 'waiting' || !!m.resend_at); };
  const go = real.filter((r) => !held(r));
  const throttled = real.length - go.length;
  if (one && !go.length) {
    const m = states.get(real[0].id)!;
    throw new Fail(m.state === 'waiting' ? 'دعوته تنتظر في صندوق «لم يُرسل» وتخرج حين تتسع حصة اليوم، فلا تُعاد' : `أُرسلت له قبل قليل. تُعاد بعد ${GROUP_RESEND_MINUTES} دقيقة من آخر إرسال`, 429, 'throttled', { resend_at: m.resend_at || null });
  }
  const none = { sent: 0, queued: 0, failed: 0, skipped: 0 };
  if (!go.length) return { success: true, mail: { ...none, skipped: pending.length - real.length }, throttled, minutes: GROUP_RESEND_MINUTES };
  const mail = await mailMembers('invite', g, go, await expertNameOf(g.expert_id));
  mail.skipped += pending.length - real.length;
  await auditMany([{ actorType: 'admin', actor: a.email, action: 'coaching.group-resend', entity: one ? 'participants' : 'coaching_groups', entityId: one || g.id,
    after: { group_id: g.id, sent: mail.sent, queued: mail.queued, failed: mail.failed, ...(throttled ? { throttled } : {}) } }]);
  return { success: true, mail, throttled, minutes: GROUP_RESEND_MINUTES };
}

// ── القراءة للإدارة (admin.coaching-groups): الجلسات بمدعويها وحالة كل منهم ──
const memberView = (r: Row) => ({ id: r.participant_id, full_name: r.participants?.full_name || '', email: r.participants?.email || null, state: groupMemberState(r), off: !!r.off_allowance, confirmed_by: r.confirmed_by || null, confirmed_at: r.confirmed_at || null });
function summary(g: Row, rows: Row[], now = Date.now()) {
  const active = activeRows(rows);
  const n = (s: string) => active.filter((r) => groupMemberState(r) === s).length;
  const ended = Date.parse(g.ends_at) < now;
  return { count: active.length, attended: n('attended'), no_show: n('no_show'), excused: n('excused'), pending: n('booked'), ended, awaiting: g.status === 'scheduled' && ended && n('booked') > 0 };
}
// journey-guard: اسم مستشار كل جلسة للعرض في لوحة الإدارة، ولو أُوقف بعد انعقادها
export async function adminList(b: Body = {}) {
  if (!(await groupsReady())) return { success: true, ready: false, groups: [] };
  const since = new Date(Date.now() - 120 * 864e5).toISOString();
  let q = db.from('coaching_groups').select('*').gte('starts_at', since).order('starts_at', { ascending: false }).limit(200);
  if (b.cohort_id) q = q.eq('cohort_id', uuid(b.cohort_id));
  if (b.id) q = db.from('coaching_groups').select('*').eq('id', uuid(b.id));
  const groups = (must(await q) ?? []) as Row[];
  if (!groups.length) return { success: true, ready: true, groups: [] };
  const ids = groups.map((g) => g.id);
  const [rows, experts, cohorts, reqs] = await Promise.all([
    // قائمة تشغيلية للإدارة (listed): حساب الاختبار يظهر بصفته، وحساب العرض لا يكون عضوًا أصلًا
    listed(db.from('coaching_sessions').select('*, participants!inner(full_name, email, is_demo, is_test)').in('group_id', ids), 'participants').then((r: any) => (must(r) ?? []) as Row[]),
    db.from('experts').select('id, full_name').in('id', [...new Set(groups.map((g) => g.expert_id).filter(Boolean))]).then((r: any) => (must(r) ?? []) as Row[]),
    db.from('cohorts').select('id, name').in('id', [...new Set(groups.map((g) => g.cohort_id).filter(Boolean))]).then((r: any) => (must(r) ?? []) as Row[]),
    db.from('stage_requirements').select('id, title_ar').in('id', [...new Set(groups.map((g) => g.requirement_id))]).then((r: any) => (must(r) ?? []) as Row[]),
  ]);
  const nameOf = (list: Row[], k = 'full_name') => new Map(list.map((x) => [x.id, x[k]]));
  const eOf = nameOf(experts), cOf = nameOf(cohorts, 'name'), rOf = nameOf(reqs, 'title_ar');
  // حالة بريد الدعوة لمدعوي الجلسات القادمة وحدها (ما تُعاد دعوته). تعذّر قراءتها لا يُسقط القائمة: تُعرض بلا حالة
  const upcoming = new Set(groups.filter((g) => g.status === 'scheduled' && mailable(g)).map((g) => g.id));
  const mails = upcoming.size ? await inviteMail([...upcoming], (rows as Row[]).filter((r) => upcoming.has(r.group_id) && groupMemberState(r) === 'booked')).catch(() => null) : null;
  return {
    success: true, ready: true,
    groups: groups.map((g) => {
      const mine = (rows as Row[]).filter((r) => r.group_id === g.id);
      return {
        id: g.id, cohort_id: g.cohort_id, cohort: cOf.get(g.cohort_id) || null, requirement_id: g.requirement_id, requirement: rOf.get(g.requirement_id) || null, expert_id: g.expert_id, expert: eOf.get(g.expert_id) || null,
        title: g.title_ar, starts_at: g.starts_at, ends_at: g.ends_at, mode: g.mode, location: g.location_ar, join_url: g.join_url, counts: g.counts_allowance !== false, status: g.status,
        ...summary(g, mine),
        // can_add: تُضاف إليها مدعوون (قبل الحضور وقبل نهايتها). can_resend: تُعاد دعوتها (قادمة). resend_minutes مهلة الإعادة
        can_add: !addBlock(g, mine), can_resend: upcoming.has(g.id), ...(upcoming.has(g.id) ? { resend_minutes: GROUP_RESEND_MINUTES, mail_known: !!mails } : {}),
        members: activeRows(mine).map((r) => ({ ...memberView(r), ...(r.participants?.is_test ? { test: true } : {}), ...(mails?.get(r.id) ? { mail: mails.get(r.id) } : {}) })).sort((x, y) => x.full_name.localeCompare(y.full_name, 'ar')),
      };
    }),
  };
}

// ── ورقة الحضور: كاتب واحد للمدير وللمستشار صاحب الجلسة (القرار 9) ──
// لكل مدعو: حضر، لم يحضر، اعتذر، أو التراجع إلى «محجوزة». حفظ واحد، والخادم يحكم لكل مشارك ويعيد: سُجّل، كما هو، أو رُفض بسببه.
// «حضر» و«لم يحضر» من قبل الموعد بساعة لا قبلها، و«اعتذر» في أي وقت. الغياب يُكتب ملاحظة في ملف المشارك ويُبلَّغ به مرة واحدة
// كما في الجلسة الفردية. والمستشار لا يغيّر ما أكّده غيره، ونافذته إلى أسبوع بعد الجلسة
type Marker = { email: string; expert?: boolean };
export const GROUP_MARKS = ['attended', 'no_show', 'excused', 'booked'] as const;
type Mark = { id: string; state: typeof GROUP_MARKS[number] };
const STATUS_OF: Record<string, string> = { attended: 'attended', no_show: 'no_show', excused: 'cancelled', booked: 'booked' };
const cleanMarks = (v: unknown): Mark[] => {
  const seen = new Set<string>();
  const out: Mark[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const id = uuid(x?.id), st = String(x?.state || '');
    if (!id || seen.has(id) || !(GROUP_MARKS as readonly string[]).includes(st)) continue;
    seen.add(id); out.push({ id, state: st as Mark['state'] });
  }
  return out;
};
async function markGroup(by: Marker, g: Row, b: Body) {
  if (g.status !== 'scheduled') throw new Fail('هذه الجلسة ملغاة، فلا يُسجَّل حضورها', 409, 'cancelled');
  const marks = cleanMarks(b.marks);
  if (!marks.length) throw new Fail('لا تغيير للحفظ', 400, 'empty');
  if (marks.length > GROUP_MEMBERS_MAX * 2) throw new Fail('عدد كبير في حفظ واحد', 400, 'too_many');
  const note = String(b.note || '').trim().slice(0, 300);
  const started = Date.parse(g.starts_at) - 36e5 <= Date.now();
  const rows = new Map((await groupRows(g.id)).map((r) => [r.participant_id, r]));
  const now = new Date().toISOString();
  const actorType = by.expert ? 'system' : 'admin';
  const tag = by.expert ? { by: 'expert' } : {};
  const logs: AuditRow[] = [];
  const out: { id: string; result: 'marked' | 'already' | 'refused'; code?: string }[] = [];
  const noShows: Row[] = [];
  for (const m of marks) {
    const row = rows.get(m.id);
    const cur = groupMemberState(row);
    if (!row || cur === 'removed') { out.push({ id: m.id, result: 'refused', code: 'not_member' }); continue; }
    if (cur === m.state) { out.push({ id: m.id, result: 'already' }); continue; }
    if ((m.state === 'attended' || m.state === 'no_show') && !started) { out.push({ id: m.id, result: 'refused', code: 'too_early' }); continue; }
    if (by.expert && cur !== 'booked' && row.confirmed_by && row.confirmed_by !== by.email) { out.push({ id: m.id, result: 'refused', code: 'not_yours' }); continue; }
    const confirmed = m.state !== 'booked';
    // مشروط بالحالة كما قُرئت: حفظان معًا يكتب أحدهما وحده، والثاني «كما هو»
    // الملاحظة في سجل التدقيق وحده لا في صف المشارك: ورقة واحدة لعدة مدعوين، فلا يدخل ما كُتب عن أحدهم نسخة بيانات غيره.
    // والصف يأخذ موعد الجلسة ورابطها ومستشارها كما هي الآن: من اعتذر ثم أُعيد بعد تغيير الموعد لا يبقى على القديم
    const hit = (must(await db.from('coaching_sessions').update({ status: STATUS_OF[m.state], confirmed_by: confirmed ? by.email : null, confirmed_at: confirmed ? now : null, note: null, updated_at: now,
      starts_at: g.starts_at, ends_at: g.ends_at, join_url: g.mode === 'online' ? g.join_url || null : null, expert_id: g.expert_id || null })
      .eq('id', row.id).eq('status', row.status).select('id'), 'تعذّر حفظ الحضور') ?? []) as Row[];
    if (!hit.length) { out.push({ id: m.id, result: 'already' }); continue; }
    out.push({ id: m.id, result: 'marked' });
    logs.push({ actorType, actor: by.email, action: 'coaching.group-mark', entity: 'participants', entityId: m.id, before: { group_id: g.id, state: cur }, after: { group_id: g.id, state: m.state, ...(note ? { note } : {}), ...tag } });
    if (m.state === 'no_show') noShows.push(row);
  }
  await auditMany(logs);
  for (const s of noShows) await OB.record(s.participant_id, { code: 'coaching_no_show', ref: s.id, ...RULES.coaching_no_show(s) });
  const n = (k: string) => out.filter((x) => x.result === k).length;
  const left = activeRows(await groupRows(g.id)).filter((r) => groupMemberState(r) === 'booked').length;
  return { success: true, marked: n('marked'), already: n('already'), pending: left, refused: out.filter((x) => x.result === 'refused').map((x) => ({ id: x.id, code: x.code, message: GROUP_REFUSAL_AR[x.code as keyof typeof GROUP_REFUSAL_AR] })) };
}
export async function adminMark(a: any, b: Body) {
  return markGroup({ email: a.email }, await loadGroup(b.id), b);
}

// ── بوابة المستشار: جلساته الجماعية وحدها، وأسماء مدعويها وحدها ──
const NOT_YOURS = 'هذه الجلسة ليست من جلساتك';
export const expertSheetOpen = (g: Row, now = Date.now()) => g.status === 'scheduled' && Date.parse(g.starts_at) - 36e5 <= now && now <= Date.parse(g.ends_at) + GROUP_SHEET_DAYS * 864e5;
async function assignedGroup(e: any, id: unknown) {
  if (!(await groupsReady())) throw notReady();
  const gid = uuid(id);
  const g = gid ? (must(await db.from('coaching_groups').select('*').eq('id', gid).maybeSingle()) as Row | null) : null;
  // غير الموجودة وجلسة غيره برد واحد: لا يُعرف وجود جلسة بتجربة المعرّفات
  if (!g || g.expert_id !== e.id) throw new Fail(NOT_YOURS, 403, 'not_yours');
  return g;
}
/** جلساته القائمة: من 400 يوم مضت إلى القادم (لشهادة ساعاته)، صف واحد لكل جلسة بعدد مدعويها. البوابة تعرض الجارية منها */
export async function expertList(e: any) {
  if (!(await groupsReady())) return [];
  const since = new Date(Date.now() - 400 * 864e5).toISOString();
  const groups = (must(await db.from('coaching_groups').select('*').eq('expert_id', e.id).eq('status', 'scheduled').gte('starts_at', since).order('starts_at', { ascending: false }).limit(200)) ?? []) as Row[];
  if (!groups.length) return [];
  const ids = groups.map((g) => g.id);
  // group-once-exempt: صفوف جلساته الجماعية بمعرّفاتها لعدّ مدعوي كل جلسة، لا جمع لساعاته
  const rows = (must(await db.from('coaching_sessions').select('group_id, participant_id, status, confirmed_at').in('group_id', ids)) ?? []) as Row[];
  const cohorts = (must(await db.from('cohorts').select('id, name').in('id', [...new Set(groups.map((g) => g.cohort_id).filter(Boolean))])) ?? []) as Row[];
  const cOf = new Map(cohorts.map((c) => [c.id, c.name]));
  const now = Date.now();
  return groups.map((g) => {
    const s = summary(g, rows.filter((r) => r.group_id === g.id), now);
    return { id: g.id, title: g.title_ar, starts_at: g.starts_at, ends_at: g.ends_at, mode: g.mode, location: g.mode === 'in_person' ? g.location_ar : null, join_url: g.mode === 'online' && !s.ended ? g.join_url : null,
      cohort: cOf.get(g.cohort_id) || '', ended: s.ended, count: s.count, attended: s.attended, no_show: s.no_show, excused: s.excused, pending: s.pending, awaiting: s.awaiting, sheet: expertSheetOpen(g, now) };
  });
}
/** ورقة جلسته (xp.coaching-group): الاسم والحالة وحدهما. locked: أكّده غيره فلا يغيّره */
export async function expertSheet(e: any, b: Body) {
  const g = await assignedGroup(e, b.id);
  // مدعوو جلسة بعينها بمعرّفها. حساب العرض لا يكون عضوًا فيها (classify يرفضه)، وحساب الاختبار يظهر باسمه كما في قوائم التشغيل
  const rows = (must(await db.from('coaching_sessions').select('*, participants(full_name)').eq('group_id', g.id)) ?? []) as Row[];
  return {
    success: true, sheet: expertSheetOpen(g),
    session: { id: g.id, title: g.title_ar, starts_at: g.starts_at, ends_at: g.ends_at, mode: g.mode, location: g.mode === 'in_person' ? g.location_ar : null },
    people: activeRows(rows).map((r) => ({ id: r.participant_id, full_name: r.participants?.full_name || '', state: groupMemberState(r), ...(r.confirmed_by && r.confirmed_by !== e.email && groupMemberState(r) !== 'booked' ? { locked: true } : {}) }))
      .sort((x, y) => x.full_name.localeCompare(y.full_name, 'ar')),
  };
}
export async function expertMark(e: any, b: Body) {
  const g = await assignedGroup(e, b.id);
  if (!expertSheetOpen(g)) throw new Fail(`ورقة الحضور تُفتح قبل الجلسة بساعة وتبقى ${GROUP_SHEET_DAYS} أيام بعدها. بعد ذلك يسجّل الحضور فريق الإدارة`, 403, 'sheet_closed');
  return markGroup({ email: e.email, expert: true }, g, b);
}

// ── «ينتظرني» (القرار 9): جلسة جماعية مضى على نهايتها يومان وفيها من لم يؤكَّد حضوره. بند واحد للجلسة لا لكل مدعو ──
export async function inboxRows(now = Date.now()) {
  if (!(await groupsReady())) return [];
  const cutoff = new Date(now - GROUP_INBOX_DAYS * 864e5).toISOString();
  // من الصفوف غير المؤكَّدة لا من الجلسات: جلسات قديمة مؤكَّدة كلها لا تملأ حد القراءة وتحجب ما ينتظر
  // group-once-exempt: صفوف غير المؤكَّدين في الجلسات الجماعية لعدّهم لكل جلسة، لا جمع لخبير
  const open = (must(await db.from('coaching_sessions').select('group_id, ends_at').not('group_id', 'is', null).in('status', ['booked', 'requested']).lt('ends_at', cutoff).order('ends_at', { ascending: true }).limit(2000)) ?? []) as Row[];
  const left: Record<string, number> = {};
  for (const r of open) left[r.group_id] = (left[r.group_id] || 0) + 1;
  const ids = Object.keys(left);
  if (!ids.length) return [];
  const groups = (must(await db.from('coaching_groups').select('id, title_ar, ends_at').in('id', ids).eq('status', 'scheduled').order('ends_at', { ascending: true }).limit(100)) ?? []) as Row[];
  return groups.map((g) => ({ id: g.id, title: g.title_ar, sub: left[g.id] === 1 ? 'مدعو واحد بلا تأكيد' : `${left[g.id]} مدعوين بلا تأكيد`, at: g.ends_at }));
}
