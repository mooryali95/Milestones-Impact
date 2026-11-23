// «صحة المنصة» في النظرة العامة (admin.platform-health): الفحوص الخمسة بأحكامها وسطر علاج لكل منها، وتعذّر أي قراءة
// «غير معروف» لا «سليم»، ولا قيمة سر في الرد. بقاعدة في الذاكرة (_fake_db.ts) ودالة cron_job_status محاكاة.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const { CONFIG } = await import('./core.ts');
const S = await import('./system.ts');
const { MIGRATIONS } = await import('./migrations.js');
const { platformChecks, platformLevel, DIGEST_STALE_HOURS } = await import('./platform-health.js');
const { LEADERS_ADMIN_READS } = await import('../_shared/action-kinds.js');

type Row = Record<string, any>;
const NOW = Date.parse('2026-11-23T12:00:00Z');
const levels = (r: any) => Object.fromEntries(r.checks.map((c: any) => [c.key, c.level]));

function world(over: { cron?: any; tables?: Record<string, Row[]>; fail?: string[] } = {}) {
  const tables: Record<string, Row[]> = {
    schema_migrations: MIGRATIONS.map((name: string) => ({ name })),
    audit_log: [{ id: 1, action: 'system.model-digest', entity_id: '2026-11-23', created_at: '2026-11-23T05:17:00Z' }],
    organizations: [{ id: 'o1', name: 'جهة أ', status: 'active' }, { id: 'o2', name: 'جهة ب', status: 'active' }, { id: 'o3', name: 'موقوفة', status: 'inactive' }],
    sponsor_codes: [{ organization_id: 'o1', active: true, expires_at: null, max_uses: null, used: 0 }, { organization_id: 'o2', active: true, expires_at: null, max_uses: 1, used: 1 }],
    ...over.tables,
  };
  const cron = over.cron === undefined ? { data: [{ job_exists: true, job_active: true, last_status: 'succeeded', last_run: '2026-11-23T11:17:00Z' }], error: null } : over.cron;
  return installFake(tables, {
    rpc: (n) => (n === 'cron_job_status' ? cron : null),
    fail: (t) => (over.fail?.includes(t) ? { code: '42P01', message: 'x' } : null),
  });
}

Deno.test('admin.platform-health قراءة للإدارة، والفحوص الخمسة بحكمها: سليم، وجهة بلا رمز فعّال كهرماني', async () => {
  assert(LEADERS_ADMIN_READS.has('admin.platform-health'));
  const saved = CONFIG.alertEmail;
  Object.assign(CONFIG, { alertEmail: 'team@x.sa' });
  const w = world();
  try {
    const r: any = await S.platformHealth(NOW);
    assertEquals(levels(r), { migrations: 'ok', alert_email: 'ok', cron: 'ok', digest: 'ok', sponsor_codes: 'warn' });
    assertEquals(r.level, 'warn');
    const sc = r.checks.find((c: any) => c.key === 'sponsor_codes');
    assert(sc.line.includes('جهة ب') && !sc.line.includes('موقوفة'));   // المستنفد ليس فعّالًا، والموقوفة لا تُعدّ
    assert(sc.remedy.length > 0);
    assert(!JSON.stringify(r).includes('team@x.sa'));   // لا قيمة سر
    assertEquals(w.writes.length, 0);
  } finally { w.restore(); Object.assign(CONFIG, { alertEmail: saved }); }
});

Deno.test('الخلل والتعذّر: ترحيل ناقص وبريد غير مضبوط أحمران، والمهمة الموقوفة حمراء، وغياب الدالة أو الجدول «غير معروف»', async () => {
  const saved = CONFIG.alertEmail;
  Object.assign(CONFIG, { alertEmail: '' });
  const w = world({ tables: { schema_migrations: MIGRATIONS.slice(0, -1).map((name: string) => ({ name })) }, cron: { data: [{ job_exists: true, job_active: false }], error: null } });
  try {
    const r: any = await S.platformHealth(NOW);
    assertEquals(levels(r), { migrations: 'bad', alert_email: 'bad', cron: 'bad', digest: 'ok', sponsor_codes: 'warn' });
    assert(r.checks[0].line.includes(MIGRATIONS.at(-1)));
    assertEquals(r.level, 'bad');
  } finally { w.restore(); }
  const v = world({ cron: { data: null, error: { code: 'PGRST202', message: 'missing' } }, fail: ['sponsor_codes', 'audit_log'] });
  try {
    const r: any = await S.platformHealth(NOW);
    assertEquals([levels(r).cron, levels(r).digest, levels(r).sponsor_codes], ['unknown', 'unknown', 'unknown']);
  } finally { v.restore(); Object.assign(CONFIG, { alertEmail: saved }); }
});

Deno.test('الأحكام الخالصة: ملخص قديم أو لم يُرسل كهرماني، وآخر تشغيل فاشل كهرماني، والسليم بلا علاج', () => {
  const base = { migrations: { ledger: true, missing: [] }, alertEmail: true, cron: { readable: true, exists: true, active: true, last_status: 'failed', last_run: '2026-11-23T11:17:00Z' },
    digest: { readable: true, last: new Date(NOW - (DIGEST_STALE_HOURS + 1) * 36e5).toISOString() }, sponsors: { readable: true, without: [] } };
  const c = platformChecks(base, NOW);
  assertEquals(c.map((x: any) => x.level), ['ok', 'ok', 'warn', 'warn', 'ok']);
  assertEquals(c.filter((x: any) => x.level === 'ok').every((x: any) => x.remedy === ''), true);
  assertEquals(platformChecks({ ...base, digest: { readable: true, last: null } }, NOW)[3].level, 'warn');
  assertEquals(platformChecks({ ...base, cron: { readable: true, exists: false } }, NOW)[2].level, 'bad');
  assertEquals(platformChecks({ ...base, migrations: { ledger: false, missing: [] } }, NOW)[0].level, 'unknown');
  assertEquals(platformLevel([{ level: 'ok' }, { level: 'unknown' }]), 'unknown');
});
