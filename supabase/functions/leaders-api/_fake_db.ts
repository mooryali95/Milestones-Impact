// قاعدة في الذاكرة لاختبارات Deno (طابور البريد وتنفيذ الحذف): تصفية eq وneq وis وnot وin وlt وgte وlte، وترتيب بأكثر من عمود،
// وlimit والعدّ، والإدراج والتحديث والحذف، وكل كتابة تُسجَّل. fail: جدول وأعمدة يُرفض بها الطلب (ترحيل لم يُطبَّق)
import { db } from './core.ts';

type Row = Record<string, any>;
export type Write = { table: string; kind: 'insert' | 'update' | 'delete' | 'upsert'; value?: any; ids?: string[] };
export type FakeOpts = {
  fail?: (table: string, op: { kind: string; cols?: string; value?: any }) => { code?: string; message: string } | null;
  // أثر القيود بعد الحذف (on delete set null مثلًا)
  onDelete?: (table: string, rows: Row[], tables: Record<string, Row[]>) => void;
  // دوال القاعدة (db.rpc). erasure_purge محاكاة افتراضيًا: الشهادات ثم الصف في معاملة واحدة، ولا صف = P0002 بلا أثر
  rpc?: (name: string, args: any, tables: Record<string, Row[]>) => { data: unknown; error: { code?: string; message: string } | null } | null;
};

