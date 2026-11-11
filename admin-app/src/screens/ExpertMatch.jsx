// ════════════════════════════════════════════════════════════════
// الإسناد: ترشيح الخبير الأنسب لمشارك، وقائمة طلبات الإسناد
// ════════════════════════════════════════════════════════════════
// الترتيب يُحسب في الخادم بأوزان MATCH_WEIGHTS (logic.js) وتُعرض هنا كما هي،
// والحالة من expert_requests وحدها. لا منطق ترشيح في الواجهة.
import React, { useCallback, useEffect, useState } from 'react';
import { date, L } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import { DIM_AR, EXPERT_REQUEST_STATUS, EXPERT_ROLE_AR, LEVEL_AR } from '../../../supabase/functions/leaders-api/labels.js';
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
    } else if (!(await confirm(e ? `عرض الطلب على ${e.full_name}؟ لديه ${OFFER_HOURS} ساعة ليقبل، ثم ينتقل للتالي.` : `إسناد ${roleAr(role)} للأنسب تلقائيًا؟`))) return;
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

// في تبويب الخبراء: كل طلبات الإسناد بحالاتها، والإلغاء وإعادة المحاولة
export function RequestsBoard({ canWrite, onPerson }) {
  const { toast, prompt } = useUI();
  const [d, setD] = useState(null);
  const [st, setSt] = useState('live');
  const load = useCallback(async () => setD(await L('admin.expert-requests')), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <section className="la-card"><h3>طلبات الإسناد</h3><Spinner /></section>;
  if (!d.success) return <section className="la-card"><h3>طلبات الإسناد</h3><div className="la-err">{d.message}</div></section>;
  const all = d.requests;
  const rows = all.filter((x) => (st === 'live' ? LIVE.includes(x.status) : st === 'all' ? true : x.status === st));
  const act = async (action, x, ok) => {
    const reason = action.endsWith('cancel') ? await prompt('سبب الإلغاء؟', '', { danger: true, ok: 'إلغاء الطلب' }) : '';
    if (action.endsWith('cancel') && !reason?.trim()) return;
    const r = await L(action, { id: x.id, reason });
    toast(r.success ? ok : r.message);
    if (r.success) load();
  };
  const n = (s) => all.filter((x) => x.status === s).length;
  return (
    <section className="la-card xm-board">
      <div className="la-row between"><h3>طلبات الإسناد</h3>
        <div className="flt-presets la-row">{[['live', `قائمة (${all.filter((x) => LIVE.includes(x.status)).length})`], ['offered', `بانتظار رد الخبير (${n('offered')})`], ['unmatched', `بلا خبير (${n('unmatched')})`], ['all', 'الكل']].map(([k, l]) => (
          <button key={k} className={`flt-preset${st === k ? ' on' : ''}`} onClick={() => setSt(k)}>{l}</button>
        ))}</div></div>
      {!rows.length ? <p className="la-muted">لا طلبات هنا. أسند خبيرًا من ملف أي مشارك.</p> : (
        <div className="table-wrap"><table className="data-table la-cards">
          <thead><tr><th>المشارك</th><th>الخدمة</th><th>الخبير</th><th>الحالة</th><th /></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.id}>
              <td data-label="المشارك"><button className="link" onClick={() => onPerson(x.participant_id)}>{x.participants?.full_name}</button></td>
              <td data-label="الخدمة">{roleAr(x.role)}{x.dimension ? <small className="la-muted"> · {DIM_AR[x.dimension]}</small> : null}</td>
              <td data-label="الخبير">{x.experts?.full_name || <span className="la-muted">·</span>}{x.score != null && <small className="la-muted"> · {x.score}</small>}{x.manual_reason && <small className="la-muted" title={x.manual_reason}> · يدوي</small>}</td>
              <td data-label="الحالة"><span className={`la-chip ${REQ_TONE[x.status]}`}>{EXPERT_REQUEST_STATUS[x.status]}</span>{x.status === 'offered' && <small className="la-muted"> حتى {date(x.expires_at)}</small>}</td>
              <td className="ce-act">{canWrite && <>
                {x.status === 'accepted' && <button className="btn-sm ghost" onClick={() => act('admin.expert-request-complete', x, 'أُغلق الطلب')}>اكتملت الخدمة</button>}
                {x.status === 'unmatched' && <button className="btn-sm primary" onClick={() => act('admin.expert-request-retry', x, 'أُعيدت المحاولة')}>أعد المحاولة</button>}
                {LIVE.includes(x.status) && <button className="btn-sm ghost" onClick={() => act('admin.expert-request-cancel', x, 'أُلغي الطلب')}>إلغاء</button>}
              </>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}
