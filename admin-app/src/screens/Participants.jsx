// ════════════════════════════════════════════════════════════════
// المشاركون: القائمة بفلاترها وتصديرها والنقل الجماعي، وملف المشارك
// ════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Form from '../Form.jsx';
import {
  date, DIM, DIM_EN, DIMS, L, LVL, REQ, STATUS, SUB_ST, trackOfPlacements,
} from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import FilterBar, { useFilters } from '../FilterBar.jsx';
import { applyFilters, presetCounts } from '../filters.js';
import { Submission } from './Handbook.jsx';
import { ActivitySummary } from './Activities.jsx';
import { ExpertAssign } from './ExpertMatch.jsx';
import { stars } from '../handbook.js';
import { STAGE_STATUS_AR } from '../../../supabase/functions/leaders-api/labels.js';

const SCOPE = { project: 'مشروع', program: 'برنامج', portfolio: 'محفظة' };
// عدد الأسئلة بصيغة عربية سليمة: سؤال واحد، سؤالان، 3–10 أسئلة، 11+ سؤالًا
const questionsAr = (n) => (n === 1 ? 'سؤال واحد' : n === 2 ? 'سؤالان' : n <= 10 ? `${n} أسئلة` : `${n} سؤالًا`);

const DAY = 864e5;
const ACTIVE = ['placed', 'enrolled'];
// عروض سريعة: الحالات التي يتدخل فيها المدير عادة، وعدد كل منها ظاهر على رقاقتها
const PRESETS = [
  { key: 'approval', label: 'بانتظار الاعتماد', test: (p) => p.status === 'pending_approval' },
  { key: 'tentative', label: 'مستوى مبدئي', test: (p) => (p.placements || []).some((x) => !x.approved_at) },
  { key: 'idle', label: 'متوقف 14 يومًا', test: (p, now) => ACTIVE.includes(p.status) && (!p.last_login_at || now - Date.parse(p.last_login_at) > 14 * DAY) },
  { key: 'new', label: 'جدد هذا الأسبوع', test: (p, now) => now - Date.parse(p.created_at) <= 7 * DAY },
  { key: 'orphan', label: 'بلا جهة', test: (p) => !p.organization_id },
];
const KEYS = ['q', 'view', 'status', 'org', 'track', 'joined', 'seen'];

export function OrgSelect({ orgs, value, onChange, all = 'كل الجهات', label = 'الجهة' }) {
  return (
    <select className="filter-select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all}</option>
      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      <option value="none">بدون جهة</option>
    </select>
  );
}

function Lvl({ p, d }) {
  const x = (p.placements || []).find((y) => y.dimension === d);
  if (!x) return <span className="la-muted">·</span>;
  return <span className={`la-lvl ${x.level}${x.approved_at ? '' : ' tentative'}`} title={x.approved_at ? 'معتمد' : 'مبدئي'}>{LVL[x.level]}</span>;
}

