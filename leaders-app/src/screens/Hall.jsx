// ════════════════════════════════════════════════════════════════
// القاعة من جوال المشارك: الدخول، فريقي ومهمتي، والجملة، والخيارات الثمانية، ورفع اليد
// ════════════════════════════════════════════════════════════════
// التحديث بسؤال خفيف بفاصل يتبع حال القاعة (hallPoll.js). اختيارات الزملاء لا تظهر قبل الكشف.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import FirstOpen from '../FirstOpen.jsx';
import { call } from '../api.js';
import { ErrorBox } from '../ui.jsx';
import { pollPeriod } from '../hallPoll.js';
import HallView, { TEAM_AR, TEAM_COLOR, Q_AR } from '../../../shared/hall/HallView.jsx';
import KatonAnswer from '../KatonAnswer.jsx';
import { useHallTimer, timerLabel } from '../../../shared/hall/HallTimer.jsx';
import { HALL_TEAM_TASK_AR, HALL_STAGE_AR } from '../../../supabase/functions/leaders-api/hall.js';
import PeerRequests from './PeerRequests.jsx';

const PENDING_KEY = 'mi_leaders_hall_pending';

// قاعة نموذجية للمعاينة فقط (لا تتصل بالخادم): جولة بفرقها الأربعة وقائدها وشخصيتها الافتراضية
const PREVIEW_NAMES = ['سارة', 'خالد', 'نورة', 'فهد', 'ريم', 'عبدالله', 'هند', 'ماجد', 'لمى', 'سلطان', 'أمل', 'تركي'];
const PREVIEW_TEAMS = ['lead', 'support', 'support', 'support', 'guide', 'guide', 'guide', 'eval', 'eval', 'eval', 'support', 'guide'];
const PREVIEW = {
  session: { stage: 'round', round: 2 }, revealed: false, answered: 7, total: 12, topic: { title_ar: 'الأثر قبل المخرجات' },
  people: PREVIEW_NAMES.map((name, i) => ({ id: `p${i}`, name, team: i === 11 ? null : PREVIEW_TEAMS[i], persona: i === 11, leader: i === 0,
    joined: true, present: true, hand: i === 4, answered: i % 3 !== 0, choice: null, points: null })),
  teams: { support: { count: 4, present: 4 }, lead: { count: 1, present: 1 }, guide: { count: 3, present: 3 }, eval: { count: 3, present: 3 } },
};

