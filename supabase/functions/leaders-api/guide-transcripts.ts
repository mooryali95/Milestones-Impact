// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد» H3: سجل المحادثات لتتبع أي مشكلة (قرار المالك v8)
// ════════════════════════════════════════════════════════════════
// من يقرأ النص: المالك دائمًا، والمدير الأعلى بمنح من المالك (guidance_transcript_grants)، ولا أحد غيرهما: لا مستشار
// الدفعة ولا المنسق ولا مدير بدور آخر. والصلاحية تُقرأ حية في كل طلب، فالسحب يسري فورًا.
// العامل الثاني لازم: الدخول برمز البريد وحده لا يقرأ نصًا، كما لا يعدّل (needsSecondFactor).
// كل فتح لمحادثة يُسجَّل في audit_log باسم القارئ والمشارك وعدد الرسائل، بلا النص. والقائمة أعداد بلا نص.
// المخفي (حذفه المشارك) يظهر هنا موسومًا بوقت إخفائه حتى تنقضي مدة الحفظ ويحذفه الحذف اليومي.
import { audit, db, Fail, publicDb } from './core.ts';
import type { Admin } from './admin.ts';
import { needsSecondFactor } from './admin.ts';
import { adminSave, appSettings } from './settings.ts';
import { GD } from './guide.ts';
import { requireAgentRead } from './agent-admin.ts';
import { evalSet, resetEvalGate, writeCases } from './guide-eval.ts';
import { applyCaseAdd } from './guide-eval.js';
import { redactInput } from '../agent-chat/redact.ts';

type Body = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TRANSCRIPT_LIST_MAX = 200;
export const TRANSCRIPT_MESSAGES_MAX = 1000;
export const READS_SHOWN = 30;
const missing = (e: any) => !!e && (['42P01', 'PGRST205', 'PGRST202', '42703', 'PGRST204'].includes(e.code) || /guidance_(transcript|conversations)|hidden_at/.test(String(e.message || '')));
const notMigrated = () => new Fail('سجل المحادثات لم يُرحَّل بعد (20261116180000)', 409, 'not_migrated');

// قابل للاستبدال في الاختبارات: قائمة المديرين من admin_users
export const GT = {
  superAdmins: async (): Promise<{ id: string; email: string; owner: boolean }[]> => {
    const { data, error } = await publicDb.from('admin_users').select('id, email, is_owner').eq('role_id', 'super_admin').eq('is_active', true);
    if (error) throw error;
    return (data || []).map((r: any) => ({ id: String(r.id), email: String(r.email || ''), owner: !!r.is_owner }));
  },
};

// هل يقرأ هذا المدير النص الآن؟ المالك دائمًا، والمدير الأعلى بمنح قائم. ويعيد السبب للواجهة
export async function access(a: Admin): Promise<{ can_read: boolean; reason: string | null; owner: boolean; ready: boolean }> {
  if (a.owner) return { can_read: !needsSecondFactor(a), reason: needsSecondFactor(a) ? 'mfa' : null, owner: true, ready: true };
  if (a.role !== 'super_admin') return { can_read: false, reason: 'role', owner: false, ready: true };
  const { data, error } = await db.from('guidance_transcript_grants').select('admin_id').eq('admin_id', String(a.id || '')).maybeSingle();
  if (error) { if (missing(error)) return { can_read: false, reason: 'not_migrated', owner: false, ready: false }; throw error; }
  if (!data) return { can_read: false, reason: 'no_grant', owner: false, ready: true };
  if (needsSecondFactor(a)) return { can_read: false, reason: 'mfa', owner: false, ready: true };
  return { can_read: true, reason: null, owner: false, ready: true };
}

export const ACCESS_AR: Record<string, string> = {
  role: 'سجل المحادثات للمالك، وللمدير الأعلى بصلاحية يمنحها المالك.',
  no_grant: 'لم يمنحك المالك صلاحية الاطلاع على المحادثات.',
  mfa: 'الاطلاع على المحادثات يتطلب الدخول بمفتاح المرور أو تطبيق المصادقة.',
  not_migrated: 'سجل المحادثات لم يُرحَّل بعد.',
};

async function requireRead(a: Admin) {
  const r = await access(a);
  if (r.reason === 'not_migrated') throw notMigrated();
  if (!r.can_read) throw new Fail(ACCESS_AR[r.reason || 'role'], 403, r.reason === 'mfa' ? 'mfa_required' : 'transcripts_forbidden');
}

export async function accessState(a: Admin) {
  const r = await access(a);
  return { success: true, ...r, message: r.reason ? ACCESS_AR[r.reason] : null };
}

