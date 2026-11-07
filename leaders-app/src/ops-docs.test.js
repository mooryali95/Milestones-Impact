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
  it('مهمة التنفيذ على الإنتاج: كل ترحيل في المستودع منذ v5 مسمى بترتيبه، والتفعيل بجواب المالك، ولا نشر من وكيل', () => {
    const task = read('docs/ops/مهمة-التنفيذ-على-الإنتاج-v1.md');
    for (const n of ['20261107100000_leaders_content_provenance', '20261107110000_sspdf_freeze', '20261107120000_leaders_mail_events', '20261107130000_leaders_sponsor_seats',
      '20261107140000_leaders_certificate_suspended', '20261107150000_leaders_rubric_scale', '20261107160000_leaders_consent_events', '20261107170000_leaders_rater_verification',
      '20261107180000_leaders_content_releases', '20261105150000_leaders_v5_1_pre_activation', '20261107190000_leaders_v5_2_balance', '20261102100100_leaders_activate_v5']) expect(task).toContain(n);
    expect(task).toContain('«نعم، فعّل v5»');
    expect(task).toContain('لا تلتف عليهما');
    expect(task).not.toMatch(/sbp_[A-Za-z0-9]{8,}/);
    expect(read('docs/ops/قائمة-المالك-قبل-الإطلاق-v1.md')).toContain('docs/ops/مهمة-التنفيذ-على-الإنتاج-v1.md');
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
