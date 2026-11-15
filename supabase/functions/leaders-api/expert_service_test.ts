// فصل خدمة الرحلة عن لجان الكتاب (المرحلة 1، اعتمده المالك 2026-11-15): عضو اللجنة بلا دور يُعتمد ويقرأ الكتاب،
// ولا يظهر في أي موضع من الرحلة، ولا يُطلب منه D18. على قاعدة في الذاكرة وResend محاكى: الاعتماد بدور أو لجنة،
// وبريد الاعتماد للكتاب، والبوابة بلا أقسام الرحلة وبتعهد السرية، واستكمال الملف بلا حقول المطابقة، والأقران فارغة.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, CONFIG, Fail } = await import('./core.ts');
const E = await import('./experts.ts');
const PR = await import('./peer.ts');
const { APPROVAL_NEEDS_AR, CONTENT_NEEDS_DIM_AR } = await import('./committees.js');

type Row = Record<string, any>;
function install(tables: Record<string, Row[]>) {
  let seq = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: any = null;
    let head = false, single = false, limit = Infinity;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      let out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); out = out.map((r) => structuredClone(r)); return { data: single ? out[0] ?? null : out, error: null }; }
      if (head) return { data: null, count: out.length, error: null };
      // نسخة كما يعيدها الخادم، لا مرجع الصف نفسه
      out = out.slice(0, limit).map((r) => structuredClone(r));
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const q: any = {
      select: (_c?: string, o?: any) => { if (o?.head) head = true; return q; },
      insert: (x: any) => { mode = 'insert'; payload = x; return q; },
      update: (x: any) => { mode = 'update'; payload = x; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return q; },
      lt: (c: string, v: string) => { filters.push((r) => String(r[c]) < v); return q; },
      contains: (c: string, vs: unknown[]) => { filters.push((r) => vs.every((v) => (r[c] || []).includes(v))); return q; },
      not: () => q, order: () => q, range: () => q,
      limit: (n: number) => { limit = n; return q; },
      maybeSingle: () => { single = true; return q; },
      single: () => { single = true; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  const real = { from: (db as any).from, schema: (db as any).schema };
  Object.assign(db as any, { from, schema: () => ({ from }) });
  return () => Object.assign(db as any, real);
}
async function withMail<T>(fn: (mail: { to: string; subject: string; html: string }[]) => Promise<T>) {
  const real = globalThis.fetch;
  const saved = CONFIG.resendKey;
  const mail: { to: string; subject: string; html: string }[] = [];
  CONFIG.resendKey = 're_key';
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes('resend.com')) {
      const b = JSON.parse(String(init?.body));
      mail.push({ to: b.to[0], subject: b.subject, html: b.html });
      return new Response(JSON.stringify({ id: `re_${mail.length}` }));
    }
    return new Response('ok');
  }) as typeof fetch;
  try { return await fn(mail); } finally { globalThis.fetch = real; CONFIG.resendKey = saved; }
}
const tick = () => new Promise((r) => setTimeout(r, 300));
const ADMIN = { email: 'admin@example.sa', role: 'admin' as const, method: 'passkey' } as any;
const BIO = 'خبرة خمسة عشر عامًا في تصميم المناهج المهنية وتحكيمها، ومراجعة الأطر المعرفية في برامج تأهيل القادة.';
const reviewer = (extra: Row = {}): Row => ({ id: 'rv', email: 'rv@example.sa', full_name: 'هند المراجعة', status: 'invited', roles: [], committees: ['content'], dimensions: ['impact'], ...extra });

Deno.test('الاعتماد: دور في الرحلة أو عضوية لجنة، وعضو لجنة المحتوى بإطار، ولجنة القياس بلا شرط', async () => {
  const tables: Record<string, Row[]> = {
    experts: [
      reviewer({ id: 'none', email: 'none@example.sa', committees: [], dimensions: [] }),
      reviewer({ id: 'nodim', email: 'nodim@example.sa', dimensions: [] }),
      reviewer({ id: 'meas', email: 'meas@example.sa', committees: ['measurement'], dimensions: [] }),
      reviewer(),
    ],
    audit_log: [], mail_events: [],
  };
  const restore = install(tables);
  try {
    await withMail(async (mail) => {
      const why = async (id: string) => ((await assertRejects(() => E.adminSetStatus(ADMIN, { id, status: 'active' }), Fail)) as any).message;
      assertEquals(await why('none'), APPROVAL_NEEDS_AR);
      assertEquals(await why('nodim'), CONTENT_NEEDS_DIM_AR);
      assertEquals(((await E.adminSetStatus(ADMIN, { id: 'meas', status: 'active' })) as any).expert.status, 'active');
      assertEquals(((await E.adminSetStatus(ADMIN, { id: 'rv', status: 'active' })) as any).expert.status, 'active');
      await tick();
      // بريد الاعتماد للكتاب، لا «ستصلك طلبات الخدمة»
      const m = mail.find((x) => x.to === 'rv@example.sa')!;
      assertEquals(m.subject, 'صار الكتاب الأم متاحًا لك');
      assert(m.html.includes('صار الكتاب متاحًا لك في بوابة الخبير'));
      assert(!m.html.includes('طلبات الخدمة'));
    });
  } finally { restore(); }
});