const since = async () => {
  const days = Number(((await appSettings()).guidance as any)?.retention_days) || 90;
  return { days, iso: new Date(GD.now() - days * 864e5).toISOString() };
};

// القائمة: محادثة لكل مشارك ضمن مدة الحفظ، بأعدادها وكلفتها واسمه وجهته. بلا نص، فلا تُسجَّل كل فتحة لها
export async function list(a: Admin) {
  await requireRead(a);
  const w = await since();
  const { data, error } = await db.rpc('guidance_conversations', { p_since: w.iso, p_limit: TRANSCRIPT_LIST_MAX });
  if (error) { if (missing(error)) throw notMigrated(); throw error; }
  const rows = (data || []) as any[];
  const ids = rows.map((r) => String(r.participant_id));
  const people = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 150) {
    // counting-exempt: أسماء أصحاب محادثات قائمة، وسؤال المساعد مغلق على حساب العرض (DEMO_BLOCKED)
    const { data: ps, error: pe } = await db.from('participants').select('id, full_name, email, organization_name').in('id', ids.slice(i, i + 150));
    if (pe) throw pe;
    for (const p of ps || []) people.set(String((p as any).id), p);
  }
  return {
    success: true, retention_days: w.days,
    conversations: rows.map((r) => {
      const p = people.get(String(r.participant_id)) || {};
      return {
        participant_id: r.participant_id, name: p.full_name || null, email: p.email || null, org: p.organization_name || null,
        asked: Number(r.asked) || 0, unsure: Number(r.unsure) || 0, confirmed: Number(r.confirmed) || 0, errors: Number(r.errors) || 0,
        usd: Math.round(Number(r.micros || 0) / 1e4) / 100, first_at: r.first_at, last_at: r.last_at, hidden: Number(r.hidden) || 0,
      };
    }),
  };
}

// المحادثة كاملة لمشارك واحد: كل رسالة بحكمها ونموذجها ورموزها وكلفتها، والمخفي موسومًا. كل فتح يُسجَّل
export async function transcript(a: Admin, b: Body) {
  await requireRead(a);
  const pid = String(b.participant_id || '');
  if (!UUID.test(pid)) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
  const w = await since();
  const { data, error } = await db.from('guidance_messages')
    .select('id, role, body, context, chapter_id, verdict, sources, model, input_tokens, cache_read_tokens, output_tokens, cost_micros, confirmed_at, hidden_at, created_at')
    .eq('participant_id', pid).gte('created_at', w.iso).order('created_at', { ascending: true }).limit(TRANSCRIPT_MESSAGES_MAX);
  if (error) { if (missing(error)) throw notMigrated(); throw error; }
  const { data: p } = await db.from('participants').select('full_name, email, organization_name').eq('id', pid).maybeSingle();
  const messages = (data || []).map((m: any) => ({ ...m, usd: m.cost_micros == null ? null : Math.round(Number(m.cost_micros) / 1e4) / 100 }));
  await audit('admin', a.email, 'guide.transcript-read', 'participants', pid, null, { messages: messages.length, hidden: messages.filter((m: any) => m.hidden_at).length, owner: !!a.owner });
  return {
    success: true, retention_days: w.days,
    participant: { id: pid, name: (p as any)?.full_name || null, email: (p as any)?.email || null, org: (p as any)?.organization_name || null },
    messages, truncated: messages.length >= TRANSCRIPT_MESSAGES_MAX,
  };
}

// ── منح المالك (للمالك وحده) ──
function requireOwner(a: Admin) {
  if (!a.owner) throw new Fail('منح الاطلاع على المحادثات للمالك وحده', 403, 'owner_only');
}

// المديرون الأعلون ومنح كل منهم، وآخر قراءات السجل (من قرأ محادثة من ومتى)
export async function grants(a: Admin) {
  requireOwner(a);
  const { data: g, error } = await db.from('guidance_transcript_grants').select('admin_id, admin_email, granted_by, granted_at');
  if (error) { if (missing(error)) return { success: true, ready: false, admins: [], reads: [] }; throw error; }
  const byId = new Map((g || []).map((r: any) => [String(r.admin_id), r]));
  const admins = (await GT.superAdmins()).filter((x) => !x.owner).map((x) => {
    const r: any = byId.get(x.id);
    return { id: x.id, email: x.email, granted: !!r, granted_by: r?.granted_by || null, granted_at: r?.granted_at || null };
  });
  const { data: reads, error: re } = await db.from('audit_log').select('actor, entity_id, after, created_at')
    .eq('action', 'guide.transcript-read').order('created_at', { ascending: false }).limit(READS_SHOWN);
  if (re) throw re;
  const ids = [...new Set((reads || []).map((r: any) => String(r.entity_id)))];
  const names = new Map<string, string>();
  if (ids.length) {
    // counting-exempt: أسماء لسطور سجل اطلاع قائمة، لا عدّ
    const { data: ps } = await db.from('participants').select('id, full_name').in('id', ids);
    for (const p of ps || []) names.set(String((p as any).id), (p as any).full_name || '');
  }
  return {
    success: true, ready: true, admins,
    reads: (reads || []).map((r: any) => ({ by: r.actor, participant_id: r.entity_id, name: names.get(String(r.entity_id)) || null, messages: r.after?.messages ?? null, at: r.created_at })),
  };
}

