// إشعار الخطة المقدَّمة (matrix_plan، _shared/plan-notice.ts): لا خطة بلا قناة في أي إعداد، وسطر Slack بلا اسم ولا بريد
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { planLine, planNotice } from '../_shared/plan-notice.ts';

function deps(settings: unknown, { advisor = false, configured = true, delivered = true } = {}) {
  const lines: string[] = [];
  let mails = 0;
  return {
    d: {
      settings, advisor, slackConfigured: () => configured,
      slackDeliver: async (t: string) => { lines.push(t); return delivered; },
      mail: async () => { mails++; return true; },
    },
    lines, mails: () => mails,
  };
}

Deno.test('الخطة بـ«متوازن»: الملخص وحده، بلا سطر ولا بريد', async () => {
  const x = deps({ preset: 'balanced' });
  assertEquals(await planNotice(x.d), { slack: false, email: false, digest: true });
  assertEquals([x.lines.length, x.mails()], [0, 0]);
});

Deno.test('الخطة بـ«كل شيء» وبلا مستشار: سطر Slack برابط المصفوفة، ولا بريد حين يصل', async () => {
  const x = deps({ preset: 'all' });
  assertEquals(await planNotice(x.d), { slack: true, email: false, digest: false });
  assertEquals(x.lines, [planLine()]);
  assert(x.lines[0].endsWith('/#/matrix'));
  assertEquals(x.mails(), 0);
});

Deno.test('الخطة بـ«كل شيء» وSlack لا يصل أو غير مضبوط: البريد احتياطًا', async () => {
  for (const o of [{ delivered: false }, { configured: false }]) {
    const x = deps({ preset: 'all' }, o);
    const r = await planNotice(x.d);
    assertEquals([r.slack, r.email], [false, true], JSON.stringify(o));
    assertEquals(x.mails(), 1);
  }
  // صف مخصص Slack وحده: الحكم نفسه
  const y = deps({ preset: 'balanced', rows: { matrix_plan: { slack: true } } }, { delivered: false });
  assertEquals((await planNotice(y.d)).email, true);
});

Deno.test('المستشار مضبوط: بريد لكل خطة مهما قرر الجدول', async () => {
  for (const preset of ['quiet', 'balanced', 'all']) {
    const x = deps({ preset }, { advisor: true });
    assertEquals((await planNotice(x.d)).email, true, preset);
  }
});

Deno.test('سطر الخطة: ثابت بلا اسم ولا بريد ولا ستة أرقام ولا شرطة طويلة', () => {
  const l = planLine();
  assert(!/@/.test(l) && !/(?<!\d)\d{6}(?!\d)/.test(l) && !/[\u2013\u2014]/.test(l), l);
});
