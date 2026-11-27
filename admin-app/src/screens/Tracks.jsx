// ════════════════════════════════════════════════════════════════
// المسارات الـ27: لوحات المستويات، وصفحة المسار بمشاركيه وكتابه
// ════════════════════════════════════════════════════════════════
// كل لوحة مستوى في Milestone، صفوفها مستوى Impact وأعمدتها مستوى Leadership.
// تحرير أبواب الكتاب في استوديو الكتاب (الخطوة التالية)؛ هنا عرض كما يقرؤه المشارك.
import React, { useEffect, useMemo, useState } from 'react';
import { DIM, DIM_ROMAN, DIMS, L, LVL, STATUS } from '../leaders.js';
import { LVLS, ROMAN, TRACK_FIELDS, lines, shortTitle, trackKey, trackLevels } from '../methodology.js';
import Form from '../Form.jsx';
import Md from '../Md.jsx';
import { Spinner, useUI, useWide } from '../ui.jsx';
import { navigate } from '../route.js';
import { EDIT_WHERE, cardFrameworks, sameJourney } from '../track-page.js';
import { ChapterEditor } from './Handbook.jsx';
import { TRACK_COUNT } from '../../../supabase/functions/leaders-api/labels.js';
import { trackManifest } from '../../../supabase/functions/leaders-api/track-manifest.js';

// ما يصل المشارك من هوية المسار (trackView في participant.ts): حين يكون للمسار ملف تعريف يرى عنوانه ووصفه
// وتوجيه رحلته مكان هذه الحقول، فتصير داخلية للإدارة؛ وأولويات التطوير تصله من المسار دائمًا.
// كانت الصفحة تقول إن العنوان وحده داخلي (التدقيق 2026-11-11، admin-program-7)
const PROFILE_REPLACES = new Set(['title_ar', 'summary_ar', 'journey_ar']);
const trackFields = (profile) => (!profile ? TRACK_FIELDS
  : TRACK_FIELDS.map((f) => (PROFILE_REPLACES.has(f.name) ? { ...f, help: 'داخلي للإدارة: يرى المشارك نص ملف التعريف مكانه' } : f)));

const LvlChips = ({ k }) => {
  const lv = trackLevels(k);
  return DIMS.map((d) => <span key={d} className={`la-lvl ${lv[d]}`} title={DIM[d]}>{DIM_ROMAN[d]} {LVL[lv[d]]}</span>);
};

