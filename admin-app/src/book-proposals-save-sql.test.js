// ترحيل 20261117100000: حفظ مقترحات الاستوديو في معاملة واحدة. الأقسام وسجل التدقيق تُحفظ جميعًا أو لا شيء،
// وتغيّر حالة مقترح سابق يُفشل العملية كلها برمز P0409 فلا يبقى نصف تعديل، ولا يستدعيها anon ولا authenticated
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(join(__dirname, '../../supabase/migrations/20261117100000_leaders_book_proposals_save.sql'), 'utf8');
const MOD = '11111111-1111-4111-8111-111111111111';
async function db() {
  const d = new PGlite();
  await d.exec(`create role anon; create role authenticated; create role service_role; create schema leaders;
    create table leaders.schema_migrations (name text primary key);
    create table leaders.audit_log (id bigint generated always as identity primary key, actor_type text not null, actor text, action text not null,
      entity text not null, entity_id text, before jsonb, after jsonb, created_at timestamptz not null default now());
    create table leaders.book_proposals (id uuid primary key default gen_random_uuid(), module_id uuid not null, section text not null default '',
      section_id text, base_md text not null default '', proposed_md text not null check (char_length(proposed_md) between 1 and 20000),
      reason text not null check (char_length(reason) between 10 and 2000), status text not null default 'draft', author_ref text not null,
      author_name text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now());`);
  await d.exec(SQL);
  await d.exec(SQL);
  return d;
}
const row = (o) => ({ section: 'الأول', section_id: 's1', base_md: 'قديم', proposed_md: 'جديد', reason: 'توضيح الصياغة للقارئ', status: 'review', prev_id: null, prev_status: null, ...o });
const save = (d, rows) => d.query(`select leaders.book_proposals_save($1, 'w@x.sa', 'الكاتب', $2::jsonb) as ids`, [MOD, JSON.stringify(rows)]);
const count = async (d, t) => Number((await d.query(`select count(*)::int as n from leaders.${t}`)).rows[0].n);

describe('ترحيل 20261117100000_leaders_book_proposals_save', { timeout: 30000 }, () => {
  it('يحفظ الأقسام وسجل كل منها، ويعيد المعرّفات بالترتيب', async () => {
    const d = await db();
    const r = await save(d, [row(), row({ section: 'الثاني', section_id: 's2' })]);
    expect(r.rows[0].ids).toHaveLength(2);
    expect(await count(d, 'book_proposals')).toBe(2);
    expect((await d.query(`select action from leaders.audit_log order by id`)).rows.map((x) => x.action)).toEqual(['book.proposal', 'book.proposal']);
  });
  it('مقترح سابق تغيّرت حالته: P0409 باسم القسم، ولا يبقى شيء من العملية', async () => {
    const d = await db();
    const first = (await save(d, [row()])).rows[0].ids[0];
    await d.query(`update leaders.book_proposals set status = 'approved' where id = $1`, [first]);
    const before = [await count(d, 'book_proposals'), await count(d, 'audit_log')];
    await expect(save(d, [row({ section: 'جديد', section_id: 's9' }), row({ prev_id: first, prev_status: 'review', label: 'القسم الأول' })])).rejects.toMatchObject({ code: 'P0409', message: 'القسم الأول' });
    expect([await count(d, 'book_proposals'), await count(d, 'audit_log')]).toEqual(before);
  });
  it('خطأ قيد في القسم الثاني يُسقط الأول معه', async () => {
    const d = await db();
    await expect(save(d, [row(), row({ section: 'الثاني', reason: 'قصير' })])).rejects.toThrow();
    expect(await count(d, 'book_proposals')).toBe(0);
    expect(await count(d, 'audit_log')).toBe(0);
  });
  it('التعديل يحدّث صف كاتبه ويسجّله تعديلًا، ولا يمس مقترح غيره', async () => {
    const d = await db();
    const id = (await save(d, [row({ status: 'draft' })])).rows[0].ids[0];
    await save(d, [row({ prev_id: id, prev_status: 'draft', proposed_md: 'أحدث' })]);
    expect((await d.query(`select proposed_md from leaders.book_proposals where id = $1`, [id])).rows[0].proposed_md).toBe('أحدث');
    expect((await d.query(`select action from leaders.audit_log order by id desc limit 1`)).rows[0].action).toBe('book.proposal-edit');
    await expect(d.query(`select leaders.book_proposals_save($1, 'other@x.sa', 'غيره', $2::jsonb)`, [MOD, JSON.stringify([row({ prev_id: id, prev_status: 'draft' })])])).rejects.toMatchObject({ code: 'P0409' });
  });
  it('لا يستدعيها anon ولا authenticated', async () => {
    const d = await db();
    for (const role of ['anon', 'authenticated']) {
      await d.exec(`set role ${role}`);
      try { await expect(save(d, [row()])).rejects.toThrow(); } finally { await d.exec('reset role'); }
    }
  });
});