export async function grantSet(a: Admin, b: Body) {
  requireOwner(a);
  const id = String(b.admin_id || '');
  if (!UUID.test(id)) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
  const target = (await GT.superAdmins()).find((x) => x.id === id);
  if (!target) throw new Fail('ليس مديرًا أعلى نشطًا', 404, 'not_super');
  if (target.owner) throw new Fail('المالك يطّلع دائمًا ولا يحتاج منحًا', 400, 'is_owner');
  const on = b.on === true;
  if (on) {
    const { error } = await db.from('guidance_transcript_grants').upsert({ admin_id: id, admin_email: target.email, granted_by: a.email, granted_at: new Date(GD.now()).toISOString() }, { onConflict: 'admin_id' });
    if (error) { if (missing(error)) throw notMigrated(); throw error; }
  } else {
    const { error } = await db.from('guidance_transcript_grants').delete().eq('admin_id', id);
    if (error) { if (missing(error)) throw notMigrated(); throw error; }
  }
  await audit('admin', a.email, on ? 'guide.transcript-grant' : 'guide.transcript-revoke', 'admin_users', id, null, { email: target.email, on });
  return { success: true, admin_id: id, granted: on };
}

// ── H4: «رد غير دقيق» يصير حالة في مجموعة التقييم ──
// لمن يقرأ النص (المالك، والمدير الأعلى بمنحه) وبغلاف superWriter. السؤال يكتبه القارئ أو يعدّله قبل الحفظ، ويُزال منه
// ما يدل على صاحبه (scrubQuestion وredactInput)، ولا يُحفظ في المجموعة معرّف المشارك ولا اسمه، بل رقم الرسالة في السجل.
// الحالة تدخل مسودة المجموعة (أو مسودة جديدة من المعتمدة)، فتُسقط نجاح التقييم حتى يُعتمد ويُشغَّل من جديد.
export async function flagReply(a: Admin, b: Body) {
  await requireRead(a);
  const id = Number(b.message_id);
  if (!Number.isInteger(id) || id <= 0) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
  const { data: m, error } = await db.from('guidance_messages').select('id, participant_id, role, context, chapter_id').eq('id', id).maybeSingle();
  if (error) { if (missing(error)) throw notMigrated(); throw error; }
  if (!m || (m as any).role !== 'assistant') throw new Fail('الرسالة غير موجودة أو ليست ردًا للمساعد', 404, 'not_found');
  let where: any = { context: 'program' };
  if ((m as any).context === 'handbook' && (m as any).chapter_id) {
    const { data: mod } = await db.from('handbook_modules').select('dimension, chapter_key').eq('id', (m as any).chapter_id).maybeSingle();
    if (mod) where = { context: 'handbook', dimension: (mod as any).dimension, chapter_key: (mod as any).chapter_key };
  }
  const set = await evalSet();
  if (set.source !== 'db') throw new Fail('جدول المجموعة لم يُرحَّل بعد (20261116170000)', 409, 'not_migrated');
  const question = redactInput(String(b.question || '')).text;
  const r: any = applyCaseAdd(set.cases, {
    ...where, kind: b.kind, question, level: b.level, reference_ar: b.reference_ar,
    must_include: b.must_include, must_not_include: b.must_not_include, source: `رد غير دقيق في المحادثات (رقم ${id})`,
  });
  if (!r.ok) throw new Fail(String(r.error), 400, 'invalid');
  const version = await writeCases(a, set, r.cases);
  await audit('admin', a.email, 'guide.reply-flag', 'guidance_messages', String(id), null, { case_id: r.id, version, kind: r.cases.at(-1).kind });
  return { success: true, case_id: r.id, version, new_draft: version !== set.version };
}

// ── H4: توجيهات المالك للمساعد (guidance.extra_rules)، تُحفظ بمسار الإعدادات نفسه فتُسجَّل قبل وبعد ──
export async function rulesSave(a: Admin, b: Body) {
  requireAgentRead(a);
  const r = await adminSave(a, { group: 'guidance', values: { extra_rules: String(b.extra_rules ?? '') } });
  resetEvalGate();
  return { success: true, saved: !!(r as any)?.success };
}
