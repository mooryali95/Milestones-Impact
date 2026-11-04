// نطاقات الجهات: المصدر الواحد لقواعد النطاق (domains.js) يرفض اللواحق العامة
// ونطاقات البريد العام، ولا تدخل اللواحق العامة في مطابقة النطاق الأم.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { domainCandidates, hostOf, isPublicMail, isPublicSuffix, orgDomainIssue } from '../../supabase/functions/leaders-api/domains.js';

describe('اسم المضيف', () => {
  it('يقبل الروابط والنطاقات ويطبّعها', () => {
    expect(hostOf('https://www.Manzoma.sa/path?x=1')).toBe('manzoma.sa');
    expect(hostOf('MI.manzoma.sa')).toBe('mi.manzoma.sa');
    expect(hostOf('')).toBeNull();
    expect(hostOf('localhost')).toBeNull();
    expect(hostOf('not a host')).toBeNull();
  });
});

describe('نطاق الجهة', () => {
  it('يرفض اللواحق العامة ويقبل النطاق تحتها', () => {
    expect(isPublicSuffix('gov.sa')).toBe(true);
    expect(orgDomainIssue('gov.sa')).toMatch(/لاحقة عامة/);
    expect(orgDomainIssue('com.sa')).toMatch(/لاحقة عامة/);
    expect(orgDomainIssue('co.uk')).toMatch(/لاحقة عامة/);
    expect(orgDomainIssue('moh.gov.sa')).toBeNull();
    expect(orgDomainIssue('https://manzoma.sa')).toBeNull();
  });
  it('يرفض نطاقات البريد العام', () => {
    expect(isPublicMail('gmail.com')).toBe(true);
    expect(isPublicMail('Outlook.sa')).toBe(true);
    expect(orgDomainIssue('gmail.com')).toMatch(/بريد عام/);
    expect(isPublicMail('manzoma.sa')).toBe(false);
  });
  it('يرفض ما ليس نطاقًا', () => {
    expect(orgDomainIssue('sa')).toMatch(/غير صحيح/);
    expect(orgDomainIssue('')).toMatch(/غير صحيح/);
  });
});

describe('مرشحو المطابقة الأم', () => {
  it('النطاق ثم آباؤه دون اللاحقة العامة وامتداد الدولة', () => {
    expect(domainCandidates('mail.moh.gov.sa')).toEqual(['mail.moh.gov.sa', 'moh.gov.sa']);
    expect(domainCandidates('mi.manzoma.sa')).toEqual(['mi.manzoma.sa', 'manzoma.sa']);
    expect(domainCandidates('gov.sa')).toEqual([]);
    expect(domainCandidates(null)).toEqual([]);
  });
});

// حارس المصدر: التسجيل لا يربط بجهة من الموقع المُحيل، والخادم واللوحة يستعملان القواعد نفسها
describe('ربط الجهة في الخادم', () => {
  const api = join(__dirname, '../../supabase/functions/leaders-api');
  const participant = readFileSync(join(api, 'participant.ts'), 'utf8');
  const admin = readFileSync(join(api, 'admin.ts'), 'utf8');
  const orgForm = readFileSync(join(__dirname, '../../admin-app/src/screens/OrgForm.jsx'), 'utf8');
  it('الموقع المُحيل (ref) لا يصل إلى مطابقة النطاق', () => {
    expect(participant).not.toMatch(/orgByHost\(\s*hostOf\(\s*b\.ref/);
    const resolve = participant.slice(participant.indexOf('async function resolveOrg'), participant.indexOf('\n}\n', participant.indexOf('async function resolveOrg')));
    expect(resolve).not.toMatch(/ref|orgByHost/);
  });
  it('مطابقة النطاق تمر بمرشحي domains.js', () => {
    expect(participant).toMatch(/domainCandidates\(host\)/);
    expect(participant).toMatch(/isPublicMail\(dom\)/);
  });
  it('نقل المشارك عن جهته يلغي إعفاء راعيه السابق', () => {
    const fn = admin.slice(admin.indexOf('export async function assignOrg'), admin.indexOf('\n}\n', admin.indexOf('export async function assignOrg')));
    expect(fn).toMatch(/entitlements[\s\S]*source', 'sponsor'[\s\S]*revoked_at/);
  });
  it('حفظ نطاقات الجهة في الخادم واللوحة بقاعدة واحدة', () => {
    expect(admin).toMatch(/orgDomainIssue\(d\)/);
    expect(orgForm).toMatch(/orgDomainIssue\(/);
  });
});
