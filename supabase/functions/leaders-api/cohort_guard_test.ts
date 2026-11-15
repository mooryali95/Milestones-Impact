// حراس المشاركين الأحياء في cohortSave: دفعة جهة ثانية على برنامج آخر تُرفض بلا confirm_move وتُقبل به، وعلى البرنامج
// نفسه تمر بلا تأكيد، وإخفاء آخر بند إلزامي في مرحلة تكتمل بإلزاميتها يُرفض، وبرنامج دفعة لأعضائها تقدم لا يتغير.
// قاعدة في الذاكرة بنمط program_gate_test.ts، بلا شبكة.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, Fail } = await import('./core.ts');
const { cohortSave } = await import('./programs.ts');

type Row = Record<string, any>;
function install(tables: Record<string, Row[]>) {
  let seq = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let single = false, limit = Infinity;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      const out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); return { data: single ? out[0] ?? null : out, error: null }; }
      if (mode === 'delete') { tables[table] = rows.filter((r) => !out.includes(r)); return { data: out, error: null }; }
      const cut = out.slice(0, limit);
      return { data: single ? cut[0] ?? null : cut, error: null };
    };
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'insert' || k === 'update') return (x: any) => { mode = k; payload = x; return q; };
        if (k === 'delete') return () => { mode = 'delete'; return q; };
        if (k === 'eq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; };
        if (k === 'limit') return (n: number) => { limit = n; return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        return () => q;
      },
    });
    return q;
  };
  const prev = { from: (db as any).from };
  Object.assign(db as any, { from });
  return { tables, restore: () => Object.assign(db as any, prev) };
}

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(1), PA = U(2), PB = U(3), C1 = U(4), P1 = U(5), P2 = U(6), R1 = U(7), R2 = U(8);
const admin = { email: 'a@x.sa', role: 'admin' as const };
function world() {
  return install({
    programs: [{ id: PA, is_default: true, archived_at: null }, { id: PB, is_default: false, archived_at: null }],
    program_versions: [],
    journey_stages: [{ program_id: PA, key: 's1', title_ar: 'التمهيد', sort: 1, active: true, rules: {} }],
    stage_requirements: [
      { id: R1, program_id: PA, stage_key: 's1', code: 'A-ONE', title_ar: 'بند', kind: 'check', required: true, active: true, sort: 1 },
      { id: R2, program_id: PA, stage_key: 's1', code: 'A-TWO', title_ar: 'بند اختياري', kind: 'check', required: false, active: true, sort: 2 },
    ],
    cohorts: [{ id: C1, name: 'سفراء 2026', organization_id: ORG, program_id: PA, program_version_id: null, status: 'running', starts_on: '2026-09-01', created_at: '2026-09-01T00:00:00Z', hidden_requirements: [] }],
    enrollments: [],
    participants: [{ id: P1, organization_id: ORG, is_demo: false }, { id: P2, organization_id: ORG, is_demo: false }],
    participant_requirements: [{ participant_id: P1, requirement_id: R1, status: 'done' }],
    cohort_experts: [], audit_log: [],
  });
}
const failOf = async (fn: () => Promise<unknown>) => (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>;
const second = (program_id: string) => ({ name: 'دفعة 2027', organization_id: ORG, program_id, status: 'open', starts_on: '2027-01-01' });

Deno.test('دفعة جهة ثانية على برنامج آخر تُرفض بلا تأكيد وتسمي العدد، ولا يُكتب شيء', async () => {
  const w = world();
  try {
    const e = await failOf(() => cohortSave(admin, second(PB)));
    assertEquals(e.code, 'confirm_move');
    assertEquals(e.status, 409);
    assertEquals(e.extra.affected, 1);
    assertEquals((e.extra.from as any[])[0].name, 'سفراء 2026');
    assertEquals(w.tables.cohorts.length, 1);
    assertEquals(w.tables.audit_log.length, 0);
  } finally { w.restore(); }
});

Deno.test('confirm_move الصريح يقبل الحفظ', async () => {
  const w = world();
  try {
    const r: any = await cohortSave(admin, { ...second(PB), confirm_move: true });
    assertEquals(r.success, true);
    assertEquals(w.tables.cohorts.length, 2);
  } finally { w.restore(); }
});

Deno.test('على البرنامج نفسه لا تأكيد: معرفات المتطلبات واحدة', async () => {
  const w = world();
  try {
    assertEquals(((await cohortSave(admin, second(PA))) as any).success, true);
  } finally { w.restore(); }
});

Deno.test('إخفاء آخر بند إلزامي في مرحلة تكتمل بإلزاميتها يُرفض، والاختياري يمر', async () => {
  const w = world();
  try {
    const e = await failOf(() => cohortSave(admin, { id: C1, hidden_requirements: ['A-ONE'] }));
    assertEquals(e.code, 'hide_breaks_stage');
    assertEquals(e.message.includes('«التمهيد»'), true);
    assertEquals(w.tables.cohorts[0].hidden_requirements, []);
    assertEquals(((await cohortSave(admin, { id: C1, hidden_requirements: ['A-TWO'] })) as any).success, true);
  } finally { w.restore(); }
});

Deno.test('تغيير برنامج دفعة لأعضائها تقدم يُرفض، وبلا تقدم يمر', async () => {
  const w = world();
  try {
    const e = await failOf(() => cohortSave(admin, { id: C1, program_id: PB }));
    assertEquals(e.code, 'program_locked');
    assertEquals(e.extra.affected, 1);
    assertEquals(w.tables.cohorts[0].program_id, PA);
    w.tables.participant_requirements = [];
    assertEquals(((await cohortSave(admin, { id: C1, program_id: PB })) as any).success, true);
    assertEquals(w.tables.cohorts[0].program_id, PB);
  } finally { w.restore(); }
});
