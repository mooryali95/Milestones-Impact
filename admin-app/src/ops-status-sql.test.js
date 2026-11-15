// leaders.ops_status: كتابات سلاك تصل من نسخ كثيرة بلا ترتيب، فالمشغّل يبقي الأحدث ويُسقط المكرر خلال دقيقة،
// ونجاح نسخة بعد خطأ نسخة أخرى يُكتب دائمًا (لا تحجبه ذاكرة نسخة).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(join(__dirname, '../../supabase/migrations/20261115140000_leaders_ops_status.sql'), 'utf8');
const T0 = Date.parse('2026-11-15T12:00:00Z');
const at = (s) => new Date(T0 + s * 1e3).toISOString();

async function db() {
  const d = new PGlite();
  await d.exec(`create role anon; create role authenticated; create role service_role; create schema leaders;
    create table leaders.schema_migrations (name text primary key);`);
  await d.exec(SQL);
  await d.exec(SQL);
  return d;
}
// كما يكتب recordSlack عبر PostgREST: upsert بأعمدة النتيجة وحدها
const ok = (d, s) => d.query(`insert into leaders.ops_status (channel, ok_at, updated_at) values ('slack', $1, $1)
  on conflict (channel) do update set ok_at = excluded.ok_at, updated_at = excluded.updated_at`, [at(s)]);
const err = (d, s, code) => d.query(`insert into leaders.ops_status (channel, error_at, error, updated_at) values ('slack', $1, $2, $1)
  on conflict (channel) do update set error_at = excluded.error_at, error = excluded.error, updated_at = excluded.updated_at`, [at(s), code]);
const row = async (d) => {
  const r = (await d.query(`select ok_at, error_at, error from leaders.ops_status where channel = 'slack'`)).rows[0];
  const iso = (v) => (v ? new Date(v).toISOString() : null);
  return { ok_at: iso(r.ok_at), error_at: iso(r.error_at), error: r.error };
};

describe('leaders.ops_status_keep_latest', () => {
  it('نجاح نسخة بعد خطأ نسخة أخرى يُكتب ولو كتبت النسخة نجاحًا قبل ثوان', async () => {
    const d = await db();
    await ok(d, 0);
    await err(d, 5, 'timeout');
    await ok(d, 20);
    expect(await row(d)).toEqual({ ok_at: at(20), error_at: at(5), error: 'timeout' });
  });
  it('كتابة متأخرة الوصول لا تعيد الوقت إلى الوراء، في النجاح والخطأ', async () => {
    const d = await db();
    await err(d, 2, 'invalid_auth');
    await ok(d, 3);
    await ok(d, 1);
    await err(d, 0, 'timeout');
    expect(await row(d)).toEqual({ ok_at: at(3), error_at: at(2), error: 'invalid_auth' });
    // والعكس: خطأ أحدث لا يخفيه نجاح أقدم وصل بعده
    await err(d, 90, 'not_in_channel');
    await ok(d, 60);
    expect(await row(d)).toEqual({ ok_at: at(60), error_at: at(90), error: 'not_in_channel' });
  });
  it('النتيجة نفسها خلال دقيقة لا تُكتب، وبعد الدقيقة تُكتب', async () => {
    const d = await db();
    await ok(d, 0);
    await ok(d, 30);
    expect((await row(d)).ok_at).toBe(at(0));
    await ok(d, 61);
    expect((await row(d)).ok_at).toBe(at(61));
    await err(d, 70, 'channel_not_found');
    await err(d, 80, 'channel_not_found');
    expect((await row(d)).error_at).toBe(at(70));
    // رمز خطأ آخر يُكتب فورًا
    await err(d, 85, 'invalid_auth');
    expect(await row(d)).toEqual({ ok_at: at(61), error_at: at(85), error: 'invalid_auth' });
  });
});
