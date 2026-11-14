// ════════════════════════════════════════════════════════════════
// الملف الشخصي: المرحلة الأولى في الرحلة، ويُعدَّل لاحقًا من الرحلة
// ════════════════════════════════════════════════════════════════
import React, { useRef, useEffect, useState } from 'react';
import { PasskeyBanner, PreManager } from './Journey.jsx';
import { gateDone } from '../gates.js';
import SponsorNote from '../SponsorNote.jsx';
import { call, uploadFile } from '../api.js';
import { countAr, VIEWER_PERM_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { certNameOk, latinDigits } from '../../../supabase/functions/leaders-api/logic.js';

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
  const [busy, setBusy] = useState(false);
  const load = () => call('org.visibility').then(setD);
  useEffect(() => { load(); }, []);
  if (!d?.success || !d.org) return null;
  const v = d.visibility || {};
  const open = Object.entries(VIEWER_PERM_AR).filter(([k]) => v[k]);
  // المستويات لا تصل الجهة إلا بموافقة المشارك: مفتاح واحد يملكه هو
  const share = async (on) => { setBusy(true); setD((x) => ({ ...x, share_consented: on })); const r = await call('org.share-consent', { share: on }); setBusy(false); if (!r.success) load(); };   // تفاؤلي، ويُرجَع عند الفشل
  return (
    <section className="card stack org-see" aria-labelledby="org-see-h">
      <h2 id="org-see-h" className="as-h3">ماذا ترى جهتك</h2>
      {!v.viewers ? <p className="muted">لا أحد من {d.org} يطّلع على رحلتك الآن.</p> : <>
        <p className="muted">{countAr(v.viewers, 'مطّلع واحد', 'مطّلعان', 'مطّلعين', 'مطّلعًا')} من {d.org} {v.viewers === 1 ? 'يرى' : v.viewers === 2 ? 'يريان' : 'يرون'} {v.list ? 'من رحلتك:' : 'أرقامًا مجمّعة عن مشاركي جهتك فقط، بلا اسمك.'}</p>
        {v.list && <ul className="org-see-list">{open.map(([k, [l, h]]) => <li key={k}><b>{l}</b><small>{v.scores && k === 'scores' ? (d.share_consented ? `${h}؛ بموافقتك` : 'طلبت جهتك الاطلاع عليها ولا تصلها إلا بموافقتك أدناه') : h}</small></li>)}</ul>}
      </>}
      <label className="row small" style={{ gap: '.5rem', alignItems: 'center' }}>
        <input type="checkbox" checked={!!d.share_consented} disabled={busy} onChange={(e) => share(e.target.checked)} />
        <span>أوافق على اطلاع {d.org} على مساري ومستوياتي في الأبعاد الثلاثة (تأسيسي أو متوسط أو احترافي)، وعلى ظهور مساري ومستواي العام في وثيقة مبادرتي لجهتي ولراعي مبادرتي. أستطيع سحب الموافقة في أي وقت.</span>
      </label>
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
      <h2 id="sponsor-h" className="as-h3">الجهة الراعية</h2>
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

// مفاتيح المرور: يراها صاحب الحساب ويحذف ما لا يعرفه. الحذف يُنهي الجلسات الأخرى (M3)
function Passkeys({ onCount, bump }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { call('passkey.list').then((r) => setList(r.success ? r.passkeys : [])); }, [bump]);
  const remove = async (k) => {
    if (!window.confirm(`حذف مفتاح «${k.device_label || 'بلا اسم'}»؟ لن يُدخل به بعد الآن، وتنتهي جلساتك على الأجهزة الأخرى.`)) return;
    setBusy(true); setError('');
    const r = await call('passkey.remove', { id: k.id });
    setBusy(false);
    if (r.success) { setList(r.passkeys); onCount(r.passkeys.length); } else setError(r.message);
  };
  if (!list || list.length === 0) return null;
  return (
    <section className="card stack devices">
      <h2>مفاتيح المرور</h2>
      <p className="small muted">كل مفتاح يدخل صاحبه إلى رحلتك ببصمته أو وجهه. إن رأيت مفتاحًا لا تعرفه فاحذفه.</p>
      <ul className="device-list">
        {list.map((k) => (
          <li key={k.id}>
            <div><b>{k.device_label || 'مفتاح بلا اسم'}</b>
              <br /><small className="muted">أُضيف {when(k.created_at)}{k.last_used_at ? ` · آخر دخول به ${when(k.last_used_at)}` : ' · لم يُستعمل بعد'}</small></div>
            <button type="button" className="link small" disabled={busy} onClick={() => remove(k)}>حذف</button>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

// اسم يصلح للشهادة: كلمتان على الأقل، كل منهما حرفان فأكثر، بحروف عربية أو لاتينية
// الفحص نفسه في الخادم (profile.save): مصدره logic.js
export const certName = certNameOk;

const REQUIRED = ['full_name', 'phone', 'job_title', 'organization_name', 'years_experience'];
const LABEL = { full_name: 'الاسم الكامل', phone: 'رقم الجوال', job_title: 'المسمى الوظيفي', organization_name: 'جهة العمل', years_experience: 'سنوات الخبرة' };

export default function Profile({ me, onSaved, onboarding, onCancel }) {
  const p = me.participant;
  const [f, setF] = useState({
    full_name: p.full_name || '', name_en: p.name_en || '', phone: p.phone || '', job_title: p.job_title || '',
    organization_name: p.organization_name || '', sector: p.sector || '',
    years_experience: p.years_experience ?? '', work_scope: p.work_scope || '', linkedin_url: p.linkedin_url || '', bio: p.bio || '',
  });
  const [hasCv, setHasCv] = useState(p.has_cv);
  const [pk, setPk] = useState(me.passkeys || 0);
  const [cvName, setCvName] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);   // بعد أول محاولة حفظ ناقصة تُعلَّم الحقول الناقصة في مواضعها
  const formRef = useRef(null);
  // سنوات الخبرة أرقام فقط، والمشرقية منها (٠-٩) تُحوَّل: حقل type=number كان يُفرغ نفسه بها فيُرفض الحفظ
  const set = (k) => (e) => setF({ ...f, [k]: k === 'years_experience' ? latinDigits(e.target.value).replace(/\D/g, '').slice(0, 2) : e.target.value });

  const empty = REQUIRED.filter((k) => String(f[k]).trim() === '');
  const filled = REQUIRED.length - empty.length;
  const bad = (k) => tried && empty.includes(k);
  // سمة الحقل الناقص: يقرؤها قارئ الشاشة ويلوّنها styles.css
  const need = (k) => ({ required: true, name: k, 'aria-invalid': bad(k) || undefined });

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
    // الزر مفعّل دائمًا: زر معطّل لا يقول ما الناقص. الحفظ الناقص يسمّي الحقول ويذهب إلى أولها
    // الاسم يُطبع على الشهادة ويُقفل عند إصدارها: اسمان على الأقل وبلا أرقام
    if (!empty.length && !p.name_locked && !certName(f.full_name)) {
      setError('اكتب اسمك الكامل كما تريده على الشهادة: اسمان على الأقل، بالحروف دون أرقام أو رموز.');
      formRef.current?.querySelector('[name="full_name"]')?.focus();
      return;
    }
    if (empty.length) {
      setTried(true);
      setError(`بقي ${empty.length === 1 ? 'حقل واحد' : empty.length === 2 ? 'حقلان' : `${empty.length} حقول`}: ${empty.map((k) => LABEL[k]).join('، ')}.`);
      formRef.current?.querySelector(`[name="${empty[0]}"]`)?.focus();
      return;
    }
    setBusy(true); setError('');
    // الاسم المقفل لا يُرسل، فلا يرفض الخادم بقية التعديلات
    const { full_name, name_en, ...rest } = f;
    const res = await call('profile.save', { fields: p.name_locked ? rest : f });
    setBusy(false);
    if (!res.success) return setError(res.message);
    // لا نجاح صامت: إن حُفظ ولم يكتمل الملف قلنا ما بقي بدل أن تبقى الشاشة كما هي
    if (onboarding && !gateDone(res, 'profile')) {
      const missing = REQUIRED.filter((k) => res.participant?.[k] == null || String(res.participant[k]).trim() === '').map((k) => LABEL[k]);
      return setError(`حُفظت بياناتك. ${missing.length ? `بقي: ${missing.join('، ')}.` : 'تعذّر الانتقال الآن، حدّث الصفحة أو تواصل معنا.'}`);
    }
    onSaved(res);
  };

  const nameEn = (
    <label className="field"><span>الاسم بالإنجليزية <em>(للشهادة)</em></span>
      <input className="input ltr" value={f.name_en} onChange={set('name_en')} placeholder="Sarah Abdullah Alahmad" autoComplete="off" lang="en" readOnly={p.name_locked} /></label>
  );
  const sectorField = (
    <label className="field"><span>القطاع <em>(اختياري)</em></span>
      <input className="input" value={f.sector} onChange={set('sector')} placeholder="حكومي، خاص، غير ربحي…" /></label>
  );
  const extras = (
    <>
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
    </>
  );

  return (
    <div className="page narrow">
      {onboarding && (
        <div className="stack" style={{ marginBottom: 18 }}>
          <div className="row between small">
            <span className="muted">{filled} من {REQUIRED.length} حقول أساسية</span>
          </div>
          {/* تقدّم ممنوح: التسجيل نفسه خطوة منجزة، فلا يبدأ الشريط من الصفر */}
          <div className="bar"><i style={{ width: `${20 + (filled / REQUIRED.length) * 80}%` }} /></div>
        </div>
      )}
      <form className="card stack" data-tour="profile-form" onSubmit={save} noValidate ref={formRef}>
        <div>
          <h1 style={{ fontSize: 22 }}>{onboarding ? `أهلًا ${p.full_name.split(' ')[0]}، عرّفنا بك` : 'ملفي الشخصي'}</h1>
          {onboarding && <p className="muted">هذه البيانات تساعد المستشار على فهم سياقك قبل اعتماد مسارك. تستغرق دقيقتين.</p>}
        </div>

        <div className="grid2">
          <label className="field"><span>الاسم الكامل <em>(كما يظهر في الشهادة)</em></span>
            <input className="input" {...need('full_name')} value={f.full_name} onChange={set('full_name')} autoComplete="name" readOnly={p.name_locked} /></label>
          {!onboarding && nameEn}
          {p.name_locked && <p className="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>اسمك مقفل لأن شهادتك صدرت به. لتصحيحه تواصل مع إدارة البرنامج لإعادة إصدارها.</p>}
          <label className="field"><span>رقم الجوال</span>
            <input className="input ltr" {...need('phone')} type="tel" value={f.phone} onChange={set('phone')} placeholder="05XXXXXXXX" autoComplete="tel" /></label>
          <label className="field"><span>المسمى الوظيفي</span>
            <input className="input" {...need('job_title')} value={f.job_title} onChange={set('job_title')} autoComplete="organization-title" /></label>
          <label className="field"><span>جهة العمل <em>(حيث تعمل، وقد تختلف عن الجهة الراعية)</em></span>
            <input className="input" {...need('organization_name')} value={f.organization_name} onChange={set('organization_name')} autoComplete="organization" /></label>
          {!onboarding && sectorField}
          <label className="field"><span>سنوات الخبرة</span>
            <input className="input" {...need('years_experience')} inputMode="numeric" value={f.years_experience} onChange={set('years_experience')} /></label>
          <label className="field"><span>نطاق ما تقوده الآن <em>(يحدد فصول وثيقة مبادرتك وأمثلة الكتيب)</em></span>
            <select className="input" value={f.work_scope} onChange={set('work_scope')}>
              <option value="">لم أحدد بعد</option>
              <option value="project">مشروع أو أكثر</option>
              <option value="program">برنامج من مشاريع مترابطة</option>
              <option value="portfolio">محفظة مشاريع وبرامج</option>
            </select></label>
        </div>

        {onboarding ? (
          <details className="more-fields">
            <summary>أضف المزيد الآن <em>(اختياري، ويبقى متاحًا في «ملفي»)</em></summary>
            <div className="stack">
              <div className="grid2">{nameEn}{sectorField}</div>
              {extras}
            </div>
          </details>
        ) : extras}

        {error && <div className="alert err">{error}</div>}
        <div className="row">
          <button className="btn gold" disabled={busy || uploading}>
            {busy ? 'جارٍ الحفظ…' : onboarding ? 'حفظ والانتقال لتحديد المستوى' : 'حفظ'}
          </button>
          {!onboarding && <button type="button" className="btn ghost" onClick={onCancel}>رجوع</button>}
        </div>
      </form>
      {!onboarding && !p.organization_linked && !me.access?.sponsor && !p.is_demo && <SponsorCode onSaved={onSaved} />}
      {!onboarding && me.access?.sponsor && <section className="card stack"><h2 className="as-h3">الجهة الراعية</h2><SponsorNote access={me.access} /></section>}
      {!onboarding && (
        <section className="card stack" data-tour="security">
          <h2 className="as-h3">الدخول بالبصمة</h2>
          {pk > 0 && <p className="muted small">مفتاح المرور مفعّل على {countAr(pk, 'جهاز واحد', 'جهازين', 'أجهزة', 'جهازًا')}.</p>}
          <PasskeyBanner settings more={pk > 0} onDone={() => setPk((n) => n + 1)} />
        </section>
      )}
      {!onboarding && me.participant.status !== 'completed' && <PreManager inSettings />}
      {!onboarding && <OrgVisibility />}
      {!onboarding && <Passkeys bump={pk} onCount={setPk} />}
      {!onboarding && <Devices />}
    </div>
  );
}
