// حراس الحزمة 3 (D09 وD13): النسخ خارج GitHub بالتشفير عند المصدر، وفحصها ومراقب حداثتها وتمرينها،
// وتجميد SSPDF بسحب صلاحياته. التمرين الكامل جُرّب على قاعدة Postgres محلية (الإيداع وتقرير الحزمة).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { encodePath, sign } from '../../scripts/ops/r2.mjs';
import { checkManifest } from '../../scripts/ops/backup-check.mjs';
import { evaluate, MAX_HOURS } from '../../workers/backup-monitor/index.js';
import { PII, QUERIES, render } from '../../scripts/db/sspdf-inventory.mjs';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('عميل R2 بتوقيع SigV4', () => {
  it('يطابق المثال الموثق في AWS (GET Object بمدى)', () => {
    const h = sign({
      method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', region: 'us-east-1', date: new Date('2013-05-24T00:00:00Z'),
      headers: { range: 'bytes=0-9', 'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    });
    expect(h.authorization).toBe('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  });
  it('يرمّز المسار جزءًا جزءًا ويبقي الفواصل', () => {
    expect(encodePath('daily/db leaders(1).gpg')).toBe('daily/db%20leaders%281%29.gpg');
  });
});

describe('فحص النسخة في R2 بلا فك تشفير', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');
  const m = { at: '2026-11-07T01:00:00Z', encryption: 'public-key', rows: { 'leaders.participants': 3 }, files: [{ key: 'daily/db.dump.gpg', bytes: 10 }] };
  it('نسخة حديثة كاملة بالمفتاح العام تمر', () => {
    expect(checkManifest(m, { 'daily/db.dump.gpg': { bytes: 10 } }, now)).toEqual({ age_hours: 11, issues: [] });
  });
  it('تفشل: أقدم من 36 ساعة، أو ملف غائب أو بحجم آخر، أو بلا صفوف، أو بتشفير متماثل', () => {
    expect(checkManifest({ ...m, at: '2026-11-05T12:00:00Z' }, { 'daily/db.dump.gpg': { bytes: 10 } }, now).issues[0]).toContain('48 ساعة');
    expect(checkManifest(m, {}, now).issues).toEqual(['daily/db.dump.gpg غائب من الدلو']);
    expect(checkManifest(m, { 'daily/db.dump.gpg': { bytes: 9 } }, now).issues[0]).toContain('9 بايت');
    expect(checkManifest({ ...m, rows: {} }, { 'daily/db.dump.gpg': { bytes: 10 } }, now).issues).toEqual(['البيان بلا عدد صفوف']);
    expect(checkManifest({ ...m, encryption: 'symmetric' }, { 'daily/db.dump.gpg': { bytes: 10 } }, now).issues[0]).toContain('public-key');
  });
});

describe('مراقب الحداثة (Worker)', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');
  it('حديثة حتى 26 ساعة، ومتأخرة بعدها، وغيابها متأخر', () => {
    expect(MAX_HOURS).toBe(26);
    expect(evaluate({ at: '2026-11-06T11:00:00Z', files: [1, 2] }, now)).toEqual({ ok: true, age_hours: 25, at: '2026-11-06T11:00:00Z', files: 2 });
    expect(evaluate({ at: '2026-11-06T09:00:00Z' }, now)).toMatchObject({ ok: false, age_hours: 27 });
    expect(evaluate(null, now).ok).toBe(false);
    expect(evaluate({ at: 'x' }, now).ok).toBe(false);
  });
  it('يعيد 503 من /health حين تتأخر، ويقرأ latest.json من ربط R2، ويحدّ البريد بمرة كل 12 ساعة', async () => {
    const src = read('workers/backup-monitor/index.js');
    expect(src).toMatch(/status: state\.ok \? 200 : 503/);
    expect(src).toMatch(/const ALERT_EVERY_MS = 12 \* 36e5;/);
    expect(read('workers/backup-monitor/wrangler.toml')).toMatch(/binding = "BACKUPS"[\s\S]*crons = \["17 \* \* \* \*"\]|crons = \["17 \* \* \* \*"\][\s\S]*binding = "BACKUPS"/);
    const { default: w } = await import('../../workers/backup-monitor/index.js');
    const env = { BACKUPS: { get: async () => ({ text: async () => JSON.stringify({ at: new Date().toISOString(), files: [] }) }) } };
    const ok = await w.fetch(new Request('https://x/health'), env);
    expect(ok.status).toBe(200);
    const stale = await w.fetch(new Request('https://x/health'), { BACKUPS: { get: async () => null } });
    expect(stale.status).toBe(503);
  });
});

describe('سكربتا النسخ والتمرين وسيرا العمل', () => {
  const bash = (f) => spawnSync('bash', ['-n', join(root, f)], { encoding: 'utf8' });
  it('السكربتان سليمان نحويًا، ويشفّران بالمفتاح العام، ويرفضان حفظ نسخة غير مشفرة', () => {
    for (const f of ['scripts/ops/backup.sh', 'scripts/ops/restore-drill.sh']) expect(bash(f).status, f).toBe(0);
    const b = read('scripts/ops/backup.sh');
    expect(b).toMatch(/--trust-model always --recipient-file "\$key" --encrypt/);
    expect(b).toContain('لا مفتاح عام ولا عبارة مرور: لا تُحفظ نسخة غير مشفرة');
    expect(b).toMatch(/BACKUP_SCHEMAS:-leaders,public,auth/);
    expect(b).toMatch(/'auth\.users', \(select count\(\*\) from auth\.users\)/);
    expect(b).toMatch(/put latest\.json "\$manifest" application\/json/);
  });
  it('التمرين يفشل عند العمر والبصمة وفك التشفير والخطأ غير المتوقع وعدد الصفوف وعينة الدلو', () => {
    const d = read('scripts/ops/restore-drill.sh');
    for (const s of ['DRILL_MAX_AGE_HOURS:-36', 'لا تطابق البيان', 'تعذّر فك تشفير', 'أخطاء استعادة غير متوقعة', 'لحظة النسخ', 'ملف مفقود من الدلو', 'حجم مختلف']) expect(d, s).toContain(s);
  });
  it('backup.yml يشغّل السكربت نفسه، وrestore-drill.yml يفحص R2 يوميًا ويستعيد كاملًا ما دام التشفير متماثلًا', () => {
    const b = read('.github/workflows/backup.yml');
    expect(b).toContain('run: bash scripts/ops/backup.sh');
    for (const s of ['BACKUP_PUBLIC_KEY', 'R2_ACCOUNT_ID', 'R2_BUCKET']) expect(b).toContain(s);
    const r = read('.github/workflows/restore-drill.yml');
    expect(r).toContain('run: node scripts/ops/backup-check.mjs --max-hours=36');
    expect(r).toContain('run: bash scripts/ops/restore-drill.sh "$DIR"');
    expect(r).not.toMatch(/pg_restore reported errors/);   // التمرين القديم كان يتجاهل الأخطاء
  });
  it('RUNBOOK يعلن RPO وRTO وقفل الاحتياط بأوامر wrangler الصحيحة، ويشترط تمرينًا ناجحًا قبل الدفعة', () => {
    const rb = read('RUNBOOK.md');
    expect(rb).toContain('RPO أربع وعشرون ساعة');
    expect(rb).toContain('npx wrangler r2 bucket lock add mi-backups --name daily-30d --prefix daily/ --retention-days 30');
    expect(rb).toContain('لا تُستقبل بيانات دفعة قبل تمرين ناجح.');
    expect(read('docs/SECRETS.md')).toContain('`BACKUP_PUBLIC_KEY`');
  });
});

describe('تجميد SSPDF (D13)', () => {
  const SQL = read('supabase/migrations/20261107110000_sspdf_freeze.sql');
  it('الترحيل مؤجل بقرار في بوابة النشر، والجرد قراءة فقط ويكشف الأعمدة الشخصية', () => {
    expect(gateOf(SQL)).toMatchObject({ gate: 'deferred' });
    for (const q of Object.values(QUERIES)) expect(q.trim()).toMatch(/^select\b/i);
    expect(['email', 'phone', 'display_name', 'created_at'].filter((c) => PII.test(c))).toEqual(['email', 'phone', 'display_name']);
    const md = render({ tables: [{ table_name: 'projects', rows: 2, columns: ['id', 'email'] }], activity: [{ table_name: 'projects', last: '2026-01-02 10:00' }], function_grants: [{ function: 'bootstrap_admin', grantee: 'authenticated' }] });
    expect(md).toContain('| projects | 2 | email | 2026-01-02 |');
    expect(md).toContain('| bootstrap_admin() | authenticated | EXECUTE |');
  });
  it('يسحب صلاحيات anon وauthenticated عن المخطط وجداوله ودواله، ولا يفعل شيئًا بلا مخطط، وإعادته آمنة', async () => {
    const db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema leaders; create table leaders.schema_migrations (name text primary key);`);
    await db.exec(SQL);   // بلا مخطط sspdf
    await db.exec(`create schema sspdf; create table sspdf.projects (id int, email text);
      create function sspdf.bootstrap_admin(p int) returns void language sql as 'select';
      grant usage on schema sspdf to anon, authenticated; grant select, insert on sspdf.projects to anon, authenticated;
      grant execute on function sspdf.bootstrap_admin(int) to authenticated;`);
    await db.exec(SQL);
    await db.exec(SQL);
    const { rows: [r] } = await db.query(`select has_schema_privilege('authenticated', 'sspdf', 'usage') s,
      has_table_privilege('anon', 'sspdf.projects', 'select') t, has_function_privilege('authenticated', 'sspdf.bootstrap_admin(int)', 'execute') f,
      has_function_privilege('anon', 'sspdf.bootstrap_admin(int)', 'execute') p, (select count(*)::int from leaders.schema_migrations) n`);
    expect(r).toEqual({ s: false, t: false, f: false, p: false, n: 1 });
  });
  it('SSPDF مجمّدة في README وRUNBOOK، وخطواتها في SSPDF/FROZEN.md', () => {
    expect(read('README.md')).toContain('مجمّدة بقرار D13');
    expect(read('RUNBOOK.md')).toContain('**المنصات الأربع**');
    const f = read('SSPDF/FROZEN.md');
    for (const s of ['sspdf-inventory.mjs', 'BACKUP_PREFIX=archive', 'Exposed schemas', '20261107110000_sspdf_freeze']) expect(f).toContain(s);
  });
});
