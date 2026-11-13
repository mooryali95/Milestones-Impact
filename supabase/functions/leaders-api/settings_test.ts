// الإعدادات العامة: الحفظ للمدير ذي الكتابة وحده، والقراءة تعمل بالقيم الافتراضية قبل الترحيل
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { adminSave } = await import('./settings.ts');
const { Fail } = await import('./core.ts');
const { DEFAULTS, resolveSettings } = await import('./settings.js');

Deno.test('الإعدادات: دور العرض لا يحفظ، والمدخل برمز البريد وحده لا يحفظ', async () => {
  await assertRejects(() => adminSave({ email: 'v@x.sa', role: 'viewer' }, { group: 'feedback360', values: { min_group: 4 } }), Fail, 'للعرض فقط');
  await assertRejects(() => adminSave({ email: 'a@x.sa', role: 'admin', method: 'email' }, { group: 'feedback360', values: {} }), Fail, 'مفتاح المرور');
});

Deno.test('الإعدادات: بلا مخزن تعمل القيم الافتراضية', () => {
  assertEquals(resolveSettings([]), DEFAULTS);
});
