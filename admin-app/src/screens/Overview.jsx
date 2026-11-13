// ════════════════════════════════════════════════════════════════
// نظرة عامة على تطبيق القادة: الأرقام، وما ينتظر القرار، والقمع،
// والمستوى العام، والجهات، والقياس القبلي والبعدي، والكتاب والنماذج
// ════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import Inbox from './Inbox.jsx';
import { DIM, DIM_EN, DIMS, L, LVL, STATUS, VIA, date } from '../leaders.js';
import { LVLS } from '../methodology.js';
import { Spinner, useUI } from '../ui.jsx';
import { Funnel } from './Orgs.jsx';
import ReqQueue from './ReqQueue.jsx';
import SusPanel from './SusPanel.jsx';
import { OrgSelect } from './Participants.jsx';
import { TRACK_COUNT } from '../../../supabase/functions/leaders-api/labels.js';

const VIA_ALL = { ...VIA, unassigned: 'بلا جهة' };
const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);

// صفوف أشرطة أفقية بتنسيق القمع نفسه
function Bars({ rows }) {
  const top = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="la-funnel big">{rows.map(([l, n, sub]) => (
      <div key={l} className="la-fn"><span className="la-fn-l">{l}</span><span className="la-fn-bar"><i style={{ width: `${((n / top) * 100).toFixed(1)}%` }} /></span><b>{sub ?? n}</b></div>
    ))}</div>
  );
}

// القياس البعدي: يعرض ما يحسبه admin.impact كما هو، ولا يحسب الأثر هنا
function Impact({ im, instruments }) {
  const post = (instruments || []).find((x) => x.kind === 'post');
  // فشل الحساب خطأ يُعرض، لا حالة فارغة توحي بأن الأداة لم تُفعَّل
  if (im && !im.success) return <p className="la-err" role="alert">تعذّر حساب قياس الأثر{im.message ? `: ${im.message}` : ''}</p>;
  if (!im?.success) {
    return (
      <>
        <p className="la-muted">{post ? `أداة القياس البعدي «${post.title || post.key}» جاهزة، وأنهاها ${post.n}.` : 'لم تُفعَّل أداة القياس البعدي بعد.'}</p>
        <p className="la-muted">تظهر هنا مقارنة القبلي بالبعدي لكل إطار متى اكتمل قياس الأثر.</p>
      </>
    );
  }
  const c = im.counts || {};
  return (
    <>
      <div className="la-book-kpis">
        <span><b>{c.baseline ?? 0}</b>أنهوا القبلي</span>
        <span><b>{c.post ?? 0}</b>أنهوا البعدي</span>
        <span><b>{c.paired ?? 0}</b>لديهم القياسان</span>
      </div>
      {c.paired ? (
        <table className="la-table la-impact">
          <thead><tr><th /><th>قبل</th><th>بعد</th><th>الفرق</th><th>تحسّن فعلي</th></tr></thead>
          <tbody>{DIMS.map((d) => {
            const x = im.cohort?.[d];
            if (!x) return null;
            return (
              <tr key={d}><th>{DIM[d]}</th><td>{x.pre ?? '·'}</td><td>{x.post ?? '·'}</td>
                <td className={x.diff > 0 ? 'up' : x.diff < 0 ? 'down' : ''}>{x.diff > 0 ? '+' : ''}{x.diff ?? '·'}</td>
                <td>{x.reliable_up ?? 0} من {x.n ?? 0}</td></tr>
            );
          })}</tbody>
        </table>
      ) : <p className="la-muted">لا أحد لديه القياسان معًا بعد.</p>}
    </>
  );
}

