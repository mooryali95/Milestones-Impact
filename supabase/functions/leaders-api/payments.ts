// ════════════════════════════════════════════════════════════════
// الدفع عبر Creem: الاستحقاق، وصفحة الدفع، والإشعار الموقّع، ولوحة الإدارة
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لما يحق للمشارك: access(). الحق يأتي من:
//   الجهة الراعية (organization_id، حيًا بلا تخزين) · حساب العرض · الدفع مطفأ · سجل entitlements (دفع، منحة، إعفاء).
// الحساب أولًا ثم الدفع: صفحة الدفع تُنشأ من الخادم باسم المشارك ومعرّفه، والحق لا يُكتب إلا من إشعار Creem
// الموقّع (لا من عودة المتصفح)، والإشعار يُسجَّل بمعرّفه فلا يُحتسب مرتين.
// المفاتيح من أسرار الدالة وحدها: CAREEM_SECRET_KEY (أو CREEM_API_KEY) وCAREEM_WEBHOOK_SECRET (أو CREEM_WEBHOOK_SECRET).
import { alertOps, audit, CONFIG, db, Fail, must, payReminderMail, sendMail } from './core.ts';
import { requireWrite } from './admin.ts';
import { ITEMS, pinSponsor, programPaymentDue, settings, type Item } from './entitlements.ts';

type Body = Record<string, any>;
export { ITEMS, settings };
export const ITEM_AR: Record<Item, string> = { assessment: 'القياس المبدئي', program: 'إكمال البرنامج' };

const secret = (...names: string[]) => names.map((n) => Deno.env.get(n) || '').find(Boolean) || '';
const apiKey = () => secret('CREEM_API_KEY', 'CAREEM_SECRET_KEY');
const hookSecret = () => secret('CREEM_WEBHOOK_SECRET', 'CAREEM_WEBHOOK_SECRET');
// وضع المفتاح من بادئته: مفاتيح الاختبار تبدأ بـ creem_test_
export const modeOf = (k: string) => (k.startsWith('creem_test_') ? 'test' : 'live');
const apiBase = () => (modeOf(apiKey()) === 'test' ? 'https://test-api.creem.io' : 'https://api.creem.io');

// ── ما يحق للمشارك (المصدر الواحد) ──
// الرعاية: جهة نشطة مرتبطة تُعفي، ويُثبَّت الإعفاء في السجل لحظة الربط (entitlements.ts) فيبقى إن أُوقفت الجهة بعدها؛
// والتثبيت هنا احتياط لمن رُبط قبل ذلك.
async function sponsorOf(p: any) {
  if (!p.organization_id) return null;
  const { data } = await db.from('organizations').select('id, name, short_name, status, contract_cents, show_value').eq('id', p.organization_id).maybeSingle();
  return data && data.status === 'active' ? data : null;
}

