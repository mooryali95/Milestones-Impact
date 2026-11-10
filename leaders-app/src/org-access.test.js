// حالة منسق الجهة في قائمة الجهات (orgAccessState): لا تُخفي جهة كُتب بريد منسقها ولم تصله دعوة
import { describe, expect, it } from 'vitest';
import { orgAccessState } from '../../supabase/functions/leaders-api/logic.js';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const org = { status: 'active', contact_email: 'yahia@prdmsa.com' };

describe('حالة منسق الجهة', () => {
  it('بريد جهة اتصال بلا حساب: لم تصله دعوة (حالة سفراء)', () => {
    expect(orgAccessState(org, [], NOW)).toEqual({ state: 'contact', email: 'yahia@prdmsa.com' });
    expect(orgAccessState({ status: 'active' }, [], NOW).state).toBe('none');
  });
  it('دُعي ولم يدخل: الأحدث دعوة هو من يُعاد إليه', () => {
    const r = orgAccessState(org, [
      { id: 'a', email: 'a@x.sa', status: 'invited', invited_at: '2026-11-01T00:00:00Z' },
      { id: 'b', email: 'b@x.sa', status: 'invited', invited_at: '2026-11-09T00:00:00Z' },
    ], NOW);
    expect(r).toMatchObject({ state: 'invited', id: 'b', email: 'b@x.sa', n: 2 });
  });
  it('دخل أحدهم: نشط', () => {
    expect(orgAccessState(org, [{ id: 'a', status: 'active', last_login_at: '2026-11-09T00:00:00Z' }], NOW).state).toBe('active');
  });
  it('الموقوف والمنتهي لا يُحسبان: الحساب منتهٍ', () => {
    expect(orgAccessState(org, [{ id: 'a', status: 'suspended', last_login_at: '2026-11-01T00:00:00Z' }], NOW).state).toBe('lapsed');
    expect(orgAccessState(org, [{ id: 'a', status: 'active', expires_at: '2026-11-01T00:00:00Z', last_login_at: '2026-10-01T00:00:00Z' }], NOW).state).toBe('lapsed');
  });
});