// حالة النظام: ترحيلات لم تُطبَّق بوسم بوابة النشر، وأسرار ناقصة، واقتراب البريد من سقفه اليومي، وما تعذّرت قراءته منها.
// الوسم من الخادم (pending_migrations، المصدر نفسه لبوابات المراحل): المؤجل بقرار لا يُطلب تطبيقه. خادم قبل الحقل يُقرأ كما كان
function Health({ h }) {
  if (!h?.success) return null;
  const near = h.mail.today >= h.mail.cap * 0.8;
  const unread = h.migrations_ledger === false || h.mail.today == null;
  const pending = h.pending_migrations || (h.missing_migrations || []).map((name) => ({ name, gate: 'blocking' }));
  const gate = (g) => pending.filter((m) => m.gate === g);
  const files = (list) => list.map((m) => <code key={m.name}>{m.name}.sql</code>);
  if (!pending.length && !h.missing_secrets.length && !near && !unread) return null;
  return (
    <div className="la-note la-health" role="status">
      <b>حالة النظام</b>
      {h.migrations_ledger === false && <p>تعذّرت قراءة سجل الترحيلات، فلا يُعرف ما لم يُطبَّق.</p>}
      {h.mail.today == null && <p>تعذّرت قراءة عداد البريد: لا يخرج الآن إلا الرموز والتنبيه، والتذكيرات في الطابور.</p>}
      {gate('blocking').length > 0 && <p>ترحيلات لم تُطبَّق على الإنتاج، تُطبَّق بسير migrate.yml بأسمائها قبل نشر الدوال: {files(gate('blocking'))}</p>}
      {gate('tolerant').length > 0 && <p>ترحيلات لم تُطبَّق تعمل الدوال قبلها وبعدها، تُطبَّق بسير migrate.yml في أقرب نافذة: {files(gate('tolerant'))}</p>}
      {gate('deferred').length > 0 && <p>ترحيلات مؤجلة بقرار، لا تُطبَّق قبل رفع التأجيل: {gate('deferred').map((m) => <span key={m.name}><code>{m.name}.sql</code>{m.note ? ` (${m.note})` : ''} </span>)}</p>}
      {h.missing_secrets.length > 0 && <p>أسرار ناقصة في دالة leaders-api: {h.missing_secrets.map((k) => <code key={k}>{k}</code>)}</p>}
      {near && <p>رسائل الرموز اليوم {h.mail.today} من {h.mail.cap}. عند السقف يتوقف إرسال الرموز حتى الغد، ويبقى الدخول بمفتاح المرور.</p>}
    </div>
  );
}

