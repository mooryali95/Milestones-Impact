// ════════════════════════════════════════════════════════════════
// طلبات التواصل: إحصاءات، بحث وفلاتر، جدول بصفحات، ودرج التفاصيل
// ════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Ico from '../../../shared/ui/Ico.jsx';
import { call, fmtDate } from '../api.js';
import { countBy, filterContacts, INTEREST_AR, mailto, PAGE_SIZE, pageList, SOURCE_AR, STATUS_AR } from '../contacts.js';
import { Spinner, useEscape, useUI } from '../ui.jsx';
import { announceContacts } from '../pending.js';

function Copy({ text }) {
  const { toast } = useUI();
  if (!text) return null;
  return (
    <button className="copy-btn" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text).then(() => toast('تم النسخ ✓'), () => toast('تعذّر النسخ')); }}>نسخ</button>
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
          <div className="drawer-title-wrap"><div className="drawer-label">تفاصيل الطلب</div><div className="drawer-title">{r.name}</div></div>
          <button className="drawer-close" onClick={onClose} aria-label="إغلاق">✕</button>
        </div>
        <div className="drawer-body">
          <div className="detail-section">
            <div className="detail-section-title">بيانات المتواصل</div>
            <div className="detail-row"><span className="detail-key">الاسم</span><span className="detail-val">{r.name}</span></div>
            <div className="detail-row"><span className="detail-key">الجهة</span><span className="detail-val">{r.organization}</span></div>
            <div className="detail-row"><span className="detail-key">البريد</span><span className="detail-val" style={{ direction: 'ltr' }}>{r.email} <Copy text={r.email} /></span></div>
            <div className="detail-row"><span className="detail-key">الجوال</span><span className="detail-val" style={{ direction: 'ltr' }}>{r.phone} <Copy text={r.phone} /></span></div>
          </div>
          <div className="detail-section">
            <div className="detail-section-title">تفاصيل الطلب</div>
            <div className="detail-row"><span className="detail-key">نوع الطلب</span><span className="detail-val">{INTEREST_AR[r.interest] || r.interest}</span></div>
            <div className="detail-row"><span className="detail-key">المصدر</span><span className="detail-val">{r.product === 'MI-HOME' ? 'الصفحة الرئيسية' : 'صفحة القادة'}</span></div>
            <div className="detail-row"><span className="detail-key">التاريخ</span><span className="detail-val">{fmtDate(r.created_at)}</span></div>
            {r.context && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: '.78rem', color: 'var(--ink-light)', marginBottom: 6 }}>السياق الإضافي</div>
                <div className="context-box">{r.context}</div>
              </div>
            )}
          </div>
          <div className="detail-section">
            <div className="detail-section-title">تغيير الحالة</div>
            <div className="status-changer">
              {Object.keys(STATUS_AR).map((s) => (
                <button key={s} className={`status-btn ${s}${r.status === s ? ' active' : ''}`} aria-pressed={r.status === s} onClick={() => onStatus(r.id, s)}>{STATUS_AR[s]}</button>
              ))}
            </div>
          </div>
          <button className="reply-btn" onClick={() => { window.open(mailto(r), '_blank'); onStatus(r.id, 'replied'); }}>✉ إرسال رد بالبريد</button>
        </div>
      </aside>
    </>
  );
}

