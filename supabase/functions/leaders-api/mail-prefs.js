// ════════════════════════════════════════════════════════════════
// تفضيلات بريد المشارك وإلغاء الاشتراك بنقرة (RFC 8058): منطق خالص بلا قاعدة، يستورده core.ts والاختبارات
// ════════════════════════════════════════════════════════════════
// الفئات من MAIL_CATEGORIES في labels.js وحدها. الرمز توقيع HMAC بسر المنصة لمعرّف المشارك وفئته، فلا يُخمَّن ولا يصلح
// لفئة أو حساب غير ما وُقّع له، ولا يُخزَّن.
import { isMutableMailCategory, MESSAGES_TEXT } from './labels.js';

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(`unsub:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function unsubToken(secret, participantId, category) {
  if (!secret) throw new Error('unsubToken: secret required');
  return `${participantId}.${category}.${await sign(secret, `${participantId}:${category}`)}`;
}

// يعيد { participantId, category } أو null
export async function verifyUnsubToken(secret, token) {
  if (!secret) return null;
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [pid, cat, sig] = parts;
  if (!UUID.test(pid) || !isMutableMailCategory(cat)) return null;
  const want = await sign(secret, `${pid}:${cat}`);
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? { participantId: pid, category: cat } : null;
}

// رابط الإلغاء بنقرة على الدالة نفسها، ورابط التفضيلات في التطبيق (deeplink.js: tab=messages)
export const unsubUrl = (apiBase, token) => `${apiBase}/functions/v1/leaders-api?unsubscribe=${encodeURIComponent(token)}`;
export const prefsUrl = (appUrl, category = '') => `${appUrl}/?tab=messages${category ? `&prefs=${encodeURIComponent(category)}` : ''}`;

// ترويستا RFC 2369 وRFC 8058: رابط https للإلغاء بنقرة (POST) ومعه mailto احتياطًا
export const unsubHeaders = (url, mailto) => ({
  'List-Unsubscribe': `<${url}>${mailto ? `, <mailto:${mailto}?subject=unsubscribe>` : ''}`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
});

// سطر في ذيل الرسالة إلى التفضيلات: قبل </body> إن وُجد، وإلا في آخرها
export function withPrefsFooter(html, url) {
  const line = `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0"><tr><td dir="rtl" align="center" style="padding:10px 8px 24px;font-size:11px;line-height:1.9;color:#8a8a80"><a href="${url}" style="color:#8a8a80">${MESSAGES_TEXT.mailFooter}</a></td></tr></table>`;
  const s = String(html || '');
  const at = s.lastIndexOf('</body>');
  return at < 0 ? s + line : s.slice(0, at) + line + s.slice(at);
}

// قرار الإرسال لفئة: essential وstaff يُرسلان كما هما بلا ترويسة، والفئة المكتومة تُسجَّل في المركز ولا تُرسل
export function mailPlan(category, muted = []) {
  if (!isMutableMailCategory(category)) return { notify: false, send: true, headers: false };
  const off = Array.isArray(muted) && muted.includes(category);
  return { notify: true, send: !off, headers: !off };
}

// ما يُحفظ من التفضيلات: الفئات القابلة للكتم وحدها، بلا تكرار
export const cleanMuted = (list) => [...new Set((Array.isArray(list) ? list : []).map(String).filter(isMutableMailCategory))];
