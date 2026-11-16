// ════════════════════════════════════════════════════════════════
// الجهاز المعروف: وصف المتصفح، والعنوان المقرب، وبصمة الدخول
// ════════════════════════════════════════════════════════════════
// تصور مركز الإشعارات (docs/ops/2026-11-16-تصور-مركز-الإشعارات-v1.md، المرحلة 2 في القسم 8، والقسمان 10.4 و10.6).
// وحدة نقية بلا شبكة ولا قاعدة. وصف المتصفح نص يرسله العميل فيُزوَّر، فلا يُعد الجهاز معروفًا به وحده أبدًا:
// البصمة تجمعه مع العنوان المقرب، وبلا عنوان أو بلا وصف لا بصمة.

// وصف مختصر للجهاز من المتصفح (لرسالة الدخول الجديد للمشارك، ولبصمة دخول الإدارة)
export const deviceOf = (ua) => {
  const s = String(ua || '');
  const os = /iPhone|iPad/.test(s) ? 'iPhone/iPad' : /Android/.test(s) ? 'Android' : /Mac OS X/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows' : /Linux/.test(s) ? 'Linux' : 'جهاز';
  const br = /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : /Firefox\//.test(s) ? 'Firefox' : '';
  return br ? `${os} · ${br}` : os;
};

// IPv6 بصيغته الكاملة ثماني مجموعات، أو null إن لم يكن عنوانًا صالحًا
function expand6(ip) {
  const parts = ip.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const fill = parts.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (parts.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill('0'), ...tail];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return all.map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''));
}

// العنوان المقرب: الشبكة لا الجهاز. IPv4 إلى /24، وIPv6 إلى /48 (عنوان الجهاز داخل الشبكة يتغير كثيرًا).
// وما لا يُفهم يرد null، فلا بصمة له
export function coarseIp(ip) {
  const s = String(ip || '').trim().replace(/^\[|\]$/g, '').split('%')[0];
  const v4 = s.replace(/^::ffff:/i, '');
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v4);
  if (m) return m.slice(1).every((x) => Number(x) <= 255) ? `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}.0/24` : null;
  if (!s.includes(':')) return null;
  const g = expand6(s);
  return g ? `${g.slice(0, 3).join(':')}::/48` : null;
}

// بصمة الدخول: تجزئة SHA-256 للعنوان المقرب مع وصف المتصفح، ولا يُخزَّن غيرها (لا نص المتصفح).
// بلا عنوان مفهوم أو بلا متصفح: null، أي لا يُعرف الجهاز إلا بمفتاح المرور
export async function loginFingerprint(ip, ua) {
  const net = coarseIp(ip);
  if (!net || !String(ua || '').trim()) return null;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`admin-login-fp:v1:${net}|${deviceOf(ua)}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// نافذة البصمة: دخول بالطريقة نفسها في آخر 30 يومًا
export const KNOWN_DEVICE_DAYS = 30;
