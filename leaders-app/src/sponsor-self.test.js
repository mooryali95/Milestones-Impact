// تصور المرحلة 1، البند 2: المشارك لا يكون راعيًا لنفسه. بريده (الأساسي أو البديل، بأي حالة أحرف) في خانة الراعي
// يفشل فحص الراعي في وثيقته، ولا يُعد بريد راعٍ صالحًا في الخادم، والنطاق العام أو الخارج عن نطاق الجهة تنبيه غير مانع.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { capstoneChecks, sponsorEmailFrom, sponsorWarnings } from '../../supabase/functions/leaders-api/capstone.js';

const MODELS = { 'initiative-charter': { key: 'initiative-charter', fields: [] } };
const check = (email, ownEmails) => capstoneChecks({ models: MODELS, answers: { 'initiative-charter': { sponsor_email: email } }, ownEmails }).find((c) => c.key === 'sponsor');

describe('الراعي غير صاحب المبادرة', () => {
  it('بريد المشارك نفسه بحالة أحرف مختلفة يفشل فحص الراعي بجملة تقول السبب', () => {
    const c = check('Ali@Example.COM ', ['ali@example.com']);
    expect(c.ok).toBe(false);
    expect(c.detail).toMatch(/بريدك/);
  });
  it('بريده البديل كذلك، وبريد غيره يمر، والفحص لا يمنع التسليم', () => {
    expect(check('alt@work.sa', ['ali@example.com', 'ALT@work.sa']).ok).toBe(false);
    const ok = check('boss@work.sa', ['ali@example.com']);
    expect(ok.ok).toBe(true);
    expect(ok.blocking).toBeUndefined();
  });
  it('الخادم: بريد المشارك ليس بريد راعٍ، وغيره يُطبَّع', () => {
    expect(sponsorEmailFrom({ sponsor_email: 'ALI@example.com' }, ['ali@example.com'])).toBe(null);
    expect(sponsorEmailFrom({ sponsor_email: ' Boss@Work.sa ' }, ['ali@example.com'])).toBe('boss@work.sa');
    expect(sponsorEmailFrom({ sponsor_email: 'غير بريد' }, [])).toBe(null);
  });
  it('تنبيه غير مانع: بريد عام، ونطاق غير نطاق الجهة، ولا تنبيه لنطاق الجهة ولا للفرد بلا جهة', () => {
    expect(sponsorWarnings('x@gmail.com', { orgDomains: ['work.sa'], linked: true })).toEqual(['بريد عام']);
    expect(sponsorWarnings('x@other.sa', { orgDomains: ['work.sa'], linked: true })).toEqual(['نطاق غير نطاق جهته']);
    expect(sponsorWarnings('x@hr.work.sa', { orgDomains: ['work.sa'], linked: true })).toEqual([]);
    expect(sponsorWarnings('x@other.sa', { linked: false })).toEqual([]);
    expect(sponsorWarnings('x@gmail.com', { linked: false })).toEqual(['بريد عام']);
  });
  it('المصدر: الدعوة والاعتماد والتأييد تمر بالبريد بعد استبعاد بُرُد المشارك، وشاشة القبول تعرض التنبيه', () => {
    const src = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/capstone.ts'), 'utf8');
    expect(src).not.toMatch(/function sponsorEmailOf\(charter: any\): string \| null/);
    expect(src).toMatch(/code: 'sponsor_self'|'sponsor_self'/);
    const ui = readFileSync(join(__dirname, '../../admin-app/src/screens/Capstones.jsx'), 'utf8');
    expect(ui).toMatch(/sponsor_warnings/);
  });
});
