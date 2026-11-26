// تصور المرحلة 2 (docs/content/2026-11-26-تصور-المرحلة-2-الحلقة-الأخيرة-وجودة-الاعتماد-v1.md): دورة حياة رابط الراعي.
// 2.1: الراعي يقرأ إشعار الخصوصية في صفحتي التأييد وتأكيد الأثر، ويُسجَّل قبوله بالإرسال كما في صفحة المقيّم. بقاعدة في الذاكرة (_fake_db.ts)
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { installFake, withNet } from './_fake_db.ts';
const X = await import('./capstone.ts');
const T = await import('./tracking.ts');
const { hash } = await import('./core.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P = U(910001), UPD = U(910002);
const TOKEN = 'sponsor-token-0123456789-abcdef';
const DAY = 864e5;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function world(extra: Row = {}) {
  const participant = { id: P, full_name: 'قائد', email: 'lead@example.sa', is_demo: false, is_test: false };
  const tables: Record<string, Row[]> = {
    participants: [participant],
    participant_emails: [],
    capstones: [{ id: P, participant_id: P, status: 'accepted', sponsor_status: 'pending', sponsor_email: 'boss@example.sa', sponsor_name: 'الراعي',
      sponsor_token_hash: await hash(TOKEN), sponsor_invited_at: iso(-3 * DAY), sponsor_expires_at: iso(18 * DAY), ...extra }],
    capstone_updates: [{ id: UPD, participant_id: P, verify_status: 'pending', verify_email: 'boss@example.sa', verify_token_hash: await hash(TOKEN), verify_expires_at: iso(5 * DAY) }],
    consent_events: [], audit_log: [], mail_events: [], mail_queue: [], points_ledger: [],
  };
  installFake(tables, { embed: (t, r, all) => (t === 'capstones' ? { participants: all.participants.find((x) => x.id === r.participant_id) || null } : null) });
  return tables;
}

Deno.test('2.1 طلب التعديل من الراعي يسجل موافقته في سجل الموافقات بمعرّف الوثيقة وحده', async () => {
  const tables = await world();
  await withNet(() => X.sponsorSubmit({ t: TOKEN, decision: 'decline', note: 'عدّل الميزانية' }));
  assertEquals(tables.consent_events.length, 1);
  const c = tables.consent_events[0];
  assertEquals([c.subject, c.subject_id, c.kind], ['sponsor', P, 'accept']);
  assert(!JSON.stringify(c).includes('@'), 'لا بريد في سطر الموافقة');
});

Deno.test('2.1 تأكيد الأثر من الراعي يسجل موافقته بمعرّف المراجعة', async () => {
  const tables = await world();
  await withNet(() => T.verifySubmit({ t: TOKEN, decision: 'dispute', note: 'الأرقام لا تطابق' }));
  assertEquals(tables.consent_events.map((c) => [c.subject, c.subject_id]), [['sponsor', UPD]]);
});

Deno.test('2.1 قبل ترحيل نوع الراعي في السجل: رفض القيد لا يوقف قرار الراعي', async () => {
  const tables = await world();
  installFake(tables, {
    embed: (t, r, all) => (t === 'capstones' ? { participants: all.participants.find((x) => x.id === r.participant_id) || null } : null),
    fail: (t, op) => (t === 'consent_events' && op.kind === 'insert' ? { code: '23514', message: 'violates check constraint "consent_events_subject_check"' } : null),
  });
  const r = await withNet(() => X.sponsorSubmit({ t: TOKEN, decision: 'decline', note: 'عدّل الميزانية' }));
  assertEquals(r.decision, 'declined');
});
