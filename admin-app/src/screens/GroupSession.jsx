// ════════════════════════════════════════════════════════════════
// الجلسة الجماعية مع المستشار (تصور تشغيل الدفعة 2026-11-19، 4.4، المرحلة 5)
// ════════════════════════════════════════════════════════════════
// GroupSessionCreate: من شريط الإجراءات الجماعية في «المتابعة». نافذة واحدة: نشاط الاستشارة والمستشار (خبراء الدفعة بحِملهم) والعنوان
//   والموعد والمدة والمكان أو الرابط وخانة «لا تُحسب من الرصيد»، وتحتها المعاينة بحكم الخادم لكل مختار: من يُدعى، ومن استنفد
//   رصيده أو لم تُفتح له الخدمة (يُتخطى أو يُضاف استثناءً)، ومن لا يُضاف بسببه. وتعارض موعد المستشار تنبيه يُؤكَّد.
// GroupSessions: قسم «جلسات جماعية» في «الحضور والجلسات ← الجلسات الفردية»: ما ينتظر تأكيد الحضور، والقادمة، والمنعقدة، ولكل جلسة
//   ورقة حضورها وتعديلها وإلغاؤها وإزالة مدعو منها.
// GroupSessionAdd: «أضف مدعوين» إلى جلسة قائمة: تختار من أعضاء دفعتها غير المدعوين، فتظهر المعاينة نفسها بحكم الخادم، ثم تؤكد.
//   وتحت كل مدعو سطر بريد دعوته (من سجل البريد) وزر «أعد الدعوة» بمهلته، وزر واحد لكل من لم يُسجَّل حضوره.
// قبل ترحيل الميزة يقول الخادم ready=false، فتقول النافذة والقسم «غير مفعّل بعد» ولا يُعرض نموذج. والمنطق في group-session.js.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GroupSessionSheet from '../../../shared/ui/GroupSessionSheet.jsx';
import { L, weekTime as when } from '../leaders.js';
import { timeOnly } from '../dates.js';
import Form from '../Form.jsx';
import { Spinner, useEscape, useGuardedClose, useUI } from '../ui.jsx';
import { addedAr, conflictAr, formBlock, GROUP_STATE_AR, groupCountsAr, groupSections, invited, inviteLineAr, mailAr, MODE_OPTIONS, previewBody, previewGroups, previewLine, resendable, resendState, resentAr, saveBody, savedAr } from '../group-session.js';
import { minutesAr } from '../../../supabase/functions/leaders-api/logic.js';

export const NOT_READY_AR = 'الجلسة الجماعية مع المستشار غير مفعّلة بعد. تعمل بعد تحديث قاعدة البيانات القادم.';
const placeAr = (g) => (g.mode === 'in_person' ? g.location || 'حضوري' : g.join_url ? 'عن بعد برابط' : 'عن بعد، والرابط يُضاف لاحقًا');

function Verdicts({ title, list, tone = '', exceptions, onToggle, hint }) {
  if (!list.length) return null;
  return (
    <section className={`gs-group ${tone}`}>
      <h4>{title} <small>({list.length})</small></h4>
      {hint && <p className="la-muted small">{hint}</p>}
      <ul>{list.map((m) => (
        <li key={m.id}>
          <span className="gs-who"><b>{m.name || 'حساب'}</b>
            {(m.reason || m.test || m.busy) && <small className="la-muted">{[m.reason, m.test ? 'حساب اختبار: يُدعى ولا يصله بريد' : '', m.busy ? 'له جلسة أخرى في هذا الوقت' : ''].filter(Boolean).join(' · ')}</small>}
            {m.category === 'ok' && m.max != null && <small className="la-muted">رصيده {m.used} من {m.max}</small>}</span>
          {onToggle && <label className="la-check gs-ex"><input type="checkbox" checked={exceptions.has(m.id)} onChange={() => onToggle(m.id)} /> أضفه استثناءً</label>}
        </li>
      ))}</ul>
    </section>
  );
}

