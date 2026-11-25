// ════════════════════════════════════════════════════════════════
// تفضيلات بريد المشارك وإلغاء الاشتراك بنقرة (RFC 8058): منطق خالص بلا قاعدة، يستورده core.ts والاختبارات
// ════════════════════════════════════════════════════════════════
// الفئات من MAIL_CATEGORIES في labels.js وحدها. الرمز توقيع HMAC بسر المنصة لمعرّف المشارك وفئته، فلا يُخمَّن ولا يصلح
// لفئة أو حساب غير ما وُقّع له، ولا يُخزَّن.
import { isMutableFor, isMutableMailCategory, MAIL_CATEGORIES, mailAudience, MESSAGES_TEXT } from './labels.js';

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(`unsub:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// الرمز ثلاثي الأجزاء pid.cat.sig للمشارك كما كان (روابطه القديمة في صناديق الوارد تبقى صالحة بالتوقيع نفسه)، والرمز رباعي
// الأجزاء k.id.cat.sig للخبير (e) والمنسق (c): يُوقَّع «k:id:cat» بالسر نفسه والبادئة نفسها، فلا يصلح رمز جمهور لآخر
const KIND_CODE = { expert: 'e', coordinator: 'c' };
const CODE_KIND = { e: 'expert', c: 'coordinator' };
export async function unsubToken(secret, id, category, kind = 'participant') {
  if (!secret) throw new Error('unsubToken: secret required');
  if (kind === 'participant') return `${id}.${category}.${await sign(secret, `${id}:${category}`)}`;
  const k = KIND_CODE[kind];
  if (!k) throw new Error('unsubToken: unknown recipient kind');
  return `${k}.${id}.${category}.${await sign(secret, `${k}:${id}:${category}`)}`;
}

const sameSig = (want, sig) => {
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
};

// يعيد { kind, id, category } (وللمشارك participantId أيضًا كما كان) أو null. الفئة يجب أن تكون قابلة للكتم لجمهور الرمز
export async function verifyUnsubToken(secret, token) {
  if (!secret) return null;
  const parts = String(token || '').split('.');
  if (parts.length === 3) {
    const [pid, cat, sig] = parts;
    if (!UUID.test(pid) || !isMutableMailCategory(cat)) return null;
    return sameSig(await sign(secret, `${pid}:${cat}`), sig) ? { kind: 'participant', id: pid, participantId: pid, category: cat } : null;
  }
  if (parts.length === 4) {
    const [k, id, cat, sig] = parts;
    const kind = CODE_KIND[k];
    if (!kind || !UUID.test(id) || !isMutableFor(kind, cat)) return null;
    return sameSig(await sign(secret, `${k}:${id}:${cat}`), sig) ? { kind, id, category: cat } : null;
  }
  return null;
}

// رابط الإلغاء بنقرة على الدالة نفسها، ورابط التفضيلات في التطبيق (deeplink.js: tab=messages)
export const unsubUrl = (apiBase, token) => `${apiBase}/functions/v1/leaders-api?unsubscribe=${encodeURIComponent(token)}`;
// المشارك في جذر التطبيق، والخبير في /x، والمنسق في /org
const HOME = { participant: '/', expert: '/x', coordinator: '/org' };
export const prefsUrl = (appUrl, category = '', audience = 'participant') => `${appUrl}${HOME[audience] ?? '/'}?tab=messages${category ? `&prefs=${encodeURIComponent(category)}` : ''}`;

// ترويستا RFC 2369 وRFC 8058: رابط https للإلغاء بنقرة (POST) ومعه mailto احتياطًا
export const unsubHeaders = (url, mailto) => ({
  'List-Unsubscribe': `<${url}>${mailto ? `, <mailto:${mailto}?subject=unsubscribe>` : ''}`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
});

// سطر في ذيل الرسالة إلى التفضيلات: قبل </body> إن وُجد، وإلا في آخرها
/** @param {string} html @param {string} url @param {string} [label] */
export function withPrefsFooter(html, url, label = String(MESSAGES_TEXT.mailFooter)) {
  const line = `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0"><tr><td dir="rtl" align="center" style="padding:10px 8px 24px;font-size:11px;line-height:1.9;color:#8a8a80"><a href="${url}" style="color:#8a8a80">${label}</a></td></tr></table>`;
  const s = String(html || '');
  const at = s.lastIndexOf('</body>');
  return at < 0 ? s + line : s.slice(0, at) + line + s.slice(at);
}

// قرار الإرسال لفئة إلى مستلم من جمهور audience (participant افتراضًا كما كان):
// - فئة جمهور آخر (أو بلا فئة): تمر كما هي بلا ترويسة ولا تسجيل.
// - المقفلة للمشارك: كما هي بلا تسجيل. والمقفلة للخبير والمنسق: تُرسل بلا ترويسة، وتُسجَّل في صندوقه إن كان له صندوق (STAFF_INBOX).
// - القابلة للكتم: تُسجَّل دائمًا، وتُرسل بترويسة ما لم تُكتم.
export const STAFF_INBOX = Object.freeze({ expert: false, coordinator: false });
export function mailPlan(category, muted = [], audience = 'participant') {
  if (!category || !MAIL_CATEGORIES[category] || mailAudience(category) !== audience) return { notify: false, send: true, headers: false };
  if (MAIL_CATEGORIES[category].locked) return { notify: audience !== 'participant' && !!STAFF_INBOX[audience], send: true, headers: false };
  const off = Array.isArray(muted) && muted.includes(category);
  return { notify: true, send: !off, headers: !off };
}

// ما يُحفظ من التفضيلات: الفئات القابلة للكتم لجمهور صاحبها وحدها، بلا تكرار
export const cleanMuted = (list, audience = 'participant') => [...new Set((Array.isArray(list) ? list : []).map(String).filter((k) => (audience === 'participant' ? isMutableMailCategory(k) : isMutableFor(audience, k))))];