export function installFake(tables: Record<string, Row[]>, opts: FakeOpts = {}) {
  const writes: Write[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const orders: [string, boolean][] = [];
    let single = false, head = false, limit = Infinity, cols = '*', returning = false;
    let op: { kind: 'select' | 'insert' | 'update' | 'upsert' | 'delete'; value?: any } = { kind: 'select' };
    const run = () => {
      const rows = tables[table] || (tables[table] = []);
      const err = opts.fail?.(table, { kind: op.kind, cols, value: op.value });
      if (err) return { data: null, error: err, count: null };
      if (op.kind === 'insert' || op.kind === 'upsert') {
        writes.push({ table, kind: op.kind, value: op.value });
        const added = (Array.isArray(op.value) ? op.value : [op.value]).map((v: Row) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...structuredClone(v) }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op.kind === 'update') { writes.push({ table, kind: 'update', value: op.value, ids: hit.map((r) => r.id) }); hit.forEach((r) => Object.assign(r, structuredClone(op.value))); }
      if (op.kind === 'delete') {
        writes.push({ table, kind: 'delete', ids: hit.map((r) => r.id) });
        tables[table] = rows.filter((r) => !hit.includes(r));
        opts.onDelete?.(table, hit, tables);
        return { data: returning ? hit : null, error: null };
      }
      if (head) return { data: null, count: hit.length, error: null };
      const sorted = [...hit].sort((a, b) => {
        for (const [c, asc] of orders) { const x = String(a[c] ?? ''), y = String(b[c] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1); }
        return 0;
      });
      const out = sorted.slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null, count: hit.length };
    };
    const inList = (v: unknown) => String(v).replace(/^\(|\)$/g, '').split(',');
    const q: any = {
      select: (c?: string, o?: any) => { if (op.kind !== 'select') returning = true; else cols = c || '*'; if (o?.head) head = true; return q; },
      order: (c: string, o?: { ascending?: boolean }) => { orders.push([c, o?.ascending !== false]); return q; },
      limit: (n: number) => { limit = n; return q; }, range: () => q,
      insert: (v: any) => { op = { kind: 'insert', value: v }; return q; },
      upsert: (v: any) => { op = { kind: 'upsert', value: v }; return q; },
      update: (v: any) => { op = { kind: 'update', value: v }; return q; },
      delete: () => { op = { kind: 'delete' }; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      not: (c: string, o: string, v: unknown) => {
        if (o === 'is') filters.push((r) => (r[c] ?? null) !== v);
        else if (o === 'in') filters.push((r) => !inList(v).includes(String(r[c])));
        else filters.push((r) => r[c] !== v);
        return q;
      },
      lt: (c: string, v: string) => { filters.push((r) => String(r[c]) < v); return q; },
      gte: (c: string, v: string) => { filters.push((r) => r[c] != null && String(r[c]) >= v); return q; },
      lte: (c: string, v: string) => { filters.push((r) => r[c] != null && String(r[c]) <= v); return q; },
      maybeSingle: () => { single = true; return q; }, single: () => { single = true; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve().then(run).then(ok, bad),
    };
    return q;
  };
  const rpc = (name: string, args: any) => Promise.resolve().then(() => {
    const err = opts.fail?.(`rpc:${name}`, { kind: 'rpc', value: args });
    if (err) return { data: null, error: err };
    const own = opts.rpc?.(name, args, tables);
    if (own) return own;
    if (name === 'erasure_purge') {
      // كالدالة في 20261116150000: الطلب القائم أولًا، ثم الدفعة المعلّقة، ثم الإغلاق وسجل الدفع والشهادات والصف
      const req = (tables.erasure_requests || []).find((r) => r.id === args.p_request && r.participant_id === args.p_participant && r.status === 'pending');
      if (!req) return { data: null, error: { code: 'P0003', message: 'erasure_purge: request not pending' } };
      const pays = () => (tables.payments || []).filter((x) => x.participant_id === args.p_participant);
      if (pays().some((x) => x.status === 'pending')) return { data: null, error: { code: 'P0004', message: 'erasure_purge: pending payment' } };
      const hit = (tables.participants || []).filter((r) => r.id === args.p_participant && !r.is_demo);
      if (!hit.length) return { data: null, error: { code: 'P0002', message: 'erasure_purge: participant not found' } };
      Object.assign(req, { status: 'done', decided_at: new Date().toISOString(), decided_by: args.p_by, email_hash: args.p_email_hash, reason: null });
      writes.push({ table: 'erasure_requests', kind: 'update', ids: [req.id] });
      if (tables.payments) tables.payments = tables.payments.filter((x) => !(x.participant_id === args.p_participant && ['failed', 'expired'].includes(x.status)));
      for (const x of pays()) Object.assign(x, { customer_name: null, note: null, admin_note: null });
      writes.push({ table: 'certificates', kind: 'delete', ids: (tables.certificates || []).filter((c) => c.participant_id === args.p_participant).map((c) => c.id) });
      tables.certificates = (tables.certificates || []).filter((c) => c.participant_id !== args.p_participant);
      writes.push({ table: 'participants', kind: 'delete', ids: hit.map((r) => r.id) });
      tables.participants = tables.participants.filter((r) => !hit.includes(r));
      opts.onDelete?.('participants', hit, tables);
      return { data: 1, error: null };
    }
    return { data: null, error: { message: `rpc ${name} not faked` } };
  });
  const saved = { from: (db as any).from, schema: (db as any).schema, rpc: (db as any).rpc };
  Object.assign(db as any, { from, rpc, schema: () => ({ from, rpc }) });
  return { tables, writes, restore: () => { Object.assign(db as any, saved); } };
}

// الشبكة محاكاة: Resend يقبل (أو يرفض بحالته)، والرابط وسلاك يُسجَّلان ولا يخرج طلب حقيقي
export async function withNet<T>(fn: (calls: { url: string; body: any }[]) => Promise<T>, { resendStatus = 200, hookStatus = 200 } = {}) {
  const real = globalThis.fetch;
  const calls: { url: string; body: any }[] = [];
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    let body: any = null;
    try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = String(init?.body); }
    calls.push({ url: String(url), body });
    if (String(url).includes('resend.com')) return Promise.resolve(new Response(resendStatus === 200 ? '{"id":"re_1"}' : '{"message":"down"}', { status: resendStatus }));
    return Promise.resolve(new Response('ok', { status: hookStatus }));
  }) as typeof fetch;
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}
export const resendCalls = (calls: { url: string; body: any }[]) => calls.filter((c) => c.url.includes('resend.com'));
export const hoursAgo = (h: number, now = Date.now()) => new Date(now - h * 36e5).toISOString();
