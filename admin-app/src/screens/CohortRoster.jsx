// ════════════════════════════════════════════════════════════════
// تبويب «المتابعة» في ملف الدفعة (تصور تشغيل الدفعة 2026-11-19، المرحلة 1): صف لكل عضو، للقراءة
// ════════════════════════════════════════════════════════════════
// يجيب «من أين وصل ومن يحتاجني»: المرحلة الحالية كما يراها العضو (مرحلتان معًا تُسميان معًا، والمسار المستمر بجانبها)، ومنذ متى،
// وسبب التوقف وعلى من الدور، والتقدم والحضور والاستشارة وآخر نشاط. الصفوف من admin.cohort-journey نفسها (roster) محسوبة مع
// خريطة الرحلة في حلقة واحدة، فالضغط على مرحلة في الخريطة يفتح هنا عدد صفوفها نفسه. لا حساب هنا (cohort-roster.js يعرّف
// الفلاتر والفرز والتصدير). الحدود حدود الخريطة: تلقائيًا حتى 300 عضو، وبزر للأكبر، والخادم يرفض فوق 1500.
// الخصوصية: للإدارة وحدها. الفلاتر لا تُكتب في عنوان الصفحة (url=false)، ونص بحث يشبه رقمًا لا يُحفظ للزيارة التالية ولا في
// عرض محفوظ (shareable في filters.js). والإجراءات الجماعية هي القائمة نفسها لمن يكتب (تذكير، اعتماد، حالة، دفعة) بحد 50.
import React, { useEffect, useMemo, useState } from 'react';
import { date, L, STATUS } from '../leaders.js';
import { Empty, NoMatch, Spinner } from '../ui.jsx';
import ExportButton from '../ExportButton.jsx';
import FilterBar, { SortTh, useFilters } from '../FilterBar.jsx';
import { applyFilters, presetCounts, sortRows } from '../filters.js';
import { phoneMatches } from '../../../supabase/functions/leaders-api/search-text.js';
import { BULK_MAX, BulkEnroll, BulkStatus, useBulkCohorts } from '../BulkPeople.jsx';
import { NudgeSheet } from './Nudges.jsx';
import BulkApprove from './BulkApprove.jsx';
import { keepTab } from './PersonShell.jsx';
import { queueLabel, saveQueue } from '../review-queue.js';
import { membersAr } from '../cohort-journey.js';
import { JOURNEY_AUTO_MAX } from './CohortJourney.jsx';
import {
  attendanceAr, consultAr, ROSTER_KEYS, ROSTER_PRESETS, ROSTER_SORTS, rosterExportCols, rosterOrder, rosterSorts, rosterSpec, stageAr, STATE_AR, stayAr, TURN_AR,
} from '../cohort-roster.js';
import '../cohort-journey.css';

const COLS = 9;

