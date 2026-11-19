// ════════════════════════════════════════════════════════════════
// ورقة الحضور: مشتركة بين لوحة الإدارة وبوابة الخبير (تصور تشغيل الدفعة 2026-11-19، 4.2، المرحلة 2)
// ════════════════════════════════════════════════════════════════
// كل المتوقع حضورهم بمربعات: من سجّل نفسه معلَّم وبجانبه طريقته، ومن سُجّل يدويًا بجانبه من سجّله وسببه. «علّم الكل حاضرًا»
// ثم أزل من غاب، وسبب واحد للورقة، وحفظ واحد بعد تأكيد يقول ما سيُكتب. الخادم يحكم لكل مشارك ويعيد: سُجّل، تُخطي، رُفض بسببه.
// الورقة لا تعرف مصدرها: load وsave يمرّرهما المستعمل (admin.workshop-attendance وadmin.workshop-mark-bulk، أو xp.*)، فالكاتب
// واحد على الخادم (markBatch في activities.ts). role: المدير يلغي أي حضور (وما سجّله المشارك بنفسه بسبب مكتوب)، والمدرب يكتب
// السبب دائمًا ويلغي ما سجّله هو وحده، وقائمته بلا بريد ولا جهة. والمنطق في attendance-sheet.js.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MARK_REASON_MAX, MARK_REASONS_AR } from '../../supabase/functions/leaders-api/labels.js';
import { useUnsavedFlag } from './unsaved-registry.js';
import {
  allChecked, canToggle, confirmLines, filterPeople, initialChecked, lockedWhy, notListed, presentCount, reasonOf, savedAr, selfMarked, sheetBlock, sheetDiff,
  sheetPayload, stateAr, toggled,
} from './attendance-sheet.js';

/**
 * @param {{
 *   sessionId: string, load: () => Promise<any>, save: (body: any) => Promise<any>, onClose: (changed: boolean) => void,
 *   role?: 'admin' | 'trainer', canWrite?: boolean, preselect?: string[], names?: Record<string, string>,
 *   title?: string, sub?: string | ((d: any) => string), note?: string | ((d: any) => string), when?: (iso: string) => string,
 * }} p
 * sub وnote نص، أو دالة تقرؤه من رد القراءة (موعد الجلسة ونشاطها حين لا يعرفهما المستعمل قبل التحميل)
 */
