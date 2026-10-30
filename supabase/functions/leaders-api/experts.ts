// ════════════════════════════════════════════════════════════════
// الخبراء: طلب الانضمام، والدعوة، والاعتماد، والملف في لوحة الإدارة
// ════════════════════════════════════════════════════════════════
// ملف واحد للشخص بعدة أدوار. لا يعمل خبير قبل اعتماده (active)، وسعر الساعة
// والملاحظة الداخلية للإدارة وحدها: expertPublic يحذفهما من كل رد لغيرها.
import { mailButton, mailShell, mailText } from '../_shared/mail.ts';
import { SITES } from '../_shared/sites.js';
import { audit, CONFIG, db, Fail, must, sendMail } from './core.ts';
import { requireWrite } from './admin.ts';
import { cleanExpert, expertStats, isEmail, normalizeEmail, normalizePhone } from './logic.js';
import { EXPERT_STATUS } from './labels.js';

type Body = Record<string, any>;
type Ctx = { ip: string | null };
type Admin = import('./admin.ts').Admin;

const shell = (title: string, body: string) => mailShell(title, body, { eyebrow: 'EXPERT NETWORK' });
const firstName = (n: string | null) => String(n || '').trim().split(/\s+/)[0] || '';

// ── طلب الانضمام (مفتوح) ──
// بريد واحد لملف واحد، وحد لكل شبكة في الساعة، ولا يكشف الرد إن كان البريد مسجلًا
export async function apply(b: Body, ctx: Ctx) {
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('البريد الإلكتروني غير صحيح');
  const fields = cleanExpert(b);
  if (!fields.full_name || fields.full_name.length < 3) throw new Fail('اكتب اسمك الكامل');
  if (!fields.roles.length) throw new Fail('اختر دورًا واحدًا على الأقل');
  if (!fields.dimensions.length) throw new Fail('اختر بُعدًا واحدًا على الأقل من أبعاد البرنامج');
  if (!fields.bio || fields.bio.length < 80) throw new Fail('عرّف بخبرتك في 80 حرفًا على الأقل');
  const phone = b.phone ? normalizePhone(b.phone) : null;
  if (b.phone && !phone) throw new Fail('رقم الجوال غير صحيح');
  if (ctx.ip) {
    const { count } = await db.from('experts').select('id', { count: 'exact', head: true })
      .eq('applied_ip', ctx.ip).gte('created_at', new Date(Date.now() - 36e5).toISOString());
    if ((count ?? 0) >= 5) throw new Fail('طلبات كثيرة من هذه الشبكة، حاول بعد ساعة', 429, 'rate');
  }
  const { data: exists } = await db.from('experts').select('id').eq('email', email).maybeSingle();
  if (exists) return { success: true, received: true };
  const row = must(await db.from('experts').insert({ ...fields, email, phone, status: 'applied', source: 'application', applied_ip: ctx.ip }).select('id').single()) as any;
  await audit('system', email, 'expert.apply', 'experts', row.id);
  sendMail(email, 'وصل طلب انضمامك إلى شبكة الخبراء', shell(`شكرًا ${firstName(fields.full_name)}`,
    mailText('وصلنا طلب انضمامك إلى شبكة خبراء برنامج القادة. نراجع الطلبات خلال خمسة أيام عمل، ونراسلك بالنتيجة على هذا البريد.'))).catch(() => {});
  if (CONFIG.alertEmail) {
    sendMail(CONFIG.alertEmail, `طلب انضمام خبير: ${fields.full_name}`, shell('طلب انضمام خبير جديد',
      mailText(`${fields.full_name}${fields.title ? ` · ${fields.title}` : ''}`) + mailButton(`${SITES.admin}/#/leaders/experts`, 'راجع الطلب'))).catch(() => {});
  }
  return { success: true, received: true };
}

// ── لوحة الإدارة ──
export async function adminList() {
  const [rows, { data: sessions }] = await Promise.all([
    db.from('experts').select('*').order('created_at', { ascending: false }).limit(500).then((r) => must(r) as any[]),
    db.from('coaching_sessions').select('expert_id, participant_id, status, starts_at, ends_at').not('expert_id', 'is', null).limit(5000),
  ]);
  const by: Record<string, any[]> = {};
  for (const x of sessions || []) (by[x.expert_id] ||= []).push(x);
  return { success: true, experts: rows.map((e) => ({ ...e, stats: expertStats(by[e.id] || [], e.hourly_rate) })) };
}

export async function adminGet(_a: Admin, b: Body) {
  const e = must(await db.from('experts').select('*').eq('id', String(b.id || '')).maybeSingle());
  if (!e) throw new Fail('الخبير غير موجود', 404);
  const count = (t: string) => db.from(t).select('participant_id', { count: 'exact', head: true }).eq('reviewed_by', e.email);
  const [{ data: log }, { data: sessions }, reqs, models, caps] = await Promise.all([
    db.from('audit_log').select('actor, action, created_at').eq('entity', 'experts').eq('entity_id', e.id).order('created_at', { ascending: false }).limit(30),
    db.from('coaching_sessions').select('id, participant_id, status, starts_at, ends_at, participants(full_name)').eq('expert_id', e.id).order('starts_at', { ascending: false }).limit(500),
    count('participant_requirements'), count('model_submissions'), count('capstones'),
  ]);
  // المراجعات تُنسب بالبريد: المستشار يراجع من حسابه في لوحة الإدارة بالبريد نفسه
  const reviews = { requirements: reqs.count ?? 0, models: models.count ?? 0, capstones: caps.count ?? 0 };
  return {
    success: true, expert: e, activity: log || [],
    service: { ...expertStats(sessions || [], e.hourly_rate), reviews, recent: (sessions || []).slice(0, 12) },
  };
}

