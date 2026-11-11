// ════════════════════════════════════════════════════════════════
// الفريق والمجموعات في دفعة: نقطة واحدة للمستشار والفريق وخبراء المجموعات
// ════════════════════════════════════════════════════════════════
// تصور ربط الخبراء والمجموعات بالجهة v1 (الخيار ج، المرحلة 1، باعتماد المالك 2026-11-11).
// الدفعة نقطة الربط: يُقرأ الفريق ويُكتب في مصادره القائمة (team.ts)، ولا يُكرَّر في نموذج «تحرير» الدفعة.
// الإضافة بحث في المعتمدين أو دعوة شخص جديد في خطوة واحدة، والحمل تنبيه لا منع.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { L } from '../leaders.js';
import { Empty, Spinner, useEscape, useGuardedClose, useUI } from '../ui.jsx';
import { EXPERT_ROLE_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { APPROVED, coverageNotes, loadText, OVER_AR, peopleAr, periodAr, rankForAdd, roleAr, rolesAr, scopeText, statusChip } from '../team.js';
import { GroupsPanel } from './Groups.jsx';

const TABS = [['team', 'الفريق'], ['groups', 'المجموعات ونمط العمل']];

// ── نافذة «أضف إلى الفريق» ──
function AddMember({ d, preset, onDone, onCancel }) {
  const { toast, confirm } = useUI();
  const [mode, setMode] = useState('pick');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState('');
  const [role, setRole] = useState(preset?.scope === 'advisor' ? 'advisor' : '');
  const [scope, setScope] = useState(preset?.scope || 'cohort');
  const [groupId, setGroupId] = useState(preset?.group_id || d.groups[0]?.id || '');
  const [inv, setInv] = useState({ full_name: '', email: '', title: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEscape(onCancel);
  const list = rankForAdd(d.experts, { q, role });
  const picked = d.experts.find((e) => e.id === pick) || null;
  const roles = mode === 'invite' ? Object.keys(EXPERT_ROLE_AR) : picked?.roles || [];
  useEffect(() => { if (role && roles.length && !roles.includes(role) && mode === 'pick' && picked) setRole(''); }, [pick]); // الدور من أدوار المختار
  useEffect(() => { if (mode === 'invite') setScope('cohort'); }, [mode]);
  const advisor = d.rows.find((r) => r.advisor);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (mode === 'pick' && !picked) return setErr('اختر الخبير من القائمة، أو ادعُ شخصًا جديدًا');
    if (!role) return setErr('اختر دوره في هذه الدفعة');
    if (scope === 'group' && !groupId) return setErr('اختر المجموعة');
    if (scope === 'advisor' && advisor && advisor.expert_id !== picked?.id
      && !(await confirm(`يحل ${picked.full_name} محل ${advisor.expert.full_name} مستشارًا أساسيًا، وتنتقل إليه المراجعات المعلّقة. يبقى ${advisor.expert.full_name} في الفريق. متابعة؟`))) return;
    setBusy(true);
    const body = { cohort_id: d.cohort.id, role, scope, ...(scope === 'group' ? { group_id: groupId } : {}),
      ...(mode === 'invite' ? { invite: { full_name: inv.full_name.trim(), email: inv.email.trim(), title: inv.title.trim() || undefined } } : { expert_id: picked.id }) };
    const r = await L('admin.team-add', body);
    setBusy(false);
    if (!r.success) return setErr(r.message);
    const who = mode === 'invite' ? inv.full_name.trim() : picked.full_name;
    toast(r.invited ? `أُرسلت الدعوة إلى ${inv.email.trim()}، وأُضيف ${who} إلى الفريق` : r.over ? `أُضيف ${who} إلى الفريق. تنبيه: ${OVER_AR}` : `أُضيف ${who} إلى الفريق`);
    onDone();
  };

  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="la-form mi-form ct-add" role="dialog" aria-modal="true" aria-label={`أضف إلى فريق «${d.cohort.name}»`} onSubmit={submit} noValidate>
        <h3>أضف إلى فريق «{d.cohort.name}»</h3>
        <div className="la-subtabs" role="group" aria-label="من تضيف">
          <button type="button" aria-pressed={mode === 'pick'} className={mode === 'pick' ? 'on' : ''} onClick={() => setMode('pick')}>خبير من الشبكة</button>
          <button type="button" aria-pressed={mode === 'invite'} className={mode === 'invite' ? 'on' : ''} onClick={() => setMode('invite')}>ادعُ شخصًا جديدًا</button>
        </div>
        {mode === 'pick' ? (
          <fieldset className="ct-fs">
            <legend>الخبير</legend>
            <input type="search" placeholder="ابحث بالاسم أو المسمى" aria-label="ابحث في الخبراء المعتمدين" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="ct-pick" role="radiogroup" aria-label="الخبراء المعتمدون">
              {!list.length && <p className="la-muted">لا خبير معتمد بهذا الاسم. ادعُ شخصًا جديدًا ببريده.</p>}
              {list.slice(0, 30).map((x) => (
                <label key={x.id} className={`ct-opt${pick === x.id ? ' on' : ''}`}>
                  <input type="radio" name="ct-expert" value={x.id} checked={pick === x.id} onChange={() => setPick(x.id)} />
                  <span><b>{x.full_name}</b>{x.in_team && <small className="la-chip">في الفريق</small>}{x.load?.full && <small className="la-chip warn">▲ بلغ سعته</small>}
                    <small className="la-muted">{[x.title, rolesAr(x.roles)].filter(Boolean).join(' · ')}</small>
                    <small className="la-muted">{loadText(x.load)}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <fieldset className="ct-fs">
            <legend>الشخص الجديد</legend>
            <p className="la-muted small">يُنشأ ملفه مدعوًا، وتصله دعوة واحدة يستكمل بها ملفه. يدخل الفريق الآن، ويُعيَّن مستشارًا أو خبير مجموعة بعد اعتماد ملفه.</p>
            <div className="of-grid">
              <label className="of-field"><span className="of-label">الاسم الكامل *</span><input value={inv.full_name} onChange={(e) => setInv({ ...inv, full_name: e.target.value })} maxLength={120} autoComplete="off" /></label>
              <label className="of-field"><span className="of-label">البريد *</span><input type="email" dir="ltr" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} autoComplete="off" /></label>
              <label className="of-field"><span className="of-label">المسمى</span><input value={inv.title} onChange={(e) => setInv({ ...inv, title: e.target.value })} maxLength={160} /></label>
            </div>
          </fieldset>
        )}
        <fieldset className="ct-fs">
          <legend>دوره في هذه الدفعة</legend>
          {mode === 'pick' && !picked ? <p className="la-muted small">اختر الخبير أولًا لتظهر أدوار ملفه.</p> : (
            <div className="ct-radios">{roles.map((k) => (
              <label key={k}><input type="radio" name="ct-role" value={k} checked={role === k} onChange={() => setRole(k)} /> {roleAr(k)} <small className="la-muted">{EXPERT_ROLE_AR[k][1]}</small></label>
            ))}</div>
          )}
          {mode === 'invite' && <small className="la-muted">يصير هذا الدور أول أدوار ملفه.</small>}
        </fieldset>
        <fieldset className="ct-fs">
          <legend>النطاق</legend>
          <div className="ct-radios">
            <label><input type="radio" name="ct-scope" checked={scope === 'cohort'} onChange={() => setScope('cohort')} /> عضو في فريق الدفعة <small className="la-muted">يُعرض على مشاركيها أولًا حين يطلبون خبيرًا</small></label>
            <div className="ct-radio-row">
              <label><input type="radio" name="ct-scope" checked={scope === 'group'} disabled={mode === 'invite' || !d.groups.length} onChange={() => setScope('group')} /> خبير مجموعة</label>
              <select aria-label="المجموعة" value={groupId} disabled={scope !== 'group'} onChange={(e) => setGroupId(e.target.value)}>
                {d.groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.count})</option>)}
              </select>
              <small className="la-muted">{d.groups.length ? 'يصله تسليم أعضائها ويقيّمهم بدل مستشار الدفعة' : 'لا مجموعات في الدفعة بعد'}</small>
            </div>
            <label><input type="radio" name="ct-scope" checked={scope === 'advisor'} disabled={mode === 'invite'} onChange={() => setScope('advisor')} /> المستشار الأساسي <small className="la-muted">يصله كل تسليم في الدفعة إلا أعضاء المجموعات التي لها خبير</small></label>
          </div>
        </fieldset>
        <p className="la-muted small">المدة: {periodAr(d.cohort)}. يسري التكليف مدة الدفعة.</p>
        {picked?.load && <p className={`small ${picked.load.full ? 'ct-warn' : 'la-muted'}`} role={picked.load.full ? 'status' : undefined}>{picked.load.full ? `▲ ${OVER_AR}. ` : ''}{loadText(picked.load)}</p>}
        {err && <div className="la-err" role="alert">{err}</div>}
        <div className="la-row">
          <button className="btn-sm primary" type="submit" disabled={busy}>{busy ? 'لحظة…' : mode === 'invite' ? 'ادعُ وأضف' : 'أضف'}</button>
          <button className="btn-sm ghost" type="button" onClick={onCancel}>إلغاء</button>
        </div>
      </form>
    </div>
  );
}

