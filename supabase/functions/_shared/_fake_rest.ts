// PostgREST في الذاكرة لاختبارات الدوال التي تنشئ عميل supabase-js بنفسها (send-otp وuser-api):
// fetch محاكاة كاملة، فلا يخرج طلب: القاعدة (SUPABASE_URL/rest/v1) جداول في الذاكرة، وTurnstile يقبل رمزًا واحدًا معروفًا،
// وResend يقبل (أو يرفض بحالته)، وأي عنوان آخر يُسجَّل ويُرد عليه 200.
// التصفية: eq وneq وgt وgte وlt وlte وis وin وlike وnot.<op> وor(...)، والترتيب وlimit والعدّ (Prefer: count=exact) والإدراج والتحديث والحذف.
type Row = Record<string, any>;
export type RestCall = { method: string; url: string; table?: string; body?: any };
export type RestOpts = {
  // رفض طلب بجدوله وفعله (GET/HEAD/POST/PATCH/DELETE): ترحيل لم يُطبَّق أو عطل مؤقت
  fail?: (table: string, method: string) => { code?: string; message: string } | null;
  // قيود فريدة: جدول وأعمدته، والتكرار 409 برمز 23505 كما في PostgreSQL
  unique?: Record<string, string[]>;
  turnstileToken?: string;
  resendStatus?: number;
};
export const GOOD_CAPTCHA = 'turnstile-good-token';

const likeRe = (v: string) => new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$');
const inList = (v: string) => v.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
const split = (t: string) => { const out: string[] = []; let d = 0, cur = ''; for (const ch of t) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; };
const str = (x: unknown) => (x === null || x === undefined ? null : typeof x === 'object' ? JSON.stringify(x) : String(x));

function test(op: string, v: string): (x: unknown) => boolean {
  if (op === 'eq') return (x) => str(x) === v;
  if (op === 'neq') return (x) => str(x) !== v;
  if (op === 'gt') return (x) => x != null && String(x) > v;
  if (op === 'gte') return (x) => x != null && String(x) >= v;
  if (op === 'lt') return (x) => x != null && String(x) < v;
  if (op === 'lte') return (x) => x != null && String(x) <= v;
  if (op === 'is') return (x) => (x ?? null) === (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v);
  if (op === 'in') return (x) => inList(v).includes(String(x));
  if (op === 'like' || op === 'ilike') { const re = likeRe(v); return (x) => x != null && re.test(String(x)); }
  throw new Error(`fake rest: op ${op}`);
}
function filterOf(col: string, expr: string): (r: Row) => boolean {
  const m = expr.match(/^(not\.)?([a-z]+)\.([\s\S]*)$/);
  if (!m) throw new Error(`fake rest: filter ${col}=${expr}`);
  const f = test(m[2], m[3]);
  return m[1] ? (r) => !f(r[col]) : (r) => f(r[col]);
}
function orOf(expr: string): (r: Row) => boolean {
  const parts = split(expr.replace(/^\(|\)$/g, '')).map((p) => {
    const i = p.indexOf('.');
    return filterOf(p.slice(0, i), p.slice(i + 1));
  });
  return (r) => parts.some((f) => f(r));
}

