// الحساب التجريبي لكل دفعة (المرحلة 2 من تصوره): سطر الحالة في ملف الدفعة، وتأكيد إعادة الضبط الذي يسمّي الدفعة، واسم الدفعة
// في شريط الحساب، وربط الأفعال في الخادم. السلوك على الخادم في demo_cohort_test.ts (Deno)، والقيود في demo-cohort-schema.test.js.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cohortDemoLine } from './screens/CohortDemo.jsx';
import { cohortResetConfirmAr } from './DemoLinks.jsx';
import DemoBar from '../../leaders-app/src/DemoBar.jsx';
import { DEMO_ALL_SKIPPED_AR, DEMO_ROW_KEEP, demoCohortLabel, demoStageLine } from '../../supabase/functions/leaders-api/demo-stage.js';

const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('سطر حالة الحساب التجريبي في ملف الدفعة', () => {
  const base = { success: true, ready: true, general: false, closed: false, exists: false, links: [] };
  it('غير مفعّلة بعد، ولم يُنشأ، والمغلقة، والقائم بمرحلته وآخر استعماله', () => {
    expect(cohortDemoLine({ ...base, ready: false })).toBe('غير مفعّلة بعد');
    expect(cohortDemoLine(base)).toBe('لم يُنشأ بعد: يُنشأ عند أول فتح');
    expect(cohortDemoLine({ ...base, closed: true })).toBe('الدفعة مغلقة: حُذف حسابها التجريبي عند إغلاقها، ولا يُفتح لدفعة مغلقة');
    expect(cohortDemoLine({ ...base, closed: true, exists: true })).toContain('ما زال قائمًا');
    const on = cohortDemoLine({ ...base, exists: true, stage: 'التدريب', last_used_at: '2026-11-22T09:30:00Z', last_opened_at: '2026-11-22T09:00:00Z', last_opened_by: 'a@x.com' });
    expect(on.startsWith('قائم · عند: التدريب · آخر استعمال ')).toBe(true);
    expect(on).toContain('آخر فتح من اللوحة');
    expect(cohortDemoLine({ ...base, exists: true, stage: 'الملف الشخصي' })).toBe('قائم · عند: الملف الشخصي · لم يُستعمل بعد');
    expect(cohortDemoLine(null)).toBe('');
    expect(cohortDemoLine({ failed: true })).toBe('');
  });
  it('تأكيد إعادة الضبط يسمّي الدفعة والروابط النشطة، ويقول إن غيرها لا يُمس', () => {
    const none = cohortResetConfirmAr('قادة الجهة 1', []);
    expect(none).toContain('إعادة الحساب التجريبي لدفعة «قادة الجهة 1» إلى البداية؟');
    expect(none).toContain('حسابات الدفعات الأخرى والحساب العام لا تُمس.');
    const one = cohortResetConfirmAr('قادة الجهة 1', [{ label: 'مدير الدفعة' }]);
    expect(one).toContain('الرابط النشط: «مدير الدفعة»، ويبقى رابطه صالحًا.');
    const two = cohortResetConfirmAr('قادة الجهة 1', [{ label: 'مدير الدفعة' }, { label: 'مسؤول الجهة' }]);
    expect(two).toContain('الروابط النشطة: «مدير الدفعة»، «مسؤول الجهة»، وتبقى روابطهم صالحة.');
    for (const t of [none, one, two, cohortDemoLine(base)]) expect(t).not.toMatch(DASH);
  });
  it('المنطق المشترك مع الخادم: سطر المرحلة واسم الدفعة، و«أعد من البداية» يبقي عمود الدفعة', () => {
    expect([demoStageLine({ kind: 'none', title: null }), demoStageLine({ kind: 'assessment', title: 'القياس واعتماد المسار' })]).toEqual([DEMO_ALL_SKIPPED_AR, 'القياس واعتماد المسار']);
    expect([demoCohortLabel(' قادة الجهة 1 '), demoCohortLabel(undefined)]).toEqual(['دفعة «قادة الجهة 1»', '']);
    expect(DEMO_ROW_KEEP).toContain('demo_cohort_id');
  });
});

