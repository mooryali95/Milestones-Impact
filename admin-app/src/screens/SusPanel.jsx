// ════════════════════════════════════════════════════════════════
// نتائج استبيان سهولة الاستخدام SUS لكل دور، وما بقي لبوابة م4
// ════════════════════════════════════════════════════════════════
// لا تظهر قبل نشر الدالة وتطبيق ترحيلها (admin.sus يرد ready: false أو يفشل).
import React, { useEffect, useState } from 'react';
import { L, date } from '../leaders.js';

export default function SusPanel() {
  const [d, setD] = useState(null);
  useEffect(() => { let live = true; L('admin.sus').then((r) => live && setD(r)).catch(() => {}); return () => { live = false; }; }, []);
  if (!d?.success || !d.ready) return null;
  const s = d.summary;
  return (
    <section className="la-card" aria-labelledby="sus-h">
      <h3 id="sus-h">سهولة الاستخدام (SUS)</h3>
      <p className="small" style={{ color: 'var(--ink-soft)' }}>يُعرض الاستبيان لكل مستخدم بعد أسبوع من أول استعمال. البوابة: {s.min_n} مجيبين على الأقل في كل دور، ومتوسط فوق {s.target}.</p>
      <table className="la-table">
        <thead><tr><th>الدور</th><th>المجيبون</th><th>المتوسط</th><th>الوسيط</th><th>البوابة</th></tr></thead>
        <tbody>{s.roles.map((r) => (
          <tr key={r.role}><td>{r.role_ar}</td><td>{r.n}</td><td>{r.mean ?? '·'}</td><td>{r.median ?? '·'}</td>
            <td><span className={`la-chip ${r.met ? 'ok' : 'warn'}`}>{r.met ? 'مجتازة' : r.n < s.min_n ? `بقي ${s.min_n - r.n}` : 'دون الهدف'}</span></td></tr>
        ))}</tbody>
      </table>
      {d.comments.length > 0 && (
        <details><summary>ملاحظات المجيبين ({d.comments.length})</summary>
          <ul>{d.comments.map((c, i) => <li key={i}>«{c.comment}» <small>· {s.roles.find((r) => r.role === c.role)?.role_ar} · {date(c.at)}</small></li>)}</ul>
        </details>
      )}
    </section>
  );
}
