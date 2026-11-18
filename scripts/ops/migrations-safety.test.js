// حراس المرحلة 6 من تصور تحديث المنصة بلا أثر (الترحيلات والتوافق، ش4 وش5): قراءة الترحيل، والمعاملة ومهلتاها وإعادة المحاولة،
// والسجل، والفاحص الثابت، وخطة النسخة قبل التطبيق، وعقد الإجراءات مع release، وبنية الإنتاج في التكامل، وملفات السير.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { analyze, isBackupTable, noTransaction, normName, statements } from '../db/migration-sql.mjs';
import { applyPlan, applyWithRetry, inLedger, isLockTimeout, isMissingRelation, RETRY_DELAYS_MS } from '../db/migration-tx.mjs';
import { judge, LARGE_TABLES, lint, LINT_AFTER, readAllow, RULES } from '../db/migration-lint.mjs';
import { backupPlan } from '../db/premigration-backup.mjs';
import { contractGaps, dispatchTables, INDEX } from './action-contract.mjs';
import { pickBaseline, productionNames } from '../integration/production-baseline.mjs';
import { unnamedBlocking } from './pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const rules = (name, sql, opts) => lint(name, sql, opts).map((f) => f.rule);
const N = '20261201100000_x';

describe('قراءة الترحيل', () => {
  it('يقسم عند ; خارج النصوص والتعليقات وأجسام الدولار', () => {
    const s = statements(`-- رأس; لا يقسم\ncreate table a (x text default 'a;b');\ncreate function f() returns void language plpgsql as $fn$ begin update t set x = 1; end $fn$;\n/* تعليق ; */ select 1;\nupdate e set x = E'\\';' where y = $$;$$`);
    expect(s.map((x) => x.code.split(' ')[0])).toEqual(['create', 'create', 'select', 'update']);
    expect(s[1].bodies[0]).toMatch(/update t set x = 1/);
    expect(s[3].line).toBe(5);
    expect(s[0].code).toBe("create table a (x text default '')");
  });
  it('العمليات والأسماء المؤهلة', () => {
    expect(normName('"Leaders"."T"')).toBe('leaders.t');
    expect(normName('x')).toBe('public.x');
    const ops = analyze(`alter table if exists leaders.p add column if not exists a int not null default 0, drop column b, alter column c set not null, alter column d type bigint, rename column e to f;
      insert into leaders.q (k) values (1) on conflict (k) do update set k = excluded.k;
      create unique index concurrently if not exists i on only leaders.r (x);
      drop table if exists leaders.s, leaders.backup_old;
      do $$ begin update leaders.u set y = 1 where z; execute 'drop table x'; end $$;`).map((o) => [o.op, o.table]);
    expect(ops).toEqual([['add-column', 'leaders.p'], ['drop-column', 'leaders.p'], ['set-not-null', 'leaders.p'], ['column-type', 'leaders.p'], ['rename', 'leaders.p'],
      ['insert', 'leaders.q'], ['create-index', 'leaders.r'], ['drop-table', 'leaders.s'], ['drop-table', 'leaders.backup_old'], ['unknown', undefined], ['update', 'leaders.u']]);
    expect(isBackupTable('leaders.backup_20261114_x')).toBe(true);
    expect(isBackupTable('leaders.questions_backup_20261101')).toBe(true);
    expect(isBackupTable('leaders.questions')).toBe(false);
  });
  it('دالة معرّفة في الترحيل يُقرأ ما تكتبه حين تُستدعى، ودالة قائمة هدفها مجهول', () => {
    const ops = analyze(`create function pg_temp.fix(k text) returns void language sql as $$ update leaders.m set body = k $$;\nselect pg_temp.fix('a');\nselect leaders.other('b');\nselect cron.schedule('j', '* * * * *', $$select 1$$);`);
    expect(ops.filter((o) => o.op === 'update').map((o) => [o.table, o.via])).toEqual([['leaders.m', 'pg_temp.fix']]);
    expect(ops.filter((o) => o.op === 'unknown').map((o) => o.detail)).toEqual(['استدعاء leaders.other']);
  });
  it('كل ترحيل في المستودع يُقرأ بلا خطأ', () => {
    for (const f of readdirSync(join(root, 'supabase/migrations')).filter((x) => x.endsWith('.sql'))) expect(() => analyze(read(`supabase/migrations/${f}`)), f).not.toThrow();
  });
});

