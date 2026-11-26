// ════════════════════════════════════════════════════════════════
// علامة التحقق في صفحة الاعتماد (المرحلة 32: نزاهة الرمز)
// ════════════════════════════════════════════════════════════════
// مصدر واحد للنسخة المؤسسية (institutional.js) ولملف العمل الكامل (capstone.js):
// لا يُطبع رمز QR إلا ببصمة مجمّدة في snapshot.issued (issuedFingerprint)، وهي وحدها ما يبحث فيه verifyDoc.
// المعتمدة بلا بصمة مجمّدة: لا رمز ولا رابط، وسطر DOC_VERIFY_AR.unavailable.
// الشكل: رمز نحو 22 مم متجهي بلون الحبر على أبيض بهامش هادئ، وبجانبه ثلاثة أسطر (نص التحقق، البصمة بخط أحادي، الرابط القصير).
import QR from 'qrcode';
import { esc } from './doc.js';
import { issuedFingerprint } from '../../../supabase/functions/leaders-api/doc-quality.js';
import { effectiveQr } from '../../../supabase/functions/leaders-api/doc-options.js';
import { DOC_VERIFY_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { SITES } from '../../../supabase/functions/_shared/sites.js';

export const INK = '#0B272F';
export { issuedFingerprint };

// ── رمز QR متجهي (SVG) من حزمة qrcode نفسها التي تبني رمز الشهادة، بلا شبكة؛ هامش هادئ أربع وحدات على أبيض ──
export function qrSvg(text) {
  const q = QR.create(text, { errorCorrectionLevel: 'M' });
  const n = q.modules.size, d = q.modules.data, z = 4;
  let path = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[y * n + x]) path += `M${x + z} ${y + z}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${n + 2 * z} ${n + 2 * z}" shape-rendering="crispEdges" role="img" aria-label="رمز التحقق"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="${INK}"/></svg>`;
}

/** رابط التحقق العام بالبصمة: صفحة /v/doc/<البصمة> في تطبيق القادة (Verify.jsx، doc.verify) */
export const verifyUrl = (fp, base = SITES.leaders) => `${String(base || SITES.leaders).replace(/\/$/, '')}/v/doc/${encodeURIComponent(fp)}`;
/** الرابط مكتوبًا لمن يطبع ورقيًا: بلا البروتوكول */
export const shortVerifyUrl = (url) => String(url).replace(/^https?:\/\//, '');

export const VERIFY_STYLE = `<style>
.vm { display: flex; align-items: center; gap: 5mm; margin-top: 6mm; padding-top: 4mm; border-top: 1px solid #DCE2E1; break-inside: avoid; }
.vm .qr { width: 22mm; height: 22mm; flex: none; background: #fff; }
.vm .vm-l { display: flex; flex-direction: column; gap: 1.2mm; min-width: 0; }
.vm .vm-l > span { font-size: 9.5pt; line-height: 1.6; color: #2C4148; }
.vm .vm-fp { font: 500 9pt ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace; letter-spacing: .06em; color: ${INK}; direction: ltr; unicode-bidi: isolate; text-align: end; }
.vm a { font: 400 8.5pt "Noto Sans", sans-serif; color: ${INK}; text-decoration: none; direction: ltr; unicode-bidi: isolate; word-break: break-all; text-align: end; }
.vm.off > span { font-size: 9.5pt; color: #5F7176; }
</style>`;

/**
 * علامة التحقق للمعتمدة: { html, fingerprint, url } أو null لغير المعتمدة (يرسم كل عارض سطر مسودته).
 * qr: خيار الرمز من معامل الخيارات (المرحلة 21). بلا بصمة مجمّدة: سطر «التحقق غير متاح لهذه النسخة» وحده.
 * المرحلة 33: قرار الرمز الحي (input.doc_options، effectiveQr) يعلو خيار التنزيل: المنع لا يطبع الرمز ولا الرابط، وتبقى البصمة
 */
export function verifyMark(input, { qr: wanted = true, appUrl } = {}) {
  if (input?.meta?.status !== 'approved') return null;
  const qr = wanted && effectiveQr(input?.doc_options).qr;
  const fp = issuedFingerprint(input);
  if (!fp) return { fingerprint: null, url: null, html: `<div class="vm off" data-verify="unavailable"><span>${esc(DOC_VERIFY_AR.unavailable)}</span></div>` };
  if (!qr) return { fingerprint: fp, url: null, html: `<div class="vm" data-verify="no-qr"><div class="vm-l"><span>${esc(DOC_VERIFY_AR.note)}</span><b class="vm-fp">${esc(fp)}</b></div></div>` };
  const url = verifyUrl(fp, appUrl);
  return { fingerprint: fp, url, html: `<div class="vm" data-verify="qr">${qrSvg(url)}<div class="vm-l"><span>${esc(DOC_VERIFY_AR.scan)}</span><b class="vm-fp">${esc(fp)}</b><a href="${esc(url)}">${esc(shortVerifyUrl(url))}</a></div></div>` };
}

/** سطر التذييل: الرقم المرجعي والبصمة المجمّدة، بلا رمز */
export const footerLine = (id, fp) => (fp ? `${id}  ·  ${fp}` : id);
