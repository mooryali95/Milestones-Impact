// ════════════════════════════════════════════════════════════════
// المعالم وجدول الدفعة: يبنيها الأدمن، ويُحسب منها موقع كل مشارك وتأخره
// ════════════════════════════════════════════════════════════════
// • ProgramMilestones: معالم البرنامج تحت محرر الرحلة (مرتبطة بمرحلة أو بتاريخ)
// • CohortSchedule: تواريخ كل مرحلة في دفعة، يدويًا أو بتوزيع آلي على مدتها
// • ParticipantMilestones: موقع مشارك من المعالم، مع اعتماد الإنجاز والتمديد له وحده
import React, { useCallback, useEffect, useState } from 'react';
import { date, dateOnly as day, L } from '../leaders.js';
import Form from '../Form.jsx';
import { Spinner, useEscape, useUI } from '../ui.jsx';
import { MILESTONE_RUBRIC, RUBRIC_LEVEL_AR } from '../../../supabase/functions/leaders-api/labels.js';
import {
  MILESTONE_ANCHOR_AR, MILESTONE_COMPLETE_AR, MILESTONE_STATUS_AR, milestoneDue,
} from '../../../supabase/functions/leaders-api/logic.js';

const STATUS_CHIP = { done: 'ok', late: 'bad', due_soon: 'warn', on_time: '', unscheduled: '' };

const fields = (stages) => [
  { name: 'title_ar', label: 'اسم المعلم (مثل: نهاية التدريب، تسليم هيكل المشروع)' },
  { name: 'anchor', label: 'موعده مرتبط بـ', type: 'select', options: MILESTONE_ANCHOR_AR },
  { name: 'stage_key', label: 'المرحلة', type: 'select', empty: 'بلا مرحلة', options: Object.fromEntries(stages.map((s) => [s.key, s.title_ar])),
    show: (v) => v.anchor === 'stage_end' || v.anchor === 'stage_start' || v.complete === 'stage' },
  { name: 'offset_days', label: 'إزاحة بالأيام (موجبة بعد، سالبة قبل)', type: 'number', show: (v) => v.anchor !== 'date' },
  { name: 'fixed_date', label: 'التاريخ', type: 'date', show: (v) => v.anchor === 'date' },
  { name: 'complete', label: 'يكتمل', type: 'select', options: MILESTONE_COMPLETE_AR, help: 'الآلي يحتاج مرحلة؛ والمعلم بلا مرحلة يعتمده الأدمن أو الخبير.' },
  { name: 'description_ar', label: 'ما المطلوب من المشارك', type: 'textarea', rows: 3 },
  { name: 'weight', label: 'وزنه في التقييم الختامي (اختياري، 0 إلى 100)', type: 'number' },
  { name: 'active', label: 'فعّال', type: 'check' },
];

const ruleLine = (m, stages) => {
  const st = stages.find((s) => s.key === m.stage_key)?.title_ar;
  const off = m.offset_days ? ` ${m.offset_days > 0 ? '+' : '−'}${Math.abs(m.offset_days)} يوم` : '';
  const when = m.anchor === 'date' ? day(m.fixed_date)
    : m.anchor === 'cohort_start' ? `بداية الدفعة${off}` : m.anchor === 'cohort_end' ? `نهاية الدفعة${off}`
      : `${m.anchor === 'stage_start' ? 'بداية' : 'نهاية'} «${st || m.stage_key}»${off}`;
  return `${when} · يكتمل ${MILESTONE_COMPLETE_AR[m.complete]}`;
};

