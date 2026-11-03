// ════════════════════════════════════════════════════════════════
// الرعاية والتكلفة لجهة: المرعيون ومقاعدهم وقيمتهم المثبّتة وتقدّمهم، وكشف حساب للفوترة
// ════════════════════════════════════════════════════════════════
// المصدر admin.org-finance. القيمة لكل مشارك مثبّتة لحظة ربطه (تغيير سعر الجهة لا يعيد كتابتها)،
// ومن تجاوز المقاعد يُربط ويُعفى ويُعلَّم «فوق المقاعد» لقرار فوترة إضافية.
import React, { useCallback, useEffect, useState } from 'react';
import { csvText, date, download, L, STATUS, VIA } from '../leaders.js';
import { Spinner } from '../ui.jsx';

const money = (c) => (c == null ? '·' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);

export default function OrgFinance({ id, onPerson }) {
  const [d, setD] = useState(null);
  const load = useCallback(async () => setD(await L('admin.org-finance', { id })), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <section className="la-card"><Spinner /></section>;
  if (!d.success) return <section className="la-card"><p className="la-err">{d.message}</p></section>;
  const { org: o, kpis: k, rows } = d;
  const f = k.funnel;
  const statement = () => download(new Blob([csvText(
    ['المشارك', 'البريد', 'تاريخ الانضمام', 'طريقة الربط', 'القيمة (USD)', 'الحالة', 'شهادة', 'فوق المقاعد'],
    rows.map((r) => [r.full_name, r.email, String(r.joined).slice(0, 10), VIA[r.via] || r.via || '', r.value_cents == null ? '' : r.value_cents / 100, STATUS[r.status] || r.status, r.certified ? 'نعم' : '', r.over_seats ? 'نعم' : '']),
  )], { type: 'text/csv;charset=utf-8' }), `كشف-${o.name}-${new Date().toISOString().slice(0, 10)}.csv`);
  const pct = (n) => (f.registered ? `${Math.round((n / f.registered) * 100)}%` : '0%');
  return (
    <section className="la-card org-fin">
      <div className="la-row between">
        <h3>الرعاية والتكلفة</h3>
        <button className="btn-sm ghost" onClick={statement}>كشف حساب CSV</button>
      </div>
      <p className="la-muted small">
        السعر التعاقدي: <b dir="ltr">{o.contract_cents == null ? `${money(d.list_cents)} (المعلن)` : money(o.contract_cents)}</b> للمشارك
        {o.contract_starts || o.contract_ends ? ` · العقد ${o.contract_starts ? date(o.contract_starts) : '…'} إلى ${o.contract_ends ? date(o.contract_ends) : '…'}` : ''}
        {o.show_value === false ? ' · القيمة مخفية عن المشاركين' : ''}
      </p>
      <div className="pay-kpis">
        <span><b>{k.participants}{k.seats != null ? ` / ${k.seats}` : ''}</b>{k.seats != null ? 'مشارك من المقاعد' : 'مشارك مرعي'}</span>
        <span className={k.over ? 'warn' : ''}><b>{k.over}</b>فوق المقاعد</span>
        <span><b dir="ltr">{money(k.value_cents)}</b>القيمة المغطاة</span>
        <span><b dir="ltr">{money(k.per_participant)}</b>للمشارك الواحد</span>
        <span><b dir="ltr">{money(k.per_certified)}</b>لكل من أكمل بشهادة</span>
      </div>
      <div className="org-funnel" aria-label="تقدّم مشاركي الجهة">
        {[['سجّلوا', f.registered], ['أنهوا القياس', f.assessed], ['في الرحلة', f.journey], ['أكملوا بشهادة', f.certified]].map(([l, n]) => (
          <div key={l}><b>{n}</b><small>{l} · {pct(n)}</small><span style={{ width: pct(n) }} /></div>
        ))}
      </div>
      {rows.length > 0 && (
        <table className="la-table">
          <thead><tr><th>المشارك</th><th>انضم</th><th>الربط</th><th>القيمة</th><th>الحالة</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td><button className="la-link" onClick={() => onPerson?.(r.id)}>{r.full_name}</button>{r.over_seats && <span className="la-chip warn">فوق المقاعد</span>}</td>
              <td>{date(r.joined)}</td><td>{VIA[r.via] || r.via || '·'}</td><td dir="ltr">{money(r.value_cents)}</td>
              <td>{STATUS[r.status] || r.status}{r.certified && <span className="la-chip ok">شهادة</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
