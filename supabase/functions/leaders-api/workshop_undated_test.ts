// الرحلة J1: جلسة جماعية بلا موعد وبلا رابط على مسار الخادم الحقيقي (activities.ts) بقاعدة في الذاكرة.
// الحفظ يقبل الفراغ برسائل صحيحة، والدعوة تُمنع لغير المؤرخة بلا بريد، والتذكير يتجاهلها، والانضمام والحضور يردّان برسالتهما،
// والنظرة العامة ترتبها بعد المؤرخة، ورمز QR يعرضها بلا نافذة.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

const { db, CONFIG, WORKSHOP_LINK_LATER_NOTE } = await import('./core.ts');
const V = await import('./activities.ts');
const { qrToken } = await import('./logic.js');

type Row = Record<string, any>;
// جداول في الذاكرة: eq وis وnot(is null) وgte وlte وin وlimit وmaybeSingle وsingle، والإدراج والتحديث. order وor لا يغيّران النتيجة
function install(tables: Record<string, Row[]>, fail: { insert?: any } = {}) {
  let seq = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let head = false, single = false, limit = Infinity;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        if (fail.insert && table === 'workshop_sessions') return { data: null, error: fail.insert };
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      const out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); return { data: single ? out[0] ?? null : out, error: null }; }
      if (mode === 'delete') { tables[table] = rows.filter((r) => !out.includes(r)); return { data: out, error: null }; }
      if (head) return { data: null, count: out.length, error: null };
      const lim = out.slice(0, limit);
      return { data: single ? lim[0] ?? null : lim, error: null };
    };
    const cmp = (c: string, f: (a: any) => boolean) => filters.push((r) => r[c] != null && f(r[c]));
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'select') return (_c?: string, o?: any) => { if (o?.head) head = true; return q; };
        if (k === 'insert' || k === 'update') return (x: any) => { mode = k; payload = x; return q; };
        if (k === 'delete') return () => { mode = 'delete'; return q; };
        if (k === 'eq' || k === 'is') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; };
        if (k === 'not') return (c: string, op: string, v: unknown) => { if (op === 'is' && v === null) filters.push((r) => r[c] != null); return q; };
        // كما في Postgres: المقارنة مع الفارغ لا تنجح، فغير المؤرخة تسقط من مرشحات الموعد
        if (k === 'gte') return (c: string, v: string) => { cmp(c, (a) => a >= v); return q; };
        if (k === 'lte') return (c: string, v: string) => { cmp(c, (a) => a <= v); return q; };
        if (k === 'limit') return (n: number) => { limit = n; return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        return () => q;
      },
    });
    return q;
  };
  const prev = { from: (db as any).from, rpc: (db as any).rpc };
  Object.assign(db as any, { from, rpc: () => Promise.resolve({ data: null, error: null }) });
  return { tables, restore: () => Object.assign(db as any, prev) };
}

const REQ = '00000000-0000-4000-8000-000000000101', COHORT = '00000000-0000-4000-8000-000000000102';
const UND = '00000000-0000-4000-8000-000000000103', DAT = '00000000-0000-4000-8000-000000000104';
const ADMIN = { email: 'admin@example.sa' };
const hours = (h: number) => new Date(Date.now() + h * 36e5).toISOString();
const world = () => install({
  stage_requirements: [{ id: REQ, kind: 'workshop', program_id: 'prog', title_ar: 'الأيام التدريبية', config: { verify: 'join' } }],
  workshop_sessions: [
    { id: UND, requirement_id: REQ, cohort_id: COHORT, title_ar: 'اليوم الأول عن بعد', mode: 'online', join_url: null, starts_at: null, ends_at: null, active: true, secret: 's'.repeat(32), invited_at: null, reminded_day_at: null, reminded_hour_at: null, created_at: hours(-48) },
    { id: DAT, requirement_id: REQ, cohort_id: COHORT, title_ar: 'اليوم الثاني', mode: 'online', join_url: null, starts_at: hours(24), ends_at: hours(30), active: true, secret: 's'.repeat(32), invited_at: null, reminded_day_at: null, reminded_hour_at: null, created_at: hours(-24) },
  ],
  workshop_attendance: [], audit_log: [], cohorts: [], enrollments: [], participants: [], programs: [], coaching_sessions: [],
});
async function capture<T>(f: () => Promise<T>) {
  const real = globalThis.fetch, saved = CONFIG.resendKey;
  const mail: Row[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes('resend.com')) { mail.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ id: 're_1' })); }
    return new Response('ok');
  }) as typeof fetch;
  Object.assign(CONFIG, { resendKey: 're_test' });
  try { return { out: await f(), mail }; } finally { globalThis.fetch = real; Object.assign(CONFIG, { resendKey: saved }); }
}