export async function access(p: any) {
  const s = await settings();
  const base = { enabled: !!s.enabled, prices: prices(s) };
  if (p.is_demo) return { ...base, assessment: 'demo', program: 'demo', sponsor: null, request: null };
  const org = await sponsorOf(p);
  const read = () => db.from('entitlements').select('item, source, organization_id, value_cents').eq('participant_id', p.id).is('revoked_at', null);
  let { data } = await read();
  // التثبيت مرة واحدة: حين يرتبط بجهة نشطة وينقصه أحد البندين
  if (org && ITEMS.some((i) => !(data || []).some((x: any) => x.item === i))) { await pinSponsor(p, org); ({ data } = await read()); }
  const has = (i: Item) => (data || []).find((x: any) => x.item === i)?.source || null;
  // اسم الراعي من الجهة الحية، أو من الإعفاء المثبَّت إن أُوقفت بعد ربطه
  const pinned = (data || []).find((x: any) => x.source === 'sponsor');
  const src: any = org || (pinned?.organization_id
    ? (await db.from('organizations').select('name, short_name, show_value').eq('id', pinned.organization_id).maybeSingle()).data : null);
  // القيمة المعروضة: المثبَّتة للمشارك (لا سعر الجهة الحالي)، وتُخفى إن طلبت الجهة
  const pinnedValue = (data || []).filter((x: any) => x.source === 'sponsor').reduce((t: number, x: any) => t + (x.value_cents || 0), 0);
  const sponsor = src ? { name: src.name, short_name: src.short_name || null, value_cents: src.show_value === false ? null : (pinnedValue || null) } : null;
  const { data: req } = sponsor ? { data: null } : await db.from('sponsor_requests').select('typed_name, status, reason').eq('participant_id', p.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const request = req && req.status !== 'cancelled' ? req : null;
  if (!s.enabled) return { ...base, assessment: has('assessment') || 'free', program: has('program') || 'free', sponsor, request };
  return { ...base, assessment: has('assessment'), program: has('program'), sponsor, request };
}
const prices = (s: any) => ({ currency: s.currency, assessment: s.assessment_cents, program: s.program_cents });

export async function requireAccess(p: any, item: Item) {
  const a: any = await access(p);
  if (!a[item]) throw new Fail(`${ITEM_AR[item]} يتطلب الدفع أولًا`, 402, `pay:${item}`);
}

// ── صفحة الدفع: تُنشأ لكل مشارك باسمه ومعرّفه ──
export async function checkout(p: any, b: Body) {
  const item: Item = b.item === 'program' ? 'program' : 'assessment';
  const a: any = await access(p);
  if (a[item]) return { success: true, entitled: true };
  if (item === 'program' && !a.assessment) throw new Fail('ابدأ بالقياس المبدئي أولًا', 409);
  // D04: يُدفع رسم البرنامج بعد اعتماد المسار، فيدفع المشارك وهو يعرف مساره
  if (item === 'program' && !APPROVED.includes(p.status)) throw new Fail('يُفتح دفع البرنامج بعد اعتماد مسارك، خلال يومي عمل من إنهاء القياس', 409, 'pay_wait_approval');
  const s: any = await settings();
  const product = item === 'program' ? s.program_product : s.assessment_product;
  if (!product || !apiKey()) throw new Fail('الدفع غير متاح الآن، حاول لاحقًا', 409, 'pay_off');
  // حد معقول: لا أكثر من خمس صفحات دفع في الساعة لكل مشارك
  const { count } = await db.from('payments').select('id', { count: 'exact', head: true }).eq('participant_id', p.id).gte('created_at', new Date(Date.now() - 36e5).toISOString());
  if ((count ?? 0) >= 5) throw new Fail('محاولات دفع كثيرة، حاول بعد ساعة', 429, 'rate');
  const pay = must(await db.from('payments').insert({
    participant_id: p.id, email: p.email, item, product_id: product, mode: modeOf(apiKey()),
    amount_cents: item === 'program' ? s.program_cents : s.assessment_cents, currency: s.currency,
  }).select('*').single()) as any;
  const res = await fetch(`${apiBase()}/v1/checkouts`, {
    method: 'POST', headers: { 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: product, request_id: pay.id,
      success_url: `${CONFIG.appUrl.replace(/\/$/, '')}/?paid=${item}`,
      customer: { email: p.email },
      metadata: { participant_id: p.id, item, payment_id: pay.id },
    }),
  });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok || !out.checkout_url) {
    await db.from('payments').update({ status: 'failed', note: `checkout ${res.status}` }).eq('id', pay.id);
    console.error('creem checkout', res.status, JSON.stringify(out).slice(0, 300));
    throw new Fail('تعذّر فتح صفحة الدفع، حاول بعد قليل', 502, 'pay_gateway');
  }
  await db.from('payments').update({ checkout_id: out.id }).eq('id', pay.id);
  await audit('participant', p.id, 'payment.checkout', 'payments', pay.id, null, { item });
  return { success: true, url: out.checkout_url };
}

// حالات المشارك بعد اعتماد مساره (D04)
export const APPROVED = ['placed', 'enrolled', 'completed'];

