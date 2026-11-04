// ════════════════════════════════════════════════════════════════
// نطاقات الجهات وبريدها: المصدر الواحد لقواعد النطاق (خادم، لوحة، اختبارات)
// ════════════════════════════════════════════════════════════════
// نطاق الجهة يربط بريدًا موثَّقًا بصاحبها، فلا يُقبل نطاق يشترك فيه الجميع:
// لا لاحقة عامة (gov.sa، com.sa، co.uk…) ولا نطاق بريد عام (gmail.com…).

// لواحق عامة لا تملكها جهة واحدة: تُرفض كنطاق جهة، ولا تدخل في المطابقة الأم
export const PUBLIC_SUFFIXES = new Set([
  // السعودية
  'com.sa', 'net.sa', 'org.sa', 'gov.sa', 'edu.sa', 'sch.sa', 'med.sa', 'pub.sa',
  // الخليج والعالم العربي
  'co.ae', 'net.ae', 'org.ae', 'gov.ae', 'ac.ae', 'sch.ae', 'mil.ae',
  'com.kw', 'net.kw', 'org.kw', 'gov.kw', 'edu.kw',
  'com.qa', 'net.qa', 'org.qa', 'gov.qa', 'edu.qa', 'sch.qa',
  'com.bh', 'net.bh', 'org.bh', 'gov.bh', 'edu.bh',
  'com.om', 'net.om', 'org.om', 'gov.om', 'edu.om', 'med.om',
  'com.eg', 'net.eg', 'org.eg', 'gov.eg', 'edu.eg', 'sci.eg',
  'com.jo', 'net.jo', 'org.jo', 'gov.jo', 'edu.jo', 'sch.jo',
  'com.lb', 'net.lb', 'org.lb', 'gov.lb', 'edu.lb',
  'com.ps', 'net.ps', 'org.ps', 'gov.ps', 'edu.ps',
  'com.sd', 'net.sd', 'org.sd', 'gov.sd', 'edu.sd',
  'com.ye', 'net.ye', 'org.ye', 'gov.ye', 'edu.ye',
  'com.iq', 'net.iq', 'org.iq', 'gov.iq', 'edu.iq',
  'com.ma', 'net.ma', 'org.ma', 'gov.ma', 'ac.ma',
  'com.tn', 'net.tn', 'org.tn', 'gov.tn', 'edu.tn',
  'com.dz', 'net.dz', 'org.dz', 'gov.dz', 'edu.dz',
  'com.ly', 'net.ly', 'org.ly', 'gov.ly', 'edu.ly',
  // الأكثر شيوعًا عالميًا
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'ltd.uk',
  'com.au', 'net.au', 'org.au', 'gov.au', 'edu.au',
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in',
  'com.tr', 'net.tr', 'org.tr', 'gov.tr', 'edu.tr',
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  'co.za', 'org.za', 'gov.za', 'ac.za',
  'com.pk', 'net.pk', 'org.pk', 'gov.pk', 'edu.pk',
  'com.my', 'net.my', 'org.my', 'gov.my', 'edu.my',
  'co.id', 'or.id', 'go.id', 'ac.id',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'co.jp', 'ne.jp', 'or.jp', 'go.jp', 'ac.jp',
  'co.kr', 'or.kr', 'go.kr', 'ac.kr',
  'com.mx', 'org.mx', 'gob.mx', 'edu.mx',
  'com.ar', 'org.ar', 'gob.ar', 'edu.ar',
]);

// نطاقات البريد العامة لا تربط أحدًا بجهة أبدًا
export const PUBLIC_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'outlook.com', 'outlook.sa', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.net', 'mail.com', 'mail.ru', 'yandex.com', 'yandex.ru', 'zoho.com', 'windowslive.com', 'fastmail.com', 'hey.com',
  'qq.com', '163.com', '126.com', 'tutanota.com', 'tuta.io',
]);

// اسم المضيف من رابط أو نطاق: أحرف صغيرة، بلا www، وبنقطة واحدة على الأقل
export function hostOf(ref) {
  const s = String(ref || '').trim().toLowerCase();
  if (!s) return null;
  try {
    const h = new URL(s.includes('://') ? s : `https://${s}`).hostname.replace(/^www\./, '');
    return /^[a-z0-9.-]{3,120}$/.test(h) && h.includes('.') ? h : null;
  } catch { return null; }
}

export const isPublicSuffix = (host) => PUBLIC_SUFFIXES.has(String(host || '').toLowerCase());
export const isPublicMail = (domain) => PUBLIC_MAIL.has(String(domain || '').toLowerCase());

// سبب رفض نطاق كنطاق جهة، أو null إن كان صالحًا
export function orgDomainIssue(domain) {
  const h = hostOf(domain);
  if (!h) return 'نطاق غير صحيح';
  if (isPublicMail(h)) return 'نطاق بريد عام لا يخص جهة';
  if (isPublicSuffix(h)) return 'لاحقة عامة يشترك فيها كثيرون، اكتب نطاق الجهة نفسه (مثل org.gov.sa)';
  const parts = h.split('.');
  if (parts.length < 2 || parts.some((p) => !p)) return 'نطاق غير صحيح';
  return null;
}

// النطاق ثم آباؤه حتى ما قبل اللاحقة العامة أو امتداد الدولة:
// mail.moh.gov.sa ← [mail.moh.gov.sa, moh.gov.sa] (لا gov.sa ولا sa)
export function domainCandidates(host) {
  const h = hostOf(host);
  if (!h) return [];
  const parts = h.split('.');
  return parts.slice(0, -1).map((_, i) => parts.slice(i).join('.')).filter((c) => !isPublicSuffix(c));
}
