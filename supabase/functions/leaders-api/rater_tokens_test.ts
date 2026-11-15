// P1-14 على قاعدة مزيفة تطبّق المرشحات: التذكير يضيف بصمة رابط جديد ولا يستبدلها، فرابط الدعوة الأولى والرابط الجديد
// كلاهما صالح حتى الإغلاق ومرفوضان بعده؛ والإغلاق 23:59 بتوقيت الرياض، ويوم الإغلاق يُعرض بيوم الرياض.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, Fail } = await import('./core.ts');
const FB = await import('./feedback360.ts');
const { raterGet, tokenPatch } = await import('./impact.ts');
const { closesAtRiyadh } = await import('./feedback360.js');
const { resetSettingsCache } = await import('./settings.ts');
const { MIGRATIONS, MIGRATION_GATES } = await import('./migrations.js');

type Row = Record<string, any>;
function install(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let single = false;
    let op: { kind: 'select' | 'insert' | 'update'; value?: any } = { kind: 'select' };
    const run = () => {
      const rows = tables[table] || (tables[table] = []);
      if (op.kind === 'insert') {
        const r = { id: crypto.randomUUID(), ...op.value };
        rows.push(r);
        return { data: single ? r : [r], error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op.kind === 'update') hit.forEach((r) => Object.assign(r, structuredClone(op.value)));
      return { data: single ? hit[0] ?? null : hit, error: null };
    };
    const q: any = {
      select: () => q, order: () => q, limit: () => q,
      insert: (v: any) => { op = { kind: 'insert', value: v }; return q; },
      update: (v: any) => { op = { kind: 'update', value: v }; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
      contains: (c: string, vs: unknown[]) => { filters.push((r) => Array.isArray(r[c]) && vs.every((v) => r[c].includes(v))); return q; },
      maybeSingle: () => { single = true; return q; }, single: () => { single = true; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  Object.assign(db as any, { from });
  resetSettingsCache();
  return tables;
}

// الساعة مزيفة: shift يقدّم Date.now و new Date() معًا
const RealDate = Date;
let shift = 0;
class FakeDate extends RealDate {
  constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(RealDate.now() + shift); }
  static override now() { return RealDate.now() + shift; }
}
async function at<T>(days: number, fn: () => Promise<T>) {
  shift = days * 864e5;
  (globalThis as any).Date = FakeDate;
  try { return await fn(); } finally { (globalThis as any).Date = RealDate; shift = 0; }
}

// الرموز الصادرة تُلتقط من مولّد العشوائية بصيغة randomToken نفسها، فلا حاجة إلى البريد
function captureTokens() {
  const real = crypto.getRandomValues.bind(crypto);
  const tokens: string[] = [];
  (crypto as any).getRandomValues = (a: any) => {
    const out = real(a);
    if (out instanceof Uint8Array && out.length === 32) tokens.push(btoa(String.fromCharCode(...out)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    return out;
  };
  return { tokens, restore: () => { (crypto as any).getRandomValues = real; } };
}

const P = { id: '00000000-0000-4000-8000-000000000001', email: 'sara@org.sa', full_name: 'سارة', organization_id: null, is_demo: false };
const CYCLE = '00000000-0000-4000-8000-0000000000c1';
const E = { id: 'e1', email: 'adv@x.sa', full_name: 'المستشار' };

function world(withColumn = true) {
  const rater = (n: number) => ({ id: `r${n}`, cycle_id: CYCLE, participant_id: P.id, instrument_id: 'i1', email: `p${n}@other.sa`, relation: 'peer', phase: 'f360',
    status: 'nominated', verification: 'org_domain', token_hash: `nominated-${n}`, ...(withColumn ? { token_hashes: [] } : {}), participants: { full_name: P.full_name } });
  return install({
    app_settings: [{ key: 'feedback360', value: { enabled: true, window_days: 14, remind_days: [5, 10] } }],
    feedback_cycles: [{ id: CYCLE, participant_id: P.id, wave: 't1', instrument_id: 'i1', status: 'approval', participants: P }],
    participants: [P], enrollments: [{ participant_id: P.id, cohort_id: 'co1', status: 'active' }], cohorts: [{ id: 'co1', advisor_expert_id: E.id }],
    cohort_group_members: [], experts: [{ ...E, status: 'active' }],
    raters: [rater(1), rater(2)], questions: [], audit_log: [], mail_queue: [],
  });
}
const ok = async (t: string) => assertEquals(((await raterGet({ t })) as any).success, true);
const expired = (t: string) => assertRejects(() => raterGet({ t }), Fail, 'انتهت صلاحية الرابط');

Deno.test('P1-14: الدعوة ثم تذكير اليوم الخامس، والرابطان صالحان حتى الإغلاق ومرفوضان بعده', async () => {
  const t = world();
  const cap = captureTokens();
  try {
    await FB.advisorDecide(E, { cycle_id: CYCLE, decision: 'approve' });
    const first = [...cap.tokens];
    assertEquals(first.length, 2);
    const cyc = (t.feedback_cycles as Row[])[0];
    assertEquals(cyc.status, 'open');
    const raters = t.raters as Row[];
    assertEquals(raters.every((r) => r.status === 'invited' && r.token_hashes.length === 1 && r.token_hashes[0] === r.token_hash), true);
    const r = await at(5, () => FB.sweep());
    assertEquals(r.closed, 0);
    assertEquals(cyc.reminded_days, [5]);
    const second = cap.tokens.slice(2);
    assertEquals(second.length, 2);
    // التذكير أضاف: بصمتان لكل مقيّم، والأحدث في token_hash
    assertEquals(raters.map((x) => x.token_hashes.length), [2, 2]);
    await at(6, async () => { for (const tok of [...first, ...second]) await ok(tok); });
    // قبيل الإغلاق بدقيقة ما زالا صالحين، وبعده كلاهما مرفوض
    const closes = Date.parse(cyc.closes_at);
    const dayOf = (ms: number) => (ms - Date.now()) / 864e5;
    await at(dayOf(closes - 60e3), async () => { await ok(first[0]); await ok(second[0]); });
    await at(dayOf(closes + 60e3), async () => { await expired(first[0]); await expired(second[0]); await expired(first[1]); await expired(second[1]); });
    // الرمز المجهول يبقى بالرسالة العامة
    await assertRejects(() => raterGet({ t: 'x'.repeat(43) }), Fail, 'الرابط غير صالح أو أُلغي');
    // الإلغاء يرفض الرابطين كما كان
    raters[0].status = 'revoked';
    await at(6, async () => {
      await assertRejects(() => raterGet({ t: first[0] }), Fail, 'أُلغي');
      await assertRejects(() => raterGet({ t: second[0] }), Fail, 'أُلغي');
    });
  } finally { cap.restore(); }
});

Deno.test('P1-14: قبل ترحيل العمود يعمل الرابط الأحدث كما كان ولا يُكتب token_hashes', async () => {
  const t = world(false);
  const cap = captureTokens();
  try {
    await FB.advisorDecide(E, { cycle_id: CYCLE, decision: 'approve' });
    await at(5, () => FB.sweep());
    const raters = t.raters as Row[];
    assertEquals(raters.some((r) => 'token_hashes' in r), false);
    await at(6, () => ok(cap.tokens[2]));
  } finally { cap.restore(); }
});

Deno.test('P1-14: tokenPatch يضيف في التذكير ويبدأ من جديد في الدعوة، ويتحمل صفًا كتبه الإصدار السابق', () => {
  assertEquals(tokenPatch({}, 'h2'), { token_hash: 'h2' });
  assertEquals(tokenPatch({ token_hash: 'h1', token_hashes: ['h0'] }, 'h2'), { token_hash: 'h2', token_hashes: ['h2'] });
  // h1 كتبه الإصدار السابق في token_hash وحده بعد الترحيل: يُحفظ مع الإضافة
  assertEquals(tokenPatch({ token_hash: 'h1', token_hashes: ['h0'] }, 'h2', true), { token_hash: 'h2', token_hashes: ['h0', 'h1', 'h2'] });
});

Deno.test('P1-14: الإغلاق 23:59 بتوقيت الرياض، ويوم الإغلاق يُعرض بيوم الرياض', () => {
  // 22:30 بالتوقيت العالمي يوم 15 نوفمبر = 01:30 فجر 16 نوفمبر في الرياض
  const now = Date.UTC(2026, 10, 15, 22, 30);
  assertEquals(closesAtRiyadh(now, 14), '2026-11-30T20:59:59.000Z');
  assertEquals(closesAtRiyadh(Date.UTC(2026, 10, 15, 9, 0), 14), '2026-11-29T20:59:59.000Z');
  const shown = FB.dayAr('2026-11-30T21:30:00.000Z');   // 00:30 فجر الثلاثاء 1 ديسمبر في الرياض، والاثنين 30 نوفمبر بالتوقيت العالمي
  assert(shown.includes('1') && shown.includes('ديسمبر') && shown.includes('الثلاثاء'), shown);
  assert(FB.dayAr('2026-11-30T20:59:59.000Z').includes('30'), 'الإغلاق يُعرض بيومه');
});

Deno.test('P1-14: الترحيل في القائمة ومتسامح بتعليل', () => {
  const name = '20261115120000_leaders_rater_token_hashes';
  assertEquals(MIGRATIONS.at(-1), name);
  assertEquals((MIGRATION_GATES as Record<string, string[]>)[name][0], 'tolerant');
  assert((MIGRATION_GATES as Record<string, string[]>)[name][1].length > 20);
});
