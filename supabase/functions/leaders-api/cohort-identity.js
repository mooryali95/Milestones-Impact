// ════════════════════════════════════════════════════════════════
// هوية الدفعة في وثيقة المبادرة (cohorts.identity، ترحيل leaders_cohort_identity)
// ════════════════════════════════════════════════════════════════
// { program: اسم البرنامج كما يظهر على الغلاف، logo: شعار البرنامج أو الراعي المؤسسي، color: لونه }. منطق خالص.
// الصدارة للجهة، والدفعة سطر توقيع بعدها، وMilestone علامة خافتة (doc.js coBrand). اللون لا يقود البنية إلا بعد فحص التباين.
import { cleanLogoData } from './svg-clean.js';

export const IDENTITY_PROGRAM_MAX = 80;
export const IDENTITY_LOGO_MAX = 200_000; // حرفًا لصورة data: (نحو 150 ك.ب)

const COLOR = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
// الشعار صورة مضمّنة وحدها (المرحلة 21): لا رابط https خارجي يجلبه قارئ الوثيقة أو مولّد PDF، وSVG يُعقَّم عند الحفظ (svg-clean.js)
const LOGO = /^data:image\/(png|jpe?g|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i;

/** تنظيف ما يُحفظ: يعيد { identity } أو يرمي برسالة عربية */
export function cleanIdentity(x) {
  const v = x && typeof x === 'object' ? x : {};
  const program = String(v.program ?? '').replace(/\s+/g, ' ').trim().slice(0, IDENTITY_PROGRAM_MAX) || null;
  const given = String(v.logo ?? '').trim() || null;
  const color = String(v.color ?? '').trim() || null;
  if (given && (!LOGO.test(given) || given.length > IDENTITY_LOGO_MAX)) throw new Error('الشعار صورة PNG أو JPG أو WEBP أو SVG مرفوعة، بحجم أقصاه نحو 150 ك.ب');
  const logo = given && cleanLogoData(given);
  if (color && !COLOR.test(color)) throw new Error('اللون بصيغة #RRGGBB');
  return { program, logo, color };
}

/** هوية الدفعة كما تُطبع، أو null إن لم يُضبط منها شيء */
export function cohortIdentity(cohort) {
  let id;
  // شعار محفوظ قبل المرحلة 21 لم يعد يُقبل (رابط https أو SVG غير نظيف): يسقط الشعار وحده ويبقى الاسم واللون
  try { id = cleanIdentity(cohort?.identity); } catch {
    try { id = cleanIdentity({ ...(cohort?.identity || {}), logo: null }); } catch { return null; }
  }
  return id.program || id.logo || id.color ? id : null;
}
