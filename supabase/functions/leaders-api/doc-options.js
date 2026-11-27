// ════════════════════════════════════════════════════════════════
// قرار رمز التحقق في الوثيقة المعتمدة (المرحلة 33، تصور تحميل الأدمن ورمز التحقق، القسم ب)
// ════════════════════════════════════════════════════════════════
// مصدر واحد للخادم (capstone.ts: الوثيقة وverifyDoc) وللعارض (verify-mark.js) وللواجهتين (Capstone.jsx وCapstones.jsx).
// capstones.doc_options: { owner: { qr }, admin: { qr, by, at, reason } }. القيمة الفعلية: قرار الأدمن إن وُجد، وإلا تفضيل
// القائد، وإلا مفعّل. تُقرأ حيًا ولا تُجمَّد في snapshot.issued، فالمنع اللاحق يسري على كل نسخة سبق تنزيلها، والبصمة وحدها ثابتة.

/** قرار الأدمن الثلاثي كما يُرسل من اللوحة: يتبع صاحبها (لا قرار) أو إظهار أو منع */
export const ADMIN_QR_CHOICES = Object.freeze(['follow', 'show', 'withhold']);
export const REASON_MAX = 300;

const bool = (v) => (typeof v === 'boolean' ? v : null);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/**
 * القيمة الفعلية للرمز: { qr, source } حيث source هو 'admin' أو 'owner' أو 'default'.
 * forced: الأدمن قرر فمفتاح القائد معطل («قرار فريق البرنامج»)
 */
export function effectiveQr(options) {
  const o = obj(options);
  const admin = bool(obj(o.admin).qr);
  if (admin !== null) return { qr: admin, source: 'admin', forced: true };
  const owner = bool(obj(o.owner).qr);
  if (owner !== null) return { qr: owner, source: 'owner', forced: false };
  return { qr: true, source: 'default', forced: false };
}

/** اختيار الأدمن الثلاثي من القيمة المخزنة */
export const adminChoice = (options) => {
  const q = bool(obj(obj(options).admin).qr);
  return q === null ? 'follow' : q ? 'show' : 'withhold';
};

/** ما يُلحق بالوثيقة لكل قارئ: القرار وحده بلا من قرر ولا سببه (لا يصل بريد الأدمن إلى المشارك أو القارئ) */
export function docOptionsView(options) {
  const o = obj(options);
  const admin = bool(obj(o.admin).qr), owner = bool(obj(o.owner).qr);
  return { ...(owner !== null && { owner: { qr: owner } }), ...(admin !== null && { admin: { qr: admin } }) };
}

/** الكتابة من القائد: owner.qr وحده، وما سواه كما هو. يرمي لقيمة غير منطقية */
export function withOwnerQr(options, qr) {
  if (typeof qr !== 'boolean') throw new Error('قيمة الرمز غير صالحة');
  return { ...obj(options), owner: { qr } };
}

/** الكتابة من الأدمن: follow يحذف قراره، وshow وwithhold يكتبان { qr, by, at, reason } */
/** @param {any} options @param {string} choice @param {{ by?: string | null, at?: string, reason?: string }} [meta] */
export function withAdminQr(options, choice, { by, at = new Date().toISOString(), reason = '' } = {}) {
  if (!ADMIN_QR_CHOICES.includes(choice)) throw new Error('اختيار الرمز غير صالح');
  const { admin: _drop, ...rest } = obj(options);
  if (choice === 'follow') return rest;
  const r = String(reason ?? '').trim().slice(0, REASON_MAX);
  return { ...rest, admin: { qr: choice === 'show', by: by || null, at, reason: r || null } };
}

/**
 * سبب غياب رمز التحقق عن وثيقة تُصدَّر (إصلاح 2026-11-27): 'draft' غير معتمدة، 'unissued' معتمدة بلا بصمة مجمّدة،
 * 'withheld' محجوب بالقرار الفعلي، وnull حين يُطبع. منطق خالص يقرؤه الخادم (qrStateFor) واللوح من المصدر نفسه
 */
export function qrExportReason({ approved = false, issued = false, qr = true } = {}) {
  if (!approved) return 'draft';
  if (!issued) return 'unissued';
  if (qr === false) return 'withheld';
  return null;
}
