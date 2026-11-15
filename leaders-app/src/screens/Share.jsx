// ════════════════════════════════════════════════════════════════
// المشاركة والملاحظات: روابط خاصة لوثيقة المبادرة، وملاحظات من يفتحها لصاحبها وحده
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-15-تصور-تصدير-المبادرة-ومشاركتها-v1.md. الخادم share.ts، والمنطق share.js.
// لكل رابط: لمن أُعطي، ومدته، وهل يكتب قارئه ملاحظة، وهل يحمّل PDF، وهل يرى المستوى والمسار. يُغيَّر متى شاء ويُلغى فورًا.
import React, { useEffect, useMemo, useState } from 'react';
import { call } from '../api.js';
import { SHARE_DAYS, SHARE_STATE_AR } from '../../../supabase/functions/leaders-api/share.js';
import { dateAr } from '../../../supabase/functions/leaders-api/capstone.js';
import { countAr } from '../../../supabase/functions/leaders-api/labels.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '·');
const OPTS = [
  ['allow_notes', 'يكتب ملاحظة لي', 'تصلك وحدك، ولا يراها قارئ آخر'],
  ['allow_download', 'يحمّل ملف PDF', 'وإلا يقرأ الوثيقة في الصفحة فقط'],
  ['show_levels', 'يرى مستواي ومساري', 'مخفيان افتراضيًا'],
];

/** ملخص في صفحة المبادرة: عدد الروابط النشطة والملاحظات الجديدة، وزر يفتح اللوحة */
export function ShareCard({ data, onOpen }) {
  if (!data?.success || !data.ready || !data.enabled) return null;
  const active = data.shares.filter((s) => s.state === 'active').length;
  const unread = data.notes.filter((n) => !n.read_at).length;
  return (
    <section className="card sh-card" aria-labelledby="sh-card-h">
      <h3 id="sh-card-h">المشاركة والملاحظات {unread > 0 && <span className="chip gold" data-unread>{countAr(unread, 'ملاحظة جديدة', 'ملاحظتان جديدتان', 'ملاحظات جديدة', 'ملاحظة جديدة')}</span>}</h3>
      <p className="muted small">شارك وثيقتك برابط خاص لمن تشاء: مديرك، أو لجنة، أو زميل. تختار ما يراه ويفعله، وتلغيه متى شئت.</p>
      <p className="small">{active ? countAr(active, 'رابط نشط واحد', 'رابطان نشطان', 'روابط نشطة', 'رابطًا نشطًا') : 'لا رابط نشط بعد'}</p>
      <button type="button" className="btn ghost block" onClick={onOpen}>{active || data.notes.length ? 'إدارة المشاركة والملاحظات' : 'شارك مبادرتك'}</button>
    </section>
  );
}

