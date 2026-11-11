// ════════════════════════════════════════════════════════════════
// تقدير المقيّم الخارجي: leaders.sunkvalue.com/rate?t=<الرمز>
// ════════════════════════════════════════════════════════════════
// صفحة مفتوحة بلا حساب، يصلها المدير أو الزميل من بريد الدعوة. لكل عبارة
// تقديران: الآن وقبل البرنامج، و"لا أستطيع الحكم" إن لم يرَ الموقف.
// دعوة ما قبل البرنامج (phase pre) تقدير واحد: الأشهر الثلاثة الأخيرة.
// تقييم 360، المرحلة 1: دليل قصير قبل البدء، وسؤال الصلة أولًا، والعبارات التي تشهدها مجموعته وحدها
// (الخادم يحجب المعكوسة)، وثلاثة أسئلة مفتوحة اختيارية بدل الملاحظة الواحدة.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { dimOf } from '../labels.js';
import { CONTACT_FREQ_AR, FEEDBACK_OPEN_AR, FEEDBACK_OPEN_MAX, LEGAL_PATH, POLICY_VERSION } from '../../../supabase/functions/leaders-api/labels.js';

export default function Rater() {
  const [t] = useState(() => new URLSearchParams(location.search).get('t') || '');
  const [data, setData] = useState(null);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState({});
  const [contact, setContact] = useState('');
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => { call('rater.get', { t }).then(setData); }, [t]);

  if (!data) return <div className="center-load"><div className="spinner" /></div>;
  if (!data.success) return <div className="page narrow"><div className="card stack"><h1 className="as-h2">الرابط غير متاح</h1><div className="alert err" role="alert">{data.message}</div></div></div>;
  if (done || data.done) {
    return (
      <div className="page narrow">
        <div className="card milestone-card stack">
          <div className="badge"><span>✓</span></div>
          <h1 className="as-h2">شكرًا لك</h1>
          <p className="muted">وصل تقديرك، ويدخل مجمّعًا في تقرير أثر البرنامج.</p>
        </div>
      </div>
    );
  }

  const pre = data.phase === 'pre';
  // الدليل القصير قبل البدء (30 ثانية): ما يُقيَّم، و«لا أستطيع الحكم»، ومثال على ملاحظة محددة
  if (!started) {
    return (
      <div className="page narrow stack">
        <div className="card stack">
          <p className="eyebrow">{pre ? 'تقدير الممارسة قبل البرنامج' : 'تقدير تغير الممارسة'}</p>
          <h1 style={{ fontSize: 22 }}>{data.rater ? `أهلًا ${data.rater}، ` : ''}قبل أن تبدأ</h1>
          <p className="muted">بصفتك {data.relation || 'مقيّمًا'} لـ{data.participant}. يستغرق التقدير نحو {pre ? 'ثلاث' : 'خمس'} دقائق.</p>
          <ul className="stack small">
            <li>قدّر ما رأيته فعلًا في الأشهر الثلاثة الأخيرة{pre ? '' : '، ثم كما كان قبل البرنامج'}، لا انطباعك العام عنه.</li>
            <li>اختر «لا أستطيع الحكم» إن لم تشهد الموقف، فهو أصدق من تقدير بالتخمين.</li>
            <li>لا يظهر تقديرك له منفردًا.</li>
          </ul>
          <p className="small muted">وفي الأسئلة المكتوبة اذكر موقفًا محددًا: «في اجتماع المراجعة يوم الأحد لخّص المواقف فهدأ النقاش» أنفع له من «ممتاز».</p>
          <div className="row"><button className="btn gold" onClick={() => setStarted(true)}>ابدأ</button></div>
        </div>
      </div>
    );
  }

  const set = (id, k, v) => setAnswers((a) => ({ ...a, [id]: { ...a[id], [k]: v } }));
  const left = data.questions.filter((q) => answers[q.id]?.now == null || (!pre && answers[q.id]?.before == null)).length + (contact ? 0 : 1);
  const submit = async () => {
    setBusy(true); setError('');
    const res = await call('rater.submit', { t, answers, contact_freq: contact, open });
    setBusy(false);
    if (res.success) setDone(true); else setError(res.message);
  };
  // كل مجموعة تُسمّى بنص العبارة ووقتها («الآن» أو «قبل البرنامج»)، فقارئ الشاشة لا يسمع «مجموعة اختيار» مكررة بلا اسم (links-expert-8)
  const qid = (q) => `rq-${String(q.id).replace(/[^\w-]/g, '')}`;
  const scale = (q, k) => (
    <div className="options likert" role="radiogroup" aria-labelledby={`${qid(q)}-text ${qid(q)}-${k}`}>
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
      {/* سؤال الصلة: وزن لجودة التقدير لا للحساب */}
      <div className="card stack">
        <p className="q-text" id="rt-contact">كم مرة ترى عمله؟</p>
        <div className="options" role="radiogroup" aria-labelledby="rt-contact" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {Object.entries(CONTACT_FREQ_AR).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={contact === k} className={`opt${contact === k ? ' on' : ''}`} onClick={() => setContact(k)}><span>{l}</span></button>
          ))}
        </div>
      </div>
      {data.questions.map((q, i) => (
        <div key={q.id} className="card stack">
          <div className="row small"><span className="chip dark">{dimOf(q.dimension).title}</span><span className="muted">{i + 1} من {data.questions.length}</span></div>
          <p className="q-text" id={`${qid(q)}-text`}>{q.text}</p>
          <p className="retro-label" id={`${qid(q)}-now`}>{pre ? 'في الأشهر الثلاثة الأخيرة' : 'الآن'}</p>
          {i === 0 && <p className="small muted">اختر «لا أستطيع الحكم» إن لم تشهد الموقف.</p>}
          {scale(q, 'now')}
          {!pre && <p className="retro-label" id={`${qid(q)}-before`}>قبل البرنامج</p>}
          {!pre && scale(q, 'before')}
        </div>
      ))}
      <div className="card stack">
        <h2 style={{ fontSize: 18 }}>ثلاثة أسئلة قصيرة <em className="small muted">(اختيارية)</em></h2>
        {Object.entries(FEEDBACK_OPEN_AR).map(([k, l]) => (
          <label key={k} className="field"><span>{l}</span>
            <textarea className="input" rows={3} maxLength={FEEDBACK_OPEN_MAX} value={open[k] || ''} onChange={(e) => setOpen({ ...open, [k]: e.target.value })} /></label>
        ))}
        {error && <div className="alert err" role="alert">{error}</div>}
        {/* D18 وD19: إشعار خصوصية المقيّم وسطر موافقته، ويُسجَّل قبوله بإرسال التقدير */}
        <p className="small muted rater-privacy">نحفظ اسمك وبريدك وصلتك بالمشارك وتقديرك لقياس أثر البرنامج وحده، ولا يظهر تقديرك للمشارك منفردًا. يُحذف مع بيانات البرنامج عند طلبك، وتراسلنا لذلك من بريدك. بإرسالك التقدير توافق على ذلك وفق <a className="link" href={LEGAL_PATH.privacy} target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a> (النسخة {POLICY_VERSION}).</p>
        <div className="row">
          <button className="btn gold" disabled={busy || left > 0} onClick={submit}>{busy ? 'جارٍ الإرسال…' : left ? `بقي ${left}` : 'أرسل التقدير'}</button>
        </div>
      </div>
    </div>
  );
}
