// D05: مفتاح توقيع الشهادات مستقل عن الفلفل بمعرّف مفتاح، فتدويره لا يبطل ما صدر، وتدوير الفلفل لا يمس الجديد.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { certificateNotice, checkCertificate, signCertificate, onFinalApproved, PASSING, preview } = await import('./certificates.ts');
const { db, Fail, finalDecisionMail } = await import('./core.ts');

const K1 = 'k1-'.padEnd(40, 'a');
const K2 = 'k2-'.padEnd(40, 'b');
async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.test('التوقيع بالمفتاح الحالي ومعرّفه، ويُرفض نص معدّل', async () => {
  Deno.env.set('LEADERS_CERT_SIGNING_KEY', K2); Deno.env.set('LEADERS_CERT_KEY_ID', 'k2'); Deno.env.set('LEADERS_CERT_PREVIOUS_KEYS', JSON.stringify({ k1: K1 }));
  const sig = await signCertificate('MI-LDR-2026-ABCDEF|سارة');
  assert(sig.startsWith('k2:'));
  assertEquals(await checkCertificate('MI-LDR-2026-ABCDEF|سارة', sig), true);
  assertEquals(await checkCertificate('MI-LDR-2026-ABCDEF|سارة أخرى', sig), false);
});

Deno.test('بعد التدوير: ما وُقّع بالمفتاح السابق يبقى صحيحًا، والمعرّف المجهول مرفوض', async () => {
  Deno.env.set('LEADERS_CERT_SIGNING_KEY', K2); Deno.env.set('LEADERS_CERT_KEY_ID', 'k2'); Deno.env.set('LEADERS_CERT_PREVIOUS_KEYS', JSON.stringify({ k1: K1 }));
  assertEquals(await checkCertificate('نص', `k1:${await hmac(K1, 'نص')}`), true);
  assertEquals(await checkCertificate('نص', `k9:${await hmac(K1, 'نص')}`), false);
  assertEquals(await checkCertificate('نص', 'k1:zz'), false);
});

Deno.test('ما صدر قبل الفصل (بلا معرّف) يُتحقق منه بالفلفل كما كان', async () => {
  assertEquals(await checkCertificate('قديم', await hmac('cert:test-pepper', 'قديم')), true);
  assertEquals(await checkCertificate('قديم', await hmac('cert:other-pepper', 'قديم')), false);
});

Deno.test('بلا مفتاح مستقل لا تصدر شهادة (503)، والشهادة لقراري الاجتياز وحدهما', async () => {
  Deno.env.delete('LEADERS_CERT_SIGNING_KEY');
  const e = (await assertRejects(() => signCertificate('x'), Fail)) as InstanceType<typeof Fail>;
  assertEquals([e.status, e.code], [503, 'cert_key_missing']);
  Deno.env.set('LEADERS_CERT_SIGNING_KEY', 'short');
  assertEquals(((await assertRejects(() => signCertificate('x'), Fail)) as InstanceType<typeof Fail>).code, 'cert_key_missing');
  assertEquals(PASSING, ['pass', 'pass_notes']);
});

// المعاينة من نوع ما يصدر فعلًا: كل إصدار جديد «شهادة إتمام بنجاح» (D05)، فلا يعتمد المالك نصًا على شهادة من نوع آخر.
// القاعدة غير متاحة في الاختبار: الإعداد يُقرأ افتراضيًا، والبرنامج مسمّى فلا يُسأل عن الافتراضي
Deno.test('معاينة النموذج «شهادة إتمام بنجاح» بقرار اجتاز، كما يصدر', async () => {
  const r = await preview({ program_id: 'program-under-test' });
  assertEquals([r.certificate.kind, r.certificate.decision], ['completion_success', 'pass']);
  assert(r.certificate.serial.endsWith('-SAMPLE'));
});

// قاعدة مُحاكاة لجدول بعينه: كل استعلام يعيد ما في tables[table]، والإدراج يُسجَّل في log. تُعاد الأصلية بعد الاختبار
function fakeDb(tables: Record<string, unknown>, log: [string, any][]) {
  const orig = db.from;
  (db as any).from = (table: string) => {
    const q: any = new Proxy({}, {
      get: (_t, k) => k === 'then'
        ? (res: any, rej: any) => Promise.resolve({ data: tables[table] ?? null, error: null }).then(res, rej)
        : (...args: any[]) => { if (k === 'insert' || k === 'update') log.push([table, args[0]]); return q; },
    });
    return q;
  };
  return () => { (db as any).from = orig; };
}

// إيقاف الإصدار التلقائي لا يحجب بصمت: يُسجَّل في السجل، ويرجع حاله فيراه المعتمِد ولا يَعِد البريد بالشهادة
Deno.test('الإصدار التلقائي متوقف: لا تصدر، ويُسجَّل الحجب، ويرجع حاله', async () => {
  const log: [string, any][] = [];
  const restore = fakeDb({ certificate_settings: { id: 1, enabled: false }, certificates: [] }, log);
  try {
    const r = await onFinalApproved('participant-1', { decision: 'pass', program_id: 'program-1' }, 'admin@example.sa');
    assertEquals(r, { skipped: 'disabled' });
    assertEquals(log.map(([t, row]) => [t, row.action ?? null]), [['audit_log', 'certificate.skipped-disabled']]);
  } finally { restore(); }
});

Deno.test('بريد القرار لا يَعِد بشهادة لم تصدر، والمعتمِد يرى حال الشهادة', () => {
  assert(finalDecisionMail('سارة', 'pass', null).includes('تصلك شهادة الإتمام بنجاح في رسالة مستقلة'));
  for (const d of PASSING) {
    const held = finalDecisionMail('سارة', d, null, { held: true });
    assert(!held.includes('تصلك شهادة'), d);
    assert(held.includes('لم تصدر شهادة الإتمام بنجاح بعد'), d);
  }
  assertEquals(certificateNotice({ id: 'c1', serial: 'MI-LDR-2026-ABCDEF' }), 'اعتُمد التقييم، والشهادة MI-LDR-2026-ABCDEF سارية');
  assert(certificateNotice({ skipped: 'disabled' }).includes('الإصدار التلقائي متوقف'));
  assert(certificateNotice({ awaiting_name: true }).includes('حين يؤكد المشارك اسمه'));
  assert(certificateNotice({ failed: true }).includes('تعذّر إصدار الشهادة'));
  assertEquals(certificateNotice(null), 'اعتُمد التقييم');
});
