// تصور المرحلة 2، المرحلة 2.1: إشعار خصوصية الراعي في صفحتي التأييد (/sponsor) وتأكيد الأثر (/outcome)، سطر واحد ورابط
// بلا رقم نسخة (قاعدة الخصوصية والشروط في CLAUDE.md)، ويُحذف رقم النسخة من إشعار المقيّم اتساقًا (القرار 7). القبول بالإرسال
// يُسجَّل في consent_events بنوع «sponsor» الذي يضيفه ترحيل 20261129170000.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { SPONSOR_PRIVACY_AR } from '../../supabase/functions/leaders-api/labels.js';
import { MIGRATIONS, MIGRATION_GATES } from '../../supabase/functions/leaders-api/migrations.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const NAME = '20261129170000_leaders_consent_sponsor';

describe('إشعار خصوصية الراعي', () => {
  it('النص المعتمد سطر واحد بلا نسخة', () => {
    expect(SPONSOR_PRIVACY_AR).toBe('نحفظ اسمك وبريدك وقرارك وملاحظتك لاعتماد هذه المبادرة وحده، وفق');
  });
  for (const f of ['Sponsor.jsx', 'Outcome.jsx']) {
    it(`${f} يعرض الإشعار برابط سياسة الخصوصية ولا رقم نسخة`, () => {
      const src = read(`leaders-app/src/screens/${f}`);
      expect(src).toMatch(/\{SPONSOR_PRIVACY_AR\} <a className="link" href=\{LEGAL_PATH\.privacy\}[^>]*>سياسة الخصوصية<\/a>/);
      expect(src).not.toMatch(/POLICY_VERSION|النسخة/);
    });
  }
  it('إشعار المقيّم بلا رقم نسخة', () => {
    expect(read('leaders-app/src/screens/Rater.jsx')).not.toMatch(/POLICY_VERSION|\(النسخة/);
  });
  it('الخادم يسجل القبول بالإرسال في الصفحتين', () => {
    expect(read('supabase/functions/leaders-api/capstone.ts')).toMatch(/await logConsent\('sponsor', p\.id, 'accept'\)/);
    expect(read('supabase/functions/leaders-api/tracking.ts')).toMatch(/await logConsent\('sponsor', u\.id, 'accept'\)/);
  });
});

describe('ترحيل نوع الراعي في سجل الموافقات', () => {
  const SQL = read(`supabase/migrations/${NAME}.sql`);
  it('مسجل في القائمة وبوابته متسامحة', () => {
    expect(MIGRATIONS).toContain(NAME);
    expect(MIGRATION_GATES[NAME][0]).toBe('tolerant');
    expect(SQL.split('\n')[0]).toMatch(/^-- deploy-gate: tolerant /);
    expect(SQL).toMatch(new RegExp(`insert into leaders.schema_migrations \\(name\\) values \\('${NAME}'\\) on conflict do nothing;`));
    expect(read('supabase/schema/baseline.sql')).toMatch(/consent_events_subject_check CHECK \(\(subject = ANY \(ARRAY\['participant'::text, 'coordinator'::text, 'expert'::text, 'rater'::text, 'sponsor'::text\]\)\)\)/);
  });
  it('يقبل الراعي ويرفض غيره، وآمن لإعادة التشغيل', async () => {
    const db = new PGlite();
    await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      create table leaders.consent_events (id serial primary key, subject text not null, subject_id text not null,
        constraint consent_events_subject_check check (subject = any (array['participant', 'coordinator', 'expert', 'rater'])));`);
    await db.exec(SQL);
    await db.exec(SQL);
    await db.exec("insert into leaders.consent_events (subject, subject_id) values ('sponsor', 'x'), ('rater', 'y')");
    await expect(db.exec("insert into leaders.consent_events (subject, subject_id) values ('stranger', 'z')")).rejects.toThrow();
  });
});
