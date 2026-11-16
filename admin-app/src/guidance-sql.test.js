// ترحيل 20261116120000 («التوجيه والإرشاد» G2) على قاعدة مؤقتة: ضمانات v4 في القاعدة نفسها.
// يُعاد بأمان، ولا يصل anon ولا authenticated إلى المحادثات ولا الدوال، وحذف المشارك يحذف محادثته وحدها،
// والحدان لكل مشارك ولا يحسب أحد على غيره، والمرفوض لا يُحسب، والسقف اليومي، والحذف بعد مدة الحفظ من الإعدادات.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(join(__dirname, '../../supabase/migrations/20261116120000_leaders_guidance.sql'), 'utf8');
const P1 = '00000000-0000-0000-0000-000000000001';
const P2 = '00000000-0000-0000-0000-000000000002';
const BEFORE = `create role anon; create role authenticated; create role service_role; create schema leaders;
  create table leaders.schema_migrations (name text primary key);
  create table leaders.participants (id uuid primary key, full_name text);
  create table leaders.app_settings (key text primary key, value jsonb);
  insert into leaders.participants values ('${P1}', 'سارة'), ('${P2}', 'خالد');`;

async function db() {
  const d = new PGlite();
  await d.exec(BEFORE);
  await d.exec(SQL);
  await d.exec(SQL);
  return d;
}
const DAY = '2026-11-15T21:00:00Z';
const MONTH = '2026-10-31T21:00:00Z';
const claim = async (d, p, o = {}) => Number((await d.query(
  'select leaders.guidance_claim($1, $2, $3, $4, $5, $6, $7, $8) as id',
  [p, o.body || 'كيف أبدأ؟', 'program', null, o.day || DAY, o.month || MONTH, o.daily ?? 8, o.monthly ?? 30],
)).rows[0].id);

describe('ترحيل 20261116120000_leaders_guidance', { timeout: 30000 }, () => {
  it('يُعاد بأمان ويُسجَّل، وRLS مفعّل على الجدولين', async () => {
    const d = await db();
    expect((await d.query('select name from leaders.schema_migrations')).rows).toEqual([{ name: '20261116120000_leaders_guidance' }]);
    const rls = (await d.query("select relname, relrowsecurity from pg_class where relname in ('guidance_messages', 'guidance_spend_daily') order by relname")).rows;
    expect(rls).toEqual([{ relname: 'guidance_messages', relrowsecurity: true }, { relname: 'guidance_spend_daily', relrowsecurity: true }]);
  });

  it('لا يصل anon ولا authenticated إلى المحادثات ولا السجل ولا الدوال', async () => {
    const d = await db();
    await claim(d, P1);
    for (const role of ['anon', 'authenticated']) {
      await d.exec(`set role ${role}`);
      try {
        await expect(d.query('select * from leaders.guidance_messages')).rejects.toThrow();
        await expect(d.query('select * from leaders.guidance_spend_daily')).rejects.toThrow();
        await expect(d.query(`select leaders.guidance_claim('${P1}', 'x', 'program', null, now(), now(), 8, 30)`)).rejects.toThrow();
        await expect(d.query('select leaders.guidance_purge_expired()')).rejects.toThrow();
      } finally { await d.exec('reset role'); }
    }
  });

  it('الحدان لكل مشارك: حد اليوم ثم حد الشهر، وأسئلة مشارك لا تُحسب على غيره', async () => {
    const d = await db();
    for (let i = 0; i < 3; i++) expect(await claim(d, P1, { daily: 3 })).toBeGreaterThan(0);
    expect(await claim(d, P1, { daily: 3 })).toBe(-1);
    expect(await claim(d, P2, { daily: 3 })).toBeGreaterThan(0);
    // يوم جديد: حد اليوم يعود، وحد الشهر يبقى
    expect(await claim(d, P1, { daily: 3, monthly: 3, day: '2099-01-01T00:00:00Z' })).toBe(-2);
  });

  it('السؤال المرفوض قبل النموذج لا يُحسب من الحد', async () => {
    const d = await db();
    await d.query(`insert into leaders.guidance_messages (participant_id, role, body, verdict) select $1, 'user', 'حل الاختبار', 'refused' from generate_series(1, 5)`, [P1]);
    expect(await claim(d, P1, { daily: 1 })).toBeGreaterThan(0);
    expect(await claim(d, P1, { daily: 1 })).toBe(-1);
  });

  it('حذف المشارك يحذف محادثته وحدها', async () => {
    const d = await db();
    await claim(d, P1);
    await claim(d, P2);
    await d.query('delete from leaders.participants where id = $1', [P1]);
    expect((await d.query('select participant_id from leaders.guidance_messages')).rows).toEqual([{ participant_id: P2 }]);
  });

  it('السقف اليومي ذري: يُرفض ما يتجاوزه، والتسوية لا تنزل تحت الصفر', async () => {
    const d = await db();
    const res = async (m) => (await d.query("select leaders.guidance_spend_reserve('2026-11-16', $1, 5000000) as t", [m])).rows[0].t;
    expect(Number(await res(3000000))).toBe(3000000);
    expect(await res(2500000)).toBe(null);
    expect(Number(await res(2000000))).toBe(5000000);
    expect(Number((await d.query("select leaders.guidance_spend_settle('2026-11-16', -9000000) as t")).rows[0].t)).toBe(0);
  });

  it('الحذف بعد مدة الحفظ من الإعدادات، و90 يومًا حين لا قيمة صالحة', async () => {
    const d = await db();
    const add = (days) => d.query(`insert into leaders.guidance_messages (participant_id, role, body, created_at) values ($1, 'user', 'س', now() - make_interval(days => $2::int))`, [P1, days]);
    await add(10); await add(40); await add(100);
    expect(Number((await d.query('select leaders.guidance_purge_expired() as n')).rows[0].n)).toBe(1);
    await d.query(`insert into leaders.app_settings values ('guidance', '{"retention_days": 30}')`);
    expect(Number((await d.query('select leaders.guidance_purge_expired() as n')).rows[0].n)).toBe(1);
    await d.query(`update leaders.app_settings set value = '{"retention_days": "3; drop table x"}' where key = 'guidance'`);
    await add(60);
    expect(Number((await d.query('select leaders.guidance_purge_expired() as n')).rows[0].n)).toBe(0);
    expect(Number((await d.query('select count(*) as n from leaders.guidance_messages')).rows[0].n)).toBe(2);
  });
});