// ── تبويب «الفريق» ──
function TeamTab({ cohortId, canWrite, onChanged }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [adding, setAdding] = useState(null);
  const load = useCallback(async () => setD(await L('admin.cohort-team', { cohort_id: cohortId })), [cohortId]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err" role="alert">{d.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div>;
  const advisor = d.rows.find((r) => r.advisor);
  const notes = coverageNotes(d.coverage);
  const done = () => { setAdding(null); onChanged(); load(); };
  const remove = async (r) => {
    const also = [r.advisor && 'مستشارًا أساسيًا', r.groups.length && `خبيرًا لـ${r.groups.map((g) => g.name).join('، ')}`].filter(Boolean);
    if (!(await confirm(`إزالة ${r.expert.full_name} من فريق الدفعة؟${also.length ? ` يُزال معه بصفته ${also.join(' و')}، ويعود المشاركون إلى المستوى الأعم ثم إلى الإدارة.` : ''}`, { danger: true, ok: 'إزالة' }))) return;
    const x = await L('admin.team-remove', { cohort_id: cohortId, expert_id: r.expert_id });
    toast(x.success ? `أُزيل ${r.expert.full_name} من الفريق` : x.message);
    if (x.success) { onChanged(); load(); }
  };
  const noAdvisor = async () => {
    if (!(await confirm(`ترك الدفعة بلا مستشار أساسي؟ تراجع الإدارة أعمال من ليس لمجموعته خبير. يبقى ${advisor.expert.full_name} في الفريق.`, { danger: true }))) return;
    const x = await L('admin.cohort-save', { id: cohortId, advisor_expert_id: null });
    toast(x.success ? 'الدفعة بلا مستشار أساسي الآن' : x.message);
    if (x.success) { onChanged(); load(); }
  };

  return (
    <>
      {d.cohort.is_default ? <p className="la-muted">الدفعة المفتوحة بلا فريق خاص: يُرشَّح لمشاركيها من الشبكة كلها.</p> : null}
      {notes.length > 0 && <ul className="ct-notes" role="status">{notes.map((n) => <li key={n}>⚠ {n}</li>)}</ul>}
      <section className="stack ct-sec" aria-labelledby="ct-adv">
        <div className="la-row between"><h4 id="ct-adv">المستشار الأساسي</h4>
          {canWrite && !d.cohort.is_default && <span className="la-row">
            <button className="btn-sm ghost" onClick={() => setAdding({ scope: 'advisor' })}>{advisor ? 'تغيير' : 'عيّن مستشارًا'}</button>
            {advisor && <button className="la-link" onClick={noAdvisor}>بلا مستشار</button>}</span>}</div>
        {advisor ? (
          <div className="ct-row">
            <b>{advisor.expert.full_name}</b>
            <span className={`la-chip ${statusChip(advisor.expert.status)[1]}`}>{statusChip(advisor.expert.status)[0]}</span>
            {advisor.expert.load?.full && <span className="la-chip warn" title={OVER_AR}>▲ بلغ سعته</span>}
            <small className="la-muted">{[advisor.expert.title, `يخدم هنا ${peopleAr(advisor.serves_here)}`, loadText(advisor.expert.load)].filter(Boolean).join(' · ')}</small>
          </div>
        ) : <p className="la-muted">بلا مستشار أساسي: تراجع الإدارة أعمال من ليس لمجموعته خبير.</p>}
      </section>
      <section className="stack ct-sec" aria-labelledby="ct-team">
        <div className="la-row between"><h4 id="ct-team">الفريق <small className="la-muted">· {d.rows.length} من {d.team_max}</small></h4>
          {canWrite && !d.cohort.is_default && <button className="btn-sm primary" onClick={() => setAdding({ scope: 'cohort' })}>+ أضف إلى الفريق</button>}</div>
        <p className="la-muted small">المدة: {periodAr(d.cohort)}. الأدوار من ملف كل خبير، والحمل تنبيه لا يمنع التكليف.</p>
        {!d.rows.length ? <Empty compact title="لا فريق لهذه الدفعة بعد" hint="أضف مستشارها وخبراءها هنا، أو ادعُ شخصًا جديدًا ببريده. يُعرض الفريق على مشاركي الدفعة أولًا حين يطلبون خبيرًا." /> : (
          <ul className="ct-list">{d.rows.map((r) => {
            const [st, tone] = statusChip(r.expert.status);
            return (
              <li key={r.expert_id} className="ct-row">
                <div className="ct-who"><b>{r.expert.full_name}</b><small className="la-muted">{r.expert.title || ''}</small></div>
                <div className="ct-what"><span>{scopeText(r)}</span><small className="la-muted">{rolesAr(r.expert.roles)}</small></div>
                <div className="ct-state"><span className={`la-chip ${tone}`}>{st}</span>{r.expert.load?.full && <span className="la-chip warn" title={OVER_AR}>▲ بلغ سعته</span>}</div>
                <div className="ct-load"><small className="la-muted">{[(r.advisor || r.groups.length) && APPROVED.includes(r.expert.status) ? `يخدم هنا ${peopleAr(r.serves_here)}` : null, loadText(r.expert.load)].filter(Boolean).join(' · ')}</small></div>
                {canWrite && <button className="la-link" onClick={() => remove(r)} aria-label={`إزالة ${r.expert.full_name} من الفريق`}>إزالة</button>}
              </li>
            );
          })}</ul>
        )}
      </section>
      {adding && <AddMember d={d} preset={adding} onDone={done} onCancel={() => setAdding(null)} />}
    </>
  );
}

export default function CohortTeam({ cohort, canWrite = true, initialTab = 'team', onClose }) {
  const { confirm } = useUI();
  const [tab, setTabNow] = useState(initialTab);
  const [dirty, setDirty] = useState(false);
  // مغادرة تبويب المجموعات تُسقط نمط عمل لم يُحفظ، فتسأل قبلها كالإغلاق
  const setTab = async (k) => {
    if (k === tab) return;
    if (tab === 'groups' && dirty && !(await confirm('لديك تعديلات لم تُحفظ في نمط العمل. المتابعة دون حفظ؟', { danger: true, ok: 'متابعة دون حفظ' }))) return;
    setDirty(false); setTabNow(k);
  };
  const changed = useRef(false);
  const onChanged = useCallback(() => { changed.current = true; }, []);
  // نمط عمل لم يُحفظ في تبويب المجموعات: Esc والنقر خارجها و«إغلاق» يسألون قبله
  const close = useGuardedClose(dirty, () => onClose(changed.current));
  useEscape(close);
  const tabs = useRef([]);
  const keyNav = (e, i) => {
    // الأسهم بين التبويبين (اتجاه من اليمين لليسار: السهم الأيسر للتالي)
    const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const n = (i + step + TABS.length) % TABS.length;
    setTab(TABS[n][0]); tabs.current[n]?.focus();
  };
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="la-form mi-form wide ct" role="dialog" aria-modal="true" aria-label={`الفريق والمجموعات: ${cohort.name}`}>
        <div className="la-row between"><h3>الفريق والمجموعات: «{cohort.name}»</h3>
          <button type="button" className="modal-close" aria-label="إغلاق" onClick={close}>✕</button></div>
        <div className="la-subtabs" role="tablist" aria-label="أقسام الدفعة">
          {TABS.map(([k, t], i) => (
            <button key={k} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`ct-tab-${k}`} aria-selected={tab === k} aria-controls={`ct-panel-${k}`}
              tabIndex={tab === k ? 0 : -1} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} onKeyDown={(e) => keyNav(e, i)}>{t}</button>
          ))}
        </div>
        <div role="tabpanel" id={`ct-panel-${tab}`} aria-labelledby={`ct-tab-${tab}`} className="stack">
          {tab === 'team'
            ? <TeamTab cohortId={cohort.id} canWrite={canWrite} onChanged={onChanged} />
            : <GroupsPanel cohort={cohort} canWrite={canWrite} onDirty={setDirty} onChanged={onChanged} onFail={() => onClose(changed.current)} />}
        </div>
        <div className="la-row"><button className="btn-sm ghost" onClick={close}>إغلاق</button></div>
      </div>
    </div>
  );
}
