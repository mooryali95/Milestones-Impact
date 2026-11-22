// التذكير الموحد على مسار الخادم الحقيقي (nudges.ts) بقاعدة في الذاكرة (خارطة 16 نوفمبر، المرحلة 2):
// الحد المشترك بين المرسلين، والسجل مصدرًا واحدًا لا reminded_at، ونيابة المساعد عن المرشد إلى أن يتابع بنفسه،
// وتذكير المنسق: إيقاف الإدارة، والحد اليومي للجهة، ونطاق جهته وحدها. البريد لنطاق العرض فلا يُرسل شيء.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';

const { db, DEMO_MAIL_DOMAIN, CONFIG } = await import('./core.ts');
const NU = await import('./nudges.ts');
const ADMIN = await import('./admin.ts');
const { NUDGE_GAP_DAYS } = await import('./nudge.js');

type Row = Record<string, any>;
// جداول في الذاكرة: eq وis وnot(is null وin) وgte وlte وin وorder (كما في Postgres: الفارغ آخرًا تصاعديًا وأولًا تنازليًا) وlimit وmaybeSingle وsingle، والإدراج والتحديث
function install(tables: Record<string, Row[]>, fail: { insert?: any } = {}) {
  let seq = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let head = false, single = false, limit = Infinity;
    const sorts: { c: string; asc: boolean; nullsFirst: boolean }[] = [];
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
      if (sorts.length) out.sort((x, y) => {
        for (const { c, asc, nullsFirst } of sorts) {
          const a = x[c] ?? null, b = y[c] ?? null;
          if (a === b) continue;
          if (a === null || b === null) return (a === null) === nullsFirst ? -1 : 1;
          return (a < b ? -1 : 1) * (asc ? 1 : -1);
        }
        return 0;
      });
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
        if (k === 'not') return (c: string, op: string, v: unknown) => {
          if (op === 'is' && v === null) filters.push((r) => r[c] != null);
          else if (op === 'is') filters.push((r) => (r[c] ?? null) !== v);
          // not in بصيغة PostgREST: (a,b,c)
          if (op === 'in') { const vs = String(v).replace(/^\(|\)$/g, '').split(','); filters.push((r) => r[c] != null && !vs.includes(r[c])); }
          return q;
        };
        if (k === 'order') return (c: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) => {
          const asc = o.ascending !== false;
          sorts.push({ c, asc, nullsFirst: o.nullsFirst ?? !asc });
          return q;
        };
        // كما في Postgres: المقارنة مع الفارغ لا تنجح، فغير المؤرخة تسقط من مرشحات الموعد
        if (k === 'neq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return q; };
        if (k === 'lt') return (c: string, v: string) => { cmp(c, (a) => a < v); return q; };
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


const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const pid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
// متعثر عند الملف: بلا جوال، فالمحرك يذكّره بإكمال ملفه دون قراءة رحلته
const stuck = (n: number, extra: Row = {}) => ({ id: pid(n), full_name: `مشارك ${n}`, email: `p${n}@${DEMO_MAIL_DOMAIN}`, status: 'registered', is_demo: false,
  organization_id: ORG, created_at: ago(20), last_login_at: ago(20), reminded_at: null, ...extra });
const world = (extra: Record<string, Row[]> = {}) => ({ participants: [stuck(1), stuck(2)], nudges: [], audit_log: [], assessments: [], ...extra });

Deno.test('الحد المشترك: تذكير الإدارة يُكتب في السجل، ثم لا يذكّر المرشد خلال المهلة نفسها', async () => {
  const t = install(world());
  try {
    const r1 = await NU.sendNudges({ kind: 'admin', label: 'الإدارة (omar)', by: 'o@x', ref: 'o@x' }, [pid(1), pid(2)]);
    assertEquals(r1.sent, 2);
    assertEquals(t.tables.nudges.map((n) => [n.participant_id, n.sender, n.stage_key]), [[pid(1), 'admin', 'onboarding:profile'], [pid(2), 'admin', 'onboarding:profile']]);
    assertEquals(t.tables.nudges[0].channels, ['email', 'banner']);
    const r2 = await NU.sendNudges({ kind: 'mentor', label: 'المرشد خالد', by: 'k@x', ref: 'e1' }, [pid(1)]);
    assertEquals(r2.sent, 0);
    assertEquals(r2.skipped, { recent: 1 });
    assertEquals(r2.gap_days, NUDGE_GAP_DAYS);
  } finally { t.restore(); }
});

Deno.test('المصدر الواحد: مع السجل لا يُكتب reminded_at، ويُقرأ للتذكيرات الأقدم من السجل وحدها', async () => {
  const t = install(world({ participants: [stuck(1), stuck(2, { reminded_at: ago(1) })] }));
  try {
    const r = await NU.sendNudges({ kind: 'admin', label: 'الإدارة', by: 'o@x' }, [pid(1), pid(2)]);
    assertEquals(r.sent, 1, 'من ذُكِّر أمس قبل السجل يُحترم حده');
    assertEquals(t.tables.participants.find((p) => p.id === pid(1))!.reminded_at, null);
    const recent = await NU.recentlyNudged(t.tables.participants as { id: string; reminded_at?: string | null }[], 7);
    assert(recent.has(pid(1)), 'من السجل');
  } finally { t.restore(); }
});

Deno.test('المساعد ينوب عن المرشد في الأسبوعي، إلا من تابعه مرشده بنفسه خلال 14 يومًا', async () => {
  const mentor = { id: 'e1', full_name: 'خالد العمر', email: 'k@x', status: 'approved' };
  const t = install(world({
    participants: [stuck(1), stuck(2), stuck(3)],
    expert_requests: [
      { participant_id: pid(1), expert_id: 'e1', role: 'mentor', status: 'accepted', experts: mentor },
      { participant_id: pid(2), expert_id: 'e1', role: 'mentor', status: 'accepted', experts: mentor },
    ],
    // المرشد ذكّر الثاني قبل 5 أيام بنفسه (تجاوز الحد المشترك فلا يُحجب به، لكنه «يتابع»)
    nudges: [{ participant_id: pid(2), sender: 'mentor', sender_label: 'المرشد خالد', created_at: ago(5), snapshot: {} }],
  }));
  try {
    const r = await NU.weeklyNudges([pid(1), pid(2), pid(3)]);
    assertEquals(r.sent, 2);
    assertEquals(r.mentor_active, 1);
    const fresh = t.tables.nudges.filter((n) => n.created_at > ago(1));
    assertEquals(fresh.map((n) => [n.participant_id, n.sender]).sort(), [[pid(1), 'assistant'], [pid(3), 'auto']]);
    assertEquals(fresh.find((n) => n.sender === 'assistant')!.sender_label, 'المساعد نيابة عن المرشد خالد');
  } finally { t.restore(); }
});

// التذكير الأسبوعي بمساره الحقيقي (reminders): السر، ثم القراءة والمحرك والسجل
async function runWeekly() {
  const prev = (CONFIG as any).cronSecret;
  (CONFIG as any).cronSecret = 'cron-test';
  try { return await ADMIN.reminders({ secret: 'cron-test' }); } finally { (CONFIG as any).cronSecret = prev; }
}
const auto = (n: number, d: number) => ({ participant_id: pid(n), sender: 'auto', sender_label: 'التذكير الآلي', created_at: ago(d), snapshot: {} });

Deno.test('الأسبوعي يذكّر من لم يدخل قط وعمر حسابه أسبوع، مرتين في جملته، ويستبعد الحديث ومن لا تذكير له', async () => {
  const t = install(world({
    participants: [
      stuck(1, { last_login_at: null }),
      stuck(2),
      stuck(3, { last_login_at: ago(2) }),
      stuck(4, { last_login_at: null }),
      stuck(5, { last_login_at: null, is_demo: true }),
      stuck(6, { last_login_at: null, created_at: ago(1) }),
      stuck(7, { last_login_at: null }),
      stuck(8, { last_login_at: null }),
      stuck(9, { last_login_at: null, status: 'withdrawn' }),
      stuck(10, { last_login_at: null, email: null }),
    ],
    nudges: [
      { participant_id: pid(4), sender: 'admin', sender_label: 'الإدارة', created_at: ago(3), snapshot: {} },
      auto(7, 17), auto(7, 10), auto(8, 10),
    ],
  }));
  const prev = (CONFIG as any).cronSecret;
  (CONFIG as any).cronSecret = 'cron-test';
  try { await assertRejects(() => ADMIN.reminders({ secret: 'wrong' })); } finally { (CONFIG as any).cronSecret = prev; }
  try {
    const r = await runWeekly();
    assertEquals(r.sent, 3);
    const fresh = t.tables.nudges.filter((n) => n.created_at > ago(1));
    assertEquals(fresh.map((n) => n.participant_id).sort(), [pid(1), pid(2), pid(8)],
      'من لم يدخل قط ومن غاب أسبوعًا ومن ذُكِّر مرة؛ لا من دخل قبل يومين ولا من ذُكِّر هذا الأسبوع ولا التجريبي ولا المضاف أمس ولا من بلغ حده ولا المنسحب ولا من بلا بريد');
  } finally { t.restore(); }
});

Deno.test('الأسبوعي: من لم يدخل قط يُذكَّر مرتين عبر الأسابيع ثم يُترك', async () => {
  const t = install(world({ participants: [stuck(1, { last_login_at: null })] }));
  try {
    const sent: number[] = [];
    for (let week = 0; week < 4; week++) {
      sent.push((await runWeekly()).sent);
      // أسبوع يمضي: يتقادم ما في السجل فلا يحجبه الحد الأسبوعي، ويبقى في العدّ
      for (const n of t.tables.nudges) n.created_at = new Date(Date.parse(n.created_at) - 8 * 864e5).toISOString();
    }
    assertEquals(sent, [1, 1, 0, 0]);
    assertEquals(t.tables.nudges.length, 2);
  } finally { t.restore(); }
});

Deno.test('الأسبوعي: من يتخطاه المحرك لا يأكل الحد، ولا يحجب من لم يدخل قط من غاب', async () => {
  // 210 غابوا أقدم من غيره، و250 لم يدخلوا قط، وكلهم سلّم القياس ينتظر ما ليس منه فلا تذكير لهم (nothing)
  const away = Array.from({ length: 210 }, (_, i) => stuck(100 + i, { last_login_at: ago(40 + i / 1000) }));
  const never = Array.from({ length: 250 }, (_, i) => stuck(400 + i, { last_login_at: null }));
  const assessments = [...away, ...never].map((p, i) => ({ id: `a${i}`, participant_id: p.id, instrument_id: 'i1', status: 'submitted', 'instruments.kind': 'baseline', started_at: ago(30) }));
  const t = install(world({ participants: [...away, ...never, stuck(1, { last_login_at: ago(10) })], assessments }));
  try {
    const r = await runWeekly();
    assertEquals(r.sent, 1);
    assertEquals(t.tables.nudges.map((n) => n.participant_id), [pid(1)], 'الغائب يصله تذكيره رغم من سبقوه في الترتيب بلا تذكير');
  } finally { t.restore(); }
});

const coord = (perms: Row = { list: true, activity: true }) => ({ email: 'c@x', organization_id: ORG, permissions: perms, template: 'program' });

Deno.test('المنسق: جهته وحدها، والإيقاف بيد الإدارة، والحد اليومي، وصلاحية النشاط للمتوقفين', async () => {
  const outsider = stuck(9, { organization_id: OTHER });
  const t = install(world({ participants: [stuck(1), stuck(2), outsider], organizations: [{ id: ORG, name: 'هيئة التطوير', coord_nudges: true }] }));
  try {
    const p = await NU.coordPreview(coord(), { group: 'baseline' });
    assertEquals(p.count, 2, 'المتعثران من جهته، لا من جهة أخرى');
    assertEquals(p.signed, 'هيئة التطوير');
    assertEquals(JSON.stringify(p).includes('مشارك 1'), false, 'المعاينة بلا أسماء');
    const s = await NU.coordSend(coord(), { group: 'baseline' });
    assertEquals(s.sent, 2);
    assert(t.tables.nudges.every((n) => n.participant_id !== pid(9)));
    assertEquals(t.tables.nudges[0].sender, 'coordinator');
    await assertRejects(() => NU.coordPreview(coord({ list: true, activity: false }), { group: 'stale' }), Error, 'آخر دخول');
    await assertRejects(() => NU.coordPreview(coord({ list: false }), { group: 'baseline' }), Error, 'قائمة المشاركين');
    t.tables.organizations[0].coord_nudges = false;
    await assertRejects(() => NU.coordSend(coord(), { group: 'baseline' }), Error, 'موقوف');
  } finally { t.restore(); }
});

Deno.test('المنسق: بلغت الجهة حدها اليومي فلا إرسال', async () => {
  const full = Array.from({ length: 60 }, (_, i) => ({ participant_id: pid(100 + i), sender: 'coordinator', sender_ref: ORG, created_at: ago(0.5), snapshot: {} }));
  const t = install(world({ organizations: [{ id: ORG, name: 'هيئة التطوير' }], nudges: full }));
  try {
    await assertRejects(() => NU.coordSend(coord(), { group: 'baseline' }), Error, 'حد التذكير اليومي');
  } finally { t.restore(); }
});

Deno.test('حساب الاختبار الداخلي (is_test) لا يصله التذكير الأسبوعي الآلي، وغيره يصله', async () => {
  const t = install(world({ participants: [stuck(1), stuck(2, { is_test: true })] }));
  try {
    await runWeekly();
    const fresh = t.tables.nudges.filter((n) => n.created_at > ago(1));
    assertEquals(fresh.map((n) => n.participant_id), [pid(1)]);
  } finally { t.restore(); }
});
