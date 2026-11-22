// ════════════════════════════════════════════════════════════════
// الإسناد: ترشيح الخبير الأنسب لمشارك، وقائمة طلبات الإسناد
// ════════════════════════════════════════════════════════════════
// الترتيب يُحسب في الخادم بأوزان MATCH_WEIGHTS (logic.js) وتُعرض هنا كما هي،
// والحالة من expert_requests وحدها. لا منطق ترشيح في الواجهة.
import React, { useCallback, useEffect, useState } from 'react';
import { date, L } from '../leaders.js';
import { Empty, NoMatch, Spinner, useUI } from '../ui.jsx';
import ExportButton from '../ExportButton.jsx';
import FilterBar, { SortTh, useFilters } from '../FilterBar.jsx';
import { applyFilters, decodeState, isFiltered, presetCounts, sortRows } from '../filters.js';
import { countAr, DIM_AR, EXPERT_REQUEST_STATUS, EXPERT_ROLE_AR, LEVEL_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { MATCH_WEIGHTS, OFFER_HOURS } from '../../../supabase/functions/leaders-api/logic.js';

const PART_AR = { fit: 'التخصص والمستوى', capacity: 'السعة المتاحة', quality: 'التقييم', context: 'القطاع', continuity: 'خدمه من قبل' };
const REQ_TONE = { open: 'warn', offered: 'warn', accepted: 'ok', unmatched: 'bad', cancelled: '', completed: 'ok' };
const LIVE = ['open', 'offered', 'accepted'];
const roleAr = (r) => EXPERT_ROLE_AR[r]?.[0] || r;

function Breakdown({ parts }) {
  return (
    <span className="xm-bars" aria-label="تفصيل النقاط">{Object.entries(MATCH_WEIGHTS).map(([k, max]) => (
      <span key={k} title={`${PART_AR[k]}: ${parts[k]} من ${max}`}><i style={{ width: `${(parts[k] / max) * 100}%` }} /><small>{PART_AR[k]}</small></span>
    ))}</span>
  );
}

// في ملف المشارك: طلبات الإسناد القائمة، ومعاينة الترشيح، والإسناد
export function ExpertAssign({ participantId, canWrite }) {
  const { toast, confirm, prompt } = useUI();
  const [reqs, setReqs] = useState(null);
  const [role, setRole] = useState('coach');
  const [dim, setDim] = useState('');
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);
  const loadReqs = useCallback(async () => {
    const r = await L('admin.expert-requests', { participant_id: participantId });
    // التصفية هنا تبقى حارسًا إن رد خادم أقدم بطلبات الجميع
    setReqs((r.requests || []).filter((x) => x.participant_id === participantId));
  }, [participantId]);
  useEffect(() => { loadReqs(); }, [loadReqs]);
  useEffect(() => { setM(null); }, [role, dim]);

  const preview = async () => { setM('loading'); setM(await L('admin.expert-match', { participant_id: participantId, role, dimension: dim || null })); };
  const assign = async (e, first) => {
    let reason = null;
    if (e && !first) {
      reason = await prompt(`لماذا ${e.full_name} وليس الأول في الترشيح؟ يُسجّل السبب.`, '', { ok: 'إسناد' });
      if (!reason?.trim()) return;
    } else if (!(await confirm(e ? `عرض الطلب على ${e.full_name}؟ لديه ${OFFER_HOURS} ساعة ليقبل، (أو ما ضُبط في الإعدادات)، ثم ينتقل للتالي.` : `إسناد ${roleAr(role)} للأنسب تلقائيًا؟`))) return;
    setBusy(true);
    const r = await L('admin.expert-assign', { participant_id: participantId, role, dimension: dim || null, ...(e ? { expert_id: e.id, reason } : {}) });
    setBusy(false);
    toast(r.success ? (r.status === 'offered' ? 'عُرض الطلب على الخبير، وتصله رسالة' : 'لا خبير متاح الآن، وأُبلغت الإدارة') : r.message);
    if (r.success) { setM(null); loadReqs(); }
  };
  const live = (reqs || []).filter((x) => LIVE.includes(x.status));
  const taken = new Set(live.map((x) => x.role));

  return (
    <section className="la-card xm">
      <div className="la-row between"><h3>الخبراء المسندون</h3>{reqs && <small className="la-muted">{live.length} قائم · {reqs.length} إجمالًا</small>}</div>
      {!reqs ? <Spinner /> : reqs.length ? (
        <ul className="la-reqs">{reqs.map((x) => (
          <li key={x.id}><span><b>{roleAr(x.role)}</b>{x.dimension ? ` · ${DIM_AR[x.dimension]}` : ''} {x.experts?.full_name && <>· {x.experts.full_name}</>} <span className={`la-chip ${REQ_TONE[x.status]}`}>{EXPERT_REQUEST_STATUS[x.status]}</span></span>
            <small className="la-muted">{x.status === 'offered' && x.expires_at ? `حتى ${date(x.expires_at)} · ` : ''}{(x.tried || []).length ? `اعتذر أو فات ${x.tried.length} · ` : ''}{date(x.created_at)}</small></li>
        ))}</ul>
      ) : <p className="la-muted">لم يُسند إليه خبير بعد.</p>}

      {canWrite && (
        <div className="xm-new">
          <div className="la-row">
            <select className="filter-select" aria-label="الدور المطلوب" value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(EXPERT_ROLE_AR).map(([k, [l]]) => <option key={k} value={k} disabled={taken.has(k)}>{l}{taken.has(k) ? ' (قائم)' : ''}</option>)}
            </select>
            <select className="filter-select" aria-label="البُعد" value={dim} onChange={(e) => setDim(e.target.value)}>
              <option value="">أي بُعد</option>{Object.entries(DIM_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button className="btn-sm ghost" onClick={preview} disabled={taken.has(role)}>اعرض الترشيح</button>
            <button className="btn-sm primary" onClick={() => assign(null, true)} disabled={busy || taken.has(role)}>أسند للأنسب</button>
          </div>
          {m === 'loading' ? <Spinner /> : m && !m.success ? <div className="la-err">{m.message}</div> : m && (
            <div className="xm-list">
              <p className="la-muted">المطلوب: {roleAr(m.need.role)}{m.need.dimension ? ` · ${DIM_AR[m.need.dimension]}` : ''}{m.need.level ? ` · مستوى ${LEVEL_AR[m.need.level]}` : ''}{m.need.sector ? ` · قطاع ${m.need.sector}` : ''}</p>
              {!m.candidates.length ? <p className="la-err">لا خبير نشط بهذا الدور وبطاقة متاحة. أضف خبيرًا أو فعّل أحدهم.</p> : (
                <ol>{m.candidates.map((e, i) => (
                  <li key={e.id} className={i === 0 ? 'top' : ''}>
                    <span className="xm-score"><b>{e.match.total}</b><small>من 100</small></span>
                    <span className="xm-who"><b>{e.full_name}</b><small>{e.title || ''}{e.served ? ' · خدمه من قبل' : ''} · حِمله {e.load.requests + e.load.upcoming} من {e.weekly_hours ?? 0} س</small><Breakdown parts={e.match.parts} /></span>
                    <button className={`btn-sm ${i === 0 ? 'primary' : 'ghost'}`} disabled={busy} onClick={() => assign(e, i === 0)}>أسند</button>
                  </li>
                ))}</ol>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// «يحتاج تدخلًا»: ما لا يتحرك وحده. الطلب بلا خبير دائمًا، والمعروض الذي تقترب مهلته أو فاتت قبل أن يمر عليه
// الخادم، والمقبول الذي طال بلا إغلاق، والمفتوح الذي لم يُعرض على أحد بعد يوم. الترتيب بالأولوية نفسها (تحليل لوحة الإدارة 2026-11-15)
const HOUR = 36e5;
export const ATTENTION = { offerHours: 6, openHours: 24, acceptedDays: 30 };
const ageH = (iso, now) => (iso ? (now - Date.parse(iso)) / HOUR : 0);
export function attentionRank(x, now = Date.now()) {
  if (x.status === 'unmatched') return 0;
  if (x.status === 'offered' && x.expires_at && Date.parse(x.expires_at) - now <= ATTENTION.offerHours * HOUR) return 1;
  if (x.status === 'open' && ageH(x.created_at, now) >= ATTENTION.openHours) return 2;
  if (x.status === 'accepted' && ageH(x.accepted_at || x.created_at, now) >= ATTENTION.acceptedDays * 24) return 3;
  return null;
}
export const needsAttention = (x, now = Date.now()) => attentionRank(x, now) != null;
// سبب ظهور الطلب في «يحتاج تدخلًا» بكلام المالك، فلا يبدو كصف سليم. الرتبة من attentionRank نفسها
const hoursAr = (n) => countAr(n, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
const daysAr = (n) => countAr(n, 'يوم', 'يومين', 'أيام', 'يومًا');
export function attentionReason(x, now = Date.now()) {
  const r = attentionRank(x, now);
  if (r === 0) return 'لم يُطابق خبير بعد';
  if (r === 1) {
    const left = (Date.parse(x.expires_at) - now) / HOUR;
    return left <= 0 ? 'فاتت مهلة العرض' : left < 1 ? 'تنتهي مهلة العرض خلال أقل من ساعة' : `تنتهي مهلة العرض خلال ${hoursAr(Math.floor(left))}`;
  }
  if (r === 2) {
    const h = ageH(x.created_at, now);
    return `مفتوح منذ ${h < 48 ? hoursAr(Math.floor(h)) : daysAr(Math.floor(h / 24))} بلا عرض`;
  }
  if (r === 3) return `مقبول منذ ${daysAr(Math.floor(ageH(x.accepted_at || x.created_at, now) / 24))} بلا إغلاق`;
  return '';
}
// الأولى بالتدخل أولًا، وفي الرتبة الواحدة الأقدم أولًا (والمعروض: الأقرب انتهاءً)
export function byAttention(list, now = Date.now()) {
  const key = (x) => (x.status === 'offered' ? x.expires_at : x.status === 'accepted' ? (x.accepted_at || x.created_at) : x.created_at) || '';
  return [...list].sort((a, b) => (attentionRank(a, now) ?? 9) - (attentionRank(b, now) ?? 9) || String(key(a)).localeCompare(String(key(b))));
}

// في تبويب الخبراء: كل طلبات الإسناد بحالاتها، والإلغاء وإعادة المحاولة
export const REQ_PRESETS = [
  { key: 'attention', label: 'يحتاج تدخلًا', test: needsAttention },
  { key: 'live', label: 'قائمة', test: (x) => LIVE.includes(x.status) },
  { key: 'offered', label: 'بانتظار رد الخبير', test: (x) => x.status === 'offered' },
  { key: 'unmatched', label: 'بلا خبير', test: (x) => x.status === 'unmatched' },
];
const REQ_FIELDS = [{ key: 'role', label: 'الخدمات', get: (x) => x.role, options: Object.entries(EXPERT_ROLE_AR).map(([k, [l]]) => [k, l]) }];
const REQ_COLS = [
  { key: 'who', label: 'المشارك', width: 26, get: (x) => x.participants?.full_name }, { key: 'email', label: 'البريد', width: 30, get: (x) => x.participants?.email },
  { key: 'role', label: 'الخدمة', width: 18, get: (x) => roleAr(x.role) }, { key: 'dim', label: 'البُعد', width: 14, get: (x) => DIM_AR[x.dimension] },
  { key: 'expert', label: 'الخبير', width: 26, get: (x) => x.experts?.full_name }, { key: 'score', label: 'درجة المطابقة', width: 12, get: (x) => x.score },
  { key: 'status', label: 'الحالة', width: 18, get: (x) => EXPERT_REQUEST_STATUS[x.status] }, { key: 'manual', label: 'سبب الإسناد اليدوي', width: 30, get: (x) => x.manual_reason },
  { key: 'at', label: 'التاريخ', width: 16, get: (x) => date(x.created_at) },
];
const REQ_SORTS = { who: (x) => x.participants?.full_name, role: (x) => roleAr(x.role), expert: (x) => x.experts?.full_name, status: (x) => EXPERT_REQUEST_STATUS[x.status] };
// عرض اللوحة الذي جاء به الرابط (?view=attention من «ينتظرني»)، وإلا لا شيء. عرض شبكة الخبراء لا يُؤخذ هنا
export const requestView = (qs) => {
  const v = decodeState(qs, ['view']).view;
  return REQ_PRESETS.some((p) => p.key === v) ? v : '';
};
export function RequestsBoard({ canWrite, onPerson, view = '' }) {
  const { toast, prompt } = useUI();
  const [d, setD] = useState(null);
  // داخل شاشة الخبراء ولها شريطها وعنوانها، فحالة هذا الشريط لا تُكتب في العنوان (url: false).
  // الافتراضي «يحتاج تدخلًا»، والعرض الوارد من رابط يغلب ما تُرك آخر مرة
  const [f, setF, clearF, replaceF] = useFilters(['q', 'view', 'role', 'sort'], view ? { view } : {}, { scope: 'expert-requests', defaults: { view: 'attention' }, url: false });
  const load = useCallback(async () => setD(await L('admin.expert-requests')), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <section className="la-card"><h3>طلبات الإسناد</h3><Spinner /></section>;
  if (!d.success) return <section className="la-card"><h3>طلبات الإسناد</h3><div className="la-err">{d.message}</div></section>;
  const all = d.requests;
  const now = Date.now();
  const hit = applyFilters(all, { fields: REQ_FIELDS, presets: REQ_PRESETS, text: (x) => [x.participants?.full_name, x.participants?.email, x.experts?.full_name].join(' ') }, f, now);
  const rows = f.sort ? sortRows(hit, REQ_SORTS, f.sort) : f.view === 'attention' ? byAttention(hit, now) : hit;
  // لا شيء يحتاج تدخلًا وليس غير العرض مفعّلًا: خبر طيب لا «لا نتائج»
  const calm = f.view === 'attention' && !isFiltered({ ...f, view: '', sort: '' });
  const act = async (action, x, ok) => {
    const reason = action.endsWith('cancel') ? await prompt('سبب الإلغاء؟', '', { danger: true, ok: 'إلغاء الطلب' }) : '';
    if (action.endsWith('cancel') && !reason?.trim()) return;
    const r = await L(action, { id: x.id, reason });
    // النتيجة الحقيقية لا «أُعيدت» في كل حال: قد تنتهي المحاولة فورًا بلا خبير متاح
    toast(!r.success ? r.message : r.status === 'offered' ? `عُرض على ${r.expert_name || 'خبير'} حتى ${date(r.expires_at)}` : r.status === 'unmatched' ? 'لا خبير متاح: كل من يطابق اعتذر. استعمل «غيّر الخبير»' : ok);
    if (r.success) load();
  };
  return (
    <section className="la-card xm-board">
      <h3>طلبات الإسناد</h3>
      <FilterBar scope="expert-requests" state={f} set={setF} clear={clearF} replace={replaceF} fields={REQ_FIELDS} presets={REQ_PRESETS} counts={presetCounts(all, REQ_PRESETS, now)}
        shown={rows.length} total={all.length} noun="طلب" placeholder="ابحث بالمشارك أو الخبير" capped={d.capped ? { limit: d.limit } : null}
        actions={<ExportButton scope="expert-requests" meta={{ kind: 'REQ', title: 'طلبات إسناد الخبراء', sheet: 'الطلبات', file: 'Expert-Requests' }} columns={REQ_COLS} all={all} filtered={rows} noun="طلب" />} />
      {!rows.length ? (all.length ? (calm ? <Empty compact title="لا طلب يحتاج تدخلًا الآن" hint="كل طلب قائم معروض على خبير بمهلة ممتدة أو جارٍ في وقته. اختر «قائمة» لترى الطلبات الجارية." /> : <NoMatch what="طلبات" />) : <Empty compact title="لا طلبات إسناد بعد" hint="أسند خبيرًا من ملف أي مشارك، ويظهر طلبه هنا بحالته." />) : (
        <div className="table-wrap"><table className="data-table la-cards">
          <thead><tr><SortTh k="who" state={f} set={setF}>المشارك</SortTh><SortTh k="role" state={f} set={setF}>الخدمة</SortTh><SortTh k="expert" state={f} set={setF}>الخبير</SortTh><SortTh k="status" state={f} set={setF}>الحالة</SortTh><th /></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.id}>
              <td data-label="المشارك"><button className="link" onClick={() => onPerson(x.participant_id)}>{x.participants?.full_name}</button></td>
              <td data-label="الخدمة">{roleAr(x.role)}{x.dimension ? <small className="la-muted"> · {DIM_AR[x.dimension]}</small> : null}</td>
              <td data-label="الخبير">{x.experts?.full_name || <span className="la-muted">·</span>}{x.score != null && <small className="la-muted"> · {x.score}</small>}{x.manual_reason && <small className="la-muted" title={x.manual_reason}> · يدوي</small>}</td>
              <td data-label="الحالة"><span className={`la-chip ${REQ_TONE[x.status]}`}>{EXPERT_REQUEST_STATUS[x.status]}</span>{x.status === 'offered' && <small className="la-muted"> حتى {date(x.expires_at)}</small>}{f.view === 'attention' && attentionReason(x, now) && <small className="xm-why">{attentionReason(x, now)}</small>}</td>
              <td className="ce-act">{canWrite && <>
                {x.status === 'accepted' && <button className="btn-sm ghost" onClick={() => act('admin.expert-request-complete', x, 'أُغلق الطلب')}>اكتملت الخدمة</button>}
                {x.status === 'unmatched' && <button className="btn-sm primary" onClick={() => act('admin.expert-request-retry', x, 'أُعيدت المحاولة')}>أعد المحاولة</button>}
                {['open', 'offered', 'unmatched'].includes(x.status) && <Reassign x={x} onDone={load} />}
                {LIVE.includes(x.status) && <button className="btn-sm ghost" onClick={() => act('admin.expert-request-cancel', x, 'أُلغي الطلب')}>إلغاء</button>}
              </>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

// «غيّر الخبير» (قرار المالك 2026-11-22): كل الخبراء المعتمدين، المطابقون بنسبتهم ثم من خارج الترشيح بسببه،
// وسبب مكتوب. يُلغى العرض الحالي ويُعرض على المختار فورًا بمهلته، والتغيير مسجّل في السجل
function Reassign({ x, onDone }) {
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState(null);
  const [pick, setPick] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const show = async () => {
    setOpen(true);
    if (!opts) { const r = await L('admin.expert-reassign-options', { id: x.id }); setOpts(r.success ? r.options : []); if (!r.success) toast(r.message); }
  };
  if (!open) return <button className="btn-sm ghost" onClick={show}>غيّر الخبير</button>;
  const save = async () => {
    setBusy(true);
    const r = await L('admin.expert-reassign', { id: x.id, expert_id: pick, reason });
    setBusy(false);
    if (!r.success) { toast(r.message); return; }
    toast(r.status === 'offered' ? `عُرض على ${r.expert_name || 'الخبير'} حتى ${date(r.expires_at)}` : 'تعذّر العرض على الخبير المختار');
    setOpen(false); onDone();
  };
  const inside = (opts || []).filter((o) => !o.outside), outside = (opts || []).filter((o) => o.outside);
  const label = (o) => `${o.full_name}${o.match != null ? ` · ${o.match}` : ''}${o.why ? ` · ${o.why}` : ''}${o.declined ? ' · اعتذر سابقًا' : ''}${o.current ? ' · الحالي' : ''}`;
  return (
    <div className="xm-reassign" role="group" aria-label="تغيير الخبير">
      {!opts ? <Spinner /> : (
        <select className="filter-select" aria-label="الخبير" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">اختر خبيرًا</option>
          {inside.length > 0 && <optgroup label="المطابقون">{inside.map((o) => <option key={o.id} value={o.id} disabled={o.current && x.status === 'offered'}>{label(o)}</option>)}</optgroup>}
          {outside.length > 0 && <optgroup label="خارج الترشيح">{outside.map((o) => <option key={o.id} value={o.id}>{label(o)}</option>)}</optgroup>}
        </select>
      )}
      <input className="filter-select" aria-label="سبب التغيير" placeholder="سبب التغيير" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-sm primary" disabled={busy || !pick || reason.trim().length < 3} onClick={save}>اعرض عليه</button>
      <button className="btn-sm ghost" onClick={() => setOpen(false)}>إلغاء</button>
    </div>
  );
}
