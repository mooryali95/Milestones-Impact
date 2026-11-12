// تقييم 360، المرحلة 2 على قاعدة مزيفة تطبّق المرشحات: الترشيح لا يتجاوز سقف المجموعة المضبوط في الإعدادات،
// ولا يُعدَّل بعد إرسال القائمة، والشاشة تقول «غير متاح» قبل الترحيل بدل أن تفشل.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, Fail } = await import('./core.ts');
const FB = await import('./feedback360.ts');
const { resetSettingsCache } = await import('./settings.ts');

type Row = Record<string, any>;
function install(tables: Record<string, Row[] | 'missing'>) {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let single = false;
    let op: { kind: 'select' | 'insert' | 'update' | 'delete'; value?: any } = { kind: 'select' };
    const run = () => {
      const t = tables[table];
      if (t === 'missing') return { data: null, error: { code: '42P01', message: `relation ${table} does not exist` } };
      const rows = (t || (tables[table] = [])) as Row[];
      if (op.kind === 'insert') {
        const r = { id: crypto.randomUUID(), ...op.value };
        rows.push(r);
        return { data: single ? r : [r], error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op.kind === 'update') hit.forEach((r) => Object.assign(r, op.value));
      if (op.kind === 'delete') hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return { data: single ? hit[0] ?? null : hit, error: null };
    };
    const q: any = {
      select: () => q, order: () => q, limit: () => q,
      insert: (v: any) => { op = { kind: 'insert', value: v }; return q; },
      update: (v: any) => { op = { kind: 'update', value: v }; return q; },
      delete: () => { op = { kind: 'delete' }; return q; },
      upsert: (v: any) => { op = { kind: 'insert', value: v }; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
      maybeSingle: () => { single = true; return q; }, single: () => { single = true; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  Object.assign(db as any, { from });
  resetSettingsCache();
  return tables;
}
const P = { id: '00000000-0000-4000-8000-000000000001', email: 'sara@org.sa', full_name: 'سارة', organization_id: null };
const CYCLE = '00000000-0000-4000-8000-0000000000c1';

Deno.test('360: قبل الترحيل يقول «غير متاح» ولا يفشل', async () => {
  install({ feedback_cycles: 'missing', app_settings: 'missing' });
  const r: any = await FB.mine(P);
  assertEquals([r.success, r.enabled, r.ready], [true, false, false]);
});

Deno.test('360: الترشيح لا يتجاوز سقف المجموعة من الإعدادات، ولا يُعدَّل بعد الإرسال', async () => {
  const t = install({
    app_settings: [{ key: 'feedback360', value: { enabled: true, max_stakeholder: 3 } }],
    feedback_cycles: [{ id: CYCLE, participant_id: P.id, wave: 't1', instrument_id: 'i1', status: 'nominating', created_at: '2026-11-12' }],
    raters: [], audit_log: [], organizations: [], questions: [],
  });
  for (const n of [1, 2, 3]) await FB.nominate(P, { cycle_id: CYCLE, email: `s${n}@other.sa`, relation: 'stakeholder' });
  await assertRejects(() => FB.nominate(P, { cycle_id: CYCLE, email: 's4@other.sa', relation: 'stakeholder' }), Fail, 'الحد');
  await assertRejects(() => FB.nominate(P, { cycle_id: CYCLE, email: 's1@other.sa', relation: 'peer' }), Fail, 'من قبل');
  const rows = t.raters as Row[];
  assertEquals(rows.length, 3);
  // المرشح بلا رابط صالح، ومرحلته f360 ومربوط بدورته
  assertEquals(rows.every((r) => r.status === 'nominated' && r.phase === 'f360' && r.cycle_id === CYCLE), true);
  (t.feedback_cycles as Row[])[0].status = 'approval';
  await assertRejects(() => FB.nominate(P, { cycle_id: CYCLE, email: 'p1@other.sa', relation: 'peer' }), Fail, 'أُرسلت القائمة');
});

Deno.test('360: القائمة لا تُرسل بلا تقدير ذاتي ولا بأقل من الحد', async () => {
  install({
    app_settings: [{ key: 'feedback360', value: { enabled: true } }],
    feedback_cycles: [{ id: CYCLE, participant_id: P.id, wave: 't1', instrument_id: 'i1', status: 'nominating' }],
    raters: [{ id: 'r1', cycle_id: CYCLE, relation: 'peer', status: 'nominated', email: 'a@x.sa' }], audit_log: [],
  });
  await assertRejects(() => FB.submitList(P, { cycle_id: CYCLE }), Fail, 'من غير مديرك');
});
