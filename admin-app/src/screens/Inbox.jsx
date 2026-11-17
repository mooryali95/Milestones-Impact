// ════════════════════════════════════════════════════════════════
// صندوق «ينتظرني»: كل ما ينتظر قرار الإدارة في قائمة واحدة، الأقدم أولًا
// ════════════════════════════════════════════════════════════════
// من admin.inbox (inbox.js على الخادم): تسعة أنواع بعمرها ووجهتها. الرقاقات تفلتر بالنوع، والمتأخر عن مهلة نوعه
// معلَّم. رده هو رد عدّادات التبويبات نفسه (pending.js، «العدّ الواحد»)، فلا يختلف عدّاد عن الصندوق.
// «اعتمد الجاهزين»: نافذة BulkApprove نفسها على المنتظرين الأقدم أولًا، ومعاينتها على الخادم تعطي «7 جاهزون، 5 تحتاج نظرك».
import React, { useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { formatRoute, navigate } from '../route.js';
import { refreshPending, useInbox } from '../pending.js';
import { Spinner } from '../ui.jsx';
import BulkApprove from './BulkApprove.jsx';
import { askOpen } from './Erasure.jsx';
import { ageAr, approvalIdsOf, INBOX_KINDS, readyLineAr } from '../../../supabase/functions/leaders-api/inbox.js';
import { BULK_APPROVE_MAX } from '../../../supabase/functions/leaders-api/approval.js';
import { INBOX_VIEWS, inboxView } from '../today.js';

// view: عرض تقود إليه أرقام مكتب اليوم («المتجاوز للمهلة» أو «المنتظر منذ أكثر من 7 أيام»)، فلتر فوق فلتر النوع.
// بلا view يبقى الصندوق كما كان؛ onView يمسحه («اعرض الكل»)
export default function Inbox({ contacts = 0, canWrite, onPerson, view = '', onView }) {
  // الرد من مخزن العدّادات نفسه (pending.js): طلب واحد لـ admin.inbox يرسم الصندوق وعدّادات التبويبات معًا،
  // ويُحدَّث معها (كل دقيقتين والصفحة ظاهرة، وفور «mi:pending»)
  const [d, load] = useInbox();
  const [kind, setKind] = useState('');
  const [bulk, setBulk] = useState(null);
  const [ready, setReady] = useState(null);
  // معاينة الاعتماد الجماعي للعدّ وحده (dry_run لا يكتب شيئًا): للمدير الذي يكتب، وتعذّرها يُبقي الزر بلا عدد
  const ids = canWrite !== false && d?.success ? approvalIdsOf(d.items, BULK_APPROVE_MAX) : [];
  const idsKey = ids.join(',');
  useEffect(() => {
    setReady(null);
    if (!idsKey) return;
    let live = true;
    L('admin.approve-bulk', { participant_ids: idsKey.split(','), dry_run: true }).then((r) => live && r.success && setReady({ ready: r.ready.length, held: r.held.length }));
    return () => { live = false; };
  }, [idsKey]);
  if (!d) return <section className="la-card"><h3>ينتظرني</h3><Spinner /></section>;
  if (!d.success) return <section className="la-card"><h3>ينتظرني</h3><div className="la-err">{d.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></section>;
  // رد بلا قائمة (خادم أقدم من الواجهة) يُعامل كصندوق فارغ، لا كعطل في الصفحة
  const items = d.items || [], counts = d.counts || {}, total = d.total || 0;
  const shown = inboxView(kind ? items.filter((i) => i.kind === kind) : items, view);
  const kinds = Object.keys(INBOX_KINDS).filter((k) => counts[k] > 0);
  const open = (i) => {
    const to = { ctx: 'leaders', tab: i.to.tab, id: i.to.id || undefined };
    // طلب الحذف يفتح ملفه وورقة الطلب فوقه مباشرة
    if (i.kind === 'erasure' && i.to.id) askOpen(i.to.id);
    // وجهة بعرض مصفّى (طلب خبير بلا مطابق ← الخبراء بعرض «يحتاج تدخلًا»): العرض بعد «?» كفلاتر الشاشات
    if (i.to.query) window.location.hash = `${formatRoute(to)}?${i.to.query}`;
    else navigate(to);
  };
  const pendingN = counts.approval || 0;
  return (
    <section className="la-card inbox" aria-labelledby="inbox-h">
      <div className="la-row between">
        <h3 id="inbox-h">ينتظرني <small className="la-muted">· {total}{d.late ? `، منها ${d.late} تجاوزت مهلتها` : ''}</small></h3>
        {ids.length > 0 && (
          <div className="inbox-bulk">
            {/* لا جاهز في المعاينة: الزر ثانوي يفتح المراجعة، لا وعد باعتماد لا يقع */}
            <button type="button" className={`btn-sm ${ready && !ready.ready ? 'ghost' : 'primary'}`} onClick={() => setBulk(ids)} title="يُعتمد المتسق بمستواه المحسوب، ويُستبقى من عليه إشارة لتراجعه من ملفه">
              {ready && !ready.ready ? 'راجع المنتظرين…' : `اعتمد الجاهزين${ready?.ready ? ` (${ready.ready})` : ''}…`}
            </button>
            <small className="la-muted">{ready ? readyLineAr(ready.ready, ready.held) : `${pendingN} بانتظار الاعتماد`}{pendingN > ids.length ? ` · من أقدم ${ids.length} منتظرًا` : ''}</small>
          </div>
        )}
      </div>
      {bulk && <BulkApprove ids={bulk} onPerson={(id) => (onPerson ? onPerson(id) : navigate({ ctx: 'leaders', tab: 'participants', id }))} onClose={(changed) => { setBulk(null); if (changed) refreshPending(); }} />}
      {!total ? <p className="la-muted">لا شيء بانتظارك الآن.</p> : (
        <>
          <div className="la-pills" role="group" aria-label="نوع البند">
            <button type="button" className={`la-pill${!kind ? ' on' : ''}`} aria-pressed={!kind} onClick={() => setKind('')}>الكل <b>{total}</b></button>
            {kinds.map((k) => <button key={k} type="button" className={`la-pill${kind === k ? ' on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(kind === k ? '' : k)}>{INBOX_KINDS[k].label} <b>{counts[k]}</b></button>)}
          </div>
          {INBOX_VIEWS[view] && (
            <p className="inbox-view" role="status">يُعرض {INBOX_VIEWS[view].label} وحده ({shown.length}). {onView && <button type="button" className="la-link" onClick={() => onView('')}>اعرض الكل</button>}</p>
          )}
          <ul className="inbox-list">
            {shown.slice(0, 60).map((i) => (
              <li key={`${i.kind}-${i.id}`} className={i.late ? 'late' : i.soon ? 'soon' : ''}>
                <button type="button" className="la-link" onClick={() => open(i)}>{i.title || INBOX_KINDS[i.kind].label}</button>
                <span className={`la-chip ${i.late ? 'bad' : i.soon ? 'warn' : ''}`}>{i.kind_ar}{i.late ? ' · متأخر' : i.soon ? ' · قريب' : ''}</span>
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
