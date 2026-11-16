// ════════════════════════════════════════════════════════════════
// التذكير الموحد في اللوحة (المرحلة P3، اعتمدها المالك 2026-11-16)
// ════════════════════════════════════════════════════════════════
// · NudgeSheet: «ذكّر المحددين» من القائمة: معاينة مجمّعة بالمرحلة بنص المحرك نفسه، ومن يُتخطى ولماذا، ثم الإرسال.
// · NudgeLog: في ملف المشارك (تبويب «السجل»): التذكير الذي يناسبه الآن، وكل تذكير سبق بمرسله ومرحلته وأثره.
// القواعد كلها على الخادم (nudges.ts والمحرك nudge.js): الحد المشترك بين كل المرسلين، والنص، والأثر.
import React, { useCallback, useEffect, useState } from 'react';
import { date, L } from '../leaders.js';
import { Spinner, useEscape, useUI } from '../ui.jsx';
import { lastLine, NUDGE_OUTCOME_AR, NUDGE_REPORT_WINDOWS, NUDGE_SKIP_AR } from '../../../supabase/functions/leaders-api/nudge.js';

const OUTCOME_TONE = { progressed: 'ok', waiting: '', none: 'warn' };
const daysAr = (n) => (n == null ? '' : n === 0 ? 'اليوم' : n === 1 ? 'منذ يوم' : n === 2 ? 'منذ يومين' : n <= 10 ? `منذ ${n} أيام` : `منذ ${n} يومًا`);
const skipCounts = (skipped) => Object.entries(skipped || {}).map(([k, n]) => `${n} ${NUDGE_SKIP_AR[k] || k}`).join('، ');