function Toggle({ on, label, hint, disabled, onChange }) {
  return (
    <label className={`sh-toggle${disabled ? ' off' : ''}`}>
      <input type="checkbox" checked={!!on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="sh-switch" aria-hidden="true" />
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </label>
  );
}

function NewLink({ notesEnabled, onCreated }) {
  const [f, setF] = useState({ label: '', days: 30, allow_notes: true, allow_download: true, show_levels: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await call('capstone.share-create', { ...f, allow_notes: notesEnabled && f.allow_notes });
    setBusy(false);
    if (!r.success) return setErr(r.message);
    onCreated(r);
    setF((x) => ({ ...x, label: '' }));
  };
  return (
    <form className="sh-new" onSubmit={create}>
      <label className="field"><span>لمن هذا الرابط؟</span>
        <input className="input" maxLength={80} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="مثل: مديري، لجنة الابتكار، زميل في الإدارة" required /></label>
      <fieldset className="sh-days">
        <legend>مدته</legend>
        {SHARE_DAYS.map((d) => (
          <label key={d} className={f.days === d ? 'on' : ''}><input type="radio" name="sh-days" checked={f.days === d} onChange={() => setF({ ...f, days: d })} />{d === 7 ? 'أسبوع' : d === 30 ? 'شهر' : 'ثلاثة أشهر'}</label>
        ))}
      </fieldset>
      <fieldset className="sh-opts">
        <legend>من يفتحه</legend>
        {OPTS.map(([k, l, h]) => (
          <Toggle key={k} on={k === 'allow_notes' ? notesEnabled && f[k] : f[k]} label={l} hint={k === 'allow_notes' && !notesEnabled ? 'غير متاحة في دفعتك الآن' : h}
            disabled={k === 'allow_notes' && !notesEnabled} onChange={(v) => setF({ ...f, [k]: v })} />
        ))}
      </fieldset>
      {err && <div className="alert err" role="alert">{err}</div>}
      <button className="btn gold" disabled={busy}>{busy ? 'لحظة…' : 'أنشئ الرابط'}</button>
    </form>
  );
}

function Created({ url, label, onDone }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); } };
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  return (
    <div className="sh-created" role="status">
      <b>الرابط جاهز: «{label}»</b>
      <p className="small muted">يظهر هنا مرة واحدة فقط، لأنه لا يُحفظ عندنا إلا مشفّرًا. انسخه الآن وأرسله لصاحبه.</p>
      <div className="sh-url"><code dir="ltr">{url}</code></div>
      <div className="row">
        <button type="button" className="btn gold sm" onClick={copy}>{copied ? 'نُسخ ✓' : 'انسخ الرابط'}</button>
        {canShare && <button type="button" className="btn ghost sm" onClick={() => navigator.share({ title: 'وثيقة مبادرتي', url }).catch(() => {})}>أرسله…</button>}
        <button type="button" className="link small" onClick={onDone}>تم</button>
      </div>
    </div>
  );
}

function LinkRow({ s, notesEnabled, onChange }) {
  const [busy, setBusy] = useState(false);
  const active = s.state === 'active';
  const set = async (patch) => {
    setBusy(true);
    const r = await call('capstone.share-update', { id: s.id, ...patch });
    setBusy(false);
    if (r.success) onChange();
  };
  const revoke = async () => {
    if (!window.confirm(`يُلغى رابط «${s.label}» فورًا، ولا يفتحه أحد بعده. متابعة؟`)) return;
    setBusy(true);
    await call('capstone.share-revoke', { id: s.id });
    setBusy(false);
    onChange();
  };
  return (
    <li className={`sh-link ${s.state}`} data-share={s.state}>
      <header>
        <b>{s.label}</b>
        <span className={`chip ${active ? 'ok' : ''}`}>{SHARE_STATE_AR[s.state]}</span>
      </header>
      <p className="small muted">
        {active ? `ينتهي ${dateAr(s.expires_at.slice(0, 10))}` : `أُنشئ ${dateAr(s.created_at.slice(0, 10))}`}
        {' · '}{s.views ? `${countAr(s.views, 'مشاهدة واحدة', 'مشاهدتان', 'مشاهدات', 'مشاهدة')}، آخرها ${when(s.last_viewed_at)}` : 'لم يُفتح بعد'}
        {s.notes ? ` · ${countAr(s.notes, 'ملاحظة واحدة', 'ملاحظتان', 'ملاحظات', 'ملاحظة')}` : ''}
      </p>
      {active && (
        <div className="sh-opts inline">
          {OPTS.map(([k, l]) => <Toggle key={k} on={s[k]} label={l} disabled={busy || (k === 'allow_notes' && !notesEnabled)} onChange={(v) => set({ [k]: v })} />)}
        </div>
      )}
      {active && <div className="row"><button type="button" className="link small danger" disabled={busy} onClick={revoke}>ألغِ الرابط</button></div>}
    </li>
  );
}

