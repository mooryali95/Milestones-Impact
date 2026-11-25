// ════════════════════════════════════════════════════════════════
// هوية الدفعة في وثيقة المبادرة (cohorts.identity، ترحيل leaders_cohort_identity)
// ════════════════════════════════════════════════════════════════
// { program: اسم البرنامج كما يظهر على الغلاف، logo: شعار البرنامج أو الراعي المؤسسي، color: لونه }. منطق خالص.
// الصدارة للجهة، والدفعة سطر توقيع بعدها، وMilestone علامة خافتة (doc.js coBrand). اللون لا يقود البنية إلا بعد فحص التباين.
export const IDENTITY_PROGRAM_MAX = 80;
export const IDENTITY_LOGO_MAX = 200_000; // حرفًا لصورة data: (نحو 150 ك.ب)

const COLOR = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
const LOGO = /^(data:image\/(png|jpe?g|webp|svg\+xml);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s"'<>]+)$/i;

/** تنظيف ما يُحفظ: يعيد { identity } أو يرمي برسالة عربية */
export function cleanIdentity(x) {
  const v = x && typeof x === 'object' ? x : {};
  const program = String(v.program ?? '').replace(/\s+/g, ' ').trim().slice(0, IDENTITY_PROGRAM_MAX) || null;
  const logo = String(v.logo ?? '').trim() || null;
  const color = String(v.color ?? '').trim() || null;
  if (logo && (!LOGO.test(logo) || logo.length > IDENTITY_LOGO_MAX)) throw new Error('الشعار صورة PNG أو JPG أو WEBP أو SVG، أو رابط https، بحجم أقصاه نحو 150 ك.ب');
  if (color && !COLOR.test(color)) throw new Error('اللون بصيغة #RRGGBB');
  return { program, logo, color };
}

/** هوية الدفعة كما تُطبع، أو null إن لم يُضبط منها شيء */
export function cohortIdentity(cohort) {
  let id;
  try { id = cleanIdentity(cohort?.identity); } catch { return null; }
  return id.program || id.logo || id.color ? id : null;
}
