// ════════════════════════════════════════════════════════════════
// إجابة «كاتون» على جملة: حكم (صحيحة/خاطئة) بدرجة ثقة من ثلاث، ووسوم موقف بلا نقاط
// ════════════════════════════════════════════════════════════════
// مشترك بين شاشة «كاتون» والقاعة. يرسل الإجابة حين يكتمل الحكم بثقته أو يتبدل وسم، ويحفظ الملاحظة عند مغادرتها.
import React, { useEffect, useState } from 'react';
import { KATON_CONFIDENCE, KATON_DEFAULT_POINTS, KATON_STANCES, KATON_VERDICT_AR } from '../../supabase/functions/leaders-api/katon.js';

const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

export default function KatonAnswer({ mine, points = KATON_DEFAULT_POINTS, disabled = false, onAnswer, compact = false }) {
  const [verdict, setVerdict] = useState(mine?.verdict || null);
  const [confidence, setConfidence] = useState(mine?.confidence || null);
  const [stances, setStances] = useState(mine?.stances || []);
  const [note, setNote] = useState(mine?.note || '');
  const stanceKey = (mine?.stances || []).join(',');
  useEffect(() => { setVerdict(mine?.verdict || null); setConfidence(mine?.confidence || null); setStances(stanceKey ? stanceKey.split(',') : []); setNote(mine?.note || ''); }, [mine?.verdict, mine?.confidence, mine?.note, stanceKey]);

  const send = (v, c, st, n) => {
    if (!v && !st.length) return;
    if (v && !c) return;
    onAnswer({ verdict: v, confidence: v ? c : null, stances: st, note: n || null });
  };
  const judge = (v) => { const nv = verdict === v ? null : v; setVerdict(nv); if (nv) send(nv, confidence, stances, note); else if (stances.length) send(null, null, stances, note); };
  const sure = (c) => { setConfidence(c); send(verdict, c, stances, note); };
  const toggle = (k) => { const st = stances.includes(k) ? stances.filter((x) => x !== k) : [...stances, k]; setStances(st); send(verdict, confidence, st, note); };
  const needNote = stances.some((k) => KATON_STANCES.find((s) => s.key === k)?.note);

  return (
    <div className={`kt-answer${compact ? ' compact' : ''}`}>
      <div className="kt-row">
        <span className="small muted kt-lbl">حكمك</span>
        <div className="kt-opts two" role="radiogroup" aria-label="حكمك على الجملة">
          {Object.entries(KATON_VERDICT_AR).map(([k, ar]) => (
            <button key={k} type="button" role="radio" aria-checked={verdict === k} disabled={disabled} className={`kt-opt${verdict === k ? ' on' : ''}`} onClick={() => judge(k)}>
              <i aria-hidden="true">{k === 'true' ? '✓' : '✕'}</i><span>{ar}</span>
            </button>
          ))}
        </div>
      </div>
      {verdict && (
        <div className="kt-row">
          <span className="small muted kt-lbl">ثقتك</span>
          <div className="kt-opts three" role="radiogroup" aria-label="درجة ثقتك">
            {[1, 2, 3].map((c) => (
              <button key={c} type="button" role="radio" aria-checked={confidence === c} disabled={disabled} className={`kt-opt${confidence === c ? ' on' : ''}`} onClick={() => sure(c)}
                title={`${KATON_CONFIDENCE[c].band}: إن أصبت ${sign(points.right[c])}، وإن أخطأت ${sign(points.wrong[c])}`}>
                <span>{KATON_CONFIDENCE[c].ar}</span><small className="muted">{sign(points.right[c])} / {sign(points.wrong[c])}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="kt-row">
        <span className="small muted kt-lbl">موقفك <small>(بلا نقاط)</small></span>
        <div className="kt-stances" role="group" aria-label="موقفك من الجملة">
          {KATON_STANCES.map((s) => (
            <button key={s.key} type="button" aria-pressed={stances.includes(s.key)} disabled={disabled} className={`chip kt-stance${stances.includes(s.key) ? ' on' : ''}`} onClick={() => toggle(s.key)}>
              <i aria-hidden="true">{s.glyph}</i> {s.ar}
            </button>
          ))}
        </div>
      </div>
      {needNote && !disabled && (
        <label className="field kt-note"><span>اكتب سؤالك أو فكرتك ليراها خبيرك وفريقك</span>
          <textarea className="input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (mine?.note || '') && send(verdict, confidence, stances, note)} /></label>
      )}
    </div>
  );
}