export function installRest(tables: Record<string, Row[]>, opts: RestOpts = {}) {
  const calls: RestCall[] = [];
  const base = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  const real = globalThis.fetch;
  const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    Promise.resolve(new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }));

  const rest = async (u: URL, req: Request) => {
    const method = req.method;
    const name = decodeURIComponent(u.pathname.replace(/^\/rest\/v1\//, ''));
    const schema = req.headers.get('accept-profile') || req.headers.get('content-profile') || 'public';
    const table = schema === 'public' ? name : `${schema}.${name}`;
    const text = method === 'GET' || method === 'HEAD' ? '' : await req.text();
    const body = text ? JSON.parse(text) : null;
    calls.push({ method, url: u.toString(), table, body });
    const err = opts.fail?.(table, method);
    if (err) return reply({ code: err.code || 'XX000', message: err.message, details: null, hint: null }, 400);
    const rows = tables[table] || (tables[table] = []);
    const filters: ((r: Row) => boolean)[] = [];
    let order: [string, boolean][] = [], limit = Infinity;
    for (const [k, v] of u.searchParams) {
      if (k === 'select' || k === 'columns' || k === 'on_conflict') continue;
      if (k === 'order') { order = v.split(',').map((o) => { const [c, d] = o.split('.'); return [c, d !== 'desc'] as [string, boolean]; }); continue; }
      if (k === 'limit') { limit = Number(v); continue; }
      if (k === 'or') { filters.push(orOf(v)); continue; }
      filters.push(filterOf(k, v));
    }
    const prefer = req.headers.get('prefer') || '';
    const wantRows = prefer.includes('return=representation');
    const single = (req.headers.get('accept') || '').includes('vnd.pgrst.object');
    const out = (data: Row[], total = data.length) => {
      const headers: Record<string, string> = {};
      if (prefer.includes('count=')) headers['Content-Range'] = data.length ? `0-${data.length - 1}/${total}` : `*/${total}`;
      if (method === 'HEAD') return reply(null, 200, headers);
      if (single) {
        if (data.length !== 1) return reply({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null }, 406);
        return reply(data[0], 200, headers);
      }
      return reply(data, 200, headers);
    };
    if (method === 'POST') {
      const list: Row[] = (Array.isArray(body) ? body : [body]).map((v: Row) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...structuredClone(v) }));
      const keys = opts.unique?.[table];
      if (keys && list.some((v) => rows.some((r) => keys.every((c) => str(r[c]) === str(v[c]))))) {
        return reply({ code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null }, 409);
      }
      rows.push(...list);
      return wantRows ? out(list) : reply(null, 201);
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    if (method === 'PATCH') {
      for (const r of hit) Object.assign(r, structuredClone(body));
      return wantRows ? out(hit) : reply(null, 204);
    }
    if (method === 'DELETE') {
      tables[table] = rows.filter((r) => !hit.includes(r));
      return wantRows ? out(hit) : reply(null, 204);
    }
    const sorted = [...hit].sort((a, b) => {
      for (const [c, asc] of order) { const x = String(a[c] ?? ''), y = String(b[c] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1); }
      return 0;
    });
    return out(sorted.slice(0, limit), hit.length);
  };

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    const u = new URL(req.url);
    if (base && req.url.startsWith(`${base}/rest/v1/`)) return rest(u, req);
    if (u.hostname === 'challenges.cloudflare.com') {
      const form = await req.formData();
      calls.push({ method: req.method, url: req.url, body: Object.fromEntries(form) });
      return reply({ success: form.get('response') === (opts.turnstileToken ?? GOOD_CAPTCHA) });
    }
    const raw = await req.text().catch(() => '');
    let body: any = raw;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* نص */ }
    calls.push({ method: req.method, url: req.url, body });
    if (u.hostname === 'api.resend.com') {
      const s = opts.resendStatus ?? 200;
      return reply(s === 200 ? { id: 're_test' } : { message: 'down' }, s);
    }
    return reply({ ok: true });
  }) as typeof fetch;
  return { tables, calls, restore: () => { globalThis.fetch = real; } };
}

// يلتقط معالج Deno.serve بدل تشغيل خادم، ثم يستورد الدالة (كما في leaders-api/program_gate_test.ts)
export async function captureServe(load: () => Promise<unknown>): Promise<(req: Request) => Promise<Response>> {
  const real = Deno.serve;
  let handler: any = null;
  (Deno as any).serve = (h: any) => { handler = typeof h === 'function' ? h : h?.handler; return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }; };
  try { await load(); } finally { (Deno as any).serve = real; }
  if (!handler) throw new Error('Deno.serve was not called');
  return handler;
}

export const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } });
