// ════════════════════════════════════════════════════════════════
// المجموعات ونمط العمل في دفعة
// ════════════════════════════════════════════════════════════════
// نمط العمل لكل مرحلة (جماعي مع الدفعة، فردي، في مجموعات)، والمجموعات نفسها:
// توزيع آلي متنوع أو متقارب المستوى، ثم نقل أي مشارك يدويًا.
import React, { useCallback, useEffect, useState } from 'react';
import { L, LVL } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import { overallLevel, WORK_MODE_AR } from '../../../supabase/functions/leaders-api/logic.js';

export default function CohortGroups({ cohort, onClose }) {
  const { toast, prompt, confirm } = useUI();
  const [d, setD] = useState(null);
  const [modes, setModes] = useState(cohort.stage_modes || {});
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await L('admin.cohort-groups', { cohort_id: cohort.id });
    if (!r.success) { toast(r.message); onClose(); return; }
    setD(r); setModes(r.cohort.stage_modes || {});
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
    toast(r.success ? 'حُفظ نمط العمل' : r.message);
  };
  const auto = async (by) => {
    const n = await prompt(`كم مجموعة؟ (${d.members.length} مشارك)`, String(Math.max(1, Math.round(d.members.length / 6))));
    if (!n) return;
    if (d.groups.length && !(await confirm('يستبدل التوزيع الآلي المجموعات الحالية وأعضاءها. متابعة؟', { danger: true }))) return;
    run('admin.cohort-groups-auto', { count: Number(n), by }, 'وُزِّع المشاركون؛ انقل من تشاء يدويًا');
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
  const unassigned = d?.members.filter((m) => !m.group_id) || [];
  const usesGroups = Object.values(modes).includes('groups') || cohort.project_mode === 'group';

  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
            <div className="la-row"><button className="btn-sm ghost" onClick={() => onClose(true)}>إغلاق</button></div>
          </>
        )}
      </div>
    </div>
  );
}
