// مصدر واحد للجاهزية (ops-4): كانت النظرة العامة تعرض «3 من 4» وبوابات المراحل «1 من 8»، ولا تعرف حالة النظام قناة
// التنبيه ولا وسم بوابة النشر، فطلبت تطبيق ترحيل مؤجل بقرار. الآن readiness.js يحكم للوحة وللبوابات على الصفوف نفسها.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { launchReadiness, migrationsSummary, pendingMigrations, REQUIRED_SECRETS, setupReadiness } from '../../supabase/functions/leaders-api/readiness.js';
import { MIGRATION_GATES, MIGRATIONS } from '../../supabase/functions/leaders-api/migrations.js';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';
import * as gates from '../../scripts/ops/stage-gates.mjs';

const root = join(__dirname, '../..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const NOW = Date.parse('2026-11-11T09:00:00Z');

describe('الترحيلات بوسم بوابة النشر', () => {
  it('الوسم المولَّد هو حكم gateOf على سطور كل ملف، فلا يُطلب تطبيق المؤجل', () => {
    for (const n of MIGRATIONS) {
      const g = gateOf(read(`supabase/migrations/${n}.sql`));
      expect(MIGRATION_GATES[n]?.[0] ?? 'blocking', n).toBe(g.gate);
    }
    // ترحيل مؤجل بقرار وآخر متسامح وثالث بلا وسم، كأنها لم تُطبَّق بعد
    const deferred = '20261102100100_leaders_activate_v5', tolerant = '20261110130000_leaders_hall_timer', blocking = '20261111110000_leaders_test_accounts';
    const p = pendingMigrations(MIGRATIONS, MIGRATIONS.filter((n) => ![deferred, tolerant, blocking].includes(n)), MIGRATION_GATES);
    expect(p.map((m) => [m.name, m.gate])).toEqual([[deferred, 'deferred'], [tolerant, 'tolerant'], [blocking, 'blocking']]);
    expect(p[0].note).toMatch(/D03/);
    expect(migrationsSummary(p)).toBe(`حاجب: ${blocking}؛ متسامح: ${tolerant}؛ مؤجل بقرار: ${deferred}`);
    expect(pendingMigrations(MIGRATIONS, MIGRATIONS, MIGRATION_GATES)).toEqual([]);
  });
});

describe('بنود الإطلاق: حكم واحد للوحة والبوابات', () => {
  const org = { id: 'o1', name: 'جهة أ', status: 'active' };
  const cohort = { id: 'c1', name: 'دفعة أ', organization_id: 'o1', status: 'running', advisor_expert_id: null, content_release: null, delivery: {} };
  const open = { id: 'd', name: 'الدفعة المفتوحة', organization_id: null, is_default: true, status: 'running', content_release: '2026.11-c1' };

  it('حالة التدقيق: دفعة جهة بلا مستشار ولا مواعيد ولا إعداد ختامي ولا إصدار، فاللوحة لا تقول «شبه جاهزة»', () => {
    const r = Object.fromEntries(launchReadiness({ organizations: [org], cohorts: [cohort, open], sessions: [], finalEval: null }, NOW).map((x) => [x.check, x]));
    expect(r['m2.cohort-per-org'].ok).toBe(true);
    expect(r['m2.advisor']).toMatchObject({ ok: false, where: 'programs', label: 'دفعات جهات بلا مستشار أساسي: دفعة أ' });
    expect(r['m2.sessions']).toMatchObject({ ok: false, where: 'activities' });
    expect(r['m2.final-eval'].ok).toBe(false);
    expect(r['m2.release-pinned']).toMatchObject({ ok: false, where: null });
    expect(r['m2.release-pinned'].label).toContain('دفعة أ');
    expect(r['m2.release-pinned'].label).not.toContain('الدفعة المفتوحة');
  });

  it('كما كانت استعلامات البوابات: نافذة 14 يومًا، والجلسة بلا دفعة تعمّ، وصيغة الكتيب، و{} ليس إعدادًا، ولا عبور بالفراغ', () => {
    const at = (days) => new Date(NOW + days * 864e5).toISOString();
    const items = (rows) => Object.fromEntries(launchReadiness(rows, NOW).map((x) => [x.check, x.ok]));
    const c = { ...cohort, advisor_expert_id: 'x', content_release: 'r' };
    expect(items({ organizations: [org], cohorts: [c], sessions: [{ cohort_id: null, active: true, starts_at: at(-20), ends_at: at(-13) }] })['m2.sessions']).toBe(true);
    expect(items({ organizations: [org], cohorts: [c], sessions: [{ cohort_id: null, active: true, starts_at: at(-20), ends_at: at(-15) }] })['m2.sessions']).toBe(false);
    expect(items({ organizations: [org], cohorts: [c], sessions: [{ cohort_id: 'c1', active: false, starts_at: at(3) }] })['m2.sessions']).toBe(false);
    expect(items({ organizations: [org], cohorts: [c], sessions: [{ cohort_id: 'other', active: true, starts_at: at(3) }] })['m2.sessions']).toBe(false);
    expect(items({ organizations: [org], cohorts: [{ ...c, delivery: '{"T-ATTEND":{"format":"handbook"}}' }] })['m2.sessions']).toBe(true);
    expect(items({ finalEval: {} })['m2.final-eval']).toBe(false);
    expect(items({ finalEval: '{"weights":{}}' })['m2.final-eval']).toBe(true);
    const none = items({});
    for (const k of ['m2.cohort-per-org', 'm2.advisor', 'm2.sessions', 'm2.release-pinned']) expect(none[k], k).toBe(false);
    // جهة غير فعّالة لا تُشترط لها دفعة، ودفعة مغلقة لا تُحسب لجهتها
    expect(items({ organizations: [org, { id: 'o2', name: 'ب', status: 'paused' }], cohorts: [c] })['m2.cohort-per-org']).toBe(true);
    expect(items({ organizations: [org], cohorts: [{ ...c, status: 'closed' }] })['m2.cohort-per-org']).toBe(false);
  });

  it('كل نقطة آلية في م2 تقرأ القاعدة لها بند في اللوحة بالمعرّف نفسه (عدا المسارات الذهبية من GitHub)', () => {
    const auto = gates.STAGES.find((s) => s.id === 2).checks.filter((c) => c.kind === 'auto').map((c) => c.id).filter((id) => id !== 'm2.golden-paths');
    expect(launchReadiness({}, NOW).map((x) => x.check).sort()).toEqual(auto.sort());
  });

  it('بنود الإعداد كما كانت في حالة النظام', () => {
    const r = setupReadiness({ instruments: [{ key: 'b2', kind: 'baseline', active: true, version: 2 }, { key: 'b3', kind: 'baseline', active: false, version: 3 }], certificate: { signatory: { name: 'س' }, hours: 0 }, defaultPrograms: 1 });
    expect(r.map((x) => [x.key, x.ok])).toEqual([['baseline', false], ['post', false], ['program', true], ['certificate', false]]);
    expect(r[0].label).toBe('المفعّل b2 وأحدث نسخة b3');
    expect(r[3].label).toBe('الشهادة بلا عدد ساعات');
  });
});

describe('ما ينقص بمعرّفه: اللوحة تفتح ملف الجهة أو الدفعة مباشرة', () => {
  it('الناقص وحده يحمل refs بنوعه، والحكم والنص كما هما', () => {
    const items = launchReadiness({
      organizations: [{ id: 'o1', name: 'سفراء', status: 'active' }, { id: 'o2', name: 'منظومة', status: 'active' }],
      cohorts: [{ id: 'c1', name: 'دفعة سفراء', organization_id: 'o1', status: 'open', advisor_expert_id: null, delivery: {} }],
      sessions: [], finalEval: null,
    }, Date.parse('2026-11-14'));
    const by = Object.fromEntries(items.map((x) => [x.key, x]));
    expect(by['cohort-per-org']).toMatchObject({ ok: false, label: 'جهات فعّالة بلا دفعة مفتوحة أو جارية: منظومة', refs: [{ kind: 'org', id: 'o2', name: 'منظومة' }] });
    expect(by.advisor.refs).toEqual([{ kind: 'cohort', id: 'c1', name: 'دفعة سفراء' }]);
    expect(by['final-eval']).not.toHaveProperty('refs');
  });
});

describe('المصدر: اللوحة والبوابات تقرآن الوحدة نفسها', () => {
  it('الأسرار التي تشترطها البوابة تفحصها حالة النظام، والبوابة تأخذ القائمة من الوحدة', () => {
    expect(gates.REQUIRED_SECRETS).toBe(REQUIRED_SECRETS);
    const sys = read('supabase/functions/leaders-api/system.ts');
    const secrets = sys.slice(sys.indexOf('const secrets = {'), sys.indexOf('};', sys.indexOf('const secrets = {')));
    for (const k of REQUIRED_SECRETS) expect(secrets, k).toMatch(new RegExp(`\\b${k}:`));
  });

  it('حالة النظام وبوابات المراحل تحكمان بـ readiness.js ولا تكرران الأحكام', () => {
    const sys = read('supabase/functions/leaders-api/system.ts');
    expect(sys).toMatch(/launchReadiness\(\{ organizations: /);
    expect(sys).toMatch(/setupReadiness\(\{ instruments: /);
    expect(sys).toMatch(/pending_migrations: mig\.pending/);
    const sg = read('scripts/ops/stage-gates.mjs');
    expect(sg).toMatch(/launchReadiness\(\{ organizations, cohorts, sessions, finalEval: /);
    expect(sg).toMatch(/pendingMigrations\(MIGRATIONS, applied, MIGRATION_GATES\)/);
    expect(sg).not.toMatch(/advisor_expert_id is not null has|final_eval <> '\{\}'::jsonb|content_release is not null has/);
    expect(sg).not.toMatch(/export const REQUIRED_SECRETS = \[/);
  });
});