function Board({ tracks, onOpen }) {
  const tr = tracks.tracks || [];
  const st = tracks.track_stats || {};
  if (!tr.length) return <div className="la-note">لا مسارات في القاعدة بعد.</div>;
  const byKey = Object.fromEntries(tr.map((t) => [t.key, t]));
  const sum = (f) => Object.values(st).reduce((a, x) => a + (x[f] || 0), 0);
  const used = tr.filter((t) => st[t.key]?.total).length;
  const max = Math.max(1, ...Object.values(st).map((x) => x.total || 0));
  const cell = (key) => {
    const t = byKey[key] || {};
    const x = st[key] || {};
    const heat = x.total ? (0.25 + (0.75 * x.total) / max).toFixed(2) : 0;
    return (
      <button key={key} className={`tx-cell${x.total ? ' on' : ''}`} style={{ '--heat': heat }} onClick={() => onOpen(key)} title={t.title_ar || key}>
        <span className="tx-key">{key}</span>
        <span className="tx-title">{shortTitle(t.title_ar)}</span>
        <span className="tx-n"><b>{x.total || 0}</b>{x.pending ? <small>{x.pending} بانتظارك</small> : x.total ? <small>{x.active || 0} معتمد</small> : null}</span>
      </button>
    );
  };
  const top = tr.filter((t) => st[t.key]?.total).sort((a, b) => st[b.key].total - st[a.key].total).slice(0, 5);
  return (
    <>
      <section className="tx-hero">
        <div className="tx-hero-head">
          <div><span className="tx-eyebrow">Leadership Tracks</span><h2>المسارات السبعة والعشرون</h2>
            <p>كل مسار تركيبة فريدة من مستويات الأطر الثلاثة، له هويته وكتابه ورحلته. افتح أي مسار لترى مشاركيه وكتابه كاملًا.</p></div>
          <button className="la-btn" data-testid="open-track-cards" onClick={() => onOpen(CARDS_ROUTE)}>بطاقات المسارات</button>
        </div>
        <div className="tx-kpis">
          <div><b>{used}<small>/{TRACK_COUNT}</small></b><span>مسار به مشاركون</span></div>
          <div><b>{sum('total')}</b><span>مشارك مسكّن</span></div>
          <div><b>{sum('active')}</b><span>معتمد</span></div>
          <div className={sum('pending') ? 'warn' : ''}><b>{sum('pending')}</b><span>بانتظار اعتمادك</span></div>
        </div>
      </section>
      <div className="tx-legend">
        <span>كل لوحة مستوى في <b>Milestone</b>، صفوفها مستوى <b>Impact</b>، وأعمدتها مستوى <b>Leadership</b>.</span>
        <span className="tx-scale"><i />شدة الذهبي = عدد المشاركين</span>
      </div>
      <div className="tx-boards">{LVLS.map((ml) => {
        const n = tr.filter((t) => t.milestone_level === ml).reduce((a, t) => a + (st[t.key]?.total || 0), 0);
        return (
          <section key={ml} className="tx-board">
            <header><span className="tx-roman">{ROMAN[ml]}</span><div><small>Milestone</small><b>{LVL[ml]}</b></div><span className="tx-board-n"><b>{n}</b>مشارك</span></header>
            <div className="tx-grid">
              <span className="tx-corner">صفوف Impact<br />أعمدة Leadership</span>
              {LVLS.map((l) => <span key={l} className="tx-axis col"><i>L</i>{LVL[l]}</span>)}
              {LVLS.map((il) => (
                <React.Fragment key={il}>
                  <span className="tx-axis row"><i>I</i>{LVL[il]}</span>
                  {LVLS.map((ll) => cell(trackKey(ml, il, ll)))}
                </React.Fragment>
              ))}
            </div>
          </section>
        );
      })}</div>
      {top.length > 0 && (
        <section className="la-card tx-top"><h3>الأكثر شغلًا</h3>{top.map((t, i) => (
          <button key={t.key} className="tx-rank" onClick={() => onOpen(t.key)}>
            <span className="tx-rank-i">{i + 1}</span>
            <span className="tx-rank-t"><b>{t.title_ar}</b><small><code>{t.key}</code> <LvlChips k={t.key} /></small></span>
            <span className="tx-rank-bar"><i style={{ width: `${((st[t.key].total / max) * 100).toFixed(0)}%` }} /></span>
            <b className="tx-rank-n">{st[t.key].total}</b>
          </button>
        ))}</section>
      )}
    </>
  );
}

// صفحة المسار (المرحلة 23، 4.7): بطل خفيف، ثم «ما يراه المشارك» بجانب «إعدادات الإدارة» (تبويبان على الهاتف)، ثم
// «رحلة المسار» بعارض بطاقة المسار نفسه (cardRow وCardFrameworks)، ثم الكتاب، ثم المشاركون.
// نص الملف يظهر مرة واحدة، وتحت كل قسم «أين يُحرَّر»
const toTab = (tab) => navigate({ ctx: 'leaders', tab });
function EditWhere({ part, onIdentity }) {
  const w = EDIT_WHERE[part];
  return (
    <p className="la-muted tr-where"><span>أين يُحرَّر: </span>
      {w.action === 'identity' ? (onIdentity ? <button type="button" className="la-link" onClick={onIdentity}>{w.label}</button> : <span>{w.label}</span>)
        : w.tab ? <button type="button" className="la-link" onClick={() => toTab(w.tab)}>{w.label}</button>
          : <span>{w.label} <code dir="ltr">{w.file}</code></span>}
    </p>
  );
}