export default function CohortRoster({ c, canWrite = false, stage = '', onPerson, onJourney }) {
  const auto = !c.is_default && (Number(c.members) || 0) <= JOURNEY_AUTO_MAX;
  const [want, setWant] = useState(auto);
  const [r, setR] = useState(null);
  const [retry, setRetry] = useState(0);
  // url=false: للتبويب عنوانه (?view=follow)، فلا يكتب فوقه شريط الفلترة ولا يصل نص البحث إلى العنوان أبدًا
  const [f, setF, clearF, replaceF] = useFilters(ROSTER_KEYS, stage ? { stage } : {}, { scope: `cohort-roster-${c.id}`, url: false });
  const [picked, setPicked] = useState(() => new Set());
  const [nudging, setNudging] = useState(null);
  const [bulkApprove, setBulkApprove] = useState(null);
  const cohorts = useBulkCohorts(canWrite);

  useEffect(() => { setWant(auto); }, [c.id, auto]);
  useEffect(() => {
    let live = true;
    setR(null);
    // ردّ دفعة سابقة يصل بعد الانتقال إلى غيرها لا يكتب فوقها
    if (want) L('admin.cohort-journey', { cohort_id: c.id }).then((x) => { if (live) setR(x || { success: false }); });
    return () => { live = false; };
  }, [c.id, want, retry]);

  const map = r?.success ? r.journey_map : null;
  const all = useMemo(() => (r?.success ? rosterOrder(r.journey_map, r.roster || []) : []), [r]);
  const spec = useMemo(() => rosterSpec(map, all), [map, all]);
  const sorts = useMemo(() => rosterSorts(map), [map]);
  const shown = useMemo(() => sortRows(applyFilters(all, spec, f), sorts, f.sort), [all, spec, sorts, f]);
  const counts = useMemo(() => presetCounts(all, ROSTER_PRESETS), [all]);
  const exportCols = useMemo(() => rosterExportCols({ date }), []);

  // فتح العضو على رحلته، وترتيب ما يظهر الآن يُحفظ لـ«السابق والتالي» في ملفه (review-queue.js)
  const open = (id) => {
    saveQueue(shown.map((m) => m.id), queueLabel(ROSTER_PRESETS, f.view) || `متابعة ${c.name}`);
    keepTab('journey');
    onPerson?.(id);
  };
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = shown.length > 0 && shown.every((m) => picked.has(m.id));
  const toggleAll = () => setPicked((s) => { const n = new Set(s); shown.forEach((m) => (allOn ? n.delete(m.id) : n.add(m.id))); return n; });
  const pickedIds = all.filter((m) => picked.has(m.id)).map((m) => m.id);
  const pickedPending = all.filter((m) => picked.has(m.id) && m.status === 'pending_approval').map((m) => m.id);
  const done = () => { setPicked(new Set()); setRetry((n) => n + 1); };
  const people = `#/leaders/participants?cohort=${encodeURIComponent(c.id)}`;

  if (!want) {
    return (
      <div className="cr" data-testid="cohort-roster">
        <p className="la-muted">{c.is_default ? 'الدفعة المفتوحة تضم كل من ليس في دفعة، ' : `في الدفعة ${membersAr(Number(c.members) || 0)}، `}
          وتُحسب المتابعة من رحلة كل عضو. <button type="button" className="btn-sm ghost" onClick={() => setWant(true)}>اعرض المتابعة</button>
          {' '}<a className="la-link" href={people}>أو افتح قائمة المشاركين لهذه الدفعة</a></p>
      </div>
    );
  }
  if (!r) return <div className="cr" data-testid="cohort-roster" aria-busy="true"><Spinner /><p className="la-muted cr-wait" role="status">تُحسب مرحلة كل عضو من رحلته…</p></div>;
  if (!r.success) {
    return (
      <div className="cr" data-testid="cohort-roster">
        <p className="la-err" role="alert">{r.message || 'تعذّرت قراءة أعضاء الدفعة'} <button type="button" className="la-link" onClick={() => setRetry((n) => n + 1)}>أعد المحاولة</button>
          {' '}<a className="la-link" href={people}>افتح قائمة المشاركين لهذه الدفعة</a></p>
      </div>
    );
  }
  if (!all.length) {
    return (
      <div className="cr" data-testid="cohort-roster">
        <Empty title="لا أعضاء في هذه الدفعة بعد" hint="يظهر هنا كل من يدخل الدفعة برابط التسجيل أو بالنقل إليها، ومع كل عضو مرحلته وما ينقصه." />
      </div>
    );
  }

  const late = map?.cohort?.starts_on && !map?.cohort?.is_default;
  return (
    <div className="cr" data-testid="cohort-roster">
      <p className="la-muted small cr-note">صف لكل عضو من رحلته كما يراها هو. «متأخر» {late ? 'من تجاوز موعد نهاية مرحلته على جدول الدفعة بعد مهلة ثلاثة أيام' : 'من تجاوز مدة مرحلته بعد مهلة ثلاثة أيام'}،
        وهو تعريف خريطة الرحلة نفسه.{onJourney && <> <button type="button" className="la-link" onClick={onJourney}>افتح خريطة الرحلة</button></>}</p>
      <FilterBar scope={`cohort-roster-${c.id}`} state={f} set={setF} clear={clearF} replace={replaceF} fields={spec.fields} presets={ROSTER_PRESETS} counts={counts}
        shown={shown.length} total={all.length} noun="عضو" placeholder="ابحث بالاسم أو البريد أو الجوال" sorts={ROSTER_SORTS}
        actions={<>
          <ExportButton scope="cohort-roster" meta={{ kind: 'CRS', title: `متابعة ${c.name}`, sheet: 'المتابعة', file: 'CohortFollowUp' }} columns={exportCols}
            all={all} filtered={shown} selected={all.filter((m) => picked.has(m.id))} noun="عضو" />
          <button className="refresh-btn" type="button" onClick={() => setRetry((n) => n + 1)}>تحديث</button>
        </>} />

      {nudging && <NudgeSheet ids={nudging} onClose={(sent) => { setNudging(null); if (sent) setPicked(new Set()); }} />}
      {bulkApprove && <BulkApprove ids={bulkApprove} onPerson={onPerson} onClose={(changed) => { setBulkApprove(null); if (changed) done(); }} />}
      {canWrite && picked.size > 0 && (
        <div className="la-bulk" data-testid="cr-bulk">
          <span><b>{picked.size}</b> محدد</span>
          {pickedPending.length > 0 && <button className="btn-sm primary" onClick={() => setBulkApprove(pickedPending.slice(0, BULK_MAX))} title="يُعتمد المتسق بمستواه المحسوب، ويُستبقى من عليه إشارة">اعتماد جماعي ({pickedPending.length})…</button>}
          <button className="btn-sm ghost" onClick={() => setNudging(pickedIds.slice(0, BULK_MAX))} title={picked.size > BULK_MAX ? `التذكير ${BULK_MAX} في كل مرة: يُذكَّر أول ${BULK_MAX} من المحددين، ثم حدّد الباقين` : 'بريد يسمّي لكل واحد مرحلته وخطوته التالية، بمعاينة قبل الإرسال'}>
            {picked.size > BULK_MAX ? `ذكّر أول ${BULK_MAX} من المحددين` : `ذكّر المحددين (${picked.size})`}</button>
          <BulkStatus ids={pickedIds} onDone={done} />
          <BulkEnroll ids={pickedIds} cohorts={cohorts.filter((x) => x.id !== c.id)} onDone={done} />
          <button className="btn-sm ghost" onClick={() => setPicked(new Set())}>إلغاء التحديد</button>
        </div>
      )}

      <div className="table-wrap"><table className="data-table la-cards cr-table">
        <caption className="sr-only">أعضاء دفعة {c.name}: مرحلة كل عضو وسبب توقفه وعلى من الدور</caption>
        <thead><tr>
          {canWrite && <th><input type="checkbox" aria-label="تحديد الكل" checked={allOn} onChange={toggleAll} /></th>}
          <SortTh k="name" state={f} set={setF}>العضو</SortTh><SortTh k="stage" state={f} set={setF}>المرحلة الحالية</SortTh><SortTh k="days" state={f} set={setF}>منذ</SortTh>
          <th scope="col">سبب التوقف</th><SortTh k="turn" state={f} set={setF}>الدور</SortTh><SortTh k="progress" state={f} set={setF}>التقدم</SortTh>
          <SortTh k="attendance" state={f} set={setF}>الحضور</SortTh><th scope="col">الاستشارة</th><SortTh k="seen" state={f} set={setF}>آخر نشاط</SortTh>
        </tr></thead>
        <tbody>
          {!shown.length ? <tr><td colSpan={COLS + (canWrite ? 1 : 0)}><NoMatch what="أعضاء" /></td></tr> : shown.map((m) => {
            const going = m.state !== 'out' && m.state !== 'finished';
            const seen = m.last_active_at || m.last_login_at;
            return (
              <tr key={m.id} tabIndex={0} className={m.late ? 'cr-late' : ''} style={{ cursor: 'pointer' }} onClick={() => open(m.id)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(m.id); }}>
                {canWrite && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`تحديد ${m.name}`} checked={picked.has(m.id)} onChange={() => toggle(m.id)} /></td>}
                <td data-label="العضو"><span className="cr-cell"><b>{m.name}</b>
                  {[m.job_title, m.organization_name, m.group].some(Boolean) && <small className="la-muted">{[m.job_title, m.organization_name, m.group && `مجموعة ${m.group}`].filter(Boolean).join(' · ')}</small>}
                  {/* وُجد برقمه: الرقم ظاهر تحت الاسم، فيُعرف لماذا ظهر الصف */}
                  {phoneMatches(f.q, m.phone) && <small className="la-muted pt-phone" dir="ltr">{m.phone}</small>}</span></td>
                <td data-label="المرحلة الحالية"><span className="cr-cell"><span className={going ? '' : 'la-muted'}>{stageAr(m) || '·'}</span>
                  {(m.tracks || []).map((t) => <small key={t} className="cr-track">مسار مستمر: {t}</small>)}
                  {m.onboarding && <small className="la-muted">{m.onboarding.label}: {m.onboarding.remaining}</small>}
                  {m.state === 'out' && m.stage == null && STATUS[m.status] && <small className="la-muted">خارج البرنامج</small>}</span></td>
                <td data-label="منذ" className={going ? '' : 'cr-nil'}>{going ? <span className="cr-since"><span>{stayAr(m)}</span>{m.late && <span className="la-chip bad">متأخر</span>}</span> : <span className="la-muted">·</span>}</td>
                <td data-label="سبب التوقف" className={going && (m.stuck || []).some((x) => x.needs) ? '' : 'cr-nil'}><span className="cr-cell">{going && (m.stuck || []).some((x) => x.needs)
                  ? m.stuck.filter((x) => x.needs).map((x) => <span key={x.key} className="cr-need">{m.stuck.length > 1 && <small className="la-muted">{x.title}: </small>}{x.needs}</span>)
                  : <span className="la-muted">·</span>}</span></td>
                <td data-label="الدور" className={going ? '' : 'cr-nil'}><span className="cr-cell">{going ? [...new Map((m.stuck || []).map((x) => [`${x.turn}|${x.why || ''}`, x])).values()].map((x) => (
                  <span key={`${x.turn}|${x.why || ''}`} className="cr-turn-item"><span className={`la-chip cr-turn t-${x.turn}`}>{TURN_AR[x.turn]}</span>{x.why && <small className="la-muted">{x.why}</small>}</span>
                )) : <span className="la-muted">·</span>}</span></td>
                <td data-label="التقدم" className={m.progress == null ? 'cr-nil' : 'cr-short'}>{m.progress == null ? <span className="la-muted">·</span> : <span dir="ltr">{m.progress}%</span>}</td>
                <td data-label="الحضور" className={attendanceAr(m) ? 'cr-short' : 'cr-nil'}>{attendanceAr(m) || <span className="la-muted">·</span>}</td>
                <td data-label="الاستشارة" className={consultAr(m) ? 'cr-short' : 'cr-nil'}>{consultAr(m) || <span className="la-muted">·</span>}</td>
                <td data-label="آخر نشاط" className={seen || m.state !== 'out' ? '' : 'cr-nil'}>{seen ? date(seen) : <span className="la-muted">{m.state === 'out' ? '·' : 'لم يدخل'}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <p className="la-muted small">{STATE_AR.late}: {all.filter((m) => m.late).length} · {STATE_AR.finished}: {all.filter((m) => m.state === 'finished').length} · {STATE_AR.out}: {all.filter((m) => m.state === 'out').length}</p>
    </div>
  );
}
