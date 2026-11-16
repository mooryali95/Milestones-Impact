// ترحيل 20261116110000 (تثبيت كل دفعة على نسخة) على قاعدة مؤقتة: لقطته بشكل programSnapshot نفسه، ونسخة لكل برنامج
// بلا نسخة له متطلبات، ونسخة جديدة حين تختلف أحدث النسخ عما تمر به دفعة غير مثبتة، وتثبيت كل دفعة بلا نسخة بكل حالاتها
// دون مس المثبتة، والحارسان، وإعادة التشغيل بلا أثر.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { programDiff, programSnapshot, SNAP_COLUMNS_DROPPED } from '../../supabase/functions/leaders-api/logic.js';

const NAME = '20261116110000_leaders_program_version_pin';
const SQL = readFileSync(join(__dirname, `../../supabase/migrations/${NAME}.sql`), 'utf8');
const PA = '00000000-0000-0000-0000-00000000000a', PB = '00000000-0000-0000-0000-00000000000b', PE = '00000000-0000-0000-0000-00000000000e';
const BEFORE = `create role anon; create role authenticated; create schema leaders;
  create table leaders.schema_migrations (name text primary key);
  create table leaders.programs (id uuid primary key, name text not null, created_at timestamptz not null default now());
  create table leaders.journey_stages (program_id uuid not null, key text not null, sort smallint not null, title_ar text not null, active boolean not null default true,
    rules jsonb not null default '{}', updated_at timestamptz, primary key (program_id, key));
  create table leaders.stage_requirements (id uuid primary key, program_id uuid not null, stage_key text not null, code text not null, sort smallint not null default 0,
    title_ar text not null, kind text not null default 'check', required boolean not null default true, active boolean not null default true, config jsonb not null default '{}',
    updated_at timestamptz, updated_by text);
  create table leaders.program_versions (id uuid primary key default gen_random_uuid(), program_id uuid not null references leaders.programs(id) on delete cascade,
    number int not null check (number > 0), label text not null, data jsonb not null, created_by text, created_at timestamptz not null default now(), unique (program_id, number));
  create table leaders.cohorts (id uuid primary key default gen_random_uuid(), name text not null, program_id uuid not null references leaders.programs(id),
    program_version_id uuid references leaders.program_versions(id) on delete set null, status text not null default 'open', is_default boolean not null default false);
  create table leaders.audit_log (id bigserial primary key, actor_type text not null, actor text, action text not null, entity text not null, entity_id text, before jsonb, after jsonb);
  insert into leaders.programs (id, name, created_at) values ('${PA}', 'القادة', '2026-01-01'), ('${PB}', 'سفراء', '2026-02-01'), ('${PE}', 'فارغ', '2026-03-01');
  insert into leaders.journey_stages (program_id, key, sort, title_ar, rules, updated_at) values
    ('${PA}', 's2', 2, 'التطبيق', '{"mode":"required"}', now()), ('${PA}', 's1', 1, 'التمهيد', '{}', null), ('${PB}', 'b1', 1, 'الانطلاق', '{}', null);
  insert into leaders.stage_requirements (id, program_id, stage_key, code, sort, title_ar, config, updated_by) values
    ('00000000-0000-0000-0000-000000000101', '${PA}', 's2', 'B-TWO', 1, 'بند التطبيق', '{"n":2}', 'a@x'),
    ('00000000-0000-0000-0000-000000000102', '${PA}', 's1', 'A-ONE', 1, 'بند التمهيد', '{}', null),
    ('00000000-0000-0000-0000-000000000201', '${PB}', 'b1', 'C-ONE', 1, 'بند سفراء', '{}', null);
  -- سفراء: نسخة قديمة تختلف عن حاله الآن، ودفعة مثبتة عليها، وأخرى غير مثبتة
  insert into leaders.program_versions (id, program_id, number, label, data) values ('00000000-0000-0000-0000-0000000000f1', '${PB}', 1, 'قديمة', '{"stages":[],"requirements":[]}');
  insert into leaders.cohorts (name, program_id, program_version_id, status, is_default) values
    ('المفتوحة', '${PA}', null, 'open', true), ('مغلقة', '${PA}', null, 'closed', false),
    ('مثبتة', '${PB}', '00000000-0000-0000-0000-0000000000f1', 'running', false), ('سفراء غير مثبتة', '${PB}', null, 'running', false);`;

async function db() { const d = new PGlite(); await d.exec(BEFORE); await d.exec(SQL); return d; }
const rows = async (d, q) => (await d.query(q)).rows;

