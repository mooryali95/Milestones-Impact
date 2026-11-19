// P10: تعريف واحد لـ«جارية» (cohort-running.js) تقرؤه الأقفال ومكتب اليوم والجاهزية وحالة الدفعة في اللوحة
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cohortStateAr, isRunning } from '../../supabase/functions/leaders-api/cohort-running.js';
import { isRunning as deskRunning } from '../../supabase/functions/leaders-api/today-desk.js';
import { launchReadiness } from '../../supabase/functions/leaders-api/readiness.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const NOW = Date.parse('2026-11-19T09:00:00Z');
const c = { id: 'c1', name: 'الأولى', status: 'running', starts_on: '2026-11-01', ends_on: '2026-12-31' };

describe('«جارية» تعريف واحد', () => {
  it('حية وبدأت ولم تنتهِ بتاريخ UTC', () => {
    expect(isRunning(c, NOW)).toBe(true);
    expect(isRunning({ ...c, status: 'open' }, NOW)).toBe(true);
    expect(isRunning({ ...c, status: 'planned' }, NOW)).toBe(false);
    expect(isRunning({ ...c, status: 'closed' }, NOW)).toBe(false);
    expect(isRunning({ ...c, starts_on: '2026-11-20' }, NOW)).toBe(false);
    expect(isRunning({ ...c, ends_on: '2026-11-18' }, NOW)).toBe(false);
    expect(isRunning({ ...c, ends_on: '2026-11-19' }, NOW)).toBe(true);
    expect(isRunning({ ...c, ends_on: null }, NOW)).toBe(true);
    expect(isRunning({ ...c, starts_on: null }, NOW)).toBe(false);
    expect(isRunning(c, '2026-11-19')).toBe(true);
  });
  it('مكتب اليوم يعيد تصدير الدالة نفسها لا نسخة منها', () => {
    expect(deskRunning).toBe(isRunning);
  });
  it('الحالة في اللوحة من الدالة نفسها: لا «جارية» لدفعة لا تقفل شيئًا', () => {
    expect(cohortStateAr(c, NOW)).toBe('جارية');
    expect(cohortStateAr({ ...c, status: 'open' }, NOW)).toBe('جارية، والتسجيل مفتوح');
    expect(cohortStateAr({ ...c, status: 'open', starts_on: '2026-12-01' }, NOW)).toBe('التسجيل مفتوح');
    expect(cohortStateAr({ ...c, starts_on: '2026-12-01' }, NOW)).toBe('لم تبدأ بعد');
    expect(cohortStateAr({ ...c, ends_on: '2026-11-10' }, NOW)).toBe('انتهت مدتها');
    expect(cohortStateAr({ ...c, starts_on: null }, NOW)).toBe('لم يُحدد تاريخ بدئها');
    expect(cohortStateAr({ ...c, status: 'planned' }, NOW)).toBe('مخطط لها');
    expect(cohortStateAr({ ...c, is_default: true, starts_on: null }, NOW)).toBe('مفتوحة على الدوام');
    expect(cohortStateAr({ ...c, status: 'closed' }, NOW)).toBe('مغلقة');
    expect(cohortStateAr({ ...c, status: 'open', ends_on: '2026-11-10' }, NOW)).toBe('انتهت مدتها، والتسجيل مفتوح');
  });
  it('الجاهزية: بند إصدار المحتوى للجارية بالتاريخ، لا بالحالة المحفوظة', () => {
    const rows = (cohorts) => launchReadiness({ cohorts }, NOW).find((x) => x.key === 'content-release' || /إصدار محتوى/.test(x.label));
    const stale = { ...c, id: 'c2', name: 'انتهت', ends_on: '2026-11-01' };
    const r = rows([{ ...c, content_release: 'r1' }, stale]);
    expect(r.ok).toBe(true);
    expect(rows([{ ...c, content_release: null }]).ok).toBe(false);
  });
  it('كل قارئ يمر بالدالة الواحدة، ولا تعريف ثانٍ', () => {
    expect(read('supabase/functions/leaders-api/programs.ts')).toMatch(/\.find\(\(c: any\) => isRunning\(c, today\)\)/);
    expect(read('supabase/functions/leaders-api/readiness.js')).toContain('cohorts.filter((c) => isRunning(c, now))');
    expect(read('supabase/functions/leaders-api/readiness.js')).not.toContain("c.status === 'running'");
    expect(read('supabase/functions/leaders-api/today-desk.js')).not.toMatch(/function isRunning/);
    expect(read('admin-app/src/methodology.js')).toContain("export { COHORT_STATUS, cohortStateAr } from '../../supabase/functions/leaders-api/cohort-running.js'");
    for (const f of ['Programs.jsx', 'OrgTeam.jsx', 'Experts.jsx']) expect(read(`admin-app/src/screens/${f}`)).toContain('cohortStateAr(');
  });
});
