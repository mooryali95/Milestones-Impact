// تصور المرحلة 3، البند 3.2: حلقة الالتزام بعد الورشة. بقاعدة في الذاكرة (_fake_db.ts)
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, resendCalls, withNet } from './_fake_db.ts';
const CM = await import('./commitments.ts');
const { CONFIG } = await import('./core.ts');
const { resetSettingsCache } = await import('./settings.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P = U(930001), S = U(930002), S2 = U(930003);
const DAY = 864e5;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const day = (ms: number) => iso(ms).slice(0, 10);
const me = { id: P, full_name: 'قائد', email: 'lead@example.sa', is_demo: false, status: 'active' };

function world(extra: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    participants: [me], workshop_sessions: [{ id: S, title_ar: 'ورشة الأثر' }, { id: S2, title_ar: 'ورشة ثانية' }],
    workshop_attendance: [{ session_id: S, participant_id: P }], workshop_commitments: [], points_ledger: [],
    app_settings: [], audit_log: [], mail_events: [], mail_queue: [], ...extra,
  };
  resetSettingsCache();
  installFake(tables, { embed: (t, r, all) => (t === 'workshop_commitments'
    ? { participants: all.participants.find((x) => x.id === r.participant_id) || null, workshop_sessions: all.workshop_sessions.find((x) => x.id === r.session_id) || null } : null) });
  return tables;
}
async function mailOn<T>(fn: () => Promise<T>) {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: 100, alertEmail: '' });
  try { return await fn(); } finally { Object.assign(CONFIG, saved); }
}

Deno.test('3.2 الالتزام بعد الحضور وحده، ونقاطه مرة واحدة', async () => {
  const t = world();
  await assertRejects(() => CM.save(me, { session_id: S2, action: 'سأبدأ اجتماع الفريق بسؤال عن الأثر', due_on: day(10 * DAY) }));
  const r: any = await CM.save(me, { session_id: S, action: 'سأبدأ اجتماع الفريق بسؤال عن الأثر', due_on: day(10 * DAY) });
  assertEquals(r.gained, 10);
  const again: any = await CM.save(me, { session_id: S, action: 'سأبدأ اجتماع الفريق بسؤال عن الأثر كل أحد', due_on: day(12 * DAY) });
  assertEquals(again.gained, 0);
  assertEquals(t.workshop_commitments.length, 1);
  assertEquals(t.points_ledger.map((x) => [x.source, x.points]), [['commitment', 10]]);
});

Deno.test('3.2 المراجعة بأي نتيجة تأخذ 15 مرة واحدة، ولا تُعاد', async () => {
  const t = world();
  const r: any = await CM.save(me, { session_id: S, action: 'سأبدأ اجتماع الفريق بسؤال عن الأثر', due_on: day(10 * DAY) });
  const rv: any = await CM.review(me, { id: r.item.id, outcome: 'no', learned: 'الاجتماع أُلغي' });
  assertEquals([rv.gained, rv.item.outcome], [15, 'no']);
  await assertRejects(() => CM.review(me, { id: r.item.id, outcome: 'yes' }));
  assertEquals(t.points_ledger.reduce((a, x) => a + x.points, 0), 25);
});

Deno.test('3.2 التذكير بعد 14 يومًا يُرسل مرة واحدة، ولا يُذكَّر من راجع ولا حساب العرض', () => mailOn(async () => {
  const demo = { id: U(930010), full_name: 'عرض', email: 'demo@demo.milestone-impact.org', is_demo: true, status: 'active' };
  const t = world({ participants: [me, demo] });
  t.workshop_commitments.push(
    { id: U(930101), participant_id: P, session_id: S, action: 'سأبدأ اجتماع الفريق بسؤال عن الأثر', due_on: day(-DAY), created_at: iso(-15 * DAY), reminded_at: null, reviewed_at: null },
    { id: U(930102), participant_id: P, session_id: S2, action: 'راجعته', due_on: day(-DAY), created_at: iso(-15 * DAY), reminded_at: null, reviewed_at: iso(-DAY), outcome: 'yes' },
    { id: U(930103), participant_id: demo.id, session_id: S, action: 'عرض', due_on: day(-DAY), created_at: iso(-15 * DAY), reminded_at: null, reviewed_at: null },
    { id: U(930104), participant_id: P, session_id: U(930004), action: 'حديث', due_on: day(DAY), created_at: iso(-3 * DAY), reminded_at: null, reviewed_at: null },
  );
  const first = await withNet(async (calls) => ({ r: await CM.reminders(), mails: resendCalls(calls).length }));
  assertEquals([first.r.sent, first.mails], [1, 1]);
  assert(t.workshop_commitments[0].reminded_at, 'سُجّل التذكير');
  const second = await withNet(async (calls) => ({ r: await CM.reminders(), mails: resendCalls(calls).length }));
  assertEquals([second.r.sent, second.mails], [0, 0]);
}));

Deno.test('3.2 يُطفأ من الإعدادات: لا سؤال ولا تذكير، وما كُتب باقٍ', async () => {
  const t = world({ app_settings: [{ key: 'commitments', value: { enabled: false } }] });
  t.workshop_commitments.push({ id: U(930101), participant_id: P, session_id: S, action: 'باقٍ', due_on: day(-DAY), created_at: iso(-15 * DAY), reminded_at: null, reviewed_at: null });
  assertEquals((await CM.mine(me) as any).enabled, false);
  await assertRejects(() => CM.save(me, { session_id: S, action: 'سأبدأ اجتماع الفريق بسؤال عن الأثر', due_on: day(10 * DAY) }));
  assertEquals((await CM.reminders() as any).sent, 0);
  assertEquals(t.workshop_commitments.length, 1);
  resetSettingsCache();
});

Deno.test('3.2 قبل الترحيل: القراءة فارغة والتذكير يتجاوز', async () => {
  const t = world();
  installFake(t, { fail: (tb) => (tb === 'workshop_commitments' ? { code: '42P01', message: 'relation "leaders.workshop_commitments" does not exist' } : null) });
  assertEquals((await CM.mine(me) as any).items, []);
  assertEquals((await CM.reminders() as any).sent, 0);
});
