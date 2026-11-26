// تصور المرحلة 2، المرحلة 2.3: ترحيل عمود تذكير الراعي، وسطر المشارك حين تنتهي مهلة راعيه، وربط التذكير بالمجدول الأسبوعي القائم
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, MIGRATION_GATES } from '../../supabase/functions/leaders-api/migrations.js';
import { sponsorReminderDue, SPONSOR_REMIND_DAYS } from '../../supabase/functions/leaders-api/capstone.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const NAME = '20261129180000_leaders_sponsor_reminded';
const DAY = 864e5, NOW = Date.parse('2026-11-26T08:00:00Z');
const at = (d) => new Date(NOW + d * DAY).toISOString();

describe('تذكير الراعي', () => {
  it('مرة لكل دعوة حين يبقى سبعة أيام أو أقل', () => {
    expect(SPONSOR_REMIND_DAYS).toBe(7);
    const c = (x) => ({ status: 'accepted', sponsor_status: 'pending', sponsor_invited_at: at(-14), sponsor_expires_at: at(7), sponsor_reminded_at: null, ...x });
    expect(sponsorReminderDue(c({}), NOW)).toBe(true);
    expect(sponsorReminderDue(c({ sponsor_expires_at: at(8) }), NOW)).toBe(false);
    expect(sponsorReminderDue(c({ sponsor_expires_at: at(-1) }), NOW)).toBe(false);
    expect(sponsorReminderDue(c({ sponsor_reminded_at: at(-1) }), NOW)).toBe(false);
    expect(sponsorReminderDue(c({ sponsor_reminded_at: at(-20) }), NOW)).toBe(true);
    expect(sponsorReminderDue(c({ status: 'approved' }), NOW)).toBe(false);
    expect(sponsorReminderDue(c({ sponsor_status: 'endorsed' }), NOW)).toBe(false);
  });
  it('في تشغيلة المجدول الأسبوعي نفسها، والمنتهي إلى تقرير الأسبوع', () => {
    const idx = read('supabase/functions/leaders-api/index.ts');
    expect(idx).toMatch(/const sponsors: any = await X\.sponsorReminders\(\)\.catch\(/);
    expect(idx).toMatch(/S\.weeklyHealth\(\{ sponsorExpired: sponsors\.expired \|\| 0 \}\)/);
  });
  it('المشارك يرى سطر الانتهاء في صفحة مبادرته', () => {
    expect(read('leaders-app/src/screens/Capstone.jsx')).toMatch(/c\.sponsor\?\.state === 'expired'\n\s+\? <div className="alert info cp-alert">\{SPONSOR_EXPIRED_PARTICIPANT_AR\}/);
  });
});

describe('ترحيل sponsor_reminded_at', () => {
  const SQL = read(`supabase/migrations/${NAME}.sql`);
  it('مسجل ومتسامح وفي المخطط المرجعي', () => {
    expect(MIGRATIONS).toContain(NAME);
    expect(MIGRATION_GATES[NAME][0]).toBe('tolerant');
    expect(SQL.split('\n')[0]).toMatch(/^-- deploy-gate: tolerant /);
    // ترتيب الأعمدة في اللقطة المولدة ترتيب إضافتها، فيُفحص العمود داخل جدول capstones لا موضعه
    expect(read('supabase/schema/baseline.sql').match(/create table if not exists leaders\.capstones \([\s\S]*?\n\);/)[0]).toMatch(/\n\s+sponsor_reminded_at timestamp with time zone,/);
  });
  it('يضيف العمود وآمن لإعادة التشغيل', async () => {
    const db = new PGlite();
    await db.exec('create schema leaders; create table leaders.schema_migrations (name text primary key); create table leaders.capstones (participant_id int primary key);');
    await db.exec(SQL);
    await db.exec(SQL);
    await db.exec("insert into leaders.capstones (participant_id, sponsor_reminded_at) values (1, now())");
    expect((await db.query(`select name from leaders.schema_migrations`)).rows).toEqual([{ name: NAME }]);
  });
});
