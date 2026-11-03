// ════════════════════════════════════════════════════════════════
// الدفع عبر Creem: الاستحقاق، وصفحة الدفع، والإشعار الموقّع، ولوحة الإدارة
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لما يحق للمشارك: access(). الحق يأتي من:
//   الجهة الراعية (organization_id، حيًا بلا تخزين) · حساب العرض · الدفع مطفأ · سجل entitlements (دفع، منحة، إعفاء).
// الحساب أولًا ثم الدفع: صفحة الدفع تُنشأ من الخادم باسم المشارك ومعرّفه، والحق لا يُكتب إلا من إشعار Creem
// الموقّع (لا من عودة المتصفح)، والإشعار يُسجَّل بمعرّفه فلا يُحتسب مرتين.
// المفاتيح من أسرار الدالة وحدها: CAREEM_SECRET_KEY (أو CREEM_API_KEY) وCAREEM_WEBHOOK_SECRET (أو CREEM_WEBHOOK_SECRET).
import { audit, CONFIG, db, Fail, must } from './core.ts';
import { requireWrite } from './admin.ts';

type Body = Record<string, any>;
type Item = 'assessment' | 'program';
export const ITEMS: Item[] = ['assessment', 'program'];
export const ITEM_AR: Record<Item, string> = { assessment: 'القياس المبدئي', program: 'إكمال البرنامج' };

const secret = (...names: string[]) => names.map((n) => Deno.env.get(n) || '').find(Boolean) || '';
const apiKey = () => secret('CREEM_API_KEY', 'CAREEM_SECRET_KEY');
const hookSecret = () => secret('CREEM_WEBHOOK_SECRET', 'CAREEM_WEBHOOK_SECRET');
// وضع المفتاح من بادئته: مفاتيح الاختبار تبدأ بـ creem_test_
export const modeOf = (k: string) => (k.startsWith('creem_test_') ? 'test' : 'live');
const apiBase = () => (modeOf(apiKey()) === 'test' ? 'https://test-api.creem.io' : 'https://api.creem.io');

export async function settings() {
  const { data } = await db.from('payment_settings').select('*').eq('id', true).maybeSingle();
  return data || { enabled: false, currency: 'USD', assessment_cents: 100, program_cents: 9900 };
}

// ── ما يحق للمشارك (المصدر الواحد) ──
export async function access(p: any) {
  const s = await settings();
  const free = (why: string) => ({ assessment: why, program: why });
  if (p.is_demo) return { enabled: s.enabled, ...free('demo'), prices: prices(s) };
  if (p.organization_id) return { enabled: s.enabled, ...free('sponsor'), prices: prices(s) };
  if (!s.enabled) return { enabled: false, ...free('free'), prices: prices(s) };
  const { data } = await db.from('entitlements').select('item, source').eq('participant_id', p.id).is('revoked_at', null);
  const has = (i: Item) => (data || []).find((x: any) => x.item === i)?.source || null;
  return { enabled: true, assessment: has('assessment'), program: has('program'), prices: prices(s) };
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
  const s: any = await settings();
  const product = item === 'program' ? s.program_product : s.assessment_product;
  if (!product || !apiKey()) throw new Fail('الدفع غير متاح الآن، حاول لاحقًا', 503, 'pay_off');
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

// ── منح الحق بعد دفع مؤكد (من الإشعار أو المطابقة) ──
async function settle(pay: any, obj: any) {
  if (pay.status === 'paid') return;
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
  const ev = JSON.parse(raw);
  const type = String(ev.eventType || ev.type || '');
  const obj = ev.object || ev.data || {};
  const { error: dup } = await db.from('payment_events').insert({ event_id: ev.id || null, type, payload: ev });
  if (dup?.code === '23505') return { success: true, duplicate: true };
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
    if (ev.id) await db.from('payment_events').update({ processed_at: new Date().toISOString() }).eq('event_id', ev.id);
  } catch (e) {
    if (ev.id) await db.from('payment_events').update({ error: String((e as Error).message || e).slice(0, 300) }).eq('event_id', ev.id);
    throw e;
  }
  return { success: true };
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

// ════════════════════════════════════════════════════════════════
// لوحة الإدارة: كل ما يلزم دون الرجوع إلى لوحة Creem
// ════════════════════════════════════════════════════════════════
type Admin = import('./admin.ts').Admin;

export async function adminOverview() {
  const s = await settings();
  const [{ data: pays }, { data: ents }, { data: evs }, { count: participants }] = await Promise.all([
    db.from('payments').select('id, participant_id, email, item, amount_cents, currency, status, mode, created_at, paid_at, refunded_at, checkout_id, order_id, note, participants(full_name, organization_id)')
      .order('created_at', { ascending: false }).limit(2000),
    db.from('entitlements').select('id, participant_id, item, source, created_at, revoked_at, granted_by, note, participants(full_name, email)').order('created_at', { ascending: false }).limit(5000),
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
    daily, payments: pays || [], entitlements: ents || [], events: evs || [],
  };
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
  const res = await fetch(`${apiBase()}/v1/checkouts?checkout_id=${encodeURIComponent(pay.checkout_id)}`, { headers: { 'x-api-key': apiKey() } });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Fail(`تعذّر الاستعلام من Creem (${res.status})`, 502);
  const status = String(out.status || '');
  if (status === 'completed') await settle(pay, out);
  else if (status === 'expired') await db.from('payments').update({ status: 'expired' }).eq('id', pay.id).eq('status', 'pending');
  await audit('admin', a.email, 'payment.reconcile', 'payments', pay.id, null, { status });
  return { success: true, status };
}
