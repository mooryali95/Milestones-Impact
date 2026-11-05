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
    expect(deploy.indexOf('deploy leaders-api')).toBeLessThan(deploy.indexOf('refs/heads/release'));
  });
  it('الدوال الست كلها خلف البوابة، ولكل دالة تخدم واجهة مسبار حقيقي (المرحلة ل0)', () => {
    const deploy = ci.slice(ci.indexOf('\n  deploy:'));
    for (const fn of ['leaders-api', 'creem-webhook', 'leaders-hooks', 'send-otp', 'admin-api', 'user-api']) {
      expect(deploy).toMatch(new RegExp(`\\n\\s+deploy ${fn}( --no-verify-jwt)?\\n`));
      expect(deploy.indexOf(`deploy ${fn}`)).toBeLessThan(deploy.indexOf('refs/heads/release'));
    }
    // النشر بثلاث محاولات لكل دالة، والـCLI من npm لا من setup-cli (504 وحد المعدل)
    for (const text of [deploy, read('.github/workflows/deploy-leaders-api.yml')]) {
      expect(text).toMatch(/for i in 1 2 3; do[\s\S]*supabase functions deploy "\$@"/);
      expect(text).toMatch(/npm i -g supabase@/);
      expect(text).not.toMatch(/uses: supabase\/setup-cli/);
    }
    const manual = read('.github/workflows/deploy-leaders-api.yml');
    const probe = read('.github/workflows/probe.yml');
    for (const text of [deploy, manual, probe]) {
      expect(text).toMatch(/ping leaders-api system\.ping/);
      expect(text).toMatch(/ping admin-api ping/);
      expect(text).toMatch(/ping user-api ping/);
    }
    for (const fn of ['admin-api', 'user-api']) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      const at = src.indexOf('action === "ping"');
      expect(at).toBeGreaterThan(0);
      // المسبار قبل أي بوابة جلسة، ويمر بالقاعدة فعلًا
      expect(at).toBeLessThan(src.indexOf('انتهت الجلسة'));
      expect(src.slice(at, at + 400)).toMatch(/from\("api_sessions"\)[\s\S]*db_ms/);
    }
  });
  it('وضع check في migrate.yml قراءة فقط: الجدولة وأسماء الأسرار بلا قيم (المرحلة ل0)', () => {
    const mig = read('.github/workflows/migrate.yml');
    expect(mig).toMatch(/type: choice[\s\S]*- apply\n\s+- check/);
    expect(mig).toMatch(/apply-migration\.mjs --check/);
    const script = read('scripts/db/apply-migration.mjs');
    expect(script).toMatch(/from cron\.job order by jobid/);
    expect(script).toMatch(/cron\.job_run_details/);
    expect(script).toMatch(/select name from vault\.secrets/);
    expect(script).not.toMatch(/decrypted_secrets|select secret/);
    expect(script).toMatch(/leaders-weekly-reminders[\s\S]*leaders-expert-offers/);
    expect(script).toMatch(/leaders_cron_secret/);
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
