// ════════════════════════════════════════════════════════════════
// القاعة من جوال المشارك: الدخول، فريقي ومهمتي، والجملة، والخيارات الثمانية، ورفع اليد
// ════════════════════════════════════════════════════════════════
// التحديث كل ثلاث ثوانٍ بسؤال خفيف. اختيارات الزملاء لا تظهر قبل الكشف.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '../api.js';
import HallView, { TEAM_AR, TEAM_COLOR, OPT_AR, GLYPH, Q_AR } from '../../../shared/hall/HallView.jsx';
import { HALL_TEAM_TASK_AR, HALL_STAGE_AR } from '../../../supabase/functions/leaders-api/hall.js';

const OPTS = ['question', 'research', 'true', 'false', 'idea', 'can', 'believe', 'assume'];

export default function Hall({ onBack }) {
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ver = useRef(0);
  const load = useCallback(async (force) => {
    const r = await call('hall.state', { since: force ? 0 : ver.current });
    if (!r.success) { setErr(r.message); return; }
    if (r.unchanged) return;
    ver.current = r.session?.version || 0;
    setV(r);
  }, []);
  useEffect(() => { load(true); const t = setInterval(() => { if (!document.hidden) load(); }, 3000); return () => clearInterval(t); }, [load]);

  const act = async (action, body) => {
    setBusy(true); setErr('');
    const r = await call(action, body);
    setBusy(false);
    if (!r.success) { setErr(r.message); return; }
    if (action === 'katon.answer') { load(true); return; }
    ver.current = r.session?.version || 0; setV(r);
  };

  if (!v) return <div className="page"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
  if (!v.session) {
    return (
      <div className="page stack">
        <h1>القاعة</h1>
        <div className="card"><p className="muted">لا قاعة مفتوحة لدفعتك الآن. حين يفتحها الخبير تجدها هنا، وتصلك دعوة منه.</p></div>
        <button className="btn ghost" onClick={onBack}>رحلتي</button>
      </div>
    );
  }
  const me = v.people.find((p) => p.id === v.me);
  const s = v.sentence, st = v.session.stage;
  const live = v.session.mode === 'live';
  const canAnswer = s && !v.revealed && (st === 'round' || !live);

  return (
    <div className="page wide stack hall-page">
      <div className="row between">
        <div><p className="eyebrow">{live ? 'القاعة الحية' : 'المسار الذاتي'} · {v.cohort.name}</p><h1>{v.topic?.title_ar || 'القاعة'}</h1></div>
        <span className="chip gold">{HALL_STAGE_AR[st]}{live && st !== 'enter' ? ` · الجولة ${v.session.round}` : ''}</span>
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
                <b>{me?.persona ? `تتقمّص: ${v.session.persona_ar || 'الشخصية الافتراضية'}` : me?.team ? TEAM_AR[me.team] : st === 'enter' || st === 'train' ? 'التدريب أولًا للجميع' : 'بانتظار التقسيم'}</b>
                {me?.leader && <span className="chip gold"> ♔ قائد الجولة</span>}
                {me?.team && <p className="small muted">{(s?.tasks || {})[me.team] || HALL_TEAM_TASK_AR[me.team]}</p>}
              </div>
              <button className={`btn sm ${me?.hand ? '' : 'ghost'}`} disabled={busy} onClick={() => act('hall.hand', { raised: !me?.hand })} aria-pressed={!!me?.hand}>✋ {me?.hand ? 'أنزل يدك' : 'ارفع يدك'}</button>
            </div>
            {st === 'split' && v.session.split_method === 'choose' && (
              <div className="hall-pick">{Object.keys(HALL_TEAM_TASK_AR).map((t) => (
                <button key={t} className={`btn sm ${me?.team === t ? '' : 'ghost'}`} disabled={busy} onClick={() => act('hall.pick', { team: t })}>{TEAM_AR[t]}</button>
              ))}<p className="small muted">اختر فريقك. يستطيع الخبير نقلك لاحقًا.</p></div>
            )}
          </section>

          {s && (st === 'round' || st === 'reveal' || !live) && (
            <section className="card stack">
              <span className="chip">{Q_AR[s.question]}</span>
              <p className="kt-text">{s.text_ar}</p>
              <div className="kt-opts" role="radiogroup" aria-label="خيارك في هذه الجملة">
                {OPTS.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={me?.choice === k} disabled={!canAnswer || busy}
                    className={`kt-opt${me?.choice === k ? ' on' : ''}`} onClick={() => act('katon.answer', { sentence_id: s.id, choice: k })}>
                    <i aria-hidden="true">{GLYPH[k]}</i><span>{OPT_AR[k]}</span>
                  </button>
                ))}
              </div>
              {v.revealed && (
                <div className="banner"><span className="ico">{me?.points > 0 ? '✓' : '•'}</span>
                  <div className="grow">المفتاح: <b>{s.key === 'true' ? 'صحيحة' : s.key === 'false' ? 'خاطئة' : 'رأي'}</b>{me?.points != null ? ` · نقاطك ${me.points > 0 ? '+' : ''}${me.points}` : ''}{s.explain_ar ? `. ${s.explain_ar}` : ''}</div></div>
              )}
              {!v.revealed && <p className="small muted">أجاب {v.answered} من {v.total}. اختيارات زملائك تظهر بعد الكشف.</p>}
            </section>
          )}
        </>
      )}
      {err && <div className="alert err">{err}</div>}
      <details className="hall-mini" open={!v.inside}>
        <summary>منظور القاعة</summary>
        <HallView view={v} me={v.me} compact />
      </details>
    </div>
  );
}