describe(`ترحيل ${NAME}`, { timeout: 30000 }, () => {
  it('الأعمدة المحذوفة من لقطة الترحيل هي أعمدة programSnapshot نفسها', () => {
    const dropped = [...SQL.matchAll(/to_jsonb\([sr]\)((?:\s*-\s*'[a-z_]+')+)/g)].map((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort());
    expect(dropped).toHaveLength(2);
    for (const cols of dropped) expect(cols).toEqual([...SNAP_COLUMNS_DROPPED].sort());
  });

  it('لقطة البرنامج بلا نسخة تطابق programSnapshot على الصفوف نفسها، وتُثبَّت عليها كل دفعاته بكل حالاتها', async () => {
    const d = await db();
    const [v] = await rows(d, `select id, number, label, data, created_by from leaders.program_versions where program_id = '${PA}'`);
    expect([v.number, v.label, v.created_by]).toEqual([1, 'النسخة 1: لقطة التأسيس', 'migration:20261116110000']);
    const st = await rows(d, `select * from leaders.journey_stages where program_id = '${PA}'`);
    const rq = await rows(d, `select * from leaders.stage_requirements where program_id = '${PA}'`);
    const js = JSON.parse(JSON.stringify(programSnapshot(st, rq)));
    expect(programDiff(v.data, js)).toEqual({ added: [], removed: [], changed: [], stages: { added: [], removed: [], changed: [] } });
    expect(v.data).toEqual(js);
    const cs = await rows(d, `select name, program_version_id from leaders.cohorts where program_id = '${PA}' order by name`);
    expect(cs.every((c) => c.program_version_id === v.id)).toBe(true);
  });

  it('برنامج عليه دفعة غير مثبتة وأحدث نسخه تختلف: نسخة جديدة بحاله الآن، والمثبتة تبقى على نسختها', async () => {
    const d = await db();
    const vs = await rows(d, `select id, number, label, jsonb_array_length(data->'requirements') n from leaders.program_versions where program_id = '${PB}' order by number`);
    expect(vs.map((v) => [v.number, v.n])).toEqual([[1, 0], [2, 1]]);
    expect(vs[1].label).toBe('لقطة التثبيت 2026-11-16');
    const cs = Object.fromEntries((await rows(d, `select name, program_version_id from leaders.cohorts where program_id = '${PB}'`)).map((c) => [c.name, c.program_version_id]));
    expect(cs['مثبتة']).toBe(vs[0].id);
    expect(cs['سفراء غير مثبتة']).toBe(vs[1].id);
    expect(await rows(d, `select count(*)::int n from leaders.program_versions where program_id = '${PE}'`)).toEqual([{ n: 0 }]);
    const log = await rows(d, `select action, count(*)::int n from leaders.audit_log group by action order by action`);
    expect(log).toEqual([{ action: 'cohort.pin', n: 3 }, { action: 'program.version', n: 2 }]);
  });

  it('أحدث نسخة مطابقة لحال البرنامج: لا نسخة جديدة، وتُثبَّت عليها', async () => {
    const d = new PGlite();
    await d.exec(BEFORE);
    await d.exec(`delete from leaders.cohorts where program_id = '${PB}'; delete from leaders.program_versions;`);
    // نسخة بترتيب غير ترتيب الترحيل: المقارنة بالمفاتيح والمعرفات
    const rq = await rows(d, `select * from leaders.stage_requirements where program_id = '${PA}'`);
    const st = await rows(d, `select * from leaders.journey_stages where program_id = '${PA}'`);
    const snap = programSnapshot(st, rq);
    snap.requirements.reverse();
    await d.query(`insert into leaders.program_versions (program_id, number, label, data) values ('${PA}', 4, 'الحالية', $1)`, [JSON.stringify(snap)]);
    await d.exec(SQL);
    expect(await rows(d, `select number from leaders.program_versions where program_id = '${PA}'`)).toEqual([{ number: 4 }]);
  });

  it('الحارسان: لا يُلغى تثبيت، ولا نسخة من برنامج آخر، ولا تتغير لقطة؛ والإعادة لا تكتب شيئًا', async () => {
    const d = await db();
    await expect(d.exec(`update leaders.cohorts set program_version_id = null where name = 'مثبتة'`)).rejects.toThrow(/لا يُلغى تثبيتها/);
    const [pa] = await rows(d, `select id from leaders.program_versions where program_id = '${PA}'`);
    await expect(d.exec(`update leaders.cohorts set program_version_id = '${pa.id}' where name = 'مثبتة'`)).rejects.toThrow(/لا تخص برنامجها/);
    await expect(d.exec(`update leaders.program_versions set data = '{}' where id = '${pa.id}'`)).rejects.toThrow(/لا تُعدَّل/);
    await d.exec(`update leaders.program_versions set label = 'اسم مصحح' where id = '${pa.id}'`);
    await d.exec(`begin; set local leaders.program_unpin = 'on'; update leaders.cohorts set program_version_id = null where name = 'مغلقة'; rollback;`);
    const count = async () => (await rows(d, `select (select count(*)::int from leaders.program_versions) v, (select count(*)::int from leaders.audit_log) a,
      (select count(*)::int from leaders.cohorts where program_version_id is null) u`))[0];
    const first = await count();
    expect(first.u).toBe(0);
    await d.exec(SQL);
    expect(await count()).toEqual(first);
    expect(await rows(d, `select count(*)::int n from leaders.schema_migrations where name = '${NAME}'`)).toEqual([{ n: 1 }]);
  });
});
