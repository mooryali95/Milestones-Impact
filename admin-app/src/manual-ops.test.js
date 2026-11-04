// حراس المرحلة د: العمليات التي كانت تتطلب تعديل القاعدة يدويًا صارت من اللوحة، وحساب العرض معزول،
// والإجراءات الخطرة للمدير الأعلى وحده.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const api = (f) => read(`supabase/functions/leaders-api/${f}`);

describe('العمليات اليدوية صارت إجراءات على الخادم وفي اللوحة', () => {
  const index = api('index.ts');
  const admin = api('admin.ts');
  const ui = read('admin-app/src/screens/Participants.jsx');
  it('تصحيح بيانات المشارك بتدقيق قبل/بعد', () => {
    expect(index).toMatch(/'admin\.participant-save': A\.participantSave/);
    expect(admin).toMatch(/export async function participantSave[\s\S]*requireWrite\(a\)[\s\S]*audit\('admin', a\.email, 'participant\.edit'/);
    expect(ui).toMatch(/L\('admin\.participant-save'/);
  });
  it('التسجيل الصريح في دفعة وإصدار الشهادة لهما واجهة', () => {
    expect(ui).toMatch(/L\('admin\.programs'/);
    expect(ui).toMatch(/act\('admin\.cohort-enroll'/);
    expect(ui).toMatch(/act\('admin\.certificate-issue'/);
  });
  it('حذف المشارك بأثر: عرض الأثر، موانع، تأكيد بالبريد، للمدير الأعلى', () => {
    expect(index).toMatch(/'admin\.participant-impact'/);
    expect(index).toMatch(/'admin\.participant-delete': A\.participantDelete/);
    expect(admin).toMatch(/export async function participantDelete[\s\S]*requireSuper\(a\)[\s\S]*blockers[\s\S]*confirm_email[\s\S]*storage\.from\(BUCKET\)\.remove/);
    expect(admin).toMatch(/valid_certificates\) blockers\.push/);
    expect(admin).toMatch(/paid_payments\) blockers\.push/);
    expect(ui).toMatch(/L\('admin\.participant-impact'/);
    expect(ui).toMatch(/L\('admin\.participant-delete'/);
  });
  it('جدول نقاط كاتون يُعدَّل من اللوحة لبرنامج محدد', () => {
    expect(read('admin-app/src/screens/Katon.jsx')).toMatch(/L\('admin\.katon-points', \{ program_id: d\.program_id/);
    expect(api('katon.ts')).toMatch(/program_id: programId/);
  });
});

describe('الإجراءات الخطرة للمدير الأعلى وحده', () => {
  const index = api('index.ts');
  const admin = api('admin.ts');
  it('requireSuper يتضمن العامل الثاني ويرفض غير المدير الأعلى', () => {
    expect(admin).toMatch(/export function requireSuper\(a: Admin\) \{\s*requireWrite\(a\);\s*if \(a\.role !== 'super_admin'\)/);
  });
  it.each(['admin.program-restore', 'admin.payment-settings', 'admin.certificate-reissue-org', 'admin.demo-reset', 'admin.coordinator-remove'])('%s عبر superWriter', (action) => {
    expect(index).toMatch(new RegExp(`'${action.replace('.', '\\.')}': \\(a, b\\) => A\\.superWriter\\(`));
  });
  it('حذف جهة يطلب المدير الأعلى داخل remove', () => {
    const fn = admin.slice(admin.indexOf('export async function remove('), admin.indexOf('\n}\n', admin.indexOf('export async function remove(')));
    expect(fn).toMatch(/b\.entity === 'organizations'\) \{\s*requireSuper\(a\)/);
  });
});

describe('عزل حساب العرض', () => {
  it('البريد إلى نطاق العرض لا يُرسل أبدًا، والنطاق مصدر واحد', () => {
    const core = api('core.ts');
    expect(core).toMatch(/export const DEMO_MAIL_DOMAIN = 'demo\.milestone-impact\.org'/);
    expect(core).toMatch(/export async function sendMail[^\n]*\n\s*if \(isDemoMail\(to\)\)/);
    expect(api('demo.ts')).toMatch(/DEMO_EMAIL = `demo@\$\{DEMO_MAIL_DOMAIN\}`/);
  });
  it('الموجّه يغلق له ما يرسل بريدًا لغيره أو يشغل خبيرًا أو يفتح دفعًا', () => {
    const index = api('index.ts');
    for (const a of ['experts.choose', 'rater.invite', 'coaching.instant', 'sponsor.request', 'pay.checkout']) expect(index).toMatch(new RegExp(`DEMO_BLOCKED = new Set\\(\\[[^\\]]*'${a.replace('.', '\\.')}'`));
    expect(index).toMatch(/p\.is_demo && DEMO_BLOCKED\.has\(action\)/);
  });
  it('لا يدخل طوابير المراجعة ولا القاعة ولا التذكير', () => {
    const admin = api('admin.ts');
    expect(admin).toMatch(/participants!inner\(full_name, email, is_demo\)[\s\S]*\.eq\('participants\.is_demo', false\)/);
    expect(admin).toMatch(/\.eq\('status', 'pending_approval'\)\.eq\('is_demo', false\)/);
    expect(admin).toMatch(/model_submissions[\s\S]*participants!inner\([^)]*is_demo\)[\s\S]*\.eq\('participants\.is_demo', false\)/);
    expect(admin).toMatch(/\.neq\('status', 'suspended'\)\.eq\('is_demo', false\)/);
    expect(api('capstone.ts')).toMatch(/participants!inner\([^)]*is_demo\)'\)\s*\.eq\('participants\.is_demo', false\)/);
    expect(api('programs.ts')).toMatch(/\.in\('id', all\)\.eq\('is_demo', false\)/);
  });
});
