// ════════════════════════════════════════════════════════════════
// طلبات التواصل: بطاقات مرشِّحة، بحث وفلاتر، جدول بصفحات يُتنقل فيه بالأسهم، ولوحة معاينة (درج على الهاتف)
// ════════════════════════════════════════════════════════════════
import { PageHeader } from '../PageHeader.jsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call, fmtDate } from '../api.js';
import { daysAr, relDate, riyadhFull, timeOnly } from '../dates.js';
import ExportButton from '../ExportButton.jsx';
import FilterBar, { FilterCards, SortTh, useFilters } from '../FilterBar.jsx';
import { awaitingDays, cardCounts, CONTACT_CARDS, CONTACT_FIELDS, CONTACT_KEYS, filterContacts, INTEREST_AR, interestShort, isLate, mailto, PAGE_SIZE, pageList, SOURCE_AR, sourceTone, STATUS_AR } from '../contacts.js';
import { Icon } from '../icons.jsx';
import { Empty, LoadError, NoMatch, SkeletonRows, useCopy, useEscape, useUI, useWide } from '../ui.jsx';
import { announceContacts } from '../pending.js';

// يبقى الطلب مفتوحًا هذه المدة قبل أن يُعلَّم مقروءًا: المرور بالأسهم لا يعلّم شيئًا ولا يرسل طلبًا لكل صف
export const READ_AFTER_MS = 1500;
const COLS = 6;

// زر نسخ بأيقونة ظاهرة دائمًا (في اللوحة وحدها). الإعلان «نُسخ البريد» دون عرض البريد
function CopyBtn({ text, what }) {
  const copy = useCopy();
  if (!text) return null;
  return (
    <button type="button" className="icon-btn" aria-label={`نسخ ${what}`} title={`نسخ ${what}`} onClick={() => copy(text, `نُسخ ${what}`, { reveal: false })}>
      <Icon name="copy" />
    </button>
  );
}

// وسم الانتظار: يظهر بعد المهلة لطلب لم يُرد عليه، بأيقونة ونص لا بلون وحده
function LateTag({ r }) {
  if (!isLate(r)) return null;
  return <span className="tag tag-warn"><Icon name="clock" size={13} />بانتظار الرد منذ {daysAr(awaitingDays(r))}</span>;
}

// تفاصيل الطلب: واحدة للوحة المعاينة على الشاشة العريضة وللدرج على الهاتف، والرسالة أولها
function Details({ r, onStatus }) {
  const { confirm } = useUI();
  const link = mailto(r);
  const reply = async () => {
    window.open(link, '_blank', 'noopener');
    if (r.status === 'replied') return;
    if (await confirm('هل أرسلت الرد؟', { ok: 'نعم، علّمه «تم الرد»' })) onStatus(r.id, 'replied');
  };
  return (
    <div className="drawer-body">
      <LateTag r={r} />
      <div className="detail-section">
        <div className="detail-section-title">الرسالة</div>
        {/* نص فقط: لا تتحول الروابط داخل الرسالة إلى روابط قابلة للنقر */}
        {r.message ? <div className="ct-msg" data-contact-message>{r.message}</div> : <p className="la-muted">لم يكتب رسالة.</p>}
      </div>
      <div className="detail-section">
        <div className="detail-section-title">بيانات المتواصل</div>
        <div className="detail-row"><span className="detail-key">الاسم</span><span className="detail-val">{r.name}</span></div>
        <div className="detail-row"><span className="detail-key">الجهة</span><span className="detail-val">{r.organization || '—'}</span></div>
        <div className="detail-row"><span className="detail-key">البريد</span><span className="detail-val ltr">{r.email} <CopyBtn text={r.email} what="البريد" /></span></div>
        <div className="detail-row"><span className="detail-key">الجوال</span><span className="detail-val ltr">{r.phone} <CopyBtn text={r.phone} what="الجوال" /></span></div>
      </div>
      <div className="detail-section">
        <div className="detail-section-title">تفاصيل الطلب</div>
        <div className="detail-row"><span className="detail-key">نوع الطلب</span><span className="detail-val">{INTEREST_AR[r.interest] || r.interest}</span></div>
        <div className="detail-row"><span className="detail-key">المصدر</span><span className="detail-val">{SOURCE_AR[r.product] || r.product || 'غير محدد'}</span></div>
        <div className="detail-row"><span className="detail-key">التاريخ</span><span className="detail-val">{fmtDate(r.created_at)}</span></div>
        {r.context && (
          <div className="ct-ctx">
            <div className="ct-ctx-l">السياق الإضافي</div>
            <div className="context-box">{r.context}</div>
          </div>
        )}
      </div>
      <div className="detail-section">
        <div className="detail-section-title">تغيير الحالة</div>
        <div className="status-changer">
          {Object.keys(STATUS_AR).map((s) => (
            <button key={s} type="button" className={`status-btn ${s}${r.status === s ? ' active' : ''}`} aria-pressed={r.status === s} onClick={() => onStatus(r.id, s)}>{STATUS_AR[s]}</button>
          ))}
        </div>
        {r.status !== 'new' && (
          <button type="button" className="flt-link ct-unread" onClick={() => onStatus(r.id, 'new', false, true)}><Icon name="unread" size={14} /> علّمه غير مقروء</button>
        )}
      </div>
      {link
        ? <button type="button" className="reply-btn" onClick={reply}><Icon name="mail" /> إرسال رد بالبريد</button>
        : <p className="la-muted">البريد غير صالح للرد المباشر، فانسخه وتحقق منه.</p>}
    </div>
  );
}

