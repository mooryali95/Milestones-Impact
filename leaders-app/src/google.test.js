// الدخول بحساب Google: لا يُقبل رمز إلا لعميلنا، ومن Google، وغير منتهٍ، وببريد موثّق
import { describe, expect, it } from 'vitest';
import { googleIdentity } from '../../supabase/functions/leaders-api/logic.js';

const ID = 'client.apps.googleusercontent.com';
const ok = { aud: ID, iss: 'https://accounts.google.com', exp: '2000000000', email: 'Sara@Gmail.com', email_verified: 'true', name: 'سارة الأحمد' };
const now = 1900000000;

describe('googleIdentity', () => {
  it('يقبل الرمز السليم ويوحّد البريد', () => {
    expect(googleIdentity(ok, ID, now)).toEqual({ email: 'sara@gmail.com', name: 'سارة الأحمد' });
  });
  it('يرفض رمز عميل آخر، أو مُصدرًا غريبًا، أو رمزًا منتهيًا، أو بريدًا غير موثّق', () => {
    expect(googleIdentity({ ...ok, aud: 'other' }, ID, now).error).toBeTruthy();
    expect(googleIdentity({ ...ok, iss: 'evil.com' }, ID, now).error).toBeTruthy();
    expect(googleIdentity({ ...ok, exp: '1800000000' }, ID, now).error).toBeTruthy();
    expect(googleIdentity({ ...ok, email_verified: 'false' }, ID, now).error).toBeTruthy();
  });
  it('يكوّن الاسم من الاسم الأول والأخير إن غاب الاسم الكامل', () => {
    expect(googleIdentity({ ...ok, name: undefined, given_name: 'Sara', family_name: 'Ali' }, ID, now).name).toBe('Sara Ali');
  });
});