export default function AttendanceSheet({ sessionId, load, save, onClose, role = 'admin', canWrite = true, preselect = [], names = {}, title = '', sub = '', note = '', when = () => '' }) {
  const [d, setD] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [why, setWhy] = useState('');
  const [other, setOther] = useState('');
  const [unmark, setUnmark] = useState('');
  const [step, setStep] = useState('edit');   // edit ← confirm ← saving
  const [block, setBlock] = useState(null);
  const [result, setResult] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const changed = useRef(false);
  const pre = useRef(preselect);

  const read = useCallback(async (keepPre) => {
    const r = await load();
    setD(r || { success: false });
    if (r?.success) setChecked(initialChecked(r.people, keepPre ? pre.current : []));
  }, [load]);
  useEffect(() => { read(true); }, [read]);

  const people = d?.success ? d.people || [] : [];
  const writable = canWrite && d?.success && d.sheet !== false;
  const diff = useMemo(() => sheetDiff(people, checked), [people, checked]);
  const dirty = writable && diff.changed;
  const shown = useMemo(() => filterPeople(people, q), [people, q]);
  const outside = useMemo(() => (d?.success ? notListed(people, pre.current) : []), [d, people]);
  const reason = reasonOf(why, other);
  useUnsavedFlag(dirty);

  const close = useCallback(() => { if (dirty && step !== 'saving') setLeaving(true); else onClose(changed.current); }, [dirty, step, onClose]);
  const state = useRef({});
  state.current = { step, leaving, close };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const s = state.current;
      if (s.step === 'saving') return;
      e.stopPropagation();
      if (s.leaving) setLeaving(false);
      else if (s.step === 'confirm') setStep('edit');
      else s.close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const text = (v) => (typeof v === 'function' ? (d?.success ? v(d) : '') : v) || '';
  // سبب إلغاء حضور من سجّل نفسه يُسأل في خطوة التأكيد، فلا يمنع الانتقال إليها
  const review = () => {
    const b = sheetBlock({ diff, reason, unmarkReason: 'يُسأل في التأكيد', role });
    setBlock(b);
    if (!b) { setResult(null); setStep('confirm'); }
  };
  const commit = async () => {
    const b = sheetBlock({ diff, reason, unmarkReason: unmark, role });
    setBlock(b);
    if (b) return;
    setStep('saving');
    const r = await save(sheetPayload({ sessionId, diff, reason, unmarkReason: unmark }));
    if (!r?.success) {
      // رفض أو تعذّر اتصال: المسودة تبقى، والقائمة تُقرأ من جديد فلا يُعرض ما حُفظ فعلًا (طلب وصل وتعذّر رده) كأنه لم يُحفظ
      setResult({ tone: 'bad', text: r?.message || 'تعذّر الحفظ. أعد المحاولة.', refused: [] });
      const fresh = await load();
      if (fresh?.success) setD(fresh);
      setStep('edit');
      return;
    }
    changed.current = true;
    const nameOf = (id) => people.find((p) => p.id === id)?.full_name || names[id] || '';
    setResult(savedAr(r, nameOf));
    pre.current = [];
    setUnmark('');
    await read(false);
    setStep('edit');
  };

  const present = presentCount(people);
  const heading = title || d?.session?.title_ar || 'ورقة الحضور';
  const nameOfId = (id) => people.find((p) => p.id === id)?.full_name || '';
  const lines = confirmLines({ diff, reason, unmarkReason: unmark });

  return (
    <div className="ats-ov" onMouseDown={(e) => e.target === e.currentTarget && step !== 'saving' && close()}>
      <div className="ats" role="dialog" aria-modal="true" aria-label="ورقة الحضور" data-testid="attendance-sheet">
        <header className="ats-head">
          <div className="ats-titles">
            <h3>{heading}</h3>
            {text(sub) && <p className="ats-sub">{text(sub)}</p>}
          </div>
          <button type="button" className="ats-x" onClick={close} disabled={step === 'saving'} aria-label="إغلاق">✕</button>
        </header>

        {!d ? <div className="ats-wait" role="status">جارٍ تحميل قائمة الحضور…</div>
          : !d.success ? (
            <div className="ats-body">
              <p className="ats-err" role="alert">{d.message || 'تعذّرت قراءة قائمة الحضور.'} <button type="button" className="ats-link" onClick={() => { setD(null); read(true); }}>أعد المحاولة</button></p>
            </div>
          ) : step !== 'edit' ? (
            <div className="ats-body ats-confirm" data-testid="ats-confirm">
              <h4>راجع قبل الحفظ</h4>
              <ul className="ats-lines">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
              {diff.add.length > 0 && <details className="ats-names" open={diff.add.length <= 12}>
                <summary>من يُسجَّل حضورهم ({diff.add.length})</summary>
                <p>{diff.add.map(nameOfId).join('، ')}</p>
              </details>}
              {diff.manual.length + diff.self.length > 0 && <details className="ats-names" open>
                <summary>من يُلغى حضورهم ({diff.manual.length + diff.self.length})</summary>
                <p>{[...diff.manual, ...diff.self].map(nameOfId).join('، ')}</p>
              </details>}
              {diff.self.length > 0 && (
                <label className="ats-field">
                  <span>سبب إلغاء حضور من سجّل نفسه (مطلوب، يُحفظ في السجل)</span>
                  <input type="text" className="ats-input" value={unmark} maxLength={MARK_REASON_MAX} onChange={(e) => { setUnmark(e.target.value); setBlock(null); }}
                    aria-invalid={block?.field === 'unmark'} aria-describedby={block?.field === 'unmark' ? 'ats-block' : undefined} placeholder="مثل: مسح الرمز من خارج القاعة" />
                </label>
              )}
              {block && <p className="ats-err" id="ats-block" role="alert">{block.message}</p>}
              <p className="ats-fine">يُحفظ مع كل تسجيل من سجّله ووقته وسببه. من سجّل نفسه يبقى بطريقته ووقته.</p>
              <div className="ats-actions">
                <button type="button" className="ats-btn primary" onClick={commit} disabled={step === 'saving'}>{step === 'saving' ? 'يُحفظ…' : 'احفظ'}</button>
                <button type="button" className="ats-btn" onClick={() => { setBlock(null); setStep('edit'); }} disabled={step === 'saving'}>رجوع</button>
              </div>
            </div>
          ) : (
            <>
              <div className="ats-top">
                <p className="ats-count" aria-live="polite"><b><bdi dir="ltr">{present}</bdi> من <bdi dir="ltr">{people.length}</bdi></b> حضروا
                  {dirty && <span className="ats-draft"> · {[diff.add.length && `يُسجَّل ${diff.add.length}`, (diff.manual.length + diff.self.length) && `يُلغى ${diff.manual.length + diff.self.length}`].filter(Boolean).join('، ')} (لم يُحفظ)</span>}</p>
                {text(note) && <p className="ats-fine">{text(note)}</p>}
                {d.sheet === false && <p className="ats-fine">ورقة هذه الجلسة للقراءة الآن: تسجيلك اليدوي يُفتح قبل الجلسة بساعة ويبقى أسبوعًا بعدها.</p>}
                {outside.length > 0 && <p className="ats-warn" role="status">{outside.length === 1 ? 'واحد من المحددين ليس' : `${outside.length} من المحددين ليسوا`} من متوقعي هذه الجلسة، فلن يُسجَّل{outside.length === 1 ? '' : 'وا'}{outside.map((id) => names[id]).filter(Boolean).length ? `: ${outside.map((id) => names[id]).filter(Boolean).join('، ')}` : ''}.</p>}
                {result && (
                  <div className={`ats-result ${result.tone}`} role="status" data-testid="ats-result">
                    <b>{result.tone === 'bad' ? result.text : `حُفظ: ${result.text}`}</b>
                    {result.refused.length > 0 && <ul>{result.refused.map((x) => <li key={x.id}>{x.name}: {x.message}</li>)}</ul>}
                  </div>
                )}
                {people.length > 0 && (
                  <div className="ats-tools">
                    <input type="search" className="ats-input" aria-label="ابحث بالاسم" placeholder="ابحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} />
                    {writable && <button type="button" className="ats-btn" onClick={() => setChecked((c) => allChecked(c, shown))} disabled={!shown.some((p) => !checked.has(p.id))}>{q.trim() ? 'علّم المعروضين حاضرين' : 'علّم الكل حاضرًا'}</button>}
                    {dirty && <button type="button" className="ats-link" onClick={() => { setChecked(initialChecked(people)); setBlock(null); }}>تراجع عن التغييرات</button>}
                  </div>
                )}
              </div>

              {!people.length ? <div className="ats-empty"><b>لا أحد متوقع حضوره في هذه الجلسة بعد</b><p>يظهر هنا من اعتُمد مساره وانطبق عليه نشاط الحضور من أعضاء الدفعة.</p></div>
                : !shown.length ? <div className="ats-empty"><b>لا اسم يطابق بحثك</b><p><button type="button" className="ats-link" onClick={() => setQ('')}>امسح البحث</button></p></div>
                  : (
                    <ul className="ats-list" aria-label="المتوقع حضورهم">{shown.map((p) => {
                      const on = checked.has(p.id);
                      const st = stateAr(p.attendance, { when });
                      const free = writable && canToggle(p, role);
                      const pending = on && !p.attendance ? 'add' : !on && p.attendance ? 'remove' : '';
                      return (
                        <li key={p.id} className={`ats-row${pending ? ` is-${pending}` : ''}${p.attendance ? ' is-present' : ''}${writable ? '' : ' no-box'}`}>
                          <label>
                            {writable && <input type="checkbox" checked={on} disabled={!free} title={free ? undefined : lockedWhy(p, role)} onChange={() => setChecked((c) => toggled(people, c, p.id, role))} />}
                            <span className="ats-who"><b>{p.full_name}</b>
                              {(p.email || p.organization_name) && <small>{p.email && <bdi dir="ltr">{p.email}</bdi>}{p.email && p.organization_name ? ' · ' : ''}{p.organization_name || ''}</small>}</span>
                            <span className="ats-chips">
                              {pending !== 'add' && <span className={`ats-chip${p.attendance ? ' ok' : ''}`}>{st.label}</span>}
                              {pending === 'add' && <span className="ats-chip new">يُسجَّل عند الحفظ</span>}
                              {pending === 'remove' && <span className="ats-chip gone">{selfMarked(p.attendance) ? 'يُلغى عند الحفظ بسبب' : 'يُلغى عند الحفظ'}</span>}
                            </span>
                            {st.detail && <small className="ats-detail" dir="auto">{st.detail}</small>}
                          </label>
                        </li>
                      );
                    })}</ul>
                  )}

              {writable && people.length > 0 && (
                <footer className="ats-foot">
                  <div className="ats-reason">
                    <label className="ats-field">
                      <span>سبب التسجيل اليدوي {role === 'trainer' ? '(مطلوب)' : '(اختياري)'}</span>
                      <select className="ats-input" value={why} onChange={(e) => { setWhy(e.target.value); setBlock(null); }} aria-invalid={block?.field === 'reason' && !reason} aria-describedby={block ? 'ats-block' : undefined}>
                        <option value="">{role === 'trainer' ? 'اختر السبب' : 'بلا سبب'}</option>
                        {MARK_REASONS_AR.map((x) => <option key={x} value={x}>{x}</option>)}
                        <option value="other">سبب آخر</option>
                      </select>
                    </label>
                    {why === 'other' && <input type="text" className="ats-input" aria-label="اكتب السبب" placeholder="اكتب السبب" maxLength={MARK_REASON_MAX} value={other} onChange={(e) => { setOther(e.target.value); setBlock(null); }} />}
                  </div>
                  {block && <p className="ats-err" id="ats-block" role="alert">{block.message}</p>}
                  <button type="button" className="ats-btn primary" onClick={review} disabled={!dirty}>{dirty ? 'راجع واحفظ' : 'لا تغيير للحفظ'}</button>
                </footer>
              )}
            </>
          )}

        {leaving && (
          <div className="ats-leave" role="alertdialog" aria-label="تغييرات لم تُحفظ">
            <p>في الورقة تغييرات لم تُحفظ. إغلاقها يتركها.</p>
            <div className="ats-actions">
              <button type="button" className="ats-btn" onClick={() => setLeaving(false)}>ابقَ في الورقة</button>
              <button type="button" className="ats-btn danger" onClick={() => onClose(changed.current)}>أغلق بلا حفظ</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
