// ════════════════════════════════════════════════════════════════
// القاعة الحية: شاشة العرض وتحكم الخبير
// ════════════════════════════════════════════════════════════════
// تُعرض على البروجكتر أو بمشاركة الشاشة في Meet. يفتح الخبير قاعة لدفعة، ويقودها
// مرحلة مرحلة: الدخول، التدريب، التقسيم، الجولة، الكشف. أو يفتحها ذاتية بلا اجتماع.
// التحديث كل ثانيتين بسؤال خفيف عن رقم النسخة.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import HallView, { TEAM_AR, TEAM_COLOR, Q_AR } from '../../../shared/hall/HallView.jsx';
import { HALL_SPLIT_AR, HALL_STAGE_AR } from '../../../supabase/functions/leaders-api/logic.js';

const STEPS = ['enter', 'train', 'split', 'round', 'reveal'];

export default function Hall({ canWrite }) {
  const { toast, prompt } = useUI();
  const [cohorts, setCohorts] = useState(null);
  const [cid, setCid] = useState(() => { try { return localStorage.getItem('hall.cohort') || ''; } catch { return ''; } });
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ mode: 'live', topic_id: '' });
  const ver = useRef(0);

  useEffect(() => { L('admin.programs').then((r) => setCohorts(r.success ? r.cohorts.filter((c) => c.status !== 'closed') : [])); }, []);
  const load = useCallback(async (force) => {
    if (!cid) return;
    const r = await L('admin.hall', { cohort_id: cid, since: force ? 0 : ver.current });
    if (!r.success) return toast(r.message);
    if (r.unchanged) return;
    ver.current = r.session?.version || 0;
    setV(r);
  }, [cid, toast]);
  useEffect(() => { ver.current = 0; setV(null); load(true); const t = setInterval(() => { if (!document.hidden) load(); }, 2000); return () => clearInterval(t); }, [load]);

  const act = async (action, body, ok) => {
    setBusy(true);
    const r = await L(action, body);
    setBusy(false);
    if (!r.success) return toast(r.message);
    if (ok) toast(ok);
    ver.current = r.session?.version || 0; setV(r);
  };
  const pickCohort = (id) => { setCid(id); try { localStorage.setItem('hall.cohort', id); } catch { /* اختياري */ } };

  if (!cohorts) return <Spinner />;
  const sess = v?.session;
  const sid = sess?.id;
  const person = sel && v?.people?.find((p) => p.id === sel);
  const persona = async (p) => {
    const t = await prompt(`${p.name} يتقمّص أي شخصية؟ (مثال: راعي المشروع، صانع القرار)`, sess.persona_ar || 'راعي المشروع');
    if (t) act('admin.hall-assign', { session_id: sid, participant_id: p.id, persona: true, persona_ar: t }, 'أُسندت الشخصية');
  };

  return (
    <div className="hall-admin">
      <div className="la-row between">
        <label className="la-row"><span>الدفعة</span>
          <select value={cid} onChange={(e) => pickCohort(e.target.value)}>
            <option value="">اختر الدفعة</option>
            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        {sess && <span className="la-row"><span className="la-chip ok">{sess.mode === 'self' ? 'المسار الذاتي' : 'القاعة الحية'}</span>
          <span className="hall-code">رمز الدخول <b dir="ltr">{sess.code}</b></span></span>}
      </div>

      {cid && v && !sess && (
        <section className="la-card">
          <h3>لا قاعة مفتوحة لهذه الدفعة</h3>
          <div className="la-adj-row">
            <label className="field"><span>النمط</span>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="live">القاعة الحية: تقودها مرحلة مرحلة على شاشة العرض</option>
                <option value="self">المسار الذاتي: تبقى الفرق، والجمل مفتوحة للعمل دون اجتماع</option>
              </select></label>
            <label className="field"><span>موضوع «كاتون» للجلسة</span>
              <select value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })}>
                <option value="">بلا موضوع الآن</option>
                {(v.topics || []).map((t) => <option key={t.id} value={t.id}>{t.title_ar}{t.status !== 'published' ? ' (مسودة: يُفتح للقاعة فقط)' : ''}</option>)}
              </select></label>
          </div>
          {canWrite && <button className="btn-sm primary" disabled={busy} onClick={() => act('admin.hall-open', { cohort_id: cid, ...form }, 'فُتحت القاعة')}>افتح القاعة</button>}
        </section>
      )}

      {sess && (
        <>
          <div className="hall-stage-bar">
            {sess.mode === 'live' && STEPS.map((k, i) => (
              <button key={k} className={`step${sess.stage === k ? ' on' : ''}`} disabled={!canWrite || busy || (k === 'reveal' && !v.sentence)}
                onClick={() => act('admin.hall-step', { session_id: sid, stage: k })}><b>{'١٢٣٤٥'[i]}</b>{HALL_STAGE_AR[k]}</button>
            ))}
            <span className="grow" />
            {canWrite && <button className="la-link" onClick={() => document.querySelector('.hall-screen')?.requestFullscreen?.().catch(() => {})}>ملء الشاشة</button>}
          </div>

          <div className="hall-screen"><HallView view={v} onPerson={(p) => setSel(p.id)} /></div>

          {canWrite && (
            <div className="hall-controls">
              <section className="la-card">
                <h4>التقسيم</h4>
                <div className="la-row wrap">{Object.entries(HALL_SPLIT_AR).map(([k, l]) => (
                  <button key={k} className={`btn-sm ${sess.split_method === k ? 'primary' : 'ghost'}`} disabled={busy} onClick={() => act('admin.hall-split', { session_id: sid, method: k }, k === 'choose' ? 'يختار المشاركون فرقهم الآن من جوالاتهم' : 'وُزّعت الفرق')}>{l}</button>
                ))}</div>
                <small className="la-muted">التوزيع الآلي على الحاضرين. القيادة أصغر الفرق، وقائد الجولة يتبدّل مع كل جولة.</small>
              </section>
              <section className="la-card">
                <h4>الجملة</h4>
                <select value={v.sentence?.id || ''} onChange={(e) => act('admin.hall-step', { session_id: sid, sentence_id: e.target.value, stage: 'round' })} disabled={busy || !v.sentences?.length}>
                  <option value="">اختر الجملة</option>
                  {(v.sentences || []).map((x) => <option key={x.id} value={x.id}>{x.sort}. {Q_AR[x.question]}</option>)}
                </select>
                <div className="la-row">
                  <button className="btn-sm primary" disabled={busy || !v.sentence || v.revealed} onClick={() => act('admin.hall-step', { session_id: sid, stage: 'reveal' })}>اكشف المفتاح</button>
                  <button className="btn-sm ghost" disabled={busy || !v.sentence} onClick={() => act('admin.hall-step', { session_id: sid, next: true }, 'جولة جديدة وقائد جديد')}>الجملة التالية ↞</button>
                </div>
                {v.revealed && v.sentence?.explain_ar && <p className="la-muted">{v.sentence.explain_ar}</p>}
              </section>
              <section className="la-card">
                <h4>الحضور</h4>
                <div className="hall-teams">{Object.entries(v.teams).map(([t, x]) => (
                  <span key={t}><i style={{ background: TEAM_COLOR[t] }} />{TEAM_AR[t]}: {x.present}/{x.count}</span>
                ))}<span>بلا فريق: {v.people.filter((p) => !p.team).length}</span><span>✋ {v.people.filter((p) => p.hand).length}</span></div>
                <button className="la-link" onClick={async () => { if (await prompt('اكتب «إغلاق» لإغلاق القاعة. تبقى الإجابات والفرق محفوظة.', '') === 'إغلاق') act('admin.hall-close', { session_id: sid }, 'أُغلقت القاعة'); }}>إغلاق القاعة</button>
              </section>
            </div>
          )}

          {person && (
            <aside className="la-card hall-person" aria-live="polite">
              <div className="la-row between"><h3>{person.name}</h3><button className="la-link" onClick={() => setSel(null)}>إغلاق</button></div>
              <p className="la-muted">{[person.title, person.org].filter(Boolean).join(' · ')}</p>
              <p>{person.team ? TEAM_AR[person.team] : 'بلا فريق'}{person.leader ? ' · قائد الجولة ♔' : ''}{person.persona ? ` · يتقمّص: ${sess.persona_ar || ''}` : ''}</p>
              {person.choice && <p>اختياره: {person.choice}{person.note ? ` · «${person.note}»` : ''}</p>}
              {canWrite && <div className="la-row wrap">
                {Object.keys(TEAM_AR).filter((t) => t !== 'persona').map((t) => (
                  <button key={t} className={`btn-sm ${person.team === t ? 'primary' : 'ghost'}`} onClick={() => act('admin.hall-assign', { session_id: sid, participant_id: person.id, team: t })}>{TEAM_AR[t]}</button>
                ))}
                <button className="btn-sm ghost" onClick={() => act('admin.hall-assign', { session_id: sid, participant_id: person.id, leader: true }, 'صار قائد الجولة')}>اجعله القائد ♔</button>
                {person.persona
                  ? <button className="btn-sm ghost" onClick={() => act('admin.hall-assign', { session_id: sid, participant_id: person.id, persona: false })}>أنهِ الشخصية</button>
                  : <button className="btn-sm ghost" onClick={() => persona(person)}>الشخصية الافتراضية</button>}
              </div>}
            </aside>
          )}
        </>
      )}
    </div>
  );
}
