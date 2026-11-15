// P1-13: الاسم في التحية وقيم الجملة معزولة (bdi) في القوالب الحقيقية، فلا يقلب اسم لاتيني ترتيب الجملة العربية
// في Gmail بواجهة إنجليزية، والرمز معزول في بطاقته، والفقرة rtl بمحاذاة يمين ولو حُذفت سمات html وbody
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';
const { finalDecisionMail, raterMail, signInMail } = await import('./core.ts');

const bdis = (h: string) => [...h.matchAll(/<bdi>([\s\S]*?)<\/bdi>/g)].map((m) => m[1]);

Deno.test('رمز الدخول: الاسم والرمز معزولان، والتحية بلا اسم كما هي', () => {
  const h = signInMail('Sara Al-Otaibi', '482913', 'https://leaders.test/?login=x', false);
  assert(h.includes('أهلًا <bdi>Sara Al-Otaibi</bdi>،'));
  assert(bdis(h).includes('482913'));
  assert(!signInMail('', '111111', 'https://leaders.test', true).includes('<bdi></bdi>'));
  assert(signInMail('', '111111', 'https://leaders.test', true).includes('أهلًا، اضغط'));
});

Deno.test('دعوة مقيّم 360: المقيّم والمشارك والتاريخ معزولة، ومرمّزة', () => {
  const h = raterMail('John Smith', 'Sara <i>', 'https://leaders.test/r/x', 'f360', { promise: 'وعد', closes: '30 نوفمبر 2026' });
  assertEquals(bdis(h).slice(0, 2), ['John Smith', 'Sara &lt;i&gt;']);
  assert(bdis(h).includes('30 نوفمبر 2026'));
  assert(!h.includes('<i>'));
});

Deno.test('القرار الختامي: ملاحظات المقيّم معزولة، وكل فقرة rtl بمحاذاة يمين', () => {
  const h = finalDecisionMail('محمد', 'pass_notes', 'KPIs أولًا.');
  assert(bdis(h).includes('KPIs أولًا.'));
  const ps = [...h.matchAll(/<p [^>]*>/g)].map((m) => m[0]);
  assert(ps.length >= 2);
  for (const p of ps) assert(p.includes('dir="rtl" align="right"') && p.includes('text-align:right'), p);
});