// ── إحكام إشعار الدفع (D04): لا يُمنح حق إلا بدفع يطابق ما طُلب، ولا يُعاد بعد استرداد ──
// وضع Creem في الحمولة: prod للحي، وما سواه (test وsandbox وlocal) تجريبي
export const eventMode = (m: unknown) => (m == null || m === '' ? null : ['prod', 'live', 'production'].includes(String(m)) ? 'live' : 'test');
// ما يمنع تسوية الدفع: المبلغ أقل من المطلوب، أو عملة أو منتج أو وضع آخر. الحقول من حمولة checkout.completed
// (object.order.amount وcurrency وproduct، وobject.product.id، وobject.mode). الغائب منها يُعد مخالفة لا تجاوزًا.
export function paidIssues(pay: any, obj: any): string[] {
  const issues: string[] = [];
  const amount = Number(obj?.order?.amount);
  if (!Number.isFinite(amount)) issues.push('بلا مبلغ');
  else if (pay.amount_cents != null && amount < Number(pay.amount_cents)) issues.push(`المبلغ ${amount} أقل من ${pay.amount_cents}`);
  const cur = String(obj?.order?.currency || '').toUpperCase();
  if (!cur) issues.push('بلا عملة');
  else if (pay.currency && cur !== String(pay.currency).toUpperCase()) issues.push(`العملة ${cur} لا ${pay.currency}`);
  const product = obj?.order?.product || obj?.product?.id || null;
  if (!product) issues.push('بلا منتج');
  else if (pay.product_id && product !== pay.product_id) issues.push(`المنتج ${product} لا ${pay.product_id}`);
  const mode = eventMode(obj?.mode);
  if (mode && pay.mode && mode !== pay.mode) issues.push(`الوضع ${mode} لا ${pay.mode}`);
  return issues;
}
// لا تسوية لدفعة مسوّاة أو مستردّة: إشعار مكرر بمعرّف جديد بعد الاسترداد كان يعيد الحق
export const settleable = (pay: any) => ['pending', 'expired', 'failed'].includes(pay?.status);

// ── منح الحق بعد دفع مؤكد (من الإشعار أو المطابقة) ──
async function settle(pay: any, obj: any) {
  if (!settleable(pay)) {
    if (pay.status === 'refunded') await audit('system', 'creem', 'payment.settle-refused', 'payments', pay.id, null, { reason: 'refunded' });
    return false;
  }
  const issues = paidIssues(pay, obj);
  if (issues.length) {
    // معلّقة للمراجعة: لا حق، وتنبيه فوري، والقرار للإدارة (منح يدوي أو استرداد من Creem)
    await db.from('payments').update({ note: `held: ${issues.join('؛ ')}`.slice(0, 300) }).eq('id', pay.id);
    await audit('system', 'creem', 'payment.held', 'payments', pay.id, null, { issues });
    await alertOps('payment_mismatch', { payment: pay.id, issues });
    return false;
  }
  const now = new Date().toISOString();
  await db.from('payments').update({
    status: 'paid', paid_at: now, order_id: obj?.order?.id || pay.order_id || null, customer_id: obj?.customer?.id || null,
    amount_cents: obj?.order?.amount ?? pay.amount_cents, currency: obj?.order?.currency || pay.currency,
  }).eq('id', pay.id);
  if (pay.participant_id) {
    const { error } = await db.from('entitlements').insert({ participant_id: pay.participant_id, item: pay.item, source: 'paid', payment_id: pay.id, granted_by: 'creem' });
    if (error && error.code !== '23505') throw error;
    await audit('system', 'creem', 'payment.paid', 'payments', pay.id, null, { item: pay.item });
  }
  return true;
}

async function revokeFor(pay: any, by: string) {
  await db.from('entitlements').update({ revoked_at: new Date().toISOString(), revoked_by: by }).eq('payment_id', pay.id).is('revoked_at', null);
}

