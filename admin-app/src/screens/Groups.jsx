// ════════════════════════════════════════════════════════════════
// المجموعات ونمط العمل في دفعة
// ════════════════════════════════════════════════════════════════
// نمط العمل لكل مرحلة (جماعي مع الدفعة، فردي، في مجموعات)، والمجموعات نفسها:
// توزيع آلي متنوع أو متقارب المستوى، ثم نقل أي مشارك يدويًا.
import React, { useCallback, useEffect, useState } from 'react';
import { L, LVL } from '../leaders.js';
import { Spinner, useEscape, useGuardedClose, useUI } from '../ui.jsx';
import { overallLevel, WORK_MODE_AR } from '../../../supabase/functions/leaders-api/logic.js';

// نمط العمل للمقارنة: المحدد وحده وبترتيب ثابت، فاختيار «غير محدد» ثم الرجوع لا يُعدّ تعديلًا
const modesKey = (m) => JSON.stringify(Object.keys(m || {}).filter((k) => m[k]).sort().map((k) => [k, m[k]]));

export default function CohortGroups({ cohort, onClose }) {
  const { toast, prompt, confirm } = useUI();
  const [d, setD] = useState(null);
  const [modes, setModes] = useState(cohort.stage_modes || {});
  const [savedModes, setSavedModes] = useState(() => modesKey(cohort.stage_modes));
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState('');   // عدد المجموعات للتوزيع الآلي؛ فارغ = نحو ستة في المجموعة
  const load = useCallback(async () => {
    const r = await L('admin.cohort-groups', { cohort_id: cohort.id });
    if (!r.success) { toast(r.message); onClose(); return; }
    setD(r); setModes(r.cohort.stage_modes || {}); setSavedModes(modesKey(r.cohort.stage_modes));
    setCount((c) => c || String(Math.max(1, Math.round(r.members.length / 6))));
  }, [cohort.id]); // toast وonClose من الأب تتغير كل عرض
  useEffect(() => { load(); }, [load]);

  const run = async (action, body, ok) => {
    setBusy(true);
    const r = await L(action, { cohort_id: cohort.id, ...body });
    setBusy(false);
    if (!r.success) return toast(r.message);
    if (ok) toast(ok);
    load();
  };
  const saveModes = async () => {
    setBusy(true);
    const r = await L('admin.cohort-save', { id: cohort.id, stage_modes: modes });
    setBusy(false);
    if (r.success) setSavedModes(modesKey(modes));
    toast(r.success ? 'حُفظ نمط العمل' : r.message);
  };
  const auto = async (by) => {
    const n = Math.min(d.members.length, Math.max(1, Math.round(Number(count)) || 1));
    const adv = d.groups.some((g) => g.advisor_expert_id) ? ' وخبراء المجموعات المعيّنون يُمسحون معها.' : '';
    if (d.groups.length && !(await confirm(`يستبدل التوزيع الآلي المجموعات الحالية وأعضاءها بـ${n} مجموعات.${adv} متابعة؟`, { danger: true }))) return;
    run('admin.cohort-groups-auto', { count: n, by }, 'وُزِّع المشاركون؛ انقل من تشاء يدويًا');
  };
  const add = async () => {
    const name = await prompt('اسم المجموعة', `المجموعة ${(d.groups.length || 0) + 1}`);
    if (name) run('admin.cohort-group-save', { name }, 'أُضيفت المجموعة');
  };
  const rename = async (g) => {
    const name = await prompt('اسم المجموعة', g.name);
    if (name) run('admin.cohort-group-save', { id: g.id, name }, 'تم');
  };
  const remove = async (g) => {
    if (await confirm(`حذف «${g.name}»؟ يبقى أعضاؤها في الدفعة بلا مجموعة.`, { danger: true })) run('admin.cohort-group-save', { id: g.id, delete: true }, 'حُذفت');
  };

  const lvl = (m) => LVL[overallLevel(m.levels)] || 'بلا قياس';
  // توازن المستويات في المجموعة بنظرة: «تأسيسي 2 · متوسط 3 · احترافي 1»
  const balance = (ms) => { const n = {}; ms.forEach((m) => { const k = lvl(m); n[k] = (n[k] || 0) + 1; }); return Object.entries(n).map(([k, v]) => `${k} ${v}`).join(' · '); };
  const unassigned = d?.members.filter((m) => !m.group_id) || [];
  const usesGroups = Object.values(modes).includes('groups') || cohort.project_mode === 'group';
  // إغلاق واحد لـEsc والنقر خارجها و«إغلاق»: يسأل إن بقي نمط عمل لم يُحفظ، ويُعيد التحميل لأن المجموعات تُحفظ فورًا
  const close = useGuardedClose(modesKey(modes) !== savedModes, () => onClose(true));
  useEscape(close);

  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="la-form mi-form wide" role="dialog" aria-modal="true" aria-label="المجموعات ونمط العمل">
        <h3>المجموعات ونمط العمل: «{cohort.name}»</h3>
        {!d ? <Spinner /> : (
          <>
            <section className="stack">
              <h4>نمط العمل في كل مرحلة</h4>
              <div className="table-wrap"><table className="data-table">
                <tbody>{d.stages.map((s) => (
                  <tr key={s.key}><td>{s.title_ar}</td><td>
                    <select aria-label={`نمط العمل في ${s.title_ar}`} value={modes[s.key] || ''} onChange={(e) => setModes({ ...modes, [s.key]: e.target.value || undefined })}>
                      <option value="">غير محدد</option>
                      {Object.entries(WORK_MODE_AR).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                    </select>
                  </td></tr>
                ))}</tbody>
              </table></div>
              <div><button className="btn-sm primary" disabled={busy} onClick={saveModes}>حفظ نمط العمل</button></div>
            </section>

            <section className="stack">
              <div className="la-row between">
                <h4>المجموعات <small className="la-muted">· {d.members.length} مشارك{unassigned.length ? ` · ${unassigned.length} بلا مجموعة` : ''}</small></h4>
                <div className="la-row">
                  <label className="la-row"><span className="la-muted">عدد المجموعات</span>
                    <input type="number" inputMode="numeric" min="1" max={Math.max(1, d.members.length)} value={count} onChange={(e) => setCount(e.target.value)} aria-label="عدد المجموعات" style={{ width: 72 }} /></label>
                  <small className="la-muted">{Number(count) > 0 ? `نحو ${Math.ceil(d.members.length / Math.min(d.members.length || 1, Math.round(Number(count))))} في المجموعة` : ''}</small>
                  <button className="la-link" disabled={busy || !d.members.length} onClick={() => auto('mixed')}>توزيع متنوع المستويات</button>
                  <button className="la-link" disabled={busy || !d.members.length} onClick={() => auto('level')}>توزيع متقارب المستوى</button>
                  <button className="btn-sm ghost" disabled={busy} onClick={add}>+ مجموعة</button>
                </div>
              </div>
              {!usesGroups && <p className="la-muted">لا مرحلة في هذه الدفعة بنمط «في مجموعات» ولا مشروع جماعي؛ المجموعات اختيارية هنا.</p>}
              <div className="la-groups">
                {[...d.groups, { id: null, name: 'بلا مجموعة' }].map((g) => {
                  const ms = d.members.filter((m) => (m.group_id || null) === g.id);
                  if (!g.id && !ms.length) return null;
                  return (
                    <div key={g.id || 'none'} className={`la-card la-group${g.id ? '' : ' off'}`}>
                      <div className="la-row between"><b>{g.name} <small className="la-muted">({ms.length})</small></b>
                        {g.id && <span className="la-row"><button className="la-link" onClick={() => rename(g)}>تسمية</button><button className="la-link" onClick={() => remove(g)}>حذف</button></span>}</div>
                      {ms.length > 0 && <small className="la-muted">{balance(ms)}</small>}
                      {/* خبير المجموعة: يظهر حين يقول الخادم إنه جاهز. بلا اختيار يبقى أعضاؤها مع مستشار الدفعة */}
                      {g.id && d.group_advisor_ready && (
                        <label className="la-group-adv"><span className="la-muted">خبير المجموعة</span>
                          <select aria-label={`خبير ${g.name}`} value={g.advisor_expert_id || ''} disabled={busy}
                            onChange={(e) => run('admin.cohort-group-save', { id: g.id, advisor_expert_id: e.target.value || null }, e.target.value ? 'عُيّن خبير المجموعة' : 'عاد أعضاؤها لمستشار الدفعة')}>
                            <option value="">مستشار الدفعة</option>
                            {(d.experts || []).map((x) => <option key={x.id} value={x.id}>{x.full_name}{x.team ? ' · من فريق الدفعة' : ''}</option>)}
                          </select></label>
                      )}
                      <ul className="la-reqs">{ms.map((m) => (
                        <li key={m.id}><span>{m.name} <small className="la-muted">{lvl(m)}</small></span>
                          <select aria-label={`مجموعة ${m.name}`} value={m.group_id || ''} disabled={busy} onChange={(e) => run('admin.cohort-group-assign', { participant_id: m.id, group_id: e.target.value || null })}>
                            <option value="">بلا مجموعة</option>
                            {d.groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select></li>
                      ))}</ul>
                    </div>
                  );
                })}
              </div>
            </section>
            <div className="la-row"><button className="btn-sm ghost" onClick={close}>إغلاق</button></div>
          </>
        )}
      </div>
    </div>
  );
}
