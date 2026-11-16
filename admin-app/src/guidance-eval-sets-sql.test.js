// ترحيل 20261116170000 («التوجيه والإرشاد» H2): المجموعة المعتمدة لا تتغير حالاتها ولا رقمها ولا تعود مسودة،
// والاعتماد يلزمه من اعتمد ومتى، والرقم فريد، ولا يصل anon ولا authenticated إليها
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(join(__dirname, '../../supabase/migrations/20261116170000_leaders_guidance_eval_sets.sql'), 'utf8');
async function db() {
  const d = new PGlite();
  await d.exec('create role anon; create role authenticated; create role service_role; create schema leaders; create table leaders.schema_migrations (name text primary key);');
  await d.exec(SQL);
  await d.exec(SQL);
  await d.query(`insert into leaders.guidance_eval_sets (version, cases) values ('v1', '[{"id":"g01"}]')`);
  return d;
}

describe('ترحيل 20261116170000_leaders_guidance_eval_sets', { timeout: 30000 }, () => {
  it('يُعاد بأمان ويُسجَّل، والمسودة تُعدَّل', async () => {
    const d = await db();
    expect((await d.query('select name from leaders.schema_migrations')).rows).toEqual([{ name: '20261116170000_leaders_guidance_eval_sets' }]);
    await d.query(`update leaders.guidance_eval_sets set cases = '[{"id":"g02"}]' where version = 'v1'`);
  });
  it('الاعتماد يلزمه من ومتى، والمعتمدة لا تتغير ولا تعود مسودة', async () => {
    const d = await db();
    await expect(d.query(`update leaders.guidance_eval_sets set status = 'approved' where version = 'v1'`)).rejects.toThrow(/check/);
    await d.query(`update leaders.guidance_eval_sets set status = 'approved', approved_by = 'owner@x.sa', approved_at = now() where version = 'v1'`);
    await expect(d.query(`update leaders.guidance_eval_sets set cases = '[]' where version = 'v1'`)).rejects.toThrow(/معتمدة/);
    await expect(d.query(`update leaders.guidance_eval_sets set version = 'v9' where version = 'v1'`)).rejects.toThrow(/معتمدة/);
    await expect(d.query(`update leaders.guidance_eval_sets set status = 'draft', approved_by = null, approved_at = null where version = 'v1'`)).rejects.toThrow(/معتمدة/);
  });
  it('الرقم فريد، ولا يصل anon ولا authenticated', async () => {
    const d = await db();
    await expect(d.query(`insert into leaders.guidance_eval_sets (version, cases) values ('v1', '[]')`)).rejects.toThrow(/duplicate|unique/);
    for (const role of ['anon', 'authenticated']) {
      await d.exec(`set role ${role}`);
      try { await expect(d.query('select * from leaders.guidance_eval_sets')).rejects.toThrow(); } finally { await d.exec('reset role'); }
    }
  });
});
