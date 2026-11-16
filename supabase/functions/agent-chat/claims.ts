// ════════════════════════════════════════════════════════════════
// الادعاءات المحظورة في رد المساعد بأي لغة: مصدر واحد لحارس المخرج (guard.ts) وللمصحح (evals/grade.ts)
// ════════════════════════════════════════════════════════════════
// كان المنع معلقًا على التعليمات وحدها (القاعدتان 6 و13)، والنموذج يكرر الادعاء أحيانًا نافيًا («ليست معتمدة دوليًا»)
// أو بلغة طلبها الزائر. هنا الأنماط، والحارس يستبدل الجملة كلها بالحقيقة المعتمدة بصيغة موجبة.
export type ClaimKind = 'accreditation' | 'residency' | 'guarantee';

const T = '(?:ًا|ا|ً)?';
export const FORBIDDEN_CLAIMS: { kind: ClaimKind; rx: RegExp }[] = [
  // اعتماد دولي أو مهني للشهادة أو البرنامج (الحقيقة: شهادة إتمام بنجاح بلا اعتماد خارجي)
  { kind: 'accreditation', rx: new RegExp(`internationally (?:accredited|recogni[sz]ed|certified)|(?:accredited|recogni[sz]ed) internationally|professionally accredited|globally accredited|معتمد(?:ة|ه)? (?:دولي|مهني|عالمي)${T}|معترف (?:بها|به) (?:دولي|عالمي|مهني)${T}|اعتماد${T} (?:دولي|مهني|عالمي)${T}|accrédité(?:e)? (?:internationalement|à l'international)|reconnue? internationalement`, 'i') },
  // بقاء البيانات أو استضافتها في المملكة (الحقيقة: مومباي بالهند، خارج المملكة)
  { kind: 'residency', rx: /(?:تبقى|تُحفظ|تحفظ|محفوظة|محفوظه|مستضافة|مستضافه|مخزنة|مخزنه|تُخزن|تخزن)[^.\n]{0,25}(?:داخل المملكة|في المملكة|في السعودية|داخل السعودية)/ },
  { kind: 'residency', rx: /(?:stored|hosted|kept|resides?|remains?)[^.\n]{0,25}(?:in|inside|within) (?:Saudi|the Kingdom|KSA)/i },
  { kind: 'residency', rx: /(?:stockées|hébergées|conservées|gardées)[^.\n]{0,30}(?:en|dans le|au sein du|à l'intérieur du) (?:Royaume|Arabie)/i },
  // ضمان نتيجة أو استرداد أو قبول أو خصم (لا وعد بشيء من ذلك)
  { kind: 'guarantee', rx: /(?:الاسترداد|استرداد|القبول|الخصم|النجاح|الوظيفة|الوظيفه)\s+(?:مضمون|مضمونة|مضمونه)|نضمن (?:لك|لكم|استرداد|القبول|النجاح)|guaranteed (?:refund|acceptance|admission|discount|job|results?)|(?:refund|acceptance|admission|discount) is guaranteed|we guarantee|100% guaranteed/i },
];

export const claimKinds = (text: string): ClaimKind[] => [...new Set(FORBIDDEN_CLAIMS.filter((c) => c.rx.test(String(text ?? ''))).map((c) => c.kind))];
