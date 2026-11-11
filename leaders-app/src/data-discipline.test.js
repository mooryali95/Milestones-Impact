// حراس المرحلة هـ: قاعدة الاعتماد في دالة واحدة، وسجل الترحيلات، واللقطة من الترحيلات،
// وتثبيت الراعي عند الربط، وقائمة الترحيلات المولَّدة.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approvalOf } from '../../supabase/functions/leaders-api/logic.js';
import { MIGRATIONS } from '../../supabase/functions/leaders-api/migrations.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const api = (f) => read(`supabase/functions/leaders-api/${f}`);
const LEDGER = '20261105110000_leaders_schema_migrations';

describe('قاعدة «المسار معتمد» واحدة', () => {
  it('ثلاثة تسكينات كلها معتمدة، والمستويات منها', () => {
    const pl = [{ dimension: 'milestone', level: 'beginner', approved_at: 'x' }, { dimension: 'impact', level: 'advanced', approved_at: 'x' }, { dimension: 'leadership', level: 'intermediate', approved_at: 'x' }];
    expect(approvalOf(pl)).toEqual({ approved: true, levels: { milestone: 'beginner', impact: 'advanced', leadership: 'intermediate' } });
    expect(approvalOf(pl.slice(0, 2)).approved).toBe(false);
    expect(approvalOf([...pl.slice(0, 2), { ...pl[2], approved_at: null }]).approved).toBe(false);
    expect(approvalOf(null)).toEqual({ approved: false, levels: {} });
  });
  it('لا نسخة من القاعدة في معالجات الخادم', () => {
    const dir = join(root, 'supabase/functions/leaders-api');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/length === 3 && [^\n]*approved_at/);
      expect(src, f).not.toMatch(/length < 3 \|\|[^\n]*approved_at/);
    }
    for (const f of ['activities.ts', 'admin.ts', 'capstone.ts', 'katon.ts', 'participant.ts']) expect(api(f)).toMatch(/approvalOf\(/);
  });
});

describe('سجل الترحيلات', () => {
  const names = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort();
  it('القائمة المولَّدة تطابق المجلد', () => expect(MIGRATIONS).toEqual(names));
  it('كل ترحيل منذ السجل يسجّل اسمه فيه (ترحيل السجل نفسه يسجّله في بذرته)', () => {
    for (const n of names.filter((x) => x >= '20261105100000' && x !== LEDGER)) {
      expect(read(`supabase/migrations/${n}.sql`), n).toContain(`insert into leaders.schema_migrations (name) values ('${n}') on conflict do nothing;`);
    }
  });
  it('بذرة السجل تستثني ما لم يُطبَّق بقرار وما يسجّل نفسه', () => {
    const seed = read(`supabase/migrations/${LEDGER}.sql`);
    expect(seed).not.toMatch(/\('20261102100100_leaders_activate_v5'\)/);
    expect(seed).not.toMatch(/\('20261105100000_contact_requests_via_function'\)/);
    expect(seed.match(/\('20261105110000_leaders_schema_migrations'\)/g)).toHaveLength(1);
  });
  it('فحص الصحة يقرأ السجل ويقارنه بالقائمة، وتعذّر السجل يظهر ولا يُستدل بالأثر', () => {
    const sys = api('system.ts');
    expect(sys).toMatch(/from\('schema_migrations'\)\.select\('name'\)/);
    // المقارنة بوسم بوابة النشر من المصدر المشترك مع بوابات المراحل (readiness.js)
    expect(sys).toMatch(/pendingMigrations\(MIGRATIONS, \(data \|\| \[\]\)\.map\(\(r: any\) => r\.name\), MIGRATION_GATES/);
    expect(sys).toMatch(/migrations_ledger: mig\.ledger/);
    expect(sys).not.toMatch(/MARKERS|async function present\(/);
    expect(sys).toMatch(/h\.migrations_ledger \? \[\] : \['تعذّرت قراءة سجل الترحيلات/);
  });
});

describe('اللقطة والتثبيت', () => {
  it('اللقطة تحمل نقطتها وتضم الجداول التي يستعملها الكود', () => {
    const base = read('supabase/schema/baseline.sql');
    expect(base).toMatch(/^-- as-of migration: \d{14}_/m);
    for (const t of ['entitlements', 'payments', 'katon_topics', 'hall_sessions', 'cohort_groups', 'final_evaluations', 'sponsor_requests', 'program_milestones', 'track_profiles', 'schema_migrations']) {
      expect(base, t).toContain(`create table if not exists leaders.${t} (`);
    }
    expect(base).not.toMatch(/backup_2026/);
  });
  it('الراعي يُثبَّت عند كل مسار ربط، بعملة', () => {
    // العملة من الإعداد لحظة التثبيت، تمر إلى الدالة الذرية (D20) وحدها
    expect(api('entitlements.ts')).toMatch(/const currency = s\.currency \|\| 'USD';[\s\S]*p_currency: currency/);
    const participant = api('participant.ts');
    expect(participant.match(/pinSponsorFor\(/g)?.length).toBeGreaterThanOrEqual(4);
    expect(api('admin.ts')).toMatch(/if \(target\) for \(const id of moved\) if \(await pinSponsorFor\(id\)\)/);
    expect(api('sponsor.ts')).toMatch(/await pinSponsorFor\(p\.id\)/);
    expect(api('payments.ts')).not.toMatch(/async function pinSponsor\(/);
  });
});
