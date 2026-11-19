// تنفيذ طلب الحذف (المرحلة 0 من تصوره): الصف أولًا، فإن منعه قيد شهادة غير سارية لا يُمس شيء والطلب قائم. بعده يُغلق
// الطلب برقمه (participant_id يصير فارغًا)، وتُحذف الملفات وما في طابور البريد له، ويصله تأكيد التنفيذ خارج الطابور.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, resendCalls, withNet } from './_fake_db.ts';
const { CONFIG, db, ERASE_DONE_SUBJECT, Fail, storage } = await import('./core.ts');
const { participantDelete } = await import('./admin.ts');
const { execute } = await import('./erasure.ts');

type Row = Record<string, any>;
const PID = '11111111-1111-4111-8111-111111111111';
const RID = '22222222-2222-4222-8222-222222222222';
const boss = { email: 'owner@x.sa', role: 'super_admin' as const, method: 'passkey' };
// من له طلب قائم يُنفَّذ طلبه من ورقة الطلب (admin.erasure-execute) بتأكيد اسمه، لا من منطقة الخطر
const exec = () => execute(boss as any, { request_id: RID, confirm_name: 'سارة' });
const seed = (): Record<string, Row[]> => ({
  participants: [{ id: PID, full_name: 'سارة', email: 'sara@x.sa', is_demo: false }],
  erasure_requests: [{ id: RID, participant_id: PID, status: 'pending', created_at: '2026-11-10T00:00:00Z', note: null }],
  certificates: [], payments: [], assessments: [], model_submissions: [], capstones: [], participant_requirements: [], auth_sessions: [],
  mail_queue: [
    { id: 'q1', to_email: 'sara@x.sa', ref: null, sent_at: null, gave_up_at: null, subject: 'اعتُمد مستواك' },
    { id: 'q2', to_email: 'other@x.sa', ref: `participant:${PID}`, sent_at: null, gave_up_at: null, subject: 'تذكير' },
    { id: 'q3', to_email: 'keep@x.sa', ref: 'participant:other', sent_at: null, gave_up_at: null, subject: 'لغيره' },
    // دعوة مقيّمه تحمل اسمه وتذهب إلى المقيّم: تُحذف بمرجع المقيّم
    { id: 'q4', to_email: 'rater@x.sa', ref: 'rater:r1', sent_at: null, gave_up_at: null, subject: 'طلب تقدير من سارة' },
    // عنوانه نفسه بمرجع كيان آخر (هو مقيّم لغيره): ليس من بياناته في البرنامج فيبقى
    { id: 'q5', to_email: 'sara@x.sa', ref: 'rater:r9', sent_at: null, gave_up_at: null, subject: 'طلب تقدير من خالد' },
  ],
  raters: [{ id: 'r1', participant_id: PID, email: 'rater@x.sa' }, { id: 'r9', participant_id: 'other', email: 'sara@x.sa' }],
  experts: [], org_coordinators: [],
  mail_events: [], audit_log: [],
});
// قيد on delete set null على erasure_requests.participant_id
const setNull = (table: string, rows: Row[], tables: Record<string, Row[]>) => {
  if (table !== 'participants') return;
  for (const r of tables.erasure_requests || []) if (rows.some((p) => p.id === r.participant_id)) r.participant_id = null;
  tables.raters = (tables.raters || []).filter((r) => !rows.some((p) => p.id === r.participant_id));   // on delete cascade
};
// المخزن: ملفان في مجلد الغرض، ويُسجَّل كل حذف وترتيبه
function fakeStorage(log: string[], removeError: { message: string } | null = null, listError: { message: string } | null = null) {
  const s = storage as any;
  const saved = s.from;
  s.from = () => ({
    list: (path: string) => Promise.resolve(listError ? { data: null, error: listError } : { data: path === PID ? [{ name: 'cv', id: null }] : [{ name: 'a.pdf', id: 'f1' }, { name: 'b.pdf', id: 'f2' }], error: null }),
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
      const r: any = await exec();
      assertEquals([r.success, r.files, r.request, r.mailed, 'email' in r], [true, 2, RID, true, false]);
      assertEquals(log, ['participant', 'remove:2']);
      assertEquals(w.tables.participants, []);
      assertEquals(w.tables.erasure_requests.map((x) => [x.status, x.participant_id, x.decided_by]), [['done', null, 'owner@x.sa']]);
      assertEquals(w.tables.mail_queue.map((m) => m.id), ['q3', 'q5']);
      // التأكيد إلى العنوان الملتقط قبل الحذف، ولا يدخل الطابور
      const mail = resendCalls(calls);
      assertEquals([mail.length, String(mail[0].body.to), mail[0].body.subject], [1, 'sara@x.sa', ERASE_DONE_SUBJECT]);
      const audit = w.tables.audit_log.find((x) => x.action === 'participant.delete')!;
      assertEquals([audit.after.request, audit.after.mailed, audit.after.queue_purged, JSON.stringify(audit.after).includes('sara@x.sa')], [RID, true, 3, false]);
      // الطلب يحمل بصمة البريد ووقت الإبلاغ، وسطر القرار برقمه
      const req = w.tables.erasure_requests[0];
      assertEquals([req.email_hash, typeof req.notified_at], [audit.after.email_hash, 'string']);
      assertEquals(w.tables.audit_log.filter((x) => x.action === 'erasure.execute').map((x) => x.entity_id), [RID]);
    }));
  } finally { unstore(); w.restore(); }
});

