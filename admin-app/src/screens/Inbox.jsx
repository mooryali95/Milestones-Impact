// ════════════════════════════════════════════════════════════════
// صندوق «ينتظرني»: كل ما ينتظر قرار الإدارة في قائمة واحدة، الأقدم أولًا
// ════════════════════════════════════════════════════════════════
// من admin.inbox (inbox.js على الخادم): تسعة أنواع بعمرها ووجهتها. الرقاقات تفلتر بالنوع، والمتأخر عن مهلة نوعه
// معلَّم. رده هو رد عدّادات التبويبات نفسه (pending.js، «العدّ الواحد»)، فلا يختلف عدّاد عن الصندوق.
// «اعتمد الجاهزين»: نافذة BulkApprove نفسها على المنتظرين الأقدم أولًا، ومعاينتها على الخادم تعطي «7 جاهزون، 5 تحتاج نظرك»؛ ولا جاهز: «راجع طلبات الاعتماد (5)…» بلا سطر ثانٍ.
import React, { useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import { formatRoute, navigate } from '../route.js';
import { refreshPending, useInbox } from '../pending.js';
import BulkApprove from './BulkApprove.jsx';
import { askOpen } from './Erasure.jsx';
import { ageAr, approvalIdsOf, INBOX_KINDS, readyLineAr } from '../../../supabase/functions/leaders-api/inbox.js';
import { BULK_APPROVE_MAX } from '../../../supabase/functions/leaders-api/approval.js';
import { INBOX_VIEWS, inboxView } from '../today.js';

// view: عرض تقود إليه أرقام مكتب اليوم («المتجاوز للمهلة» أو «المنتظر منذ أكثر من 7 أيام»)، فلتر فوق فلتر النوع.
// بلا view يبقى الصندوق كما كان؛ onView يمسحه («اعرض الكل»)
// طلبات المتطلبات (النوع requirement) تُعتمد هنا دفعة واحدة: معرّف البند «المشارك:المتطلب» (admin.ts inbox)، وكل اعتماد
// يمر بـ admin.review نفسه الذي كان في طابور المتطلبات (يُسجَّل ويُبلَّغ المشارك)، واحدًا تلو الآخر، للمدير ذي الكتابة وحده.
// انتقل من «طابور المتطلبات» المحذوف (تصور تبويبات الإدارة 2026-11-24) فلا تضيع القدرة ولا يتكرر البند في مكانين
export const reqKey = (i) => { const [participant_id, requirement_id] = String(i.id).split(':'); return { participant_id, requirement_id }; };

const reqName = (i) => `${i.title}${i.sub ? ` (${i.sub})` : ''}`;
const namesAr = (list, max = 3) => list.slice(0, max).map(reqName).join('، ') + (list.length > max ? ` و${list.length - max} غيرها` : '');
// التأكيد يسمّي من يُعتمد له: أول ثلاثة والعدد
export const reqConfirmAr = (list) => `اعتماد ${list.length} من المتطلبات: ${namesAr(list)}؟ يصل كل مشارك بريد باعتماد متطلبه.`;
// النتيجة تسمّي ما لم يُحفظ
export const reqDoneAr = (n, failed) => (!failed.length ? `اعتُمد ${n}` : `اعتُمد ${n - failed.length} من ${n}، ولم يُحفظ: ${namesAr(failed)}`);

export default function Inbox({ contacts = 0, canWrite, onPerson, view = '', onView }) {
  // الرد من مخزن العدّادات نفسه (pending.js): طلب واحد لـ admin.inbox يرسم الصندوق وعدّادات التبويبات معًا،
  // ويُحدَّث معها (كل دقيقتين والصفحة ظاهرة، وفور «mi:pending»)
  const [d, load] = useInbox();
  const [kind, setKind] = useState('');
  const [bulk, setBulk] = useState(null);
  const [ready, setReady] = useState(null);
  const { toast, confirm } = useUI();
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  // تغيير النوع أو العرض يمسح التحديد: لا يُعتمد ما لم يعد ظاهرًا
  useEffect(() => { setPicked(new Set()); }, [kind, view]);
  // دليل المتطلب من مصدر طابور المتطلبات نفسه (admin.reviews › submitted.evidence_path)، يُطلب حين يكون في الصندوق متطلب
  const [evidence, setEvidence] = useState({});
  // حالة تحميل الأدلة: تعذّرها يُقال بسطر وزر إعادة، ويعطّل الاعتماد الجماعي حتى تُحمَّل، فلا يُعتمد متطلب لم تُر أدلته
  // (تصور المرحلة 1، البند 3). كان معالج الخطأ فارغًا فتختفي الروابط بصمت
  const [evidenceState, setEvidenceState] = useState('loading');
  const [evidenceTry, setEvidenceTry] = useState(0);
  const hasReq = canWrite !== false && !!d?.success && (d.items || []).some((i) => i.kind === 'requirement');
  useEffect(() => {
    if (!hasReq) return undefined;
    let live = true;
    const failed = () => live && setEvidenceState('failed');
    L('admin.reviews', {}).then((r) => {
      if (!live) return;
      if (!r?.success) { failed(); return; }
      setEvidence(Object.fromEntries((r.submitted || []).filter((x) => x.evidence_path).map((x) => [`${x.participant_id}:${x.requirement_id}`, x.evidence_path])));
      setEvidenceState('ok');
    }, failed);
    return () => { live = false; };
  }, [hasReq, d, evidenceTry]);
  // «أعد مع ملاحظة»: الإعادة بكلفة الاعتماد نفسها، بملاحظة إلزامية تصل المشارك (admin.review بحالة returned)
  const [ret, setRet] = useState(null);
  // الدليل يُفتح بطلب صريح يُسجَّل (admin.evidence-url)، للمدير وحده
  const openEvidence = async (i) => {
    const r = await L('admin.evidence-url', { participant_id: reqKey(i).participant_id, path: evidence[i.id] });
    if (r.success) window.open(r.url, '_blank', 'noopener'); else toast(r.message);
  };
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
  const writer = canWrite !== false;
  const reqShown = shown.slice(0, 60).filter((i) => i.kind === 'requirement');
  // الاعتماد على المحدد الظاهر وحده (تقاطع التحديد مع المعروض)
  const pickedReq = reqShown.filter((i) => picked.has(i.id));
  const allReq = reqShown.length > 0 && reqShown.every((i) => picked.has(i.id));
  const togglePick = (id) => setPicked((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const approveReqs = async () => {
    const list = pickedReq;
    if (!list.length || !(await confirm(reqConfirmAr(list)))) return;
    const failed = [];
    try {
      for (const [n, i] of list.entries()) {
        setBusy(`${n + 1}/${list.length}`);
        const r = await L('admin.review', { ...reqKey(i), status: 'done' }).catch(() => null);
        if (!r?.success) failed.push(i);
      }
    } finally {
      // الفاشل يبقى محددًا لإعادة المحاولة، ويُمسح الناجح وحده
      setBusy(null); setPicked(new Set(failed.map((i) => i.id)));
      refreshPending();
    }
    toast(reqDoneAr(list.length, failed));
  };
  const sendReturn = async () => {
    const note = ret?.note.trim();
    if (!note) return;
    setRet({ ...ret, busy: true });
    const r = await L('admin.review', { ...reqKey({ id: ret.id }), status: 'returned', note }).catch(() => null);
    if (!r?.success) { setRet({ ...ret, busy: false }); toast(r?.message || 'تعذّرت الإعادة، حاول مرة أخرى'); return; }
    setRet(null);
    setPicked((x) => { const n = new Set(x); n.delete(ret.id); return n; });
    toast('أُعيد المتطلب للمشارك بملاحظتك');
    refreshPending();
  };
  return (
    <section className="la-card inbox" aria-labelledby="inbox-h">
      <div className="la-row between">
        <h3 id="inbox-h">ينتظرني <small className="la-muted">· {total}{d.late ? `، منها ${d.late} تجاوزت مهلتها` : ''}</small></h3>
        {ids.length > 0 && (
          <div className="inbox-bulk">
            {/* لا جاهز في المعاينة: الزر ثانوي يفتح المراجعة، لا وعد باعتماد لا يقع */}
            {/* عدد واحد لكل مجموعة (ملاحظة المالك 2026-11-24): العنوان يعدّ كل ما في الصندوق، والزر يسمي مجموعته هو
                (طلبات اعتماد المسار وحدها) بعددها، فلا رقمان بلا اسم بجوار بعضهما */}
            <button type="button" className={`btn-sm ${ready && !ready.ready ? 'ghost' : 'primary'}`} onClick={() => setBulk(ids)} title="يُعتمد المتسق بمستواه المحسوب، ويُستبقى من عليه إشارة لتراجعه من ملفه">
              {ready && !ready.ready ? `راجع طلبات الاعتماد (${ready.held})…` : `اعتمد الجاهزين${ready?.ready ? ` (${ready.ready})` : ''}…`}
            </button>
            {(() => {
              const line = !ready ? `${pendingN} بانتظار الاعتماد` : ready.ready ? readyLineAr(ready.ready, ready.held) : '';
              const more = pendingN > ids.length ? `من أقدم ${ids.length} منتظرًا` : '';
              const txt = [line, more].filter(Boolean).join(' · ');
              return txt ? <small className="la-muted">{txt}</small> : null;
            })()}
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
          {writer && reqShown.length > 0 && (
            <div className="la-row inbox-req" role="group" aria-label="اعتماد المتطلبات">
              <label className="la-check"><input type="checkbox" checked={allReq} onChange={() => setPicked(allReq ? new Set() : new Set(reqShown.map((i) => i.id)))} /> <span>حدد المتطلبات المعروضة ({reqShown.length})</span></label>
              <button type="button" className="btn-sm primary" disabled={!pickedReq.length || !!busy || evidenceState !== 'ok'} onClick={approveReqs}>{busy ? `جارٍ الاعتماد ${busy}` : `اعتمد المحدد${pickedReq.length ? ` (${pickedReq.length})` : ''}`}</button>
            </div>
          )}
          {writer && reqShown.length > 0 && evidenceState === 'failed' && (
            <p className="la-err" role="alert">تعذّر تحميل الأدلة، فالاعتماد الجماعي معطّل حتى تُحمَّل. <button type="button" className="btn-sm ghost" onClick={() => { setEvidenceState('loading'); setEvidenceTry((n) => n + 1); }}>أعد المحاولة</button></p>
          )}
          <ul className="inbox-list">
            {shown.slice(0, 60).map((i) => (
              <li key={`${i.kind}-${i.id}`} className={i.late ? 'late' : i.soon ? 'soon' : ''}>
                {writer && i.kind === 'requirement' && <input type="checkbox" aria-label={`تحديد ${i.sub || 'المتطلب'} لـ ${i.title}`} checked={picked.has(i.id)} onChange={() => togglePick(i.id)} />}
                <button type="button" className="la-link" onClick={() => open(i)}>{i.title || INBOX_KINDS[i.kind].label}</button>
                <span className={`la-chip ${i.late ? 'bad' : i.soon ? 'warn' : ''}`}>{i.kind_ar}{i.late ? ' · متأخر' : i.soon ? ' · قريب' : ''}</span>
                {i.sub && <small className="la-muted">{i.sub}</small>}
                {i.kind === 'requirement' && evidence[i.id] && <button type="button" className="la-link" onClick={() => openEvidence(i)}>الدليل</button>}
                {writer && i.kind === 'requirement' && ret?.id !== i.id && <button type="button" className="la-link" disabled={!!busy} onClick={() => setRet({ id: i.id, note: '' })}>أعد مع ملاحظة</button>}
                <small className="inbox-age">{ageAr(i.days)}</small>
                {ret?.id === i.id && (
                  <div className="inbox-return">
                    <textarea rows={2} maxLength={1000} aria-label={`ملاحظة للمشارك ${i.title} عن ${i.sub || 'المتطلب'}`} placeholder="ما الذي يصححه المشارك؟ تصله ملاحظتك بالبريد" value={ret.note} onChange={(e) => setRet({ ...ret, note: e.target.value })} />
                    <button type="button" className="btn-sm primary" disabled={!ret.note.trim() || !!ret.busy} onClick={sendReturn}>أرسل الإعادة</button>
                    <button type="button" className="btn-sm ghost" disabled={!!ret.busy} onClick={() => setRet(null)}>إلغاء</button>
                  </div>
                )}
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
