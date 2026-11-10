// دعوة المنسق رسالة الترحيب الوحيدة للجهة: تحمل رابط تسجيل الموظفين والمقاعد والمدة والخطوات الأولى، وبلا رابط حين لا رمز
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';
const { coordinatorInviteMail, orgJoinUrl, CONFIG } = await import('./core.ts');

Deno.test('دعوة المنسق تحمل رابط تسجيل الموظفين والمقاعد والمدة والخطوات', () => {
  const html = coordinatorInviteMail('يحيى', 'سفراء', { invite_code: 'sufaraa', seats: 20, contract_starts: '2026-11-01', contract_ends: '2027-10-31' });
  assertEquals(orgJoinUrl('sufaraa'), `${CONFIG.appUrl}/j/sufaraa`);
  assert(html.includes(`${CONFIG.appUrl}/j/sufaraa`));
  assert(html.includes('20 مقعدًا'));
  assert(html.includes('2027'));
  assert(html.includes('خطواتك الأولى'));
  assert(html.includes('أرسل رابط التسجيل'));
  assert(html.includes(`${CONFIG.appUrl}/org`));
});

Deno.test('بلا رمز دعوة (جهة موقوفة): لا رابط تسجيل ولا خطوة توزيعه', () => {
  const html = coordinatorInviteMail(null, 'سفراء');
  assert(!html.includes('/j/'));
  assert(!html.includes('أرسل رابط التسجيل'));
  assert(html.includes('افتح لوحة الجهة'));
});
