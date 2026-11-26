// ════════════════════════════════════════════════════════════════
// اتجاه البرنامج أسبوعًا بأسبوع (admin.trends): هل ينمو التسجيل ويتحول إلى قياس واعتماد ونشاط؟
// ════════════════════════════════════════════════════════════════
// تصور صفحة الزيارات 2026-11-26 (المرحلة 2، البند 2): نُقل من «زيارات الموقع» لأنه بيانات مشاركين لا يتأثر بمرشحي
// الزيارات. يُحمَّل في النظرة العامة عند فتحه وحده (Overview.jsx، lazy)، ويعرض حالة خطأ بزر إعادة بدل الاختفاء الصامت.
// المقارنة بين آخر أسبوعين مكتملين (weekCompare في visits.js)، والأسبوع الجاري معلَّم «جارٍ» في الجدول وحده.
import React, { useCallback, useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { Icon } from '../icons.jsx';
import { dateOnly } from '../dates.js';
import { LoadError, SkeletonRows } from '../ui.jsx';
import { compareText, gapLabel, isPartialWeek, maskSmall, weekCompare, weekRows } from '../visits.js';

export const TREND_COLS = [['joined', 'مسجلون جدد'], ['assessed', 'قياسات مكتملة'], ['approved', 'مسارات اعتُمدت'], ['active', 'مشاركون نشطون']];
const SHORT = 8, LONG = 12;

function Compare({ k, label, weeks, hide }) {
  const c = weekCompare(weeks, k);
  // إخفاء 1 و2 لا يكتمل إن ظهر الفرق الدقيق مع قيمة الأسبوع السابق في الجدول: يُحجب الفرق كله حين يقع أحد الطرفين دون 3
  const small = (v) => v > 0 && v < 3;
  const veil = !!(c && hide && (small(c.cur) || small(c.prev)));
  const tone = !c || veil || c.neutral || c.dir === 'same' ? 'neutral' : c.dir;
  return (
    <div className={`stat-card pt-cmp ${tone}`} data-k={k}>
      <div className="stat-label">{label}</div>
      <div className="stat-value tnum">{c ? maskSmall(c.cur, hide) : '·'}</div>
      <div className="stat-sub">
        {c ? (
          <>
            <span aria-hidden="true" className="pt-delta">{veil ? '·' : <><Icon name={c.dir} size={14} /><bdi dir="ltr">{hide && c.diff && Math.abs(c.diff) < 3 ? '<3' : Math.abs(c.diff)}</bdi></>}</span><span aria-hidden="true" className="pt-delta">{c.pct != null && !hide && <> ({Math.abs(c.pct)}%)</>}</span>
            <span className="sr-only">{hide ? `${maskSmall(c.cur, hide)} في آخر أسبوع مكتمل` : compareText(c)}</span>
            <span aria-hidden="true"> آخر أسبوع مكتمل</span>
          </>
        ) : 'لا أسبوعان مكتملان بعد'}
      </div>
    </div>
  );
}

export default function ProgramTrend({ hideSmall = false }) {
  const [t, setT] = useState(null);
  const [all, setAll] = useState(false);
  const load = useCallback(() => {
    let live = true;
    setT(null);
    L('admin.trends').then((r) => live && setT(r)).catch((e) => live && setT({ success: false, message: e?.message }));
    return () => { live = false; };
  }, []);
  useEffect(() => load(), [load]);

  if (!t) return <div aria-busy="true"><SkeletonRows rows={4} cols={5} /></div>;
  if (!t.success) return <LoadError message={t.message || 'تعذّرت قراءة اتجاه البرنامج'} onRetry={load} />;
  const weeks = t.weeks || [];
  if (!weeks.length) return <p className="la-muted">لا بيانات أسبوعية بعد.</p>;
  const keys = TREND_COLS.map(([k]) => k);
  const shown = weeks.slice(-(all ? LONG : SHORT));
  const max = Object.fromEntries(keys.map((k) => [k, Math.max(1, ...shown.map((w) => Number(w[k] || 0)))]));
  return (
    <>
      <div className="stats-grid">{TREND_COLS.map(([k, l]) => <Compare key={k} k={k} label={l} weeks={weeks} hide={hideSmall} />)}</div>
      <table className="la-table tr-table" tabIndex={0} aria-label="اتجاه البرنامج أسبوعًا بأسبوع">
        <thead><tr><th scope="col">الأسبوع</th>{TREND_COLS.map(([k, l]) => <th key={k} scope="col">{l}</th>)}</tr></thead>
        <tbody>{weekRows(shown, keys).map((w) => (w.gap ? (
          <tr key={`gap-${w.from}`} className="tr-gap"><td colSpan={keys.length + 1}>{gapLabel(w.gap)} <span className="la-muted">({dateOnly(w.from)} إلى {dateOnly(w.to)})</span></td></tr>
        ) : (
          <tr key={w.week}>
            <td>{dateOnly(w.week)}{isPartialWeek(w.week) && <span className="la-chip tr-partial">جارٍ</span>}</td>
            {keys.map((k) => (
              <td key={k}><span className="tr-cell"><span className="tr-track" aria-hidden="true"><span className="tr-bar" style={{ width: `${((hideSmall && Number(w[k]) > 0 && Number(w[k]) < 3 ? 3 : Number(w[k] || 0)) / Math.max(max[k], 3)) * 100}%` }} /></span><span className="tnum">{maskSmall(w[k], hideSmall)}</span></span></td>
            ))}
          </tr>
        )))}</tbody>
      </table>
      {weeks.length > SHORT && (
        <button type="button" className="btn-sm ghost tr-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? `عرض ${SHORT} أسابيع` : `عرض ${Math.min(LONG, weeks.length)} أسبوعًا`}</button>
      )}
      <p className="la-muted tr-note">المقياس لكل عمود على حدة. المقارنة بين آخر أسبوعين مكتملين؛ الأسبوع الجاري جزئي.</p>
    </>
  );
}