describe('المعاملة ومهلتاها (البند 1)', () => {
  it('الافتراضي معاملة صريحة بمهلة أقفال 3 ثوانٍ وتنفيذ 60 ثانية محلية لها', () => {
    const p = applyPlan('create table a();\n-- آخر سطر تعليق');
    expect(p.mode).toBe('transaction');
    expect(p.requests).toHaveLength(1);
    expect(p.requests[0]).toMatch(/^begin;\nset local lock_timeout = '3s';\nset local statement_timeout = '60s';\n/);
    expect(p.requests[0]).toMatch(/-- آخر سطر تعليق\n;\ncommit;$/);
  });
  it('الوسم no-transaction يُرسل أمرًا أمرًا، والقديم بمعاملته اليدوية كما هو', () => {
    const nt = applyPlan('-- migrate: no-transaction\ncreate index concurrently if not exists i on leaders.a (x);\ninsert into leaders.schema_migrations (name) values (\'n\') on conflict do nothing;');
    expect(nt.mode).toBe('no-transaction');
    expect(nt.requests).toHaveLength(2);
    expect(nt.requests[0]).toMatch(/\ncreate index concurrently if not exists i on leaders\.a \(x\);$/);
    expect(nt.requests[1]).toBe("insert into leaders.schema_migrations (name) values ('n') on conflict do nothing;");
    expect(noTransaction(`${'--\n'.repeat(20)}-- migrate: no-transaction`)).toBe(false);
    const ex = applyPlan(read('supabase/migrations/20261021120000_security_hardening.sql'));
    expect(ex.mode).toBe('explicit');
    expect(ex.requests[0]).toMatch(/^set lock_timeout = '3s';/);
  });
  it('ذري في PGlite (البروتوكول البسيط كما تصل الواجهة): فشل في منتصفه لا يترك شيئًا', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    await db.exec('create schema leaders; create table leaders.a (x int);');
    await expect(db.exec(applyPlan('insert into leaders.a values (1);\ncreate table leaders.b ();\nselect 1/0;').requests[0])).rejects.toThrow(/division by zero/);
    await db.exec('rollback;').catch(() => {});
    expect((await db.query('select count(*)::int n from leaders.a')).rows[0].n).toBe(0);
    expect((await db.query("select to_regclass('leaders.b') r")).rows[0].r).toBeNull();
    // concurrently يرفضه Postgres داخل المعاملة، فله ترحيل بلا معاملة
    await expect(db.exec(applyPlan('create index concurrently i on leaders.a (x);').requests[0])).rejects.toThrow(/transaction block/);
    await db.exec('rollback;').catch(() => {});
    await db.exec(applyPlan('insert into leaders.a values (2);').requests[0]);
    expect((await db.query("select current_setting('lock_timeout') t")).rows[0].t).toBe('0');   // set local لا يتسرب إلى الجلسة
    expect((await db.query('select count(*)::int n from leaders.a')).rows[0].n).toBe(1);
    await db.close();
  });
  it('فشل القفل وحده يُعاد بتراجع متزايد، وبعد كل فشل rollback، وغيره يرمي فورًا', async () => {
    const waits = [];
    const sent = [];
    let left = 2;
    const query = async (q) => { sent.push(q.slice(0, 8)); if (q.startsWith('begin') && left-- > 0) throw new Error('400 {"message":"ERROR:  55P03: canceling statement due to lock timeout"}'); return []; };
    const r = await applyWithRetry({ query, plan: applyPlan('alter table leaders.a add column y int;'), sleep: async (ms) => waits.push(ms), random: () => 0 });
    expect(r.attempts).toBe(3);
    expect(waits).toEqual(RETRY_DELAYS_MS.slice(0, 2));
    expect(sent).toEqual(['begin;\ns', 'rollback', 'begin;\ns', 'rollback', 'begin;\ns']);
    const boom = async (q) => { if (q.startsWith('begin')) throw new Error('42703: column "z" does not exist'); return []; };
    await expect(applyWithRetry({ query: boom, plan: applyPlan('select z from a;'), sleep: async () => { throw new Error('لا انتظار'); } })).rejects.toThrow(/42703/);
    // نفاد المحاولات
    const always = async (q) => { if (q.startsWith('begin')) throw new Error('lock timeout'); return []; };
    const w2 = [];
    await expect(applyWithRetry({ query: always, plan: applyPlan('select 1;'), sleep: async (ms) => w2.push(ms), random: () => 0 })).rejects.toThrow(/lock timeout/);
    expect(w2).toHaveLength(RETRY_DELAYS_MS.length);
  });
  it('لا إعادة لما ليس معاملة', async () => {
    let calls = 0;
    const lockFail = async () => { calls++; throw new Error('55P03 lock timeout'); };
    await expect(applyWithRetry({ query: lockFail, plan: applyPlan('-- migrate: no-transaction\ncreate index concurrently if not exists i on t (x);'), sleep: async () => {} })).rejects.toThrow(/INVALID/);
    expect(calls).toBe(1);
    calls = 0;
    await expect(applyWithRetry({ query: lockFail, plan: applyPlan('begin; select 1; commit;'), sleep: async () => {} })).rejects.toThrow();
    expect(calls).toBe(2);   // المحاولة ثم rollback، بلا إعادة
    expect(isLockTimeout('canceling statement due to lock timeout')).toBe(true);
    expect(isLockTimeout('canceling statement due to statement timeout')).toBe(false);
  });
});