Deno.test('بوابة عضو اللجنة بلا دور: بلا D18 ولا أقسام الرحلة، وتعهد السرية مرة ثم القارئ', async () => {
  const tables: Record<string, Row[]> = { experts: [reviewer({ status: 'active' })], audit_log: [], consent_events: [], participants: [], org_coordinators: [] };
  const restore = install(tables);
  try {
    const e = tables.experts[0];
    const d: any = await E.portalDashboard(e);
    assertEquals(d.content_only, true);
    assertEquals(d.consent_needed, false);
    assertEquals(d.book_access, true);
    assertEquals(d.pledge_needed, true);
    assert(Array.isArray(d.pledge) && d.pledge.length >= 2);
    for (const k of ['requests', 'sessions', 'stats', 'advisor_cohorts', 'rating']) assertEquals(k in d, false, k);
    // الكتاب مغلق قبل التعهد
    assertEquals(((await assertRejects(() => E.requirePledge(e), Fail)) as any).code, 'pledge');
    const after: any = await E.portalPledge(e);
    assertEquals(after.pledge_needed, false);
    await E.requirePledge(e);
    // يُسجَّل مرة في سجل التدقيق بنسخة نصه، ولا يُكتب في consent_events
    assertEquals(tables.audit_log.filter((x) => x.action === `expert.book-pledge.${E.BOOK_PLEDGE_VERSION}`).length, 1);
    await E.portalPledge(e);
    assertEquals(tables.audit_log.filter((x) => x.action.startsWith('expert.book-pledge')).length, 1);
    assertEquals(tables.consent_events.length, 0);
    // من يُضاف له دور لاحقًا يُطلب منه D18 لأنه لم يوافق عليه قط
    const both: any = await E.portalDashboard({ ...e, roles: ['coach'] });
    assertEquals(both.content_only, undefined);
    assertEquals(both.consent_needed, true);
  } finally { restore(); }
});

Deno.test('عضو اللجنة المدعو يستكمل الاسم والنبذة والإطار وحدها، بلا أدوار ولا حقول المطابقة', async () => {
  const tables: Record<string, Row[]> = { experts: [reviewer()], audit_log: [] };
  const restore = install(tables);
  try {
    const e = { ...tables.experts[0] };
    const d: any = await E.portalDashboard(e);
    assertEquals(d.onboarding, true);
    assertEquals(d.content_only, true);
    assertEquals(d.consent_needed, false);
    // لجنة المحتوى تشترط الإطار
    await assertRejects(() => E.portalProfileSave(e, { full_name: 'هند المراجعة', bio: BIO, dimensions: [] }), Fail, 'اختر الإطار الذي تراجعه في لجنة المحتوى');
    const r: any = await E.portalProfileSave(e, { full_name: 'هند المراجعة', bio: BIO, dimensions: ['impact'], roles: ['coach'], weekly_hours: 5, levels: ['beginner'], sectors: 'طاقة' });
    assertEquals(r.success, true);
    const row = tables.experts[0];
    // لا يُكتب دور ولا ساعات ولا قطاع من نموذج المراجع، ولو أُرسلت
    assertEquals(row.roles, []);
    assertEquals(row.weekly_hours, undefined);
    assertEquals(row.sectors, undefined);
    assertEquals(row.dimensions, ['impact']);
    assertEquals(row.status, 'applied');
  } finally { restore(); }
});

Deno.test('دعوة عضو اللجنة: لمراجعة الكتاب الأم، بلا «أدوارك» ولا «طلبات الخدمة»', async () => {
  const tables: Record<string, Row[]> = { experts: [], expert_challenges: [], audit_log: [], mail_events: [] };
  const restore = install(tables);
  try {
    await withMail(async (mail) => {
      const r: any = await E.adminSave(ADMIN, { full_name: 'هند المراجعة', email: 'rv@example.sa', committees: ['content'], dimensions: ['impact'], roles: [] });
      assertEquals(r.success, true);
      assertEquals(tables.experts[0].committees, ['content']);
      assertEquals(mail.length, 1);
      assertEquals(mail[0].subject, 'دعوة لمراجعة الكتاب الأم لبرنامج القادة');
      assert(mail[0].html.includes('لجنة المحتوى'));
      assert(!mail[0].html.includes('أدوارك'));
      assert(!mail[0].html.includes('طلبات الخدمة'));
    });
  } finally { restore(); }
});

Deno.test('عضو اللجنة بلا دور لا يرى طلبات أقران ولو بقي مستشار دفعة معيَّنًا', async () => {
  const tables: Record<string, Row[]> = { cohorts: [{ id: 'c1', name: 'دفعة', advisor_expert_id: 'rv' }], peer_requests: [{ id: 'q1', cohort_id: 'c1', status: 'open' }], peer_answers: [] };
  const restore = install(tables);
  try {
    const r: any = await PR.expertList(reviewer({ status: 'active' }));
    assertEquals(r.advisor, false);
    assertEquals(r.items, []);
  } finally { restore(); }
});
