// ترحيل 20261116140000 («التوجيه والإرشاد» G4a): تشغيل واحد يجري في كل وقت، والحجز يمنع دفعتين متوازيتين،
// والدفعة التجريبية مطفأة افتراضيًا، ولا يصل anon ولا authenticated إلى الجداول ولا الدالة
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(join(__dirname, '../../supabase/migrations/20261116140000_leaders_guidance_eval.sql'), 'utf8');
const BEFORE = `create role anon; create role authenticated; create role service_role; create schema leaders;
  create table leaders.schema_migrations (name text primary key);
  create table leaders.cohorts (id uuid primary key default gen_random_uuid(), name text);
  insert into leaders.cohorts (name) values ('دفعة أ'), ('دفعة ب');`;

async function db() {
  const d = new PGlite();
  await d.exec(BEFORE);
  await d.exec(SQL);
  await d.exec(SQL);
  return d;
}
const start = (d) => d.query("insert into leaders.guidance_eval_runs (fingerprint, cases_version, total_cases, max_micros, started_by) values ('fp', 'v1', 40, 12000000, 'boss@x.sa') returning id");

describe('ترحيل 20261116140000_leaders_guidance_eval', { timeout: 30000 }, () => {
  it('يُعاد بأمان ويُسجَّل، والدفعات كلها غير تجريبية افتراضيًا', async () => {
    const d = await db();
    expect((await d.query('select name from leaders.schema_migrations')).rows).toEqual([{ name: '20261116140000_leaders_guidance_eval' }]);
    expect((await d.query('select count(*)::int n from leaders.cohorts where guidance_pilot')).rows[0].n).toBe(0);
  });
  it('تشغيل واحد يجري في كل وقت، وبعد انتهائه يبدأ غيره', async () => {
    const d = await db();
    const { rows: [r] } = await start(d);
    await expect(start(d)).rejects.toThrow(/duplicate|unique/);
    await d.query("update leaders.guidance_eval_runs set status = 'passed' where id = $1", [r.id]);
    await expect(start(d)).resolves.toBeTruthy();
  });
  it('الحجز يُعطى لطلب واحد حتى ينتهي أجله، ولا يُعطى لتشغيل منتهٍ', async () => {
    const d = await db();
    const { rows: [r] } = await start(d);
    expect((await d.query('select * from leaders.guidance_eval_lease($1, 140)', [r.id])).rows.length).toBe(1);
    expect((await d.query('select * from leaders.guidance_eval_lease($1, 140)', [r.id])).rows.length).toBe(0);
    await d.query("update leaders.guidance_eval_runs set lease_until = now() - interval '1 second' where id = $1", [r.id]);
    expect((await d.query('select * from leaders.guidance_eval_lease($1, 140)', [r.id])).rows.length).toBe(1);
    await d.query("update leaders.guidance_eval_runs set status = 'failed', lease_until = null where id = $1", [r.id]);
    expect((await d.query('select * from leaders.guidance_eval_lease($1, 140)', [r.id])).rows.length).toBe(0);
  });
  it('نتيجة الحالة مرة واحدة لكل تشغيل، وتُحذف مع تشغيلها', async () => {
    const d = await db();
    const { rows: [r] } = await start(d);
    const add = () => d.query("insert into leaders.guidance_eval_results (run_id, case_id, ok) values ($1, 'g01', true)", [r.id]);
    await add();
    await expect(add()).rejects.toThrow(/duplicate|unique/);
    await d.query('delete from leaders.guidance_eval_runs where id = $1', [r.id]);
    expect((await d.query('select count(*)::int n from leaders.guidance_eval_results')).rows[0].n).toBe(0);
  });
  it('لا يصل anon ولا authenticated إلى التقييم ولا الحجز', async () => {
    const d = await db();
    const { rows: [r] } = await start(d);
    for (const role of ['anon', 'authenticated']) {
      await d.exec(`set role ${role}`);
      try {
        await expect(d.query('select * from leaders.guidance_eval_runs')).rejects.toThrow();
        await expect(d.query('select * from leaders.guidance_eval_results')).rejects.toThrow();
        await expect(d.query('select * from leaders.guidance_eval_lease($1, 1)', [r.id])).rejects.toThrow();
      } finally { await d.exec('reset role'); }
    }
  });
});
