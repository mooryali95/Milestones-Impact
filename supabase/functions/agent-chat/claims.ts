// ════════════════════════════════════════════════════════════════
// الادعاءات المحظورة في رد المساعد بأي لغة: مصدر واحد لحارس المخرج (guard.ts) وللمصحح (evals/grade.ts)
// ════════════════════════════════════════════════════════════════
// كان المنع معلقًا على التعليمات وحدها (القاعدتان 6 و13)، والنموذج يكرر الادعاء أحيانًا نافيًا («ليست معتمدة دوليًا»)
// أو بلغة طلبها الزائر. هنا الأنماط، والحارس يستبدل الجملة كلها بالحقيقة المعتمدة بصيغة موجبة.
// النص يُوحَّد قبل المطابقة (claimText): تُنزع الحركات والتطويل («مُعتمدة دولياً» كـ«معتمدة دوليا»)، والشرطة بين
// كلمتين مسافة ("internationally-recognized")، والمسافات المتتالية واحدة.
export type ClaimKind = 'accreditation' | 'residency' | 'guarantee';

export const claimText = (s: string) => String(s ?? '')
  .replace(/[ً-ٰٟـ]/g, '')
  .replace(/(?<=[\p{L}\p{N}])[-‐‑](?=[\p{L}\p{N}])/gu, ' ')
  .replace(/[ \t]+/g, ' ');

const T = '(?:ًا|ا|ً)?';
const BODY = '(?:PMI|the Project Management Institute|Project Management Institute|IPMA|AXELOS|PeopleCert|NCAAA|an? (?:international|official|professional|accreditation) (?:body|organi[sz]ation))';
const BODY_AR = '(?:PMI|معهد إدارة المشاريع|معهد ادارة المشاريع|معهد إدارة المشروعات|IPMA|جهة دولية|جهات دولية|جهة اعتماد|هيئة دولية)';
// نفي الإقامة («ليست في المملكة»، "not in Saudi Arabia") حقيقة لا ادعاء: يُفحص في المطابقة وقبلها بقليل
const RES_NEG = /\bnot\b|n't|\bnever\b|\boutside\b|rather than|instead of|ليست|ليس |لا ت|لا ي|لم ت|غير |خارج/i;

export const FORBIDDEN_CLAIMS: { kind: ClaimKind; rx: RegExp; neg?: RegExp }[] = [
  // اعتماد دولي أو مهني للشهادة أو البرنامج، أو من جهة مسماة (الحقيقة: شهادة إتمام بنجاح بلا اعتماد خارجي)
  { kind: 'accreditation', rx: new RegExp([
    'internationally (?:accredited|recogni[sz]ed|certified)',
    '(?:accredited|recogni[sz]ed|certified) (?:internationally|worldwide|globally)',
    '(?:globally|worldwide) (?:accredited|recogni[sz]ed)',
    'professionally accredited',
    `(?:accredited|certified|endorsed|approved|recogni[sz]ed) by ${BODY}`,
    'PMI (?:accredited|certified|approved|endorsed)',
    `معتمد(?:ة|ه)? (?:دولي|مهني|عالمي)${T}`,
    `معتمد(?:ة|ه)? من ${BODY_AR}`,
    `معترف (?:بها|به) (?:دولي|عالمي|مهني)${T}`,
    `معترف (?:بها|به) من ${BODY_AR}`,
    `اعتماد${T} (?:دولي|مهني|عالمي)${T}`,
    "accrédité(?:e)? (?:internationalement|à l'international|par le PMI)",
    'reconnue? internationalement',
  ].join('|'), 'i') },
  // بقاء البيانات أو استضافتها في المملكة (الحقيقة: مومباي بالهند، خارج المملكة)
  { kind: 'residency', neg: RES_NEG, rx: /(?:تبقى|تحفظ|محفوظة|محفوظه|مستضافة|مستضافه|مخزنة|مخزنه|تخزن|بيانات\S*|الخوادم|خوادم\S*|السيرفرات|سيرفرات\S*)[^.\n]{0,25}(?:داخل|في) (?:المملكة|السعودية)/ },
  { kind: 'residency', neg: RES_NEG, rx: /(?:stored|hosted|kept|resides?|remains?|located|stays?|servers?|data cent(?:er|re)s?)[^.\n]{0,30}(?:in|inside|within) (?:Saudi|the Kingdom|KSA)/i },
  { kind: 'residency', neg: RES_NEG, rx: /(?:stockées|hébergées|conservées|gardées)[^.\n]{0,30}(?:en|dans le|au sein du|à l'intérieur du) (?:Royaume|Arabie)/i },
  // ضمان نتيجة أو استرداد أو قبول أو خصم (لا وعد بشيء من ذلك). «نضمن لك سرية بياناتك» ليس وعدًا بنتيجة
  { kind: 'guarantee', rx: new RegExp([
    '(?:الاسترداد|استرداد|القبول|الخصم|النجاح|الوظيفة|الوظيفه)\\s+(?:مضمون|مضمونة|مضمونه)',
    'نضمن (?:لك |لكم )?(?:استرداد|الاسترداد|القبول|النجاح|الوظيفة|نتيجة|النتيجة|خصم|الخصم|حصولك|أنك|انك|أن تحصل|ان تحصل)',
    '(?:سنعيد|سنرجع|نعيد|نرجع|سيعاد|سترد|سيسترد|ستسترد|سترجع)[^.\\n]{0,30}(?:بالتأكيد|بالتاكيد|أكيد|اكيد|مؤكد|حتما|بلا شك|100%)',
    '(?:بالتأكيد|بالتاكيد|أكيد|اكيد|حتما) (?:سنعيد|سنرجع|نعيد|سترد|سيسترد|ستسترد|سيعاد)',
    'guaranteed (?:refunds?|acceptance|admission|discounts?|job|results?|success)',
    '(?:refunds?|acceptance|admission|discounts?|results?|success) (?:is|are|will be) guaranteed',
    'we guarantee (?:you |that you |that )?(?:a |an |your )?(?:refunds?|money back|acceptance|admission|discounts?|job|results?|success|you will|you get|you\'ll)',
    '(?:definitely|certainly|surely) (?:get|receive|be given) (?:a |your )?(?:refund|money back)',
    '(?:refund|money back) for sure',
    '100% guaranteed',
  ].join('|'), 'i') },
];

export function claimHit(c: { rx: RegExp; neg?: RegExp }, text: string): boolean {
  const t = claimText(text);
  const m = c.rx.exec(t);
  if (!m) return false;
  if (!c.neg) return true;
  // نفي في المطابقة أو في الكلمات القليلة قبلها
  return !c.neg.test(t.slice(Math.max(0, m.index - 10), m.index + m[0].length));
}
export const claimKinds = (text: string): ClaimKind[] => [...new Set(FORBIDDEN_CLAIMS.filter((c) => claimHit(c, text)).map((c) => c.kind))];
