// ════════════════════════════════════════════════════════════════
// تحكم القاعة الحية: المكوّن المشترك بين لوحة الإدارة وبوابة الخبير (المرحلة 9)
// ════════════════════════════════════════════════════════════════
// يقود القاعة مرحلة مرحلة (الدخول، التدريب، التقسيم، الجولة، الكشف) أو يفتحها ذاتية، ويقسّم الفرق
// ويسند القائد والشخصية ويغلقها. التحديث كل ثانيتين بسؤال خفيف عن رقم النسخة.
// لا يعرف من ينادي: call(key, body) تربطه اللوحة بإجراءات admin.hall-* والبوابة بـxp.hall-*، والخادم
// يقيّد الخبير بدفعاته. أصناف CSS تُمرَّر (ui) لأن للتطبيقين نظامي أنماط مختلفين.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import HallView, { TEAM_AR, TEAM_COLOR, Q_AR, OPT_AR, CONF_AR } from './HallView.jsx';
import { HALL_SPLIT_AR, HALL_STAGE_AR } from '../../supabase/functions/leaders-api/hall.js';
import { POLL_FAIL_LIMIT } from '../../leaders-app/src/hallPoll.js';

const STEPS = ['enter', 'train', 'split', 'round', 'reveal'];
export const HALL_UI_ADMIN = { card: 'la-card', row: 'la-row', muted: 'la-muted', chip: 'la-chip', link: 'la-link', btn: 'btn-sm primary', ghost: 'btn-sm ghost', fields: 'la-adj-row', ok: 'ok' };
export const HALL_UI_APP = { card: 'card stack', row: 'row', muted: 'muted small', chip: 'chip', link: 'link small', btn: 'btn sm', ghost: 'btn ghost sm', fields: 'row', ok: 'gold' };

