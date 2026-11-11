// تدقيق الجاهزية، مجموعة لوحة الإدارة الأساسية: حراس الخادم لفلتر الجهة في النظرة العامة (admin-core-6)
// ولطلبات ملف المشارك (admin-core-12). سلوك الواجهة في e2e/admin-audit-core.spec.js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const fn = (src, head) => { const at = src.indexOf(head); expect(at, head).toBeGreaterThan(-1); return src.slice(at, src.indexOf('\n}\n', at)); };

describe('admin-core-6: فلتر الجهة يسري على كل بطاقات النظرة العامة', () => {
  const admin = read('supabase/functions/leaders-api/admin.ts');
  const impact = read('supabase/functions/leaders-api/impact.ts');
  const index = read('supabase/functions/leaders-api/index.ts');

  it('قاعدة الجهة («none» = بلا جهة) مصدر واحد مُصدَّر يقبل عمود جدول مضمَّن', () => {
    const line = admin.match(/export const scopeOrg = [^\n]+/)?.[0];
    expect(line).toBeTruthy();
    const scopeOrg = new Function(`return ${line.replace('export const scopeOrg = ', '').replace(/: any|: unknown/g, '').replace(/;\s*$/, '')}`)();
    const q = () => { const log = []; const o = { is: (c, v) => (log.push(['is', c, v]), o), eq: (c, v) => (log.push(['eq', c, v]), o), log }; return o; };
    expect(scopeOrg(q(), 'none').log).toEqual([['is', 'organization_id', null]]);
    expect(scopeOrg(q(), 'o1', 'participants.organization_id').log).toEqual([['eq', 'participants.organization_id', 'o1']]);
    expect(scopeOrg(q(), '').log).toEqual([]);
  });

  it('admin.reviews يأخذ الجهة ويصفّي بها المتطلبات المرسلة وقائمة الاعتماد', () => {
    expect(index).toContain("'admin.reviews': (_a, b) => A.reviews(b),");
    const body = fn(admin, 'export async function reviews(');
    expect(body).toMatch(/scopeOrg\([\s\S]*participant_requirements[\s\S]*b\.org, 'participants\.organization_id'\)/);
    expect(body).toMatch(/scopeOrg\(db\.from\('participants'\)[\s\S]*b\.org\)/);
  });

  it('عدد المتطلبات المنتظرة في admin.overview بفلتر الجهة نفسه', () => {
    const body = fn(admin, 'export async function overview(');
    const at = body.indexOf('pendingReviews');
    expect(body.slice(at, at + 400)).toMatch(/scopeOrg\([\s\S]*b\.org, 'participants\.organization_id'\)/);
  });

  it('تقرير الأثر يعالج «بدون جهة» بالقاعدة نفسها، لا eq على عمود uuid', () => {
    const body = fn(impact, 'export async function adminReport(');
    expect(body).toContain('q = scopeOrg(q, b.organization_id);');
    expect(body).not.toMatch(/eq\('organization_id', String\(b\.organization_id\)\)/);
  });
});

describe('admin-core-12: ملف المشارك لا يجلب بيانات الجميع', () => {
  const index = read('supabase/functions/leaders-api/index.ts');
  const payments = read('supabase/functions/leaders-api/payments.ts');
  const experts = read('supabase/functions/leaders-api/experts.ts');

  it('admin.payments مع participant_id يرد حقوق المشارك وحده', () => {
    expect(index).toMatch(/'admin\.payments': \(_a, b\) => \(b\.participant_id \? Y\.participantEntitlements\(String\(b\.participant_id\)\) : Y\.adminOverview\(\)\)/);
    const body = fn(payments, 'export async function participantEntitlements(');
    expect(body).toContain(".eq('participant_id', participantId)");
    expect(body).not.toMatch(/payments'|participants\(/);
  });

  it('admin.expert-requests مع participant_id يصفّي على الخادم', () => {
    expect(index).toContain("'admin.expert-requests': (_a, b) => E.adminRequests(b),");
    expect(fn(experts, 'export async function adminRequests(')).toContain("q = q.eq('participant_id', String(b.participant_id))");
  });

  it('الواجهة تمرر المشارك في الطلبين', () => {
    expect(read('admin-app/src/screens/Payments.jsx')).toContain("L('admin.payments', { participant_id: participantId })");
    expect(read('admin-app/src/screens/ExpertMatch.jsx')).toContain("L('admin.expert-requests', { participant_id: participantId })");
  });
});