function List({ orgs, canWrite, onOpen, initialStatus }) {
  const { toast, confirm } = useUI();
  const [f, setF, clearF, replaceF] = useFilters(KEYS, initialStatus ? { status: initialStatus } : {});
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [moveTo, setMoveTo] = useState('');
  const [adding, setAdding] = useState(false);

  // القائمة كاملة مرة واحدة (حتى 500)، والفلترة كلها في المتصفح فتستجيب فورًا
  const load = useCallback(async () => {
    setList(null); setError('');
    const r = await L('admin.participants', {});
    if (!r.success) { setList([]); return setError(r.message); }
    setList(r.participants || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const all = list || [];
  const tracks = useMemo(() => [...new Set(all.map((p) => trackOfPlacements(p.placements)).filter(Boolean))].sort(), [all]);
  const orgOf = (p) => orgs.find((o) => o.id === p.organization_id);
  const fields = useMemo(() => [
    { key: 'status', label: 'الحالات', get: (p) => p.status, options: Object.entries(STATUS) },
    { key: 'org', label: 'الجهات', get: (p) => p.organization_id || 'none', options: [...orgs.map((o) => [o.id, o.name]), ['none', 'بدون جهة']] },
    { key: 'track', label: 'المسارات', get: (p) => trackOfPlacements(p.placements) || p.track, options: tracks.map((k) => [k, k]) },
    { key: 'joined', label: 'التسجيل', all: 'أي تاريخ تسجيل', type: 'period', get: (p) => p.created_at },
    { key: 'seen', label: 'آخر دخول', all: 'أي آخر دخول', type: 'period', get: (p) => p.last_login_at },
  ], [orgs, tracks]);
  const spec = { fields, presets: PRESETS, text: (p) => [p.full_name, p.email, p.phone, p.job_title, orgOf(p)?.name || p.organization_name, trackOfPlacements(p.placements)].join(' ') };
  const shown = useMemo(() => applyFilters(all, spec, f), [all, f, fields]);
  const counts = useMemo(() => presetCounts(all, PRESETS), [all]);

  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = shown.length > 0 && shown.every((p) => picked.has(p.id));
  const toggleAll = () => setPicked((s) => { const n = new Set(s); shown.forEach((p) => (allOn ? n.delete(p.id) : n.add(p.id))); return n; });

  const move = async () => {
    if (!moveTo) return toast('اختر الجهة');
    if (!(await confirm(`نقل ${picked.size} مشارك إلى الجهة المختارة؟`))) return;
    const r = await L('admin.assign-org', { participant_ids: [...picked], organization_id: moveTo === 'none' ? null : moveTo });
    toast(r.success ? `نُقل ${r.moved ?? picked.size} مشارك` : r.message);
    if (r.success) { setPicked(new Set()); setMoveTo(''); load(); }
  };
  const exportCsv = async () => {
    const { exportWorkbook } = await import('../../../src/lib/brand/xlsx.js');
    const head = [['الاسم', 26], ['البريد', 30], ['الجوال', 16], ['المسمى', 22], ['الجهة', 24], ...DIMS.map((d) => [DIM_EN[d], 12]), ['المسار', 10], ['الحالة', 18], ['التسجيل', 16]];
    const lv = (p, d) => LVL[(p.placements || []).find((x) => x.dimension === d)?.level] || '';
    await exportWorkbook(
      { kind: 'PPL', title: 'مشاركو برنامج القادة', subtitle: shown.length === all.length ? 'كل المشاركين' : `${shown.length} من ${all.length} حسب الفلاتر`, sheet: 'المشاركون', file: 'Participants' },
      head.map(([label, width]) => ({ label, width })),
      shown.map((p) => [p.full_name, p.email, p.phone, p.job_title, orgOf(p)?.name || p.organization_name,
        ...DIMS.map((d) => lv(p, d)), trackOfPlacements(p.placements), STATUS[p.status] || p.status, date(p.created_at)]),
    );
    toast(`صُدّر ${shown.length} مشارك`);
  };

  return (
    <>
      <FilterBar scope="participants" state={f} set={setF} clear={clearF} replace={replaceF} fields={fields} presets={PRESETS} counts={counts}
        shown={shown.length} total={all.length} noun="مشارك" placeholder="ابحث بالاسم أو البريد أو الجوال أو الجهة"
        actions={<>
          <button className="refresh-btn" type="button" onClick={exportCsv} disabled={!shown.length}>تصدير Excel{shown.length !== all.length ? ` (${shown.length})` : ''}</button>
          {canWrite && <button className="refresh-btn" type="button" onClick={() => setAdding(true)}>+ مشارك</button>}
        </>} />
      {canWrite && picked.size > 0 && (
        <div className="la-bulk">
          <span><b>{picked.size}</b> محدد</span>
          <OrgSelect orgs={orgs} value={moveTo} onChange={setMoveTo} all="نقل إلى جهة…" label="نقل إلى جهة" />
          <button className="btn-sm primary" onClick={move}>نقل</button>
          <button className="btn-sm ghost" onClick={() => setPicked(new Set())}>إلغاء التحديد</button>
        </div>
      )}
      <div className="table-wrap"><table className="data-table la-cards">
        <thead><tr>
          {canWrite && <th><input type="checkbox" aria-label="تحديد الكل" checked={allOn} onChange={toggleAll} /></th>}
          <th>الاسم</th><th>الجهة</th>{DIMS.map((d) => <th key={d}>{DIM_EN[d]}</th>)}<th>المسار</th><th>الحالة</th><th>التسجيل</th>
        </tr></thead>
        <tbody>
          {!list ? <tr className="loading-row"><td colSpan={9}><Spinner /></td></tr>
            : error ? <tr><td colSpan={9}><div className="la-err">{error} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></td></tr>
              : !shown.length ? <tr><td colSpan={9} className="la-empty">{all.length ? 'لا نتائج لهذه الفلاتر. جرّب مسحها.' : 'لا مشاركين بعد'}</td></tr>
                : shown.map((p) => {
                  const og = orgOf(p);
                  const tk = trackOfPlacements(p.placements);
                  return (
                    <tr key={p.id} tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onOpen(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p.id); }}>
                      {canWrite && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`تحديد ${p.full_name}`} checked={picked.has(p.id)} onChange={() => toggle(p.id)} /></td>}
                      <td data-label="الاسم"><b>{p.full_name}</b><br /><small className="la-muted" dir="ltr">{p.email}</small></td>
                      <td data-label="الجهة">{og ? <span className="la-orgtag" style={{ '--org': og.color || 'var(--brand-gold)' }}>{og.short_name || og.name}</span> : p.organization_name}<br /><small className="la-muted">{p.job_title}</small></td>
                      {DIMS.map((d) => <td key={d} data-label={DIM[d]}><Lvl p={p} d={d} /></td>)}
                      <td data-label="المسار">{tk ? <code className="la-code">{tk}</code> : <span className="la-muted">·</span>}</td>
                      <td data-label="الحالة"><span className={`la-chip ${p.status === 'pending_approval' ? 'warn' : ''}`}>{STATUS[p.status] || p.status}</span></td>
                      <td data-label="التسجيل">{date(p.created_at)}</td>
                    </tr>
                  );
                })}
        </tbody>
      </table></div>
      {adding && (
        <Form title="إضافة مشارك"
          fields={[{ name: 'full_name', label: 'الاسم' }, { name: 'email', label: 'البريد', type: 'email', dir: 'ltr' }, { name: 'organization_name', label: 'الجهة' }, { name: 'job_title', label: 'المسمى' }]}
          onSave={(row) => L('admin.create-participant', row)}
          onClose={(saved) => { setAdding(false); if (saved) { toast('أُضيف المشارك'); load(); } }} />
      )}
    </>
  );
}

