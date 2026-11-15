// ════════════════════════════════════════════════════════════════
// الاعتماد الجماعي بالمستوى المحسوب: معاينة، ثم تنفيذ، ثم نتيجة لكل شخص
// ════════════════════════════════════════════════════════════════
// الإدارة بالاستثناء (تصور 2026-11-15، المرحلة 1): المتسق يُعتمد بمستواه المحسوب، ومن عليه إشارة (حدّية، أو علم في
// القياس، أو استعجال، أو إعادة معلّقة) يُستبقى بسببه للمراجعة من ملفه. الحكم على الخادم (approval.js) في المعاينة
// وفي التنفيذ معًا، فلا يُعتمد أحد تغيّر حاله بين المعاينة والضغط.
import React, { useEffect, useState } from 'react';
import { L, LVL } from '../leaders.js';
import { Spinner, useEscape } from '../ui.jsx';
import { DIM_AR } from '../../../supabase/functions/leaders-api/labels.js';

const DIMS = ['milestone', 'impact', 'leadership'];
const levelsLine = (lv) => DIMS.map((d) => `${DIM_AR[d]}: ${LVL[lv?.[d]] || '·'}`).join(' · ');

/** @param {{ ids: string[], onClose: (changed?: boolean) => void, onPerson: (id: string) => void }} props */
export default function BulkApprove({ ids, onClose, onPerson }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  useEscape(() => !busy && onClose(!!done), true);
  useEffect(() => { L('admin.approve-bulk', { participant_ids: ids, dry_run: true }).then(setPreview); }, [ids]);

  const run = async () => {
    setBusy(true);
    const r = await L('admin.approve-bulk', { participant_ids: ids });
    setBusy(false);
    setDone(r);
  };
  const open = (id) => { onClose(!!done); onPerson(id); };

  const held = (done?.held || preview?.held || []);
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose(!!done)}>
      <div className="la-form mi-form bulk-approve" role="dialog" aria-modal="true" aria-label="اعتماد جماعي">
        <h3>اعتماد جماعي بالمستوى المحسوب</h3>
        <p className="la-muted">يُعتمد من اتسق قياسه بمستواه المحسوب كما هو. ومن عليه إشارة يُستبقى لتراجعه من ملفه: الحالة الحدّية، وعلامات القياس، والاستعجال، وإعادة القياس المعلّقة.</p>

        {!preview ? <Spinner /> : !preview.success ? <p className="la-err" role="alert">{preview.message}</p> : !done ? (
          <>
            <div className="ba-sum">
              <span className="la-chip ok">سيُعتمد {preview.ready.length}</span>
              <span className={`la-chip ${preview.held.length ? 'warn' : ''}`}>يُستبقى للمراجعة {preview.held.length}</span>
            </div>
            {preview.ready.length > 0 && (
              <details open={preview.ready.length <= 12}>
                <summary>من سيُعتمد ({preview.ready.length})</summary>
                <ul className="ba-list">{preview.ready.map((r) => <li key={r.id}><b>{r.full_name}</b><small>{levelsLine(r.levels)}</small></li>)}</ul>
              </details>
            )}
            {preview.ready.length > 0 && (
              <p className="la-muted ba-mail">
                يصل كل واحد بريد الاعتماد بخطوته التالية{preview.mail?.queued ? `: ${preview.mail.now} الآن، و${preview.mail.queued} في الطابور يصل بعد ساعات لبلوغ الحد اليومي للرسائل.` : '.'}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="ba-sum">
              <span className="la-chip ok">اعتُمد {done.results.filter((x) => x.ok).length}</span>
              {done.results.some((x) => !x.ok) && <span className="la-chip bad">تعذّر {done.results.filter((x) => !x.ok).length}</span>}
              <span className={`la-chip ${held.length ? 'warn' : ''}`}>استُبقي {held.length}</span>
            </div>
            {done.results.some((x) => !x.ok) && (
              <ul className="ba-list">{done.results.filter((x) => !x.ok).map((x) => <li key={x.id} className="bad"><button type="button" className="la-link" onClick={() => open(x.id)}><b>{x.full_name}</b></button><small>{x.error}</small></li>)}</ul>
            )}
          </>
        )}

        {preview?.success && held.length > 0 && (
          <>
            <h4>يُستبقى للمراجعة من ملفه</h4>
            <ul className="ba-list">
              {held.map((h) => (
                <li key={h.id} className="held">
                  <button type="button" className="la-link" onClick={() => open(h.id)}><b>{h.full_name}</b></button>
                  <span className="ba-holds">{h.holds.map((x, i) => <span key={i} className="la-chip warn">{x.text}</span>)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="la-muted ba-hint">
          تريد أن يدرس الجميع محتوى مستوى واحد؟ هذا من إعداد الدفعة لا من الاعتماد: «تحرير الدفعة» ← «مستويات المشاركين: متجانس». يتوحد المحتوى، ويبقى قياس كل واحد ومساره ليُقاس الأثر.
        </p>

        <div className="la-row between">
          <button className="btn-sm ghost" onClick={() => onClose(!!done)} disabled={busy}>{done ? 'إغلاق' : 'إلغاء'}</button>
          {!done && preview?.success && <button className="btn-sm primary" onClick={run} disabled={busy || !preview.ready.length}>{busy ? 'يُعتمد…' : `اعتمد ${preview.ready.length}`}</button>}
        </div>
      </div>
    </div>
  );
}
