// المراحل الأربع (docs/content/2026-11-26-تصور-المرحلة-{1,2,3,4}-*.md): كل ملف تحقق قراءة فقط يُشغَّل على قاعدة PGlite
// فيها كل الترحيلات (اللقطة المرجعية ثم كل ترحيلات المستودع مرة ثانية، فتُختبر إعادة التشغيل أيضًا)، كما في lighten-migration.test.js.
// الحارس: كل فحص صف واحد فيه ok منطقي وdetail نص، ولا يكتب شيئًا، ويرى ما يُفترض أن يعده.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PRELUDE = `create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create function auth.role() returns text language sql as 'select null::text';
  create function auth.jwt() returns jsonb language sql as 'select null::jsonb';`;
const FILES = ['verify-group-members-cleanup', 'verify-e360-rule', 'verify-reading-track', 'verify-single-cohort'];
const checksOf = (sql) => sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
const failed = [];
let db;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PRELUDE);
  await db.exec(read('supabase/schema/baseline.sql'));
  const files = readdirSync(join(ROOT, 'supabase/migrations')).filter((x) => x.endsWith('.sql')).sort();
  for (const f of files.filter((x) => x >= '20261129170000')) {
    try { await db.exec(read(`supabase/migrations/${f}`)); } catch (e) { failed.push(`${f}: ${e.message}`); await db.exec('rollback').catch(() => {}); }
    await db.exec('discard temp').catch(() => {});
  }
}, 240000);

const run = async (name) => {
  const out = [];
  for (const q of checksOf(read(`scripts/db/${name}.sql`))) {
    const r = (await db.query(q)).rows;
    expect(r, `${name}: ${q.slice(0, 80)}`).toHaveLength(1);
    expect(typeof r[0].ok).toBe('boolean');
    expect(typeof r[0].detail).toBe('string');
    out.push(r[0]);
  }
  return out;
};

describe('ملفات التحقق للمراحل الأربع على قاعدة بكل الترحيلات', { timeout: 120000 }, () => {
  it('ترحيلات المراحل تعاد على اللقطة بلا خطأ (آمنة لإعادة التشغيل)', () => {
    expect(failed).toEqual([]);
  });

  it.each(FILES)('%s: كل فحص قراءة فقط وصف واحد ok/detail', async (name) => {
    const sql = read(`scripts/db/${name}.sql`);
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate|drop|alter)\s/i);
    expect(sql).toMatch(/^-- 1\) /m);
    const rows = await run(name);
    expect(rows.length).toBe((sql.match(/^-- \d+\) /gm) || []).length);
  });

  it('قاعدة E-360: من دون الحد وله مقيّم ينتظر يُعد، ومن لا ينتظر له أحد يُعد «بعدد أقل»', async () => {
    const P1 = '00000000-0000-4000-8000-000000000901', P2 = '00000000-0000-4000-8000-000000000902';
    await db.exec(`insert into leaders.participants (id, full_name, email) values ('${P1}', 'أ', 'a@example.test'), ('${P2}', 'ب', 'b@example.test')`);
    const I = (await db.query(`select id from leaders.instruments limit 1`)).rows[0]?.id
      ?? (await db.query(`insert into leaders.instruments (key, title_ar, kind) values ('t-post', 'ت', 'post') returning id`)).rows[0].id;
    const mk = (pid, status, i) => `insert into leaders.raters (participant_id, instrument_id, email, relation, token_hash, status, phase)
      values ('${pid}', '${I}', 'r${pid.slice(-1)}${i}@example.test', 'peer', 'tok${pid.slice(-1)}${i}', '${status}', 'post')`;
    await db.exec([mk(P1, 'submitted', 1), mk(P1, 'awaiting', 2), mk(P2, 'submitted', 1)].join(';\n'));
    const [back, fewer] = await run('verify-e360-rule');
    expect(back.ok).toBe(false);
    expect(back.detail).toContain(P1);
    expect(fewer.detail).toBe('بعدد أقل 1');
  });
});
