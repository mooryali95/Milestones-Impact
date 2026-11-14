// ════════════════════════════════════════════════════════════════
// مركز البريد (للإدارة): الحصة، وصندوق «لم يُرسل»، وتشخيص عنوان، ورابط دخول يدوي
// ════════════════════════════════════════════════════════════════
// القراءة من العداد الموحد leaders.mail_events (D15) وطابور leaders.mail_queue. السجل بلا عناوين ولا متون:
// البحث بعنوان يمر ببصمته (addressHash)، والمتن يُقرأ من الطابور وحده (ما حُجب فانتظر).
import { all, audit, CONFIG, db, Fail, hash, must, randomCode, randomToken } from './core.ts';
import { isEmail } from './logic.js';
import { requireSuper, requireWrite } from './admin.ts';
import type { Admin } from './admin.ts';
import { addressHash, mailCounts, plainText, sendCounted } from '../_shared/mail.ts';
import { RETENTION_DAYS } from '../_shared/mail-budget.js';
import { BUDGET_AR, dailySeries, deliveryAr, diagnose, mailBudget, mailtoUrl, nextFreeAt, tally } from './mail-center.js';

type Body = Record<string, any>;
const isId = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const dayAgo = () => new Date(Date.now() - 864e5).toISOString();

// ── المزوّد (Resend): حالة النطاق والحصة كما يعلنها، وحالة تسليم رسالة. مفتاح للإرسال وحده يُعيد «غير متاح» ──
async function resend(path: string) {
  if (!CONFIG.resendKey) return { ok: false, status: 0, body: null as any, headers: {} as Record<string, string> };
  try {
    const r = await fetch(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${CONFIG.resendKey}` }, signal: AbortSignal.timeout(6000) });
    const headers: Record<string, string> = {};
    r.headers.forEach((v, k) => { if (/quota|ratelimit/i.test(k)) headers[k.toLowerCase()] = v; });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => null), headers };
  } catch (e) { console.error('resend read:', e); return { ok: false, status: 0, body: null as any, headers: {} }; }
}
async function providerStatus() {
  const r = await resend('/domains');
  if (!r.ok) return { readable: false, reason: r.status === 401 || r.status === 403 ? 'مفتاح المزوّد للإرسال وحده: حالة النطاق والتسليم تُقرأ بمفتاح كامل الصلاحية' : 'تعذّرت قراءة المزوّد الآن', domains: [], quota: r.headers, usage: null };
  const sender = String(CONFIG.mailFrom).match(/@([^>\s]+)/)?.[1]?.toLowerCase() || '';
  const domains = ((r.body?.data || []) as any[]).map((d) => ({ name: d.name, status: d.status, region: d.region || null, sender: sender === String(d.name).toLowerCase() || sender.endsWith(`.${String(d.name).toLowerCase()}`) }));
  // استهلاك الحساب كما يعدّه المزوّد نفسه (يشمل ما أُرسل من خارج المنصة)، إن أتاحه المفتاح
  const u = await resend('/usage');
  return { readable: true, reason: null, domains, quota: { ...r.headers, ...u.headers }, usage: u.ok ? flat(u.body) : null };
}
// أرقام رد المزوّد مسطّحة بمساراتها: صيغة الرد ليست عقدًا عندنا، فتُعرض كما هي ولا يُبنى عليها قرار
function flat(o: any, pre = '', out: Record<string, number> = {}, depth = 0): Record<string, number> {
  if (!o || typeof o !== 'object' || depth > 3) return out;
  for (const [k, v] of Object.entries(o)) {
    if (Object.keys(out).length >= 12) break;
    if (typeof v === 'number') out[pre + k] = v; else if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, `${pre}${k}.`, out, depth + 1);
  }
  return out;
}

// ── 1. الصفحة: الحصة الآن، وتوزيعها، والسلسلة اليومية، وصندوق «لم يُرسل» ──
export async function center(a: Admin) {
  // المراقب يرى الحصة والأعداد، ولا يرى عناوين المنتظرين (نص الرسالة وتشخيص العنوان مغلقان عليه في الموجّه)
  let writer = true;
  try { requireWrite(a); } catch { writer = false; }
  const since14 = new Date(Date.now() - 14 * 864e5).toISOString();
  const [counts, recent, queue, provider] = await Promise.all([
    mailCounts(db),
    all((f, t) => db.from('mail_events').select('*').gte('created_at', since14).order('created_at', { ascending: false }).range(f, t)).catch(() => [] as any[]),
    db.from('mail_queue').select('id, created_at, kind, to_email, subject, ref, attempts, last_error, sent_at, gave_up_at, reason')
      .is('sent_at', null).gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(200)
      .then((r: any) => (r.error ? db.from('mail_queue').select('id, created_at, kind, to_email, subject, ref, attempts, last_error, sent_at, gave_up_at').is('sent_at', null).order('created_at', { ascending: false }).limit(200).then((x: any) => x.data || []) : r.data || [])),
    providerStatus(),
  ]);
  const day = recent.filter((e: any) => e.created_at >= dayAgo());
  const sentDay = day.filter((e: any) => e.status === 'sent');
  const budget = mailBudget(counts ?? { sent: sentDay.length, nonCode: sentDay.filter((e: any) => e.kind !== 'code' && e.kind !== 'alert').length }, CONFIG.mailDailyCap);
  const lost = recent.filter((e: any) => e.status !== 'sent').slice(0, 100)
    .map((e: any) => ({ id: e.id, at: e.created_at, kind: e.kind, source: e.source, status: e.status, subject: e.subject || null, to_domain: e.to_domain, ref: e.ref }));
  return {
    success: true, counter_ok: counts != null, budget, budget_ar: BUDGET_AR[budget.state as keyof typeof BUDGET_AR],
    next_free_at: budget.remaining === 0 ? nextFreeAt(sentDay.map((e: any) => e.created_at)) : null,
    by_kind: tally(sentDay, 'kind'), by_source: tally(sentDay, 'source'),
    blocked_24h: day.filter((e: any) => e.status === 'blocked').length, failed_24h: day.filter((e: any) => e.status === 'failed').length,
    series: dailySeries(recent, 14),
    queue: (queue as any[]).map((m) => ({ ...m, to_email: writer ? m.to_email : null, state: m.gave_up_at ? (m.last_error === 'cancelled' ? 'cancelled' : m.last_error === 'stale' ? 'stale' : 'gave_up') : 'waiting' })),
    lost, provider, retention_days: RETENTION_DAYS, traceable: recent.length === 0 || recent.some((e: any) => 'to_hash' in e),
    alert_channel: !!Deno.env.get('LEADERS_ALERT_WEBHOOK'),
  };
}

// ── 2. «لماذا لم يصل البريد؟»: ما جرى لعنوان بعينه ──
export async function trace(a: Admin, b: Body) {
  requireWrite(a);
  const email = String(b.email || '').trim().toLowerCase();
  if (!isEmail(email)) throw new Fail('اكتب عنوان بريد صحيحًا');
  const h = await addressHash(email);
  const [ev, person, expert, coord, counts, waiting] = await Promise.all([
    db.from('mail_events').select('id, created_at, kind, source, status, resend_id, subject, ref').eq('to_hash', h).order('created_at', { ascending: false }).limit(40),
    db.from('participants').select('id, full_name, status, phone, last_login_at').eq('email', email).maybeSingle().then((r: any) => r.data),
    db.from('experts').select('id, full_name').eq('email', email).maybeSingle().then((r: any) => r.data),
    db.from('org_coordinators').select('id, full_name').eq('email', email).limit(1).maybeSingle().then((r: any) => r.data),
    mailCounts(db),
    db.from('mail_queue').select('id, created_at, subject, kind').eq('to_email', email).is('sent_at', null).is('gave_up_at', null).order('created_at', { ascending: false }).limit(10).then((r: any) => r.data || []),
  ]);
  const traceable = !ev.error;
  const events = (ev.data || []) as any[];
  // حالة التسليم عند المزوّد لآخر خمس رسائل خرجت
  const delivery: Record<string, string> = {};
  let deliveryReadable = true;
  for (const e of events.filter((x) => x.status === 'sent' && x.resend_id).slice(0, 5)) {
    const r = await resend(`/emails/${encodeURIComponent(e.resend_id)}`);
    if (r.ok && r.body?.last_event) delivery[e.resend_id] = String(r.body.last_event);
    else if (r.status === 401 || r.status === 403) { deliveryReadable = false; break; }
  }
  const budget = mailBudget(counts ?? {}, CONFIG.mailDailyCap);
  return {
    success: true, email, traceable, delivery_readable: deliveryReadable,
    account: { participant: person ? { id: person.id, full_name: person.full_name, status: person.status, phone: person.phone || null, last_login_at: person.last_login_at } : null, expert: expert ? { full_name: expert.full_name } : null, coordinator: coord ? { full_name: coord.full_name } : null },
    events: events.map((e) => ({ ...e, delivery: e.resend_id && delivery[e.resend_id] ? { event: delivery[e.resend_id], label: deliveryAr(delivery[e.resend_id])[0], tone: deliveryAr(delivery[e.resend_id])[1] } : null })),
    waiting, diagnosis: diagnose({ events, delivery, known: !!(person || expert || coord), budget, traceable }),
  };
}

// ── 3. صندوق «لم يُرسل»: قراءة المتن، وإرسال الآن، وإلغاء ──
const queued = async (id: unknown) => {
  if (!isId(id)) throw new Fail('بيانات ناقصة');
  const m = must(await db.from('mail_queue').select('*').eq('id', String(id)).maybeSingle()) as any;
  if (!m) throw new Fail('الرسالة غير موجودة', 404);
  return m;
};
export async function queueBody(a: Admin, b: Body) {
  requireWrite(a);
  const m = await queued(b.id);
  const text = plainText(m.html);
  return { success: true, id: m.id, to: m.to_email, subject: m.subject, html: m.html, text, mailto: mailtoUrl(m.to_email, m.subject, text) };
}
export async function queueSend(a: Admin, b: Body) {
  requireWrite(a);
  const m = await queued(b.id);
  if (m.sent_at) throw new Fail('أُرسلت من قبل', 409, 'done');
  // قرار صريح من المدير: يتجاوز حصة الإشعارات ويبقى تحت السقف الكلي
  const r = await sendCounted(db, m.to_email, m.subject, m.html, { kind: m.kind === 'notify' ? 'notify' : 'bulk', source: 'leaders-api', ref: m.ref, cap: CONFIG.mailDailyCap, key: CONFIG.resendKey, from: CONFIG.mailFrom, force: true });
  if (!r.ok) throw new Fail(r.reason === 'mail_cap' ? 'السقف اليومي ممتلئ: انسخ نص الرسالة وأرسلها بنفسك، أو انتظر تحرر الحصة' : 'تعذّر الإرسال الآن', r.reason === 'mail_cap' ? 429 : 502, r.reason);
  await db.from('mail_queue').update({ sent_at: new Date().toISOString(), gave_up_at: null, last_error: null }).eq('id', m.id);
  await audit('admin', a.email, 'mail.queue-send', 'mail_queue', m.id, null, { subject: m.subject });
  return { success: true };
}
// علّمها المدير «أرسلتها بنفسي» أو ألغاها: تخرج من الانتظار ولا تُرسل آليًّا
export async function queueCancel(a: Admin, b: Body) {
  requireWrite(a);
  const m = await queued(b.id);
  if (m.sent_at) throw new Fail('أُرسلت من قبل', 409, 'done');
  const patch = { gave_up_at: new Date().toISOString(), last_error: 'cancelled' };
  const { error } = await db.from('mail_queue').update({ ...patch, cancelled_by: a.email }).eq('id', m.id);
  if (error) must(await db.from('mail_queue').update(patch).eq('id', m.id));
  await audit('admin', a.email, 'mail.queue-cancel', 'mail_queue', m.id, null, { subject: m.subject, manual: !!b.manual });
  return { success: true };
}

// ── 4. رابط دخول يدوي: حين لا يصل البريد، يُنشئه المدير الأعلى ويرسله بواتساب. مرة واحدة ولمدة الرمز نفسها ──
export async function loginLink(a: Admin, b: Body) {
  requireSuper(a);
  if (!isId(b.participant_id)) throw new Fail('بيانات ناقصة');
  if (String(b.reason || '').trim().length < 5) throw new Fail('اكتب سبب إنشاء الرابط');
  const p = must(await db.from('participants').select('id, email, full_name, status, is_demo').eq('id', String(b.participant_id)).maybeSingle()) as any;
  if (!p) throw new Fail('المشارك غير موجود', 404);
  if (p.status === 'suspended') throw new Fail('الحساب موقوف');
  if (p.is_demo) throw new Fail('حساب العرض يُفتح من زر العرض');
  const link = randomToken(24);
  must(await db.from('email_challenges').insert({
    email: p.email, purpose: 'login', code_hash: await hash(randomCode() + randomToken(8)), link_token_hash: await hash(link),
    expires_at: new Date(Date.now() + CONFIG.codeMinutes * 6e4).toISOString(),
  }));
  await audit('admin', a.email, 'mail.login-link', 'participants', p.id, null, { reason: String(b.reason || '').slice(0, 200) || null });
  return { success: true, url: `${CONFIG.appUrl}/verify?e=${encodeURIComponent(p.email)}&t=${link}`, minutes: CONFIG.codeMinutes, full_name: p.full_name };
}
