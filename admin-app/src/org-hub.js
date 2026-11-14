// ════════════════════════════════════════════════════════════════
// جاهزية الجهة: هل الجهة جاهزة لتستقبل مشاركيها وتتابعهم؟ (منطق خالص بلا واجهة)
// ════════════════════════════════════════════════════════════════
// لا يخزّن شيئًا ولا يكرر قاعدة: الحالة والرابط والعقد والشعار من صف الجهة نفسه، والمنسق من orgAccessState
// (قائمة الجهات)، والدفعة وجاهزيتها من admin.org-journey (pickCohort وcohortSetup نفسيهما)، والاعتماد من قمع الجهة.
// المستوى الثاني من ثلاثة: المنظومة ← الجهة ← الدفعة. تفاصيل الدفعة في ملفها، وهنا بند واحد يقود إليه.

const today = () => new Date().toISOString().slice(0, 10);
const plural = (n) => (n === 1 ? 'بند واحد' : n === 2 ? 'بندان' : `${n} بنود`);

/** @param {{ org: any, access?: any, journey?: any, members?: number, pending?: number, now?: string }} d */
export function orgReadiness({ org: o, access = null, journey = null, members = 0, pending = 0, now = today() }) {
  if (!o || o.id === 'none') return { items: [], missing: 0 };
  const active = !o.status || o.status === 'active';
  const cohort = journey?.cohort || null;
  const left = journey?.setup_missing || 0;
  const gaps = (journey?.setup || []).filter((x) => !x.ok).map((x) => x.title);   // أسماء ما بقي كما في ملف الدفعة
  const seatsFull = o.seats && members >= o.seats;
  const expired = o.contract_ends && o.contract_ends < now;

  const items = [
    {
      key: 'status', title: 'حالة الجهة', ok: active, action: active ? null : 'edit',
      detail: active ? 'فعّالة: رابطها يعمل ولوحة منسقها مفتوحة' : 'غير فعّالة: رابط تسجيلها متوقف حتى تُفعَّل',
    },
    {
      key: 'link', title: 'رابط التسجيل', ok: !!o.invite_code, action: o.invite_code ? null : 'edit',
      detail: o.invite_code ? 'من يسجّل به يُربط بالجهة ويدخل دفعتها تلقائيًا' : 'بلا رمز دعوة: لا رابط يُشارَك',
    },
    !journey ? null : !cohort
      ? { key: 'cohort', title: 'الدفعة', ok: false, action: 'new-cohort', detail: 'لا دفعة مفتوحة أو جارية: مشاركوها يدخلون الدفعة المفتوحة العامة، بلا جدول ولا مستشار خاص بهم' }
      : { key: 'cohort', title: 'الدفعة', ok: !left, action: 'cohort', other: cohort.id,
          detail: left ? `«${cohort.name}»: بقي فيها ${plural(left)}${gaps.length ? ` (${gaps.join('، ')})` : ''}` : `«${cohort.name}» مكتملة الإعداد` },
    !access ? null : access.state === 'active'
      ? { key: 'coordinator', title: 'منسق الجهة', ok: true, action: null, detail: `${access.n === 1 ? 'منسق واحد يتابع' : `${access.n} يتابعون`} لوحة الجهة` }
      : { key: 'coordinator', title: 'منسق الجهة', ok: false, action: 'coordinator',
          detail: access.state === 'invited' ? `دُعي (${access.email || ''}) ولم يدخل بعد` : access.state === 'lapsed' ? 'انتهت صلاحية المنسقين: لا أحد يتابع لوحة الجهة' : 'لا منسق: لا أحد من الجهة يتابع تقدم مشاركيها' },
    {
      key: 'contract', title: 'العقد والمقاعد', action: 'edit',
      ok: !!(o.seats && o.contract_ends) && !expired && !seatsFull,
      detail: expired ? `انتهى العقد في ${o.contract_ends}` : seatsFull ? `اكتملت المقاعد (${members} من ${o.seats})`
        : !o.seats || !o.contract_ends ? `ينقصه ${[!o.seats && 'عدد المقاعد', !o.contract_ends && 'تاريخ نهاية العقد'].filter(Boolean).join(' و')}`
          : `${members} من ${o.seats} مقعدًا، والعقد حتى ${o.contract_ends}`,
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
