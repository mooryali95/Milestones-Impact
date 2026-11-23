// ترحيل 20261127100000 (بوابتان، والباقي ملاحظات) على قاعدة مؤقتة حقيقية (PGlite):
// الفصول الخمسة يكفيها التسليم، وبطاقة المبادرة تبقى بوابة اعتماد — في الصفوف الحية وفي نسخ الرحلة المثبتة عليها الدفعات،
// وما لم يمسه الترحيل يبقى كما هو، والإعادة بلا أثر.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const NAME = '20261127100000_leaders_model_review_light';
const SQL = readFileSync(join(__dirname, `../../supabase/migrations/${NAME}.sql`), 'utf8');
const req = (code, accept, extra = {}) => ({ code, kind: 'model', stage_key: 's', sort: 0, needs_review: false, config: { model_key: 'm', accept }, ...extra });
const VERSION = { stages: [], requirements: [req('O-MREG', 'reviewed'), req('CP-CARD', 'submitted'), req('L-PLAN', 'reviewed'), req('X-OTHER', 'reviewed'), { code: 'O-MREG', kind: 'reading', config: { accept: 'reviewed' } }] };
const BEFORE = `create role anon; create role authenticated; create role service_role;
  create schema leaders;
  create table leaders.schema_migrations (name text primary key);
  create table leaders.stage_requirements (id serial primary key, code text, kind text, config jsonb, help_ar text, needs_review boolean default false);
  create table leaders.model_submissions (id serial primary key, status text, submitted_at timestamptz);
  create table leaders.program_versions (id serial primary key, data jsonb not null);
  insert into leaders.stage_requirements (code, kind, config, help_ar) values
    ('O-MREG', 'model', '{"accept":"reviewed"}', 'يكتمل من نموذج «سجل» في مكتبة النماذج حين يقيّمه المستشار، وهو فصل في وثيقة مبادرتك.'),
    ('CP-CARD', 'model', '{"accept":"submitted"}', null),
    ('X-OTHER', 'model', '{"accept":"reviewed"}', null);
  insert into leaders.program_versions (data) values ('${JSON.stringify(VERSION)}'), ('{"stages":[],"requirements":[]}');`;

async function db() { const d = new PGlite(); await d.exec(BEFORE); await d.exec(SQL); return d; }
const live = async (d) => Object.fromEntries((await d.query(`select code, config->>'accept' a, needs_review n, help_ar h from leaders.stage_requirements`)).rows.map((r) => [r.code, r]));
const version = async (d) => (await d.query('select data from leaders.program_versions order by id limit 1')).rows[0].data.requirements;

describe(`ترحيل ${NAME}`, { timeout: 60000 }, () => {
  it('الصفوف الحية: الفصول يكفيها التسليم، والبطاقة بوابة، وغيرها لا يُمس', async () => {
    const d = await db();
    const r = await live(d);
    expect(r['O-MREG'].a).toBe('submitted');
    expect(r['O-MREG'].h).toContain('حين تسلّمه');
    expect(r['CP-CARD']).toMatchObject({ a: 'reviewed', n: true });
    expect(r['X-OTHER'].a).toBe('reviewed');
  });

  it('نسخ الرحلة المثبتة: يسري التغيير نفسه، ويحفظ الترتيب وبقية البنود، والنسخة الفارغة كما هي', async () => {
    const d = await db();
    const v = await version(d);
    expect(v.map((x) => `${x.code}:${x.kind}:${x.config.accept}`)).toEqual(['O-MREG:model:submitted', 'CP-CARD:model:reviewed', 'L-PLAN:model:submitted', 'X-OTHER:model:reviewed', 'O-MREG:reading:reviewed']);
    expect(v[1].needs_review).toBe(true);
    expect((await d.query('select data from leaders.program_versions order by id offset 1')).rows[0].data).toEqual({ stages: [], requirements: [] });
    expect((await d.query('select count(*)::int n from leaders.backup_20261127_program_versions')).rows[0].n).toBe(1);
  });

  it('الإعادة بلا أثر', async () => {
    const d = await db();
    const before = JSON.stringify(await version(d));
    await d.exec(SQL);
    expect(JSON.stringify(await version(d))).toBe(before);
    expect((await live(d))['O-MREG'].a).toBe('submitted');
  });
});