function Drawer({ r, onClose, onStatus }) {
  useEscape(onClose);
  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-label={`تفاصيل طلب ${r.name}`}>
        <div className="drawer-handle" />
        <div className="drawer-header">
          <div className="drawer-title-wrap"><div className="drawer-label">طلب تواصل</div><div className="drawer-title">{r.name}</div></div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="إغلاق"><Icon name="close" /></button>
        </div>
        <Details r={r} onStatus={onStatus} />
      </aside>
    </>
  );
}

// لوحة المعاينة بجوار القائمة على الشاشة العريضة: غير حاجبة، ولا تظهر إلا حين يُختار طلب
function Pane({ r, onClose, onStatus }) {
  useEscape(onClose, !!r);
  return (
    <aside className="ct-pane" aria-label={`معاينة طلب ${r.name}`}>
      <div className="ct-pane-h">
        <div className="drawer-title-wrap"><div className="drawer-label">طلب تواصل</div><div className="drawer-title">{r.name}</div></div>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="إغلاق المعاينة"><Icon name="close" /></button>
      </div>
      <Details r={r} onStatus={onStatus} />
    </aside>
  );
}

// أعمدة التصدير (الزر الموحد). البريد والجوال والرسالة حساسة: لا تُختار افتراضيًا، ويُنبَّه عند اختيارها
export const CONTACT_COLS = [
  { key: 'name', label: 'الاسم', width: 24, get: (r) => r.name }, { key: 'org', label: 'الجهة', width: 24, get: (r) => r.organization },
  { key: 'email', label: 'البريد', width: 30, get: (r) => r.email, sensitive: true }, { key: 'phone', label: 'الجوال', width: 16, get: (r) => r.phone, sensitive: true },
  { key: 'interest', label: 'نوع الطلب', width: 20, get: (r) => INTEREST_AR[r.interest] || r.interest },
  { key: 'source', label: 'المصدر', width: 16, get: (r) => SOURCE_AR[r.product] || r.product },
  { key: 'message', label: 'الرسالة', width: 60, get: (r) => r.message, sensitive: true }, { key: 'date', label: 'التاريخ', width: 20, get: (r) => fmtDate(r.created_at) },
  { key: 'status', label: 'الحالة', width: 12, get: (r) => STATUS_AR[r.status] || r.status },
];

