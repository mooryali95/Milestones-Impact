// ════════════════════════════════════════════════════════════════
// نظرة عامة على تطبيق القادة: الأرقام، وما ينتظر القرار، والقمع،
// والمستوى العام، والجهات، والقياس القبلي والبعدي، والكتاب والنماذج
// ════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import { DIM, DIM_EN, DIMS, L, LVL, STATUS, VIA, date } from '../leaders.js';
import { LVLS } from '../methodology.js';
import { Spinner } from '../ui.jsx';
import { Funnel } from './Orgs.jsx';
import ReqQueue from './ReqQueue.jsx';
import { OrgSelect } from './Participants.jsx';

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

// حالة النظام: ترحيلات لم تُشغَّل، وأسرار ناقصة، واقتراب البريد من سقفه اليومي
function Health({ h }) {
  if (!h?.success) return null;
  const near = h.mail.today >= h.mail.cap * 0.8;
  if (!h.missing_migrations.length && !h.missing_secrets.length && !near) return null;
  return (
    <div className="la-note la-health" role="status">
      <b>حالة النظام</b>
      {h.missing_migrations.length > 0 && <p>ترحيلات لم تُشغَّل بعد في SQL Editor: {h.missing_migrations.map((f) => <code key={f}>{f}.sql</code>)}</p>}
      {h.missing_secrets.length > 0 && <p>أسرار ناقصة في دالة leaders-api: {h.missing_secrets.map((k) => <code key={k}>{k}</code>)}</p>}
      {near && <p>رسائل الرموز اليوم {h.mail.today} من {h.mail.cap}. عند السقف يتوقف إرسال الرموز حتى الغد، ويبقى الدخول بمفتاح المرور.</p>}
    </div>
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
      L('admin.overview', { org }), L('admin.reviews'),
      L('admin.impact', org ? { organization_id: org } : {}).catch(() => null),
      L('admin.health').catch(() => null),
    ]).then(([o, r, im, h]) => live && setD({ o, r, im, h }));
    return () => { live = false; };
  }, [org, n]);

  if (!d) return <Spinner />;
  const { o, r, im, h } = d;
  if (!o.success) return <div className="la-err" role="alert">{o.message}</div>;
  const st = (k) => o.by_status[k] || 0;
  const max = Math.max(1, ...DIMS.flatMap((x) => LVLS.map((l) => o.matrix[x][l])));
  const bk = o.book;
  const waiting = [...(r.pending_approval || []), ...(r.submitted || [])];
  const placed = Object.values(o.overall || {}).reduce((a, n) => a + n, 0);
  const baseline = (o.instruments || []).filter((x) => x.kind === 'baseline').sort((a, c) => Number(c.active) - Number(a.active));

  return (
    <>
      <Health h={h} />
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
        <div className="stat-card"><div className="stat-label">بانتظار الاعتماد</div><div className="stat-value s-new">{st('pending_approval')}</div><div className="stat-sub">أنهوا القياس القبلي</div></div>
        <div className="stat-card"><div className="stat-label">للمراجعة</div><div className="stat-value s-replied">{o.pending_reviews + (bk?.to_review || 0)}</div><div className="stat-sub">{bk ? `${o.pending_reviews} متطلبات و${bk.to_review} نماذج` : 'متطلبات أرسلها المشاركون'}</div></div>
        <div className="stat-card"><div className="stat-label">في البرنامج</div><div className="stat-value">{st('placed') + st('enrolled')}</div><div className="stat-sub">{o.active_week != null ? `${o.active_week} نشطون هذا الأسبوع` : 'معتمدون'}</div></div>
      </div>

      <div className="la-grid2">
        <section className="la-card">
          <h3>ينتظر قرارك</h3>
          {!waiting.length && !bk?.to_review && !pending?.contacts ? <p className="la-muted">لا شيء بانتظارك الآن.</p> : (
            <ul className="la-queue">
              {(r.pending_approval || []).map((p) => (
                <li key={`a${p.id}`}><button className="la-link" onClick={() => onPerson(p.id)}>{p.full_name}</button><span className="la-chip warn">اعتماد المسار</span><small>{p.organization_name || ''}</small></li>
              ))}
              {(r.submitted || []).length > 0 && (
                <li><button className="la-link" onClick={() => document.getElementById('rq')?.scrollIntoView({ behavior: 'smooth' })}>متطلبات مرسلة للمراجعة</button><span className="la-chip">تحت</span><b>{r.submitted.length}</b></li>
              )}
              {pending?.contacts ? (
                <li><a className="la-link" href="#/contacts">طلبات تواصل جديدة</a><span className="la-chip">الموقع</span><b>{pending.contacts}</b></li>
              ) : null}
              {bk?.to_review ? (
                <li><button className="la-link" onClick={() => onTab?.('handbook')}>نماذج تعليمية مُرسلة</button><span className="la-chip warn">تقييم</span><b>{bk.to_review}</b></li>
              ) : null}
            </ul>
          )}
        </section>
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
              <tr key={l}><th>{LVL[l]}</th>{DIMS.map((x) => <td key={x} style={{ '--a': (o.matrix[x][l] / max).toFixed(2) }}><b>{o.matrix[x][l]}</b></td>)}</tr>
            ))}</tbody>
          </table>
          <p className="la-muted">كل خلية = عدد المشاركين في هذا المستوى من هذا الإطار. تركيب المستويات الثلاثة يحدد المسار من 27 مسارًا.</p>
        </section>
        <section className="la-card">
          <div className="la-row between"><h3>أكثر المسارات مشاركين</h3><span className="la-muted">{o.tracks_used} من 27 مسارًا مشغولة</span></div>
          {(o.top_tracks || []).length ? (
            <ul className="la-queue">{o.top_tracks.map((t) => (
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
            <ul className="la-queue">{o.top_orgs.map((g) => (
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
    </>
  );
}
