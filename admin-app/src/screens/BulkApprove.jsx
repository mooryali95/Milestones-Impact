// ════════════════════════════════════════════════════════════════
// الاعتماد الجماعي: معاينة، ثم تنفيذ، ثم نتيجة لكل شخص
// ════════════════════════════════════════════════════════════════
// الإدارة بالاستثناء (تصور 2026-11-15). وضعان، والحكم في الاثنين على الخادم (approval.js) في المعاينة والتنفيذ معًا:
// · «كما حُسب» (المرحلة 1): المتسق يُعتمد بمستواه المحسوب، ومن عليه إشارة يُستبقى بسببه للمراجعة من ملفه.
// · «بمستوى محدد» (المرحلة 2، للمدير العام): مستوى يُفرض لبُعد أو أكثر، بتعليل إلزامي يُحفظ في ملف كل من خالفه.
// · بعد «كما حُسب» عيّنة عشوائية للتحقق (المرحلة 3): ضبط جودة القاعدة نفسها، تُحفظ في السجل الجامع.
import React, { useEffect, useState } from 'react';
import { L, LVL, isSuperAdminUser } from '../leaders.js';
import { session } from '../api.js';
import { Spinner, useEscape } from '../ui.jsx';
import { DIM_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { OVERRIDE_REASON_MIN } from '../../../supabase/functions/leaders-api/logic.js';
import { etaAr } from '../../../supabase/functions/leaders-api/mail-center.js';

// أثر البريد قبل التأكيد دائمًا: كم يخرج الآن، وكم ينتظر في صندوق «لم يُرسل» ومتى يُتوقع أن يخرج آخره (mailForecast في الخادم)
export function mailLine(mail, read = true) {
  const app = 'ويرى كل واحد اعتماده في رحلته فورًا، وصله البريد أم لم يصل.';
  if (!mail) return `يصل كل واحد بريد الاعتماد بخطوته التالية. ${app}`;
  if (!read) return `تعذّرت قراءة حصة البريد الآن: ما لا يتسع له اليوم ينتظر في صندوق «لم يُرسل» ويخرج آليًّا. ${app}`;
  const total = mail.now + mail.queued;
  if (!mail.queued) return `سيصل ${total} بريدًا الآن، بريد الاعتماد بخطوته التالية. ${app}`;
  const ahead = mail.ahead ? ` بعد ${mail.ahead} إشعارًا ينتظر قبله` : '';
  return `سيصل ${total} بريدًا: ${mail.now} الآن، والباقي ${mail.queued} ينتظر في صندوق «لم يُرسل» لامتلاء حصة الإشعارات، ويخرج آليًّا${ahead}، آخره ${etaAr(mail.clear_at)}. ${app}`;
}

const DIMS = ['milestone', 'impact', 'leadership'];
const levelsLine = (lv) => DIMS.map((d) => `${DIM_AR[d]}: ${LVL[lv?.[d]] || '·'}`).join(' · ');
const changesLine = (ch) => ch.map((c) => `${DIM_AR[c.dim]}: ${LVL[c.from]} ← ${LVL[c.to]}`).join(' · ');

/** @param {{ ids: string[], onClose: (changed?: boolean) => void, onPerson: (id: string) => void }} props */
export default function BulkApprove({ ids, onClose, onPerson }) {
  const isSuper = isSuperAdminUser(session.load()?.user);
  const [mode, setMode] = useState('computed');
  const [levels, setLevels] = useState({});
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  useEscape(() => !busy && onClose(!!done), true);

  const chosen = Object.fromEntries(Object.entries(levels).filter(([, l]) => l));
  const body = mode === 'set' ? { participant_ids: ids, mode: 'set', levels: chosen, reason } : { participant_ids: ids };
  // المعاينة تُعاد كلما تغيّر الوضع أو المستوى المفروض (لا التعليل: لا يغيّر من يُعتمد)
  const key = JSON.stringify([mode, chosen]);
  useEffect(() => {
    setPreview(null);
    const [m, lv] = JSON.parse(key);
    if (m === 'set' && !Object.keys(lv).length) return;
    L('admin.approve-bulk', { participant_ids: ids, dry_run: true, ...(m === 'set' ? { mode: 'set', levels: lv } : {}) }).then(setPreview);
  }, [ids, key]);

  const reasonShort = preview?.needs_reason && reason.trim().length < OVERRIDE_REASON_MIN;
  const run = async () => {
    setBusy(true);
    const r = await L('admin.approve-bulk', body);
    setBusy(false);
    setDone(r);
  };
  const open = (id) => { onClose(!!done); onPerson(id); };
  const held = done?.held || preview?.held || [];
  // المستبقون وأسبابهم قبل قائمة من سيُعتمد: يرى المدير لماذا استُبقي أحد قبل أن ينفّذ
  const heldBlock = preview?.success && held.length > 0 && (
    <div className="ba-held">
      <h4>{done ? 'استُبقي للمراجعة من ملفه' : 'يُستبقى للمراجعة من ملفه'}</h4>
      <ul className="ba-list">
        {held.map((h) => (
          <li key={h.id} className="held">
            <button type="button" className="la-link" onClick={() => open(h.id)}><b>{h.full_name}</b></button>
            <span className="ba-holds">{h.holds.map((x, i) => <span key={i} className="la-chip warn">{x.text}</span>)}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  // العنوان والتذييل ثابتان والمحتوى يتمرر بينهما: زر التنفيذ ظاهر دائمًا مهما طالت القوائم
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose(!!done)}>
      <div className="la-form mi-form bulk-approve" role="dialog" aria-modal="true" aria-label="اعتماد جماعي">
        <h3>اعتماد جماعي</h3>
        <div className="ba-body">
          {isSuper && !done && (
            <div className="ba-modes" role="radiogroup" aria-label="طريقة الاعتماد">
              <label><input type="radio" name="ba-mode" checked={mode === 'computed'} onChange={() => setMode('computed')} /><span><b>كما حُسب</b> <small>المتسق وحده، ويُستبقى من عليه إشارة</small></span></label>
              <label><input type="radio" name="ba-mode" checked={mode === 'set'} onChange={() => setMode('set')} /><span><b>بمستوى محدد</b> <small>للمدير العام، بتعليل يُحفظ لكل من خالفه</small></span></label>
            </div>
          )}
          {mode === 'computed' ? (
            <p className="la-muted">يُعتمد من اتسق قياسه بمستواه المحسوب كما هو. ومن عليه إشارة يُستبقى لتراجعه من ملفه: الحالة الحدّية، وعلامات القياس، والاستعجال، وإعادة القياس المعلّقة.</p>
          ) : !done && (
            <>
              <p className="la-muted">اختر مستوى لبُعد أو أكثر، والبُعد المتروك يبقى على المحسوب. قرار صريح منك فلا تُستبقى الإشارات، ومن خالف مستواه المحسوب يُحفظ التعليل في ملفه.</p>
              <div className="ba-levels">
                {DIMS.map((d) => (
                  <label key={d} className="wiz-field">{DIM_AR[d]}
                    <select aria-label={`مستوى ${DIM_AR[d]}`} value={levels[d] || ''} onChange={(e) => setLevels({ ...levels, [d]: e.target.value })}>
                      <option value="">كما حُسب</option>
                      {Object.entries(LVL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {preview?.needs_reason && (
                <label className="wiz-field">التعليل (إلزامي، {OVERRIDE_REASON_MIN} أحرف على الأقل)
                  <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: قرار لجنة البرنامج بمستوى بداية موحّد لهذه الدفعة" />
                </label>
              )}
            </>
          )}

          {mode === 'set' && !Object.keys(chosen).length && !done ? <p className="la-muted">اختر مستوى لبُعد واحد على الأقل لتظهر المعاينة.</p>
            : !preview ? <Spinner /> : !preview.success ? <p className="la-err" role="alert">{preview.message}</p> : !done ? (
            <>
              <div className="ba-sum">
                <span className="la-chip ok">سيُعتمد {preview.ready.length}</span>
                {mode === 'set' && <span className={`la-chip ${preview.ready.some((r) => r.changes?.length) ? 'warn' : ''}`}>يخالف المحسوب {preview.ready.filter((r) => r.changes?.length).length}</span>}
                <span className={`la-chip ${preview.held.length ? 'warn' : ''}`}>يُستبقى {preview.held.length}</span>
              </div>
              {heldBlock}
              {preview.ready.length > 0 && (
                <details open={preview.ready.length <= 12}>
                  <summary>من سيُعتمد ({preview.ready.length})</summary>
                  <ul className="ba-list">{preview.ready.map((r) => (
                    <li key={r.id} className={r.changes?.length ? 'held' : ''}><b>{r.full_name}</b>
                      <small>{r.changes?.length ? `يخالف المحسوب: ${changesLine(r.changes)}` : levelsLine(r.levels)}</small></li>
                  ))}</ul>
                </details>
              )}
              {preview.ready.length > 0 && (
                <p className="la-muted ba-mail" data-mail-forecast>{mailLine(preview.mail, preview.mail_read)}</p>
              )}
            </>
          ) : (
            <div className="ba-sum">
              <span className="la-chip ok">اعتُمد {done.success ? done.results.filter((x) => x.ok).length : 0}</span>
              {done.success && done.results.some((x) => !x.ok) && <span className="la-chip bad">تعذّر {done.results.filter((x) => !x.ok).length}</span>}
              <span className={`la-chip ${held.length ? 'warn' : ''}`}>استُبقي {held.length}</span>
              {!done.success && <p className="la-err" role="alert">{done.message}</p>}
            </div>
          )}
          {done?.success && done.sample?.length > 0 && (
            <div className="ba-sample">
              <h4>عيّنة للتحقق ({done.sample.length})</h4>
              <p className="la-muted">اختيرت عشوائيًا مما اعتُمد آليًا (10%). راجع ملفاتها: إن وجدت فيها خطأ فالقاعدة نفسها تحتاج ضبطًا، لا هؤلاء وحدهم.</p>
              <ul className="ba-list">{done.sample.map((x) => <li key={x.id}><button type="button" className="la-link" onClick={() => open(x.id)}><b>{x.full_name}</b></button></li>)}</ul>
            </div>
          )}
          {done?.success && done.results.some((x) => !x.ok) && (
            <ul className="ba-list">{done.results.filter((x) => !x.ok).map((x) => <li key={x.id} className="bad"><button type="button" className="la-link" onClick={() => open(x.id)}><b>{x.full_name}</b></button><small>{x.error}</small></li>)}</ul>
          )}
          {done && heldBlock}

          <p className="la-muted ba-hint">
            تريد أن يدرس الجميع محتوى مستوى واحد؟ هذا من إعداد الدفعة لا من الاعتماد: «تحرير الدفعة» ← «مستويات المشاركين: متجانس». يتوحد المحتوى، ويبقى قياس كل واحد ومساره ليُقاس الأثر.
          </p>
        </div>

        <div className="la-row between ba-foot">
          <button className="btn-sm ghost" onClick={() => onClose(!!done)} disabled={busy}>{done ? 'إغلاق' : 'إلغاء'}</button>
          {!done && preview?.success && (
            <button className="btn-sm primary" onClick={run} disabled={busy || !preview.ready.length || reasonShort} title={reasonShort ? 'اكتب التعليل أولًا' : undefined}>
              {busy ? 'يُعتمد…' : `اعتمد ${preview.ready.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
