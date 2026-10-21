// ════════════════════════════════════════════════════════════════
// الملف الشخصي: المرحلة الأولى في الرحلة، ويُعدَّل لاحقًا من الرحلة
// ════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { call, uploadFile } from '../api.js';

const REQUIRED = ['full_name', 'phone', 'job_title', 'organization_name', 'years_experience'];

export default function Profile({ me, onSaved, onboarding, onCancel }) {
  const p = me.participant;
  const [f, setF] = useState({
    full_name: p.full_name || '', phone: p.phone || '', job_title: p.job_title || '',
    organization_name: p.organization_name || '', sector: p.sector || '',
    years_experience: p.years_experience ?? '', linkedin_url: p.linkedin_url || '', bio: p.bio || '',
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
    const res = await call('profile.save', { fields: f });
    setBusy(false);
    if (res.success) onSaved(res);
    else setError(res.message);
  };

  return (
    <div className="page narrow">
      {onboarding && (
        <div className="stack" style={{ marginBottom: 18 }}>
          <div className="row between small">
            <span className="eyebrow">المرحلة 1 من 3 في القبول</span>
            <span className="muted">{filled} من {REQUIRED.length} حقول أساسية</span>
          </div>
          {/* تقدّم ممنوح: التسجيل نفسه خطوة منجزة، فلا يبدأ الشريط من الصفر */}
          <div className="bar"><i style={{ width: `${20 + (filled / REQUIRED.length) * 80}%` }} /></div>
        </div>
      )}
      <form className="card stack" onSubmit={save}>
        <div>
          <h1 style={{ fontSize: 22 }}>{onboarding ? `أهلًا ${p.full_name.split(' ')[0]}، عرّفنا بك` : 'ملفي الشخصي'}</h1>
          <p className="muted">{onboarding
            ? 'هذه البيانات تساعد المستشار على فهم سياقك قبل اعتماد مستواك. تستغرق دقيقتين.'
            : 'حدّث بياناتك متى شئت.'}</p>
        </div>

        <div className="grid2">
          <label className="field"><span>الاسم الكامل</span>
            <input className="input" required value={f.full_name} onChange={set('full_name')} autoComplete="name" /></label>
          <label className="field"><span>رقم الجوال</span>
            <input className="input ltr" required type="tel" value={f.phone} onChange={set('phone')} placeholder="05XXXXXXXX" autoComplete="tel" /></label>
          <label className="field"><span>المسمى الوظيفي</span>
            <input className="input" required value={f.job_title} onChange={set('job_title')} autoComplete="organization-title" /></label>
          <label className="field"><span>جهة العمل</span>
            <input className="input" required value={f.organization_name} onChange={set('organization_name')} autoComplete="organization" /></label>
          <label className="field"><span>القطاع <em>(اختياري)</em></span>
            <input className="input" value={f.sector} onChange={set('sector')} placeholder="حكومي، خاص، غير ربحي…" /></label>
          <label className="field"><span>سنوات الخبرة</span>
            <input className="input" required type="number" min="0" max="60" inputMode="numeric" value={f.years_experience} onChange={set('years_experience')} /></label>
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
    </div>
  );
}