// إضافة خبير من الإدارة (يُدعى) أو تعديل ملف قائم
export async function adminSave(a: Admin, b: Body) {
  requireWrite(a);
  const fields = cleanExpert(b, { withAdmin: true });
  if (!fields.full_name || fields.full_name.length < 3) throw new Fail('اكتب اسم الخبير');
  const phone = b.phone ? normalizePhone(b.phone) : null;
  if (b.phone && !phone) throw new Fail('رقم الجوال غير صحيح');
  const now = new Date().toISOString();
  if (b.id) {
    const before = must(await db.from('experts').select('*').eq('id', String(b.id)).maybeSingle());
    if (!before) throw new Fail('الخبير غير موجود', 404);
    const saved = must(await db.from('experts').update({ ...fields, phone, updated_at: now }).eq('id', before.id).select('*').single());
    await audit('admin', a.email, 'expert.update', 'experts', saved.id, before, saved);
    return { success: true, expert: saved };
  }
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('بريد الخبير غير صحيح');
  const { data: dup } = await db.from('experts').select('id, status').eq('email', email).maybeSingle();
  if (dup) throw new Fail(`لهذا البريد ملف خبير قائم (${(EXPERT_STATUS as Record<string, string>)[dup.status] || dup.status})`, 409);
  const saved = must(await db.from('experts').insert({ ...fields, email, phone, status: 'invited', source: 'admin', invited_at: now }).select('*').single());
  await audit('admin', a.email, 'expert.create', 'experts', saved.id, null, saved);
  if (b.send_invite !== false) await invite(saved);
  return { success: true, expert: saved, invited: b.send_invite !== false };
}

async function invite(e: any) {
  await sendMail(e.email, 'دعوة إلى شبكة خبراء برنامج القادة', shell(`أهلًا ${firstName(e.full_name)}`,
    mailText('يسعدنا أن ندعوك للانضمام إلى شبكة خبراء برنامج القادة، لتقديم خبرتك لقادة المشاريع في مراحل البرنامج.')
    + mailText('ستصلك تفاصيل الدخول إلى لوحة الخبير حين تُفعَّل، ومعها مواعيد الدفعة.')));
  await db.from('experts').update({ invited_at: new Date().toISOString() }).eq('id', e.id);
}

export async function adminInvite(a: Admin, b: Body) {
  requireWrite(a);
  const e = must(await db.from('experts').select('*').eq('id', String(b.id || '')).maybeSingle());
  if (!e) throw new Fail('الخبير غير موجود', 404);
  if (['suspended', 'rejected'].includes(e.status)) throw new Fail('غيّر حالة الخبير أولًا ثم أعد الدعوة');
  await invite(e);
  await audit('admin', a.email, 'expert.invite', 'experts', e.id);
  return { success: true };
}

// الاعتماد والإيقاف والرفض: الانتقالات المسموحة فقط، ورسالة للخبير عند الاعتماد أو الرفض
const MOVES: Record<string, string[]> = {
  applied: ['active', 'rejected'], invited: ['active', 'rejected'], active: ['paused', 'suspended'],
  paused: ['active', 'suspended'], suspended: ['active'], rejected: ['active'],
};
export async function adminSetStatus(a: Admin, b: Body) {
  requireWrite(a);
  const e = must(await db.from('experts').select('*').eq('id', String(b.id || '')).maybeSingle());
  if (!e) throw new Fail('الخبير غير موجود', 404);
  const to = String(b.status || '');
  if (!(MOVES[e.status] || []).includes(to)) throw new Fail('لا يمكن نقل الخبير إلى هذه الحالة من حالته الآن');
  if (to === 'active' && !e.roles?.length) throw new Fail('حدّد دورًا واحدًا على الأقل قبل الاعتماد');
  const now = new Date().toISOString();
  const patch: Body = { status: to, updated_at: now, ...(to === 'active' && !e.approved_at ? { approved_by: a.email, approved_at: now } : {}) };
  const saved = must(await db.from('experts').update(patch).eq('id', e.id).select('*').single());
  await audit('admin', a.email, `expert.${to}`, 'experts', e.id, { status: e.status }, { status: to, reason: b.reason || null });
  if (to === 'active' && ['applied', 'invited', 'rejected'].includes(e.status)) {
    sendMail(e.email, 'اعتُمدت في شبكة خبراء برنامج القادة', shell(`مرحبًا بك ${firstName(e.full_name)}`,
      mailText('اعتُمد ملفك في شبكة خبراء برنامج القادة. ستصلك طلبات الخدمة المناسبة لأدوارك وتخصصك، ونرسل لك تفاصيل لوحة الخبير قريبًا.'))).catch(() => {});
  }
  if (to === 'rejected' && e.status === 'applied') {
    sendMail(e.email, 'بخصوص طلب انضمامك إلى شبكة الخبراء', shell(`شكرًا ${firstName(e.full_name)}`,
      mailText('نقدّر اهتمامك بالانضمام إلى شبكة خبراء برنامج القادة. لا تتوافق احتياجات الدفعة الحالية مع ملفك، وسنحتفظ به لدفعات قادمة.'))).catch(() => {});
  }
  return { success: true, expert: saved };
}
