// تذكرة مولّد PDF على الخادم لمن طلب وثيقته (capstone.doc). بلا PDF_RENDER_URL أو PDF_RENDER_SECRET: null، فيبني المتصفح الملف.
import { signTicket } from '../_shared/pdf-ticket.js';

export async function pdfTicket(sub: string) {
  const url = Deno.env.get('PDF_RENDER_URL') || '';
  const secret = Deno.env.get('PDF_RENDER_SECRET') || '';
  if (!/^https:\/\//.test(url) || secret.length < 32) return null;
  return { url: url.replace(/\/$/, ''), ticket: await signTicket(secret, sub) };
}