export function GroupSessionCreate({ c, ids, onClose }) {
  const [d, setD] = useState(null);
  const [v, setV] = useState({ requirement_id: '', expert_id: '', title_ar: '', starts_at: '', minutes: 60, mode: 'online', join_url: '', location_ar: '', off: false });
  const [exceptions, setExceptions] = useState(() => new Set());
  const [okConflict, setOkConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const [fresh, setFresh] = useState(true);
  const seq = useRef(0);
  const touched = v.expert_id || v.starts_at || v.title_ar || v.join_url || v.location_ar || exceptions.size > 0;
  const close = useGuardedClose(!saved && !!touched, () => onClose(!!saved));
  useEscape(close);

  // المعاينة تُقرأ من جديد حين يتغير ما يغيّر حكمها: النشاط، وخانة الرصيد، والمستشار والموعد (للتعارض). آخر طلب وحده يُعرض
  const key = `${v.requirement_id}|${v.off}|${v.expert_id}|${v.starts_at}|${v.minutes}`;
  useEffect(() => {
    const n = ++seq.current;
    setFresh(false);
    const t = setTimeout(async () => {
      const r = await L('admin.coaching-group-preview', previewBody(c.id, ids, v));
      if (n !== seq.current) return;
      setD(r || { success: false });
      setFresh(true);
      if (r?.success && r.ready && r.requirement_id && !v.requirement_id) {
        const req = r.requirements.find((x) => x.id === r.requirement_id);
        setV((x) => ({ ...x, requirement_id: r.requirement_id, minutes: req?.minutes || x.minutes, mode: req?.mode || x.mode, location_ar: x.location_ar || req?.location || '' }));
      }
    }, d ? 350 : 0);
    return () => clearTimeout(t);
  }, [c.id, key]);

  const set = (k) => (e) => { setError(''); setV((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })); };
  const pickReq = (e) => { const req = d.requirements.find((x) => x.id === e.target.value); setError(''); setV((x) => ({ ...x, requirement_id: e.target.value, minutes: req?.minutes || x.minutes })); };
  const toggle = (id) => setExceptions((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const members = d?.success ? d.members || [] : [];
  const g = useMemo(() => previewGroups(members), [members]);
  const conflicts = d?.success ? d.conflicts || [] : [];

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const block = formBlock(v, members, exceptions);
    if (block) return setError(block);
    if (conflicts.length && !okConflict) return setError('للمستشار موعد آخر في هذا الوقت. غيّر الموعد، أو علّم «احفظ مع التعارض»');
    setBusy(true);
    const r = await L('admin.coaching-group-save', saveBody(c.id, ids, v, exceptions, okConflict));
    setBusy(false);
    if (r?.success) return setSaved(r);
    // تعارض ظهر بين المعاينة والحفظ: تُقرأ المعاينة من جديد ليظهر
    if (r?.code === 'expert_conflict') { seq.current += 1; const p = await L('admin.coaching-group-preview', previewBody(c.id, ids, v)); if (p?.success) setD(p); }
    setError(r?.message || 'تعذّر الحفظ');
  };

  const shell = (body) => (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="la-form mi-form gs-form" role="dialog" aria-modal="true" aria-labelledby="gs-title" data-testid="group-create">
        <h3 id="gs-title">جلسة مع مستشار: {ids.length === 1 ? 'مشارك واحد محدد' : `${ids.length} محددين`} من {c.name}</h3>
        {body}
      </div>
    </div>
  );
  if (!d) return shell(<Spinner />);
  if (!d.success) return shell(<><p className="la-err" role="alert">{d.message || 'تعذّرت قراءة المعاينة'}</p><div className="la-row"><button type="button" className="btn-sm ghost" onClick={() => onClose(false)}>إغلاق</button></div></>);
  if (d.ready === false) return shell(<><p className="la-muted" role="status" data-testid="gs-not-ready">{NOT_READY_AR}</p><div className="la-row"><button type="button" className="btn-sm ghost" onClick={() => onClose(false)}>إغلاق</button></div></>);
  if (saved) {
    return shell(<>
      <p className="gs-saved" role="status" data-testid="gs-saved">{savedAr(saved)}</p>
      {saved.skipped?.length > 0 && <ul className="la-form-notes">{saved.skipped.map((x) => <li key={x.id}>{x.name || 'حساب'}: لم يُضف، {x.reason}</li>)}</ul>}
      <p className="la-muted small">تجدها في «الحضور والجلسات»، تحت «جلسات جماعية»: ورقة حضورها وتعديلها وإلغاؤها. وتظهر لكل مدعو في رحلته تحت الاستشارة.</p>
      <div className="la-row">
        <a className="btn-sm primary" href="#/leaders/activities?sub=groups">افتح «الحضور والجلسات»</a>
        <button type="button" className="btn-sm ghost" onClick={() => onClose(true)}>إغلاق</button>
      </div>
    </>);
  }
  if (!d.requirements.length) return shell(<><p className="la-muted">برنامج هذه الدفعة ليس فيه نشاط استشارة (جلسات فردية بحجز). أضفه من «الرحلة والمتطلبات» أولًا.</p><div className="la-row"><button type="button" className="btn-sm ghost" onClick={() => onClose(false)}>إغلاق</button></div></>);

  const req = d.requirements.find((x) => x.id === v.requirement_id);
  const n = invited(members, exceptions).length;
  return shell(
    <form onSubmit={submit} noValidate>
      <div className="gs-fields">
        {d.requirements.length > 1 && <label>نشاط الاستشارة
          <select value={v.requirement_id} onChange={pickReq}><option value="">اختر النشاط</option>{d.requirements.map((r) => <option key={r.id} value={r.id}>{r.title}{r.stage ? ` · ${r.stage}` : ''}</option>)}</select></label>}
        <label>المستشار
          <select value={v.expert_id} onChange={set('expert_id')} aria-describedby="gs-expert-help">
            <option value="">اختر من خبراء الدفعة</option>
            {d.experts.map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.upcoming ? `${e.upcoming} ${e.upcoming === 1 ? 'جلسة قادمة' : 'جلسات قادمة'}` : 'لا جلسات قادمة'}</option>)}
          </select>
          <small className="la-muted" id="gs-expert-help">{d.experts.length ? 'مستشار الدفعة وأعضاء فريقها ممن يخدمون في الرحلة.' : 'لا خبير في فريق هذه الدفعة. أضفه من «الفريق والمجموعات» أولًا.'}</small></label>
        <label className="gs-wide">عنوان الجلسة (اختياري)
          <input type="text" value={v.title_ar} onChange={set('title_ar')} maxLength={200} placeholder={req ? `جلسة جماعية: ${req.title}` : 'جلسة جماعية'} /></label>
        <label>الموعد
          <input type="datetime-local" value={v.starts_at} onChange={set('starts_at')} /></label>
        <label>المدة بالدقائق
          <input type="number" min="15" max="480" step="5" value={v.minutes} onChange={set('minutes')} /></label>
        <label>طريقة الجلسة
          <select value={v.mode} onChange={set('mode')}>{Object.entries(MODE_OPTIONS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        {v.mode === 'in_person'
          ? <label>المكان<input type="text" value={v.location_ar} onChange={set('location_ar')} maxLength={300} placeholder="مثل: قاعة الاجتماعات، الدور الثالث" /></label>
          : <label>رابط الجلسة (اختياري)<input type="url" dir="ltr" value={v.join_url} onChange={set('join_url')} maxLength={500} placeholder="https://" /></label>}
        <label className="la-check with-help gs-wide"><input type="checkbox" checked={v.off} onChange={set('off')} />
          <span>لا تُحسب من الرصيد<small className="la-muted">بلا هذه الخانة تأخذ الجلسة جلسة واحدة من رصيد استشارات كل مدعو{req?.max != null ? ` (حده ${req.max})` : ''}. علّمها لجلسة تدعو إليها خارج حقه.</small></span></label>
      </div>

      <div className={`gs-preview${fresh ? '' : ' is-stale'}`} aria-busy={!fresh} data-testid="gs-preview">
        <p className="gs-line" role="status"><b>المعاينة:</b> {v.requirement_id ? previewLine(members, exceptions) : 'اختر نشاط الاستشارة لتظهر المعاينة.'}</p>
        <Verdicts title="سيُدعون" list={g.ok} tone="ok" exceptions={exceptions} />
        <Verdicts title="استنفدوا رصيدهم" list={g.at_max} tone="warn" exceptions={exceptions} onToggle={toggle} hint="يُتخطون، أو تضيفهم استثناءً يُكتب في السجل ويُحسب في رصيدهم كما وقع." />
        <Verdicts title="الخدمة لم تُفتح لهم بعد" list={g.locked} tone="warn" exceptions={exceptions} onToggle={toggle} hint="يُتخطون، أو تضيفهم استثناءً: تصلهم الدعوة، وتظهر الجلسة في رحلتهم." />
        <Verdicts title="لا يُضافون" list={g.ineligible} tone="bad" exceptions={exceptions} />
      </div>

      {conflicts.length > 0 && (
        <div className="gs-conflict" role="alert" data-testid="gs-conflict">
          <b>للمستشار موعد آخر في هذا الوقت:</b> {conflicts.map((x) => conflictAr(x, when)).join('، ')}.
          <label className="la-check"><input type="checkbox" checked={okConflict} onChange={(e) => { setOkConflict(e.target.checked); setError(''); }} /> احفظ مع التعارض</label>
        </div>
      )}
      {error && <p className="la-err" role="alert">{error}</p>}
      <div className="la-row">
        <button type="submit" className="btn-sm primary" disabled={busy || !fresh}>{busy ? 'يُحفظ…' : n ? `احفظ وادعُ ${n === 1 ? 'المدعو' : `المدعوين (${n})`}` : 'احفظ'}</button>
        <button type="button" className="btn-sm ghost" onClick={close} disabled={busy}>إلغاء</button>
      </div>
      <p className="la-muted small">الحفظ يرسل دعوة بالبريد لكل مدعو بموعدها ومستشارها وملف تقويم، بلا أسماء بقية المدعوين، وبريدًا واحدًا للمستشار بالعدد. جلسة مضى موعدها تُحفظ بلا بريد.</p>
    </form>,
  );
}

// ── «أضف مدعوين» إلى جلسة قائمة: الاختيار من أعضاء الدفعة، والمعاينة نفسها بحكم الخادم ──
export function GroupSessionAdd({ g, onClose }) {
  const [d, setD] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [exceptions, setExceptions] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const [fresh, setFresh] = useState(true);
  const seq = useRef(0);
  const close = useGuardedClose(!saved && picked.size > 0, () => onClose(!!saved));
  useEscape(close);
  const ids = useMemo(() => [...picked], [picked]);
  const key = ids.join(',');
  useEffect(() => {
    const n = ++seq.current;
    setFresh(false);
    const t = setTimeout(async () => {
      const r = await L('admin.coaching-group-candidates', { id: g.id, participant_ids: ids });
      if (n !== seq.current) return;
      setD(r || { success: false });
      setFresh(true);
    }, d ? 300 : 0);
    return () => clearTimeout(t);
  }, [g.id, key]);
  const flip = (set) => (id) => { setError(''); set((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const pick = flip(setPicked), toggle = flip(setExceptions);
  const members = d?.success ? d.members || [] : [];
  const v = useMemo(() => previewGroups(members), [members]);
  const n = invited(members, exceptions).length;
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!picked.size) return setError('اختر من تضيفهم أولًا');
    if (!n) return setError('لا أحد من المختارين يُضاف إلى هذه الجلسة');
    if (n > d.room) return setError(`يتسع في الجلسة ${d.room} بعد، والمختارون ${n}`);
    setBusy(true);
    const r = await L('admin.coaching-group-add', { id: g.id, participant_ids: ids, exceptions: [...exceptions] });
    setBusy(false);
    if (r?.success) return setSaved(r);
    setError(r?.message || 'تعذّرت الإضافة');
  };
  const shell = (body) => (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="la-form mi-form gs-form" role="dialog" aria-modal="true" aria-labelledby="gs-add-title" data-testid="group-add">
        <h3 id="gs-add-title">أضف مدعوين إلى «{g.title}»</h3>
        {body}
      </div>
    </div>
  );
  const shut = <div className="la-row"><button type="button" className="btn-sm ghost" onClick={() => onClose(!!saved)}>إغلاق</button></div>;
  if (!d) return shell(<Spinner />);
  if (!d.success) return shell(<><p className="la-err" role="alert">{d.message || 'تعذّرت قراءة المعاينة'}</p>{shut}</>);
  if (d.ready === false) return shell(<><p className="la-muted" role="status" data-testid="gs-not-ready">{NOT_READY_AR}</p>{shut}</>);
  if (saved) {
    return shell(<>
      <p className="gs-saved" role="status" data-testid="gs-added">{addedAr(saved)}</p>
      {saved.skipped?.length > 0 && <ul className="la-form-notes">{saved.skipped.map((x) => <li key={x.id}>{x.name || 'حساب'}: لم يُضف، {x.reason}</li>)}</ul>}
      {shut}
    </>);
  }
  if (d.blocked) return shell(<><p className="la-muted" role="status">{d.blocked}</p>{shut}</>);
  if (!d.candidates.length) return shell(<><p className="la-muted" role="status">كل أعضاء الدفعة ممن في البرنامج مدعوون إلى هذه الجلسة.</p>{shut}</>);
  const shown = d.candidates.filter((c) => !q.trim() || String(c.name || '').includes(q.trim()));
  return shell(
    <form onSubmit={submit} noValidate>
      <p className="la-muted small">{[g.cohort, g.expert ? `مع ${g.expert}` : '', when(g.starts_at), d.session.counts ? 'تُحسب جلسة من رصيد كل مدعو' : 'لا تُحسب من الرصيد'].filter(Boolean).join(' · ')}</p>
      <fieldset className="gs-pick">
        <legend>أعضاء الدفعة غير المدعوين ({d.candidates.length})</legend>
        {d.candidates.length > 8 && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم" aria-label="ابحث بالاسم" />}
        <ul>{shown.map((c) => (
          <li key={c.id}><label className="la-check"><input type="checkbox" checked={picked.has(c.id)} onChange={() => pick(c.id)} />
            <span>{c.name || 'حساب'}{c.was && <small className="la-muted"> · {c.was === 'excused' ? 'اعتذر عنها من قبل' : 'أُزيل منها من قبل'}</small>}</span></label></li>
        ))}</ul>
        {!shown.length && <p className="la-muted small">لا اسم يطابق البحث.</p>}
      </fieldset>

      <div className={`gs-preview${fresh ? '' : ' is-stale'}`} aria-busy={!fresh} data-testid="gs-preview">
        <p className="gs-line" role="status"><b>المعاينة:</b> {picked.size ? previewLine(members, exceptions) : 'اختر من القائمة لتظهر المعاينة.'}</p>
        <Verdicts title="سيُدعون" list={v.ok} tone="ok" exceptions={exceptions} />
        <Verdicts title="استنفدوا رصيدهم" list={v.at_max} tone="warn" exceptions={exceptions} onToggle={toggle} hint="يُتخطون، أو تضيفهم استثناءً يُكتب في السجل ويُحسب في رصيدهم كما وقع." />
        <Verdicts title="الخدمة لم تُفتح لهم بعد" list={v.locked} tone="warn" exceptions={exceptions} onToggle={toggle} hint="يُتخطون، أو تضيفهم استثناءً: تصلهم الدعوة، وتظهر الجلسة في رحلتهم." />
        <Verdicts title="لا يُضافون" list={v.ineligible} tone="bad" exceptions={exceptions} />
      </div>
      {error && <p className="la-err" role="alert">{error}</p>}
      <div className="la-row">
        <button type="submit" className="btn-sm primary" disabled={busy || !fresh}>{busy ? 'يُضاف…' : n ? `أضف وادعُ ${n === 1 ? 'المدعو' : `المدعوين (${n})`}` : 'أضف'}</button>
        <button type="button" className="btn-sm ghost" onClick={close} disabled={busy}>إلغاء</button>
      </div>
      <p className="la-muted small">{d.session.past ? 'بدأت الجلسة، فتُحفظ الإضافة بلا بريد.' : 'تصل الدعوة بموعدها وملف تقويمها إلى من تضيفهم وحدهم. المدعوون السابقون والمستشار لا يصلهم بريد، والمستشار يرى العدد والأسماء في بوابته.'}</p>
    </form>,
  );
}

// ── قسم «جلسات جماعية» في «الحضور والجلسات» ──
function GroupCard({ g, canWrite, trainers, reload }) {
  const { toast, confirm } = useUI();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [form, setForm] = useState(null);
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState('');
  const load = useCallback(async () => {
    const r = await L('admin.coaching-groups', { id: g.id });
    const x = r?.success ? r.groups?.[0] : null;
    return x ? { success: true, session: x, people: x.members } : { success: false, message: r?.message || 'تعذّرت قراءة الجلسة' };
  }, [g.id]);
  const save = useCallback((body) => L('admin.coaching-group-mark', { id: g.id, ...body }), [g.id]);
  const live = g.status === 'scheduled';
  const marked = g.attended + g.no_show > 0;
  const cancel = async () => {
    if (!(await confirm(`تُلغى «${g.title}» لكل مدعويها (${g.count})، ويعود ما أُخذ من رصيدهم.${g.ended ? '' : ' يصلهم ويصل المستشار بريد بالإلغاء.'}`, { ok: 'ألغِ الجلسة', danger: true }))) return;
    const r = await L('admin.coaching-group-cancel', { id: g.id });
    toast(r.success ? `أُلغيت الجلسة.${mailAr(r.mail, r.expert_mail) ? ` ${mailAr(r.mail, r.expert_mail)}.` : ''}` : r.message);
    if (r.success) reload();
  };
  const remove = async (m) => {
    if (!(await confirm(`يُزال ${m.full_name} من «${g.title}»${m.off ? '' : ' ويعود ما أُخذ من رصيده'}.${g.ended ? '' : ' يصله بريد بذلك.'}`, { ok: 'أزله', danger: true }))) return;
    const r = await L('admin.coaching-group-remove', { id: g.id, participant_id: m.id });
    toast(r.success ? `أُزيل ${m.full_name} من الجلسة` : r.message);
    if (r.success) reload();
  };
  // إعادة الدعوة: لمدعو واحد، أو لكل من لم يُسجَّل حضوره. الخادم يحكم بالمهلة ويعيد ما خرج وما لم يُعد
  const again = resendable(g);
  const resend = async (m) => {
    if (sending) return;
    if (!m && !(await confirm(`تُعاد الدعوة بموعدها وملف تقويمها إلى ${again.length === 1 ? 'مدعو واحد لم يُسجَّل حضوره' : `${again.length} مدعوين لم يُسجَّل حضورهم`}. من أُرسلت له قبل أقل من ${g.resend_minutes || 60} دقيقة لا تُعاد له.`, { ok: 'أعد الدعوة' }))) return;
    setSending(m ? m.id : 'all');
    const r = await L('admin.coaching-group-resend', { id: g.id, ...(m ? { participant_id: m.id } : {}) });
    setSending('');
    toast(r.success ? `${resentAr(r)}.` : r.message);
    reload();
  };
  const edit = () => setForm({
    title: `تعديل: ${g.title}`,
    fields: [
      { name: 'title_ar', label: 'عنوان الجلسة' },
      ...(marked ? [] : [
        { name: 'expert_id', label: 'المستشار', type: 'select', options: Object.fromEntries((trainers || []).map((e) => [e.id, e.full_name])) },
        { name: 'starts_at', label: 'الموعد', type: 'datetime' },
        { name: 'minutes', label: 'المدة بالدقائق', type: 'number' },
        { name: 'mode', label: 'طريقة الجلسة', type: 'select', options: MODE_OPTIONS },
        { name: 'location_ar', label: 'المكان', show: (v) => v.mode === 'in_person' },
        { name: 'join_url', label: 'رابط الجلسة', dir: 'ltr', show: (v) => v.mode !== 'in_person' },
        { name: 'confirm_conflict', label: 'احفظ ولو كان للمستشار موعد آخر في هذا الوقت', type: 'check' },
      ]),
    ],
    values: { title_ar: g.title, expert_id: g.expert_id, starts_at: g.starts_at, minutes: Math.round((Date.parse(g.ends_at) - Date.parse(g.starts_at)) / 6e4), mode: g.mode, location_ar: g.location || '', join_url: g.join_url || '' },
    notes: () => [marked ? { text: 'سُجّل حضور هذه الجلسة، فيُعدَّل عنوانها وحده.' } : { text: g.ended ? 'تغيير الموعد إلى وقت قادم يبلّغ المدعوين والمستشار بالبريد.' : 'تغيير الموعد أو المكان أو المستشار يبلّغ المدعوين والمستشار بالبريد، بملف تقويم محدَّث.' }],
    onSave: async (v) => {
      const r = await L('admin.coaching-group-save', { id: g.id, ...v, join_url: v.join_url || '', location_ar: v.location_ar || '' });
      if (r?.success && !r.unchanged) toast(`حُفظ التعديل.${mailAr(r.mail, r.expert_mail) ? ` ${mailAr(r.mail, r.expert_mail).replace(/دعوة واحدة|دعوات/, (x) => (x === 'دعوة واحدة' ? 'رسالة واحدة' : 'رسائل'))}.` : ''}`);
      return r;
    },
  });
  return (
    <li className={`gs-card${live ? '' : ' off'}`} data-testid="group-card">
      <div className="gs-card-head">
        <div className="gs-card-main">
          <b>{g.title}</b>
          <small className="la-muted">{[g.cohort, g.expert ? `مع ${g.expert}` : 'بلا مستشار', when(g.starts_at), minutesAr(Math.round((Date.parse(g.ends_at) - Date.parse(g.starts_at)) / 6e4)), placeAr(g)].filter(Boolean).join(' · ')}</small>
          <small className="la-muted">{groupCountsAr(g)}{g.counts ? '' : ' · لا تُحسب من الرصيد'}</small>
        </div>
        <div className="gs-card-acts">
          {!live && <span className="la-chip">ملغاة</span>}
          {g.awaiting && <span className="la-chip warn">تنتظر تأكيد الحضور</span>}
          {live && <button type="button" className={`btn-sm ${g.awaiting ? 'primary' : 'ghost'}`} onClick={() => setSheet(true)}>ورقة الحضور</button>}
          {live && canWrite && <button type="button" className="la-link" onClick={edit}>عدّل</button>}
          {live && canWrite && g.can_add && <button type="button" className="la-link" onClick={() => setAdding(true)}>أضف مدعوين</button>}
          {live && canWrite && !marked && <button type="button" className="la-link" onClick={cancel}>ألغِ الجلسة</button>}
          <button type="button" className="la-link" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'أخفِ المدعوين' : `المدعوون (${g.count})`}</button>
        </div>
      </div>
      {open && (<>
        <ul className="gs-members">{g.members.map((m) => {
          const rs = g.can_resend ? resendState(m) : 'none';
          const line = g.can_resend ? inviteLineAr(m, when, g.mail_known !== false) : '';
          return (
            <li key={m.id}>
              <span className="gs-member"><span>{m.full_name}{m.test && <small className="la-muted"> · حساب اختبار</small>}{m.off && <small className="la-muted"> · خارج الرصيد</small>}</span>
                {line && <small className={m.mail?.state === 'failed' ? 'gs-mail bad' : 'gs-mail la-muted'} data-testid="gs-mail-line">{line}</small>}</span>
              <span className={`la-chip ${m.state === 'attended' ? 'ok' : m.state === 'no_show' ? 'bad' : ''}`}>{GROUP_STATE_AR[m.state] || m.state}</span>
              {canWrite && rs === 'ready' && <button type="button" className="la-link" disabled={!!sending} onClick={() => resend(m)} aria-label={`أعد الدعوة إلى ${m.full_name}`}>{sending === m.id ? 'تُرسل…' : 'أعد الدعوة'}</button>}
              {canWrite && rs === 'held' && <small className="la-muted gs-held" data-testid="gs-held">أُرسلت قبل قليل، تُعاد بعد {timeOnly(m.mail.resend_at)}</small>}
              {live && canWrite && m.state === 'booked' && g.count > 1 && <button type="button" className="la-link" onClick={() => remove(m)} aria-label={`أزل ${m.full_name} من الجلسة`}>أزله</button>}
            </li>
          );
        })}</ul>
        {canWrite && g.can_resend && again.length > 0 && (
          <div className="gs-resend-all">
            <button type="button" className="btn-sm ghost" disabled={!!sending} onClick={() => resend(null)}>{sending === 'all' ? 'تُرسل…' : `أعد الدعوة لمن لم يُسجَّل حضوره (${again.length})`}</button>
            <small className="la-muted">لا تُعاد لمن أُرسلت له قبل أقل من {g.resend_minutes || 60} دقيقة.</small>
          </div>
        )}
      </>)}
      {sheet && <GroupSessionSheet load={load} save={save} role="admin" canWrite={canWrite} title={g.title}
        sub={[g.cohort, g.expert ? `مع ${g.expert}` : '', when(g.starts_at)].filter(Boolean).join(' · ')} onClose={(changed) => { setSheet(false); if (changed) reload(); }} />}
      {form && <Form {...form} onClose={(ok) => { setForm(null); if (ok) reload(); }} />}
      {adding && <GroupSessionAdd g={g} onClose={(ok) => { setAdding(false); if (ok) reload(); }} />}
    </li>
  );
}

export function GroupSessions({ data, reload, canWrite }) {
  if (data.groups_ready === false) {
    return <section className="la-card gs-section" data-testid="group-sessions"><h3>جلسات جماعية</h3><p className="la-muted" data-testid="gs-not-ready">{NOT_READY_AR}</p></section>;
  }
  const s = groupSections(data.coaching_groups || []);
  const any = s.awaiting.length + s.upcoming.length + s.done.length + s.cancelled.length > 0;
  const block = (title, list) => (list.length > 0 && <>
    <h4 className="la-phase">{title} ({list.length})</h4>
    <ul className="gs-cards">{list.map((g) => <GroupCard key={g.id} g={g} canWrite={canWrite} trainers={data.cohort_trainers?.[g.cohort_id] || []} reload={reload} />)}</ul>
  </>);
  return (
    <section className="la-card gs-section" id="gs-section" data-testid="group-sessions">
      <h3>جلسات جماعية</h3>
      <p className="la-muted small">جلسة واحدة مع المستشار لعدة مشاركين: تُحسب للمستشار مرة واحدة، ولكل مدعو جلسة من رصيده. تُنشأ من ملف الدفعة، تبويب «المتابعة»: حدّد المشاركين ثم «جلسة مع مستشار». ومن هنا تضيف إليها مدعوين وتعيد إرسال دعوتها.</p>
      {data.groups_failed && <p className="la-err" role="alert">تعذّرت قراءة الجلسات الجماعية الآن. حدّث الصفحة بعد قليل.</p>}
      {!any && !data.groups_failed && <p className="la-muted">لا جلسات جماعية بعد.</p>}
      {block('تنتظر تأكيد الحضور', s.awaiting)}
      {block('القادمة', s.upcoming)}
      {block('المنعقدة', s.done)}
      {block('الملغاة', s.cancelled)}
    </section>
  );
}
