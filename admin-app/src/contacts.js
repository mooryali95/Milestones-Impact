// منطق طلبات التواصل بلا واجهة، ليُختبر وحده
import { applyFilters, sortRows } from './filters.js';
import { daysSince } from './dates.js';
export const STATUS_AR = { new: 'جديد', read: 'مقروء', replied: 'تم الرد', archived: 'مؤرشف' };
export const INTEREST_AR = {
  leaders: 'برنامج القادة', matrix: 'مصفوفة التأثير', partnership: 'شراكة استراتيجية', general: 'استشارة عامة',
  A: 'استشارة قيادية', B: 'تنفيذ مؤسسي', C: 'شراكة استراتيجية', assessment: 'تقرير مقياس الجاهزية',
};
// مصادر الطلبات: الموقع الرئيسي، وصفحة القادة، ومقياس جاهزية الأثر (بوابة تقريره تمر بإجراء contact نفسه منذ 2026-11-11)
export const SOURCE_AR = { 'MI-HOME': 'الرئيسية', 'MI-LEADERS': 'القادة', 'MI-ASSESSMENT': 'مقياس الجاهزية' };
// شارة المصدر: ما جاء من الموقع الرئيسي (ومنه المقياس) بلون الرئيسية، وصفحة القادة بلونها
export const sourceTone = (product) => (product === 'MI-LEADERS' ? 'leaders' : 'home');
export const PAGE_SIZE = 20;
// تسميات مختصرة لشارة نوع الطلب في الجدول (سطر واحد)، والكاملة في اللوحة والتصدير. المصدر هنا وحده
export const INTEREST_SHORT = { partnership: 'شراكة', C: 'شراكة', assessment: 'تقرير المقياس', A: 'استشارة قيادية', B: 'تنفيذ مؤسسي' };
export const interestShort = (k) => INTEREST_SHORT[k] || INTEREST_AR[k] || k || '—';

// ── المتأخر: طلب لم يُرد عليه (جديد أو مقروء) بعد مهلة بالأيام ──
export const LATE_DAYS = 3;
export const AWAITING = ['new', 'read'];
/** أيام الانتظار لطلب لم يُرد عليه، وnull لما رُد عليه أو أُرشف */
export const awaitingDays = (r, now = new Date()) => (AWAITING.includes(r.status) ? daysSince(r.created_at, now) : null);
export const isLate = (r, now = new Date()) => (awaitingDays(r, now) ?? -1) >= LATE_DAYS;

// حقول الفلترة وأعمدة الفرز لشريط الفلترة الموحد (FilterBar): تعريف واحد للشاشة وللاختبار
export const CONTACT_FIELDS = [
  // الحالة تُكتب من بطاقات الرأس (CONTACT_CARDS) فتُخفى من الشريط، وتبقى حقلًا: مصدر واحد للرابط والرقاقة والتصدير
  { key: 'status', label: 'الحالات', aria: 'الحالة', get: (r) => r.status, options: Object.entries(STATUS_AR), hidden: true },
  { key: 'source', label: 'المصادر', aria: 'المصدر', get: (r) => r.product, options: Object.entries(SOURCE_AR) },
  { key: 'late', label: 'المهلة', aria: 'المتأخر', all: 'كل المهل', get: (r) => (isLate(r) ? '1' : ''), options: [['1', `متأخر (${LATE_DAYS} أيام فأكثر بلا رد)`]] },
];
export const CONTACT_KEYS = ['q', 'status', 'source', 'late', 'sort'];
// بطاقات الرأس المرشِّحة: كل بطاقة تكتب قيمتها في f.status، وعددها من كل الطلبات لا من المرشَّح
export const CONTACT_CARDS = [
  { key: 'new', label: 'جديدة', sub: 'لم تُفتح بعد', tone: 'new' },
  { key: 'read', label: 'قُرئت بلا رد', sub: 'فُتحت ولم يُرد عليها', tone: 'read' },
  { key: 'replied', label: 'تم الرد', sub: 'تم التواصل معها', tone: 'replied' },
];
export const cardCounts = (all) => { const n = countBy(all); return Object.fromEntries(CONTACT_CARDS.map((c) => [c.key, n[c.key] || 0])); };
export const contactText = (r) => [r.name, r.email, r.organization, r.phone].filter(Boolean).join(' ');
export const CONTACT_SORTS = { name: (r) => r.name, org: (r) => r.organization, date: (r) => r.created_at, status: (r) => STATUS_AR[r.status] || r.status };
export const filterContacts = (rows, state) => sortRows(applyFilters(rows, { fields: CONTACT_FIELDS, text: contactText }, { q: '', status: '', source: '', ...state }), CONTACT_SORTS, state.sort);

export const countBy = (rows) => rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});

// أرقام الصفحات المعروضة: الأولى والأخيرة وما حول الحالية، و«…» للفجوات
export function pageList(page, pages) {
  const out = [];
  for (let i = 1; i <= pages; i += 1) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) out.push(i);
    else if (Math.abs(i - page) === 2) out.push('…');
  }
  return out.filter((x, i, a) => !(x === '…' && a[i - 1] === '…'));
}

// صيغة بريد معقولة (لا تحقق كامل): تمنع حقن ?cc= أو أسطر في رابط mailto
export const validEmail = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@?&#<>"',;:]+@[^\s@?&#<>"',;:]+\.[^\s@?&#<>"',;:]+$/.test(e.trim());
/** رابط الرد بالبريد مرمَّزًا، وnull إن لم يكن البريد صالحًا */
export function mailto(r) {
  if (!validEmail(r.email)) return null;
  const subject = encodeURIComponent('رداً على استفساركم — Milestone Impact');
  const body = encodeURIComponent(`السلام عليكم ${r.name}،\n\nشكراً لتواصلكم مع Milestone Impact.\n\n`);
  const [local, domain] = r.email.trim().split('@');
  return `mailto:${encodeURIComponent(local)}@${encodeURIComponent(domain)}?subject=${subject}&body=${body}`;
}
