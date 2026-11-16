// ════════════════════════════════════════════════════════════════
// المساعد الآلي: الحالة والتحكم، والمفتاح بتحقق إضافي، والإنفاق، والمحادثات، والتقييم، ومرافق الجهات
// ════════════════════════════════════════════════════════════════
// للمدير الأعلى والمالك (المالك بدور آخر يرى بلا كتابة). الحقائق من admin.agent-* والحكم في agent-admin.js وحده.
// المفتاح يُلصق في حقل كتابة فقط لا يُحفظ في أي مخزن، ويُمسح بعد الإرسال وعند الطي وعند مغادرة الشاشة.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { L } from '../leaders.js';
import StepUp from '../StepUp.jsx';
import { Empty, Spinner, useEscape, useUI } from '../ui.jsx';
import { dateTime } from '../dates.js';
import { agoAr } from '../../../supabase/functions/leaders-api/ops-health.js';
import { convSummary, count, enableBlock, EVAL_ESTIMATE_MICROS, gateText, KEY_ERROR_AR, keyLooksValid, keyMessage, keySummary, LEVEL_ICON, orgsSummary, peakDay, pct, ringLevel,
  RUN_STATUS_AR, runEvalLoop, runSummary, seriesScale, SET_AR, short, spendSummary, stateSummary, stopAr, systemLine, usd, usd2 } from '../agent-admin.js';
import { navigate } from '../route.js';
import { GuidanceCap } from './AppSettings.jsx';
import { normAction, normConversations, normKeySet, normRunDetail, normRuns, normState, normStep, normTranscript, normUsage } from '../agent-data.js';
import '../agent-admin.css';

// كل رد يمر بموحّده (agent-data.js) قبل أن يُرسم: شكل واحد مضمون، فلا يكسر الشاشة صف ناقص أو قديم من الإنتاج
const A = (action, body, norm = normAction) => L(action, body).then(norm, () => norm(null));
const when = (iso) => (iso ? agoAr(iso) || dateTime(iso) : null);
const SHUT_KEY = 'ag.shut';
const readShut = () => { try { return new Set(JSON.parse(localStorage.getItem(SHUT_KEY) || '[]')); } catch { return new Set(); } };