export function ProgramMilestones({ pid, stages, canWrite }) {
  const { toast, confirm } = useUI();
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const load = useCallback(async () => { const r = await L('admin.milestones', { program_id: pid }); setList(r.success ? r.milestones : []); }, [pid]);
  useEffect(() => { load(); }, [load]);
  if (!list) return <Spinner />;
  const live = stages.filter((s) => s.active !== false);
  const edit = (m = { anchor: 'stage_end', complete: 'stage', offset_days: 0, active: true }) => setForm({
    title: m.id ? `معلم: ${m.title_ar}` : 'معلم جديد', fields: fields(live), values: m,
    onSave: (v) => L('admin.milestone-save', { program_id: pid, row: { ...v, id: m.id } }),
    onDelete: m.id ? () => L('admin.milestone-delete', { id: m.id }) : undefined,
  });
  // معلم عند نهاية كل مرحلة ليس لها معلم بعد: بداية سريعة يعدّلها الأدمن
  const seed = async () => {
    const missing = live.filter((s) => !list.some((m) => m.stage_key === s.key && m.anchor === 'stage_end'));
    if (!missing.length) return toast('لكل مرحلة معلم عند نهايتها');
    if (!(await confirm(`إضافة معلم عند نهاية ${missing.length} مرحلة؟ يكتمل آليًا باكتمالها، وتعدّل أي معلم بعدها.`))) return;
    for (const s of missing) await L('admin.milestone-save', { program_id: pid, row: { title_ar: `نهاية ${s.title_ar}`, stage_key: s.key, anchor: 'stage_end', complete: 'stage', offset_days: 0 } });
    toast('أُضيفت المعالم'); load();
  };
  return (
    <section className="la-card" aria-label="معالم البرنامج">
      <div className="la-row between">
        <h3>المعالم <small className="la-muted">· {list.filter((m) => m.active).length}</small></h3>
        {canWrite && <div className="la-row"><button className="la-link" onClick={seed}>معلم لنهاية كل مرحلة</button><button className="btn-sm ghost" onClick={() => edit()}>+ معلم</button></div>}
      </div>
      <p className="la-muted">المعلم نقطة يُقاس عندها موقع المشارك وتأخره. موعده يُحسب من جدول دفعته، فالبرنامج نفسه يصلح لشهر أو لسنة.</p>
      {list.length ? (
        <ul className="la-reqs">{list.map((m) => (
          <li key={m.id} className={m.active ? '' : 'off'}>
            <span><b>{m.title_ar}</b> <small className="la-muted">{ruleLine(m, stages)}{m.weight != null ? ` · وزن ${m.weight}` : ''}</small>
              {m.description_ar && <><br /><small className="la-muted">{m.description_ar}</small></>}</span>
            {canWrite && <button className="la-link" onClick={() => edit(m)}>تحرير</button>}
          </li>
        ))}</ul>
      ) : <p className="la-muted">لا معالم بعد.</p>}
      {form && <Form {...form} onClose={(saved) => { setForm(null); if (saved) { toast('تم الحفظ'); load(); } }} />}
    </section>
  );
}

