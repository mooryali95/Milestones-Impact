// الإجراءان الجماعيان على مشاركين محددين: تغيير الحالة والنقل إلى دفعة (admin.status وadmin.cohort-enroll، الإجراءان نفساهما
// اللذان في ملف المشارك). مكوّن واحد تستدعيه قائمة المشاركين وتبويب «المتابعة» في ملف الدفعة، فلا يُكتب الإجراء مرتين.
// الحد 50 في المرة (يطابق BULK_MAX في admin.ts، والخادم هو الحكم).
import React, { useEffect, useState } from 'react';
import { L, STATUS } from './leaders.js';
import { useUI } from './ui.jsx';
import { enrollCohort } from './cohort-guard.js';
import { STATUS_REASON_MIN, statusNeedsReason } from '../../supabase/functions/leaders-api/notice-rules.js';

export const BULK_MAX = 50;
const overMax = (n) => `الحد ${BULK_MAX} مشاركًا في المرة الواحدة`;

/** الدفعات التي يُنقل إليها: غير المفتوحة وغير المغلقة. لمن يكتب وحده */
export function useBulkCohorts(canWrite) {
  const [cohorts, setCohorts] = useState([]);
  useEffect(() => { if (canWrite) L('admin.programs', {}).then((x) => setCohorts(x.success ? (x.cohorts || []).filter((c) => !c.is_default && c.status !== 'closed') : [])); }, [canWrite]);
  return cohorts;
}

/** @param {{ ids: string[], onDone: () => void }} p */
export function BulkStatus({ ids, onDone }) {
  const { toast, confirm, prompt } = useUI();
  const [statusTo, setStatusTo] = useState('');
  const run = async () => {
    if (!statusTo) return toast('اختر الحالة');
    if (ids.length > BULK_MAX) return toast(overMax());
    if (!(await confirm(`تغيير حالة ${ids.length} مشارك إلى «${STATUS[statusTo]}»؟`, { danger: statusNeedsReason(statusTo), ok: 'تغيير الحالة' }))) return;
    let reason;
    if (statusNeedsReason(statusTo)) {
      reason = await prompt(`سبب الإيقاف أو الانسحاب (يُحفظ في ملف كل واحد من الـ${ids.length} ويُبلَّغ به بالبريد):`);
      if (reason === null) return;
      if (String(reason).trim().length < STATUS_REASON_MIN) return toast('اكتب السبب بوضوح');
    }
    const r = await L('admin.status', { participant_ids: ids, status: statusTo, ...(reason ? { reason } : {}) });
    if (!r.success) return toast(r.message);
    toast(`غُيّرت حالة ${r.done ?? ids.length}${r.skipped ? `، وتُخطّي ${r.skipped} على الحالة نفسها` : ''}`);
    setStatusTo('');
    onDone();
  };
  return (
    <>
      <select className="filter-select" aria-label="تغيير حالة المحددين" value={statusTo} onChange={(e) => setStatusTo(e.target.value)}>
        <option value="">تغيير الحالة إلى…</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <button className="btn-sm ghost" onClick={run} disabled={!statusTo}>غيّر الحالة</button>
    </>
  );
}

/** @param {{ ids: string[], cohorts: any[], onDone: () => void }} p */
export function BulkEnroll({ ids, cohorts, onDone }) {
  const { toast, confirm } = useUI();
  const [cohortTo, setCohortTo] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  if (!cohorts.length) return null;
  const run = async () => {
    if (enrolling) return;
    const c = cohorts.find((x) => x.id === cohortTo);
    if (!c) return toast('اختر الدفعة');
    if (ids.length > BULK_MAX) return toast(overMax());
    if (!(await confirm(`نقل ${ids.length} مشارك إلى دفعة «${c.name}»؟ لا حاجة لهذا لمن انضم برابط جهة الدفعة: يدخلها تلقائيًا. من كان ملحقًا يدويًا بدفعة أخرى يُسحب منها.`))) return;
    setEnrolling(true);
    const r = await enrollCohort({ cohort_id: c.id, participant_ids: ids }, confirm).finally(() => setEnrolling(false));
    toast(r.success ? `نُقل ${r.enrolled} مشارك إلى دفعة «${c.name}»` : r.message);
    // القائمة تُقرأ من جديد، فيظهر عمود الدفعة والتصدير بالدفعة الجديدة
    if (r.success) { setCohortTo(''); onDone(); }
  };
  return (
    <>
      <select className="filter-select" aria-label="نقل المحددين إلى دفعة أخرى (استثناء)" title="المشارك يدخل دفعة جهته تلقائيًا. هذا للاستثناء: فرد في دفعة جهة، أو نقل بين دفعتين" value={cohortTo} onChange={(e) => setCohortTo(e.target.value)}>
        <option value="">نقل إلى دفعة أخرى (استثناء)…</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <button className="btn-sm ghost" onClick={run} disabled={!cohortTo || enrolling}>{enrolling ? 'يُنقل…' : 'انقلهم'}</button>
    </>
  );
}