describe('السجل (البند 2)', () => {
  it('«السجل غير موجود» يعني غير مطبّق، وأي خطأ آخر يوقف السلسلة', async () => {
    expect(await inLedger(async () => [{ name: 'n' }], 'n')).toBe(true);
    expect(await inLedger(async () => [], 'n')).toBe(false);
    expect(await inLedger(async () => { throw new Error('400 ERROR: 42P01: relation "leaders.schema_migrations" does not exist'); }, 'n')).toBe(false);
    for (const e of ['fetch failed', '401 {"message":"JWT expired"}', '503 Service Unavailable', '42501: permission denied for table schema_migrations']) {
      await expect(inLedger(async () => { throw new Error(e); }, 'n'), e).rejects.toThrow(/تعذّرت قراءة سجل الترحيلات/);
    }
    expect(isMissingRelation('ERROR: 3F000: schema "leaders" does not exist')).toBe(true);
  });
  it('apply-migration.mjs يستعمل الوحدة ولا يبتلع خطأ السجل', () => {
    const src = read('scripts/db/apply-migration.mjs');
    expect(src).toContain("from './migration-tx.mjs'");
    expect(src).toMatch(/applyWithRetry\(\{ query, plan/);
    expect(src).not.toMatch(/catch \{ return false; \}/);
  });
});

describe('فاحص الترحيلات (البند 5)', () => {
  const applied = new Set(['20261101100000_expand']);
  it('القواعد الست وما بعدها، وكل منها بمثال يُرفض ومثال يُقبل', () => {
    expect(rules(N, 'alter table leaders.p add column a int not null;')).toEqual(['not-null-no-default']);
    expect(rules(N, "alter table leaders.p add column a int not null default 0, add column b int generated always as identity;")).toEqual([]);
    expect(rules(N, 'create table leaders.n (id int); alter table leaders.n add column a int not null;')).toEqual([]);
    expect(rules(N, 'alter table leaders.p alter column a set not null;')).toEqual(['set-not-null']);
    expect(rules(N, 'create index i on leaders.audit_log (at);')).toEqual(['index-not-concurrent']);
    expect(rules(N, 'create index i on leaders.programs (at);')).toEqual([]);
    expect(rules(N, 'alter table leaders.p alter column a type bigint;')).toEqual(['column-type']);
    expect(rules(N, 'alter table leaders.p rename column a to b;')).toEqual(['drop-or-rename']);
    expect(rules(N, 'alter table leaders.p rename to q;')).toEqual(['drop-or-rename']);
    expect(rules(N, '-- deploy-gate: tolerant\ncreate table leaders.n ();')).toEqual(['tolerant-note']);
    expect(rules(N, '-- deploy-gate: tolerant قبله تعيد الدالة قائمة فارغة\ncreate table leaders.n ();')).toEqual([]);
    expect(rules(N, 'begin;\ncreate table leaders.n ();\ncommit;')).toEqual(['transaction', 'transaction']);
    expect(rules(N, 'create index concurrently i on leaders.audit_log (at);')).toEqual(['transaction']);
    expect(rules(N, '-- migrate: no-transaction\ncreate index concurrently if not exists i on leaders.audit_log (at);\ninsert into leaders.schema_migrations (name) values (\'x\');')).toEqual([]);
    expect(rules(N, '-- migrate: no-transaction\ncreate index concurrently i on leaders.audit_log (at);\nalter table leaders.p add column a int;')).toEqual(['transaction', 'transaction']);
  });
  it('الحذف: لا في ترحيل يُدخل استعمالًا جديدًا، وفي الانكماش بترحيل توسيع مطبّق قبل 14 يومًا', () => {
    const drop = '-- restore: insert into leaders.p (b) select b from leaders.backup_p\ncreate table leaders.backup_p as select id, b from leaders.p;\nalter table leaders.p drop column b;';
    expect(rules(N, `${drop}\nalter table leaders.p add column c int;`)).toEqual(['drop-or-rename']);
    expect(rules(N, drop)).toEqual(['drop-or-rename']);
    expect(lint(N, `-- contract: 20261101100000_expand\n${drop}`, { applied }).map((f) => f.rule)).toEqual([]);
    expect(lint('20261110100000_x', `-- contract: 20261101100000_expand\n${drop}`, { applied })[0].message).toMatch(/أقل من 14/);
    expect(lint(N, `-- contract: 20261120100000_other\n${drop}`, { applied })[0].message).toMatch(/لم يُطبَّق/);
    // إعادة إنشاء عرض بالاسم نفسه، وحذف جدول نسخ، لا يعدّان حذفًا
    expect(rules(N, 'drop view if exists leaders.v;\ncreate view leaders.v as select 1;')).toEqual([]);
    expect(rules(N, 'drop table if exists leaders.backup_20261101_x;')).toEqual([]);
  });
  it('ترحيل البيانات بجدول backup_* وأمر إرجاع مكتوب', () => {
    expect(rules(N, "update leaders.q set body = 'x' where id = 1;")).toEqual(['data-backup']);
    expect(lint(N, "create table leaders.backup_q as select * from leaders.q;\nupdate leaders.q set body = 'x';")[0].message).toMatch(/restore/);
    expect(rules(N, "-- restore: update leaders.q q set body = b.body from leaders.backup_q b where b.id = q.id\ncreate table if not exists leaders.backup_q as select * from leaders.q;\nupdate leaders.q set body = 'x';")).toEqual([]);
    // الإدراج والإدراج المتسامح ليسا تغييرًا لصفوف قائمة، وسطر السجل وما أنشأه الترحيل نفسه كذلك
    expect(rules(N, "insert into leaders.q (k) values (1) on conflict (k) do update set k = excluded.k;\ninsert into leaders.schema_migrations (name) values ('x');")).toEqual([]);
    expect(rules(N, 'create table leaders.n (x int); update leaders.n set x = 1;')).toEqual([]);
    expect(rules(N, 'create function leaders.f() returns void language sql as $$ delete from leaders.q $$;')).toEqual([]);
    expect(rules(N, 'do $$ begin delete from leaders.q where x; end $$;')).toEqual(['data-backup']);
  });
  it('الجديد وحده يُفحص: لا ترحيل بعد LINT_AFTER يخالف اليوم، والاستثناءات صالحة', () => {
    const names = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, ''));
    expect(names).toContain(LINT_AFTER);
    const fresh = new Map(names.filter((n) => n > LINT_AFTER).map((n) => [n, lint(n, read(`supabase/migrations/${n}.sql`))]));
    const { failures, stale } = judge(fresh, readAllow());
    expect(failures).toEqual([]);
    expect(stale).toEqual([]);
    // القديم يخالف أحيانًا (تقرير --all) ولا يُفشل
    expect(lint('20261116150000_leaders_mail_queue_expiry', read('supabase/migrations/20261116150000_leaders_mail_queue_expiry.sql')).length).toBeGreaterThan(0);
  });
  it('الاستثناء باسم الترحيل وقواعده وسببه، والقديم الزائد يُفشل', () => {
    const res = new Map([['a', [{ rule: 'set-not-null', line: 1, message: 'm' }]]]);
    expect(judge(res, { migrations: { a: { rules: ['set-not-null'], reason: 'جدول صغير بعشرة صفوف ثابتة' } } })).toMatchObject({ failures: [], stale: [] });
    expect(judge(res, { migrations: {} }).failures).toHaveLength(1);
    expect(judge(res, { migrations: { a: { rules: ['set-not-null'], reason: 'قصير' } } }).stale).toHaveLength(1);
    expect(judge(res, { migrations: { a: { rules: ['set-not-null', 'column-type'], reason: 'جدول صغير بعشرة صفوف ثابتة' } } }).stale[0]).toMatch(/column-type/);
    expect(judge(res, { migrations: { b: { rules: ['set-not-null'], reason: 'جدول صغير بعشرة صفوف ثابتة' } } }).stale[0]).toMatch(/لا ترحيل/);
    expect(judge(res, { migrations: { a: { rules: ['nope'], reason: 'جدول صغير بعشرة صفوف ثابتة' } } }).stale.join()).toMatch(/مجهولة/);
    expect(RULES).toHaveLength(8);
    expect(LARGE_TABLES.has('leaders.assessment_answers')).toBe(true);
  });
});

