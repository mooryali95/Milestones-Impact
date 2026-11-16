// ════════════════════════════════════════════════════════════════
// صندوق «ينتظرني»: كل ما ينتظر قرار الإدارة في قائمة واحدة بعمره (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// كان ما ينتظر القرار موزعًا: اعتمادات ومتطلبات في النظرة العامة، ومشاريع التخرج في تبويبها، وطلبات الخبراء وطلبات
// الرعاية وطلبات الحذف وتأكيد الجلسات كل في شاشته (تحليل لوحة الإدارة 2026-11-13). هنا تُجمع بنوعها وعمرها ووجهتها.
// لا يخزّن شيئًا: كل بند من جدوله، والعمر من تاريخه هو. الأقدم أولًا، فما طال انتظاره يُرى أولًا.
import { daysLeft, urgency } from './erasure.js';

export const INBOX_KINDS = {
  approval: { label: 'اعتماد مسار', tab: 'participants', sla: 2 },
  requirement: { label: 'متطلب للمراجعة', tab: 'participants', sla: 5 },
  model: { label: 'نموذج للتقييم', tab: 'handbook', sla: 5 },
  capstone: { label: 'وثيقة مبادرة', tab: 'capstones', sla: 7 },
  expert_application: { label: 'طلب انضمام خبير', tab: 'experts', sla: 7 },
  // query: عرض مصفّى في شاشة الوجهة. الطلب بلا خبير يُرى ويُعالج في طلبات الإسناد بعرض «يحتاج تدخلًا»، لا في ملف المشارك
  expert_unmatched: { label: 'طلب خبير بلا مطابق', tab: 'experts', sla: 3, query: 'view=attention' },
  sponsor: { label: 'طلب رعاية', tab: 'payments', sla: 3 },
  // urgency: «قريب» و«متأخر» بأيام المهلة على تقويم الرياض (erasure.js)، كالشريط والبطاقة وسطر البند نفسه، لا بأيام UTC
  // منذ الطلب: قرب منتصف ليل الرياض كانا يختلفان يومًا (تصور طلب الحذف 4.7)
  erasure: { label: 'طلب حذف بيانات', tab: 'participants', sla: 30, urgency: (at, now) => urgency(daysLeft(at, now)) },
  coaching_confirm: { label: 'جلسة تنتظر التأكيد', tab: 'activities', sla: 2 },
};
const DAY = 864e5;
// late: تجاوز مهلة نوعه. soon: للنوع الذي له مهلة نظامية (urgency) وحده
function toneOf(def, at, days, now) {
  if (def.urgency && at) { const u = def.urgency(at, now); return { late: u === 'late', soon: u === 'soon' }; }
  return { late: days != null && days > def.sla, soon: false };
}
const daysSince = (iso, now) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / DAY)) : null);

/**
 * يبني قائمة الصندوق من صفوف مصادرها.
 * @param {Record<string, any[]>} src صفوف لكل نوع: { id, participant_id?, title, sub?, at }
 * @param {number} [now]
 */
export function inboxOf(src, now = Date.now()) {
  const items = [];
  for (const [kind, def] of Object.entries(INBOX_KINDS)) {
    for (const r of src?.[kind] || []) {
      const days = daysSince(r.at, now);
      items.push({
        kind, kind_ar: def.label, id: r.id, title: r.title || '', sub: r.sub || '', at: r.at || null, days,
        ...toneOf(def, r.at, days, now),
        // الوجهة: عرض نوعها المصفّى إن كان له عرض، وإلا ملف المشارك حين يكون البند عن مشارك، وإلا تبويب نوعه بمعرّفه إن كان له صفحة
        to: def.query ? { tab: def.tab, id: null, query: def.query }
          : r.participant_id ? { tab: 'participants', id: r.participant_id } : { tab: def.tab, id: ['capstones', 'experts'].includes(def.tab) ? r.id : null },
      });
    }
  }
  items.sort((x, y) => String(x.at || '9').localeCompare(String(y.at || '9')));
  const counts = Object.fromEntries(Object.keys(INBOX_KINDS).map((k) => [k, items.filter((i) => i.kind === k).length]));
  return { items, counts, total: items.length, late: items.filter((i) => i.late).length, soon: items.filter((i) => i.soon).length };
}
export const ageAr = (days) => (days == null ? '' : days === 0 ? 'اليوم' : days === 1 ? 'منذ يوم' : days === 2 ? 'منذ يومين' : days <= 10 ? `منذ ${days} أيام` : `منذ ${days} يومًا`);

// «اعتمد الجاهزين» من الصندوق: المنتظرون الأقدم أولًا (ترتيب الصندوق) حتى حد الطلب الواحد
export const approvalIdsOf = (items, max) => (items || []).filter((i) => i.kind === 'approval').map((i) => i.id).slice(0, max);
// سطر المعاينة تحت الزر: «7 جاهزون، 5 تحتاج نظرك»
export function readyLineAr(ready, held) {
  const r = ready === 1 ? 'واحد جاهز' : `${ready} جاهزون`;
  const h = held === 1 ? 'واحد يحتاج نظرك' : `${held} تحتاج نظرك`;
  return [ready > 0 && r, held > 0 && h].filter(Boolean).join('، ') || 'لا أحد جاهز الآن';
}