/** @param {{ ids: string[], onClose: (sent?: boolean) => void }} props */
export function NudgeSheet({ ids, onClose }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  useEscape(() => !busy && onClose(!!done), true);
  useEffect(() => { L('admin.nudge-preview', { participant_ids: ids }).then(setPreview); }, [ids]);
  const run = async () => {
    setBusy(true);
    setDone(await L('admin.nudge', { participant_ids: ids }));
    setBusy(false);
  };
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose(!!done)}>
      <div className="la-form mi-form bulk-approve nudge-sheet" role="dialog" aria-modal="true" aria-label="تذكير المحددين">
        <h3>تذكير المحددين</h3>
        <div className="ba-body">
          <p className="la-muted">يصل كل واحد بريد يسمّي مرحلته وخطوته التالية وكم قطع من رحلته، بنص واحد يستعمله كل من يذكّر. ومن ذُكِّر قريبًا من أي مرسل يُتخطى، فلا تتكرر التذكيرات.</p>
          {!preview ? <Spinner /> : !preview.success ? <p className="la-err" role="alert">{preview.message}</p> : !done ? (
            <>
              <div className="ba-sum">
                <span className="la-chip ok">سيصله تذكير {preview.count}</span>
                <span className={`la-chip ${preview.skipped.length ? 'warn' : ''}`}>يُتخطى {preview.skipped.length}</span>
              </div>
              {preview.groups.map((g) => (
                <section key={g.key} className="nd-group" aria-label={`مرحلة ${g.stage}`}>
                  <header><b>{g.stage}</b>{g.step && <span className="la-muted"> · {g.step}</span>}<span className="la-chip">{g.people.length}</span></header>
                  <blockquote className="nd-sample" aria-label="نص التذكير لأولهم">{g.sample}</blockquote>
                  <ul className="ba-list">{g.people.map((x) => (
                    <li key={x.id}><b>{x.name}</b><small>{[x.step, x.days != null && `متوقف ${daysAr(x.days)}`, x.last && lastLine(x.last)].filter(Boolean).join(' · ')}</small></li>
                  ))}</ul>
                </section>
              ))}
              {preview.skipped.length > 0 && (
                <details open={preview.skipped.length <= 8}>
                  <summary>لا يُذكَّر ({preview.skipped.length})</summary>
                  <ul className="ba-list">{preview.skipped.map((x) => (
                    <li key={x.id} className="held"><b>{x.name}</b><small>{x.why === 'recent' && x.last ? lastLine(x.last) : x.reason}</small></li>
                  ))}</ul>
                </details>
              )}
            </>
          ) : (
            <div className="ba-sum" role="status">
              {done.success ? <>
                <span className="la-chip ok">أُرسل {done.sent}</span>
                {Object.keys(done.skipped || {}).length > 0 && <span className="la-chip warn">تُخطّي: {skipCounts(done.skipped)}</span>}
              </> : <p className="la-err" role="alert">{done.message}</p>}
            </div>
          )}
        </div>
        <div className="la-row between ba-foot">
          <button className="btn-sm ghost" onClick={() => onClose(!!done)} disabled={busy}>{done ? 'إغلاق' : 'إلغاء'}</button>
          {!done && preview?.success && (
            <button className="btn-sm primary" onClick={run} disabled={busy || !preview.count}>{busy ? 'يُرسل…' : `أرسل ${preview.count} تذكير`}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** سجل التذكير في ملف المشارك، والتذكير الذي يناسبه الآن بزر واحد */
export function NudgeLog({ participantId, canWrite }) {
  const { toast, confirm } = useUI();
  const [r, setR] = useState(null);
  const load = useCallback(() => L('admin.nudge-ledger', { participant_id: participantId }).then(setR), [participantId]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    const warn = r.last ? `\n${lastLine(r.last)}.` : '';
    if (!(await confirm(`يصله بريد بخطوته التالية في «${r.now.stage}».${warn}`, { ok: 'أرسل التذكير' }))) return;
    const d = await L('admin.nudge', { participant_ids: [participantId] });
    toast(!d.success ? d.message : d.sent ? 'أُرسل التذكير وكُتب في سجله' : `لم يُرسل: ${skipCounts(d.skipped)}`);
    load();
  };
  return (
    <section className="la-card nd-log" aria-labelledby="pf-nd-h">
      <div className="la-row between">
        <h3 id="pf-nd-h">التذكيرات {r?.success && <small className="la-muted">· {r.total}{r.total ? ` · تقدّم بعد ${r.progressed}` : ''}</small>}</h3>
        {r?.success && r.now?.ok && canWrite && (
          <button type="button" className="btn-sm ghost" onClick={send} disabled={!r.now.allowed} title={r.now.allowed ? undefined : `الحد المشترك ${r.gap_days} أيام بين أي تذكيرين`}>ذكّره الآن</button>
        )}
      </div>
      {!r ? <Spinner /> : !r.success ? <p className="la-err">{r.message}</p> : <>
        {r.now?.ok ? (
          <div className="nd-now">
            <small className="la-muted">ما سيصله الآن · {r.now.stage}{r.now.days != null ? ` · متوقف ${daysAr(r.now.days)}` : ''}</small>
            <blockquote className="nd-sample">{r.now.text}</blockquote>
            {r.last && <small className={r.now.allowed ? 'la-muted' : 'nd-recent'}>{lastLine(r.last)}{r.now.allowed ? '' : `، والتذكير التالي بعد ${r.gap_days} أيام من آخر تذكير`}</small>}
          </div>
        ) : <p className="la-muted">لا تذكير يناسبه الآن: {NUDGE_SKIP_AR[r.now?.why] || 'لا خطوة مطلوبة منه'}.</p>}
        {!r.ledger && <p className="la-muted">سجل التذكير يبدأ بعد تطبيق ترحيله.</p>}
        {r.rows.length > 0 && (
          <ol className="nd-list">{r.rows.map((n) => (
            <li key={n.id}>
              <span className="pf-when">{date(n.created_at)}</span>
              <span><b>{n.by}</b> · {n.stage_title}{n.step ? `: ${n.step}` : ''}
                <span className={`la-chip ${OUTCOME_TONE[n.outcome]}`}>{NUDGE_OUTCOME_AR[n.outcome]}</span>
                {n.seen_at && <small className="la-muted"> · رآه في الموقع</small>}</span>
            </li>
          ))}</ol>
        )}
      </>}
    </section>
  );
}

// ── تقرير فاعلية التذكير (P5): هل يحرّك التذكير المشاركين؟ من أي مرسل وفي أي مرحلة، ومن لم يعد يكفيه التذكير ──
// الحساب كله على الخادم (effectReport في nudge.js) من السجل الواحد وحال كل مشارك الآن.
const pctText = (v) => (v == null ? '·' : `${v}%`);
function Rate({ t }) {
  return (
    <>
      <td data-label="أُرسل">{t.sent}</td>
      <td data-label="رآه في الموقع">{pctText(t.seen_pct)}</td>
      <td data-label="تقدّم بعده"><b>{pctText(t.progressed_pct)}</b>{t.waiting > 0 && <small className="la-muted"> · {t.waiting} ينتظر</small>}</td>
    </>
  );
}
/** @param {{ onClose: () => void, onOpen: (id: string) => void }} props */
export function NudgeReport({ onClose, onOpen }) {
  const [days, setDays] = useState(30);
  const [r, setR] = useState(null);
  useEscape(onClose, true);
  useEffect(() => { setR(null); L('admin.nudge-report', { days }).then(setR); }, [days]);
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="la-form mi-form bulk-approve nudge-report" role="dialog" aria-modal="true" aria-label="فاعلية التذكير">
        <h3>فاعلية التذكير</h3>
        <div className="ba-body">
          <div className="la-subtabs" role="group" aria-label="المدة">
            {NUDGE_REPORT_WINDOWS.map((d) => <button key={d} type="button" className={days === d ? 'on' : ''} aria-pressed={days === d} onClick={() => setDays(d)}>آخر {d} يومًا</button>)}
          </div>
          {!r ? <Spinner /> : !r.success ? <p className="la-err" role="alert">{r.message}</p> : !r.ledger ? <p className="la-muted">سجل التذكير يبدأ بعد تطبيق ترحيله.</p> : !r.total.sent ? <p className="la-muted">لا تذكير في هذه المدة.</p> : (
            <>
              <div className="nr-kpis">
                <span><b>{r.total.sent}</b>تذكير لـ{r.people} مشارك</span>
                <span><b>{pctText(r.total.progressed_pct)}</b>تقدّم بعده</span>
                <span><b>{pctText(r.total.seen_pct)}</b>رآه في الموقع</span>
                <span><b>{r.stuck.length}</b>لم يعد يكفيه التذكير</span>
              </div>
              <p className="la-muted small">«تقدّم بعده»: انتقل من موضعه أو أنجز فيه شيئًا قبل التذكير التالي أو حتى الآن. ما أُرسل منذ أقل من أسبوع ولم يتحرك بعده يُعدّ «ينتظر» ولا يدخل النسبة.{r.capped ? ' النافذة مقصوصة على أحدث 300 مشارك.' : ''}{r.ms != null ? ` حُسب في ${(r.ms / 1000).toFixed(1)} ث.` : ''}</p>
              <section aria-labelledby="nr-s-h">
                <h4 id="nr-s-h">بحسب المرسل</h4>
                <div className="table-wrap"><table className="data-table nr-table"><thead><tr><th>المرسل</th><th>أُرسل</th><th>رآه في الموقع</th><th>تقدّم بعده</th></tr></thead>
                  <tbody>{r.by_sender.map((t) => <tr key={t.key}><td data-label="المرسل">{t.label}</td><Rate t={t} /></tr>)}</tbody></table></div>
              </section>
              <section aria-labelledby="nr-st-h">
                <h4 id="nr-st-h">بحسب المرحلة</h4>
                <div className="table-wrap"><table className="data-table nr-table"><thead><tr><th>المرحلة</th><th>أُرسل</th><th>رآه في الموقع</th><th>تقدّم بعده</th></tr></thead>
                  <tbody>{r.by_stage.map((t) => <tr key={t.key}><td data-label="المرحلة">{t.key}</td><Rate t={t} /></tr>)}</tbody></table></div>
              </section>
              <section aria-labelledby="nr-k-h">
                <h4 id="nr-k-h">يحتاجون تدخلًا شخصيًا <small className="la-muted">· ذُكِّروا مرتين فأكثر بلا أثر</small></h4>
                {r.stuck.length ? (
                  <ul className="ba-list">{r.stuck.map((x) => (
                    <li key={x.id} className="held"><button type="button" className="la-link" onClick={() => onOpen(x.id)}><b>{x.name}</b></button>
                      <small>{x.stage} · {x.nudges} تذكير، {x.misses} بلا أثر · آخرها {date(x.last)}</small></li>
                  ))}</ul>
                ) : <p className="la-muted small">لا أحد: كل من ذُكِّر تحرّك أو ما زال ينتظر.</p>}
              </section>
            </>
          )}
        </div>
        <div className="la-row between ba-foot"><button className="btn-sm ghost" onClick={onClose}>إغلاق</button></div>
      </div>
    </div>
  );
}