export default function Contacts() {
  const { toast } = useUI();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);
  const [f, setF] = useState({ q: '', status: '', source: '' });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setError('');
    setRows(null);
    const res = await call('list-contacts');
    if (!res.success) { setRows([]); return setError(res.message || 'تعذّر تحميل البيانات'); }
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
  const n = countBy(all);
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };

  // تغيير الحالة: تحديث متفائل ثم تراجع إن فشل الخادم
  const setStatus = async (id, status, silent = false) => {
    const prev = all.find((r) => r.id === id)?.status;
    if (prev === status) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    const res = await call('update-contact', { id, fields: { status } });
    if (!res.success) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: prev } : r)));
      return toast(res.message || 'خطأ في تحديث الحالة');
    }
    if (!silent) toast(`تم تغيير الحالة إلى: ${STATUS_AR[status]}`);
  };
  const open = (r) => { setOpenId(r.id); if (r.status === 'new') setStatus(r.id, 'read', true); };
  const opened = all.find((r) => r.id === openId);

  return (
    <div className="dash-body">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">Contact Requests</div>
          <h1 className="page-title">طلبات التواصل</h1>
          <div className="page-title-ar">جميع الطلبات الواردة من المنظومة</div>
        </div>
        <div className="last-updated">{updated ? `آخر تحديث: ${updated.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}` : '—'}</div>
      </div>

      <div className="stats-grid">
        {[['s-total', 'الإجمالي', all.length, 'جميع المصادر'], ['s-new', 'جديدة', n.new || 0, 'بانتظار المراجعة'],
          ['s-replied', 'تم الرد', n.replied || 0, 'تم التواصل معها'], ['s-archived', 'مؤرشفة', n.archived || 0, 'غير نشطة']].map(([c, l, v, s]) => (
          <div key={c} className={`stat-card ${c}`}><div className="stat-label">{l}</div><div className={`stat-value ${c}`}>{rows ? v : '—'}</div><div className="stat-sub">{s}</div></div>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <input className="search-input" type="search" aria-label="بحث" placeholder="بحث بالاسم أو البريد أو الجهة..." value={f.q} onChange={setFilter('q')} />
        </div>
        <select className="filter-select" aria-label="الحالة" value={f.status} onChange={setFilter('status')}>
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="filter-select" aria-label="المصدر" value={f.source} onChange={setFilter('source')}>
          <option value="">كل المصادر</option>
          {Object.entries(SOURCE_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="refresh-btn" onClick={load}>↻ تحديث</button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>الاسم</th><th>الجهة</th><th>البريد</th><th>نوع الطلب</th><th>المصدر</th><th>التاريخ</th><th>الحالة</th></tr></thead>
          <tbody>
            {!rows ? <tr className="loading-row"><td colSpan={7}><Spinner /></td></tr>
              : error ? (
                <tr className="loading-row"><td colSpan={7} style={{ color: 'var(--st-bad)' }}>
                  خطأ في تحميل البيانات: {error} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button>
                </td></tr>
              ) : !list.length ? (
                <tr><td colSpan={7}><div className="empty-state"><div className="empty-state-icon"><Ico name="inbox" size="34" /></div>
                  <p>{all.length ? 'لا توجد طلبات مطابقة' : 'لا توجد طلبات بعد'}</p></div></td></tr>
              ) : shown.map((r) => (
                <tr key={r.id} tabIndex={0} onClick={() => open(r)} onKeyDown={(e) => { if (e.key === 'Enter') open(r); }} style={{ cursor: 'pointer' }}>
                  <td><strong>{r.name}</strong></td>
                  <td style={{ color: 'var(--ink-mid)' }}>{r.organization}</td>
                  <td><span style={{ fontSize: '.83rem', direction: 'ltr', display: 'inline-block' }}>{r.email}</span> <Copy text={r.email} /></td>
                  <td><span className="interest-badge">{INTEREST_AR[r.interest] || r.interest || '—'}</span></td>
                  <td><span className={`source-badge ${r.product === 'MI-HOME' ? 'home' : 'leaders'}`}>{SOURCE_AR[r.product] || 'القادة'}</span></td>
                  <td style={{ color: 'var(--ink-light)', fontSize: '.82rem', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                  <td><span className={`status-badge ${r.status}`}>{STATUS_AR[r.status] || r.status}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
        {pages > 1 && (
          <nav className="pagination" aria-label="الصفحات">
            <span>{(cur - 1) * PAGE_SIZE + 1}–{Math.min(cur * PAGE_SIZE, list.length)} من {list.length}</span>
            <div className="page-btns">
              <button className="page-btn" disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label="السابقة">‹</button>
              {pageList(cur, pages).map((p, i) => (p === '…'
                ? <span key={`g${i}`} style={{ padding: '6px 4px', color: 'var(--ink-faint)' }}>…</span>
                : <button key={p} className={`page-btn${p === cur ? ' active' : ''}`} aria-current={p === cur ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>))}
              <button className="page-btn" disabled={cur === pages} onClick={() => setPage(cur + 1)} aria-label="التالية">›</button>
            </div>
          </nav>
        )}
      </div>

      {opened && <Drawer r={opened} onClose={() => setOpenId(null)} onStatus={setStatus} />}
    </div>
  );
}
