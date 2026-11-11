// منطق طلبات التواصل بلا واجهة، ليُختبر وحده
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

export function filterContacts(rows, { q = '', status = '', source = '' }) {
  const s = q.trim().toLowerCase();
  return rows.filter((r) => (!s || [r.name, r.email, r.organization, r.phone].some((v) => v && String(v).toLowerCase().includes(s)))
    && (!status || r.status === status) && (!source || r.product === source));
}

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

export function mailto(r) {
  const subject = encodeURIComponent('رداً على استفساركم — Milestone Impact');
  const body = encodeURIComponent(`السلام عليكم ${r.name}،\n\nشكراً لتواصلكم مع Milestone Impact.\n\n`);
  return `mailto:${r.email}?subject=${subject}&body=${body}`;
}