function Notes({ notes, shares, sections, onChange }) {
  const [only, setOnly] = useState('');
  const shown = useMemo(() => notes.filter((n) => !only || n.share_id === only), [notes, only]);
  const unread = shown.filter((n) => !n.read_at);
  const mark = async (ids, patch) => { await call('capstone.note-mark', { ids, ...patch }); onChange(); };
  const title = (k) => sections?.find((s) => s.key === k)?.title || null;
  if (!notes.length) return <p className="sh-empty muted">لا ملاحظات بعد. حين تفتح الملاحظات في رابط، يكتب قارئه هنا ملاحظته لك وحدك.</p>;
  return (
    <div className="sh-notes">
      <div className="row between">
        <label className="field sh-filter"><span className="sr-only">من أي رابط</span>
          <select className="input" value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="">كل الروابط</option>
            {shares.filter((s) => s.notes).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select></label>
        {unread.length > 0 && <button type="button" className="link small" onClick={() => mark(unread.map((n) => n.id), { read: true })}>علّم الكل مقروءًا</button>}
      </div>
      <ol className="sh-note-list">
        {shown.map((n) => (
          <li key={n.id} className={`sh-note${n.read_at ? '' : ' new'}`} data-note={n.read_at ? 'read' : 'new'}>
            <header>
              <span className="sh-avatar" aria-hidden="true">{n.author_name.trim()[0]}</span>
              <div className="grow"><b>{n.author_name}</b>{n.author_role && <small> · {n.author_role}</small>}
                <small className="muted">{when(n.created_at)} · من رابط «{n.share_label || '·'}»{title(n.section_key) ? ` · عن «${title(n.section_key)}»` : ''}</small></div>
              {!n.read_at && <span className="sh-dot" aria-label="جديدة" />}
            </header>
            <p>{n.body}</p>
            <div className="row">
              <button type="button" className="link small" onClick={() => mark([n.id], { read: !n.read_at })}>{n.read_at ? 'علّمها جديدة' : 'تمت القراءة'}</button>
              <button type="button" className="link small" onClick={() => mark([n.id], { archived: true, read: true })}>أرشفة</button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** لوحة المشاركة والملاحظات كاملة */
export default function SharePanel({ initiative, sections, onBack, onChanged = () => {} }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('links');
  const [created, setCreated] = useState(null);
  const load = () => call('capstone.shares').then((r) => { setD(r); onChanged(r); });
  useEffect(() => { load(); }, []);
  if (!d) return <div className="center-load"><div className="spinner" /></div>;
  if (!d.success) return <div className="alert err">{d.message}</div>;
  const unread = d.notes.filter((n) => !n.read_at).length;
  return (
    <div className="sh-panel">
      <button className="link small" onClick={onBack}>→ وثيقة مبادرتك</button>
      <header className="sh-hero">
        <span className="book-eyebrow">المشاركة والملاحظات</span>
        <h1>شارك «{initiative || 'مبادرتك'}»</h1>
        <p>رابط خاص لكل من تعطيه: يقرأ الوثيقة بتصميمها كاملة دون حساب، ويفعل ما تسمح به في رابطه وحده. الملاحظات تصلك أنت فقط.</p>
      </header>
      {!d.ready ? <div className="alert info">المشاركة برابط تُفعَّل قريبًا.</div> : !d.enabled ? <div className="alert info">المشاركة برابط غير متاحة في دفعتك الآن.</div> : (
        <>
          <div className="book-tablist sh-tabs" role="tablist" aria-label="المشاركة والملاحظات">
            <button role="tab" aria-selected={tab === 'links'} className={tab === 'links' ? 'on' : ''} onClick={() => setTab('links')}>الروابط</button>
            <button role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>الملاحظات{unread ? ` (${unread} جديدة)` : ''}</button>
          </div>
          {tab === 'links' && (
            <div className="sh-grid">
              <section className="card">
                <h2>رابط جديد</h2>
                {created ? <Created url={created.url} label={created.share.label} onDone={() => setCreated(null)} />
                  : <NewLink notesEnabled={d.notes_enabled} onCreated={(r) => { setCreated(r); load(); }} />}
              </section>
              <section className="card">
                <h2>روابطك</h2>
                {d.shares.length ? <ol className="sh-links">{d.shares.map((s) => <LinkRow key={s.id} s={s} notesEnabled={d.notes_enabled} onChange={load} />)}</ol>
                  : <p className="sh-empty muted">لم تنشئ رابطًا بعد.</p>}
              </section>
            </div>
          )}
          {tab === 'notes' && <section className="card"><Notes notes={d.notes} shares={d.shares} sections={sections} onChange={load} />{d.archived > 0 && <p className="small muted">{countAr(d.archived, 'ملاحظة مؤرشفة', 'ملاحظتان مؤرشفتان', 'ملاحظات مؤرشفة', 'ملاحظة مؤرشفة')}.</p>}</section>}
        </>
      )}
    </div>
  );
}
