import { describe, expect, it } from 'vitest';
import { lockFields } from '../../supabase/functions/_shared/reg-lock.js';

const NOW = '2026-11-27T12:00:00.000Z';
describe('قفل تقديم الخطة في user-api save', () => {
  it('المسجل لا يمسح تقديمه ولا طلب إعادة الفتح', () => {
    expect(lockFields({ submitted: true, reopenRequested: true }, { submitted: false, reopenRequested: false, submittedAt: null, dates: [1] }, NOW)).toEqual({});
  });
  it('التقديم الأول بوقت الخادم', () => {
    expect(lockFields({ submitted: false }, { submitted: true, submittedAt: '1999-01-01', dates: [] }, NOW)).toEqual({ dates: [], submitted: true, submittedAt: NOW });
  });
  it('طلب إعادة الفتح لخطة مقدمة وحده', () => {
    expect(lockFields({ submitted: true, reopenRequested: false }, { reopenRequested: true }, NOW)).toEqual({ reopenRequested: true });
    expect(lockFields({ submitted: false }, { reopenRequested: true }, NOW)).toEqual({});
    expect(lockFields({ submitted: true }, { submitted: true, submittedAt: 'x' }, NOW)).toEqual({});
  });
  it('محتوى الخطة المقدمة لا يُكتب', () => {
    expect(lockFields({ submitted: true }, { dates: { a: 'x' }, confirmed: { a: true } }, NOW)).toEqual({});
  });
  it('قيم غير منطقية لا تُكتب', () => {
    expect(lockFields({ submitted: false }, { submitted: 'true', reopenRequested: 1 }, NOW)).toEqual({});
  });
});
