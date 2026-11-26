// تذكرة مولّد PDF على الخادم لمن طلب وثيقته (capstone.doc). بلا PDF_RENDER_URL أو PDF_RENDER_SECRET: null، فيبني المتصفح الملف.
import { signTicket } from '../_shared/pdf-ticket.js';
import { Fail } from './core.ts';

// fp: بصمة الوثيقة التي يُطلب ملفها (doc-quality.js docFingerprint)، فلا يطبع العامل بهذه التذكرة وثيقةً ببصمة غيرها (المرحلة 21)
export async function pdfTicket(sub: string, fp: string | null = null) {
  const url = Deno.env.get('PDF_RENDER_URL') || '';
  const secret = Deno.env.get('PDF_RENDER_SECRET') || '';
  if (!/^https:\/\//.test(url) || secret.length < 32) return null;
  return { url: url.replace(/\/$/, ''), ticket: await signTicket(secret, sub, Date.now(), fp) };
}

// تذكرة لأي جلسة صالحة (pdf.ticket، المرحلة 3أ): مشارك أو خبير أو منسق أو مدير، بالترتيب. الصاحب «نوع-معرّف» للسجل وسقف
// العامل، ولا شيء من الوثيقة يمر هنا. بلا جلسة صالحة: 401، وبلا إعداد المولّد: pdf: null فيبني المتصفح الملف كما كان.
// الوحدات تُحمَّل عند الطلب: هذا الملف يستورده capstone.ts، فلا حلقة استيراد
export async function pdfTicketAny(token: unknown) {
  const who: (() => Promise<string>)[] = [
    async () => `participant-${(await (await import('./participant.ts')).participantFromToken(token)).participant.id}`,
    async () => `expert-${(await (await import('./experts.ts')).expertFromToken(token)).expert.id}`,
    async () => `coordinator-${(await (await import('./coordinator.ts')).fromToken(token)).coordinator.id}`,
    async () => { const a = await (await import('./admin.ts')).adminFromToken(token); return `admin-${a.id || 'owner'}`; },
  ];
  for (const f of who) {
    let sub = '';
    try { sub = await f(); } catch (e) { if (!(e instanceof Fail)) throw e; continue; }
    return { success: true, pdf: await pdfTicket(sub).catch(() => null) };
  }
  throw new Fail('الجلسة منتهية', 401, 'session');
}
