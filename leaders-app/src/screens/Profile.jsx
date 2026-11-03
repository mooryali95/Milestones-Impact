// ════════════════════════════════════════════════════════════════
// الملف الشخصي: المرحلة الأولى في الرحلة، ويُعدَّل لاحقًا من الرحلة
// ════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import SponsorNote from '../SponsorNote.jsx';
import { call, uploadFile } from '../api.js';
import { countAr, VIEWER_PERM_AR } from '../../../supabase/functions/leaders-api/labels.js';

const METHOD = { email_code: 'رمز البريد', email_link: 'رابط البريد', passkey: 'مفتاح المرور' };
const deviceOf = (ua = '') => {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone أو iPad' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'جهاز';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${br} على ${os}` : os;
};
const when = (t) => (t ? new Date(t).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');

// ماذا ترى جهتك: الشفافية قبل الاطلاع. ما لا يُذكر هنا لا يخرج من الخادم لجهتك
function OrgVisibility() {
  const [d, setD] = useState(null);
  useEffect(() => { call('org.visibility').then(setD); }, []);
  if (!d?.success || !d.org) return null;
  const v = d.visibility || {};
  const open = Object.entries(VIEWER_PERM_AR).filter(([k]) => v[k]);
  return (
    <section className="card stack org-see" aria-labelledby="org-see-h">
      <h3 id="org-see-h">ماذا ترى جهتك</h3>
      {!v.viewers ? <p className="muted">لا أحد من {d.org} يطّلع على رحلتك الآن.</p> : <>
        <p className="muted">{countAr(v.viewers, 'مطّلع واحد', 'مطّلعان', 'مطّلعين', 'مطّلعًا')} من {d.org} {v.list ? 'يرون من رحلتك:' : 'يرون أرقامًا مجمّعة عن مشاركي جهتك فقط، بلا اسمك.'}</p>
        {v.list && <ul className="org-see-list">{open.map(([k, [l, h]]) => <li key={k}><b>{l}</b><small>{h}</small></li>)}</ul>}
      </>}
      <p className="small muted">لا ترى جهتك أبدًا: إجابات القياس، ونماذجك وتأملاتك، وملاحظات المستشار، ومسودة مبادرتك قبل اعتمادها.</p>
    </section>
  );
}

// الجهة الراعية برمز: غير «جهة العمل»، ولا قائمة جهات تظهر هنا. الرمز الصحيح وحده يربط ويكشف اسم جهته
function SponsorCode({ onSaved }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await call('me.sponsor-code', { sponsor_code: code.trim() });
    setBusy(false);
    if (r.success) onSaved(r); else setErr(r.message);
  };
  return (
    <form className="card stack" onSubmit={send} aria-labelledby="sponsor-h">
      <h3 id="sponsor-h">الجهة الراعية</h3>
      <p className="muted small">إن رشّحتك جهة للبرنامج وأعطتك رمزًا، اكتبه هنا لترتبط بها. جهة الرعاية قد تختلف عن جهة عملك.</p>
      <div className="row">
        <input className="input ltr grow" autoComplete="off" spellCheck={false} maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC-2026" aria-label="رمز الجهة الراعية" />
        <button className="btn ghost" disabled={busy || code.trim().length < 4}>{busy ? 'لحظة…' : 'اربط'}</button>
      </div>
      {err && <div className="alert err small" role="alert">{err}</div>}
    </form>
  );
}

