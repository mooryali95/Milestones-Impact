// ════════════════════════════════════════════════════════════════
// تقدير المقيّم الخارجي: leaders.sunkvalue.com/rate?t=<الرمز>
// ════════════════════════════════════════════════════════════════
// صفحة مفتوحة بلا حساب، يصلها المدير أو الزميل من بريد الدعوة. لكل عبارة
// تقديران: الآن وقبل البرنامج، و"لا أستطيع الحكم" إن لم يرَ الموقف.
// دعوة ما قبل البرنامج (phase pre) تقدير واحد: الأشهر الثلاثة الأخيرة.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { dimOf } from '../labels.js';
import { LEGAL_PATH, POLICY_VERSION } from '../../../supabase/functions/leaders-api/labels.js';

export default function Rater() {
  const [t] = useState(() => new URLSearchParams(location.search).get('t') || '');
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => { call('rater.get', { t }).then(setData); }, [t]);

  if (!data) return <div className="center-load"><div className="spinner" /></div>;
  if (!data.success) return <div className="page narrow"><div className="alert err">{data.message}</div></div>;
  if (done || data.done) {
    return (
      <div className="page narrow">
        <div className="card milestone-card stack">
          <div className="badge"><span>✓</span></div>
          <h2>شكرًا لك</h2>
          <p className="muted">وصل تقديرك، ويدخل مجمّعًا في تقرير أثر البرنامج.</p>
        </div>
      </div>
    );
  }

  const pre = data.phase === 'pre';
  const set = (id, k, v) => setAnswers((a) => ({ ...a, [id]: { ...a[id], [k]: v } }));
  const left = data.questions.filter((q) => answers[q.id]?.now == null || (!pre && answers[q.id]?.before == null)).length;
  const submit = async () => {
    setBusy(true); setError('');
    const res = await call('rater.submit', { t, answers, comment });
    setBusy(false);
    if (res.success) setDone(true); else setError(res.message);
  };
  const scale = (q, k) => (
    <div className="options likert" role="radiogroup">
      {q.options.map((o) => (
        <button key={o.k} type="button" className={`opt${answers[q.id]?.[k] === o.k ? ' on' : ''}`} role="radio"
          aria-checked={answers[q.id]?.[k] === o.k} onClick={() => set(q.id, k, o.k)}>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="page narrow stack">
      <div className="card stack">
        <p className="eyebrow">{pre ? 'تقدير الممارسة قبل البرنامج' : 'تقدير تغير الممارسة'}</p>
        <h1 style={{ fontSize: 22 }}>{data.rater ? `أهلًا ${data.rater}، ` : ''}{pre ? `كيف يمارس ${data.participant} عمله اليوم؟` : `كيف تغيّرت ممارسة ${data.participant}؟`}</h1>
        <p className="muted">{pre
          ? `بصفتك ${data.relation || 'مقيّمًا'}، قدّر كل عبارة كما رأيتها فعلًا. سنطلب التقدير نفسه بعد البرنامج للمقارنة، ولا يظهر تقديرك له منفردًا.`
          : `بصفتك ${data.relation || 'مقيّمًا'}، قدّر لكل عبارة مرتين: كيف يمارسها الآن، وكيف كان يمارسها قبل البرنامج. اعتمد على ما رأيته فعلًا، ولا يظهر تقديرك له منفردًا.`}</p>
      </div>
      {data.questions.map((q, i) => (
        <div key={q.id} className="card stack">
          <div className="row small"><span className="chip dark">{dimOf(q.dimension).title}</span><span className="muted">{i + 1} من {data.questions.length}</span></div>
          <p className="q-text">{q.text}</p>
          <p className="retro-label">{pre ? 'في الأشهر الثلاثة الأخيرة' : 'الآن'}</p>
          {i === 0 && <p className="small muted">اختر «لا أستطيع الحكم» إن لم تشهد الموقف.</p>}
          {scale(q, 'now')}
          {!pre && <p className="retro-label">قبل البرنامج</p>}
          {!pre && scale(q, 'before')}
        </div>
      ))}
      <div className="card stack">
        <label className="field"><span>ملاحظة <em>(اختياري)</em>: مثال محدد على تغيير لاحظته</span>
          <textarea className="input" rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        {error && <div className="alert err">{error}</div>}
        {/* D18 وD19: إشعار خصوصية المقيّم وسطر موافقته، ويُسجَّل قبوله بإرسال التقدير */}
        <p className="small muted rater-privacy">نحفظ اسمك وبريدك وصلتك بالمشارك وتقديرك لقياس أثر البرنامج وحده، ولا يظهر تقديرك للمشارك منفردًا. يُحذف مع بيانات البرنامج عند طلبك، وتراسلنا لذلك من بريدك. بإرسالك التقدير توافق على ذلك وفق <a className="link" href={LEGAL_PATH.privacy} target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a> (النسخة {POLICY_VERSION}).</p>
        <div className="row">
          <button className="btn gold" disabled={busy || left > 0} onClick={submit}>{busy ? 'جارٍ الإرسال…' : left ? `بقي ${left}` : 'أرسل التقدير'}</button>
        </div>
      </div>
    </div>
  );
}