const pct = (v) => (v == null ? '·' : `${Math.round(v)}%`);

// أزرار التدخل بحسب حالة المرحلة: لا يُعرض إلا ما له أثر
function StageOverride({ s, onPick }) {
  if (s.override) return <div className="la-stage-ov"><small className="la-chip">{{ open: 'فُتحت له يدويًا', complete: 'اعتُمدت يدويًا', skip: 'أُعفي منها' }[s.override]}</small><button className="la-link" onClick={() => onPick('')}>إلغاء التدخل</button></div>;
  if (s.status === 'done') return null;
  return (
    <div className="la-stage-ov">
      {s.status === 'locked' && <button className="la-link" onClick={() => onPick('open')}>افتحها له</button>}
      <button className="la-link" onClick={() => onPick('complete')}>اعتمد اكتمالها</button>
      <button className="la-link" onClick={() => onPick('skip')}>أعفه منها</button>
    </div>
  );
}

function Person({ id, canWrite, onBack }) {
  const { toast, confirm, prompt } = useUI();
  const [r, setR] = useState(null);
  const [status, setStatus] = useState('');
  const [levels, setLevels] = useState({});
  const [notes, setNotes] = useState({});
  const [sub, setSub] = useState(null);

  const load = useCallback(async () => {
    const d = await L('admin.participant', { id });
    setR(d);
    if (!d.success) return;
    setStatus(d.participant.status);
    const latest = (d.assessments || []).find((a) => a.status === 'submitted');
    const lv = {}, nt = {};
    DIMS.forEach((dm) => {
      const x = d.profile?.dimensions.find((y) => y.dimension === dm);
      const ev = latest?.assessment_results?.find((y) => y.dimension === dm)?.evaluation;
      // قبل الاعتماد يُقترح مستوى المعيار؛ بعده يبقى ما اعتُمد
      lv[dm] = (!x?.approved && ev ? ev.level : x?.level) || '';
      nt[dm] = x?.note || '';
    });
    setLevels(lv); setNotes(nt);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!r) return <div className="la-load"><Spinner /></div>;
  if (!r.success) return <><button className="la-link" onClick={onBack}>→ كل المشاركين</button><div className="la-err">{r.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></>;

  const p = r.participant;
  const prof = r.profile;
  const latest = (r.assessments || []).find((a) => a.status === 'submitted');
  const res = (d) => latest?.assessment_results?.find((x) => x.dimension === d);
  const act = async (action, body, ok) => {
    const d = await L(action, body);
    toast(d.success ? ok : d.message);
    if (d.success) load();
    return d;
  };

  const approve = async () => {
    if (Object.values(levels).some((v) => !v) || DIMS.some((d) => !levels[d])) return toast('حدّد مستوى كل بُعد');
    if (!(await confirm('اعتماد المسار وإبلاغ المشارك بالبريد؟'))) return;
    act('admin.approve', { participant_id: p.id, levels, notes }, 'اعتُمد المسار وأُبلغ المشارك');
  };
  const reset = async () => {
    if (!(await confirm('يُلغى القياس الحالي ويعيده المشارك من البداية. المستوى المعتمد يبقى حتى تعتمد غيره. متابعة؟', { danger: true }))) return;
    act('admin.reset-assessment', { participant_id: p.id }, 'أُعيد فتح القياس');
  };
  const review = async (req, st) => {
    let note = null;
    if (st === 'returned') { note = await prompt('ملاحظة للمشارك: ما المطلوب تعديله؟'); if (note === null) return; }
    act('admin.review', { participant_id: p.id, requirement_id: req, status: st, note }, st === 'returned' ? 'أُعيد مع الملاحظة' : 'تم');
  };
  // تدخل في مرحلة لهذا المشارك وحده، بسبب مكتوب يُحفظ في السجل
  const stageAct = async (s, action) => {
    const msg = { open: `فتح «${s.title_ar}» له الآن؟`, complete: `اعتماد اكتمال «${s.title_ar}»؟`, skip: `إعفاؤه من «${s.title_ar}»؟`, '': `إلغاء التدخل في «${s.title_ar}» وإعادتها لقواعد البرنامج؟` }[action];
    const note = await prompt(`${msg}\nالسبب (يُحفظ في السجل):`, '');
    if (note === null) return;
    act('admin.stage-override', { participant_id: p.id, stage_key: s.key, action, note }, 'تم');
  };
  const evidence = async (path) => {
    const d = await L('admin.evidence-url', { path });
    if (d.success) window.open(d.url, '_blank', 'noopener'); else toast(d.message);
  };

  const pts = r.points || { total: 0, rank: { title: 'مستكشف' } };
  const book = r.book || [];
  const sc = book.reduce((a, b) => [a[0] + (b.quiz_score || 0), a[1] + (b.quiz_total || 0)], [0, 0]);

  return (
    <>
      <button className="la-link" onClick={onBack}>→ كل المشاركين</button>
      <div className="la-person">
        <section className="la-card">
          <div className="la-row between"><h3>{p.full_name}</h3><span className="la-chip">{STATUS[p.status] || p.status}</span></div>
          <dl className="la-dl">
            <dt>البريد</dt><dd dir="ltr">{p.email}</dd>
            <dt>الجوال</dt><dd dir="ltr">{p.phone}</dd>
            <dt>المسمى</dt><dd>{p.job_title}</dd>
            <dt>الجهة</dt><dd>{p.organization_name}</dd>
            <dt>القطاع</dt><dd>{p.sector}</dd>
            <dt>الخبرة</dt><dd>{p.years_experience != null ? `${p.years_experience} سنة` : ''}</dd>
            <dt>النطاق</dt><dd>{SCOPE[p.work_scope] || 'لم يحدد'}</dd>
            <dt>LinkedIn</dt><dd>{p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer">فتح</a>}</dd>
            <dt>السيرة</dt><dd>{r.cv_url ? <a href={r.cv_url} target="_blank" rel="noopener noreferrer">تنزيل (رابط مؤقت)</a> : 'لم تُرفع'}</dd>
            <dt>آخر دخول</dt><dd>{date(p.last_login_at)}</dd>
          </dl>
          {p.bio && <p className="la-bio">{p.bio}</p>}
          {canWrite && (
            <div className="la-row">
              <select aria-label="الحالة" value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button className="btn-sm ghost" disabled={status === p.status} onClick={() => act('admin.status', { participant_id: p.id, status }, 'تم التحديث')}>تغيير الحالة</button>
              <button className="btn-sm ghost" onClick={reset}>إعادة القياس</button>
            </div>
          )}
        </section>

        <section className="la-card">
          <div className="la-row between">
            <h3>المستوى في الأبعاد الثلاثة</h3>
            {prof && (prof.approved ? <span className="la-chip ok">معتمد</span> : <span className="la-chip warn">مبدئي، بانتظارك</span>)}
          </div>
          {!prof && !latest && <p className="la-muted">لم يُكمل القياس بعد. يمكنك تحديد مستواه يدويًا واعتماده.</p>}
          {prof?.track && (
            <div className="la-track-now"><code className="la-code">{prof.track.key}</code><b>{prof.track.title || 'مسار بلا عنوان'}</b>{prof.track.track_title && prof.track.track_title !== prof.track.title && <small className="la-muted"> · {prof.track.track_title}</small>}
              <p className="la-muted">{prof.track.summary}</p>{prof.track.strengths && <p className="la-muted">{prof.track.strengths}</p>}<small className="la-muted">يتحدث المسار تلقائيًا إن غيّرت مستوى أي إطار ثم اعتمدت.</small></div>
          )}
          <div className="table-wrap"><table className="la-table">
            <thead><tr><th>البُعد</th><th>معرفة</th><th>مواقف</th><th>ممارسة</th><th>المؤشر</th><th>المستوى</th><th>ملاحظة للمشارك</th></tr></thead>
            <tbody>{DIMS.map((d) => {
              const rr = res(d);
              const ev = rr?.evaluation;
              const x = prof?.dimensions.find((y) => y.dimension === d);
              return (
                <tr key={d}>
                  <td><b>{DIM_EN[d]}</b><br /><small>{DIM[d]}</small></td>
                  <td>{pct(rr?.knowledge_pct)}</td><td>{pct(rr?.skill_pct)}</td><td>{pct(rr?.behavior_pct)}</td>
                  <td>{ev?.composite != null ? <>
                    <b>{ev.composite}</b>
                    {ev.borderline && <><br /><span className="la-chip warn">حدّية</span></>}
                    {/* أعلام معلوماتية للمستشار: لا تغيّر المستوى المقترح */}
                    {(ev.flags || []).map((f) => <span key={f.key}><br /><span className="la-chip warn" title={f.reason_ar}>{f.reason_ar}</span></span>)}
                    {ev.reason && <><br /><small className="la-why">{ev.reason}</small></>}
                    {ev.items_to_flip != null && <><br /><small className="la-muted">يفصله {questionsAr(ev.items_to_flip)} عن المستوى التالي</small></>}
                  </> : '·'}</td>
                  <td>
                    {canWrite ? (
                      <select aria-label={`مستوى ${DIM_EN[d]}`} value={levels[d] || ''} onChange={(e) => setLevels({ ...levels, [d]: e.target.value })}>
                        <option value="">...</option>{Object.entries(LVL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    ) : LVL[x?.level] || ''}
                    {ev && <><br /><small className="la-muted">المعيار: {LVL[ev.level]}</small></>}
                  </td>
                  <td>{canWrite ? <input aria-label={`ملاحظة ${DIM_EN[d]}`} value={notes[d] || ''} placeholder="اختياري" onChange={(e) => setNotes({ ...notes, [d]: e.target.value })} /> : x?.note}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
          {canWrite && <>
            <button className="btn-sm primary" onClick={approve}>{prof?.approved ? 'تحديث الاعتماد' : 'اعتماد المسار وفتح البرنامج'}</button>
            <p className="la-muted">الاعتماد يفتح مراحل التأهيل والكتيب للمشارك ويرسل له بريدًا.</p>
          </>}
        </section>
      </div>

      <section className="la-card">
        <div className="la-row between"><h3>الرحلة</h3><span className="la-muted">{r.progress}% · {r.journey.filter((s) => s.status === 'done').length}/{r.journey.length} مراحل</span></div>
        <div className="la-journey">{r.journey.map((s) => (
          <div key={s.key} className={`la-stage ${s.status}`}>
            <div className="la-row between"><b>{s.title_ar}</b><span className={`la-chip ${s.status === 'done' ? 'ok' : s.status === 'active' ? 'warn' : ''}`}>{s.skipped ? 'أُعفي منها' : STAGE_STATUS_AR[s.status]}</span></div>
            {s.lock_reason && <small className="la-muted">{s.lock_reason}</small>}
            {canWrite && <StageOverride s={s} onPick={(action) => stageAct(s, action)} />}
            <ul>{s.items.length ? s.items.map((it) => (
              <li key={it.id} className={it.status}>
                <span>{it.status === 'done' ? '✓' : it.status === 'submitted' ? '●' : '○'} {it.title_ar} <small className="la-muted">{REQ[it.status]}</small>
                  <ActivitySummary a={it.activity} /></span>
                <span className="la-row">
                  {it.evidence_path && <button className="la-link" onClick={() => evidence(it.evidence_path)}>الملف</button>}
                  {canWrite && !it.auto && s.status !== 'locked' && <>
                    {it.status !== 'done' && <button className="btn-sm primary" onClick={() => review(it.id, 'done')}>اعتماد</button>}
                    {it.status === 'submitted' && <button className="btn-sm ghost" onClick={() => review(it.id, 'returned')}>إعادة مع ملاحظة</button>}
                    {it.status === 'done' && <button className="btn-sm ghost" onClick={() => review(it.id, 'pending')}>إلغاء</button>}
                  </>}
                </span>
              </li>
            )) : <li className="la-muted">لا متطلبات</li>}</ul>
          </div>
        ))}</div>
      </section>

      <section className="la-card la-book-card">
        <div className="la-row between"><h3>كتاب القائد والنماذج</h3><span className="rank-chip">{pts.rank.title} · {pts.total} نقطة</span></div>
        <div className="la-book-kpis">
          <span><b>{book.length}</b>باب أتمّه</span>
          <span><b>{sc[1] ? Math.round((sc[0] / sc[1]) * 100) : 0}%</b>دقة الاختبارات</span>
          <span><b>{(r.models || []).filter((x) => x.status !== 'draft').length}</b>نموذج سلّمه</span>
        </div>
        {(r.models || []).length > 0 && (
          <ul className="la-reqs">{r.models.map((x) => (
            <li key={x.id}><span>{x.learning_models?.title_ar} <span className={`la-chip ${SUB_ST[x.status]?.[1] || ''}`}>{SUB_ST[x.status]?.[0]}</span>{x.rating ? <span className="stars-c"> {stars(x.rating)}</span> : null}</span>
              {x.status !== 'draft' && <button className="la-link" onClick={() => setSub(x.id)}>{x.status === 'submitted' ? 'قيّم' : 'عرض'}</button>}</li>
          ))}</ul>
        )}
        {sub && <Submission id={sub} canWrite={canWrite} onClose={(saved) => { setSub(null); if (saved) load(); }} />}
      </section>

      <ExpertAssign participantId={id} canWrite={canWrite} />

      <section className="la-card"><h3>السجل</h3><ul className="la-log">
        {(r.history || []).length ? r.history.map((h, i) => <li key={i}><small>{date(h.created_at)}</small> {h.action} <small className="la-muted">{h.actor}</small></li>) : <li className="la-muted">لا شيء</li>}
      </ul></section>
    </>
  );
}

export default function Participants({ orgs, canWrite, personId, onOpen, initialStatus }) {
  return personId
    ? <Person id={personId} canWrite={canWrite} onBack={() => onOpen(null)} />
    : <List orgs={orgs} canWrite={canWrite} onOpen={onOpen} initialStatus={initialStatus} />;
}