// ── الإشعار: توقيع HMAC-SHA256 للجسم الخام بسرّ الإشعارات، في ترويسة creem-signature ──
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function sign(raw: string, key: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(raw)));
}
const same = (a: string, b: string) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

export async function webhook(raw: string, headers: Headers) {
  const key = hookSecret();
  if (!key) throw new Fail('webhook secret missing', 503, 'config');
  const got = (headers.get('creem-signature') || '').trim().toLowerCase();
  if (!got || !same(got, await sign(raw, key))) throw new Fail('bad signature', 401, 'signature');
  let ev: any;
  try { ev = JSON.parse(raw); } catch { throw new Fail('bad payload', 400, 'payload'); }
  const id = ev?.id ? String(ev.id) : '';
  if (!id) throw new Fail('event without id', 400, 'payload');
  const type = String(ev.eventType || ev.type || '');
  const obj = ev.object || ev.data || {};
  // صف الحدث يُحجز أولًا فلا يُعالَج مرتين. وإن سبق حجزه ولم تكتمل معالجته (فشلت)
  // تُعاد معالجته حين يعيد Creem الحدث نفسه، بدل الرد بأنه مكرر فيضيع الدفع.
  const { error: dup } = await db.from('payment_events').insert({ event_id: id, type, payload: ev });
  if (dup) {
    if (dup.code !== '23505') throw dup;
    const { data: prev } = await db.from('payment_events').select('processed_at').eq('event_id', id).maybeSingle();
    if (prev?.processed_at) return { success: true, duplicate: true };
  }
  try {
    if (type === 'checkout.completed') {
      const pay = await findPayment(obj);
      if (!pay) throw new Error('payment not found');
      await settle(pay, obj);
    } else if (type.startsWith('refund.') || type === 'dispute.created') {
      const pay = await findPayment(obj);
      if (pay) {
        await db.from('payments').update({ status: 'refunded', refunded_at: new Date().toISOString(), note: type }).eq('id', pay.id);
        await revokeFor(pay, 'creem');
        await audit('system', 'creem', 'payment.refunded', 'payments', pay.id);
      }
    }
    await db.from('payment_events').update({ processed_at: new Date().toISOString(), error: null }).eq('event_id', id);
  } catch (e) {
    await db.from('payment_events').update({ error: String((e as Error).message || e).slice(0, 300) }).eq('event_id', id);
    throw e;
  }
  return { success: true, ...(dup ? { retried: true } : {}) };
}

async function findPayment(obj: any) {
  const req = obj.request_id || obj.metadata?.payment_id || obj.checkout?.request_id || obj.checkout?.metadata?.payment_id;
  if (req) { const { data } = await db.from('payments').select('*').eq('id', req).maybeSingle(); if (data) return data; }
  const cid = obj.checkout?.id || (String(obj.id || '').startsWith('ch_') ? obj.id : null);
  if (cid) { const { data } = await db.from('payments').select('*').eq('checkout_id', cid).maybeSingle(); if (data) return data; }
  const oid = obj.order?.id || obj.order_id;
  if (oid) { const { data } = await db.from('payments').select('*').eq('order_id', oid).maybeSingle(); if (data) return data; }
  return null;
}

