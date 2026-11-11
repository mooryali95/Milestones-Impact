// p-capstone-6 (تدقيق 2026-11-11): دعوة المقيّم المرسلة إذا انقضت مهلتها قال رابطها «انتهت صلاحية الرابط»، وظلت للمشارك
// «بانتظار تقديره» بلا ما يدله على إعادة الإرسال. raterView تحمل expired بالقاعدة نفسها التي يحكم بها الرابط.
import './_test_env.ts';
import { assertEquals } from 'jsr:@std/assert@1';
const { raterView } = await import('./impact.ts');

const day = 864e5;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

Deno.test('المقيّم: الدعوة المرسلة المنقضية منتهية، وما سواها لا', () => {
  const r = (status: string, expires_at: string | null) => raterView({ id: 'x', email: 'm@x.sa', status, expires_at }).expired;
  assertEquals(r('invited', at(-day)), true);
  assertEquals(r('invited', at(day)), false);
  // أرسل تقديره: لا تنتهي دعوته، والمنتظرة تأكيدًا تُجدَّد مهلتها عند التأكيد
  assertEquals(r('submitted', at(-day)), false);
  assertEquals(r('awaiting', at(-day)), false);
  assertEquals(r('invited', null), false);
});
