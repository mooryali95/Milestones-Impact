// حراس التشغيل (المرحلة ب): التنبيه الفوري في كل دالة، والمسبار الحقيقي،
// وبوابة النشر بعد CI، وسير النشر اليدوي بلا مشغّل دفع.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('التنبيه الفوري والمسبار', () => {
  const index = read('supabase/functions/leaders-api/index.ts');
  it('system.ping إجراء مفتوح يمر بالقاعدة', () => {
    const open = index.slice(index.indexOf('const open:'), index.indexOf('\n};', index.indexOf('const open:')));
    expect(open).toMatch(/'system\.ping'/);
    expect(read('supabase/functions/leaders-api/system.ts')).toMatch(/export async function ping[\s\S]*from\('programs'\)/);
  });
  it('الخطأ الداخلي يحمل رقم مرجع ويُبلَّغ فورًا', () => {
    const tail = index.slice(index.lastIndexOf('} catch (e) {'));
    expect(tail).toMatch(/alertOps\('internal'/);
    expect(tail).toMatch(/ref/);
    expect(tail).toMatch(/mail_failed[\s\S]*mail_cap/);
  });
  it('خطافا Creem والحجز يبلّغان عند الفشل', () => {
    expect(read('supabase/functions/creem-webhook/index.ts')).toMatch(/alertOps\('creem-webhook'/);
    expect(read('supabase/functions/leaders-hooks/index.ts')).toMatch(/alertOps\('leaders-hooks'/);
  });
  it('التنبيه مكبوح عشر دقائق لكل نوع من audit_log', () => {
    const core = read('supabase/functions/leaders-api/core.ts');
    expect(core).toMatch(/export async function alertOps/);
    expect(core).toMatch(/'system\.alert'[\s\S]*entity_id', kind/);
  });
});

describe('بوابة النشر', () => {
  const ci = read('.github/workflows/ci.yml');
  it('النشر وظيفة تلي الفحوص على main فقط', () => {
    const deploy = ci.slice(ci.indexOf('\n  deploy:'));
    expect(deploy).toMatch(/needs: build-and-test/);
    expect(deploy).toMatch(/github\.ref == 'refs\/heads\/main'/);
    expect(deploy).toMatch(/system\.ping/);
    expect(deploy).toMatch(/refs\/heads\/release/);
    // الدوال قبل دفع release
    expect(deploy.indexOf('functions deploy leaders-api')).toBeLessThan(deploy.indexOf('refs/heads/release'));
  });
  it('سير النشر اليدوي لا يعمل عند الدفع', () => {
    const manual = read('.github/workflows/deploy-leaders-api.yml');
    expect(manual).toMatch(/workflow_dispatch/);
    expect(manual).not.toMatch(/\n\s+push:/);
  });
  it('المسبار والتمرين موجودان', () => {
    expect(read('.github/workflows/probe.yml')).toMatch(/system\.ping/);
    expect(read('.github/workflows/restore-drill.yml')).toMatch(/pg_restore[\s\S]*leaders\.participants/);
    expect(read('.github/workflows/backup.yml')).toMatch(/backup-storage\.mjs/);
    // الترحيلات على الحية بقرار المالك: سير يدوي بالأسماء، لا يُشغَّل بغير dispatch
    const mig = read('.github/workflows/migrate.yml');
    expect(mig).toMatch(/workflow_dispatch/);
    expect(mig).not.toMatch(/\n  push:|\n  pull_request:|schedule:/);
    expect(mig).toMatch(/apply-migration\.mjs \$MIGRATIONS/);
    expect(read('scripts/db/apply-migration.mjs')).toMatch(/schema_migrations where name = /);
  });
});