// جدول الدفعة: تاريخان لكل مرحلة، مع معاينة استحقاق المعالم عليها
export function CohortSchedule({ cohort, onClose }) {
  const { toast } = useUI();
  const [d, setD] = useState(null);
  const [sch, setSch] = useState(cohort.schedule || {});
  const [busy, setBusy] = useState(false);
  useEscape(() => onClose());   // كبقية النوافذ: Esc يغلقها
  useEffect(() => {
    Promise.all([L('admin.program', { id: cohort.program_id }), L('admin.milestones', { program_id: cohort.program_id })])
      .then(([p, m]) => setD({ stages: (p.stages || []).filter((s) => s.active !== false).sort((a, b) => a.sort - b.sort), ms: (m.milestones || []).filter((x) => x.active) }));
  }, [cohort.program_id]);
  const put = (k, f, v) => setSch({ ...sch, [k]: { ...(sch[k] || {}), [f]: v || undefined } });
  const save = async (extra) => {
    setBusy(true);
    const r = await L('admin.cohort-save', { id: cohort.id, ...extra });
    setBusy(false);
    if (!r.success) return toast(r.message);
    setSch(r.cohort.schedule || {});
    toast(extra.distribute ? 'وُزِّعت المراحل على مدة الدفعة؛ عدّل ما تشاء ثم احفظ' : 'حُفظ الجدول');
    if (!extra.distribute) onClose(true);
  };
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="la-form mi-form wide" role="dialog" aria-modal="true" aria-label="جدول الدفعة">
        <h3>جدول «{cohort.name}»</h3>
        <p className="la-muted">{cohort.starts_on && cohort.ends_on ? `من ${day(cohort.starts_on)} إلى ${day(cohort.ends_on)}. ` : 'حدد بداية الدفعة ونهايتها من «تحرير» لتوزيع آلي. '}ضع تاريخي كل مرحلة، أو وزّعها آليًا على المدة ثم عدّل.</p>
        {!d ? <Spinner /> : (
          <>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>المرحلة</th><th>تبدأ</th><th>تنتهي</th><th>المعالم</th></tr></thead>
              <tbody>{d.stages.map((s) => (
                <tr key={s.key}>
                  <td><b>{s.title_ar}</b></td>
                  <td><input type="date" aria-label={`بداية ${s.title_ar}`} value={sch[s.key]?.start || ''} onChange={(e) => put(s.key, 'start', e.target.value)} /></td>
                  <td><input type="date" aria-label={`نهاية ${s.title_ar}`} value={sch[s.key]?.end || ''} onChange={(e) => put(s.key, 'end', e.target.value)} /></td>
                  <td><small className="la-muted">{d.ms.filter((m) => m.stage_key === s.key).map((m) => `${m.title_ar}: ${day(milestoneDue(m, { startsOn: cohort.starts_on, endsOn: cohort.ends_on, schedule: sch })) || 'بلا موعد'}`).join(' · ')}</small></td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="la-row">
              <button className="btn-sm primary" disabled={busy} onClick={() => save({ schedule: sch })}>حفظ الجدول</button>
              <button className="btn-sm ghost" disabled={busy || !cohort.starts_on || !cohort.ends_on} onClick={() => save({ distribute: true })}>وزّع على مدة الدفعة</button>
              <button className="btn-sm ghost" onClick={() => onClose()}>إغلاق</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// موقع المشارك من المعالم في ملفه
// المعيار الوصفي عند اعتماد المعلم: لكل معيار وصف كل مستوى، والتقييم اختياري
const rubricFields = [
  ...Object.entries(MILESTONE_RUBRIC).map(([k, r]) => ({
    name: `r_${k}`, label: r.title, type: 'select', empty: 'بلا تقييم',
    options: Object.fromEntries(r.levels.map((t, i) => [String(i + 1), `${i + 1}. ${RUBRIC_LEVEL_AR[i + 1]}: ${t}`])),
  })),
  { name: 'note', label: 'ملاحظة للسجل', type: 'textarea', rows: 2 },
];

export function ParticipantMilestones({ p, list, summary, canWrite, onDone }) {
  const { toast, prompt, confirm } = useUI();
  // نافذة واحدة لاعتماد الإنجاز بالمعيار ولتمديد الموعد؛ ok رسالة نجاحها
  const [form, setForm] = useState(null);
  const rate = (m) => setForm({
    ok: 'تم',
    title: `${m.done ? 'تقييم' : 'اعتماد إنجاز'}: ${m.title_ar}`, fields: rubricFields,
    values: Object.fromEntries(Object.entries(m.scores || {}).map(([k, v]) => [`r_${k}`, String(v)])),
    onSave: (v) => L('admin.participant-milestone', {
      participant_id: p.id, milestone_id: m.id, note: v.note, ...(m.done ? {} : { done: true }),
      scores: Object.fromEntries(Object.keys(MILESTONE_RUBRIC).map((k) => [k, v[`r_${k}`]]).filter(([, x]) => x)),
    }),
  });
  if (!list?.length) return null;
  const act = async (m, body, ok) => {
    const note = await prompt('السبب (يُحفظ في السجل):', '');
    if (note === null) return;
    const r = await L('admin.participant-milestone', { participant_id: p.id, milestone_id: m.id, note, ...body });
    toast(r.success ? ok : r.message);
    if (r.success) onDone();
  };
  // التمديد بحقل تاريخ (قيمته 2026-12-01 أيًا كانت لوحة المفاتيح)، وإلغاؤه زر صريح؛ كان نصًا حرًا يُلغي
  // التمديد بصمت حين يُكتب التاريخ بأرقام عربية ويقول «تم» (التدقيق 2026-11-11، admin-program-6)
  const extend = (m) => setForm({
    title: `تمديد «${m.title_ar}» لهذا المشارك وحده`, ok: 'مُدّد الموعد لهذا المشارك',
    fields: [{ name: 'due_override', label: 'الموعد الجديد', type: 'date' }],
    values: { due_override: m.due || '' },
    onSave: (v) => (v.due_override
      ? L('admin.participant-milestone', { participant_id: p.id, milestone_id: m.id, due_override: v.due_override })
      : Promise.resolve({ success: false, message: 'اختر الموعد الجديد' })),
  });
  const unextend = async (m) => {
    if (!(await confirm(`إلغاء تمديد «${m.title_ar}» لهذا المشارك؟ يعود موعده إلى موعد دفعته.`))) return;
    const r = await L('admin.participant-milestone', { participant_id: p.id, milestone_id: m.id, due_override: null });
    toast(r.success ? 'أُلغي التمديد' : r.message);
    if (r.success) onDone();
  };
  return (
    <section className="la-card" aria-label="المعالم">
      <div className="la-row between"><h3>المعالم</h3>
        <span className="la-muted">{summary.done}/{summary.total} منجز{summary.late ? ` · ${summary.late} متأخر (أقصاه ${summary.max_late} يومًا)` : ''}</span></div>
      <ul className="la-reqs">{list.map((m) => (
        <li key={m.id}>
          <span><b>{m.title_ar}</b> <span className={`la-chip ${STATUS_CHIP[m.status]}`}>{MILESTONE_STATUS_AR[m.status]}{m.status === 'late' ? ` ${m.late_days} يومًا` : ''}</span>
            <small className="la-muted"> {m.due ? day(m.due) : ''}{m.extended ? ' (ممدَّد)' : ''}</small>
            {Object.keys(m.scores || {}).length > 0 && <small className="la-muted"> · {Object.entries(m.scores).map(([k, v]) => `${MILESTONE_RUBRIC[k]?.title} ${v}/4`).join('، ')}</small>}</span>
          {canWrite && <span className="la-row">
            {!m.done && <button className="la-link" onClick={() => rate(m)}>اعتمد الإنجاز</button>}
            {m.done && <button className="la-link" onClick={() => rate(m)}>{Object.keys(m.scores || {}).length ? 'عدّل التقييم' : 'قيّم بالمعيار'}</button>}
            {m.done && m.done_at && <button className="la-link" onClick={() => act(m, { done: false }, 'أُلغي')}>إلغاء الاعتماد</button>}
            {!m.done && <button className="la-link" onClick={() => extend(m)}>{m.extended ? 'عدّل التمديد' : 'مدّد له'}</button>}
            {!m.done && m.extended && <button className="la-link" onClick={() => unextend(m)}>ألغِ التمديد</button>}
          </span>}
        </li>
      ))}</ul>
      {form && <Form {...form} onClose={(saved) => { setForm(null); if (saved) { toast(form.ok); onDone(); } }} />}
    </section>
  );
}

// التقييم المستمر في ملف المشارك: المؤشر، ومكوّناته بأسبابها، والاتجاه، وما يحتاج انتباهًا
const TREND = { up: '↑ يتحسن', down: '↓ يتراجع', flat: '→ مستقر' };
export function ContinuousCard({ c }) {
  if (!c) return null;
  return (
    <section className="la-card" aria-label="التقييم المستمر">
      <div className="la-row between">
        <h3>التقييم المستمر <small className="la-muted">· تكويني، لا يحكم وحده</small></h3>
        <span className="la-row">{c.trend && <span className={`la-chip ${c.trend.dir === 'down' ? 'bad' : c.trend.dir === 'up' ? 'ok' : ''}`}>{TREND[c.trend.dir]} ({c.trend.delta > 0 ? '+' : ''}{c.trend.delta})</span>}
          <b className="la-big">{c.index != null ? `${c.index}٪` : '—'}</b></span>
      </div>
      {c.flags.length > 0 && <ul className="la-flags">{c.flags.map((f) => <li key={f}>{f}</li>)}</ul>}
      <div className="table-wrap"><table className="la-table">
        <thead><tr><th>المصدر</th><th>النسبة</th><th>الأحداث</th><th>لماذا</th></tr></thead>
        <tbody>{c.components.map((x) => (
          <tr key={x.key} className={x.value != null && x.in_index === false ? 'la-dim' : ''}>
            <td>{x.label}{x.value != null && x.in_index === false && <><br /><span className="la-chip">خارج المؤشر</span></>}</td>
            <td>{x.value != null ? `${x.value}٪` : '—'}{x.se != null && <small className="la-muted"> ±{x.se}</small>}</td>
            <td>{x.n ?? '—'}{x.items != null ? <small className="la-muted"> ({x.items} سؤالًا)</small> : ''}</td>
            <td><small className="la-muted">{x.reason}</small></td>
          </tr>
        ))}
        {c.engagement && (
          <tr className="la-dim"><td>{c.engagement.label}<br /><span className="la-chip">لا يدخل المؤشر</span></td><td>{c.engagement.value != null ? `${c.engagement.value}٪` : '—'}</td><td>{c.engagement.n}</td><td><small className="la-muted">{c.engagement.reason}</small></td></tr>
        )}</tbody>
      </table></div>
      {c.events.length > 0 && (
        <details><summary>آخر التقييمات ({c.count})</summary>
          <ul className="la-reqs">{c.events.map((e, i) => (
            <li key={i}><span>{e.label} <small className="la-muted">{date(e.at)}</small>{e.comment && <><br /><small className="la-muted">«{e.comment}»</small></>}</span><b>{e.pct}٪</b></li>
          ))}</ul></details>
      )}
    </section>
  );
}
