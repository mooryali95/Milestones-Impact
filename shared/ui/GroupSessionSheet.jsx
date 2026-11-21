// ════════════════════════════════════════════════════════════════
// ورقة حضور الجلسة الجماعية مع المستشار: مشتركة بين لوحة الإدارة وبوابة المستشار (تصور تشغيل الدفعة 2026-11-19، 4.4، المرحلة 5)
// ════════════════════════════════════════════════════════════════
// على نمط ورقة حضور الورشة (AttendanceSheet وأصنافها ats-*): ورقة واحدة وحفظ واحد. لكل مدعو «حضر، لم يحضر، اعتذر»، و«الكل حضر»
// ثم تستثني، وملاحظة اختيارية للورقة. الورقة لا تعرف مصدرها: load وsave يمرّرهما المستعمل (admin.coaching-groups و
// admin.coaching-group-mark، أو xp.coaching-group وxp.coaching-group-mark)، فالكاتب واحد على الخادم (markGroup).
// للمستشار: الأسماء وحدها بلا بريد، وما أكّده غيره مقفل. والمنطق في group-sheet.js.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUnsavedFlag } from './unsaved-registry.js';
import { allAttended, canEdit, countsAr, draftAr, filterPeople, GROUP_CHOICES, GROUP_NOTE_MAX, GROUP_STATE_AR, groupCounts, groupMarks, savedAr, stateOf, withState } from './group-sheet.js';

/**
 * @param {{ load: () => Promise<any>, save: (body: { marks: { id: string, state: string }[], note: string }) => Promise<any>, onClose: (changed: boolean) => void,
 *   role?: 'admin' | 'expert', canWrite?: boolean, title?: string, sub?: string }} p
 */
