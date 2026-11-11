// ════════════════════════════════════════════════════════════════
// مختبر القائد: لمن يُفتح، وكيف يؤدي المشاركون فيه
// ════════════════════════════════════════════════════════════════
// المختبر قسم مستقل في تطبيق القادة. تفتحه هنا لجهة كاملة أو لمشارك بعينه،
// للمختبر كله أو لأداة منه، ولمدة مفتوحة أو حتى تاريخ. والأداة "لكل المعتمدين"
// تظهر أيضًا لكل من اعتُمد مستواه في إطارها دون منح.
import React, { useCallback, useEffect, useState } from 'react';
import { L, DIM, LVL } from '../leaders.js';
import Form from '../Form.jsx';
import { Empty, Spinner, useUI } from '../ui.jsx';

import { KINDS } from '../../../supabase/functions/leaders-api/lab.js';
import LabBoard, { BOARD_LEVEL_AR, scaffoldText } from '../../../shared/lab/LabBoard.jsx';
const KIND = KINDS;
const day = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function Grants({ data, reload, canWrite }) {
  const { toast, confirm } = useUI();
  const [form, setForm] = useState(null);
  const orgName = Object.fromEntries(data.orgs.map((o) => [o.id, o.short_name || o.name]));
  const itemName = Object.fromEntries(data.items.map((it) => [it.id, it.title_ar]));
  const open = () => setForm({
    title: 'افتح المختبر',
    fields: [
      { name: 'target', label: 'لمن', type: 'select', options: { org: 'جهة كاملة (كل مشاركيها، الحاليين والقادمين)', person: 'مشارك بعينه' } },
      { name: 'organization_id', label: 'الجهة', type: 'select', options: Object.fromEntries(data.orgs.map((o) => [o.id, o.name])), show: (v) => v.target !== 'person' },
      { name: 'email', label: 'بريد المشارك', type: 'email', dir: 'ltr', show: (v) => v.target === 'person' },
      { name: 'item_id', label: 'ماذا', type: 'select', empty: 'المختبر كله (وما يُضاف إليه لاحقًا)', options: itemName },
      { name: 'expires_at', label: 'حتى (اختياري)', type: 'date', help: 'اتركه فارغًا ليبقى مفتوحًا. فتح الشيء نفسه مرة أخرى يجدد مدته.' },
    ],
    values: { target: 'org', organization_id: data.orgs[0]?.id },
    onSave: (v) => L('admin.lab-grant', v.target === 'person' ? { email: v.email, item_id: v.item_id, expires_at: v.expires_at } : { organization_id: v.organization_id, item_id: v.item_id, expires_at: v.expires_at }),
  });
  const revoke = async (g) => {
    const who = g.organization_id ? orgName[g.organization_id] || 'الجهة' : g.participants?.full_name || 'المشارك';
    if (!(await confirm(`إغلاق ${g.item_id ? `«${itemName[g.item_id]}»` : 'المختبر'} عن ${who}؟ تبقى محاولاته ونقاطه السابقة.`))) return;
    const r = await L('admin.lab-revoke', { id: g.id });
    if (!r.success) toast(r.message); else { toast('أُغلق'); reload(); }
  };
  const rows = (list, whoOf) => (
    <table className="la-table">
      <thead><tr><th>لمن</th><th>ماذا</th><th>المدة</th><th /></tr></thead>
      <tbody>{list.map((g) => {
        const who = whoOf(g);
        return (
          <tr key={g.id} className={g.live ? '' : 'off'}>
            <td>{who}</td>
            <td>{g.item_id ? itemName[g.item_id] : <b>المختبر كله</b>}</td>
            <td>{g.expires_at ? <>{g.live ? 'حتى' : <span className="la-chip bad">انتهى</span>} {day(g.expires_at)}</> : 'مفتوح'}<br /><small className="la-muted">{g.created_by} · {day(g.created_at)}</small></td>
            <td>{canWrite && <button className="la-link" onClick={() => revoke(g)}>إغلاق</button>}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );
  const orgs = data.grants.filter((g) => g.organization_id);
  const people = data.grants.filter((g) => g.participant_id);
  return (
    <section className="la-card">
      <div className="la-row between">
        <h3 style={{ margin: 0 }}>لمن المختبر مفتوح</h3>
        {canWrite && <button className="btn-sm primary" onClick={open}>+ افتح لجهة أو لمشارك</button>}
      </div>
      {!data.grants.length && <p className="la-muted" style={{ marginTop: 8 }}>لم يُفتح المختبر لأحد بعد. افتحه لجهة فيظهر لكل مشاركيها قسمًا مستقلًا في التطبيق، أو لمشارك بعينه.</p>}
      {orgs.length > 0 && <><h4 className="la-phase">الجهات ({orgs.length})</h4>{rows(orgs, (g) => orgName[g.organization_id] || 'جهة محذوفة')}</>}
      {people.length > 0 && <><h4 className="la-phase">المشاركون ({people.length})</h4>{rows(people, (g) => <>{g.participants?.full_name}<br /><small className="la-muted" dir="ltr">{g.participants?.email}</small></>)}</>}
      {form && <Form {...form} onClose={(saved) => { setForm(null); if (saved) { toast('فُتح المختبر'); reload(); } }} />}
    </section>
  );
}

// ── معاينة الأداة كمشارك بأي مستوى، وتحليل بطاقات لوحاتها (خريطة العمليات مثلًا) ──
// المعاينة بلا محاولة ولا تصحيح: السقالة كما يراها المشارك بمستواه، واللوحة تُجرَّب محليًا.
const PREVIEW_LEVELS = { beginner: BOARD_LEVEL_AR.beginner, intermediate: BOARD_LEVEL_AR.intermediate, advanced: BOARD_LEVEL_AR.advanced };
function Preview({ item, onClose }) {
  const [level, setLevel] = useState('beginner');
  const [d, setD] = useState(null);
  const [vals, setVals] = useState({});
  useEffect(() => {
    let live = true;
    setD(null); setVals({});
    L('admin.lab-preview', { id: item.id, level }).then((r) => { if (live) setD(r); });
    return () => { live = false; };
  }, [item.id, level]);
  return (
    <section className="la-card" aria-label={`معاينة ${item.title_ar}`}>
      <div className="la-row between">
        <h3 style={{ margin: 0 }}>معاينة كمشارك: {item.title_ar}</h3>
        <button className="la-link" onClick={onClose}>إغلاق</button>
      </div>
      <div className="la-row" role="radiogroup" aria-label="مستوى المشارك">
        {Object.entries(PREVIEW_LEVELS).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={level === k} className={`btn-sm ${level === k ? 'primary' : 'ghost'}`} onClick={() => setLevel(k)}>{l}</button>
        ))}
      </div>
      {!d ? <Spinner /> : !d.success ? <div className="la-err" role="alert">{d.message}</div> : (
        <ol className="la-lab-steps">
          {d.spec.steps.map((st, i) => (
            <li key={i} className={st.skip ? 'off' : ''}>
              <b>{st.title_ar || st.prompt_ar}</b>{st.skip && <span className="la-chip"> لا تظهر لهذا المستوى</span>}
              {!st.skip && <p className="la-muted">{st.prompt_ar}</p>}
              {!st.skip && st.type === 'board' && (
                <>
                  <p className="la-muted">السقالة: {scaffoldText(st.scaffold, true)}</p>
                  <LabBoard step={st} value={vals[i]} onChange={(v) => setVals((x) => ({ ...x, [i]: v }))} />
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CardStats({ item, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { L('admin.lab-cards', { id: item.id }).then(setD); }, [item.id]);
  return (
    <section className="la-card" aria-label={`تحليل بطاقات ${item.title_ar}`}>
      <div className="la-row between">
        <h3 style={{ margin: 0 }}>تحليل البطاقات: {item.title_ar}</h3>
        <button className="la-link" onClick={onClose}>إغلاق</button>
      </div>
      {!d ? <Spinner /> : !d.success ? <div className="la-err" role="alert">{d.message}</div> : !d.boards.length
        ? <p className="la-muted">لا لوحة في هذه الأداة.</p>
        : d.boards.map((b) => {
          const row = Object.fromEntries(b.rows.map((r) => [r.id, r.label]));
          const col = Object.fromEntries(b.cols.map((c) => [c.id, c.label]));
          const cards = [...b.cards].sort((x, y) => (x.right_pct ?? 101) - (y.right_pct ?? 101));
          return (
            <div key={b.step}>
              <h4 className="la-phase">{b.title} · {b.attempts} إجابة (بلا حساب العرض وحسابات الاختبار)</h4>
              {!b.attempts ? <p className="la-muted">لم يُجب أحد عن هذه اللوحة بعد.</p> : (
                <table className="la-table">
                  <thead><tr><th>البطاقة</th><th>خانتها</th><th>نسبة الصواب</th><th>أكثر خانة خاطئة</th><th>متوسط درجة التلميح</th></tr></thead>
                  <tbody>{cards.map((c) => (
                    <tr key={c.id}>
                      <td>{c.code && <b dir="ltr">{c.code} </b>}{c.label}</td>
                      <td><small>{col[c.col]} × {row[c.row]}</small></td>
                      <td>{c.right_pct == null ? '' : `${c.right_pct}%`}<small className="la-muted"> من {c.n}</small></td>
                      <td>{c.top_wrong ? <small>{col[c.top_wrong.col]} × {row[c.top_wrong.row]} ({c.top_wrong.n})</small> : ''}</td>
                      <td>{c.avg_hint || ''}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          );
        })}
    </section>
  );
}

function Items({ data, reload, canWrite }) {
  const { toast } = useUI();
  const [open, setOpen] = useState(null);
  const save = async (it, patch) => {
    const r = await L('admin.lab-item', { id: it.id, ...patch });
    if (!r.success) toast(r.message); else reload();
  };
  return (
    <section className="la-card">
      <h3>الأدوات والمواقف ({data.items.length})</h3>
      <table className="la-table">
        <thead><tr><th>الأداة</th><th>تظهر</th><th>جرّبها</th><th>متوسط أفضل نتيجة</th><th>أتقنها ({data.mastery}%)</th><th>مفعّلة</th><th /></tr></thead>
        <tbody>{!data.items.length && <tr><td colSpan={7}><Empty compact title="لا أدوات في المختبر بعد" hint="تظهر هنا أدوات العمل ومواقف المحاكاة بعد إضافتها إلى المحتوى، مع من جرّبها ومن أتقنها." /></td></tr>}{data.items.map((it) => (
          <tr key={it.id} className={it.active ? '' : 'off'}>
            <td><b>{it.title_ar}</b><br /><small className="la-muted">{KIND[it.kind]} · {DIM[it.dimension]} · من مستوى {LVL[it.min_level]} · {it.minutes} دقيقة · {it.points} نقطة</small></td>
            <td>
              <select value={it.audience} disabled={!canWrite} onChange={(e) => save(it, { audience: e.target.value })} aria-label={`لمن تظهر ${it.title_ar}`}>
                {Object.entries(data.audiences).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </td>
            <td>{it.stats.people}<small className="la-muted"> ({it.stats.attempts} محاولة)</small></td>
            <td>{it.stats.avg_best == null ? '' : `${it.stats.avg_best}%`}</td>
            <td>{it.stats.mastered}</td>
            <td><input type="checkbox" checked={!!it.active} disabled={!canWrite} onChange={(e) => save(it, { active: e.target.checked })} aria-label={`تفعيل ${it.title_ar}`} /></td>
            <td>
              <button className="la-link" onClick={() => setOpen({ it, view: 'preview' })} aria-label={`عاين ${it.title_ar} كمشارك`}>عاين كمشارك</button>
              {' · '}
              <button className="la-link" onClick={() => setOpen({ it, view: 'cards' })} aria-label={`تحليل بطاقات ${it.title_ar}`}>تحليل البطاقات</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
      {open?.view === 'preview' && <Preview item={open.it} onClose={() => setOpen(null)} />}
      {open?.view === 'cards' && <CardStats item={open.it} onClose={() => setOpen(null)} />}
    </section>
  );
}

export default function Lab({ canWrite }) {
  const [data, setData] = useState(null);
  const load = useCallback(async () => setData(await L('admin.lab')), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <Spinner />;
  if (!data.success) return <div className="la-err" role="alert">{data.message}</div>;
  return (
    <>
      <p className="la-muted">المختبر قسم مستقل في تطبيق القادة: أدوات عمل ومواقف محاكاة تُصحح فورًا وتمنح نقاطًا عند الإتقان. يراه من تفتحه له هنا، جهةً أو شخصًا، كله أو أداة منه. والأداة التي تجعلها «لكل المعتمدين» تظهر أيضًا لكل من اعتُمد مستواه في إطارها.</p>
      <Grants data={data} reload={load} canWrite={canWrite} />
      <Items data={data} reload={load} canWrite={canWrite} />
    </>
  );
}
