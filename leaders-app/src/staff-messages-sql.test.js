// ترحيل 20261129130000 (بريد الخبراء والمنسقين وصندوق الخبير) على قاعدة حقيقية (PGlite): آمن لإعادة التشغيل، وupsert
// المشارك القائم (on conflict participant_id) يبقى صالحًا، والصف لصاحب واحد لا غير، وحذف المشارك يمحو ما كُتب عنه في صناديق
// الخبراء (قرار المالك 3)، وحذف الخبير أو المنسق يمحو صندوقه وتفضيلاته.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const MIG = (n) => readFileSync(join(__dirname, `../../supabase/migrations/${n}.sql`), 'utf8');
const BEFORE = MIG('20261128200000_leaders_participant_messages');
const SQL = MIG('20261129130000_leaders_staff_messages');
const P = '0b6f2a52-6a3e-4c1e-9d55-1f1e2a3b4c5d';
const X = '5a1c2e3f-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const C = '7d8e9f0a-1b2c-4d3e-8f4a-5b6c7d8e9f0a';

async function db() {
  const d = new PGlite();
  await d.exec(`create role anon; create role authenticated; create role service_role; create schema leaders;
    create table leaders.schema_migrations (name text primary key);
    create table leaders.participants (id uuid primary key);
    create table leaders.experts (id uuid primary key);
    create table leaders.org_coordinators (id uuid primary key);
    create table leaders.mail_queue (id uuid primary key default gen_random_uuid());
    insert into leaders.participants values ('${P}'); insert into leaders.experts values ('${X}'); insert into leaders.org_coordinators values ('${C}');`);
  await d.exec(BEFORE);
  // صف قائم قبل الترحيل يبقى كما هو
  await d.exec(`insert into leaders.participant_mail_prefs (participant_id, muted) values ('${P}', '{journey}')`);
  await d.exec(SQL);
  await d.exec(SQL);
  return d;
}
const count = async (d, t) => Number((await d.query(`select count(*)::int n from leaders.${t}`)).rows[0].n);

describe('ترحيل بريد الخبراء والمنسقين', () => {
  it('آمن لإعادة التشغيل، والصف القائم باقٍ، وupsert المشارك على participant_id كما كان، ويُسجَّل في السجل', async () => {
    const d = await db();
    await d.exec(`insert into leaders.participant_mail_prefs (participant_id, muted) values ('${P}', '{sessions}')
      on conflict (participant_id) do update set muted = excluded.muted`);
    const r = (await d.query(`select muted, id from leaders.participant_mail_prefs where participant_id = '${P}'`)).rows;
    expect(r).toHaveLength(1);
    expect(r[0].muted).toEqual(['sessions']);
    expect(r[0].id).toBeTruthy();
    expect((await d.query(`select name from leaders.schema_migrations`)).rows.map((x) => x.name)).toContain('20261129130000_leaders_staff_messages');
  });
  it('تفضيلات الخبير والمنسق بـupsert على عمودهما، وصاحب واحد لا غير', async () => {
    const d = await db();
    for (const m of ['{expert_digest}', '{}']) await d.exec(`insert into leaders.participant_mail_prefs (expert_id, muted) values ('${X}', '${m}') on conflict (expert_id) do update set muted = excluded.muted`);
    await d.exec(`insert into leaders.participant_mail_prefs (coordinator_id, muted) values ('${C}', '{coord_digest}') on conflict (coordinator_id) do update set muted = excluded.muted`);
    expect(await count(d, 'participant_mail_prefs')).toBe(3);
    await expect(d.exec(`insert into leaders.participant_mail_prefs (muted) values ('{}')`)).rejects.toThrow();
    await expect(d.exec(`insert into leaders.participant_mail_prefs (participant_id, expert_id) values ('${P}', '${X}')`)).rejects.toThrow();
    await expect(d.exec(`insert into leaders.participant_notifications (category, title) values ('x', 'y')`)).rejects.toThrow();
  });
  it('حذف المشارك يمحو إشعارات الخبراء عنه، وحذف الخبير والمنسق يمحو صندوقهما وتفضيلاتهما', async () => {
    const d = await db();
    await d.exec(`insert into leaders.participant_notifications (expert_id, about_participant_id, category, title) values ('${X}', '${P}', 'expert_work', 'رفع طلب توجيه');
      insert into leaders.participant_notifications (expert_id, category, title) values ('${X}', 'expert_digest', 'ملخص النماذج');
      insert into leaders.participant_notifications (coordinator_id, category, title) values ('${C}', 'coord_digest', 'ملخص الجهة');
      insert into leaders.participant_mail_prefs (expert_id, muted) values ('${X}', '{expert_digest}');`);
    await d.exec(`delete from leaders.participants where id = '${P}'`);
    expect((await d.query(`select title from leaders.participant_notifications where expert_id is not null`)).rows.map((r) => r.title)).toEqual(['ملخص النماذج']);
    await d.exec(`delete from leaders.experts where id = '${X}'; delete from leaders.org_coordinators where id = '${C}'`);
    expect(await count(d, 'participant_notifications')).toBe(0);
    expect(await count(d, 'participant_mail_prefs')).toBe(0);
  });
});
