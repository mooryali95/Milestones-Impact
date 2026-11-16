// ترحيل 20261116080000 (سجل التذكير الموحد) على قاعدة مؤقتة: يُعاد بأمان، والمرسل من الخمسة وحدهم، والنص مطلوب بحد،
// وحذف المشارك يحذف سجله، والقراءة الأحدث أولًا من الفهرس
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { NUDGE_SENDERS } from '../../supabase/functions/leaders-api/nudge.js';

const SQL = readFileSync(join(__dirname, '../../supabase/migrations/20261116080000_leaders_nudges.sql'), 'utf8');
const BEFORE = `create schema leaders; create table leaders.schema_migrations (name text primary key);
  create table leaders.participants (id uuid primary key default gen_random_uuid(), full_name text);
  insert into leaders.participants (id, full_name) values ('00000000-0000-0000-0000-000000000001', 'سارة');`;
const P = '00000000-0000-0000-0000-000000000001';
const add = (d, o = {}) => d.query(
  'insert into leaders.nudges (participant_id, sender, stage_key, body, snapshot, created_at) values ($1, $2, $3, $4, $5, $6) returning id',
  [o.p || P, o.sender || 'admin', o.key || 'stage:training', o.body ?? 'أنت في مرحلة التدريب', JSON.stringify(o.snapshot || { key: 'stage:training' }), o.at || new Date().toISOString()],
);

async function db() {
  const d = new PGlite();
  await d.exec(BEFORE);
  await d.exec(SQL);
  await d.exec(SQL);
  return d;
}

describe('ترحيل 20261116080000_leaders_nudges', { timeout: 30000 }, () => {
  it('يُعاد بأمان ويُسجَّل، والقناة البريد افتراضيًا، وRLS مفعّل', async () => {
    const d = await db();
    expect((await d.query("select name from leaders.schema_migrations")).rows).toEqual([{ name: '20261116080000_leaders_nudges' }]);
    await add(d);
    expect((await d.query('select channels, seen_at from leaders.nudges')).rows).toEqual([{ channels: ['email'], seen_at: null }]);
    expect((await d.query("select relrowsecurity from pg_class where relname = 'nudges'")).rows).toEqual([{ relrowsecurity: true }]);
  });
  it('المرسلون الخمسة وحدهم كما في المحرك، والنص بين 3 و2000 حرف', async () => {
    const d = await db();
    for (const sender of NUDGE_SENDERS) await add(d, { sender });
    await expect(add(d, { sender: 'expert' })).rejects.toThrow(/check/);
    await expect(add(d, { body: 'لا' })).rejects.toThrow(/check/);
    await expect(add(d, { body: 'س'.repeat(2001) })).rejects.toThrow(/check/);
  });
  it('حذف المشارك يحذف سجله، والأحدث أولًا', async () => {
    const d = await db();
    await add(d, { at: '2026-11-01T00:00:00Z', key: 'stage:a' });
    await add(d, { at: '2026-11-10T00:00:00Z', key: 'stage:b' });
    expect((await d.query('select stage_key from leaders.nudges where participant_id = $1 order by created_at desc limit 1', [P])).rows).toEqual([{ stage_key: 'stage:b' }]);
    await d.query('delete from leaders.participants where id = $1', [P]);
    expect((await d.query('select count(*)::int n from leaders.nudges')).rows).toEqual([{ n: 0 }]);
  });
});