export default function Hall({ onBack }) {
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState(null);   // اليد المرفوعة أو ملاحظة الجملة تصير طلب توجيه (المرحلة 8)
  const ver = useRef(0);
  // الإجابة لا تضيع: ما تعذّر إرساله (شبكة أو خادم مشغول) يُحفظ على الجهاز ويُعاد مع كل تحديث حتى يُستلم
  const [receipt, setReceipt] = useState(null);   // { sentence_id, state: 'sent' | 'pending' }
  const pending = useRef(null);
  const send = useCallback(async (payload) => {
    const r = await call('katon.answer', payload);
    if (r.success) { pending.current = null; try { localStorage.removeItem(PENDING_KEY); } catch { /* وضع خاص */ } setReceipt({ sentence_id: payload.sentence_id, state: 'sent' }); return r; }
    if (r.code === 'network' || r.code === 'busy') {
      pending.current = payload; try { localStorage.setItem(PENDING_KEY, JSON.stringify(payload)); } catch { /* وضع خاص */ }
      setReceipt({ sentence_id: payload.sentence_id, state: 'pending' });
    } else { pending.current = null; try { localStorage.removeItem(PENDING_KEY); } catch { /* وضع خاص */ } setReceipt(null); }
    return r;
  }, []);
  useEffect(() => { try { pending.current = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { pending.current = null; } }, []);
  const load = useCallback(async (force) => {
    const r = await call('hall.state', { since: force ? 0 : ver.current });
    if (!r.success) { setErr(r.message); return; }
    if (pending.current) {
      const sent = await send(pending.current);
      if (sent.success) { const again = await call('hall.state', { since: 0 }); if (again.success && !again.unchanged) { ver.current = again.session?.version || 0; setV(again); } return; }
    }
    if (r.unchanged) return;
    ver.current = r.session?.version || 0;
    setV(r);
  }, [send]);
  const period = pollPeriod(v);
  const left = useHallTimer(v);
  useEffect(() => { load(true); }, [load]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) load(); }, period); return () => clearInterval(t); }, [load, period]);

  const act = async (action, body) => {
    setBusy(true); setErr('');
    const r = action === 'katon.answer' ? await send(body) : await call(action, body);
    setBusy(false);
    if (!r.success) { if (!(action === 'katon.answer' && pending.current)) setErr(r.message); return; }
    if (action === 'katon.answer') { load(true); return; }
    ver.current = r.session?.version || 0; setV(r);
  };

  // فشل أول تحميل يُعرض بإعادة محاولة لا دوّارة بلا نهاية
  if (!v) return <div className="page">{err ? <ErrorBox message={err} onRetry={() => { setErr(''); load(true); }} /> : <div className="spinner" aria-label="جارٍ التحميل" />}</div>;
  if (!v.session) {
    return (
      <div className="page stack">
        <h1>القاعة</h1>
        <div className="card"><p className="muted">لا قاعة مفتوحة لدفعتك الآن. حين يفتحها الخبير تجدها هنا.</p></div>
        <section className="card stack hall-preview" data-tour="hall" aria-label="معاينة القاعة">
          <div><p className="eyebrow">معاينة</p><h2 className="as-h3">هكذا تبدو القاعة حين تُفتح</h2>
            <p className="muted small">بعد التدريب يُقسَّم الحضور إلى أربعة فرق: الدعم والقيادة والتوجيه والتقييم، ولكل جولة قائد يتبدّل (التاج)، وشخصية افتراضية كراعي المشروع. ترفع يدك من جوالك، ولا تظهر اختيارات زملائك قبل الكشف.</p></div>
          <HallView view={PREVIEW} compact />
        </section>
        <button className="btn ghost" onClick={onBack}>رحلتي</button>
      </div>
    );
  }
  const me = v.people.find((p) => p.id === v.me);
  const s = v.sentence, st = v.session.stage;
  const live = v.session.mode === 'live';
  const timeUp = live && left === 0;
  const canAnswer = s && !v.revealed && (st === 'round' || !live) && !timeUp;

  return (
    <div className="page wide stack hall-page" data-tour="hall">
      <FirstOpen id="hall" icon="🏛️" title="القاعة حيّة داخل المنصة" lines={[
        'حين يفتح الخبير جلسة تجد فريقك ودورك والجولة الحالية هنا دون أن تحدّث الصفحة.',
        'إجاباتك في الجولات للتعلم، ولا تدخل تقييمك المستمر ولا الختامي.',
        'سؤال لم تجد إجابته؟ اطرحه على أقرانك من «طلبات التوجيه» ويؤكد الخبير الإجابة.',
      ]} />
      <div className="row between">
        <div><p className="eyebrow">{live ? 'القاعة الحية' : 'المسار الذاتي'} · {v.cohort.name}</p><h1>{v.topic?.title_ar || 'القاعة'}</h1></div>
        <span className="chip gold">{HALL_STAGE_AR[st]}{live && (st === 'round' || st === 'reveal') ? ` · الجولة ${v.session.round}` : ''}</span>
      </div>

      {!v.inside ? (
        <section className="card stack hall-door">
          <p>القاعة مفتوحة. ادخل لتظهر لزملائك وللخبير، وتعرف فريقك ومهمتك.</p>
          <button className="btn" disabled={busy} onClick={() => act('hall.join')}>ادخل القاعة</button>
        </section>
      ) : (
        <>
          <section className="card stack hall-me" style={{ borderInlineStartColor: me?.team ? TEAM_COLOR[me.persona ? 'persona' : me.team] : undefined }}>
            <div className="row between">
              <div>
                <b>{me?.persona ? `تتقمّص: ${v.session.persona_ar || 'الشخصية الافتراضية'}` : me?.team ? TEAM_AR[me.team] : st === 'enter' ? 'أنت في القاعة. تبدأ الجلسة حين يفتحها الخبير' : st === 'train' ? 'التدريب أولًا للجميع' : 'بانتظار التقسيم'}</b>
                {me?.leader && <span className="chip gold"> ♔ قائد الجولة</span>}
                {me?.team && <p className="small muted">{(s?.tasks || {})[me.team] || HALL_TEAM_TASK_AR[me.team]}</p>}
                {me?.table && !me.persona && (
                  <p className="hall-table"><b>طاولة {me.table}</b>
                    <span className="small muted"> · معك: {v.people.filter((p) => p.table === me.table && p.id !== me.id && !p.persona).map((p) => p.name).join('، ') || 'لا أحد بعد'}</span></p>
                )}
              </div>
              <span className="row">
                <button className={`btn sm ${me?.hand ? '' : 'ghost'}`} disabled={busy} onClick={() => act('hall.hand', { raised: !me?.hand })} aria-pressed={!!me?.hand}>✋ {me?.hand ? 'أنزل يدك' : 'ارفع يدك'}</button>
                {me?.hand && !ask && <button className="link small" onClick={() => setAsk({ source: 'free', text: '', label: 'ما رفعت يدك لأجله' })}>اكتبه طلب توجيه</button>}
              </span>
            </div>
            {st === 'split' && v.session.split_method === 'choose' && (
              <div className="hall-pick">{Object.keys(HALL_TEAM_TASK_AR).map((t) => (
                <button key={t} className={`btn sm ${me?.team === t ? '' : 'ghost'}`} disabled={busy} onClick={() => act('hall.pick', { team: t })}>{TEAM_AR[t]}</button>
              ))}<p className="small muted">اختر فريقك. يستطيع الخبير نقلك لاحقًا.</p></div>
            )}
          </section>

          {s && (st === 'round' || st === 'reveal' || !live) && (
            <section className="card stack">
              <div className="row between">
                <span className="chip">{Q_AR[s.question]}</span>
                {left != null && !v.revealed && <b className={`hall-clock${left <= 10 ? ' soon' : ''}${left === 0 ? ' over' : ''}`} role="timer" aria-label={left > 0 ? `بقي ${left} ثانية للإجابة` : 'انتهى وقت الإجابة'}>{timerLabel(left)}</b>}
              </div>
              <p className="kt-text">{s.text_ar}</p>
              {/* حكم بثقة مدرَّجة ووسوم موقف (CBM الثلاثي)؛ me.choice هو الحكم وme.confidence درجته */}
              <KatonAnswer compact mine={me?.answered ? { verdict: me.choice, confidence: me.confidence, stances: me.stances || [] } : null} disabled={!canAnswer || busy}
                onAnswer={(a) => act('katon.answer', { sentence_id: s.id, ...a })} onAsk={(text) => setAsk({ source: 'sentence', ref_id: s.id, text, label: `جملة «${Q_AR[s.question]}»` })} />
              {v.revealed && (
                <div className="banner"><span className="ico">{me?.points > 0 ? '✓' : '•'}</span>
                  <div className="grow">المفتاح: <b>{s.key === 'true' ? 'صحيحة' : s.key === 'false' ? 'خاطئة' : 'رأي'}</b>{me?.points != null ? ` · نقاطك ${me.points > 0 ? '+' : ''}${me.points}` : ''}{s.explain_ar ? `. ${s.explain_ar}` : ''}</div></div>
              )}
              <p className="hall-receipt" role="status" aria-live="polite">
                {!v.revealed && receipt?.sentence_id === s.id && receipt.state === 'pending' ? <span className="warn">لم تصل إجابتك بعد. محفوظة على جهازك ونعيد إرسالها تلقائيًا.</span>
                  : !v.revealed && me?.answered ? <span className="ok">✓ استُلمت إجابتك. تستطيع تعديلها حتى ينتهي الوقت.</span>
                    : timeUp && !v.revealed ? <span className="muted">انتهى وقت الإجابة. بانتظار كشف المفتاح.</span> : null}
              </p>
              {!v.revealed && <p className="small muted">أجاب {v.answered} من {v.total}. اختيارات زملائك تظهر بعد الكشف.</p>}
            </section>
          )}
        </>
      )}
      {err && <ErrorBox message={err} />}
      {/* سجل النشاط: طلبات التوجيه في الدفعة؛ في المسار الذاتي دائمًا، وفي الحية حين يُرفع طلب */}
      {v.inside && (ask || !live) && <PeerRequests preset={ask} onDone={() => setAsk(null)} />}
      <details className="hall-mini" open={!v.inside}>
        <summary>منظور القاعة</summary>
        <HallView view={v} me={v.me} compact timer={timerLabel(left)} />
      </details>
    </div>
  );
}
