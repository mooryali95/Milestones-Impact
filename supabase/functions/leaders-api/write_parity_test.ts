// حارسا الكتابة في الوظيفتين قاعدة واحدة (_shared/second_factor.js): ما يقوله «me» في admin-api (writeAccess) هو ما
// يقبله requireWrite في leaders-api، لكل دور ولكل طريقة دخول، ومنها جلسة قديمة بلا طريقة مسجلة.
import './_test_env.ts';
import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { writeAccess } from '../admin-api/step_up.ts';
const A = await import('./admin.ts');

Deno.test('تطابق الحارسين: writeAccess في admin-api وrequireWrite في leaders-api على مصفوفة الدور والطريقة', () => {
  for (const role of ['viewer', 'admin', 'super_admin'] as const) {
    for (const method of ['', undefined, 'email', 'passkey', 'totp', 'demo']) {
      const me = writeAccess(role, method as string);
      let accepted = true;
      try { A.requireWrite({ email: 'a@x.sa', role, method }); } catch { accepted = false; }
      assertEquals(accepted, me.can_write, `${role} / ${String(method)}`);
      // can_elevate: كاتب بالدور لم يرفع جلسته بعد، وهو ما تحجبه leaders-api بـ mfa_required
      assertEquals(A.needsSecondFactor({ email: 'a@x.sa', role, method }), me.can_elevate, `elevate ${role} / ${String(method)}`);
    }
  }
});