describe('النسخة قبل التطبيق (البند 3)', () => {
  it('الجداول القائمة الممسوسة وحدها، والهدف المجهول ينسخ كاملًا', () => {
    const p = backupPlan([{ name: '20261201100000_a', sql: "create table leaders.n (x int);\nalter table leaders.n add column y int;\nupdate leaders.q set x = 1;\nalter table leaders.p add column z int;\ninsert into leaders.schema_migrations (name) values ('a');\ncreate table leaders.backup_q as select * from leaders.q;\n-- restore: update leaders.q ..." }]);
    expect(p).toMatchObject({ tables: ['leaders.p', 'leaders.q'], full: false, skip: false, label: 'premig-20261201100000' });
    expect(p.restore).toEqual(['20261201100000_a: update leaders.q ...']);
    expect(backupPlan([{ name: 'b', sql: 'create table leaders.n (x int); create index i on leaders.n (x); grant select on leaders.n to service_role;' }]).skip).toBe(true);
    expect(backupPlan([{ name: 'c', sql: "do $$ begin execute 'update x set y = 1'; end $$;" }])).toMatchObject({ full: true, skip: false });
  });
  it('backup.sh يفرّغ الجداول الموجودة وحدها بوسمها، وmigrate.yml ينسخ قبل التطبيق في الوظيفة نفسها', () => {
    const sh = read('scripts/ops/backup.sh');
    expect(sh).toMatch(/to_regclass\(t\) is not null/);
    expect(sh).toMatch(/args\+=\("--table=\$t"\)/);
    expect(sh).toMatch(/لا جدول قائم من .*: لا نسخة قبل الترحيل\."; exit 0/);
    const wf = yaml.load(read('.github/workflows/migrate.yml'));
    const steps = wf.jobs.apply.steps.map((s) => s.name || s.uses);
    const at = (n) => steps.findIndex((s) => s && s.startsWith(n));
    expect(at('Token, names, and backup secrets are set')).toBe(0);
    expect(at('What the migrations touch')).toBeLessThan(at('Back up the touched tables'));
    expect(at('Back up the touched tables')).toBeLessThan(at('Apply in order'));
    const backup = wf.jobs.apply.steps.find((s) => s.name?.startsWith('Back up'));
    expect(backup.env.BACKUP_PREFIX).toBe('premigration');
    expect(backup.run).toMatch(/^bash scripts\/ops\/backup\.sh$/m);
    // الأسرار بأسمائها كما في backup.yml، ولا قيمة في الملف
    for (const k of ['SUPABASE_DB_URL', 'BACKUP_PUBLIC_KEY', 'R2_BUCKET']) expect(wf.jobs.apply.env[k]).toBe(`\${{ secrets.${k} }}`);
  });
});

describe('التزامن والموافقة والنشر بعد التطبيق (البنود 4 و8)', () => {
  const migrate = yaml.load(read('.github/workflows/migrate.yml'));
  const manual = yaml.load(read('.github/workflows/deploy-leaders-api.yml'));
  const ci = yaml.load(read('.github/workflows/ci.yml'));
  it('التطبيق في بيئة production وفي deploy-production مع نشر ci.yml والتراجع الموحد، والقراءة بلا الاثنين', () => {
    expect(migrate.jobs.apply.environment).toBe('production');
    expect(migrate.jobs.apply.concurrency).toEqual({ group: 'deploy-production', 'cancel-in-progress': false });
    expect(ci.jobs.deploy.concurrency.group).toBe('deploy-production');
    expect(manual.jobs.deploy.concurrency.group).toBe('deploy-production');
    // لا مجموعة على مستوى السير في أي منهما، فلا قفل متبادل حين يستدعي migrate.yml سير التراجع
    expect(migrate.concurrency).toBeUndefined();
    expect(manual.concurrency).toBeUndefined();
    expect(migrate.jobs.read.environment).toBeUndefined();
    expect(migrate.jobs.read.concurrency).toBeUndefined();
    expect(migrate.on.workflow_dispatch.inputs.mode.options).toEqual(['apply', 'check', 'verify', 'apply-and-deploy']);
  });
  it('apply-and-deploy: يرفض حاجبًا لم يُسمَّ قبل أي تطبيق، ثم ينشر رأس main بسير التراجع الموحد فور التطبيق', () => {
    const steps = migrate.jobs.apply.steps;
    const expectStep = steps.findIndex((s) => s.run === 'node scripts/ops/pending-migrations.mjs --expect="$MIGRATIONS"');
    expect(expectStep).toBeGreaterThan(0);
    expect(expectStep).toBeLessThan(steps.findIndex((s) => s.name === 'Apply in order'));
    expect(steps[0].run).toMatch(/apply-and-deploy" \] && \[ "\$GITHUB_REF" != "refs\/heads\/main"/);
    const d = migrate.jobs.deploy;
    expect(d.needs).toBe('apply');
    expect(d.if).toMatch(/inputs\.mode == 'apply-and-deploy' && needs\.apply\.result == 'success'/);
    expect(d.uses).toBe('./.github/workflows/deploy-leaders-api.yml');
    expect(d.with.ref).toBe('${{ github.sha }}');
    expect(d.secrets).toBe('inherit');
    expect(manual.on.workflow_call.inputs.ref.required).toBe(true);
    expect(manual.on.workflow_dispatch.inputs.ref.required).toBe(true);
  });
  it('الحاجب غير المسمّى', () => {
    const pending = [{ name: 'a', gate: 'blocking' }, { name: 'b', gate: 'tolerant' }, { name: 'c', gate: 'blocking' }];
    expect(unnamedBlocking(pending, ['a'])).toEqual(['c']);
    expect(unnamedBlocking(pending, ['a', 'c'])).toEqual([]);
  });
});

describe('عقد الإجراءات مع الإصدار السابق (البند 7)', () => {
  it('يقرأ الجداول الخمسة من index.ts بمفاتيحها على عمق سطرين وحده', () => {
    const t = dispatchTables(read(INDEX));
    expect(Object.keys(t)).toEqual(['open', 'participant', 'expert', 'coordinator', 'admin']);
    expect(t.open).toEqual(expect.arrayContaining(['auth.start', 'system.ping', 'client.event']));
    expect(t.participant).toEqual(expect.arrayContaining(['me', 'profile.save']));
    expect(t.admin.length).toBeGreaterThan(100);
    // مفاتيح أجسام الدوال (مثل preload وpurge) ليست أفعالًا
    expect(Object.values(t).flat()).not.toEqual(expect.arrayContaining(['purge']));
    const src = "const open: Record<string, X> = {\n  'a.b': f,\n  c: g,\n  'd': async () => {\n    inner: 1,\n  },\n};\nconst participant: Record<string, X> = {\n  me: x,\n};\nconst expert: Record<a> = {\n  'xp.a': x,\n};\nconst coordinator: Record<a> = {\n  'coord.a': x,\n};\nconst admin: Record<a> = {\n  'admin.a': x,\n};\n";
    expect(dispatchTables(src).open).toEqual(['a.b', 'c', 'd']);
  });
  it('الغائب يُكسر، والمنقول إلى جدول آخر يُكسر، والمحذوف عمدًا بعد 14 يومًا من بديله يُقبل', () => {
    const prev = { open: ['a'], participant: ['me', 'old', 'moved'], expert: [], coordinator: [], admin: ['admin.x'] };
    const now = { open: ['a', 'moved'], participant: ['me', 'new'], expert: [], coordinator: [], admin: ['admin.x', 'admin.y'] };
    const today = new Date('2026-12-01T00:00:00Z');
    expect(contractGaps(prev, now, [], today)).toEqual([{ table: 'participant', action: 'old' }, { table: 'participant', action: 'moved', movedTo: 'open' }]);
    const retired = [{ action: 'old', table: 'participant', replacement_released: '2026-11-10', reason: 'استُبدل بـ new' }];
    expect(contractGaps(prev, now, retired, today).map((g) => g.action)).toEqual(['moved']);
    expect(contractGaps(prev, now, [{ ...retired[0], replacement_released: '2026-11-25' }], today)[0]).toMatchObject({ action: 'old', early: true });
    expect(JSON.parse(read('scripts/ops/action-contract-retired.json')).retired).toEqual([]);
  });
  it('في CI وفي التحقق المحلي بالأمر نفسه، بلا جلب بعمق 1 لإيداع موجود', () => {
    const run = yaml.load(read('.github/workflows/ci.yml')).jobs.checks.steps.find((s) => s.name?.startsWith('Migration linter')).run;
    expect(run).toMatch(/^node scripts\/db\/migration-lint\.mjs$/m);
    expect(run).toMatch(/^node scripts\/ops\/action-contract\.mjs --fetch --against=origin\/release$/m);
    const src = read('scripts/ops/action-contract.mjs');
    expect(src).toMatch(/if \(have\) git\('update-ref'/);
  });
});

describe('بنية الإنتاج في التكامل (البند 6)', () => {
  it('يطبّق المطبّق والحاجب، ويترك المتسامح والمؤجل غير المطبّقين', () => {
    const gate = { a: 'blocking', b: 'blocking', c: 'tolerant', d: 'deferred', e: 'blocking' };
    const { apply, skipped } = productionNames(['e', 'a', 'b', 'c', 'd'], new Set(['a', 'c']), (n) => gate[n]);
    expect(apply).toEqual(['a', 'b', 'c', 'e']);
    expect(skipped).toEqual([{ name: 'd', gate: 'deferred' }]);
    // c مطبّق فيُطبَّق ولو وُسم متسامحًا
  });
  it('اللقطة: أحدث نسخة as-of فيها مطبّق، ولا غير مطبّق قبله', () => {
    const versions = [{ commit: '3', asOf: 'm3' }, { commit: '2', asOf: 'm2' }, { commit: '1', asOf: 'm1' }];
    expect(pickBaseline(versions, ['m1', 'm2', 'm3'], new Set(['m1', 'm2'])).commit).toBe('2');
    expect(() => pickBaseline(versions, ['m0', 'm1', 'm2', 'm3'], new Set(['m1', 'm2']))).toThrow(/m0/);
    expect(() => pickBaseline(versions, ['m1'], new Set())).toThrow(/fetch-depth/);
  });
  it('integration.yml: وظيفة بنية الإنتاج بتاريخ كامل، والوعد المتسامح في الوظيفتين، والبصمة بعد نجاحهما', () => {
    const wf = yaml.load(read('.github/workflows/integration.yml'));
    const ps = wf.jobs['production-schema'];
    expect(ps.steps[0].with['fetch-depth']).toBe(0);
    const apply = ps.steps.find((s) => s.name === 'Apply the production migrations only');
    expect(apply.env.PRODUCTION_SCHEMA).toBe('1');
    expect(apply.run).toBe('bash scripts/integration/apply-migrations.sh');
    for (const job of ['golden-paths', 'production-schema']) {
      const runs = wf.jobs[job].steps.map((s) => s.run || '').join('\n');
      expect(runs, job).toMatch(/node scripts\/integration\/golden\.mjs\n\s*node scripts\/integration\/tolerant\.mjs/);
      expect(runs, job).toContain('bash scripts/integration/serve-functions.sh');
    }
    expect(wf.jobs.record.needs).toEqual(['golden-paths', 'production-schema']);
    expect(JSON.stringify(wf.jobs['golden-paths'])).not.toMatch(/upload-artifact/);
    const sh = read('scripts/integration/apply-migrations.sh');
    expect(sh).toMatch(/production-baseline\.mjs --baseline "\$BASELINE"/);
    expect(sh).toMatch(/psql "\$DB_URL" -v ON_ERROR_STOP=1 -q -f "\$BASELINE"/);
  });
});