Deno.test('الحفظ: عن بعد بلا رابط ولا موعد يُحفظ «يُحدد لاحقًا»، والجزئي والمقلوب والرابط الخاطئ برسائلها', async () => {
  const w = world();
  try {
    const r: any = await V.workshopSave(ADMIN, { row: { requirement_id: REQ, cohort_id: COHORT, title_ar: 'تدريب يومان عن بعد', mode: 'online', join_url: '', starts_at: null, ends_at: null } });
    const row = w.tables.workshop_sessions.find((x) => x.id === r.id)!;
    assertEquals([row.mode, row.join_url, row.starts_at, row.ends_at], ['online', null, null, null]);
    const bad = (row: Row) => assertRejects(() => V.workshopSave(ADMIN, { row: { requirement_id: REQ, title_ar: 'س', mode: 'online', ...row } }), Error);
    const msg = async (row: Row) => { try { await V.workshopSave(ADMIN, { row: { requirement_id: REQ, title_ar: 'س', mode: 'online', ...row } }); return ''; } catch (e) { return (e as Error).message; } };
    await bad({ starts_at: hours(1) });
    assertEquals(await msg({ starts_at: hours(1), ends_at: null }), 'حدد وقتي البدء والانتهاء معًا، أو اتركهما فارغين ليُحدد الموعد لاحقًا');
    assertEquals(await msg({ starts_at: hours(2), ends_at: hours(1) }), 'وقت الانتهاء يجب أن يكون بعد وقت البدء');
    assertEquals(await msg({ join_url: 'zoom.us/j/1' }), 'رابط الاجتماع يبدأ بـ https، أو اتركه فارغًا ليُضاف لاحقًا');
    // تحرير جلسة مؤرخة إلى «يُحدد لاحقًا» مقبول
    await V.workshopSave(ADMIN, { row: { id: DAT, title_ar: 'اليوم الثاني', mode: 'online', starts_at: '', ends_at: '' } });
    assertEquals(w.tables.workshop_sessions.find((x) => x.id === DAT)!.starts_at, null);
  } finally { w.restore(); }
});

Deno.test('الحفظ قبل الترحيل: رفض القيد للفارغ برسالة تقول السبب، لا «تعذّر الحفظ»', async () => {
  const w = install({ stage_requirements: [{ id: REQ, kind: 'workshop' }], workshop_sessions: [], audit_log: [] }, { insert: { code: '23502', message: 'null value in column "starts_at"' } });
  try {
    await assertRejects(() => V.workshopSave(ADMIN, { row: { requirement_id: REQ, title_ar: 'س', mode: 'online' } }), Error, 'تحتاج تحديث قاعدة البيانات');
  } finally { w.restore(); }
});

Deno.test('الدعوة: غير المؤرخة تُمنع برسالتها بلا بريد، لا «انتهت هذه الجلسة»', async () => {
  const w = world();
  try {
    const { out, mail } = await capture(() => V.workshopInvite(ADMIN, { id: UND }).then(() => '', (e: Error) => e.message));
    assertEquals(out, 'حدد موعد الجلسة أولًا لتُرسل دعوتها، ثم أرسلها من هنا');
    assertEquals(mail.length, 0);
    assertEquals(w.tables.workshop_sessions.find((x) => x.id === UND)!.invited_at, null);
  } finally { w.restore(); }
});

Deno.test('التذكير الساعي يتجاهل غير المؤرخة ولا يوسمها', async () => {
  const w = world();
  try {
    const { out, mail } = await capture(() => V.workshopReminders());
    assertEquals(out, { day: 0, hour: 0 });
    assertEquals(mail.length, 0);
    const u = w.tables.workshop_sessions.find((x) => x.id === UND)!;
    assertEquals([u.reminded_day_at, u.reminded_hour_at], [null, null]);
    // والمؤرخة بعد يوم (بلا أعضاء دفعة هنا) توسم كما كانت
    assert(w.tables.workshop_sessions.find((x) => x.id === DAT)!.reminded_day_at);
  } finally { w.restore(); }
});

Deno.test('الانضمام وتسجيل الحضور: «الرابط لاحقًا» و«الموعد لم يُحدد» برسالتيهما', async () => {
  const w = world();
  try {
    const p = { id: 'p1', email: 'p@example.sa' };
    await assertRejects(() => V.workshopJoin(p, { session_id: UND }, { ip: null, ua: null }), Error, 'رابط الجلسة لم يُضف بعد');
    w.tables.workshop_sessions.find((x) => x.id === UND)!.join_url = 'https://zoom.us/j/1';
    await assertRejects(() => V.workshopJoin(p, { session_id: UND }, { ip: null, ua: null }), Error, 'موعد هذه الجلسة لم يُحدد بعد');
    const t = await qrToken(UND, 's'.repeat(32));
    await assertRejects(() => V.workshopCheckin(p, { t }, { ip: null, ua: null }), Error, 'موعد هذه الجلسة لم يُحدد بعد');
    assertEquals(w.tables.workshop_attendance.length, 0);
  } finally { w.restore(); }
});

Deno.test('النظرة العامة ورمز QR: غير المؤرخة بعد المؤرخة، وبلا نافذة حضور ولا تاريخ', async () => {
  const w = world();
  try {
    w.tables.workshop_sessions.reverse();
    const o: any = await V.overview();
    assertEquals(o.workshops.map((x: Row) => x.id), [DAT, UND]);
    assertEquals(o.workshops.some((x: Row) => 'secret' in x), false);
    const q: any = await V.workshopQr({ id: UND });
    assertEquals([q.open, q.session.starts_at], [false, null]);
  } finally { w.restore(); }
});

Deno.test('بريد الجلسة عن بعد بلا رابط: «يصلك رابط الانضمام قبل موعدها» لا تعليمات القاعة', async () => {
  const { workshopMail, WORKSHOP_MAIL } = await import('./core.ts');
  const html = workshopMail('invite', 'سارة', 'اليوم الثاني', 'الأحد', null, null, 'later');
  assert(html.includes(WORKSHOP_LINK_LATER_NOTE));
  assert(!html.includes(WORKSHOP_MAIL.invite.note));
});