describe('شريط الحساب التجريبي يسمّي دفعته', () => {
  const me = (cohort) => ({ profile: { approved: true }, cohort, journey: [{ key: 'training', title_ar: 'التدريب', status: 'active', items: [] }] });
  const html = (cohort, shared = false) => renderToStaticMarkup(React.createElement(DemoBar, { me: me(cohort), shared, onUpdate() {} }));
  it('حساب دفعة: اسمها بجانب الشارة. والحساب العام (الدفعة المفتوحة، بلا اسم) كما كان', () => {
    const c = html({ name: 'قادة الجهة 1', starts_on: '2026-12-01', ends_on: null });
    expect(c).toContain('data-testid="demo-cohort"');
    expect(c).toContain('دفعة «قادة الجهة 1»');
    expect(c).toContain('حساب تجريبي');
    const g = html(null, true);
    expect(g).not.toContain('demo-cohort');
    expect(g).toContain('وقد يراه غيرك ممن يجرّب');
  });
});

describe('ربط الأفعال في الخادم وفي اللوحة', () => {
  const index = read('supabase/functions/leaders-api/index.ts');
  it('حالة حساب الدفعة للكاتب، والفتح للكاتب، وإعادة الضبط للمدير الأعلى وحده، كلها بالأفعال القائمة ومعها cohort_id', () => {
    expect(index).toContain("'admin.demo-cohort': (a, b) => A.writer(a, (_x, y) => D.cohortStatus(y), b),");
    expect(index).toContain("'admin.demo-open': (a, b, ctx) => A.writer(a, (x, y) => D.open(x, y, ctx), b),");
    expect(index).toContain("'admin.demo-reset': (a, b) => A.superWriter(a, D.reset, b),");
    // ولا فعل مشارك ولا فعل مفتوح يأخذ دفعة: الدفعة من صف الحساب أو من رابطه
    const demo = read('supabase/functions/leaders-api/demo.ts');
    const linkOpen = demo.slice(demo.indexOf('export async function linkOpen'), demo.indexOf('export async function linkSession'));
    expect(linkOpen).not.toMatch(/b\.cohort_id/);
    expect(linkOpen).toContain('const p = await demoRow(cohortId);');
    for (const fn of ['skipStage', 'openAll', 'restart', 'fillProfile', 'fillAssessment']) {
      const at = demo.indexOf(`export async function ${fn}`);
      expect(demo.slice(at, demo.indexOf('\n}\n', at))).not.toMatch(/cohort_id/);
    }
  });
  it('البطاقة في ملف الدفعة للكاتب، وزر إعادة الضبط للمدير العام، وروابط الدفعة تحمل معرّفها', () => {
    const programs = read('admin-app/src/screens/Programs.jsx');
    expect(programs).toContain('{canWrite && <><h3 className="la-phase">الحساب التجريبي</h3><CohortDemo key={c.id} c={c} canWrite={canWrite} /></>}');
    const card = read('admin-app/src/screens/CohortDemo.jsx');
    expect(card).toContain("{isSuperAdmin() && s.exists && <button");
    expect(card).toContain("const scope = s?.general ? {} : { cohort_id: c.id };");
    expect(read('admin-app/src/DemoLinks.jsx')).toContain("L('admin.demo-link-create', { label, days, ...(cohort ? { cohort_id: cohort.id } : {}) })");
    for (const f of ['admin-app/src/screens/CohortDemo.jsx', 'leaders-app/src/DemoBar.jsx', 'supabase/functions/leaders-api/demo-cohort.ts', 'supabase/functions/leaders-api/demo.ts']) expect(read(f)).not.toMatch(DASH);
  });
});