// ── تذكير من اعتُمد مساره ولم يُكمل التسجيل: بعد 3 أيام ثم 7 (D04)، من المهمة الساعية ──
// كل تذكير مرة واحدة، وأثره في audit_log (payment.reminder بيومه). يتوقف حين يدفع أو ترعاه جهة.
export const REMINDER_DAYS = [3, 7];
export async function payReminders(now = Date.now()) {
  const s: any = await settings();
  if (!s.enabled) return { sent: 0 };
  const { data: people } = await db.from('participants').select('id, full_name, email').eq('status', 'placed').eq('is_demo', false).limit(200);
  let sent = 0;
  for (const p of people || []) {
    const { data: pl } = await db.from('placements').select('approved_at').eq('participant_id', p.id).not('approved_at', 'is', null);
    const approved = Math.max(...(pl || []).map((x: any) => Date.parse(x.approved_at)).filter(Number.isFinite));
    if (!Number.isFinite(approved)) continue;
    const days = Math.floor((now - approved) / 864e5);
    const due = [...REMINDER_DAYS].reverse().find((d) => days >= d);
    if (!due || !p.email) continue;
    const { count } = await db.from('audit_log').select('id', { count: 'exact', head: true })
      .eq('action', 'payment.reminder').eq('entity_id', p.id).eq('after->>day', String(due));
    if (count) continue;
    if (!(await programPaymentDue(p.id))) continue;
    await audit('system', 'payments', 'payment.reminder', 'participants', p.id, null, { day: due });
    await sendMail(p.email, 'مسارك المعتمد بانتظارك', payReminderMail(p.full_name, days), [], { ref: `participant:${p.id}` }).catch((e) => console.error('pay reminder', e));
    sent++;
  }
  return { sent };
}

// ════════════════════════════════════════════════════════════════
// لوحة الإدارة: كل ما يلزم دون الرجوع إلى لوحة Creem
// ════════════════════════════════════════════════════════════════
type Admin = import('./admin.ts').Admin;

export async function adminOverview() {
  const s = await settings();
  const [{ data: pays }, { data: ents }, { data: evs }, { count: participants }] = await Promise.all([
    db.from('payments').select('id, participant_id, email, item, amount_cents, currency, status, mode, created_at, paid_at, refunded_at, checkout_id, order_id, note, participants(full_name, organization_id)')
      .order('created_at', { ascending: false }).limit(2000),
    db.from('entitlements').select('id, participant_id, item, source, organization_id, value_cents, created_at, revoked_at, granted_by, note, participants(full_name, email)').order('created_at', { ascending: false }).limit(5000),
    db.from('payment_events').select('type, received_at, processed_at, error').order('received_at', { ascending: false }).limit(20),
    db.from('participants').select('id', { count: 'exact', head: true }).eq('is_demo', false),
  ]);
  const live = (pays || []).filter((x: any) => x.mode === 'live');
  const paid = live.filter((x: any) => x.status === 'paid');
  const sum = (rows: any[]) => rows.reduce((t, x) => t + (x.amount_cents || 0), 0);
  const by = (i: Item) => paid.filter((x: any) => x.item === i);
  const payers = (i: Item) => new Set(by(i).map((x: any) => x.participant_id)).size;
  const days = [...Array(30)].map((_, i) => new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10));
  const daily = days.map((d) => ({ day: d, cents: sum(paid.filter((x: any) => String(x.paid_at).slice(0, 10) === d)) }));
  const key = apiKey();
  // قيمة ما غطّته كل جهة (بأسعار اليوم)، ومن دفع ثم ارتبط بجهة (قرار استرداد للإدارة)
  const liveEnts = (ents || []).filter((e: any) => !e.revoked_at);
  const sponsored: Record<string, { name: string; participants: Set<string>; cents: number }> = {};
  for (const e of liveEnts.filter((x: any) => x.source === 'sponsor')) {
    const g = (sponsored[e.organization_id || 'none'] ||= { name: e.note || 'جهة', participants: new Set(), cents: 0 });
    g.participants.add(e.participant_id);
    g.cents += e.value_cents ?? (e.item === 'program' ? s.program_cents : s.assessment_cents);
  }
  const sponsoredIds = new Set(liveEnts.filter((x: any) => x.source === 'sponsor').map((x: any) => x.participant_id));
  const review = paid.filter((x: any) => sponsoredIds.has(x.participant_id));
  return {
    success: true,
    settings: s,
    health: {
      api_key: !!key, mode: key ? modeOf(key) : null, webhook_secret: !!hookSecret(),
      webhook_url: `${CONFIG.url.replace(/\/$/, '')}/functions/v1/creem-webhook`,
      last_event: evs?.[0] || null, failed_events: (evs || []).filter((e: any) => e.error).length,
    },
    kpis: {
      revenue_cents: sum(paid), refunds_cents: sum(live.filter((x: any) => x.status === 'refunded')),
      assessment_paid: payers('assessment'), program_paid: payers('program'),
      conversion: payers('assessment') ? Math.round((payers('program') / payers('assessment')) * 100) : null,
      pending: live.filter((x: any) => x.status === 'pending').length, participants: participants ?? 0,
      grants: (ents || []).filter((e: any) => e.source === 'admin' && !e.revoked_at).length,
    },
    // القمع (D04): أنهى القياس، ثم اعتُمد مساره، ثم أكمل التسجيل بدفع أو رعاية
    funnel: await funnel(),
    daily, payments: pays || [], entitlements: ents || [], events: evs || [],
    sponsors: Object.entries(sponsored).map(([id, g]) => ({ id, name: g.name, participants: g.participants.size, cents: g.cents })).sort((a, b) => b.cents - a.cents),
    review,
  };
}