export default function Contacts() {
  const { toast } = useUI();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(null);
  const [f, setF, clearF, replaceF] = useFilters(CONTACT_KEYS, {}, { scope: 'contacts' });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [live, setLive] = useState('');
  const wide = useWide();
  const tbody = useRef(null);
  const pendingFocus = useRef(null);   // 'first' | 'last' بعد تقليب الصفحة بالأسهم
  const markedRef = useRef(null);      // آخر طلب عُلّم (أو أُعيد غير مقروء) في هذا الفتح
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // التحميل الأول يعرض هيكل صفوف، والتحديث بعده في الخلفية: لا يمسح الصفوف ولا يغلق اللوحة
  const load = useCallback(async () => {
    setError('');
    setBusy(true);
    const res = await call('list-contacts');
    setBusy(false);
    if (!res.success) { setRows((r) => r || []); return setError(res.message || 'تعذّر تحميل البيانات'); }
    setRows(res.contacts || []);
    setUpdated(new Date());
  }, []);
  useEffect(() => { load(); }, [load]);
  // عدد الجديد على شارة السياق يتبع ما في الشاشة، ومنه تغيير الحالة
  useEffect(() => { if (rows) announceContacts(rows); }, [rows]);

  const all = rows || [];
  const list = useMemo(() => filterContacts(all, f), [all, f]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const counts = cardCounts(all);
  useEffect(() => { setPage(1); }, [f]);   // أي تغيير في الفلترة أو الفرز يعيد إلى الصفحة الأولى

  // تغيير الحالة: تحديث متفائل ثم تراجع إن فشل الخادم
  const setStatus = async (id, status, silent = false, force = false) => {
    const prev = all.find((r) => r.id === id)?.status;
    if (prev === status) return;
    if (force) markedRef.current = id;   // «غير مقروء» يدوي: لا يعيده المؤقت مقروءًا ما دام مفتوحًا
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    const res = await call('update-contact', { id, fields: { status } });
    if (!res.success) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: prev } : r)));
      return toast(res.message || 'خطأ في تحديث الحالة');
    }
    if (!silent) toast(`تم تغيير الحالة إلى: ${STATUS_AR[status]}`);
  };
  const opened = all.find((r) => r.id === openId);

  // التعليم بالمقروء مؤجل: بعد READ_AFTER_MS من بقاء الطلب مفتوحًا، ومرة واحدة لكل فتح
  useEffect(() => {
    if (!openId) return undefined;
    markedRef.current = null;
    const t = setTimeout(() => {
      const r = (rowsRef.current || []).find((x) => x.id === openId);
      if (r && r.status === 'new' && markedRef.current !== openId) { markedRef.current = openId; setStatus(openId, 'read', true); }
    }, READ_AFTER_MS);
    return () => clearTimeout(t);
  }, [openId]); // eslint-disable-line

  const focusRow = (id) => { setFocusId(id); requestAnimationFrame(() => tbody.current?.querySelector(`[data-ct-id="${CSS.escape(String(id))}"]`)?.focus()); };
  const open = (r) => { setOpenId(r.id); setFocusId(r.id); setLive(`الطلب ${r.name}${r.organization ? `، ${r.organization}` : ''}`); };
  const close = () => { const id = openId; setOpenId(null); if (id != null) focusRow(id); };

  // بعد تقليب الصفحة بالسهم: افتح أول صف أو آخره في الصفحة الجديدة
  useEffect(() => {
    if (!pendingFocus.current || !shown.length) return;
    const r = pendingFocus.current === 'first' ? shown[0] : shown[shown.length - 1];
    pendingFocus.current = null;
    open(r);
    if (wide) focusRow(r.id);   // على الضيق يفتح الدرج (حوار) ويأخذ التركيز، فلا نسحبه إلى صف خلفه
  }, [cur]); // eslint-disable-line

  // الأسهم (وj وk) تنقل بين الصفوف المعروضة وتفتح ما تصل إليه، وتقلب الصفحة عند الحدود
  const onKey = (e) => {
    if (!wide || e.altKey || e.ctrlKey || e.metaKey || !e.target.matches?.('.ct-open')) return;   // التنقل بالأسهم للوحة المعاينة وحدها
    const down = e.key === 'ArrowDown' || e.key === 'j';
    const up = e.key === 'ArrowUp' || e.key === 'k';
    if (!down && !up) return;
    e.preventDefault();
    const i = shown.findIndex((r) => String(r.id) === e.target.dataset.ctId);
    const j = i < 0 ? 0 : i + (down ? 1 : -1);
    if (j >= shown.length) { if (cur < pages) { pendingFocus.current = 'first'; setPage(cur + 1); } return; }
    if (j < 0) { if (cur > 1) { pendingFocus.current = 'last'; setPage(cur - 1); } return; }
    open(shown[j]);
    focusRow(shown[j].id);
  };
  // الصف ذو التركيز الدائر: المختار، أو أول صف ظاهر
  const tabId = shown.some((r) => r.id === focusId) ? focusId : shown[0]?.id;

  const firstLoad = !rows;
  return (
    <div className="dash-body">
      <PageHeader eyebrow="الوارد من الموقع" title="طلبات التواصل" desc="جميع الطلبات الواردة من المنظومة"
        actions={<div className="last-updated">{updated ? `آخر تحديث: ${timeOnly(updated)}` : '—'}</div>} />

      <FilterCards cards={CONTACT_CARDS} field="status" state={f} set={setF} counts={counts} loading={firstLoad} label="ترشيح بالحالة" clearLabel="عرض الكل" total={all.length} />

      <FilterBar scope="contacts" state={f} set={setF} clear={clearF} replace={replaceF} fields={CONTACT_FIELDS}
        shown={list.length} total={all.length} noun="طلب" placeholder="بحث بالاسم أو البريد أو الجهة..."
        actions={<>
          <ExportButton scope="contacts" meta={{ kind: 'CNT', title: 'طلبات التواصل', sheet: 'الطلبات', file: 'Contacts' }} columns={CONTACT_COLS} all={all} filtered={list} noun="طلب" />
          <button className="refresh-btn" type="button" onClick={load} aria-busy={busy} disabled={busy}>
            <Icon name="refresh" className={busy ? 'ico-spin' : ''} /> {busy && !firstLoad ? 'جارٍ التحديث…' : 'تحديث'}
          </button>
        </>} />

      {error && <LoadError message={error} onRetry={load} stale={all.length > 0} />}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{live}</div>

      <div className={wide && opened ? 'ct-split' : undefined}>
      <div className="table-wrap" aria-busy={busy}>
        <table className="data-table t24 ct-table">
          <thead><tr><SortTh k="name" state={f} set={setF}>الاسم</SortTh><SortTh k="org" state={f} set={setF}>الجهة</SortTh><th scope="col">نوع الطلب</th><th scope="col">المصدر</th><SortTh k="date" state={f} set={setF}>التاريخ</SortTh><SortTh k="status" state={f} set={setF}>الحالة</SortTh></tr></thead>
          <tbody ref={tbody} onKeyDown={onKey}>
            {firstLoad ? <SkeletonRows rows={6} cols={COLS} />
              : !list.length ? (
                error ? null : <tr><td colSpan={COLS}>{all.length ? <NoMatch what="طلبات" /> : <Empty compact title="لا طلبات تواصل بعد" hint="يظهر هنا كل طلب يصل من الموقع أو صفحة القادة أو مقياس الجاهزية." />}</td></tr>
              ) : shown.map((r) => {
                const isNew = r.status === 'new';
                return (
                  <tr key={r.id} className={`${r.id === openId ? 'ct-on' : ''}${isNew ? ' ct-new' : ''}`} onClick={() => open(r)}>
                    <td>
                      {/* الفتح بزر صريح (لا صف بدور زر)، بتركيز دائر: Tab يدخل الجدول مرة والأسهم تتنقل داخله */}
                      <button type="button" className="ct-open" data-ct-id={r.id} tabIndex={r.id === tabId ? 0 : -1} aria-current={r.id === openId ? 'true' : undefined}
                        onClick={(e) => { e.stopPropagation(); open(r); }}>
                        {isNew && <span className="ct-dot" aria-hidden="true" />}{isNew && <span className="sr-only">جديد: </span>}{r.name}
                      </button>
                    </td>
                    <td className="ct-org">{r.organization || '—'}</td>
                    <td><span className="interest-badge" title={INTEREST_AR[r.interest] || undefined}>{interestShort(r.interest)}</span></td>
                    <td><span className={`source-badge ${sourceTone(r.product)}`}>{SOURCE_AR[r.product] || r.product || 'غير محدد'}</span></td>
                    <td className="ct-date"><time dateTime={r.created_at} title={riyadhFull(r.created_at)}>{relDate(r.created_at)}</time><span className="sr-only"> ({riyadhFull(r.created_at)})</span></td>
                    <td><span className={`status-badge ${r.status}`}>{STATUS_AR[r.status] || r.status}</span>{isLate(r) && <span className="tag tag-warn tag-sm" title={`بانتظار الرد منذ ${daysAr(awaitingDays(r))}`}><Icon name="clock" size={12} /><span aria-hidden="true">{daysAr(awaitingDays(r))}</span><span className="sr-only">بانتظار الرد منذ {daysAr(awaitingDays(r))}</span></span>}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {pages > 1 && (
          <nav className="pagination" aria-label="الصفحات">
            <span>{(cur - 1) * PAGE_SIZE + 1}–{Math.min(cur * PAGE_SIZE, list.length)} من {list.length}</span>
            <div className="page-btns">
              <button type="button" className="page-btn" disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label="السابقة"><Icon name="chevron" className="ico-prev" /></button>
              {pageList(cur, pages).map((p, i) => (p === '…'
                ? <span key={`g${i}`} className="page-gap">…</span>
                : <button type="button" key={p} className={`page-btn${p === cur ? ' active' : ''}`} aria-current={p === cur ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>))}
              <button type="button" className="page-btn" disabled={cur === pages} onClick={() => setPage(cur + 1)} aria-label="التالية"><Icon name="chevron" className="ico-next" /></button>
            </div>
          </nav>
        )}
      </div>
      {wide && opened && <Pane r={opened} onClose={close} onStatus={setStatus} />}
      </div>

      {opened && !wide && <Drawer r={opened} onClose={close} onStatus={setStatus} />}
    </div>
  );
}
