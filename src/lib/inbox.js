// ════════════════════════════════════════════════════════════════
// منطق الوارد — الدمج والترشيح والحالة
// ════════════════════════════════════════════════════════════════
// أُخرج من الشاشة ليُختبَر: كان مدفوناً في useMemo داخل التصيير،
// فلا يُفحص إلا بفتح متصفّح. وهو المنطق الذي يقرّر ما يراه المستشار
// وما لا يراه — أولى ما يُثبَّت باختبار.

import { RESULT } from './api';

// يجمع صفوف كل مصدرٍ مرئيّ في قائمةٍ واحدة موسومةٍ بمصدرها،
// مرتّبةً بالأحدث. مصدرٌ لم يصل أو سقط يُتجاوَز هنا — وتُعرض
// حالته وحدها في مكانٍ آخر، فلا يختفي سببه.
export function mergeInbox(sources, rows) {
  const all = [];
  for (const source of sources) {
    const bundle = rows[source.id];
    if (!bundle || bundle.state !== RESULT.OK) continue;
    for (const row of bundle.data) {
      const raw = row[source.dateKey];
      const t = raw ? new Date(raw).getTime() : 0;
      all.push({ source, row, when: Number.isNaN(t) ? 0 : t });
    }
  }
  // تاريخٌ مختلّ يعطي 0 فيهبط إلى الآخر بدل أن يسمّم الترتيب كلّه.
  return all.sort((a, b) => b.when - a.when);
}

export function filterInbox(items, { sourceId = 'all', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return items.filter(({ source, row }) => {
    if (sourceId !== 'all' && source.id !== sourceId) return false;
    if (!q) return true;
    // البحث يمرّ على الحقول المعلَنة في السجلّ وحدها — لا على كل
    // مفاتيح الصفّ، فلا يُطابَق معرّفٌ داخليّ أو رمز جلسة.
    return source.fields.some((f) => String(row[f.key] ?? '').toLowerCase().includes(q));
  });
}

// أول حالةٍ ينطبق شرطها. الترتيب في السجلّ مقصود: «طلب إعادة فتح»
// بعد «مُقدَّم» لأنه أخصّ منه — ومن طلب الفتح مُقدِّمٌ أيضاً.
export function statusOf(source, row) {
  for (const s of source.statuses || []) if (s.match(row)) return s;
  return null;
}

// العدّ لكل مصدر — يظهر على المرشِّحات.
export function countBySource(items) {
  const out = {};
  for (const it of items) out[it.source.id] = (out[it.source.id] || 0) + 1;
  return out;
}
