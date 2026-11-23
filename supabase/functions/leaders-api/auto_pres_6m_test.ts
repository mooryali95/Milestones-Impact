// E-PRES وR-6M (اعتمدهما المالك 2026-11-23): journeyFor يغذّي حالتهما من مصدرهما،
// اعتماد التقييم الختامي لبرنامجه ومراجعة اليوم 180 في متابعة المبادرة
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
const { db } = await import('./core.ts');
const { journeyFor } = await import('./participant.ts');

type Row = Record<string, any>;
// جداول في الذاكرة: eq وin وis وnot(is null)، وما سواها من المرشحات لا يغيّر النتيجة هنا
function install(tables: Record<string, Row[]>) {
  const reads: string[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let head = false, single = false;
    const run = () => {
      reads.push(table);
      const out = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
      if (head) return { data: null, count: out.length, error: null };
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'select') return (_c?: string, o?: any) => { if (o?.head) head = true; return q; };
        if (k === 'eq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; };
        if (k === 'is') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'not') return (c: string, op: string, v: unknown) => { if (op === 'is' && v === null) filters.push((r) => r[c] != null); return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        return () => q;
      },
    });
    return q;
  };
  const prev = (db as any).from;
  Object.assign(db as any, { from });
  return { reads, restore: () => { (db as any).from = prev; } };
}


const P = { id: 'p1', full_name: 'سارة', status: 'enrolled', organization_id: null, profile_completed_at: '2026-10-01T08:00:00Z', created_at: '2026-09-30T08:00:00Z' };
const world = (extra: Record<string, Row[]> = {}) => ({
  participants: [P],
  programs: [{ id: 'prog', is_default: true, name: 'البرنامج', final_eval: null }],
  cohorts: [{ id: 'c1', name: 'الدفعة', is_default: true, organization_id: null, status: 'running', program_id: 'prog', starts_on: '2026-10-01' }],
  journey_stages: [{ program_id: 'prog', key: 'evaluation', sort: 1, title_ar: 'التقييم', active: true }],
  stage_requirements: [
    { id: 'pres', program_id: 'prog', stage_key: 'evaluation', code: 'E-PRES', kind: 'meeting', sort: 1, title_ar: 'العرض', active: true, required: true },
    { id: 'r6m', program_id: 'prog', stage_key: 'evaluation', code: 'R-6M', kind: 'check', sort: 2, title_ar: 'الأثر', active: true, required: false },
  ],
  ...extra,
});
async function items(extra: Record<string, Row[]> = {}) {
  const f = install(world(extra));
  try { return Object.fromEntries((await journeyFor(P, { lite: true })).journey[0].items.map((i: any) => [i.code, i])); } finally { f.restore(); }
}

Deno.test('E-PRES: تقييم ختامي ينتظر الاعتماد لا يكفي، والمعتمد لبرنامجه يحسمه', async () => {
  const fe = (status: string, program_id = 'prog') => ({ final_evaluations: [{ participant_id: 'p1', program_id, status, decision: 'pass' }] });
  assertEquals((await items())['E-PRES'].status, 'pending');
  for (const s of ['draft', 'pending', 'returned']) assertEquals((await items(fe(s)))['E-PRES'].status, 'pending', s);
  assertEquals((await items(fe('approved', 'other')))['E-PRES'].status, 'pending', 'برنامج آخر');
  const done = (await items(fe('approved')))['E-PRES'];
  assertEquals([done.status, done.auto, done.auto_note], ['done', true, 'اعتُمد التقييم الختامي']);
});

Deno.test('R-6M: مراجعة اليوم 180 المرسلة تحسمه، ومراجعة اليوم 90 لا', async () => {
  const up = (checkpoint: string, verify_status: string | null = 'pending') => ({ capstone_updates: [{ participant_id: 'p1', checkpoint, verify_status }] });
  assertEquals((await items(up('d90')))['R-6M'].status, 'pending');
  assertEquals((await items(up('d180')))['R-6M'].auto_note, 'سُجّلت مراجعة يوم 180');
  const v = (await items(up('d180', 'confirmed')))['R-6M'];
  assertEquals([v.status, v.auto_note], ['done', 'سُجّلت مراجعة يوم 180 وأكّدها الراعي']);
});

Deno.test('اعتماد يدوي سابق يبقى معدودًا', async () => {
  const pr = { participant_requirements: [{ participant_id: 'p1', requirement_id: 'pres', status: 'done' }, { participant_id: 'p1', requirement_id: 'r6m', status: 'done' }] };
  const i = await items(pr);
  assertEquals([i['E-PRES'].status, i['R-6M'].status, i['E-PRES'].auto_note], ['done', 'done', null]);
});