// أجهزتك: الجلسات السارية، وإنهاء أي جهاز غير هذا
function Devices() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('sessions.list').then((r) => setList(r.success ? r.sessions : [])); }, []);
  const revoke = async (id) => {
    setBusy(true);
    const r = await call('sessions.revoke', id ? { id } : {});
    setBusy(false);
    if (r.success) setList(r.sessions);
  };
  if (!list) return null;
  const others = list.filter((x) => !x.current);
  return (
    <section className="card stack devices">
      <div className="row between">
        <h2>أجهزتك</h2>
        {others.length > 0 && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => revoke()}>اخرج من الأجهزة الأخرى</button>}
      </div>
      <p className="small muted">الأجهزة التي دخلت منها خلال آخر أسبوعين. إن رأيت جهازًا لا تعرفه فأنهِ جلسته.</p>
      <ul className="device-list">
        {list.map((x) => (
          <li key={x.id}>
            <div><b>{deviceOf(x.user_agent || '')}</b>{x.current && <span className="chip ok">هذا الجهاز</span>}
              <br /><small className="muted">{METHOD[x.method] || x.method} · آخر نشاط {when(x.last_seen_at || x.created_at)}</small></div>
            {!x.current && <button type="button" className="link small" disabled={busy} onClick={() => revoke(x.id)}>إنهاء</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

const REQUIRED = ['full_name', 'phone', 'job_title', 'organization_name', 'years_experience'];

export default function Profile({ me, onSaved, onboarding, onCancel }) {
  const p = me.participant;
  const [f, setF] = useState({
    full_name: p.full_name || '', name_en: p.name_en || '', phone: p.phone || '', job_title: p.job_title || '',
    organization_name: p.organization_name || '', sector: p.sector || '',
    years_experience: p.years_experience ?? '', work_scope: p.work_scope || '', linkedin_url: p.linkedin_url || '', bio: p.bio || '',
  });
  const [hasCv, setHasCv] = useState(p.has_cv);
  const [cvName, setCvName] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const filled = REQUIRED.filter((k) => String(f[k]).trim() !== '').length;
  const ready = filled === REQUIRED.length;

  const pickCv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true); setError('');
    const up = await uploadFile(file, 'cv');
    if (up.success) {
      const res = await call('cv.attach', { path: up.path });
      if (res.success) { setHasCv(true); setCvName(file.name); } else setError(res.message);
    } else setError(up.message);
    setUploading(false);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    // الاسم المقفل لا يُرسل، فلا يرفض الخادم بقية التعديلات
    const { full_name, name_en, ...rest } = f;
    const res = await call('profile.save', { fields: p.name_locked ? rest : f });
    setBusy(false);
    if (res.success) onSaved(res);
    else setError(res.message);
  };

  return (
    <div className="page narrow">
      {onboarding && (
        <div className="stack" style={{ marginBottom: 18 }}>
          <div className="row between small">
            <span className="eyebrow">الخطوة 1 من 3 في القبول</span>
            <span className="muted">{filled} من {REQUIRED.length} حقول أساسية</span>
          </div>
          {/* تقدّم ممنوح: التسجيل نفسه خطوة منجزة، فلا يبدأ الشريط من الصفر */}
          <div className="bar"><i style={{ width: `${20 + (filled / REQUIRED.length) * 80}%` }} /></div>
        </div>
      )}
      <form className="card stack" onSubmit={save}>
        <div>
          <h1 style={{ fontSize: 22 }}>{onboarding ? `أهلًا ${p.full_name.split(' ')[0]}، عرّفنا بك` : 'ملفي الشخصي'}</h1>
          {onboarding && <p className="muted">هذه البيانات تساعد المستشار على فهم سياقك قبل اعتماد مسارك. تستغرق دقيقتين.</p>}
        </div>

        <div className="grid2">
          <label className="field"><span>الاسم الكامل <em>(كما يظهر في الشهادة)</em></span>
            <input className="input" required value={f.full_name} onChange={set('full_name')} autoComplete="name" readOnly={p.name_locked} /></label>
          <label className="field"><span>الاسم بالإنجليزية <em>(للشهادة)</em></span>
            <input className="input ltr" value={f.name_en} onChange={set('name_en')} placeholder="Sarah Abdullah Alahmad" autoComplete="off" lang="en" readOnly={p.name_locked} /></label>
          {p.name_locked && <p className="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>اسمك مقفل لأن شهادتك صدرت به. لتصحيحه تواصل مع إدارة البرنامج لإعادة إصدارها.</p>}
          <label className="field"><span>رقم الجوال</span>
            <input className="input ltr" required type="tel" value={f.phone} onChange={set('phone')} placeholder="05XXXXXXXX" autoComplete="tel" /></label>
          <label className="field"><span>المسمى الوظيفي</span>
            <input className="input" required value={f.job_title} onChange={set('job_title')} autoComplete="organization-title" /></label>
          <label className="field"><span>جهة العمل <em>(حيث تعمل، وقد تختلف عن الجهة الراعية)</em></span>
            <input className="input" required value={f.organization_name} onChange={set('organization_name')} autoComplete="organization" /></label>
          <label className="field"><span>القطاع <em>(اختياري)</em></span>
            <input className="input" value={f.sector} onChange={set('sector')} placeholder="حكومي، خاص، غير ربحي…" /></label>
          <label className="field"><span>سنوات الخبرة</span>
            <input className="input" required type="number" min="0" max="60" inputMode="numeric" value={f.years_experience} onChange={set('years_experience')} /></label>
          <label className="field"><span>نطاق ما تقوده الآن <em>(يحدد فصول وثيقة مبادرتك وأمثلة الكتيب)</em></span>
            <select className="input" value={f.work_scope} onChange={set('work_scope')}>
              <option value="">لم أحدد بعد</option>
              <option value="project">مشروع أو أكثر</option>
              <option value="program">برنامج من مشاريع مترابطة</option>
              <option value="portfolio">محفظة مشاريع وبرامج</option>
            </select></label>
        </div>

        <label className="field"><span>رابط LinkedIn <em>(اختياري)</em></span>
          <input className="input ltr" type="url" value={f.linkedin_url} onChange={set('linkedin_url')} placeholder="https://www.linkedin.com/in/…" /></label>
        <label className="field"><span>نبذة مختصرة <em>(اختياري)</em></span>
          <textarea className="input" maxLength={2000} value={f.bio} onChange={set('bio')} placeholder="أبرز مشروع تقوده الآن، وما الذي تريد أن يتغير بعد البرنامج؟" /></label>

        <div className="field">
          <span>السيرة الذاتية <em>(PDF أو Word، حتى 10 ميجابايت)</em></span>
          <div className="row">
            <label className="btn ghost sm" style={{ cursor: uploading ? 'default' : 'pointer' }}>
              {uploading ? 'جارٍ الرفع…' : hasCv ? 'استبدال الملف' : 'اختر ملفًا'}
              <input type="file" className="sr" accept=".pdf,.docx" onChange={pickCv} disabled={uploading} />
            </label>
            {hasCv && <span className="chip ok">✓ {cvName || 'مرفوعة'}</span>}
          </div>
        </div>

        {error && <div className="alert err">{error}</div>}
        <div className="row">
          <button className="btn gold" disabled={busy || uploading || !ready}>
            {busy ? 'جارٍ الحفظ…' : onboarding ? 'حفظ والانتقال لتحديد المستوى' : 'حفظ'}
          </button>
          {!onboarding && <button type="button" className="btn ghost" onClick={onCancel}>رجوع</button>}
        </div>
      </form>
      {!onboarding && !p.organization_linked && !me.access?.sponsor && <SponsorCode onSaved={onSaved} />}
      {!onboarding && me.access?.sponsor && <section className="card stack"><h3>الجهة الراعية</h3><SponsorNote access={me.access} /></section>}
      {!onboarding && <OrgVisibility />}
      {!onboarding && <Devices />}
    </div>
  );
}