async function funnel() {
  const count = async (statuses: string[]) => (await db.from('participants').select('id', { count: 'exact', head: true }).eq('is_demo', false).in('status', statuses)).count ?? 0;
  const [assessed, approved] = await Promise.all([count(['pending_approval', ...APPROVED]), count(APPROVED)]);
  const { data: prog } = await db.from('entitlements').select('participant_id').eq('item', 'program').is('revoked_at', null);
  return { assessed, approved, enrolled: new Set((prog || []).map((x: any) => x.participant_id)).size };
}

export async function adminSettings(a: Admin, b: Body) {
  requireWrite(a);
  const cents = (v: any, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : d);
  const s: any = await settings();
  const patch = {
    enabled: b.enabled === true,
    assessment_product: String(b.assessment_product ?? s.assessment_product ?? '').trim() || null,
    program_product: String(b.program_product ?? s.program_product ?? '').trim() || null,
    assessment_cents: cents(b.assessment_cents, s.assessment_cents), program_cents: cents(b.program_cents, s.program_cents),
    updated_by: a.email, updated_at: new Date().toISOString(),
  };
  if (patch.enabled && (!apiKey() || !hookSecret() || !patch.assessment_product || !patch.program_product)) {
    throw new Fail('لا يُفعَّل الدفع قبل اكتمال المفتاح وسرّ الإشعارات ومعرّفي المنتجين', 409);
  }
  const saved = must(await db.from('payment_settings').update(patch).eq('id', true).select('*').single());
  await audit('admin', a.email, 'payment.settings', 'payment_settings', 'true', s, saved);
  return { success: true, settings: saved };
}

// منح أو سحب حق يدويًا (منحة، تعويض، خطأ دفع)
export async function adminGrant(a: Admin, b: Body) {
  requireWrite(a);
  const item: Item = b.item === 'program' ? 'program' : 'assessment';
  const pid = String(b.participant_id || '');
  if (b.revoke) {
    must(await db.from('entitlements').update({ revoked_at: new Date().toISOString(), revoked_by: a.email }).eq('participant_id', pid).eq('item', item).is('revoked_at', null));
    await audit('admin', a.email, 'entitlement.revoke', 'participants', pid, null, { item });
    return { success: true };
  }
  const { error } = await db.from('entitlements').insert({ participant_id: pid, item, source: 'admin', granted_by: a.email, note: b.note ? String(b.note).slice(0, 300) : null });
  if (error) throw new Fail(error.code === '23505' ? 'لدى المشارك هذا الحق' : 'تعذّر المنح', error.code === '23505' ? 409 : 500);
  await audit('admin', a.email, 'entitlement.grant', 'participants', pid, null, { item, note: b.note || null });
  return { success: true };
}

