// تدقيق الجاهزية 2026-11-11، مبادرة المشارك وتقييم الخبير: حراس مصدر لما يرسله الخادم إلى الواجهة. السلوك نفسه
// في اختبارات Deno (rater_expiry_test.ts وexpert_apply_test.ts) وفي e2e/leaders-initiative.spec.js.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('p-capstone-6: الدعوة المنتهية ظاهرة للمشارك', () => {
  const impact = read('supabase/functions/leaders-api/impact.ts');
  it('raterView تحمل expired للدعوة المرسلة التي انقضت مهلتها', () => {
    expect(impact).toContain("const raterExpired = (r: any) => r.status === 'invited' && !!r.expires_at && new Date(r.expires_at) < new Date();");
    const view = impact.slice(impact.indexOf('export const raterView'), impact.indexOf('export const raterView') + 400);
    expect(view).toContain('expired: raterExpired(r)');
  });
});

describe('p-capstone-8: عنوان تقييم الخدمة سليم لغويًا', () => {
  it('pendingRatings تسمي الطلب المكتمل «خدمة «الدور»» لا الدور وحده', () => {
    const experts = read('supabase/functions/leaders-api/experts.ts');
    const fn = experts.slice(experts.indexOf('export async function pendingRatings'), experts.indexOf('export async function rateExpert'));
    expect(fn).toContain('what: `خدمة «${roleAr(x.role)}»`');
    expect(fn).not.toContain('what: roleAr(x.role)');
  });
});
