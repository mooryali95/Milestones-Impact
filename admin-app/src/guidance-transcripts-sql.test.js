// ترحيل 20261116180000 («التوجيه والإرشاد» H3): عمود الإخفاء، وجدول منح المالك، ودالة القائمة بلا نص.
// القائمة تجمع لكل مشارك أعداده وكلفته وعدد المخفي، والمخفي يبقى محسوبًا من الحد (guidance_claim لا يستثنيه)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname, '../../supabase/migrations');
const G2 = readFileSync(join(dir, '20261116120000_leaders_guidance.sql'), 'utf8');
const G3 = readFileSync(join(dir, '20261116130000_leaders_guidance_counts.sql'), 'utf8');
const H3 = readFileSync(join(dir, '20261116180000_leaders_guidance_transcripts.sql'), 'utf8');
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

async function db() {
  const d = new PGlite();
  await d.exec(`create role anon; create role authenticated; create role service_role; create schema leaders; create schema cron;
    create function cron.schedule(a text, b text, c text) returns bigint language sql as 'select 1::bigint';
    create function cron.unschedule(a text) returns boolean language sql as 'select true';
    create table leaders.schema_migrations (name text primary key);
    create table leaders.app_settings (key text primary key, value jsonb);
    create table leaders.participants (id uuid primary key);
    insert into leaders.participants values ('${P1}'), ('${P2}');`);
  await d.exec(G2);
  await d.exec(G3);
  await d.exec(H3);
  await d.exec(H3);
  return d;
}

describe('ترحيل 20261116180000_leaders_guidance_transcripts', { timeout: 30000 }, () => {
  it('يُعاد بأمان ويُسجَّل', async () => {
    const d = await db();
    expect((await d.query(`select name from leaders.schema_migrations where name like '%transcripts'`)).rows).toEqual([{ name: '20261116180000_leaders_guidance_transcripts' }]);
  });
  it('القائمة: صف لكل مشارك بأعداده وكلفته وعدد المخفي، الأحدث أولًا', async () => {
    const d = await db();
    await d.exec(`insert into leaders.guidance_messages (participant_id, role, body, verdict, cost_micros, hidden_at, created_at) values
      ('${P1}', 'user', 'س', 'answered', null, now(), now() - interval '2 hours'),
      ('${P1}', 'assistant', 'ج', 'unsure', 30000, now(), now() - interval '2 hours'),
      ('${P2}', 'user', 'س', 'answered', null, null, now() - interval '1 hour'),
      ('${P2}', 'user', 'قديم', 'answered', null, null, now() - interval '100 days')`);
    const r = (await d.query(`select * from leaders.guidance_conversations(now() - interval '90 days', 50)`)).rows;
    expect(r.map((x) => [x.participant_id, x.asked, x.unsure, Number(x.micros), x.hidden])).toEqual([[P2, 1, 0, 0, 0], [P1, 1, 1, 30000, 2]]);
  });
  it('المخفي محسوب من حد اليوم: الإخفاء لا يفتح أسئلة جديدة', async () => {
    const d = await db();
    await d.exec(`insert into leaders.guidance_messages (participant_id, role, body, verdict, hidden_at) values ('${P1}', 'user', 'س', 'answered', now())`);
    const r = (await d.query(`select leaders.guidance_claim('${P1}', 'سؤال', 'program', null, now() - interval '1 hour', now() - interval '1 day', 1, 30) as id`)).rows[0];
    expect(Number(r.id)).toBe(-1);
  });
  it('المنح صف لكل مدير، ولا يصل anon ولا authenticated إلى المنح ولا الدالة', async () => {
    const d = await db();
    await d.query(`insert into leaders.guidance_transcript_grants (admin_id, admin_email, granted_by) values ('a1', 'super@x.sa', 'owner@x.sa')`);
    await expect(d.query(`insert into leaders.guidance_transcript_grants (admin_id, admin_email, granted_by) values ('a1', 'super@x.sa', 'owner@x.sa')`)).rejects.toThrow(/duplicate|unique/);
    for (const role of ['anon', 'authenticated']) {
      await d.exec(`set role ${role}`);
      try {
        await expect(d.query('select * from leaders.guidance_transcript_grants')).rejects.toThrow();
        await expect(d.query(`select * from leaders.guidance_conversations(now(), 5)`)).rejects.toThrow();
      } finally { await d.exec('reset role'); }
    }
  });
});
