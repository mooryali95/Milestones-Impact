// فصل خدمة الرحلة عن لجان الكتاب (المرحلة 1، اعتمده المالك 2026-11-15): عضو اللجنة بلا دور يُعتمد ويقرأ الكتاب،
// ولا يظهر في أي موضع من الرحلة، ولا يُطلب منه D18. على قاعدة في الذاكرة وResend محاكى: الاعتماد بدور أو لجنة،
// وبريد الاعتماد للكتاب، والبوابة بلا أقسام الرحلة وبتعهد السرية، واستكمال الملف بلا حقول المطابقة، والأقران فارغة.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
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
      // بريد اعتماد العضوية يحمل تعهد السرية الذي يُوقَّع في أول دخول (المرحلة 3 من تصور أجزاء الكتاب)
      assert(m.html.includes(E.BOOK_PLEDGE_MAIL_AR));
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
      assert(mail[0].html.includes(E.BOOK_PLEDGE_MAIL_AR));
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

// ── المراجعات بعد المرحلة 1: لا يبقى معتمد بلا خدمة، ومن لا يخدم في الرحلة لا يصل بيانات مشارك من أي باب ──
const V2 = await import('./advisor.ts');
const FB = await import('./feedback360.ts');

Deno.test('تعديل المعتمد: لا يُحفظ بلا دور ولا لجنة، ولا عضو لجنة المحتوى بلا إطار، وحقول المطابقة تُفرَّغ على الخادم', async () => {
  const journey = { id: 'j1', email: 'j1@example.sa', full_name: 'سارة المستشارة', status: 'active', roles: ['advisor'], committees: [], dimensions: ['impact'], levels: ['advanced'], sectors: ['طاقة'], weekly_hours: 6, hourly_rate: 300 };
  const tables: Record<string, Row[]> = { experts: [journey], audit_log: [] };
  const restore = install(tables);
  try {
    const base = { id: 'j1', full_name: 'سارة المستشارة', bio: BIO, dimensions: ['impact'], levels: ['advanced'], sectors: 'طاقة', weekly_hours: 6, hourly_rate: 300 };
    const none = await assertRejects(() => E.adminSave(ADMIN, { ...base, roles: [], committees: [] }), Fail);
    assert((none as any).message.startsWith('حدّد دورًا في الرحلة أو عضوية في لجنة'));
    assertEquals(tables.experts[0].roles, ['advisor']);
    await assertRejects(() => E.adminSave(ADMIN, { ...base, roles: [], committees: ['content'], dimensions: [] }), Fail, 'عضو لجنة المحتوى يحتاج إطارًا');
    // إلى عضو لجنة بلا دور: يُحفظ، وتُفرَّغ المطابقة ولو أرسلتها الواجهة
    const r: any = await E.adminSave(ADMIN, { ...base, roles: [], committees: ['content'] });
    assertEquals(r.success, true);
    const row = tables.experts[0];
    assertEquals([row.roles, row.levels, row.sectors, row.weekly_hours, row.hourly_rate], [[], [], [], null, null]);
    assertEquals(row.committees, ['content']);
    assertEquals(row.dimensions, ['impact']);
    // من لم يُعتمد بعد يُحفظ بلا خدمة (الشرط عند الاعتماد)
    tables.experts.push({ id: 'n1', email: 'n1@example.sa', full_name: 'مدعو جديد', status: 'invited', roles: [], committees: [] });
    assertEquals(((await E.adminSave(ADMIN, { id: 'n1', full_name: 'مدعو جديد', roles: [], committees: [] })) as any).success, true);
  } finally { restore(); }
});

Deno.test('معتمد بلا دور ولا لجنة: لوحة بلا شيء من الرحلة ولا الكتاب، ولا تسليمات ولا 360 ولو بقي مستشار دفعة', async () => {
  const e = { id: 'z1', email: 'z1@example.sa', full_name: 'خبير بلا خدمة', status: 'active', roles: [], committees: [] };
  const tables: Record<string, Row[]> = {
    experts: [e], audit_log: [], consent_events: [], participants: [{ id: 'p1', full_name: 'نورة', is_demo: false }], org_coordinators: [],
    cohorts: [{ id: 'c1', name: 'دفعة', advisor_expert_id: 'z1', is_default: true, organization_id: null }],
    expert_requests: [{ id: 'r1', expert_id: 'z1', participant_id: 'p1', status: 'accepted', participants: { full_name: 'نورة', email: 'n@x.sa' } }],
    model_submissions: [{ id: 's1', participant_id: 'p1', status: 'submitted', answers: { a: 'سر' } }],
    feedback_cycles: [{ id: 'f1', participant_id: 'p1', status: 'approval' }],
  };
  const restore = install(tables);
  try {
    const d: any = await E.portalDashboard(e);
    assertEquals(d.no_service, true);
    assertEquals(d.book_access, false);
    assertEquals(d.consent_needed, false);
    for (const k of ['requests', 'sessions', 'stats', 'advisor_cohorts', 'rating', 'pledge']) assertEquals(k in d, false, k);
    assertEquals(await V2.reviews(e), { success: true, items: [], advisor: false });
    assertEquals(await FB.advisorList(e), { success: true, approvals: [], reports: [] });
  } finally { restore(); }
});

Deno.test('خبير الرحلة قبل D18: لا تُجلب طلباته ولا جلساته حتى يوافق', async () => {
  const e = { id: 'k1', email: 'k1@example.sa', full_name: 'خبير جديد', status: 'active', roles: ['coach'], committees: [] };
  const tables: Record<string, Row[]> = { experts: [e], consent_events: [], participants: [], org_coordinators: [],
    expert_requests: [{ id: 'r1', expert_id: 'k1', participant_id: 'p1', status: 'accepted' }] };
  const restore = install(tables);
  try {
    const d: any = await E.portalDashboard(e);
    assertEquals(d.consent_needed, true);
    for (const k of ['requests', 'sessions', 'stats', 'advisor_cohorts']) assertEquals(k in d, false, k);
  } finally { restore(); }
});

Deno.test('التعهد يُسجَّل ببصمة نصه، ولا وعد فيه بعلامة مائية لم تُبنَ', async () => {
  const tables: Record<string, Row[]> = { experts: [reviewer({ status: 'active' })], audit_log: [], consent_events: [], participants: [], org_coordinators: [] };
  const restore = install(tables);
  try {
    await E.portalPledge(tables.experts[0]);
    const row = tables.audit_log.find((x) => x.action === `expert.book-pledge.${E.BOOK_PLEDGE_VERSION}`)!;
    assertEquals(row.after.version, E.BOOK_PLEDGE_VERSION);
    assertEquals(row.after.text_digest.length, 64);
    assert(!E.BOOK_PLEDGE_AR.join(' ').includes('تحمل اسمي'));
  } finally { restore(); }
});

Deno.test('عرض أُرسل قبل رفع خدمة الرحلة لا يُقبل من لوحة الخبير ولا من رابطه', async () => {
  const e = reviewer({ status: 'active' });
  const tables: Record<string, Row[]> = { experts: [e], audit_log: [],
    expert_requests: [{ id: 'r1', expert_id: 'rv', participant_id: 'p1', status: 'offered', expires_at: new Date(Date.now() + 864e5).toISOString(), experts: { full_name: 'هند' } }] };
  const restore = install(tables);
  try {
    await assertRejects(() => E.portalRespond(e, { id: 'r1', accept: true }), Fail, 'خدمتك في الرحلة غير فعّالة');
    assertEquals(tables.expert_requests[0].status, 'offered');
  } finally { restore(); }
});
