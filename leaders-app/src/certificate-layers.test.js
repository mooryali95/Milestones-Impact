// الشهادة: تُبنى مرة، ويخصصها البرنامج ثم الجهة فيما يختلف فقط
import { describe, expect, it } from 'vitest';
import { certProfile } from '../../supabase/functions/leaders-api/logic.js';

const global = { program_ar: 'برنامج القادة', program_en: 'Leaders Program', hours: 40, signatory: { name: 'محمود', title: 'المدير التنفيذي' } };

describe('certProfile', () => {
  it('no layers is the global setting', () => {
    expect(certProfile(global)).toEqual(global);
    expect(certProfile(global, null, undefined, {})).toEqual(global);
  });
  it('program overrides global, organization overrides program, field by field', () => {
    const program = { program_ar: 'برنامج سفراء الأثر', hours: 24 };
    const org = { hours: 30 };
    expect(certProfile(global, program, org)).toEqual({ ...global, program_ar: 'برنامج سفراء الأثر', hours: 30 });
  });
  it('explicit no signatory differs from inheriting it', () => {
    expect(certProfile(global, { signatory: null }).signatory).toBeNull();
    expect(certProfile(global, { signatory: null }, {}).signatory).toBeNull();
    const coSigner = { name: 'سارة', title: 'رئيسة الجمعية' };
    expect(certProfile(global, { signatory: null }, { signatory: coSigner }).signatory).toEqual(coSigner);
  });
  it('empty text falls through to the layer below', () => {
    expect(certProfile(global, { program_ar: '' }).program_ar).toBe('برنامج القادة');
  });
});
