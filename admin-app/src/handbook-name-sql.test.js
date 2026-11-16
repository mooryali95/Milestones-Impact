// ترحيل 20261116050000 (اسم «كتاب القائد») على قاعدة مؤقتة: يستبدل «كتيب» بكل صيغها في نصوص الرحلة والمسارات والمختبر،
// ويحفظ النسخة السابقة، ولا يمس غير ما فيه «كتيب»، ولا سجلات المستخدمين، ويُعاد تشغيله بأمان.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(join(__dirname, '../../supabase/migrations/20261116050000_leaders_handbook_name.sql'), 'utf8');
const BEFORE = `create role anon; create role authenticated; create schema leaders;
  create table leaders.schema_migrations (name text primary key);
  create table leaders.journey_stages (program_id uuid not null, key text not null, title_ar text not null, description_ar text, activities_ar text, outcome_ar text, builds_on_ar text, primary key (program_id, key));
  create table leaders.stage_requirements (id uuid primary key default gen_random_uuid(), code text, title_ar text not null, help_ar text);
  create table leaders.tracks (key text primary key, title_ar text not null, summary_ar text, journey_ar text);
  create table leaders.track_profiles (key text primary key, title_ar text not null, summary_ar text not null, journey_ar text not null);
  create table leaders.lab_items (id uuid primary key default gen_random_uuid(), key text not null, title_ar text not null, spec jsonb not null);
  create table leaders.audit_log (id bigserial primary key, detail text);
  insert into leaders.journey_stages values ('00000000-0000-0000-0000-000000000001', 'learn', 'التعلم', null, 'اقرأ أبواب الكتيب وابنِ نماذجه', 'كتيبك مكتمل', null);
  insert into leaders.stage_requirements (code, title_ar, help_ar) values ('T-MB', 'الأيام التدريبية بالكتيب', 'من الكتيب: باب لكل يوم'), ('X', 'بلا تغيير', 'نص عادي');
  insert into leaders.tracks values ('M1I1L1', 'مسار', null, 'كتيبك مركّب من الأطر الثلاثة');
  insert into leaders.track_profiles values ('milestone-beginner', 'من الخطة', 'ملخص', 'يبدأ من كتيب القائد');
  insert into leaders.lab_items (key, title_ar, spec) values ('risk', 'السجل', '{"hint": "ارجع إلى الكتيب", "n": 1}');
  insert into leaders.audit_log (detail) values ('حفظ الكتيب');`;

async function db() { const d = new PGlite(); await d.exec(BEFORE); await d.exec(SQL); return d; }
const one = async (d, q) => (await d.query(q)).rows[0];

describe('ترحيل 20261116050000_leaders_handbook_name', { timeout: 30000 }, () => {
  it('يستبدل «كتيب» بكل صيغها في الحقول المحددة، ويحفظ النسخة السابقة، ولا يمس السجلات', async () => {
    const d = await db();
    expect(await one(d, 'select activities_ar, outcome_ar from leaders.journey_stages')).toEqual({ activities_ar: 'اقرأ أبواب الكتاب وابنِ نماذجه', outcome_ar: 'كتابك مكتمل' });
    expect((await d.query("select title_ar, help_ar from leaders.stage_requirements order by code")).rows).toEqual([
      { title_ar: 'الأيام التدريبية بالكتاب', help_ar: 'من الكتاب: باب لكل يوم' }, { title_ar: 'بلا تغيير', help_ar: 'نص عادي' }]);
    expect((await one(d, 'select journey_ar from leaders.tracks')).journey_ar).toBe('كتابك مركّب من الأطر الثلاثة');
    expect((await one(d, 'select journey_ar from leaders.track_profiles')).journey_ar).toBe('يبدأ من كتاب القائد');
    expect((await one(d, 'select spec from leaders.lab_items')).spec).toEqual({ hint: 'ارجع إلى الكتاب', n: 1 });
    expect((await one(d, 'select detail from leaders.audit_log')).detail).toBe('حفظ الكتيب');
    const backup = (await d.query('select tbl, col, before from leaders.backup_20261116_handbook_name order by tbl, col')).rows;
    expect(backup.map((r) => `${r.tbl}.${r.col}`)).toEqual(['journey_stages.activities_ar', 'journey_stages.outcome_ar', 'lab_items.spec',
      'stage_requirements.help_ar', 'stage_requirements.title_ar', 'track_profiles.journey_ar', 'tracks.journey_ar']);
    expect(backup.find((r) => r.col === 'outcome_ar').before).toBe('كتيبك مكتمل');
    expect((await one(d, "select count(*)::int n from leaders.schema_migrations where name = '20261116050000_leaders_handbook_name'")).n).toBe(1);
  });
  it('إعادة التشغيل لا تغيّر شيئًا ولا تكتب النسخة الاحتياطية مرتين', async () => {
    const d = await db();
    const snap = async () => (await d.query(`select (select json_agg(s) from leaders.journey_stages s) a, (select json_agg(r order by code) from leaders.stage_requirements r) b,
      (select count(*)::int from leaders.backup_20261116_handbook_name) n`)).rows[0];
    const first = await snap();
    await d.exec(SQL);
    expect(await snap()).toEqual(first);
  });
});
