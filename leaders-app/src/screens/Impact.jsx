// ════════════════════════════════════════════════════════════════
// القياس البعدي: ما تغيّر بين بداية الرحلة ونهايتها، ودعوة المقيّمين
// ════════════════════════════════════════════════════════════════
// المشارك يرى مؤشرًا عامًا واحدًا قبل وبعد (لا تفصيل لكل إطار)، وتقديره
// لممارسته الآن وقبل البرنامج. ثم يدعو مديره ليقدّر التغير من موقعه،
// لأن الحكم بالتغير لا يقوم على التقدير الذاتي وحده.
import React, { useCallback, useEffect, useState } from 'react';
import { call } from '../api.js';
import Assessment from './Assessment.jsx';
import { ErrorBox } from '../ui.jsx';

const RELATIONS = [
  { key: 'manager', title: 'المدير المباشر' },
  { key: 'peer', title: 'زميل يعمل معك' },
  { key: 'report', title: 'أحد أعضاء فريقك' },
];
const STATUS = { invited: 'بانتظار تقديره', submitted: 'أرسل تقديره ✓' };

function Bars({ label, before, after, beforeLabel, afterLabel }) {
  if (before == null || after == null) return null;
  const diff = Math.round((after - before) * 10) / 10;
  return (
    <div className="impact-bars">
      <div className="row between small"><b>{label}</b><span className={diff > 0 ? 'up' : diff < 0 ? 'down' : 'muted'}>{diff > 0 ? `+${diff}` : diff}</span></div>
      <div className="impact-bar"><span>{beforeLabel}</span><div className="bar"><i style={{ width: `${before}%`, background: 'var(--slate)' }} /></div><b>{before}</b></div>
      <div className="impact-bar"><span>{afterLabel}</span><div className="bar"><i style={{ width: `${after}%` }} /></div><b>{after}</b></div>
    </div>
  );
}

function Invite({ data, onChange }) {
  const [f, setF] = useState({ email: '', full_name: '', relation: data.raters.some((r) => r.relation === 'manager') ? 'peer' : 'manager' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await call('rater.invite', f);
    setBusy(false);
    if (res.success) { onChange(res); setF({ email: '', full_name: '', relation: 'peer' }); } else setError(res.message);
  };
  const revoke = async (id) => { const res = await call('rater.revoke', { id }); if (res.success) onChange(res); };
  const full = data.raters.length >= data.limit;
  return (
    <div className="card stack">
      <div>
        <h2 style={{ fontSize: 18 }}>ادعُ مديرك ليقدّر التغير</h2>
        <p className="small muted">يصله رابط بعبارات الممارسة نفسها بصيغة الغائب، ويقدّر لكل منها: الآن وقبل البرنامج. خمس دقائق، بلا حساب، ولا يظهر لك تقديره منفردًا. تقدير المدير يُكمل بند «إفادة المدير المباشر» في رحلتك.</p>
      </div>
      {data.raters.length > 0 && (
        <ul className="rater-list">
          {data.raters.map((r) => (
            <li key={r.id} className="row between">
              <span><b>{r.full_name || r.email}</b> <span className="small muted">{RELATIONS.find((x) => x.key === r.relation)?.title}</span></span>
              <span className="row small">
                <span className={`chip ${r.status === 'submitted' ? 'ok' : 'warn'}`}>{STATUS[r.status]}</span>
                {r.status === 'invited' && <button className="link small" onClick={() => revoke(r.id)}>إلغاء</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <form className="stack" onSubmit={send}>
          <div className="grid2">
            <label className="field"><span>البريد</span>
              <input className="input ltr" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label className="field"><span>الاسم <em>(اختياري)</em></span>
              <input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
            <label className="field"><span>صلته بك</span>
              <select className="input" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>
                {RELATIONS.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
              </select></label>
          </div>
          {error && <div className="alert err">{error}</div>}
          <div className="row"><button className="btn gold sm" disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'أرسل الدعوة'}</button></div>
        </form>
      )}
    </div>
  );
}

export default function Impact({ me, onUpdate, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const item = me.journey.flatMap((s) => s.items).find((i) => i.code === 'E-POST');
  const submitted = item?.status === 'done';

  const load = useCallback(async () => {
    setError('');
    const res = await call('impact.mine');
    if (res.success) setData(res); else setError(res.message);
  }, []);
  useEffect(() => { if (submitted) load(); }, [submitted, load]);

  if (!submitted) {
    return <Assessment kind="post" onBack={onBack} onSubmitted={onUpdate} />;
  }
  if (error) return <div className="page narrow"><ErrorBox message={error} onRetry={load} /></div>;
  if (!data) return <div className="center-load"><div className="spinner" /></div>;

  const s = data.summary;
  return (
    <div className="page narrow stack">
      <div className="row"><button className="link small" onClick={onBack}>→ رحلتي</button></div>
      <div className="card stack">
        <p className="eyebrow">ما تغيّر في رحلتك</p>
        <h1 style={{ fontSize: 22 }}>بين بداية الرحلة ونهايتها</h1>
        {s ? (
          <>
            <Bars label="المؤشر العام في الأطر الثلاثة" before={s.before} after={s.after} beforeLabel="البداية" afterLabel="الآن" />
            <Bars label="ممارستك كما تقدّرها اليوم" before={s.practice_then} after={s.practice_now} beforeLabel="قبل البرنامج" afterLabel="الآن" />
            <p className="small muted">نقارن الجوانب المشتركة بين القياسين فقط. ولا نعدّ الفرق تغيرًا حقيقيًا إلا إذا تجاوز هامش خطأ القياس، ويُستكمل الحكم بتقدير مديرك ودليل مشروعك قبل التقرير النهائي.</p>
          </>
        ) : <p className="muted">أُرسل قياسك البعدي. تظهر المقارنة هنا حين تكتمل نتائج القياسين.</p>}
      </div>
      <Invite data={data} onChange={setData} />
    </div>
  );
}
