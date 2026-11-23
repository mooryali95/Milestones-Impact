// تقوية المساعد، المرحلة ج (2026-11-22): الإيقاف الآلي عند الانحراف، وبصمة الحماية في بصمة التقييم
import './_test_env.ts';
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';

const { watchVerdict, GUARD_SIGNATURE } = await import('./guide.js');
const W = await import('./guide-watch.ts');
const { resetSettingsCache } = await import('./settings.ts');
const { noticesIdle } = await import('./notify.ts');
const cfg = { auto_pause: true, watch_min_replies: 20, watch_max_unsure_pct: 40, watch_max_guard_pct: 15 };

Deno.test('حكم الانحراف: دون الحد الأدنى من الردود لا يوقف، والمحجوب أو «لم أتأكد» فوق حده يوقف بسببه', () => {
  assertEquals(watchVerdict({ total: 10, unsure: 10, guard: 10 }, cfg).pause, false);
  assertEquals(watchVerdict({ total: 40, unsure: 10, guard: 2 }, cfg).pause, false);
  assertEquals(watchVerdict({ total: 40, unsure: 20, guard: 2 }, cfg), { pause: true, reason: 'unsure', unsure_pct: 50, guard_pct: 5 });
  assertEquals(watchVerdict({ total: 40, unsure: 2, guard: 8 }, cfg).reason, 'guard');
  assertEquals(watchVerdict({ total: 40, unsure: 40, guard: 40 }, { ...cfg, auto_pause: false }).pause, false);
});

const msgs = (n: number, over: Record<string, unknown>) => Array.from({ length: n }, (_, i) => ({ id: i + 1, role: 'assistant', verdict: 'answered', guard: null, created_at: new Date().toISOString(), ...over }));

Deno.test('المجدول: الانحراف يطفئ المساعد في الإعدادات نفسها ويسجّل السبب، وعطل المدقق لا يُعد انحرافًا', async () => {
  const w = installFake({
    app_settings: [{ key: 'guidance', value: { enabled: true, daily_spend_usd: 5 } }],
    guidance_messages: [...msgs(20, {}), ...msgs(10, { guard: 'verify_error' }), ...msgs(6, { verdict: 'unsure', guard: 'ungrounded' })],
    audit_log: [],
  });
  resetSettingsCache();
  try {
    const r: any = await W.guideWatch();
    assertEquals([r.paused, r.reason, r.total, r.guard], [true, 'guard', 36, 6]);
    assertEquals(w.tables.app_settings.find((x: any) => x.key === 'guidance')!.value, { enabled: false, daily_spend_usd: 5 });
    assert(w.tables.audit_log.some((a: any) => a.action === 'guide.auto-paused'));
    await noticesIdle();
    resetSettingsCache();
    assertEquals(((await W.guideWatch()) as any).reason, 'off', 'المطفأ لا يُفحص ثانية ولا يُعاد تشغيله آليًا');
  } finally { w.restore(); resetSettingsCache(); }
});

Deno.test('المجدول: ردود سليمة لا تغيّر شيئًا', async () => {
  const w = installFake({ app_settings: [{ key: 'guidance', value: { enabled: true } }], guidance_messages: msgs(30, {}), audit_log: [] });
  resetSettingsCache();
  try {
    const r: any = await W.guideWatch();
    assertEquals([r.checked, r.paused], [true, false]);
    assertEquals(w.tables.app_settings[0].value.enabled, true);
  } finally { w.restore(); resetSettingsCache(); }
});

Deno.test('بصمة الحماية داخل بصمة التقييم: تغيّر قواعد الموجّه أو المدقق يُسقط التشغيل السابق', async () => {
  const { evalFingerprint } = await import('./guide-eval.js');
  const set = { version: 'v1', cases: [{ id: 'a' }] };
  const fp = await evalFingerprint(set, 'm', 'r', '');
  assertEquals(fp, await evalFingerprint(set, 'm', 'r', ''));
  const src = await Deno.readTextFile(new URL('./guide-eval.js', import.meta.url));
  assert(src.includes('guard: GUARD_SIGNATURE'));
  assert(GUARD_SIGNATURE.includes('inject') && GUARD_SIGNATURE.includes('claude-haiku-5-5'));
  assertNotEquals(fp, await evalFingerprint({ ...set, cases: [{ id: 'b' }] }, 'm', 'r', ''));
});

Deno.test('ملخص الأسبوع (د3): صباح الأحد وحده، مرة في الأسبوع، وسطره أعداد بلا نص ولا اسم', async () => {
  const sunday = Date.parse('2026-11-29T06:20:00Z');
  const at = (d: number) => new Date(sunday - d * 864e5).toISOString();
  const w = installFake({
    app_settings: [{ key: 'guidance', value: { enabled: true } }],
    guidance_messages: [
      { role: 'assistant', verdict: 'answered', body: 'نص سري', created_at: at(1) },
      { role: 'assistant', verdict: 'unsure', body: 'نص سري', created_at: at(2) },
      { role: 'assistant', verdict: 'answered', guard: 'write', created_at: at(3) },
      { role: 'assistant', verdict: 'answered', created_at: at(10) },
    ],
    audit_log: [],
  });
  const prev = W.WATCH.now;
  try {
    W.WATCH.now = () => sunday - 864e5;
    assertEquals(((await W.guideWeekly()) as any).reason, 'not_due', 'السبت لا يرسل');
    W.WATCH.now = () => sunday;
    const r: any = await W.guideWeekly();
    assertEquals([r.sent, r.replies, r.to_review], [true, 3, 2]);
    assertEquals(((await W.guideWeekly()) as any).reason, 'already', 'المهمة الساعية لا تكرره');
    await noticesIdle();
    const log: any = w.tables.audit_log.find((a: any) => a.action === 'guide.weekly-sent');
    assertEquals(log.entity_id, '2026-11-29');
    assert(!JSON.stringify(w.tables.audit_log).includes('نص سري'));
  } finally { W.WATCH.now = prev; w.restore(); resetSettingsCache(); }
});
