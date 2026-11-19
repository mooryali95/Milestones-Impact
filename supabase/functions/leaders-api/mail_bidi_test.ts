// P1-13: الاسم في التحية وقيم الجملة معزولة (bdi) في القوالب الحقيقية، فلا يقلب اسم لاتيني ترتيب الجملة العربية
// في Gmail بواجهة إنجليزية، والرمز معزول في بطاقته، والفقرة rtl بمحاذاة يمين ولو حُذفت سمات html وbody
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
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
  // الأول في العنوان الظاهر، ثم التحية وجملة الدعوة
  assertEquals(bdis(h).slice(0, 3), ['Sara &lt;i&gt;', 'John Smith', 'Sara &lt;i&gt;']);
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

Deno.test('العنوان الظاهر: القيمة المتغيرة فيه معزولة، والوسم title نص بلا وسوم', async () => {
  const { coordinatorInviteMail, orgAccessMail } = await import('./core.ts');
  const { mailShell, mailTitle } = await import('../_shared/mail.ts');
  const h1 = (h: string) => h.match(/<h1 [^>]*>([\s\S]*?)<\/h1>/)![1];
  assertEquals(h1(raterMail('أحمد', 'John Smith Jr.', 'https://leaders.test/r/x')), 'طلب تقدير من <bdi>John Smith Jr.</bdi>');
  assertEquals(h1(orgAccessMail('سارة', 'ACME Inc.', ['التقدم'])), '<bdi>ACME Inc.</bdi> تطّلع على رحلتك');
  assert(h1(coordinatorInviteMail('خالد', 'ACME Co.', {})).startsWith('لوحة <bdi>ACME Co.</bdi>'));
  const s = mailShell(mailTitle`وصلتنا رسالتكم، ${'<b>J&J</b>'}`, '');
  assertEquals(h1(s), 'وصلتنا رسالتكم، <bdi>&lt;b&gt;J&amp;J&lt;/b&gt;</bdi>');
  assert(s.includes('<title>وصلتنا رسالتكم، &lt;b&gt;J&amp;J&lt;/b&gt;</title>'));
  // اسم المبادرة يكتبه المشارك، وأول ما يراه الراعي
  const { sponsorMail } = await import('./capstone.ts');
  const { verifyMail } = await import('./tracking.ts');
  assertEquals(h1(sponsorMail('خالد', 'سارة', 'Lean Ops.', 'https://leaders.test/s/x')), 'طلب تأييد مبادرة: <bdi>Lean Ops.</bdi>');
  assertEquals(h1(verifyMail('خالد', 'سارة', 'KPI Hub (v2)', 'تقرير', 'https://leaders.test/v/x')), 'تأكيد أثر مبادرة: <bdi>KPI Hub (v2)</bdi>');
  // العنوان الثابت كما هو، مرمّز مرة واحدة
  assertEquals(h1(mailShell('رمز & دخول', '')), 'رمز &amp; دخول');
});