export default function GroupSessionSheet({ load, save, onClose, role = 'admin', canWrite = true, title = '', sub = '' }) {
  const [d, setD] = useState(null);
  const [draft, setDraft] = useState({});
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const changed = useRef(false);

  const read = useCallback(async () => { setD((await load()) || { success: false }); }, [load]);
  useEffect(() => { read(); }, [read]);

  const people = d?.success ? d.people || [] : [];
  const writable = canWrite && d?.success && d.sheet !== false;
  const marks = useMemo(() => groupMarks(people, draft), [people, draft]);
  const dirty = writable && marks.length > 0;
  const shown = useMemo(() => filterPeople(people, q), [people, q]);
  const counts = groupCounts(people, draft);
  useUnsavedFlag(dirty);

  const close = useCallback(() => { if (dirty && !busy) setLeaving(true); else onClose(changed.current); }, [dirty, busy, onClose]);
  const state = useRef({});
  state.current = { busy, leaving, close };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const s = state.current;
      if (s.busy) return;
      e.stopPropagation();
      if (s.leaving) setLeaving(false); else s.close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const commit = async () => {
    setBusy(true);
    const r = await save({ marks, note: note.trim() });
    if (!r?.success) {
      // رفض أو تعذّر اتصال: المسودة تبقى، والقائمة تُقرأ من جديد فلا يُعرض ما حُفظ فعلًا كأنه لم يُحفظ
      setResult({ tone: 'bad', text: r?.message || 'تعذّر الحفظ. أعد المحاولة.', refused: [] });
      const fresh = await load();
      if (fresh?.success) setD(fresh);
      setBusy(false);
      return;
    }
    changed.current = true;
    setResult(savedAr(r, (id) => people.find((p) => p.id === id)?.full_name || ''));
    setDraft({}); setNote('');
    await read();
    setBusy(false);
  };

  const heading = title || d?.session?.title || 'ورقة حضور الجلسة';
  return (
    <div className="ats-ov" onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <div className="ats gss" role="dialog" aria-modal="true" aria-label="ورقة حضور الجلسة الجماعية" data-testid="group-sheet">
        <header className="ats-head">
          <div className="ats-titles">
            <h3>{heading}</h3>
            {sub && <p className="ats-sub">{sub}</p>}
          </div>
          <button type="button" className="ats-x" onClick={close} disabled={busy} aria-label="إغلاق">✕</button>
        </header>

        {!d ? <div className="ats-wait" role="status">جارٍ تحميل المدعوين…</div>
          : !d.success ? (
            <div className="ats-body">
              <p className="ats-err" role="alert">{d.message || 'تعذّرت قراءة ورقة الجلسة.'} <button type="button" className="ats-link" onClick={() => { setD(null); read(); }}>أعد المحاولة</button></p>
            </div>
          ) : (
            <>
              <div className="ats-top">
                <p className="ats-count" aria-live="polite"><b>{countsAr(counts)}</b>{dirty && <span className="ats-draft"> · لم يُحفظ بعد</span>}</p>
                {role === 'expert' && d.sheet === false && <p className="ats-fine">الورقة للقراءة الآن: تسجيلك يُفتح قبل الجلسة بساعة ويبقى أسبوعًا بعدها.</p>}
                {result && (
                  <div className={`ats-result ${result.tone}`} role="status" data-testid="gss-result">
                    <b>{result.tone === 'bad' ? result.text : `حُفظ: ${result.text}`}</b>
                    {result.refused.length > 0 && <ul>{result.refused.map((x) => <li key={x.id}>{x.name}: {x.message}</li>)}</ul>}
                  </div>
                )}
                {people.length > 0 && (
                  <div className="ats-tools">
                    {people.length > 8 && <input type="search" className="ats-input" aria-label="ابحث بالاسم" placeholder="ابحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} />}
                    {writable && <button type="button" className="ats-btn" onClick={() => setDraft((x) => allAttended(people, x, role))} disabled={!people.some((p) => canEdit(p, role) && stateOf(p, draft) === 'booked')}>الكل حضر</button>}
                    {dirty && <button type="button" className="ats-link" onClick={() => setDraft({})}>تراجع عن التغييرات</button>}
                  </div>
                )}
              </div>

              {!people.length ? <div className="ats-empty"><b>لا مدعوين في هذه الجلسة</b></div>
                : !shown.length ? <div className="ats-empty"><b>لا اسم يطابق بحثك</b><p><button type="button" className="ats-link" onClick={() => setQ('')}>امسح البحث</button></p></div>
                  : (
                    <ul className="ats-list gss-list" aria-label="المدعوون">{shown.map((p) => {
                      const cur = stateOf(p, draft);
                      const free = writable && canEdit(p, role);
                      const pending = cur !== p.state;
                      return (
                        <li key={p.id} className={`gss-row${pending ? ' is-changed' : ''}`}>
                          <div className="gss-line">
                            <span className="ats-who"><b>{p.full_name}</b>
                              {(p.email || p.test || p.off) && <small>{p.email && <bdi dir="ltr">{p.email}</bdi>}{p.test ? ' · حساب اختبار' : ''}{p.off ? ' · خارج الرصيد' : ''}</small>}
                              {!free && writable && <small>أكّده غيرك، وتغييره للإدارة</small>}
</span>
                            {free ? (
                              <span className="gss-choices" role="radiogroup" aria-label={`حضور ${p.full_name}`}>
                                {GROUP_CHOICES.map((s) => (
                                  <label key={s} className={`gss-choice s-${s}${cur === s ? ' on' : ''}`}>
                                    <input type="radio" name={`gss-${p.id}`} value={s} checked={cur === s} onChange={() => setDraft((x) => withState(people, x, p.id, s))} />
                                    <span>{GROUP_STATE_AR[s]}</span>
                                  </label>
                                ))}
                                {cur !== 'booked' && <button type="button" className="ats-link gss-undo" onClick={() => setDraft((x) => withState(people, x, p.id, 'booked'))} aria-label={`تراجع عن تسجيل ${p.full_name}`}>تراجع</button>}
                              </span>
                            ) : <span className={`ats-chip${cur === 'attended' ? ' ok' : cur === 'no_show' ? ' gone' : ''}`}>{GROUP_STATE_AR[cur] || cur}</span>}
                          </div>
                        </li>
                      );
                    })}</ul>
                  )}

              {writable && people.length > 0 && (
                <footer className="ats-foot">
                  <label className="ats-field">
                    <span>ملاحظة للورقة (اختيارية، تُحفظ في السجل)</span>
                    <input type="text" className="ats-input" value={note} maxLength={GROUP_NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="مثل: انعقدت في القاعة بدل الرابط" />
                  </label>
                  <button type="button" className="ats-btn primary" onClick={commit} disabled={!dirty || busy}>{busy ? 'يُحفظ…' : dirty ? `احفظ: ${draftAr(marks)}` : 'لا تغيير للحفظ'}</button>
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
