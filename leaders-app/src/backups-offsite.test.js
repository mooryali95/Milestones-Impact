// حراس الحزمة 3 (D09 وD13): النسخ خارج GitHub بالتشفير عند المصدر، وفحصها ومراقب حداثتها وتمرينها،
// وتجميد SSPDF بسحب صلاحياته. التمرين الكامل جُرّب على قاعدة Postgres محلية (الإيداع وتقرير الحزمة).
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
      accessKeyId: 'AKIA' + 'IOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    });
    expect(h.authorization).toBe('AWS4-HMAC-SHA256 Credential=' + 'AKIA' + 'IOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
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
    expect(b).toMatch(/--trust-model always "\$\{RCPT\[@\]\}" --encrypt/);
    expect(b).toMatch(/RCPT\+=\(--recipient-file "\$k"\)/);
    expect(b).toContain('لا مفتاح عام ولا عبارة مرور: لا تُحفظ نسخة غير مشفرة');
    expect(b).toMatch(/BACKUP_SCHEMAS:-leaders,public,auth/);
    expect(b).toMatch(/'auth\.users', \(select count\(\*\) from auth\.users\)/);
    expect(b).toMatch(/put latest\.json "\$manifest" application\/json/);
  });
  // ops-2 (2026-11-10): التشغيل اليدوي 03:37 كتب daily/db-…-2026-11-10.dump.gpg تحت قفل الاحتفاظ، ففشل المجدول 07:33
  // بـ409 ObjectLockedByBucketPolicy. السكربت الحقيقي بأدوات مزيفة (pg_dump وpsql وgpg والوقت) بلا قاعدة ولا R2
  it.skipIf(process.platform !== 'linux')('تشغيلان في اليوم نفسه يكتبان كائنات مختلفة، فلا يصطدم الثاني بقفل الاحتفاظ', () => {
    const bin = mkdtempSync(join(tmpdir(), 'mi-backup-bin-'));
    const out = mkdtempSync(join(tmpdir(), 'mi-backup-out-'));
    const tool = (name, body) => { writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`); chmodSync(join(bin, name), 0o755); };
    const realDate = spawnSync('bash', ['-c', 'command -v date'], { encoding: 'utf8' }).stdout.trim();
    try {
      tool('pg_dump', '[ "$1" = --version ] && { echo "pg_dump (PostgreSQL) 17.2"; exit 0; }; echo dump');
      tool('psql', '[ "$1" = --version ] && { echo "psql (PostgreSQL) 17.2"; exit 0; }; echo \'{"leaders.participants":1}\'');
      tool('gpg', 'while [ $# -gt 1 ]; do [ "$1" = -o ] && { o="$2"; shift; }; shift; done; cp "$1" "$o"');
      tool('date', `exec ${realDate} -d "$FAKE_NOW" "$@"`);
      const run = (at) => {
        const r = spawnSync('bash', [join(root, 'scripts/ops/backup.sh')], {
          encoding: 'utf8',
          env: { PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME || tmpdir(), FAKE_NOW: at, SUPABASE_DB_URL: 'postgres://fake', BACKUP_PASSPHRASE: 'x', BACKUP_OUT: out },
        });
        expect(r.status, r.stderr).toBe(0);
        return JSON.parse(r.stdout.trim().split('\n').pop());
      };
      const first = run('2026-11-10T03:37:12Z');
      const second = run('2026-11-10T07:33:36Z');
      const keys = (m) => m.files.map((f) => f.key);
      expect(first.day).toBe('2026-11-10');
      expect(second.day).toBe('2026-11-10');
      expect(keys(first)).toEqual(['daily/db-leaders-public-auth-2026-11-10T033712Z.dump.gpg']);
      expect(keys(second)).toEqual(['daily/db-leaders-public-auth-2026-11-10T073336Z.dump.gpg']);
      // في المجلد المحلي (تشغيل المالك من جهازه) لا يكتب الثاني فوق الأول
      expect(readdirSync(out).sort()).toEqual([
        'db-leaders-public-auth-2026-11-10T033712Z.dump.gpg', 'db-leaders-public-auth-2026-11-10T073336Z.dump.gpg',
        'manifest-leaders-public-auth-2026-11-10T033712Z.json', 'manifest-leaders-public-auth-2026-11-10T073336Z.json',
      ]);
    } finally {
      rmSync(bin, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });
  // نقل التشفير إلى المفتاح العام (2026-11-14): gpg بملف فيه كتلتان يشفّر للأولى وحدها بصمت، فمفتاح احتياطي يُلصق
  // مع مفتاح المالك في السر كان سيُهمل. السكربت الحقيقي وgpg الحقيقي بمفتاحين مولّدين للاختبار، بلا قاعدة ولا R2
  const hasGpg = spawnSync('gpg', ['--version']).status === 0;
  it.skipIf(process.platform !== 'linux' || !hasGpg)('يشفّر لكل مفتاح في BACKUP_PUBLIC_KEY ويكتب بصماتها، فيفك كل مستلم وحده', () => {
    const base = mkdtempSync(join(tmpdir(), 'mi-gpg-'));
    const bin = join(base, 'bin'); const out = join(base, 'out');
    const homes = ['a', 'b'].map((n) => join(base, n));
    for (const d of [bin, out, ...homes]) spawnSync('mkdir', ['-m', '700', '-p', d]);
    const gpg = (home, args, input) => spawnSync('gpg', ['--batch', '--pinentry-mode', 'loopback', '--passphrase', '', ...args], { env: { ...process.env, GNUPGHOME: home }, encoding: 'utf8', input });
    const tool = (name, body) => { writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`); chmodSync(join(bin, name), 0o755); };
    try {
      const fprs = homes.map((h, i) => {
        expect(gpg(h, ['--quick-gen-key', `MI Backups TEST ${i}`, 'future-default', 'default', 'never']).status).toBe(0);
        return gpg(h, ['--with-colons', '--list-keys']).stdout.split('\n').find((l) => l.startsWith('fpr')).split(':')[9];
      });
      const bundle = homes.map((h) => gpg(h, ['--armor', '--export']).stdout).join('');
      expect(bundle.match(/BEGIN PGP PUBLIC KEY BLOCK/g)).toHaveLength(2);
      tool('pg_dump', '[ "$1" = --version ] && { echo "pg_dump (PostgreSQL) 17.2"; exit 0; }; echo "dump-payload"');
      tool('psql', '[ "$1" = --version ] && { echo "psql (PostgreSQL) 17.2"; exit 0; }; echo \'{"leaders.participants":1}\'');
      const run = (key) => spawnSync('bash', [join(root, 'scripts/ops/backup.sh')], {
        encoding: 'utf8',
        env: { PATH: `${bin}:${process.env.PATH}`, HOME: base, GNUPGHOME: join(base, 'ci'), SUPABASE_DB_URL: 'postgres://fake', BACKUP_PUBLIC_KEY: key, BACKUP_PASSPHRASE: 'must-not-be-used', BACKUP_OUT: out },
      });
      spawnSync('mkdir', ['-m', '700', '-p', join(base, 'ci')]);
      const r = run(bundle);
      expect(r.status, r.stderr).toBe(0);
      const m = JSON.parse(r.stdout.trim().split('\n').pop());
      expect(m.encryption).toBe('public-key');
      expect(m.recipients).toEqual(fprs);
      const file = join(out, m.files[0].key.split('/').pop());
      for (const h of homes) expect(gpg(h, ['-d', file]).stdout.trim(), h).toBe('dump-payload');
      // كتلة تالفة تُفشل النسخ قبل التفريغ، ولا يسقط إلى العبارة
      const bad = run('-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nnot a key\n-----END PGP PUBLIC KEY BLOCK-----\n');
      expect(bad.status).not.toBe(0);
      expect(bad.stderr).toContain('لا تُقرأ مفتاحًا عامًا');
    } finally {
      for (const h of [...homes, join(base, 'ci')]) spawnSync('gpgconf', ['--kill', 'all'], { env: { ...process.env, GNUPGHOME: h } });
      rmSync(base, { recursive: true, force: true });
    }
  }, 30_000);
  it('backup.yml يفشل بسرّ ناقص ولا يمر أخضر بلا نسخة', () => {
    const b = read('.github/workflows/backup.yml');
    expect(b).not.toMatch(/skip=true/);
    expect(b).toMatch(/::error::SUPABASE_DB_URL or an encryption key[^\n]*\n\s*exit 1/);
  });
  it('النسخة المشفرة تُحفظ في أدوات السير ولو فشل الرفع إلى R2، ولا يُرفع منها غير المشفر والبيان', () => {
    const b = read('.github/workflows/backup.yml');
    const step = b.slice(b.indexOf('- uses: actions/upload-artifact'));
    expect(step).toMatch(/if: \$\{\{ !cancelled\(\) && github\.repository_visibility != 'public' \}\}/);
    expect(step).toContain('backup-out/*.gpg');
    expect(step).toContain('backup-out/manifest-*.json');
    expect(step).not.toMatch(/path: backup-out\/\s*$/m);
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

// تدقيق 2026-11-14 (F1): في مستودع عام أدوات السير يحمّلها أي حساب، فالنسخة لا تُنشر هناك
describe('النسخة لا تُنشر أداةَ سير في مستودع عام', () => {
  it('خطوة الرفع وتمرين الاستعادة منها مشروطان بأن المستودع ليس عامًّا', () => {
    const b = read('.github/workflows/backup.yml');
    const step = b.slice(b.indexOf('actions/upload-artifact'));
    expect(step.slice(0, 300)).toContain("github.repository_visibility != 'public'");
    expect(read('.github/workflows/restore-drill.yml')).toMatch(/schedule == '17 3 2 \* \*'\) && github\.repository_visibility != 'public'/);
  });
});
