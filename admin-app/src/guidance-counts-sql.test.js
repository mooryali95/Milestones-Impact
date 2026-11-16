// ترحيل 20261116130000 («التوجيه والإرشاد» G3) فوق ترحيل G2: «أريد التأكد» عمود، ودالتا أعداد لا تعيدان نصًا
// ولا يصل إليهما anon ولا authenticated، وأعداد مشارك لا تختلط بغيره
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const read = (f) => readFileSync(join(__dirname, '../../supabase/migrations', f), 'utf8');
const G2 = read('20261116120000_leaders_guidance.sql');
const G3 = read('20261116130000_leaders_guidance_counts.sql');
const P1 = '00000000-0000-0000-0000-000000000001';
const P2 = '00000000-0000-0000-0000-000000000002';
const BEFORE = `create role anon; create role authenticated; create role service_role; create schema leaders;
  create table leaders.schema_migrations (name text primary key);
  create table leaders.participants (id uuid primary key, full_name text);
  insert into leaders.participants values ('${P1}', 'سارة'), ('${P2}', 'خالد');`;

async function db() {
  const d = new PGlite();
  await d.exec(BEFORE);
  await d.exec(G2);
  await d.exec(G3);
  await d.exec(G3);
  const add = (p, role, verdict, o = {}) => d.query(
    'insert into leaders.guidance_messages (participant_id, role, body, verdict, confirmed_at, cost_micros) values ($1, $2, $3, $4, $5, $6)',
    [p, role, 'نص سري', verdict, o.confirmed ? new Date().toISOString() : null, o.cost ?? null]);
  await add(P1, 'user', null); await add(P1, 'assistant', 'answered', { confirmed: true, cost: 40000 });
  await add(P1, 'user', null); await add(P1, 'assistant', 'unsure', { cost: 30000 });
  await add(P1, 'user', 'refused'); await add(P1, 'assistant', 'refused');
  await add(P2, 'user', null); await add(P2, 'assistant', 'answered', { cost: 50000 });
  return d;
}

describe('ترحيل 20261116130000_leaders_guidance_counts', { timeout: 30000 }, () => {
  it('يُعاد بأمان ويُسجَّل', async () => {
    const d = await db();
    expect((await d.query("select name from leaders.schema_migrations where name like '%counts'")).rows).toEqual([{ name: '20261116130000_leaders_guidance_counts' }]);
  });
  it('أعداد المشارك أرقام وتاريخ لا نص، ولا تختلط بغيره، والمرفوض لا يُحسب سؤالًا', async () => {
    const d = await db();
    const r = await d.query(`select * from leaders.guidance_counts('${P1}', now() - interval '30 days')`);
    expect(r.fields.map((f) => f.name)).toEqual(['asked', 'unsure', 'confirmed', 'last_at']);
    expect({ ...r.rows[0], last_at: !!r.rows[0].last_at }).toEqual({ asked: 2, unsure: 1, confirmed: 1, last_at: true });
    const two = (await d.query(`select asked, confirmed from leaders.guidance_counts('${P2}', now() - interval '30 days')`)).rows[0];
    expect(two).toEqual({ asked: 1, confirmed: 0 });
  });
  it('تقرير الإدارة أعداد وكلفة بلا نص ولا معرّفات', async () => {
    const d = await db();
    const r = await d.query(`select * from leaders.guidance_report(now() - interval '7 days')`);
    expect(r.fields.map((f) => f.name)).toEqual(['asked', 'participants', 'answered', 'unsure', 'refused', 'errors', 'confirmed', 'micros']);
    expect({ ...r.rows[0], micros: Number(r.rows[0].micros) }).toEqual({ asked: 3, participants: 2, answered: 2, unsure: 1, refused: 1, errors: 0, confirmed: 1, micros: 120000 });
  });
  it('لا يصل anon ولا authenticated إلى دالتي الأعداد', async () => {
    const d = await db();
    for (const role of ['anon', 'authenticated']) {
      await d.exec(`set role ${role}`);
      try {
        await expect(d.query(`select * from leaders.guidance_counts('${P1}', now())`)).rejects.toThrow();
        await expect(d.query('select * from leaders.guidance_report(now())')).rejects.toThrow();
      } finally { await d.exec('reset role'); }
    }
  });
});
