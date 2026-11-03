import { describe, expect, it } from 'vitest';
import { matchScore, normName, suggestOrgs } from '../../supabase/functions/leaders-api/sponsor-match.js';

const ORGS = [
  { id: '1', name: 'وزارة الطاقة', short_name: 'الطاقة', domains: ['moe.gov.sa'] },
  { id: '2', name: 'هيئة الحكومة الرقمية', short_name: 'DGA', domains: ['dga.gov.sa'] },
  { id: '3', name: 'شركة أرامكو السعودية', short_name: 'أرامكو', domains: ['aramco.com'] },
];

describe('مطابقة اسم الجهة الراعية (للإدارة)', () => {
  it('التطبيع: الهمزات والتاء والتعريف والتشكيل', () => {
    expect(normName('الهيئةُ العامّة')).toBe(normName('هيئه عامه'));
    expect(normName('إدارة')).toBe('اداره');
  });
  it('الاسم المختصر والاسم الكامل بصيغ مختلفة', () => {
    expect(suggestOrgs('ارامكو', ORGS)[0].id).toBe('3');
    expect(suggestOrgs('وزاره الطاقه', ORGS)[0].id).toBe('1');
    expect(suggestOrgs('dga', ORGS)[0].id).toBe('2');
  });
  it('نطاق البريد يرفع الثقة، والاسم البعيد لا يُقترح', () => {
    expect(matchScore('الطاقة', ORGS[0], 'moe.gov.sa')).toBe(1);
    expect(suggestOrgs('مطعم البيت', ORGS)).toEqual([]);
  });
});