export default function HallControl({ cohortId, call, canWrite = true, toast = () => {}, prompt, ui = HALL_UI_ADMIN }) {
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ mode: 'live', topic_id: '' });
  const ver = useRef(0);
  const fails = useRef(0);
  const u = ui;

  const load = useCallback(async (force) => {
    if (!cohortId) return;
    const r = await call('state', { cohort_id: cohortId, since: force ? 0 : ver.current });
    // إخفاق عابر في السؤال الدوري يصلحه السؤال التالي؛ يُبلَّغ عند أول تحميل، أو حين يتوالى (مرة لا كل ثانيتين)
    if (!r.success) { fails.current += 1; if (force || fails.current === POLL_FAIL_LIMIT) toast(r.message); return; }
    fails.current = 0;
    if (r.unchanged) return;
    ver.current = r.session?.version || 0;
    setV(r);
  }, [cohortId, call, toast]);
  useEffect(() => { ver.current = 0; setV(null); load(true); const t = setInterval(() => { if (!document.hidden) load(); }, 2000); return () => clearInterval(t); }, [load]);

  const act = async (key, body, ok) => {
    setBusy(true);
    const r = await call(key, body);
    setBusy(false);
    if (!r.success) return toast(r.message);
    if (ok) toast(ok);
    ver.current = r.session?.version || 0; setV(r);
  };
  const ask = (q, def) => (prompt ? prompt(q, def) : Promise.resolve(window.prompt(q, def ?? '')));

  if (!cohortId) return null;
  if (!v) return <p className={u.muted}>جارٍ التحميل…</p>;
  const sess = v.session;
  const sid = sess?.id;
  const person = sel && v.people?.find((p) => p.id === sel);
  const persona = async (p) => {
    const t = await ask(`${p.name} يتقمّص أي شخصية؟ (مثال: راعي المشروع، صانع القرار)`, sess.persona_ar || 'راعي المشروع');
    if (t) act('assign', { session_id: sid, participant_id: p.id, persona: true, persona_ar: t }, 'أُسندت الشخصية');
  };

  return (
    <div className="hall-admin">
      {sess && <div className={`${u.row} between`}><span className={`${u.chip} ${u.ok}`}>{sess.mode === 'self' ? 'المسار الذاتي' : 'القاعة الحية'}</span>
        <span className="hall-code">رمز الدخول <b dir="ltr">{sess.code}</b></span></div>}

      {!sess && (
        <section className={u.card}>
          <h3>لا قاعة مفتوحة لهذه الدفعة</h3>
          <div className={u.fields}>
            <label className="field"><span>النمط</span>
              <select className="input" aria-label="نمط القاعة" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="live">القاعة الحية: تقودها مرحلة مرحلة على شاشة العرض</option>
                <option value="self">المسار الذاتي: تبقى الفرق، والجمل مفتوحة للعمل دون اجتماع</option>
              </select></label>
            <label className="field"><span>موضوع «كاتون» للجلسة</span>
              <select className="input" aria-label="موضوع الجلسة" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })}>
                <option value="">بلا موضوع الآن</option>
                {(v.topics || []).map((t) => <option key={t.id} value={t.id}>{t.title_ar}{t.status !== 'published' ? ' (مسودة: يُفتح للقاعة فقط)' : ''}</option>)}
              </select></label>
          </div>
          {canWrite && <button className={u.btn} disabled={busy} onClick={() => act('open', { cohort_id: cohortId, ...form }, 'فُتحت القاعة')}>افتح القاعة</button>}
        </section>
      )}

      {sess && (
        <>
          <div className="hall-stage-bar">
            {sess.mode === 'live' && STEPS.map((k, i) => (
              <button key={k} className={`step${sess.stage === k ? ' on' : ''}`} disabled={!canWrite || busy || (k === 'reveal' && !v.sentence)}
                onClick={() => act('step', { session_id: sid, stage: k })}><b>{'١٢٣٤٥'[i]}</b>{HALL_STAGE_AR[k]}</button>
            ))}
            <span className="grow" />
            {canWrite && <button className={u.link} onClick={() => document.querySelector('.hall-screen')?.requestFullscreen?.().catch(() => {})}>ملء الشاشة</button>}
          </div>

          <div className="hall-screen"><HallView view={v} onPerson={(p) => setSel(p.id)} /></div>

          {canWrite && (
            <div className="hall-controls">
              <section className={u.card}>
                <h4>التقسيم</h4>
                <div className={`${u.row} wrap`}>{Object.entries(HALL_SPLIT_AR).map(([k, l]) => (
                  <button key={k} className={sess.split_method === k ? u.btn : u.ghost} disabled={busy} onClick={() => act('split', { session_id: sid, method: k }, k === 'choose' ? 'يختار المشاركون فرقهم الآن من جوالاتهم' : 'وُزّعت الفرق')}>{l}</button>
                ))}</div>
                <small className={u.muted}>التوزيع الآلي على الحاضرين. القيادة أصغر الفرق، وقائد الجولة يتبدّل مع كل جولة.</small>
              </section>
              <section className={u.card}>
                <h4>الجملة</h4>
                <select className="input" aria-label="الجملة المعروضة" value={v.sentence?.id || ''} onChange={(e) => act('step', { session_id: sid, sentence_id: e.target.value, stage: 'round' })} disabled={busy || !v.sentences?.length}>
                  <option value="">اختر الجملة</option>
                  {(v.sentences || []).map((x) => <option key={x.id} value={x.id}>{x.sort}. {Q_AR[x.question]}</option>)}
                </select>
                <div className={u.row}>
                  <button className={u.btn} disabled={busy || !v.sentence || v.revealed} onClick={() => act('step', { session_id: sid, stage: 'reveal' })}>اكشف المفتاح</button>
                  <button className={u.ghost} disabled={busy || !v.sentence} onClick={() => act('step', { session_id: sid, next: true }, 'جولة جديدة وقائد جديد')}>الجملة التالية ↞</button>
                </div>
                {v.revealed && v.sentence?.explain_ar && <p className={u.muted}>{v.sentence.explain_ar}</p>}
              </section>
              <section className={u.card}>
                <h4>الحضور</h4>
                <div className="hall-teams">{Object.entries(v.teams).map(([t, x]) => (
                  <span key={t}><i style={{ background: TEAM_COLOR[t] }} />{TEAM_AR[t]}: {x.present}/{x.count}</span>
                ))}<span>بلا فريق: {v.people.filter((p) => !p.team).length}</span><span>✋ {v.people.filter((p) => p.hand).length}</span></div>
                <button className={u.link} onClick={async () => { if (await ask('اكتب «إغلاق» لإغلاق القاعة. تبقى الإجابات والفرق محفوظة.', '') === 'إغلاق') act('close', { session_id: sid }, 'أُغلقت القاعة'); }}>إغلاق القاعة</button>
              </section>
            </div>
          )}

          {person && (
            <aside className={`${u.card} hall-person`} aria-live="polite">
              <div className={`${u.row} between`}><h3>{person.name}</h3><button className={u.link} onClick={() => setSel(null)}>إغلاق</button></div>
              <p className={u.muted}>{[person.title, person.org].filter(Boolean).join(' · ')}</p>
              <p>{person.team ? TEAM_AR[person.team] : 'بلا فريق'}{person.leader ? ' · قائد الجولة ♔' : ''}{person.persona ? ` · يتقمّص: ${sess.persona_ar || ''}` : ''}</p>
              {(person.choice || person.stances?.length > 0) && <p>
                {person.choice ? `حكمه: ${person.choice === 'true' ? 'صحيحة' : 'خاطئة'}${person.confidence ? ` (${CONF_AR[person.confidence]})` : ''}` : 'بلا حكم'}
                {person.stances?.length ? ` · موقفه: ${person.stances.map((k) => OPT_AR[k]).join('، ')}` : ''}{person.note ? ` · «${person.note}»` : ''}</p>}
              {canWrite && <div className={`${u.row} wrap`}>
                {Object.keys(TEAM_AR).filter((t) => t !== 'persona').map((t) => (
                  <button key={t} className={person.team === t ? u.btn : u.ghost} onClick={() => act('assign', { session_id: sid, participant_id: person.id, team: t })}>{TEAM_AR[t]}</button>
                ))}
                <button className={u.ghost} onClick={() => act('assign', { session_id: sid, participant_id: person.id, leader: true }, 'صار قائد الجولة')}>اجعله القائد ♔</button>
                {person.persona
                  ? <button className={u.ghost} onClick={() => act('assign', { session_id: sid, participant_id: person.id, persona: false })}>أنهِ الشخصية</button>
                  : <button className={u.ghost} onClick={() => persona(person)}>الشخصية الافتراضية</button>}
              </div>}
            </aside>
          )}
        </>
      )}
    </div>
  );
}
