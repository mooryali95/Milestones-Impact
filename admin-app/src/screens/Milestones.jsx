// ════════════════════════════════════════════════════════════════
// المعالم وجدول الدفعة: يبنيها الأدمن، ويُحسب منها موقع كل مشارك وتأخره
// ════════════════════════════════════════════════════════════════
// • ProgramMilestones: معالم البرنامج تحت محرر الرحلة (مرتبطة بمرحلة أو بتاريخ)
// • خطة الدفعة (مدد مراحلها وتواريخها) في تبويب «الرحلة» بملف الدفعة (CohortJourney.jsx)، كاتبها الوحيد بعد إزالة نافذة «الجدول» (R2a)
// • ParticipantMilestones: موقع مشارك من المعالم، مع اعتماد الإنجاز والتمديد له وحده
import React, { useCallback, useEffect, useState } from 'react';
import { date, dateOnly as day, L } from '../leaders.js';
import Form from '../Form.jsx';
import { Spinner, useUI } from '../ui.jsx';
import { MILESTONE_RUBRIC, milestonesFoldedAr, RUBRIC_LEVEL_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { foldMilestones } from '../methodology.js';
import {
  MILESTONE_ANCHOR_AR, MILESTONE_COMPLETE_AR, MILESTONE_STATUS_AR,
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

// onList: يُبلَّغ محرر الرحلة بالقائمة ليضع شارة المعلم المخالف على بطاقة مرحلته (طي المعالم، المرحلة 21)
export function ProgramMilestones({ pid, stages, canWrite, onList }) {
  const { toast, confirm } = useUI();
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const [all, setAll] = useState(false);
  const load = useCallback(async () => { const r = await L('admin.milestones', { program_id: pid }); setList(r.success ? r.milestones : []); }, [pid]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (list && onList) onList(list); }, [list]);
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
      {(() => {
        // المعالم المطابقة للافتراض تُطوى في سطر واحد ورابط «عرضها»، ولا يظهر صف إلا لمخالف (foldMilestones)
        const { folded, shown } = foldMilestones(list, stages);
        const rows = all ? list : shown;
        return (<>
          {folded.length > 0 && (
            <p className="la-muted j-ms-fold">{milestonesFoldedAr(folded.length)}{' '}
              <button type="button" className="la-link" aria-expanded={all} onClick={() => setAll(!all)}>{all ? 'طيّها' : 'عرضها'}</button></p>
          )}
          {rows.length ? (
        <ul className="la-reqs">{rows.map((m) => (
          <li key={m.id} className={m.active ? '' : 'off'}>
            <span><b>{m.title_ar}</b> <small className="la-muted">{ruleLine(m, stages)}{m.weight != null ? ` · وزن ${m.weight}` : ''}</small>
              {m.description_ar && <><br /><small className="la-muted">{m.description_ar}</small></>}</span>
            {canWrite && <button className="la-link" onClick={() => edit(m)}>تحرير</button>}
          </li>
        ))}</ul>
          ) : !list.length ? <p className="la-muted">لا معالم بعد.</p> : null}
        </>);
      })()}
      {form && <Form {...form} onClose={(saved) => { setForm(null); if (saved) { toast('تم الحفظ'); load(); } }} />}
    </section>
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

// أفعال المعلم لمشارك بعينه، مصدرها واحد: قائمة المعالم هنا، وشريحة المعلم في مرحلته بتبويب «الرحلة» (PersonJourney.jsx).
// نافذة واحدة لاعتماد الإنجاز بالمعيار ولتمديد الموعد؛ ok رسالة نجاحها. form عنصر النافذة يُرسم حيث يُستدعى الخطاف
export function useMilestoneActions(p, onDone) {
  const { toast, prompt, confirm } = useUI();
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
  const undo = (m) => act(m, { done: false }, 'أُلغي');
  // ما يظهر لمعلم بعينه، بالترتيب: الاعتماد أو التقييم، ثم التمديد وإلغاؤه
  const items = (m) => [
    !m.done && { label: 'اعتمد الإنجاز', run: () => rate(m) },
    m.done && { label: Object.keys(m.scores || {}).length ? 'عدّل التقييم' : 'قيّم بالمعيار', run: () => rate(m) },
    m.done && m.done_at && { label: 'إلغاء الاعتماد', run: () => undo(m) },
    !m.done && { label: m.extended ? 'عدّل التمديد' : 'مدّد له', run: () => extend(m) },
    !m.done && m.extended && { label: 'ألغِ التمديد', run: () => unextend(m) },
  ].filter(Boolean);
  const el = form && <Form {...form} onClose={(saved) => { setForm(null); if (saved) { toast(form.ok); onDone(); } }} />;
  return { items, form: el };
}

// «تنتهي 25 نوفمبر · متأخرة يومين»: موعد المعلم وحاله في سطر، لشريحته في مرحلته
export function milestoneDueAr(m) {
  const when = m.due ? day(m.due) : 'بلا موعد';
  if (m.status === 'done') return `${m.title_ar}: أُنجز${m.late_days > 0 ? ` بعد موعده بـ${m.late_days} يومًا` : ''}`;
  const tail = m.status === 'late' ? ` · متأخر ${m.late_days === 1 ? 'يومًا' : m.late_days === 2 ? 'يومين' : `${m.late_days} يومًا`}` : m.status === 'due_soon' ? ' · قريب' : '';
  return `${m.title_ar}: ${m.due ? `ينتهي ${when}` : when}${m.extended ? ' (ممدَّد)' : ''}${tail}`;
}
export const MILESTONE_CHIP = STATUS_CHIP;

export function ParticipantMilestones({ p, list, summary, canWrite, onDone, title = 'المعالم' }) {
  const { items, form } = useMilestoneActions(p, onDone);
  if (!list?.length) return null;
  return (
    <section className="la-card" aria-label={title}>
      <div className="la-row between"><h3>{title}</h3>
        {summary && <span className="la-muted">{summary.done}/{summary.total} منجز{summary.late ? ` · ${summary.late} متأخر (أقصاه ${summary.max_late} يومًا)` : ''}</span>}</div>
      <ul className="la-reqs">{list.map((m) => (
        <li key={m.id}>
          <span><b>{m.title_ar}</b> <span className={`la-chip ${STATUS_CHIP[m.status]}`}>{MILESTONE_STATUS_AR[m.status]}{m.status === 'late' ? ` ${m.late_days} يومًا` : ''}</span>
            <small className="la-muted"> {m.due ? day(m.due) : ''}{m.extended ? ' (ممدَّد)' : ''}</small>
            {Object.keys(m.scores || {}).length > 0 && <small className="la-muted"> · {Object.entries(m.scores).map(([k, v]) => `${MILESTONE_RUBRIC[k]?.title} ${v}/4`).join('، ')}</small>}</span>
          {canWrite && <span className="la-row">{items(m).map((it) => <button key={it.label} className="la-link" onClick={it.run}>{it.label}</button>)}</span>}
        </li>
      ))}</ul>
      {form}
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
