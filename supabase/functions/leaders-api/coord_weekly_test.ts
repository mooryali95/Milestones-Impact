// تصور المرحلة 1، البند 5: ملخص المنسق الأسبوعي. قسم «مقيّمون ينتظرون تأكيدك» من awaitingFor نفسها التي تعرضها لوحة الجهة
// (dashboardFor › raters_pending، بشرط صلاحية القائمة ومفتاح 360)، خمسة بحد أعلى باسم المشارك وصلة المقيّم وحدهما، و«وغيرها N»،
// ولا قسم إن لم يكن شيء ينتظر. والتذييل يقول الحقيقة: يوقفه المنسق برابط إلغاء الاشتراك.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
const { coordinatorWeeklyMail } = await import('./core.ts');

const K = { total: 24, joined_week: 3, active_week: 17, approved: 20, completed: 4, avg_progress: 46 };
const rater = (i: number) => ({ id: `r${i}`, participant_id: `p${i}`, participant: `مشارك ${i}`, email: `rater${i}@secret.sa`, full_name: `مقيم سري ${i}`, relation_ar: 'زميل' });

Deno.test('بعناصر: خمسة بحد أعلى باسم المشارك والصلة، بلا بريد المقيّم ولا اسمه، و«وغيرها» برابط القائمة', () => {
  const html = coordinatorWeeklyMail('خالد', 'وزارة التجربة', K, Array.from({ length: 7 }, (_, i) => rater(i + 1)));
  assert(html.includes('مقيّمون ينتظرون تأكيدك'));
  for (let i = 1; i <= 5; i++) assert(html.includes(`مشارك ${i}`), `مشارك ${i}`);
  assert(!html.includes('مشارك 6') && !html.includes('مشارك 7'));
  assert(html.includes('وغيرها 2'));
  assert(!html.includes('secret.sa') && !html.includes('مقيم سري'));
  assert(html.includes('/org#ra-h'));
});

Deno.test('بلا عناصر: لا قسم', () => {
  for (const r of [[], undefined]) {
    const html = coordinatorWeeklyMail('خالد', 'وزارة التجربة', K, r as any);
    assert(!html.includes('مقيّمون ينتظرون تأكيدك'));
    assert(!html.includes('#ra-h'));
  }
});

Deno.test('التذييل صادق: المنسق يوقفه برابط إلغاء الاشتراك، لا «الإدارة وحدها»', () => {
  const html = coordinatorWeeklyMail('خالد', 'وزارة التجربة', K, []);
  assert(html.includes('يصلك هذا الملخص كل أسبوع، ويمكنك إيقافه من رابط إلغاء الاشتراك أسفل الرسالة.'));
  assert(!html.includes('ويمكن للإدارة إيقافه'));
});

Deno.test('المصدر: الإرسال الأسبوعي يمرر raters_pending من dashboardFor نفسها، وهي بشرط list، ومقيّم 360 وحده خلف مفتاحه', async () => {
  const src = await Deno.readTextFile(new URL('./coordinator.ts', import.meta.url));
  assert(src.includes('const raters = (d as any).raters_pending || [];'));
  assert(/coordinatorWeeklyMail\(c\.full_name, c\.organizations\.name, d\.kpis, raters\)/.test(src));
  assert(src.includes('list ? awaitingFor((r.participants || []).map((p: any) => p.id)) : Promise.resolve([])'));
  const imp = await Deno.readTextFile(new URL('./impact.ts', import.meta.url));
  // مقيّمو الأثر (pre وpost) خارج المفتاح (تصور المرحلة 3، القرار 2)، ومقيّم 360 لا يُعرض والمفتاح مطفأ
  assert(imp.includes('if (!ids.length) return [];'));
  assert(imp.includes('.filter((r: any) => on || IMPACT_PHASES.includes(r.phase))'));
  assertEquals(typeof coordinatorWeeklyMail, 'function');
});
