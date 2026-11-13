// ════════════════════════════════════════════════════════════════
// الرعاية والتكلفة لجهة: المرعيون ومقاعدهم وقيمتهم المثبّتة وتقدّمهم، وكشف حساب للفوترة
// ════════════════════════════════════════════════════════════════
// المصدر admin.org-finance. القيمة لكل مشارك مثبّتة لحظة ربطه (تغيير سعر الجهة لا يعيد كتابتها)،
// ومن تجاوز المقاعد يُربط ويُعفى ويُعلَّم «فوق المقاعد» لقرار فوترة إضافية.
import React, { useCallback, useEffect, useState } from 'react';
import { date, L, STATUS, VIA } from '../leaders.js';
import ExportButton from '../ExportButton.jsx';
import { Spinner } from '../ui.jsx';

// العملة من الخادم: عملة التثبيت لقيم الجهة (المصدر admin.org-finance)، لا رمز ثابت
const moneyIn = (currency) => (c) => (c == null ? '·' : `${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency || 'USD'}`);

export default function OrgFinance({ id, onPerson }) {
  const [d, setD] = useState(null);
  const load = useCallback(async () => setD(await L('admin.org-finance', { id })), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <section className="la-card"><Spinner /></section>;
  if (!d.success) return <section className="la-card"><p className="la-err">{d.message}</p></section>;
  const { org: o, kpis: k, rows } = d;
  const money = moneyIn(d.currency);
  const f = k.funnel;
  const statementCols = [
    { key: 'name', label: 'المشارك', width: 26, get: (r) => r.full_name }, { key: 'email', label: 'البريد', width: 30, get: (r) => r.email },
    { key: 'joined', label: 'تاريخ الانضمام', width: 16, get: (r) => date(r.joined) }, { key: 'via', label: 'طريقة الربط', width: 18, get: (r) => VIA[r.via] || r.via },
    { key: 'value', label: `القيمة (${d.currency || 'USD'})`, width: 14, get: (r) => (r.value_cents == null ? '' : r.value_cents / 100) },
    { key: 'status', label: 'الحالة', width: 18, get: (r) => STATUS[r.status] || r.status }, { key: 'cert', label: 'شهادة', width: 8, get: (r) => !!r.certified },
    { key: 'over', label: 'فوق المقاعد', width: 12, get: (r) => !!r.over_seats },
  ];
  const pct = (n) => (f.registered ? `${Math.round((n / f.registered) * 100)}%` : '0%');
  return (
    <section className="la-card org-fin">
      <div className="la-row between">
        <h3>الرعاية والتكلفة</h3>
        <ExportButton scope="org-statement" className="btn-sm ghost" label="كشف حساب Excel" meta={{ kind: 'FIN', title: `كشف حساب ${o.name}`, for: o.name, sheet: 'كشف الحساب', file: 'Statement', code: o.invite_code }} columns={statementCols} all={rows} noun="مشارك" />
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