// جاهزية الإطلاق: تختفي حين تكتمل البنود كلها
function Readiness({ items, onTab }) {
  const todo = (items || []).filter((x) => !x.ok);
  if (!todo.length) return null;
  return (
    <section className="la-card la-ready" aria-label="جاهزية الإطلاق">
      <div className="la-row between"><h3>جاهزية الإطلاق</h3><span className="la-muted">{items.length - todo.length} من {items.length}</span></div>
      <ul>
        {items.map((x) => (
          <li key={x.key} className={x.ok ? 'ok' : ''}>
            <span aria-hidden="true">{x.ok ? '✓' : '○'}</span>
            <span>{x.label}</span>
            {!x.ok && onTab && x.where && <button className="la-link" onClick={() => onTab(x.where)}>اضبطه</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// حساب العرض للورش: يفتح تطبيق المشارك من شاشة الدخول مع جولة الخطوات، ويُعاد إلى البداية بضغطة
function DemoCard() {
  const { toast, confirm } = useUI();
  const [busy, setBusy] = useState(false);
  const openDemo = async () => {
    // النافذة تُفتح فورًا بضغطة المستخدم، ثم يُكتب فيها الرابط، فلا يمنعها المتصفح
    const w = window.open('', '_blank');
    setBusy(true);
    const r = await L('admin.demo-open');
    setBusy(false);
    if (!r.success) { w?.close(); return toast(r.message); }
    if (w) w.location.href = r.url; else location.href = r.url;
  };
  const reset = async () => {
    if (!(await confirm('إعادة حساب العرض إلى البداية؟ تُمسح إجاباته وتقدمه، ويبدأ العرض التالي من شاشة الدخول.'))) return;
    setBusy(true);
    const r = await L('admin.demo-reset');
    setBusy(false);
    toast(r.success ? 'أُعيد حساب العرض إلى البداية' : r.message);
  };
  return (
    <section className="la-card la-demo">
      <div className="la-row between">
        <div><b>حساب العرض التوضيحي</b><p className="la-muted">للورش: يفتح المنصة من شاشة الدخول، وجولة حيّة بثماني عشرة خطوة تضيء كل عنصر وتشرح المنظومة كاملة. لا يدخل الإحصاءات ولا يصله بريد.</p></div>
        <span className="la-row">
          <button className="btn-sm primary" disabled={busy} onClick={openDemo}>افتح حساب العرض</button>
          <button className="btn-sm ghost" disabled={busy} onClick={reset}>أعِده إلى البداية</button>
        </span>
      </div>
    </section>
  );
}

export default function Overview({ orgs, onPerson, onTrack, onStatus, onOrg, onTab, pending, canWrite }) {
  const [org, setOrg] = useState('');
  const [d, setD] = useState(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setD(null);
    Promise.all([
      // الجهة نفسها لكل البطاقات: الأرقام وقائمة «ينتظر قرارك» والمتطلبات وقياس الأثر
      L('admin.overview', { org }), L('admin.reviews', { org }),
      L('admin.impact', org ? { organization_id: org } : {}).catch((e) => ({ success: false, message: e?.message })),
      L('admin.health').catch(() => null),
    ]).then(([o, r, im, h]) => live && setD({ o, r, im, h }));
    return () => { live = false; };
  }, [org, n]);

  if (!d) return <Spinner />;
  const { o, r, im, h } = d;
  if (!o.success) return <div className="la-err" role="alert">{o.message}</div>;
  const st = (k) => o.by_status?.[k] || 0;
  // رد ناقص لا يُسقط صفحة الدخول: الخانة الغائبة صفر
  const cellOf = (x, l) => o.matrix?.[x]?.[l] || 0;
  const max = Math.max(1, ...DIMS.flatMap((x) => LVLS.map((l) => cellOf(x, l))));
  const bk = o.book;
  const waiting = [...(r.pending_approval || []), ...(r.submitted || [])];
  const placed = Object.values(o.overall || {}).reduce((a, n) => a + n, 0);
  const baseline = (o.instruments || []).filter((x) => x.kind === 'baseline').sort((a, c) => Number(c.active) - Number(a.active));

  // عدد المتطلبات المنتظرة من قائمة «ينتظر قرارك» نفسها، فلا تختلف البطاقة عن القائمة تحتها
  const reqN = r?.submitted ? r.submitted.length : (o.pending_reviews || 0);
  return (
    <>
      <Health h={h} />
      {canWrite !== false && <DemoCard />}
      {canWrite !== false && <Readiness items={h?.readiness} onTab={onTab} />}
      {o.mfa_required && (
        <div className="la-note" role="alert">
          دخلت برمز البريد وحده، فاللوحة للعرض فقط في هذه الجلسة. فعّل مفتاح المرور أو تطبيق المصادقة من الإعدادات (⚙)، ثم اخرج وادخل به لتتمكن من التعديل.
        </div>
      )}
      <div className="la-row between la-ov-bar">
        <span className="la-muted">{org ? 'تعرض الأرقام لجهة واحدة' : 'كل الجهات'}</span>
        <OrgSelect orgs={orgs} value={org} onChange={setOrg} />
      </div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">المشاركون</div><div className="stat-value">{o.total}</div><div className="stat-sub">{o.new_week != null ? `${o.new_week} جديد هذا الأسبوع` : 'كل الحالات'}</div></div>
        <div className="stat-card"><div className="stat-label">{STATUS.pending_approval}</div><div className="stat-value s-new">{st('pending_approval')}</div><div className="stat-sub">أنهوا القياس القبلي</div></div>
        <div className="stat-card"><div className="stat-label">للمراجعة</div><div className="stat-value s-replied">{reqN + (bk?.to_review || 0)}</div><div className="stat-sub">{bk ? `${reqN} متطلبات و${bk.to_review} نماذج` : 'متطلبات أرسلها المشاركون'}</div></div>
        <div className="stat-card"><div className="stat-label">في البرنامج</div><div className="stat-value">{st('placed') + st('enrolled')}</div><div className="stat-sub">{o.active_week != null ? `${o.active_week} نشطون هذا الأسبوع` : 'معتمدون'}</div></div>
      </div>

      <div className="la-grid2">
        {/* صندوق واحد لكل ما ينتظر القرار (Inbox.jsx، admin.inbox): كان هنا أربعة أنواع والباقي موزع على شاشاته */}
        <Inbox contacts={pending?.contacts || 0} />
        <section className="la-card">
          <div className="la-row between"><h3>المستوى العام</h3><span className="la-muted">{placed} مُسكَّن</span></div>
          {o.overall ? (
            <Bars rows={[...LVLS].reverse().map((l) => [LVL[l], o.overall[l] || 0, `${o.overall[l] || 0} · ${pct(o.overall[l] || 0, placed)}٪`])} />
          ) : <p className="la-muted">يظهر بعد تحديث الخادم.</p>}
          <p className="la-muted">ما يراه المشارك: مستوى واحد هو وسيط مستوياته في الأطر الثلاثة. التفصيل لكل إطار أدناه للإدارة فقط.</p>
        </section>
      </div>

      <div id="rq"><ReqQueue rows={r.submitted || []} canWrite={canWrite} onPerson={onPerson} onDone={() => setN((x) => x + 1)} /></div>
      <div className="la-grid2">
        <section className="la-card">
          <h3>توزيع المستويات حسب الإطار (3×3)</h3>
          <table className="la-matrix">
            <thead><tr><th />{DIMS.map((x) => <th key={x}>{DIM_EN[x]}<small>{DIM[x]}</small></th>)}</tr></thead>
            <tbody>{[...LVLS].reverse().map((l) => (
              <tr key={l}><th>{LVL[l]}</th>{DIMS.map((x) => <td key={x} style={{ '--a': (cellOf(x, l) / max).toFixed(2) }}><b>{cellOf(x, l)}</b></td>)}</tr>
            ))}</tbody>
          </table>
          <p className="la-muted">كل خلية = عدد المشاركين في هذا المستوى من هذا الإطار. تركيب المستويات الثلاثة يحدد المسار من {TRACK_COUNT} مسارًا.</p>
        </section>
        <section className="la-card">
          <div className="la-row between"><h3>أكثر المسارات مشاركين</h3><span className="la-muted">{o.tracks_used} من {TRACK_COUNT} مسارًا مشغولة</span></div>
          {(o.top_tracks || []).length ? (
            <ul className="la-queue">{(o.top_tracks || []).map((t) => (
              <li key={t.key}><button className="la-link" onClick={() => onTrack(t.key)}><code className="la-code">{t.key}</code> {t.title || ''}</button><b>{t.n}</b></li>
            ))}</ul>
          ) : <p className="la-muted">لا مسارات بعد.</p>}
        </section>
      </div>

      <div className="la-grid2">
        {o.funnel && <section className="la-card"><h3>قمع الرحلة</h3><Funnel f={o.funnel} big /></section>}
        <section className="la-card">
          <h3>القياس القبلي</h3>
          {baseline.length ? baseline.map((x) => (
            <div key={x.key} className="la-inst">
              <div className="la-row between"><span><code className="la-code">{x.key}</code> {x.active ? <span className="la-chip ok">مفعّلة</span> : null}</span><span className="la-muted">أنهاه {x.n}</span></div>
              <Bars rows={DIMS.map((dm) => [DIM[dm], x.avg?.[dm] || 0, x.avg?.[dm] != null ? `${x.avg[dm]}٪` : '·'])} />
            </div>
          )) : <p className="la-muted">{o.instruments ? 'لم يُنهِ أحد القياس بعد.' : 'يظهر بعد تحديث الخادم.'}</p>}
          <p className="la-muted">متوسط النسبة المركبة (معرفة ومهارة وسلوك) لكل إطار.</p>
        </section>
      </div>

      <div className="la-grid2">
        <section className="la-card">
          <h3>قياس الأثر (قبلي وبعدي)</h3>
          <Impact im={im} instruments={o.instruments} />
        </section>
        <section className="la-card">
          <div className="la-row between"><h3>الكتاب والنماذج</h3>{onTab && <button className="la-link" onClick={() => onTab('handbook')}>فتح كتيب القائد</button>}</div>
          {bk ? (
            <>
              <div className="la-book-kpis">
                <span><b>{bk.readers}</b>قرّاء</span>
                <span><b>{bk.chapters}</b>أبواب مكتملة</span>
                <span><b>{bk.accuracy != null ? `${bk.accuracy}٪` : '·'}</b>دقة الأسئلة</span>
                <span><b>{bk.submitted}</b>نماذج مُرسلة</span>
                <span><b>{bk.rating ?? '·'}</b>متوسط التقييم</span>
                <span><b>{bk.points_avg}</b>متوسط النقاط</span>
              </div>
              <Bars rows={Object.entries(bk.ranks || {}).map(([t, n]) => [t, n])} />
            </>
          ) : <p className="la-muted">يظهر بعد تحديث الخادم.</p>}
        </section>
      </div>

      <div className="la-grid2">
        <section className="la-card">
          <div className="la-row between"><h3>الجهات</h3>{o.orgs_count != null && <span className="la-muted">{o.orgs_count} جهة لديها مشاركون</span>}</div>
          {(o.top_orgs || []).length ? (
            <ul className="la-queue">{(o.top_orgs || []).map((g) => (
              <li key={g.id}><button className="la-link" onClick={() => (onOrg ? onOrg(g.id) : setOrg(g.id))}>{g.name || orgs.find((x) => x.id === g.id)?.name || 'جهة'}</button><b>{g.n}</b></li>
            ))}</ul>
          ) : <p className="la-muted">{o.top_orgs ? 'لا مشاركين مرتبطين بجهة بعد.' : 'يظهر بعد تحديث الخادم.'}</p>}
        </section>
        <section className="la-card">
          <h3>مصدر الانتساب</h3>
          {o.via ? <Bars rows={Object.entries(VIA_ALL).filter(([k]) => o.via[k]).map(([k, l]) => [l, o.via[k]])} /> : <p className="la-muted">يظهر بعد تحديث الخادم.</p>}
          <p className="la-muted">كيف وصل المشارك إلى جهته: رابط الجهة، أو موقعها، أو نقل يدوي من الإدارة.</p>
        </section>
      </div>

      <section className="la-card">
        <h3>الحالات</h3>
        <div className="la-pills">{Object.entries(STATUS).map(([k, l]) => (
          <button key={k} className="la-pill" onClick={() => onStatus(k)}>{l} <b>{st(k)}</b></button>
        ))}</div>
      </section>
      <SusPanel />
    </>
  );
}
