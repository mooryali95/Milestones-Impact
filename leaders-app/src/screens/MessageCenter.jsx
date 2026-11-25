// ════════════════════════════════════════════════════════════════
// مركز الرسائل المشترك: صندوق ما أرسلناه (وصل بالبريد أو كُتم) وما يصل بالبريد لكل فئة، للمشارك والخبير والمنسق
// ════════════════════════════════════════════════════════════════
// المكوّن واحد والبيانات من إجراءات صاحبه (messages.ts): المشارك me.messages، والخبير xp.messages، والمنسق
// coord.mail-prefs (تفضيلات وحدها، inbox=false). الخادم يحدد صاحب المركز من الجلسة، فلا معرّف يُرسل من هنا.
// الفئات ونصوصها من MAIL_CATEGORIES وMESSAGES_TEXT في labels.js. رابط ذيل البريد يفتحه: ?tab=messages&prefs=<الفئة>
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MAIL_CATEGORIES, MESSAGES_TEXT } from '../../../supabase/functions/leaders-api/labels.js';
import { Empty, ErrorBox, Notice, Skel, useNotice } from '../ui.jsx';

const when = (iso) => new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

/**
 * @param {{ call: (action: string, body?: object) => Promise<any>, actions: { list: string, read?: string, prefs: string },
 *   inbox?: boolean, text?: Partial<typeof MESSAGES_TEXT>, onBack?: () => void, backLabel?: string, onUnread?: (n: number) => void, focus?: string }} props
 */
export default function MessageCenter({ call, actions, inbox = true, text, onBack, backLabel = 'رجوع', onUnread, focus: initialFocus }) {
  const T = { ...MESSAGES_TEXT, ...(text || {}) };
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, say] = useNotice();
  const prefsRef = useRef(null);
  const [focus] = useState(() => { if (initialFocus != null) return initialFocus; try { return new URLSearchParams(location.search).get('prefs') || ''; } catch { return ''; } });

  const load = useCallback(async () => {
    setErr('');
    const r = await call(actions.list);
    if (!r.success) { setErr(r.message || T.loadError); return; }
    setD(r); onUnread?.(r.unread);
  }, [onUnread, call, actions.list]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (d && focus) prefsRef.current?.scrollIntoView?.({ block: 'start' }); }, [d, focus]);

  const read = async (ids) => {
    const r = await call(actions.read, ids ? { ids } : { all: true });
    if (!r.success) { say(r.message, true); return; }
    const at = new Date().toISOString();
    setD((x) => {
      const items = x.items.map((i) => (!i.read_at && (!ids || ids.includes(i.id)) ? { ...i, read_at: at } : i));
      const unread = ids ? Math.max(0, x.unread - items.filter((i, k) => i.read_at && !x.items[k].read_at).length) : 0;
      onUnread?.(unread);
      return { ...x, items, unread };
    });
  };
  const toggle = async (key) => {
    const muted = d.muted.includes(key) ? d.muted.filter((k) => k !== key) : [...d.muted, key];
    setBusy(true);
    const r = await call(actions.prefs, { muted });
    setBusy(false);
    if (!r.success) { say(r.message, true); return; }
    setD((x) => ({ ...x, muted: r.muted }));
    say(T.saved);
  };

  if (err && !d) return <div className="page narrow stack"><h1>{T.title}</h1><ErrorBox message={err} onRetry={load} /></div>;
  if (!d) return (
    <div className="page narrow stack" aria-busy="true" aria-label="جارٍ التحميل">
      <Skel h={28} w="40%" />{[0, 1, 2].map((i) => <div key={i} className="card"><Skel h={16} w="60%" /><Skel h={12} style={{ marginTop: 8 }} /></div>)}
    </div>
  );
  return (
    <div className="page narrow stack msgs">
      <header className="stack">
        <h1>{T.title}</h1>
        <p className="muted">{T.lead}</p>
      </header>
      <Notice note={note} onClose={() => say(null)} />
      {inbox && (
      <section className="card stack" aria-labelledby="msgs-h">
        <div className="row between">
          <h2 id="msgs-h">{T.tab}{d.unread > 0 && <span className="la-chip" style={{ marginInlineStart: 8 }}>{d.unread} {T.unread}</span>}</h2>
          {d.unread > 0 && <button type="button" className="link small" onClick={() => read(null)}>{T.markAll}</button>}
        </div>
        {d.items.length === 0 ? <Empty title={T.empty} /> : (
          <ul className="msgs-list" role="list">
            {d.items.map((m) => (
              <li key={m.id} className={`msgs-item${m.read_at ? '' : ' unread'}`}>
                <details onToggle={(e) => { if (e.currentTarget.open && !m.read_at) read([m.id]); }}>
                  <summary>
                    {!m.read_at && <span className="sr-only">{T.unread}: </span>}
                    <b>{m.title}</b>
                    <span className="small muted"> · {MAIL_CATEGORIES[m.category]?.label || ''} · {when(m.created_at)}{!m.emailed ? ` · ${T.muted}` : ''}</span>
                  </summary>
                  {m.excerpt && <p className="small" style={{ whiteSpace: 'pre-line' }}>{m.excerpt}</p>}
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
      <section ref={prefsRef} id="prefs" className="card stack" aria-labelledby="prefs-h">
        <h2 id="prefs-h">{T.prefs}</h2>
        <p className="small muted">{T.prefsLead}</p>
        <ul className="stack" role="list">
          {d.categories.map((c) => (
            <li key={c.key} className={`row between msgs-pref${focus === c.key ? ' focus' : ''}`}>
              <label className="grow" htmlFor={`pref-${c.key}`}>
                <b>{c.label}</b>
                <span className="small muted" style={{ display: 'block' }}>{c.hint}</span>
              </label>
              {c.locked
                ? <span className="small muted" id={`pref-${c.key}`}>{T.locked}</span>
                : <input id={`pref-${c.key}`} type="checkbox" role="switch" checked={!d.muted.includes(c.key)} disabled={busy} onChange={() => toggle(c.key)}
                    aria-describedby={`pref-${c.key}-s`} />}
              {!c.locked && <span id={`pref-${c.key}-s`} className="sr-only">{d.muted.includes(c.key) ? T.muted : ''}</span>}
            </li>
          ))}
        </ul>
      </section>
      {onBack && <button type="button" className="link small" onClick={onBack}>{backLabel}</button>}
    </div>
  );
}