// مطابقة دفعة معلّقة مع Creem مباشرة (إن فات الإشعار)
export async function adminReconcile(a: Admin, b: Body) {
  requireWrite(a);
  const pay = must(await db.from('payments').select('*').eq('id', String(b.id || '')).maybeSingle()) as any;
  if (!pay?.checkout_id) throw new Fail('لا صفحة دفع لهذه العملية', 404);
  // المطابقة للمعلّق وحده (D04): المسوّى والمسترد والمنتهي قرارات قائمة لا تُعاد من هنا
  if (pay.status !== 'pending') throw new Fail(`هذه العملية ${pay.status}، والمطابقة للمعلّقة وحدها`, 409, 'not_pending');
  const res = await fetch(`${apiBase()}/v1/checkouts?checkout_id=${encodeURIComponent(pay.checkout_id)}`, { headers: { 'x-api-key': apiKey() } });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Fail(`تعذّر الاستعلام من Creem (${res.status})`, 502);
  const status = String(out.status || '');
  if (status === 'completed') await settle(pay, out);
  else if (status === 'expired') await db.from('payments').update({ status: 'expired' }).eq('id', pay.id).eq('status', 'pending');
  await audit('admin', a.email, 'payment.reconcile', 'payments', pay.id, null, { status });
  return { success: true, status };
}

// ── لوحة الجهة: المرعيون ومقاعدهم وقيمتهم وتقدّمهم وتكلفة من أكمل ──
export async function adminOrgFinance(_a: Admin, b: Body) {
  const id = String(b.id || '');
  const org = must(await db.from('organizations').select('id, name, seats, contract_cents, show_value, contract_starts, contract_ends, status').eq('id', id).maybeSingle()) as any;
  if (!org) throw new Fail('الجهة غير موجودة', 404);
  const s: any = await settings();
  const [{ data: ents }, { data: parts }] = await Promise.all([
    db.from('entitlements').select('participant_id, item, value_cents, currency, created_at, revoked_at').eq('organization_id', id).eq('source', 'sponsor'),
    db.from('participants').select('id, full_name, email, status, org_via, created_at, certificates(id)').eq('organization_id', id).eq('is_demo', false),
  ]);
  const pinned = new Map<string, any>();
  for (const e of (ents || []).filter((x: any) => !x.revoked_at)) {
    const g = pinned.get(e.participant_id) || { value: 0, since: e.created_at, currency: e.currency || null };
    g.value += e.value_cents || 0; if (e.created_at < g.since) g.since = e.created_at;
    pinned.set(e.participant_id, g);
  }
  // عملة الكشف: عملة التثبيت إن اتفقت القيم عليها، وإلا عملة الإعداد الحالية
  const currencies = new Set([...pinned.values()].map((g: any) => g.currency).filter(Boolean));
  const currency = currencies.size === 1 ? [...currencies][0] : s.currency || 'USD';
  // ترتيب الانضمام يحدد من دخل ضمن المقاعد ومن فوقها
  const rows = (parts || []).map((p: any) => ({
    id: p.id, full_name: p.full_name, email: p.email, status: p.status, via: p.org_via, joined: pinned.get(p.id)?.since || p.created_at,
    value_cents: pinned.get(p.id)?.value ?? null, certified: (p.certificates || []).length > 0,
  })).sort((x: any, y: any) => String(x.joined).localeCompare(String(y.joined)));
  rows.forEach((r: any, i: number) => { r.over_seats = org.seats != null && i >= org.seats; });
  const value = rows.reduce((t: number, r: any) => t + (r.value_cents || 0), 0);
  const certified = rows.filter((r: any) => r.certified).length;
  const by = (st: string[]) => rows.filter((r: any) => st.includes(r.status)).length;
  return {
    success: true, org, currency,
    list_cents: s.assessment_cents + s.program_cents,
    kpis: {
      participants: rows.length, seats: org.seats, over: rows.filter((r: any) => r.over_seats).length,
      value_cents: value, per_participant: rows.length ? Math.round(value / rows.length) : null,
      certified, per_certified: certified ? Math.round(value / certified) : null,
      funnel: { registered: rows.length, assessed: by(['pending_approval', 'placed', 'enrolled', 'completed']), journey: by(['placed', 'enrolled', 'completed']), certified },
    },
    rows,
  };
}
