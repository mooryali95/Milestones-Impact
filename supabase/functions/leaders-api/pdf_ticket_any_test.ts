// تذكرة PDF لأي جلسة صالحة (pdf.ticket، المرحلة 3أ): الصاحب «نوع-معرّف» من الجلسة وحدها، والجلسة المنتهية 401،
// وبلا إعداد المولّد pdf: null فيبني المتصفح الملف. قاعدة في الذاكرة (_fake_db.ts)، ولا يخرج طلب حقيقي.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
import { verifyTicket } from '../_shared/pdf-ticket.js';
const { hash } = await import('./core.ts');
const { pdfTicketAny } = await import('./pdf-ticket.ts');

const PID = '0b6f2a52-6a3e-4c1e-9d55-1f1e2a3b4c5d';
const SECRET = 'x'.repeat(40);

Deno.test('pdf.ticket: جلسة مشارك صالحة تعطي تذكرة صاحبها participant-<id>، والمنتهية 401، وبلا إعداد null', async () => {
  const token = 'participant-session-token-0001';
  const now = new Date();
  const w = installFake({
    participants: [{ id: PID, email: 'sara@x.sa', status: 'placed', is_demo: false }],
    auth_sessions: [{ id: 's1', participant_id: PID, token_hash: await hash(token), method: 'code', created_at: now.toISOString(), expires_at: new Date(now.getTime() + 864e5).toISOString(), revoked_at: null }],
    expert_sessions: [], coordinator_sessions: [], org_coordinators: [], experts: [],
  });
  const saved = { url: Deno.env.get('PDF_RENDER_URL'), secret: Deno.env.get('PDF_RENDER_SECRET') };
  try {
    Deno.env.delete('PDF_RENDER_URL'); Deno.env.delete('PDF_RENDER_SECRET');
    assertEquals(await pdfTicketAny(token), { success: true, pdf: null });
    Deno.env.set('PDF_RENDER_URL', 'https://pdf.example.test/'); Deno.env.set('PDF_RENDER_SECRET', SECRET);
    const r: any = await pdfTicketAny(token);
    assertEquals(r.pdf.url, 'https://pdf.example.test');
    assertEquals(await verifyTicket(SECRET, r.pdf.ticket), `participant-${PID}`);
    const e = await assertRejects(() => pdfTicketAny('no-such-session-token-at-all-000000000000'));
    assert(String((e as any)?.code) === 'session');
  } finally {
    if (saved.url) Deno.env.set('PDF_RENDER_URL', saved.url); else Deno.env.delete('PDF_RENDER_URL');
    if (saved.secret) Deno.env.set('PDF_RENDER_SECRET', saved.secret); else Deno.env.delete('PDF_RENDER_SECRET');
    w.restore();
  }
});