function TrackJourney({ k, catalog, handbook }) {
  const row = useMemo(() => cardRow(k, catalog, handbook), [k, catalog, handbook]);
  return (
    <section className="la-card tr-journey" aria-labelledby="tr-journey-h">
      <h3 id="tr-journey-h">رحلة المسار</h3>
      <CardFrameworks rows={row.frameworks} />
      <p className="la-muted tr-hours">الجهد التقديري {row.hours[0]} إلى {row.hours[1]} ساعة</p>
      <EditWhere part="stages" />
      <EditWhere part="journey" />
    </section>
  );
}

function Track({ k, catalog, canWrite, onBack, onPerson, onSaved }) {
  const [chapter, setChapter] = useState(null);
  const { toast } = useUI();
  const [r, setR] = useState(null);
  const [editing, setEditing] = useState(false);
  const [pane, setPane] = useState('participant');
  const wide = useWide('(min-width: 900px)');
  const load = () => L('admin.track', { key: k }).then(setR);
  useEffect(() => { setR(null); load(); }, [k]); // eslint-disable-line
  if (!r) return <Spinner />;
  if (!r.success) return <div className="la-err" role="alert">{r.message}</div>;
  const t = r.track;
  const ps = r.participants;
  const pf = r.profile;
  const groups = DIMS.map((d) => ({ d, items: r.handbook.filter((c) => c.dimension === d) }));
  const onIdentity = canWrite ? () => setEditing(true) : null;
  // ما يراه المشارك: نص الملف حين يوجد، وإلا حقول الهوية. مرة واحدة هنا وحده
  const guide = lines(pf?.journey_ar || t.journey_ar);
  const showAdmin = canWrite;
  const panes = showAdmin && !wide;
  const participant = (
    <section className="tr-pane tr-seen" id="tr-pane-participant" role={panes ? 'tabpanel' : undefined} aria-labelledby={panes ? 'tr-tab-participant' : 'tr-seen-h'} hidden={panes && pane !== 'participant'} tabIndex={panes ? 0 : undefined}>
      {!panes && <h3 id="tr-seen-h">ما يراه المشارك</h3>}
      <div className="la-track-profile">
        {r.strengths && <p>{r.strengths}</p>}
        <h4>توجيه الرحلة</h4>
        {guide.length ? <ul>{guide.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="la-muted">بلا توجيه بعد.</p>}
      </div>
      <h4>أولويات التطوير</h4>
      {lines(t.focus_ar).length ? <ol>{lines(t.focus_ar).map((x, i) => <li key={i}>{x}</li>)}</ol> : <p className="la-muted">بلا أولويات بعد.</p>}
      <EditWhere part="identity" onIdentity={onIdentity} />
      <h4>المشروع التطبيقي</h4>
      <p>{r.project?.text || 'لا فصول وثيقة بعد'}</p>
      <EditWhere part="project" />
    </section>
  );
  const custom = sameJourney(t, pf);
  const internal = (label, v) => <div className="tr-field"><dt>{label}</dt><dd>{v || <span className="la-muted">فارغ</span>}</dd></div>;
  const admin = showAdmin && (
    <section className="tr-pane tr-admin" id="tr-pane-admin" role={panes ? 'tabpanel' : undefined} aria-labelledby={panes ? 'tr-tab-admin' : 'tr-admin-h'} hidden={panes && pane !== 'admin'} tabIndex={panes ? 0 : undefined}>
      {!panes && <h3 id="tr-admin-h">إعدادات الإدارة</h3>}
      {pf && <p className="la-note" role="note">هذه الحقول داخلية؛ المشارك يرى نص الملف «{pf.title_ar}».</p>}
      <dl className="tr-fields">
        {internal('اسم المسار', t.title_ar)}
        {internal('لمن صُمّم', t.summary_ar)}
        {custom ? <details className="tr-custom"><summary>تخصيص</summary>{internal('توجيه الرحلة', t.journey_ar)}</details> : internal('توجيه الرحلة', t.journey_ar)}
      </dl>
      <button className={`btn-sm ${t.title_ar ? 'ghost' : 'primary'}`} onClick={() => setEditing(true)}>{t.title_ar ? 'تحرير هوية المسار' : 'أنشئ هوية المسار'}</button>
    </section>
  );
  return (
    <>
      <button className="la-link" onClick={onBack}>→ كل المسارات</button>
      {/* بطل خفيف: الرمز والمستويات والعنوان والوصف وسطر «لماذا هذا المسار» من إطار الأولوية (priorityFor في trackManifest) */}
      <section className="la-track-hero">
        <div className="la-row"><code className="la-code">{t.key}</code><LvlChips k={t.key} /></div>
        <h2>{pf?.title_ar || t.title_ar || 'مسار بلا هوية بعد'}</h2>
        {(pf?.summary_ar || t.summary_ar) && <p>{pf?.summary_ar || t.summary_ar}</p>}
        {DIM[trackManifest(t.key)?.priority] && <p className="tr-why"><b>لماذا هذا المسار: </b>يبدأ تعمّقه من {DIM[trackManifest(t.key).priority]}، الإطار الأولى بالتطوير في مستوياته.</p>}
        <EditWhere part={pf ? 'profile' : 'identity'} onIdentity={onIdentity} />
      </section>

      <div className={`tr-split${showAdmin ? ' two' : ''}`}>
        {panes && (
          <div className="tr-tabs" role="tablist" aria-label="صفحة المسار">
            {[['participant', 'ما يراه المشارك'], ['admin', 'إعدادات الإدارة']].map(([key, label]) => (
              <button key={key} type="button" role="tab" id={`tr-tab-${key}`} aria-selected={pane === key} aria-controls={`tr-pane-${key}`} tabIndex={pane === key ? 0 : -1}
                onClick={() => setPane(key)} onKeyDown={(e) => { const n = e.key === 'Home' ? 'participant' : e.key === 'End' ? 'admin' : (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ? (key === 'participant' ? 'admin' : 'participant') : null; if (n) { e.preventDefault(); setPane(n); e.currentTarget.parentElement.querySelector(`#tr-tab-${n}`)?.focus(); } }}>{label}</button>
            ))}
          </div>
        )}
        {participant}
        {admin}
      </div>

      <TrackJourney k={t.key} catalog={catalog} handbook={r.handbook} />

      <section className="la-card">
        <div className="la-row between"><h3>كتاب المسار كما يقرؤه المشارك</h3><span className="la-muted">{r.handbook.length} بابًا</span></div>
        <><p className="la-muted">كتاب المسار من أبواب الأطر الثلاثة بمستواه.</p><details className="la-more small muted"><summary>كيف يعمل؟</summary><p>الكتاب مركّب من أبواب الأطر الثلاثة بمستوى هذا المسار في كل إطار، والفقرات الخاصة بمستويات أخرى محذوفة. تعديل أي باب يسري على كل المسارات التي تشترك فيه، ويتم من «كتاب القائد».</p></details></>
        <EditWhere part="handbook" />
        {r.handbook.length ? (
          <div className="la-hb">
            <nav className="la-hb-toc" aria-label="أبواب الكتاب">{groups.map((g) => g.items.length > 0 && (
              <div key={g.d}><b>{DIM[g.d]} · {LVL[r.levels[g.d]]}</b>{g.items.map((c) => (
                <button key={c.id} className="la-link" onClick={() => document.getElementById(`hb-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{c.title}</button>
              ))}</div>
            ))}</nav>
            <div className="la-hb-body">{r.handbook.map((c) => (
              <article key={c.id} className="la-hb-ch" id={`hb-${c.id}`}>
                <div className="la-row between">
                  <small className="la-muted">{DIM_ROMAN[c.dimension]} · {DIM[c.dimension]}</small>
                  {canWrite && <button className="btn-sm ghost" onClick={() => setChapter((catalog.handbook_modules || []).find((x) => x.id === c.id))}>تعديل الباب</button>}
                </div>
                <h3>{c.title}</h3>
                <div className="la-md">{c.md ? <Md text={c.md} /> : <p className="la-muted">هذا الباب بلا محتوى بعد.</p>}</div>
              </article>
            ))}</div>
          </div>
        ) : <p className="la-muted">لا أبواب بمحتوى لهذا المسار بعد.</p>}
      </section>

      <section className="la-card">
        <div className="la-row between"><h3>المشاركون في هذا المسار</h3><span className="la-muted">{ps.length} مشارك · {ps.filter((p) => p.approved).length} معتمد</span></div>
        {ps.length ? (
          <table className="la-table">
            <thead><tr><th>الاسم</th><th>الجهة</th><th>الحالة</th><th>المسار</th></tr></thead>
            <tbody>{ps.map((p) => (
              <tr key={p.id} className="la-click" onClick={() => onPerson(p.id)}>
                <td><button className="la-link" onClick={(e) => { e.stopPropagation(); onPerson(p.id); }}><b>{p.full_name}</b></button><br /><small className="la-muted" dir="ltr">{p.email}</small></td>
                <td>{p.organization_name || ''}</td><td>{STATUS[p.status] || p.status}</td>
                <td>{p.approved ? <span className="la-chip ok">معتمد</span> : <span className="la-chip warn">مبدئي</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="la-muted">لا مشاركين في هذا المسار بعد.</p>}
      </section>
      {chapter && <ChapterEditor m={chapter} catalog={catalog} canWrite={canWrite} onClose={(saved) => { setChapter(null); if (saved) { load(); onSaved(); } }} />}
      {editing && (
        <Form title={`مسار ${t.key}`} fields={trackFields(r.profile)} values={t}
          onSave={(row) => L('admin.save', { entity: 'tracks', row: { key: t.key, ...row } })}
          onClose={(saved) => { setEditing(false); if (saved) { toast('تم الحفظ'); load(); onSaved(); } }} />
      )}
    </>
  );
}

// ── بطاقات المسارات الـ27: عرض فقط، كل سطر من trackManifest نفسه الذي تقرؤه الرحلة والكتاب والوثيقة (بطاقة المسار) ──
export const CARDS_ROUTE = 'cards';
export const ALL_TRACKS = LVLS.flatMap((m) => LVLS.flatMap((i) => LVLS.map((l) => trackKey(m, i, l))));
const HB_AR = { guided: 'موجّه', applied: 'تطبيقي', specialist: 'متخصص' };
const SUP_AR = { readiness: 'أسئلة الجاهزية', examples: 'أمثلة محلولة', on_demand: 'عند الطلب' };
const CASE_AR = { readiness: '3 أسئلة جاهزية', case3: '3 مسوّغات', case5: '5 مسوّغات' };
// عارض البطاقة الواحد: جدول البطاقات وقسم «رحلة المسار» في صفحة المسار يقرآن cardRow ويعرضان أطرها بـCardFrameworks
export function cardRow(k, catalog = null, handbook = []) {
  const m = trackManifest(k);
  const c = m.card;
  return {
    key: k, profile: c.identity.title, name: c.identity.name, priority: m.priority,
    handbook: `${HB_AR[c.handbook.type]} · ${c.handbook.order.map((d) => DIM_ROMAN[d]).join(' ')}`,
    doc: `${c.initiative.name} · ${c.initiative.pages[0]} إلى ${c.initiative.pages[1]} ص`, cap: c.initiative.required_cap,
    journey: c.journey.requirements.join(' '), labs: c.journey.labs.length,
    support: `${SUP_AR[c.support.mode]} · ${CASE_AR[c.support.case.form]} · ${c.support.estimate_hours[0]} إلى ${c.support.estimate_hours[1]} س`,
    bridges: c.bridges.length,
    hours: c.support.estimate_hours, frameworks: cardFrameworks(m, catalog, handbook),
  };
}
export function CardFrameworks({ rows }) {
  const list = (h, xs, empty, item) => <div><h4>{h}</h4>{xs.length ? <ul>{xs.map(item)}</ul> : <p className="la-muted">{empty}</p>}</div>;
  return (
    <div className="tr-fw" data-testid="track-frameworks">{rows.map((row) => (
      <article key={row.dimension} className="tr-fw-row">
        <header><b>{DIM_ROMAN[row.dimension]} · {DIM[row.dimension]}</b> <span className={`la-lvl ${row.level}`}>{LVL[row.level]}</span>
          {row.deep && <span className="la-chip tr-deep" title="الإطار المعمّق">★ الإطار المعمّق</span>}</header>
        {list('البنود', row.items, 'لا بنود خاصة بهذا المستوى.', (it) => (
          <li key={it.code}>{it.href
            ? <a className="la-link" href={it.href} aria-label={`${it.title}، في مرحلة ${it.stage}، افتح الرحلة على هذه المرحلة`}>{it.title}</a>
            : <span>{it.title}</span>}
            {' '}<small className="la-muted">{it.stage ? `في مرحلة «${it.stage}»` : 'ليس في رحلة البرنامج'}</small></li>
        ))}
        {list('المختبرات', row.labs, 'لا مختبرات.', (l) => <li key={l.key}>{l.title}</li>)}
        {list('أبوابه في الكتاب', row.chapters, 'لا أبواب بمحتوى لهذا الإطار بعد.', (c) => <li key={c.id}>{c.title}</li>)}
        {row.bridges.length > 0 && list('الجسور', row.bridges, '', (t, i) => <li key={i}>{t}</li>)}
      </article>
    ))}</div>
  );
}
export function TrackCards({ onOpen }) {
  const rows = ALL_TRACKS.map(cardRow);
  return (
    <section className="la-card tx-cards" data-testid="track-cards">
      <div className="row between"><h2>بطاقات المسارات الـ{TRACK_COUNT}</h2><button className="la-btn ghost" onClick={() => onOpen(null)}>→ لوحات المسارات</button></div>
      <p className="la-note">ما يصل كل مسار في الكتاب والوثيقة والرحلة والدعم، محلولًا من بطاقته (supabase/content/tracks/v2/cards.json وslices.json). عرض فقط: يُحرَّر في ملفات المحتوى.</p>
      <div className="la-table-wrap"><table className="la-table">
        <thead><tr><th>المسار</th><th>ملف التعريف</th><th>الكتاب</th><th>الوثيقة</th><th>حد المطلوب</th><th>الرحلة</th><th>مختبرات</th><th>الدعم</th><th>جسور</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.key}>
            <td><button className="link" onClick={() => onOpen(r.key)}><code>{r.key}</code></button><div><LvlChips k={r.key} /></div></td>
            <td><b>{r.profile}</b><small className="muted" style={{ display: 'block' }}>{r.name}</small></td>
            <td>{r.handbook}</td><td>{r.doc}</td><td>{r.cap}</td>
            <td><small dir="ltr">{r.journey}</small><details className="la-more small"><summary>الأطر</summary><CardFrameworks rows={r.frameworks} /></details></td><td>{r.labs}</td><td>{r.support}</td><td>{r.bridges}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

export default function Tracks({ catalog, reload, canWrite, trackKey: open, onOpen, onPerson }) {
  if (open === CARDS_ROUTE) return <TrackCards onOpen={onOpen} />;
  return open
    ? <Track k={open} catalog={catalog} canWrite={canWrite} onBack={() => onOpen(null)} onPerson={onPerson} onSaved={reload} />
    : <Board tracks={catalog} onOpen={onOpen} />;
}
