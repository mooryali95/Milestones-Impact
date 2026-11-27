// حدود الرفع إلى المخزن الخاص وتنظيف الملفات اليتيمة (تقرير الأمن الثاني، البند 1)
// منطق صافٍ بلا قاعدة بيانات: يُختبر في leaders-app/src/upload-limits.test.js وupload_limits_test.ts.
// كل رابط رفع موقّع (upload.url) يُعد بسطر في سجل التدقيق، فالحد على الروابط الصادرة لا على ما رُفع فعلًا:
// من طلب مئة رابط دفعة ثم رفع إليها لا يتجاوز الحد. والحجم يُجمع مما رُفع في آخر 24 ساعة تحت مسار المشارك.

export const UPLOAD_LIMITS = Object.freeze({
  perDay: 30,
  bytesPerDay: 150 * 1024 * 1024,
  // سقف الملف الواحد في المخزن (file_size_limit في 20261130050000): الرابط الصادر غير المستعمل يُحسب بهذا الحجم
  fileMax: 10 * 1024 * 1024,
  // الملف الذي لا يشير إليه cv_path ولا evidence_path بعد هذه المدة يتيم: الرفع والربط في الواجهة متتاليان
  orphanHours: 48,
  // سقف ما يُحذف في التشغيلة الواحدة، فلا تطول المهمة الأسبوعية
  sweepMax: 2000,
});

export const UPLOAD_PURPOSES = Object.freeze(['cv', 'evidence']);

/** سبب رفض رابط رفع جديد، أو null
 * @param {{ issued: number, files: { created_at?: string | null, metadata?: { size?: number } | null }[], now?: number }} d
 * @returns {null | 'count' | 'bytes'} */
export function uploadRefusal({ issued, files, now = Date.now() }) {
  if ((issued || 0) >= UPLOAD_LIMITS.perDay) return 'count';
  const since = now - 864e5;
  let bytes = 0, recent = 0;
  for (const f of files || []) {
    const t = Date.parse(String(f?.created_at || ''));
    if (Number.isFinite(t) && t >= since) { bytes += Number(f?.metadata?.size) || 0; recent++; }
  }
  // الروابط الصادرة التي لم يُرفع إليها بعد تُحسب بالسقف، ومعها الرابط المطلوب، فلا يُتجاوز الحجم بطلب الروابط قبل الرفع
  const pending = Math.max(0, (issued || 0) - recent);
  return bytes + (pending + 1) * UPLOAD_LIMITS.fileMax > UPLOAD_LIMITS.bytesPerDay ? 'bytes' : null;
}

/** مسارات الملفات اليتيمة: تحت <مشارك>/cv أو <مشارك>/evidence، أقدم من orphanHours، ولا يشير إليها صف.
 * ما لا يُقرأ وقته لا يُعد يتيمًا (الحذف لا يُبنى على شك)
 * @param {{ path: string, created_at?: string | null }[]} objects @param {Set<string>} referenced @param {number} [now] */
export function orphanPaths(objects, referenced, now = Date.now()) {
  const cutoff = now - UPLOAD_LIMITS.orphanHours * 36e5;
  const out = [];
  for (const o of objects || []) {
    const parts = String(o?.path || '').split('/');
    if (parts.length !== 3 || !parts[0] || !UPLOAD_PURPOSES.includes(parts[1]) || !parts[2]) continue;
    const t = Date.parse(String(o?.created_at || ''));
    if (!Number.isFinite(t) || t >= cutoff) continue;
    if (referenced.has(o.path)) continue;
    out.push(o.path);
  }
  return out;
}
