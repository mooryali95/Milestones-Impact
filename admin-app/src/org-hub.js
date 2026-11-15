// ════════════════════════════════════════════════════════════════
// جاهزية الجهة: هل الجهة جاهزة لتستقبل مشاركيها وتتابعهم؟ (منطق خالص بلا واجهة)
// ════════════════════════════════════════════════════════════════
// لا يخزّن شيئًا ولا يكرر قاعدة: الحالة والرابط والعقد والشعار من صف الجهة نفسه، والمنسق من orgAccessState
// (قائمة الجهات)، والدفعة وجاهزيتها من admin.org-journey (pickCohort وcohortSetup نفسيهما)، والاعتماد من قمع الجهة.
// المستوى الثاني من ثلاثة: المنظومة ← الجهة ← الدفعة. تفاصيل الدفعة في ملفها، وهنا بند واحد يقود إليه.

const today = () => new Date().toISOString().slice(0, 10);
const plural = (n) => (n === 1 ? 'بند واحد' : n === 2 ? 'بندان' : `${n} بنود`);

// المقاعد المستهلكة من مصدرها الواحد: seats_used من admin.orgs (seatsUsed في entitlements.ts: إعفاء حي من الجهة).
// تعذّر عدّها في الخادم يرسلها فارغة، فيُعرض عدد الأعضاء بدلها كما كان
export const seatsUsedOf = (o, members = 0) => o?.seats_used ?? members;

// سطر المقاعد في بطاقة الجهة ورأس ملفها: «31 من 50» بالمستهلك من العقد، وبلا مقاعد في العقد عدد المشاركين
export function seatsView(o, members = 0) {
  if (!o?.seats) return { label: 'المشاركون', value: String(members), hint: 'بلا حد في العقد', pct: null };
  const used = seatsUsedOf(o, members);
  return { label: 'المقاعد', value: `${used} من ${o.seats}`, hint: null, pct: Math.min(100, (used / o.seats) * 100) };
}

/** @param {{ org: any, access?: any, journey?: any, members?: number, seatsUsed?: number|null, pending?: number, now?: string }} d
 *  seatsUsed: المقاعد المستهلكة من العقد (admin.orgs ← seatsUsed: إعفاء حي من الجهة)، وبلاها عدد الأعضاء */
export function orgReadiness({ org: o, access = null, journey = null, members = 0, seatsUsed = null, pending = 0, now = today() }) {
  if (!o || o.id === 'none') return { items: [], missing: 0 };
  const active = !o.status || o.status === 'active';
  const cohort = journey?.cohort || null;
  const left = journey?.setup_missing || 0;
  const gaps = (journey?.setup || []).filter((x) => !x.ok).map((x) => x.title);   // أسماء ما بقي كما في ملف الدفعة
  // المقعد يُستهلك بإعفاء الرعاية لا بالتسجيل: المنسحب قبل أول باب يُرد مقعده، والمسجّل قبل الرعاية لا يستهلك
  const used = seatsUsed ?? members;
  const seatsFull = o.seats && used >= o.seats;
  const expired = o.contract_ends && o.contract_ends < now;

  const items = [
    {
      key: 'status', title: 'حالة الجهة', ok: active, action: active ? null : 'edit',
      detail: active ? 'فعّالة: رابطها يعمل ولوحة منسقها مفتوحة' : 'غير فعّالة: رابط تسجيلها متوقف حتى تُفعَّل',
    },
    {
      key: 'link', title: 'رابط التسجيل', ok: !!o.invite_code && active, action: o.invite_code && active ? null : 'edit',
      detail: !o.invite_code ? 'بلا رمز دعوة: لا رابط يُشارَك' : active ? 'من يسجّل به يُربط بالجهة ويدخل دفعتها تلقائيًا' : 'متوقف ما دامت الجهة غير فعّالة: من يفتحه لا يُربط بها',
    },
    !journey ? null : !cohort
      ? { key: 'cohort', title: 'الدفعة', ok: false, action: 'new-cohort', detail: 'لا دفعة مفتوحة أو جارية: مشاركوها يدخلون الدفعة المفتوحة العامة، بلا جدول ولا مستشار خاص بهم' }
      : { key: 'cohort', title: 'الدفعة', ok: !left, action: 'cohort', other: cohort.id,
          // برنامج الجهة للقراءة (P4): يُشتق من دفعتها (orgProgram في الخادم)، ويُحرَّر من ملف الدفعة وحده
          detail: `${left ? `«${cohort.name}»: بقي فيها ${plural(left)}${gaps.length ? ` (${gaps.join('، ')})` : ''}` : `«${cohort.name}» مكتملة الإعداد`}${journey.program?.name ? ` · برنامج الجهة «${journey.program.name}»` : ''}` },
    !access ? null : access.state === 'active'
      ? { key: 'coordinator', title: 'منسق الجهة', ok: true, action: null, detail: `${access.n === 1 ? 'منسق واحد يتابع' : `${access.n} يتابعون`} لوحة الجهة` }
      : { key: 'coordinator', title: 'منسق الجهة', ok: false, action: 'coordinator',
          detail: access.state === 'invited' ? `دُعي (${access.email || ''}) ولم يدخل بعد` : access.state === 'lapsed' ? 'انتهت صلاحية المنسقين: لا أحد يتابع لوحة الجهة' : 'لا منسق: لا أحد من الجهة يتابع تقدم مشاركيها' },
    {
      key: 'contract', title: 'العقد والمقاعد', action: 'edit',
      ok: !!(o.seats && o.contract_ends) && !expired && !seatsFull,
      detail: expired ? `انتهى العقد في ${o.contract_ends}` : seatsFull ? `اكتملت المقاعد (${used} من ${o.seats}): التسجيلات التالية تنتظر قرار الرعاية`
        : !o.seats || !o.contract_ends ? `ينقصه ${[!o.seats && 'عدد المقاعد', !o.contract_ends && 'تاريخ نهاية العقد'].filter(Boolean).join(' و')}`
          : `${used} من ${o.seats} مقعدًا مستهلكًا، والعقد حتى ${o.contract_ends}`,
    },
    {
      key: 'brand', title: 'هوية الشهادة', action: 'edit',
      ok: o.cert_cobrand === false || !!o.logo,
      detail: o.cert_cobrand === false ? 'الشهادة بهوية البرنامج وحده (باختيارك)' : o.logo ? 'شعار الجهة يظهر على شهادات مشاركيها' : 'بلا شعار: تصدر الشهادة بلا شعار الجهة',
    },
    {
      key: 'approval', title: 'الاعتماد', ok: pending === 0, action: pending ? 'approve' : null,
      detail: pending ? `${pending} بانتظار اعتمادك: لا يرون رحلتهم قبله` : 'لا أحد ينتظر الاعتماد',
    },
  ].filter(Boolean);
  return { items, missing: items.filter((x) => !x.ok).length };
}

export const readinessSummary = (r) => (r.missing ? `بقي ${plural(r.missing)} من ${r.items.length}` : 'جاهزة');
