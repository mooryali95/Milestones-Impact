// «التوجيه والإرشاد» H1: ما يمنع الفتح بترتيب البوابة، والتوزيع على الجهات والدفعات بلا نص محادثة،
// وأفعال الكتابة للمدير الأعلى بغلاف superWriter
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';

const { blockers } = await import('./guide-admin.ts');

Deno.test('ما يمنع الفتح: كل شرط ساقط بجملته، ولا شيء حين تكتمل', () => {
  const all = blockers({ policy: null, enabled: false, evalOk: false, evalReason: 'unapproved', hasKey: false, pilots: 0 });
  assertEquals(all.length, 5);
  assert(all[0].includes('نسخة السياسة'));
  assert(all.some((b) => b.includes('لم تُعتمد بعد')));
  assertEquals(blockers({ policy: '2026-11-20', enabled: true, evalOk: true, evalReason: null, hasKey: true, pilots: 1 }), []);
});

Deno.test('حراسة نصية: التوزيع لا يقرأ نص المحادثة، والكتابة بغلاف superWriter، والجهة بمفتاحها القائم', async () => {
  const g = await Deno.readTextFile(new URL('./guide.ts', import.meta.url));
  const b = g.slice(g.indexOf('export async function guideBreakdown'));
  const sel = b.match(/from\('guidance_messages'\)\.select\('([^']+)'\)/)?.[1] || '';
  assertEquals(sel, 'participant_id, role, verdict, confirmed_at, cost_micros');
  const idx = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  for (const k of ['guide-toggle', 'guide-org-set']) assert(new RegExp(`'admin\\.${k}': \\(a, b\\) => A\\.superWriter`).test(idx), k);
  const ga = await Deno.readTextFile(new URL('./guide-admin.ts', import.meta.url));
  assert(/update\(\{ companion_allowed: on \}\)/.test(ga));
  assert(/audit\('admin', a\.email, on \? 'guide\.org-on' : 'guide\.org-off'/.test(ga));
});
