// حراس الحزمة 13: دليل المشغّل وخطة الحوادث وصفحة حقائق الجهات موجودة، ومربوطة من دليل التشغيل،
// وحقائقها تطابق مصادرها في الكود (مكان البيانات، والاحتفاظ، والصلاحيات، والإخطار خلال 72 ساعة).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VIEWER_PERM_AR } from '../../supabase/functions/leaders-api/labels.js';
import { RETENTION_DAYS as MAIL_RETENTION } from '../../supabase/functions/_shared/mail-budget.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const facts = read('docs/ops/صفحة-حقائق-الجهات-v1.md');
const incident = read('docs/ops/خطة-الاستجابة-للحوادث-v1.md');
const guide = read('docs/ops/دليل-المشغل-v1.md');

describe('الوثائق الثلاث', () => {
  it('مربوطة من دليل التشغيل وHANDOFF', () => {
    const runbook = read('RUNBOOK.md');
    for (const f of ['دليل-المشغل-v1.md', 'خطة-الاستجابة-للحوادث-v1.md', 'صفحة-حقائق-الجهات-v1.md']) expect(runbook).toContain(`docs/ops/${f}`);
  });
  it('صفحة الجهات تطابق السياسة والكود', () => {
    for (const s of ['ap-south-1', 'مومباي', 'Cloudflare R2', 'لا يملكه Cloudflare', 'RPO', 'RTO', '72 ساعة', `${MAIL_RETENTION} يومًا`, '90 يومًا', 'لمن وافق من المشاركين وحده']) expect(facts).toContain(s);
    for (const [title, what] of Object.values(VIEWER_PERM_AR)) { expect(facts).toContain(title); expect(facts).toContain(what); }
    expect(read('leaders-app/src/screens/Legal.jsx')).toContain('مومباي بالهند');
  });
  it('خطة الحوادث بمستويات وأدوار وإخطار وقوالب وسجل', () => {
    for (const s of ['ح1', 'ح2', 'ح3', 'ح4', 'قائد الحادث', 'مسؤول حماية البيانات', 'خلال 72 ساعة من العلم به', '5.1', '5.2', '5.3', 'سجل الحوادث', '42703']) expect(incident).toContain(s);
  });
  it('دليل المشغّل يغطي القرارات والدورة', () => {
    for (const s of ['يوميًا', 'أسبوعيًا', 'شهريًا', 'قبل أول قياس مبدئي', 'عند الإغلاق', 'بتعليل مكتوب', 'D19', 'D20', 'D08']) expect(guide).toContain(s);
  });
});

describe('إصلاح ما كشفه التوثيق', () => {
  it('إخطار المقاعد: المنسق ببوابة جهته، والإدارة بصفحة الطلبات', () => {
    const e = read('supabase/functions/leaders-api/entitlements.ts');
    const fn = e.slice(e.indexOf('async function notifyOrg('), e.indexOf('// يثبّت لمشارك بمعرّفه'));
    expect(fn).toMatch(/for \(const t of coordEmails\) await send\(t, `\$\{CONFIG\.appUrl\}\/org`, 'افتح بوابة جهتك'\);/);
    expect(fn).toMatch(/await send\(CONFIG\.alertEmail, `\$\{SITES\.admin\}\/#\/leaders\/payments`, 'افتح الطلبات'\);/);
  });
});
