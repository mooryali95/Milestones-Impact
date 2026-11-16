// تنفيذ طلب الحذف (المرحلة 0 من تصوره): الصف أولًا، فإن منعه قيد شهادة غير سارية لا يُمس شيء والطلب قائم. بعده يُغلق
// الطلب برقمه (participant_id يصير فارغًا)، وتُحذف الملفات وما في طابور البريد له، ويصله تأكيد التنفيذ خارج الطابور.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { installFake, resendCalls, withNet } from './_fake_db.ts';
const { CONFIG, ERASE_DONE_SUBJECT, Fail, storage } = await import('./core.ts');
const { participantDelete } = await import('./admin.ts');

type Row = Record<string, any>;
const PID = '11111111-1111-4111-8111-111111111111';
const RID = '22222222-2222-4222-8222-222222222222';
const boss = { email: 'owner@x.sa', role: 'super_admin' as const, method: 'passkey' };
const seed = (): Record<string, Row[]> => ({
  participants: [{ id: PID, full_name: 'سارة', email: 'sara@x.sa', is_demo: false }],
  erasure_requests: [{ id: RID, participant_id: PID, status: 'pending', created_at: '2026-11-10T00:00:00Z', note: null }],
  certificates: [], payments: [], assessments: [], model_submissions: [], capstones: [], participant_requirements: [], auth_sessions: [],
  mail_queue: [
    { id: 'q1', to_email: 'sara@x.sa', ref: null, sent_at: null, gave_up_at: null, subject: 'اعتُمد مستواك' },
    { id: 'q2', to_email: 'other@x.sa', ref: `participant:${PID}`, sent_at: null, gave_up_at: null, subject: 'تذكير' },
    { id: 'q3', to_email: 'keep@x.sa', ref: 'participant:other', sent_at: null, gave_up_at: null, subject: 'لغيره' },
  ],
  mail_events: [], audit_log: [],
});
// قيد on delete set null على erasure_requests.participant_id
const setNull = (table: string, rows: Row[], tables: Record<string, Row[]>) => {
  if (table !== 'participants') return;
  for (const r of tables.erasure_requests || []) if (rows.some((p) => p.id === r.participant_id)) r.participant_id = null;
};
// المخزن: ملفان في مجلد الغرض، ويُسجَّل كل حذف وترتيبه
function fakeStorage(log: string[], removeError: { message: string } | null = null) {
  const s = storage as any;
  const saved = s.from;
  s.from = () => ({
    list: (path: string) => Promise.resolve({ data: path === PID ? [{ name: 'cv', id: null }] : [{ name: 'a.pdf', id: 'f1' }, { name: 'b.pdf', id: 'f2' }], error: null }),
    remove: (paths: string[]) => { log.push(`remove:${paths.length}`); return Promise.resolve({ data: null, error: removeError }); },
  });
  return () => { s.from = saved; };
}
function withMail<T>(fn: () => Promise<T>) {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: 80, alertEmail: '' });
  return fn().finally(() => Object.assign(CONFIG, saved));
}

Deno.test('الحذف: الصف قبل الملفات، والطلب يُغلق برقمه بعد أن صار participant_id فارغًا، والطابور يُنظَّف، والتأكيد يصل', async () => {
  const log: string[] = [];
  const w = installFake(seed(), { onDelete: (t, rows, tables) => { if (t === 'participants') log.push('participant'); setNull(t, rows, tables); } });
  const unstore = fakeStorage(log);
  try {
    await withMail(() => withNet(async (calls) => {
      const r: any = await participantDelete(boss as any, { participant_id: PID, confirm_email: 'sara@x.sa' });
      assertEquals([r.success, r.files, r.request, r.mailed, 'email' in r], [true, 2, RID, true, false]);
      assertEquals(log, ['participant', 'remove:2']);
      assertEquals(w.tables.participants, []);
      assertEquals(w.tables.erasure_requests.map((x) => [x.status, x.participant_id, x.decided_by]), [['done', null, 'owner@x.sa']]);
      assertEquals(w.tables.mail_queue.map((m) => m.id), ['q3']);
      // التأكيد إلى العنوان الملتقط قبل الحذف، ولا يدخل الطابور
      const mail = resendCalls(calls);
      assertEquals([mail.length, String(mail[0].body.to), mail[0].body.subject], [1, 'sara@x.sa', ERASE_DONE_SUBJECT]);
      const audit = w.tables.audit_log.find((x) => x.action === 'participant.delete')!;
      assertEquals([audit.after.request, audit.after.mailed, audit.after.queue_purged, JSON.stringify(audit.after).includes('sara@x.sa')], [RID, true, 2, false]);
    }));
  } finally { unstore(); w.restore(); }
});

Deno.test('الحذف: شهادة ملغاة تمنعه بقيدها فلا يُمس شيء: لا ملف، والطلب قائم، والطابور كما هو، ولا بريد', async () => {
  const log: string[] = [];
  const w = installFake(seed(), { fail: (t, op) => (t === 'participants' && op.kind === 'delete' ? { code: '23503', message: 'violates foreign key constraint certificates_participant_id_fkey' } : null) });
  const unstore = fakeStorage(log);
  try {
    await withMail(() => withNet(async (calls) => {
      const e = await assertRejects(() => participantDelete(boss as any, { participant_id: PID, confirm_email: 'sara@x.sa' }), Fail) as InstanceType<typeof Fail>;
      assertEquals([e.status, e.code], [409, 'certificate']);
      assertEquals(e.message.includes('شهادة ملغاة'), true);
      assertEquals(log, []);
      assertEquals(w.tables.participants.length, 1);
      assertEquals(w.tables.erasure_requests[0].status, 'pending');
      assertEquals(w.tables.mail_queue.length, 3);
      assertEquals(resendCalls(calls).length, 0);
    }));
  } finally { unstore(); w.restore(); }
});

Deno.test('الحذف: تعذّر التأكيد يُعيد العنوان للمدير ولا يدخل الطابور، وتعذّر الملفات يُغلق الطلب بملاحظة وتنبيه', async () => {
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const log: string[] = [];
  const w = installFake(seed(), { onDelete: setNull });
  const unstore = fakeStorage(log, { message: 'storage down' });
  try {
    await withMail(() => withNet(async (calls) => {
      const r: any = await participantDelete(boss as any, { participant_id: PID, confirm_email: 'sara@x.sa' });
      assertEquals([r.mailed, r.email, r.files_failed], [false, 'sara@x.sa', true]);
      assertEquals(w.tables.mail_queue.map((m) => m.id), ['q3']);
      const req = w.tables.erasure_requests[0];
      assertEquals([req.status, String(req.note).includes('storage down')], ['done', true]);
      const hook = calls.filter((c) => c.url.includes('hooks.example'));
      assertEquals(hook.map((c) => c.body.kind), ['erase_files_failed']);
    }, { resendStatus: 500 }));
  } finally { unstore(); w.restore(); Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
});
