// ════════════════════════════════════════════════════════════════
// صندوق «ينتظرني»: كل ما ينتظر قرار الإدارة في قائمة واحدة، الأقدم أولًا
// ════════════════════════════════════════════════════════════════
// من admin.inbox (inbox.js على الخادم): تسعة أنواع بعمرها ووجهتها. الرقاقات تفلتر بالنوع، والمتأخر عن مهلة نوعه
// معلَّم. يُحدَّث مع كل حفظ يطلق «mi:pending» كعدّادات التبويبات.
import React, { useCallback, useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { navigate } from '../route.js';
import { Spinner } from '../ui.jsx';
import { ageAr, INBOX_KINDS } from '../../../supabase/functions/leaders-api/inbox.js';

export default function Inbox({ contacts = 0 }) {
  const [d, setD] = useState(null);
  const [kind, setKind] = useState('');
  const load = useCallback(() => L('admin.inbox').then(setD), []);
  useEffect(() => {
    load();
    window.addEventListener('mi:pending', load);
    return () => window.removeEventListener('mi:pending', load);
  }, [load]);
  if (!d) return <section className="la-card"><h3>ينتظرني</h3><Spinner /></section>;
  if (!d.success) return <section className="la-card"><h3>ينتظرني</h3><div className="la-err">{d.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></section>;
  // رد بلا قائمة (خادم أقدم من الواجهة) يُعامل كصندوق فارغ، لا كعطل في الصفحة
  const items = d.items || [], counts = d.counts || {}, total = d.total || 0;
  const shown = kind ? items.filter((i) => i.kind === kind) : items;
  const kinds = Object.keys(INBOX_KINDS).filter((k) => counts[k] > 0);
  const open = (i) => navigate({ ctx: 'leaders', tab: i.to.tab, id: i.to.id || undefined });
  return (
    <section className="la-card inbox" aria-labelledby="inbox-h">
      <div className="la-row between">
        <h3 id="inbox-h">ينتظرني <small className="la-muted">· {total}{d.late ? `، منها ${d.late} تجاوزت مهلتها` : ''}</small></h3>
      </div>
      {!total ? <p className="la-muted">لا شيء بانتظارك الآن.</p> : (
        <>
          <div className="la-pills" role="group" aria-label="نوع البند">
            <button type="button" className={`la-pill${!kind ? ' on' : ''}`} aria-pressed={!kind} onClick={() => setKind('')}>الكل <b>{total}</b></button>
            {kinds.map((k) => <button key={k} type="button" className={`la-pill${kind === k ? ' on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(kind === k ? '' : k)}>{INBOX_KINDS[k].label} <b>{counts[k]}</b></button>)}
          </div>
          <ul className="inbox-list">
            {shown.slice(0, 60).map((i) => (
              <li key={`${i.kind}-${i.id}`} className={i.late ? 'late' : ''}>
                <button type="button" className="la-link" onClick={() => open(i)}>{i.title || INBOX_KINDS[i.kind].label}</button>
                <span className={`la-chip ${i.late ? 'warn' : ''}`}>{i.kind_ar}</span>
                {i.sub && <small className="la-muted">{i.sub}</small>}
                <small className="inbox-age">{ageAr(i.days)}</small>
              </li>
            ))}
          </ul>
          {shown.length > 60 && <p className="la-muted small">يُعرض أقدم 60 من {shown.length}. اختر نوعًا لتضييق القائمة.</p>}
        </>
      )}
      {/* طلبات التواصل من دالة أخرى (admin-api): عددها من عدّاد السياق نفسه، وبابها شاشتها */}
      {contacts > 0 && <p className="inbox-contacts"><a className="la-link" href="#/contacts">طلبات تواصل جديدة من الموقع</a> <b>{contacts}</b></p>}
      {d.skipped?.length > 0 && <p className="la-muted small">تعذّرت قراءة: {d.skipped.map((k) => INBOX_KINDS[k]?.label || k).join('، ')}.</p>}
    </section>
  );
}
