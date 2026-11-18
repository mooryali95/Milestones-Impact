// ════════════════════════════════════════════════════════════════
// ماسح رمز الحضور داخل التطبيق (W2، تصور الحضور 2026-11-18 ب5.5 البند 3)
// ════════════════════════════════════════════════════════════════
// BarcodeDetector أولًا حيث يتوفر (Chrome على أندرويد، وSafari الحديث)، وإلا فاكّ JavaScript خالص مستضاف ذاتيًا يُحمَّل عند
// الطلب وحده (leaders-app/vendor/paulmillr-qr، ترخيص MIT): بلا WASM ولا شبكة، فيحترم script-src 'self'. الكاميرا تُفتح
// بإذن المتصفح (Permissions-Policy: camera=(self) في public/_headers) وتُطفأ مساراتها عند الإغلاق دائمًا (stopStream).
import { parseQrToken } from '../../supabase/functions/leaders-api/logic.js';

// نص الرمز الممسوح ← رمز الحضور: رابط التطبيق ?checkin=<الرمز> كما تعرضه شاشة القاعة، أو الرمز نفسه. وما سواه null
export function tokenFromScan(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (parseQrToken(raw)) return raw;
  try {
    const t = new URL(raw).searchParams.get('checkin');
    return t && parseQrToken(t) ? t : null;
  } catch { return null; }
}

// الكاشف المتاح: { kind: 'native' | 'js', detect(source) → نص أو null }. source عنصر فيديو يعمل
export async function makeDetector(win = globalThis) {
  const BD = win.BarcodeDetector;
  if (typeof BD === 'function') {
    try {
      const formats = typeof BD.getSupportedFormats === 'function' ? await BD.getSupportedFormats() : ['qr_code'];
      if (formats.includes('qr_code')) {
        const det = new BD({ formats: ['qr_code'] });
        return { kind: 'native', detect: async (src) => (await det.detect(src))?.[0]?.rawValue || null };
      }
    } catch { /* كاشف المتصفح غير صالح: البديل أدناه */ }
  }
  const { decodeQR } = await import('../vendor/paulmillr-qr/decode.js');
  const doc = win.document;
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    kind: 'js',
    detect: async (src) => {
      const w = src.videoWidth || src.width, h = src.videoHeight || src.height;
      if (!w || !h || !ctx) return null;
      // يكفي 640 بكسل للضلع الأطول: الرمز يملأ معظم شاشة القاعة، والتصغير يسرّع الفك على الجوال
      const k = Math.min(1, 640 / Math.max(w, h));
      canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      try { return decodeQR(ctx.getImageData(0, 0, canvas.width, canvas.height)) || null; } catch { return null; }
    },
  };
}

// الكاميرا الخلفية حيث توجد. الرفض أو غياب الكاميرا يُرمى بسببه ليقوله الماسح بالعربية
export async function openCamera(nav = globalThis.navigator) {
  if (!nav?.mediaDevices?.getUserMedia) throw Object.assign(new Error('no-camera'), { reason: 'unsupported' });
  try {
    return await nav.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    const name = e?.name || '';
    throw Object.assign(new Error(name || 'camera'), { reason: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'failed' });
  }
}
export function stopStream(stream) {
  for (const t of stream?.getTracks?.() || []) { try { t.stop(); } catch { /* أُطفئ */ } }
}
export const CAMERA_AR = {
  unsupported: 'هذا المتصفح لا يتيح الكاميرا للتطبيق.',
  denied: 'لم يُسمح للتطبيق باستعمال الكاميرا. اسمح بها من إعدادات المتصفح، أو اكتب الأرقام الستة.',
  missing: 'لم نجد كاميرا في هذا الجهاز.',
  failed: 'تعذّر فتح الكاميرا الآن.',
};
