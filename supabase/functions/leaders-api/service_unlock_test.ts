// «الاستشارة خدمة» (المرحلة 2): إشارات الفتح من مصادرها مقيدة بالمشارك، وسطر service.unlocked وبريده مرة واحدة،
// والفتح لا رجعة فيه، والبرنامج بلا خدمة بشرط 'any' لا يُقرأ له شيء ولا يُكتب
import './_test_env.ts';
import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { installFake, resendCalls, withNet } from './_fake_db.ts';
const { CONFIG } = await import('./core.ts');
const { recordServiceUnlocks, serviceSignals, SERVICE_UNLOCKED } = await import('./service-unlock.ts');
const { resolveStages, CONSULT_ANY_DEFAULT } = await import('./journey.js');

const SVC = { key: 'consulting', title_ar: 'الاستشارة', sort: 6, rules: { lane: 'service', unlock: 'any', any: CONSULT_ANY_DEFAULT } };
const STAGES = [{ key: 'training', title_ar: 'التدريب', sort: 4 }, SVC];
const P = { id: 'p1', email: 'p1@example.sa', full_name: 'مشارك', is_demo: false };
const journey = (signals: any, trained = false) => resolveStages(STAGES.map((s) => ({ ...s, items: s.key === 'training' ? [{ id: 't', required: true, status: trained ? 'done' : 'pending' }] : [] })), { signals });

async function withMail<T>(fn: (calls: { url: string; body: any }[]) => Promise<T>) {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: 100, alertEmail: '' });
  try { return await withNet(fn); } finally { Object.assign(CONFIG, saved); }
}

Deno.test('برنامج بلا خدمة بشرط any: لا إشارات ولا كتابة', async () => {
  const f = installFake({ reading_progress: [{ participant_id: 'p1', active_seconds: 999 }] });
  try {
    assertEquals(await serviceSignals(P, [{ key: 'consulting', rules: { lane: 'service', unlock: 'stages', after: ['approval'] } }]), null);
    assertEquals(await recordServiceUnlocks(P, [], null, 'prog'), []);
    assertEquals(f.writes.length, 0);
  } finally { f.restore(); }
});

Deno.test('القراءة: عتبة 60 ثانية أو 200 كلمة، ومقيدة بالمشارك', async () => {
  const f = installFake({ reading_progress: [{ participant_id: 'p2', active_seconds: 5000 }, { participant_id: 'p1', active_seconds: 30, words: 100 }] });
  try {
    assertEquals((await serviceSignals(P, STAGES))!.readingStarted, false);
    f.tables.reading_progress.push({ participant_id: 'p1', active_seconds: 10, words: 250 });
    assertEquals((await serviceSignals(P, STAGES))!.readingStarted, true);
  } finally { f.restore(); }
});

Deno.test('الفتح يُسجَّل مرة ومعه بريد واحد، ولا ينغلق بعدها', async () => {
  const f = installFake({ reading_progress: [{ participant_id: 'p1', active_seconds: 90 }], audit_log: [], mail_events: [] });
  try {
    await withMail(async (calls) => {
      let sig = await serviceSignals(P, STAGES);
      assertEquals(await recordServiceUnlocks(P, journey(sig), sig, 'prog'), ['consulting']);
      // فتح الرحلة مرة ثانية: لا سطر ولا بريد جديد
      sig = await serviceSignals(P, STAGES);
      assertEquals(await recordServiceUnlocks(P, journey(sig), sig, 'prog'), []);
      const rows = f.tables.audit_log.filter((r) => r.action === SERVICE_UNLOCKED);
      assertEquals([rows.length, rows[0].entity_id, rows[0].after.stage, rows[0].after.via], [1, 'p1', 'consulting', 'reading']);
      const mails = resendCalls(calls);
      assertEquals([mails.length, mails[0].body.subject], [1, 'أُتيحت لك خدمة الاستشارة']);
      // حُذف تقدم القراءة: تبقى مفتوحة بسطر السجل
      f.tables.reading_progress = [];
      sig = await serviceSignals(P, STAGES);
      assertEquals([sig!.readingStarted, journey(sig).find((s: any) => s.key === 'consulting').status], [false, 'available']);
      assertEquals(resendCalls(calls).length, 1);
    });
  } finally { f.restore(); }
});

Deno.test('إنهاء التدريب يفتح بلا قراءة، والسبب مسجل', async () => {
  const f = installFake({ reading_progress: [], audit_log: [], mail_events: [] });
  try {
    await withMail(async () => {
      const sig = await serviceSignals(P, STAGES);
      assertEquals(journey(sig).find((s: any) => s.key === 'consulting').status, 'locked');
      assertEquals(await recordServiceUnlocks(P, journey(sig, false), sig, 'prog'), []);
      assertEquals(await recordServiceUnlocks(P, journey(sig, true), sig, 'prog'), ['consulting']);
      assertEquals(f.tables.audit_log[0].after.via, 'stage:training');
    });
  } finally { f.restore(); }
});

Deno.test('الحساب التجريبي: يُسجَّل الفتح ولا بريد', async () => {
  const f = installFake({ reading_progress: [{ participant_id: 'p1', active_seconds: 90 }], audit_log: [], mail_events: [] });
  try {
    await withMail(async (calls) => {
      const sig = await serviceSignals(P, STAGES);
      assertEquals(await recordServiceUnlocks({ ...P, is_demo: true }, journey(sig), sig, 'prog'), ['consulting']);
      assertEquals(resendCalls(calls).length, 0);
    });
  } finally { f.restore(); }
});