function Row({ label, children }) {
  return <div className="ops-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

// قسم قابل للطي بسطر خلاصة: الرمز والكلمة مع اللون
function AgentSection({ id, title, summary, open, onToggle, fixed = false, children }) {
  const lv = summary?.level || 'green';
  return (
    <section className={`la-card ag-sec ag-${lv}`} aria-labelledby={`${id}-h`} id={id}>
      <h3 id={`${id}-h`} className="ag-sec-h">
        {fixed ? <span className="ag-sec-title">{title}</span> : (
          <button type="button" className="ag-sec-btn" aria-expanded={open} aria-controls={`${id}-b`} onClick={onToggle}>
            <span className="ag-chev" aria-hidden="true">{open ? '▾' : '◂'}</span><span className="ag-sec-title">{title}</span>
          </button>
        )}
      </h3>
      <p className="ag-sum"><span className="ops-ic sm" aria-hidden="true">{LEVEL_ICON[lv]}</span>{summary?.text || ''}</p>
      {open && <div id={`${id}-b`} className="ag-sec-b">{children}</div>}
    </section>
  );
}

// ── 1) الحالة والتحكم ──
function StatusSection({ s, reload, writable }) {
  const { confirm, toast } = useUI();
  const [busy, setBusy] = useState(false);
  const block = enableBlock(s);
  const gate = gateText(s, when);
  const toggle = async (on) => {
    if (!(await confirm(on ? 'تفعيل المساعد الآلي للزوار الآن؟ يظهر الزر في الموقع خلال دقيقة.' : 'إطفاء المساعد الآلي الآن؟ يتوقف عن الرد خلال دقيقة، ويختفي الزر من الصفحات المفتوحة خلال 10 دقائق.', { ok: on ? 'فعّل' : 'أطفئ', danger: !on }))) return;
    setBusy(true);
    const r = await A('admin.agent-enable', { enabled: on });
    setBusy(false);
    toast(r.success ? (on ? 'فُعّل المساعد' : 'أُطفئ المساعد') : r.message);
    reload();
  };
  const k = s.key;
  return (
    <>
      <div className="ag-switch-row">
        <label className="of-switch">
          <input type="checkbox" checked={!!s.enabled} disabled={busy || !writable || (!s.enabled && !!block)} onChange={(e) => toggle(e.target.checked)} aria-describedby={!s.enabled && block ? 'ag-block' : undefined} />
          <span>{s.enabled ? 'مفعّل من اللوحة' : 'مطفأ من اللوحة'}</span>
        </label>
        {!s.enabled && block && <small id="ag-block" className="ag-why">{block}</small>}
      </div>
      <dl className="ag-grid">
        <Row label="النموذج"><code dir="ltr">{s.model}</code> {s.known_model ? <span className="ops-flag on">✓ في جدول الأسعار</span> : <span className="ops-flag off">✕ ليس في جدول الأسعار</span>}</Row>
        <Row label="المعرفة"><code dir="ltr">{s.versions.knowledge_version}</code></Row>
        <Row label="السقف اليومي">{(s.cap_cents / 100).toFixed(2)} دولار</Row>
        <Row label="مفتاح الطوارئ في الخادم">{s.env_mode === 'off' ? <span className="ops-flag off">✕ مفعّل: يطفئ المساعد مهما كان في هذه اللوحة</span> : <span className="ops-flag on">✓ غير مفعّل، فالتشغيل والإطفاء من هذه اللوحة</span>}</Row>
        <Row label="المفتاح">{keySummary(k).text} <small>التفاصيل في قسم «المفتاح»</small></Row>
        <Row label="بوابة التقييم"><span className={gate.ok ? 'ops-flag on' : 'ops-flag off'}>{gate.ok ? '✓' : '✕'} {gate.text}</span></Row>
      </dl>
      {s.enabled_at && <p className="la-muted small">آخر تغيير للتفعيل: {s.enabled_by} {when(s.enabled_at)}.</p>}
      <GuidanceCap />
    </>
  );
}

// ── 2) المفتاح ──
function KeySection({ s, reload, writable }) {
  const { toast, confirm } = useUI();
  const [key, setKey] = useState('');
  const [ask, setAsk] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  // يُمسح عند مغادرة الشاشة (والقسم يُفك عند الطي)
  useEffect(() => () => setKey(''), []);
  const k = s.key;
  const save = async () => {
    setBusy(true);
    const r = await A('admin.agent-key-set', { key: key.trim() }, normKeySet);
    setKey('');
    setBusy(false);
    if (!r.success) return setMsg({ bad: true, text: keyMessage(r) });
    setMsg({ bad: false, text: `حُفظ المفتاح ••••${r.key.last4}. يسري خلال دقيقة.${r.model_ok === false ? ' تنبيه: النموذج المضبوط لم يظهر في قائمة نماذج الحساب.' : ''}` });
    toast('حُفظ المفتاح');
    reload();
  };
  const clear = async () => {
    let force = false;
    if (s.enabled && !k.env_present) {
      if (!(await confirm('لا سر ANTHROPIC_API_KEY في الخادم، فالرجوع يطفئ المساعد. المتابعة؟', { danger: true, ok: 'ارجع وأطفئ' }))) return;
      force = true;
    } else if (!k.env_present) {
      if (!(await confirm('لا سر ANTHROPIC_API_KEY في الخادم، فيبقى المساعد بلا مفتاح حتى تحفظ مفتاحًا جديدًا، ولا يمكن تفعيله ولا تقييمه. المتابعة؟', { danger: true, ok: 'ارجع بلا مفتاح' }))) return;
    }
    setBusy(true);
    const r = await A('admin.agent-key-clear', { force });
    setBusy(false);
    setMsg(r.success ? { bad: false, text: 'عاد المفتاح إلى سر الخادم، وحُذف من Vault.' } : { bad: true, text: keyMessage(r) });
    reload();
  };
  const done = () => { const next = ask; setAsk(null); if (next === 'save') save(); else clear(); };
  return (
    <>
      <p>{k.source === 'db' ? <>المصدر: من اللوحة (<code dir="ltr">••••{k.last4}</code>{k.set_by ? `، ضبطه ${k.set_by} ${when(k.set_at) || ''}` : ''})</> : k.source === 'env' ? <>المصدر: سر الخادم <code dir="ltr">ANTHROPIC_API_KEY</code>{k.env_last4 && <> (<code dir="ltr">••••{k.env_last4}</code>)</>}</> : 'لا مفتاح'}</p>
      <dl className="ag-grid two">
        <Row label="آخر نجاح">{when(k.ok_at) || 'لا شيء بعد'}</Row>
        <Row label="آخر خطأ">{k.error ? <>{KEY_ERROR_AR[k.error] || k.error} {when(k.error_at)}</> : 'لا خطأ'}</Row>
      </dl>
      {writable ? (
        <form className="ag-key" onSubmit={(e) => { e.preventDefault(); if (keyLooksValid(key)) { setMsg(null); setAsk('save'); } else setMsg({ bad: true, text: keyMessage({ code: 'invalid_key' }) }); }}>
          <label htmlFor="ag-key-in">مفتاح جديد</label>
          <div className="la-row">
            <input id="ag-key-in" type="password" autoComplete="off" spellCheck={false} dir="ltr" placeholder="sk-ant-..." value={key} onChange={(e) => setKey(e.target.value)} />
            <button type="submit" className="btn-sm primary" disabled={busy || !key.trim()}>احفظ المفتاح</button>
            <button type="button" className="btn-sm ghost" disabled={busy || k.source !== 'db'} onClick={() => { setMsg(null); setAsk('clear'); }}>ارجع إلى سر الخادم</button>
          </div>
        </form>
      ) : <p className="la-muted">تغيير المفتاح للمدير الأعلى بجلسة مفتاح مرور أو تطبيق مصادقة.</p>}
      {msg && <p className={msg.bad ? 'la-err' : 'ag-ok'} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
      <p className="la-muted small">المفتاح لا يُعرض بعد حفظه أبدًا، ويُحفظ مشفرًا في Vault. يسري خلال دقيقة. ويصلك وأصحاب الحساب تنبيه بكل تغيير.</p>
      {ask && <StepUp title={ask === 'save' ? 'تأكيد حفظ مفتاح المساعد' : 'تأكيد الرجوع إلى سر الخادم'} onCancel={() => setAsk(null)} onDone={done} />}
    </>
  );
}

// ── 3) الإنفاق ──
function Ring({ spent, cap }) {
  const r = ringLevel(spent, cap);
  const C = 2 * Math.PI * 34;
  const label = `اليوم ${usd2(spent)} من ${usd2(cap)} دولار، ${Math.round(r.ratio * 100)}%، ${r.word}`;
  return (
    <div className={`ag-ring ag-${r.level}`}>
      <svg viewBox="0 0 80 80" role="img" aria-label={label}>
        <circle cx="40" cy="40" r="34" className="ag-ring-bg" />
        <circle cx="40" cy="40" r="34" className="ag-ring-fg" strokeDasharray={`${C * r.ratio} ${C}`} transform="rotate(-90 40 40)" />
        <text x="40" y="45" textAnchor="middle">{Math.round(r.ratio * 100)}%</text>
      </svg>
      <div><b>{usd2(spent)} من {usd2(cap)} دولار</b><span className="ag-ring-word"><span aria-hidden="true">{r.icon}</span> {r.word}</span></div>
    </div>
  );
}
function Bars({ series, cap }) {
  const max = seriesScale(series, cap);
  const peak = peakDay(series);
  const W = 300, H = 80, bw = W / Math.max(series.length, 1);
  const y = (v) => H - (Number(v) / max) * H;
  return (
    <figure className="ag-bars">
      <svg viewBox={`0 0 ${W} ${H + 2}`} preserveAspectRatio="none" role="img" aria-label={`الإنفاق في آخر 30 يومًا، أعلاه ${usd(Math.max(...series.map((d) => d.micros)))}`}>
        {series.map((d, i) => (
          <g key={d.day}>
            <rect className="ag-bar" x={i * bw + 1} width={bw - 2} y={y(d.micros)} height={H - y(d.micros)}><title>{`${d.day}: ${usd(d.micros)}${d.eval_micros ? `، منها التقييم ${usd(d.eval_micros)}` : ''}`}</title></rect>
            {d.eval_micros > 0 && <rect className="ag-bar-eval" x={i * bw + 1} width={bw - 2} y={y(Math.min(d.eval_micros, d.micros || d.eval_micros))} height={H - y(Math.min(d.eval_micros, d.micros || d.eval_micros))} />}
          </g>
        ))}
        <line className="ag-cap" x1="0" x2={W} y1={y(cap)} y2={y(cap)} />
      </svg>
      {/* الأيام من اليسار (الأقدم) إلى اليمين (اليوم)، فطرفا المحور مكتوبان */}
      <div className="ag-bars-ends" dir="ltr" aria-hidden="true"><span>قبل 30 يومًا</span><span>اليوم</span></div>
      <figcaption><span className="ag-key-sw spend" aria-hidden="true" /> الإنفاق <span className="ag-key-sw eval" aria-hidden="true" /> منه التقييم <span className="ag-key-sw cap" aria-hidden="true" /> السقف اليومي{peak && <span>أعلى يوم: {peak.day} بـ{usd(peak.micros)}</span>}</figcaption>
      {/* القيم اليومية للوحة المفاتيح واللمس، لا في تلميح الرسم وحده */}
      <details className="ag-days"><summary>القيم اليومية</summary>
        <table className="la-table"><thead><tr><th scope="col">اليوم</th><th scope="col">الإنفاق</th><th scope="col">منه التقييم</th></tr></thead>
          <tbody>{[...series].reverse().map((d) => <tr key={d.day}><td>{d.day}</td><td>{usd(d.micros)}</td><td>{d.eval_micros ? usd(d.eval_micros) : 'لا شيء'}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}
function SpendSection({ u, reload }) {
  if (!u) return <Spinner />;
  if (!u.success) return <div className="la-err" role="alert">{u.message || 'تعذّرت القراءة'} <button type="button" className="btn-sm ghost" onClick={reload}>أعد المحاولة</button></div>;
  return (
    <>
      <div className="ag-spend">
        <Ring spent={u.today.spent_micros} cap={u.today.cap_micros} />
        <Bars series={u.series} cap={u.today.cap_micros} />
      </div>
      <div className="ag-kpis">
        <div><b>{count(u.conversations)}</b><span>محادثة في 30 يومًا</span></div>
        <div><b>{count(u.handoffs)}</b><span>تحويل إلى الفريق</span></div>
        <div><b>{usd(u.avg_cost_micros)}</b><span>متوسط تكلفة المحادثة</span></div>
        <div><b>{usd(u.cache.saved_micros)}</b><span>توفير الذاكرة المؤقتة (الإصابة {pct(u.cache.hit_ratio)})</span></div>
      </div>
      <p className="la-muted small">الأجوبة الجاهزة {pct(u.canned_share)} من الردود. الأرقام من سجل الخادم، وقد تزيد قليلًا على فاتورة Anthropic لأن الاستدعاء المنقطع يُحسب بأسوأ تكلفته.</p>
    </>
  );
}

// ── 4) المحادثات ──
const dayInput = (ms) => new Date(ms + 3 * 36e5).toISOString().slice(0, 10);
const STATUS_AR = { bot: 'مع المساعد', waiting: 'محولة', closed: 'مغلقة' };
function Transcript({ id, onClose }) {
  const [d, setD] = useState(null);
  useEscape(onClose);
  const read = useCallback(() => { setD(null); A('admin.agent-transcript', { id }, normTranscript).then(setD); }, [id]);
  useEffect(() => { read(); }, [read]);
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="ag-panel" role="dialog" aria-modal="true" aria-labelledby="ag-tr-h">
        <header className="ag-panel-h"><h3 id="ag-tr-h">محادثة #{short(id)}</h3><button type="button" className="modal-close" aria-label="إغلاق" onClick={onClose}>✕</button></header>
        <p className="ag-note">فتح المحادثة يُسجَّل في سجل التدقيق.</p>
        {!d ? <Spinner /> : !d.success ? <div className="la-err" role="alert">{d.message || 'تعذّرت القراءة'} <button type="button" className="btn-sm ghost" onClick={read}>أعد المحاولة</button></div> : (
          <ol className="ag-msgs">
            {d.messages.map((m, i) => (
              <li key={i} className={`ag-msg ${m.role}`}>
                {m.role === 'system' ? <small>{systemLine(m.body)}</small> : <>
                  <span className="ag-who">{m.role === 'visitor' ? 'الزائر' : m.role === 'canned' ? 'جواب جاهز' : 'المساعد'}</span>
                  <p>{m.body}</p>
                  {m.role === 'agent' && m.tokens && <small className="ag-cost" dir="rtl">دخل {m.tokens.input} · من الذاكرة {m.tokens.cache_read} · خرج {m.tokens.output} · {usd(m.cost_micros)}</small>}
                  {m.role === 'canned' && <small className="ag-cost">بلا تكلفة</small>}
                </>}
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
function ConversationsSection({ onCount }) {
  const now = Date.now();
  const [f, setF] = useState({ from: dayInput(now - 7 * 864e5), to: dayInput(now), who: 'all', page: 1 });
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => {
    setD(null);
    const r = await A('admin.agent-conversations', { from: `${f.from}T00:00:00+03:00`, to: `${f.to}T23:59:59+03:00`, who: f.who, page: f.page }, normConversations);
    setD(r);
    if (r.success && f.who === 'all') {
      const c = await A('admin.agent-conversations', { from: `${f.from}T00:00:00+03:00`, to: `${f.to}T23:59:59+03:00`, who: 'contact', page: 1 }, normConversations);
      onCount({ total: r.total, contacts: c.success ? c.total : null });
    }
  }, [f, onCount]);
  useEffect(() => { load(); }, [load]);
  const pages = d && d.success ? Math.max(1, Math.ceil(d.total / d.per_page)) : 1;
  const badRange = !!f.from && !!f.to && f.from > f.to;
  return (
    <>
      <div className="ag-filters" role="group" aria-label="فلاتر المحادثات">
        <label>من<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, page: 1 })} /></label>
        <label>إلى<input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value, page: 1 })} /></label>
        <div className="ag-seg" role="radiogroup" aria-label="نوع المحادثة">
          {[['all', 'الكل'], ['contact', 'طلبوا التواصل'], ['visitor', 'زوار']].map(([k, t]) => (
            <button key={k} type="button" role="radio" aria-checked={f.who === k} className={f.who === k ? 'on' : ''} onClick={() => setF({ ...f, who: k, page: 1 })}>{t}</button>
          ))}
        </div>
      </div>
      {badRange ? <p className="la-err" role="alert">تاريخ «من» بعد تاريخ «إلى». صحّح المدة.</p> : !d ? <Spinner /> : !d.success ? <div className="la-err" role="alert">{d.message} <button type="button" className="btn-sm ghost" onClick={load}>أعد المحاولة</button></div>
        : !d.rows.length ? <Empty compact title="لا محادثات في هذه المدة" hint="غيّر المدة أو الفلتر." /> : (
          <>
            <p className="ag-swipe la-muted small">اسحب الجدول أفقيًا لرؤية بقية الأعمدة.</p>
            <div className="ag-scroll" tabIndex={0} role="region" aria-label="جدول المحادثات">
              <table className="la-table ag-table">
                <thead><tr><th scope="col">الشخص</th><th scope="col">الصفحة</th><th scope="col">اللغة</th><th scope="col">الرسائل</th><th scope="col">الاستدعاءات</th><th scope="col">التكلفة</th><th scope="col">التقييم</th><th scope="col">الحالة</th><th scope="col">التاريخ</th></tr></thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.id}>
                      <td><button type="button" className="la-link" onClick={() => setOpen(r.id)}>{r.contact ? <>{r.name} <small dir="ltr">{r.email}</small></> : <>{r.label} <code dir="ltr">#{r.short_id}</code></>}</button></td>
                      <td><code dir="ltr">{r.product}</code></td><td>{r.locale || '؟'}</td><td>{r.visitor_messages}</td><td>{r.model_calls}</td><td>{usd(r.cost_micros)}</td>
                      <td>{r.rating ? `${r.rating} من 5` : 'بلا'}</td><td>{STATUS_AR[r.status] || r.status}</td><td>{dateTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="la-row ag-pager">
              <button type="button" className="btn-sm ghost" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>السابق</button>
              <span>صفحة {f.page} من {pages} ({d.total} محادثة)</span>
              <button type="button" className="btn-sm ghost" disabled={f.page >= pages} onClick={() => setF({ ...f, page: f.page + 1 })}>التالي</button>
            </div>
          </>
        )}
      {open && <Transcript id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// ── 5) التقييم ──
function RunView({ id, onClose }) {
  const [d, setD] = useState(null);
  useEscape(onClose);
  const read = useCallback(() => { setD(null); A('admin.agent-eval-run', { run_id: id }, normRunDetail).then(setD); }, [id]);
  useEffect(() => { read(); }, [read]);
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="ag-panel" role="dialog" aria-modal="true" aria-labelledby="ag-run-h">
        <header className="ag-panel-h"><h3 id="ag-run-h">تشغيل #{short(id)}</h3><button type="button" className="modal-close" aria-label="إغلاق" onClick={onClose}>✕</button></header>
        {!d ? <Spinner /> : !d.success ? <div className="la-err" role="alert">{d.message || 'تعذّرت القراءة'} <button type="button" className="btn-sm ghost" onClick={read}>أعد المحاولة</button></div> : (
          <ul className="ag-results">
            {d.results.map((r, i) => (
              <li key={`${r.case_id}-${i}`} className={r.pass ? 'ok' : 'no'}>
                <b><span aria-hidden="true">{r.pass ? '✓' : '✕'}</span> {r.case_id} <small>[{SET_AR[r.set] || r.set}] {r.pass ? 'ناجح' : 'راسب'}</small></b>
                {r.message && <small className="la-muted">{r.message}</small>}
                {!r.pass && r.reasons.length > 0 && <small className="ag-why">{r.reasons.join('؛ ')}</small>}
                {r.reply && <details><summary>نص الرد</summary><p>{r.reply}</p></details>}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
function EvalSection({ s, writable, reload, onRuns }) {
  const { confirm } = useUI();
  const [runs, setRuns] = useState(null);
  const [starting, setStarting] = useState(false);
  // تكرار كل حالة لكشف التذبذب: مرة، أو ثلاث (تنجح الحالة إن نجحت في الثلاث)
  const [repeats, setRepeats] = useState(1);
  const [live, setLive] = useState(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState(null);
  const ac = useRef(null);
  const load = useCallback(async () => { const r = await A('admin.agent-eval-runs', {}, normRuns); setRuns(r); if (r.success) onRuns(r.runs); }, [onRuns]);
  useEffect(() => { load(); return () => ac.current?.abort(); }, [load]);
  const loop = async (runId) => {
    // حلقة واحدة في كل وقت: نقرة ثانية لا تبدأ حلقة لا يوقفها «أوقف»
    if (ac.current) return;
    ac.current = new AbortController();
    setErr('');
    const out = await runEvalLoop((a, b) => A(a, b, normStep), runId, (p) => setLive(p), ac.current.signal);
    ac.current = null;
    if (out.error) setErr(out.error);
    setLive(null);
    await load();
    reload();
  };
  const start = async () => {
    if (starting || ac.current) return;
    const times = repeats === 3 ? '، كل حالة ثلاث مرات' : '';
    if (!(await confirm(`تشغيل التقييم الآن؟ ${s.total_cases} حالة${times} بتكلفة تقديرية أقل من ${usd2(EVAL_ESTIMATE_MICROS * repeats)} دولار، والحد ${usd2(500_000 * repeats)} دولار، وتُحسب من سقف اليوم.`, { ok: 'شغّل' }))) return;
    setErr('');
    setStarting(true);
    const r = await A('admin.agent-eval-start', { repeats }, normStep);
    setStarting(false);
    if (!r.success) { if (r.code === 'eval_running' && r.run_id) return loop(r.run_id); return setErr(r.message); }
    setLive({ run_id: r.run_id, done_cases: 0, total: r.total, cost_micros: 0 });
    return loop(r.run_id);
  };
  const stop = async (id) => { ac.current?.abort(); await A('admin.agent-eval-cancel', { run_id: id }); setLive(null); load(); };
  const running = runs && runs.success ? runs.runs.find((r) => r.status === 'running') : null;
  return (
    <>
      {writable && (
        <div className="ag-eval-run">
          {live || running ? (
            <>
              <div className="ag-progress" role="progressbar" aria-valuemin={0} aria-valuemax={(live || running).total || (live || running).total_cases} aria-valuenow={(live || running).done_cases} aria-label="تقدم التقييم">
                <i style={{ inlineSize: `${Math.round(((live || running).done_cases / ((live || running).total || (live || running).total_cases || 1)) * 100)}%` }} />
              </div>
              <span role="status">{(live || running).done_cases} من {(live || running).total || (live || running).total_cases}، {usd2((live || running).cost_micros)} دولار</span>
              {!live && running && <button type="button" className="btn-sm" onClick={() => loop(running.id)}>أكمل التشغيل</button>}
              <button type="button" className="btn-sm danger" onClick={() => stop((live || running).run_id || running?.id)}>أوقف</button>
            </>
          ) : (
            <>
              <button type="button" className="btn-sm primary" disabled={starting} onClick={start}>شغّل التقييم الآن</button>
              <label className="la-muted">
                <span>التكرار </span>
                <select value={repeats} onChange={(e) => setRepeats(Number(e.target.value))} aria-label="تكرار كل حالة">
                  <option value={1}>مرة</option>
                  <option value={3}>ثلاث مرات (يكشف التذبذب)</option>
                </select>
              </label>
              <small className="la-muted">{s.total_cases} حالة، أقل من {usd2(EVAL_ESTIMATE_MICROS * repeats)} دولار تقديرًا، والحد {usd2(500_000 * repeats)} دولار للتشغيل، ضمن سقف اليوم.</small>
            </>
          )}
        </div>
      )}
      {err && <p className="la-err" role="alert">{err}</p>}
      {!runs ? <Spinner /> : !runs.success ? <div className="la-err" role="alert">{runs.message || 'تعذّرت القراءة'} <button type="button" className="btn-sm ghost" onClick={load}>أعد المحاولة</button></div> : !runs.runs.length ? <Empty compact title="لم يُشغَّل التقييم بعد" hint="شغّله لهذا الإعداد، فالتفعيل ينتظر نجاحه." /> : (
        <div className="ag-scroll" tabIndex={0} role="region" aria-label="جدول تشغيلات التقييم">
          <table className="la-table ag-table">
            <thead><tr><th scope="col">الحالة</th><th scope="col">{SET_AR.eval}</th><th scope="col">{SET_AR.redteam}</th><th scope="col">التكلفة</th><th scope="col">النموذج</th><th scope="col">المعرفة</th><th scope="col">من شغّله</th><th scope="col">متى</th></tr></thead>
            <tbody>
              {runs.runs.map((r) => (
                <tr key={r.id}>
                  <td><button type="button" className="la-link" onClick={() => setView(r.id)}>{RUN_STATUS_AR[r.status] || r.status}{r.stop_reason ? ` (${stopAr(r.stop_reason)})` : ''}</button>{r.repeats > 1 && <small className="la-chip">كل حالة {r.repeats} مرات</small>}{r.fingerprint === s.versions.fingerprint && <small className="la-chip ok">هذا الإعداد</small>}</td>
                  <td>{r.eval_total ? `${pct(r.eval_pass / r.eval_total)} (${r.eval_pass}/${r.eval_total})` : 'بلا'}</td>
                  <td>{r.redteam_total ? `${pct(r.redteam_pass / r.redteam_total)} (${r.redteam_pass}/${r.redteam_total})` : 'بلا'}</td>
                  <td>{usd(r.cost_micros)}</td><td><code dir="ltr">{r.model}</code></td><td><code dir="ltr">{r.knowledge_version}</code></td><td>{r.started_by}</td><td>{dateTime(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view && <RunView id={view} onClose={() => setView(null)} />}
    </>
  );
}

// ════════ الشاشة ════════
export default function Agent({ isSuper = false }) {
  const [s, setS] = useState(null);
  const [u, setU] = useState(null);
  const [conv, setConv] = useState(null);
  const [runs, setRuns] = useState(null);
  const [shut, setShut] = useState(readShut);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([A('admin.agent-state', {}, normState), A('admin.agent-usage', {}, normUsage)]);
    setS(a); setU(b);
  }, []);
  useEffect(() => { load(); }, [load]);
  const toggle = (id) => setShut((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem(SHUT_KEY, JSON.stringify([...n])); } catch { /* اختياري */ }
    return n;
  });
  const onCount = useCallback((c) => setConv(c), []);
  const onRuns = useCallback((r) => setRuns(r), []);

  if (!s) return <Spinner />;
  if (!s.success) {
    if (s.code === 'not_migrated') return <Empty title="لم يُطبَّق ترحيل 20261115230000 بعد" hint="طبّقه من RUNBOOK §7، ثم أعد فتح الشاشة." />;
    return <div className="la-err" role="alert">{s.message || 'تعذّرت القراءة'} <button type="button" className="btn-sm ghost" onClick={load}>أعد المحاولة</button></div>;
  }
  if (!s.ready) return <Empty title="لم يُطبَّق ترحيل 20261115230000 بعد" hint="طبّقه من RUNBOOK §7، ثم أعد فتح الشاشة." />;
  const writable = isSuper && s.can_write;
  const sec = (id) => ({ open: !shut.has(id), onToggle: () => toggle(id) });
  const lastRun = runs?.[0] || s.latest_run;
  return (
    <div className="ag">
      <div className="la-row between ag-head">
        <div><h2>المساعد الآلي</h2><p className="la-muted">مساعد الموقع العام: التفعيل والمفتاح والتكلفة والمحادثات والتقييم.</p></div>
        {!writable && <span className="la-chip">عرض فقط</span>}
      </div>
      {!writable && <p className="la-muted small ag-ro">{isSuper ? 'الكتابة تتطلب الدخول بمفتاح المرور أو تطبيق المصادقة.' : 'الكتابة للمدير الأعلى وحده، وأنت ترى كل شيء للاطلاع.'}</p>}
      <AgentSection id="ag-state" title="الحالة والتحكم" summary={stateSummary(s)} open fixed><StatusSection s={s} reload={load} writable={writable} /></AgentSection>
      <AgentSection id="ag-key" title="المفتاح" summary={keySummary(s.key)} {...sec('ag-key')}><KeySection s={s} reload={load} writable={writable} /></AgentSection>
      <AgentSection id="ag-spend" title="الإنفاق" summary={spendSummary(u)} {...sec('ag-spend')}><SpendSection u={u} reload={load} /></AgentSection>
      <AgentSection id="ag-conv" title="المحادثات" summary={convSummary(conv)} {...sec('ag-conv')}><ConversationsSection onCount={onCount} /></AgentSection>
      <AgentSection id="ag-eval" title="التقييم" summary={runSummary(lastRun)} {...sec('ag-eval')}><EvalSection s={s} writable={writable} reload={load} onRuns={onRuns} /></AgentSection>
      <AgentSection id="ag-orgs" title="مرافق الجهات" summary={orgsSummary(s.companion_off)} {...sec('ag-orgs')}>
        <p>يُضبط لكل جهة من نموذجها. مساعد الموقع عام ولا يتأثر بالجهة.</p>
        <button type="button" className="btn-sm ghost" onClick={() => navigate({ ctx: 'leaders', tab: 'orgs' })}>افتح الجهات</button>
      </AgentSection>
    </div>
  );
}
