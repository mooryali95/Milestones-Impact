// ترحيل 20261128100000 على قاعدة مؤقتة حقيقية (PGlite): نقل المشارك بين المراحل في معاملة واحدة (apply_stage_move)،
// والاستهلاك مع الربط (redeem_and_link_sponsor_code) يلغي الاستهلاك إن تعذّر الربط، وحالة المهمة بلا pg_cron، وإعادة التشغيل بلا أثر.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const NAME = '20261128100000_leaders_atomic_and_health';
const SQL = readFileSync(join(__dirname, `../../supabase/migrations/${NAME}.sql`), 'utf8');
const CODES = readFileSync(join(__dirname, '../../supabase/migrations/20261126100000_leaders_sponsor_codes.sql'), 'utf8');
const PROG = '00000000-0000-4000-8000-000000000700', ORG = '00000000-0000-4000-8000-000000000801', OTHER = '00000000-0000-4000-8000-000000000802';
const P = (n) => `00000000-0000-4000-8000-00000000090${n}`;
const BEFORE = `create role anon; create role authenticated; create role service_role;
  create schema leaders;
  create table leaders.schema_migrations (name text primary key);
  create table leaders.programs (id uuid primary key);
  create table leaders.organizations (id uuid primary key, status text not null default 'active', invite_code text);
  create table leaders.participants (id uuid primary key, organization_id uuid, org_via text);
  create table leaders.participant_stage_overrides (
    participant_id uuid not null references leaders.participants(id) on delete cascade,
    program_id uuid not null references leaders.programs(id) on delete cascade,
    stage_key text not null, action text not null check (action in ('open', 'complete', 'skip')),
    note text check (char_length(note) <= 1000), by_email text, created_at timestamptz not null default now(),
    primary key (participant_id, program_id, stage_key));
  insert into leaders.programs values ('${PROG}');
  insert into leaders.organizations (id) values ('${ORG}'), ('${OTHER}');
  insert into leaders.participants (id) values ('${P(1)}'), ('${P(2)}'), ('${P(3)}');`;

async function db() { const d = new PGlite(); await d.exec(BEFORE); await d.exec(CODES); await d.exec(SQL); return d; }
const ov = async (d, p = P(1)) => Object.fromEntries((await d.query('select stage_key, action from leaders.participant_stage_overrides where participant_id = $1', [p])).rows.map((r) => [r.stage_key, r.action]));
const move = (d, clears, writes, note = 'سبب') => d.query('select leaders.apply_stage_move($1, $2, $3, $4::jsonb, $5, $6) n', [P(1), PROG, clears, JSON.stringify(writes), note, 'a@x.sa']);

describe(`ترحيل ${NAME}`, { timeout: 60000 }, () => {
  it('apply_stage_move: يحذف ويكتب معًا، ويحدّث القائم، والملاحظة مقصوصة', async () => {
    const d = await db();
    await d.exec(`insert into leaders.participant_stage_overrides (participant_id, program_id, stage_key, action) values ('${P(1)}', '${PROG}', 'x', 'skip'), ('${P(1)}', '${PROG}', 'a', 'open'), ('${P(2)}', '${PROG}', 'x', 'skip')`);
    expect((await move(d, ['x'], [{ stage_key: 'a', action: 'complete' }, { stage_key: 'b', action: 'skip' }], 'س'.repeat(1500))).rows[0].n).toBe(2);
    expect(await ov(d)).toEqual({ a: 'complete', b: 'skip' });
    expect(await ov(d, P(2))).toEqual({ x: 'skip' });   // غيره لا يُمس
    const r = (await d.query(`select char_length(note) n, by_email from leaders.participant_stage_overrides where stage_key = 'a'`)).rows[0];
    expect(r).toEqual({ n: 1000, by_email: 'a@x.sa' });
  });

  it('apply_stage_move: كتابة غير صالحة ترمي فلا يُحذف شيء ولا يُكتب (المعاملة كلها)', async () => {
    const d = await db();
    await d.exec(`insert into leaders.participant_stage_overrides (participant_id, program_id, stage_key, action) values ('${P(1)}', '${PROG}', 'x', 'skip')`);
    await expect(move(d, ['x'], [{ stage_key: 'a', action: 'complete' }, { stage_key: 'b', action: 'burn' }])).rejects.toThrow(/bad write/);
    expect(await ov(d)).toEqual({ x: 'skip' });
  });

  it('redeem_and_link_sponsor_code: يعدّ ويربط معًا، ومن صار له جهة يُلغى استهلاكه، والرمز المستنفد لا يربط', async () => {
    const d = await db();
    await d.exec(`insert into leaders.sponsor_codes (organization_id, code, max_uses) values ('${ORG}', 'link-code-01', 2)`);
    const link = (p) => d.query('select * from leaders.redeem_and_link_sponsor_code($1, $2)', ['link-code-01', p]);
    expect((await link(P(1))).rows[0]).toEqual({ org_id: ORG, reason: 'ok' });
    expect((await d.query(`select organization_id, org_via from leaders.participants where id = '${P(1)}'`)).rows[0]).toEqual({ organization_id: ORG, org_via: 'link' });
    await d.exec(`update leaders.participants set organization_id = '${OTHER}' where id = '${P(2)}'`);
    await expect(link(P(2))).rejects.toThrow(/already linked/);
    const used = async () => (await d.query(`select used from leaders.sponsor_codes where code = 'link-code-01'`)).rows[0].used;
    expect(await used()).toBe(1);
    expect((await d.query(`select count(*)::int n from leaders.sponsor_code_uses where participant_id = '${P(2)}'`)).rows[0].n).toBe(0);
    expect((await link(P(3))).rows[0].reason).toBe('ok');
    await d.exec(`insert into leaders.participants (id) values ('${P(4)}')`);
    expect((await link(P(4))).rows[0]).toEqual({ org_id: null, reason: 'exhausted' });
    expect((await d.query(`select organization_id from leaders.participants where id = '${P(4)}'`)).rows[0].organization_id).toBe(null);
    expect(await used()).toBe(2);
  });

  it('cron_job_status بلا pg_cron: «غير موجودة» بلا خطأ، وإعادة التشغيل بلا أثر، والسجل', async () => {
    const d = await db();
    expect((await d.query(`select * from leaders.cron_job_status('leaders-expert-offers')`)).rows[0]).toEqual({ job_exists: false, job_active: false, last_status: null, last_run: null });
    await d.exec(SQL);
    expect((await d.query(`select name from leaders.schema_migrations where name = '${NAME}'`)).rows.length).toBe(1);
  });

  it('cron_job_status مع جدولي cron: المهمة وحالتها وآخر تشغيل', async () => {
    const d = await db();
    await d.exec(`create schema cron; create table cron.job (jobid bigint primary key, jobname text, active boolean, command text);
      create table cron.job_run_details (jobid bigint, status text, start_time timestamptz, end_time timestamptz);
      insert into cron.job values (7, 'leaders-expert-offers', true, 'select 1');
      insert into cron.job_run_details values (7, 'succeeded', '2026-11-23T10:17:00Z', '2026-11-23T10:17:02Z'), (7, 'failed', '2026-11-23T11:17:00Z', '2026-11-23T11:17:01Z');`);
    const r = (await d.query(`select * from leaders.cron_job_status('leaders-expert-offers')`)).rows[0];
    expect([r.job_exists, r.job_active, r.last_status]).toEqual([true, true, 'failed']);
  });
});