Deno.test('الحذف الإداري بلا طلب: شهادة ملغاة تمنعه بقيدها فلا يُمس شيء: لا ملف، والطابور كما هو، ولا بريد', async () => {
  const log: string[] = [];
  const t = seed();
  t.erasure_requests = [];
  const w = installFake(t, { fail: (t, op) => (t === 'participants' && op.kind === 'delete' ? { code: '23503', message: 'violates foreign key constraint certificates_participant_id_fkey' } : null) });
  const unstore = fakeStorage(log);
  try {
    await withMail(() => withNet(async (calls) => {
      const e = await assertRejects(() => participantDelete(boss as any, { participant_id: PID, confirm_email: 'sara@x.sa' }), Fail) as InstanceType<typeof Fail>;
      assertEquals([e.status, e.code], [409, 'certificate']);
      assertEquals(e.message.includes('شهادة ملغاة'), true);
      assertEquals(log, []);
      assertEquals(w.tables.participants.length, 1);
      assertEquals(w.tables.mail_queue.length, 5);
      assertEquals(resendCalls(calls).length, 0);
    }));
  } finally { unstore(); w.restore(); }
});

Deno.test('الحذف الإداري: من له طلب قائم لا يُحذف من منطقة الخطر، فلا يُمس شيء ويُحال إلى بطاقة الطلب', async () => {
  const w = installFake(seed(), { onDelete: setNull });
  const unstore = fakeStorage([]);
  try {
    const e = await assertRejects(() => participantDelete(boss as any, { participant_id: PID, confirm_email: 'sara@x.sa' }), Fail) as InstanceType<typeof Fail>;
    assertEquals([e.status, e.code, e.message.includes('بطاقة الطلب')], [409, 'erasure_pending', true]);
    assertEquals([w.tables.participants.length, w.tables.erasure_requests[0].status], [1, 'pending']);
  } finally { unstore(); w.restore(); }
});

Deno.test('تنفيذ الطلب: الشهادة الملغاة لا تمنعه، فتُحذف شهاداته مع صفه في معاملة واحدة (قرار المالك 1)', async () => {
  const t = seed();
  t.certificates = [{ id: 'c1', participant_id: PID, status: 'revoked' }, { id: 'c2', participant_id: PID, status: 'valid' }, { id: 'c3', participant_id: 'other', status: 'valid' }];
  const w = installFake(t, { onDelete: setNull });
  const unstore = fakeStorage([]);
  try {
    await withMail(() => withNet(async () => {
      const r: any = await exec();
      assertEquals(r.success, true);
      assertEquals(w.tables.certificates.map((c) => c.id), ['c3']);
      assertEquals(w.tables.participants, []);
      assertEquals(w.tables.erasure_requests[0].status, 'done');
    }));
  } finally { unstore(); w.restore(); }
});

Deno.test('الحذف: تعذّر التأكيد يُعيد العنوان للمدير ولا يدخل الطابور', async () => {
  const w = installFake(seed(), { onDelete: setNull });
  const unstore = fakeStorage([]);
  try {
    await withMail(() => withNet(async () => {
      const r: any = await exec();
      assertEquals([r.mailed, r.email, 'files_failed' in r], [false, 'sara@x.sa', false]);
      assertEquals(w.tables.mail_queue.map((m) => m.id), ['q3', 'q5']);
      assertEquals(w.tables.erasure_requests[0].status, 'done');
    }, { resendStatus: 500 }));
  } finally { unstore(); w.restore(); }
});

Deno.test('الحذف: تعذّر حذف الملفات بعد محاولتين يُغلق الطلب بملاحظة المجلد، وينبّه بالمسارات، ولا يُرسل «حُذفت ملفاتك»', async () => {
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const log: string[] = [];
  const w = installFake(seed(), { onDelete: setNull });
  const unstore = fakeStorage(log, { message: 'storage down' });
  try {
    await withMail(() => withNet(async (calls) => {
      const r: any = await exec();
      assertEquals([r.mailed, r.email, r.files_failed, r.folder], [false, 'sara@x.sa', true, `${PID}/`]);
      assertEquals(log, ['remove:2', 'remove:2']);
      assertEquals(resendCalls(calls).length, 0);
      const req = w.tables.erasure_requests[0];
      assertEquals([req.status, String(req.note).includes('storage down'), String(req.note).includes(`${PID}/`)], ['done', true, true]);
      const hook = calls.filter((c) => c.url.includes('hooks.example'));
      assertEquals(hook.map((c) => c.body.kind), ['erase_files_failed']);
      assertEquals(String(hook[0].body.detail.paths).includes(`${PID}/cv/a.pdf`), true);
    }));
  } finally { unstore(); w.restore(); Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
});

Deno.test('الحذف: تعذّر قراءة المخزن أو طلب الحذف أو المقيّمين يوقفه قبل أن يُمس شيء', async () => {
  const cases: [string, ((t: string, op: any) => any) | undefined, { message: string } | null][] = [
    ['storage', undefined, { message: 'list down' }],
    ['busy', (t: string, op: any) => (t === 'erasure_requests' && op.kind === 'select' ? { code: 'PGRST000', message: 'timeout' } : null), null],
    ['busy', (t: string, op: any) => (t === 'raters' && op.kind === 'select' ? { code: 'PGRST000', message: 'timeout' } : null), null],
  ];
  for (const [code, fail, listError] of cases) {
    const w = installFake(seed(), { onDelete: setNull, fail });
    const unstore = fakeStorage([], null, listError);
    try {
      await withMail(() => withNet(async (calls) => {
        const e = await assertRejects(() => exec(), Fail) as InstanceType<typeof Fail>;
        assertEquals([e.status, e.code], [503, code]);
        assertEquals([w.tables.participants.length, w.tables.erasure_requests[0].status, w.tables.mail_queue.length, resendCalls(calls).length], [1, 'pending', 5, 0]);
      }));
    } finally { unstore(); w.restore(); }
  }
});

Deno.test('الحذف: تشغيلتان متزامنتان، الثانية لا تجد صفًّا فلا تنظف ولا ترسل ولا تكتب سطرًا ثانيًا', async () => {
  // الثانية مرت بقراءة الأثر قبل أن تحذف الأولى: الدالة لا تجد الصف فترجع P0002 ولا تمس الشهادات
  const w = installFake(seed(), { onDelete: setNull, rpc: (name) => (name === 'erasure_purge' ? { data: null, error: { code: 'P0002', message: 'erasure_purge: participant not found' } } : null) });
  const unstore = fakeStorage([]);
  try {
    await withMail(() => withNet(async (calls) => {
      const e = await assertRejects(() => exec(), Fail) as InstanceType<typeof Fail>;
      assertEquals([e.status, e.code], [409, 'gone']);
      assertEquals([w.tables.mail_queue.length, resendCalls(calls).length, w.tables.audit_log.length, w.tables.erasure_requests[0].status], [5, 0, 0, 'pending']);
    }));
  } finally { unstore(); w.restore(); }
});

Deno.test('الحذف: تعذّر سطر السجل بعد التنفيذ لا يقول «لم يكتمل»، ويعيد العنوان إن لم يصل التأكيد، وينبّه', async () => {
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const w = installFake(seed(), { onDelete: setNull, fail: (t, op) => (t === 'audit_log' && op.kind === 'insert' && op.value?.action === 'participant.delete' ? { message: 'audit down' } : null) });
  const unstore = fakeStorage([]);
  try {
    await withMail(() => withNet(async (calls) => {
      const r: any = await exec();
      assertEquals([r.success, r.audit_failed, r.mailed, r.email], [true, true, false, 'sara@x.sa']);
      assertEquals(calls.filter((c) => c.url.includes('hooks.example')).map((c) => c.body.kind), ['erase_audit_failed']);
    }, { resendStatus: 500 }));
  } finally { unstore(); w.restore(); Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
});

Deno.test('الحذف: سحب المشارك أو قرار مدير آخر بعد قراءة الطلب يسبق الحذف، فلا يُحذف شيء ولا يصله «نُفّذ»', async () => {
  // يُسحب الطلب بين قراءته (loadPending) والحذف: erasure_purge تحجزه في المعاملة نفسها فتجده غير قائم (P0003)
  const w = installFake(seed(), { onDelete: setNull, rpc: (name, _args, tables) => {
    if (name !== 'erasure_purge') return null;
    Object.assign(tables.erasure_requests[0], { status: 'cancelled', decided_by: 'participant' });
    return { data: null, error: { code: 'P0003', message: 'erasure_purge: request not pending' } };
  } });
  const log: string[] = [];
  const unstore = fakeStorage(log);
  try {
    await withMail(() => withNet(async (calls) => {
      const e = (await assertRejects(exec, Fail)) as InstanceType<typeof Fail>;
      assertEquals([e.status, e.code], [409, 'decided']);
      assertEquals([w.tables.participants.length, w.tables.erasure_requests[0].status, w.tables.mail_queue.length, log, resendCalls(calls).length], [1, 'cancelled', 5, [], 0]);
    }));
  } finally { unstore(); w.restore(); }
});

Deno.test('الحذف: الطلب يُغلق مع الحذف في معاملة واحدة ويُمحى سببه، وسجل الدفع يبقى للمكتمل وحده بلا اسم ولا ملاحظات', async () => {
  const t = seed();
  t.erasure_requests[0].reason = 'انتقلت إلى وزارة أخرى، جوالي رقم-جوالي-الخاص';
  t.payments = [
    { id: 'paid', participant_id: PID, status: 'paid', email: 'sara@x.sa', customer_name: 'Sara A', note: 'n', admin_note: 'm', country: 'SA' },
    { id: 'exp', participant_id: PID, status: 'expired', email: 'sara@x.sa', customer_name: 'Sara A' },
  ];
  const w = installFake(t, { onDelete: (table, rows, tables) => { setNull(table, rows, tables); if (table === 'participants') for (const x of tables.payments) if (x.participant_id === PID) x.participant_id = null; } });
  const unstore = fakeStorage([]);
  try {
    await withMail(() => withNet(async () => {
      const r: any = await exec();
      assertEquals([r.success, r.request_open ?? false], [true, false]);
      const req = w.tables.erasure_requests[0];
      assertEquals([req.status, req.reason, req.decided_by, typeof req.email_hash], ['done', null, 'owner@x.sa', 'string']);
      assertEquals(w.tables.payments.map((x) => [x.id, x.participant_id, x.customer_name, x.note, x.admin_note, x.email, x.country]), [['paid', null, null, null, null, 'sara@x.sa', 'SA']]);
    }));
  } finally { unstore(); w.restore(); }
});

Deno.test('الحذف: صفحة دفع معلّقة تمنع التنفيذ قبل أن يُمس شيء (لو اكتملت بعده لخُصم ماله بلا حساب)', async () => {
  const t = seed();
  t.payments = [{ id: 'p1', participant_id: PID, status: 'pending', email: 'sara@x.sa' }];
  const w = installFake(t, { onDelete: setNull });
  const log: string[] = [];
  const unstore = fakeStorage(log);
  try {
    const e = (await assertRejects(exec, Fail)) as InstanceType<typeof Fail>;
    assertEquals([e.status, e.code, w.tables.participants.length, w.tables.erasure_requests[0].status, log], [409, 'blocked', 1, 'pending', []]);
  } finally { unstore(); w.restore(); }
});

Deno.test('الحذف: عنوانه لخبير قائم، فما لا مرجع له بعنوانه يبقى (عروض الخبراء بلا مرجع)', async () => {
  const t = seed();
  t.experts = [{ id: 'e1', email: 'sara@x.sa' }];
  const w = installFake(t, { onDelete: setNull });
  const unstore = fakeStorage([]);
  try {
    await withMail(() => withNet(async () => {
      await exec();
      assertEquals(w.tables.mail_queue.map((m) => m.id), ['q1', 'q3', 'q5']);
    }));
  } finally { unstore(); w.restore(); }
});
