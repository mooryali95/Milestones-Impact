// ════════════════════════════════════════════════════════════════
// انضم كخبير: leaders.sunkvalue.com/expert
// ════════════════════════════════════════════════════════════════
// صفحة مفتوحة بلا حساب. الطلب يدخل قائمة «طلبات بانتظار المراجعة» في لوحة
// الإدارة، ولا يُسند إلى صاحبه شيء قبل اعتماده.
import React, { useState } from 'react';
import { call } from '../api.js';
import { DIM_AR, EXPERT_ROLE_AR, LEVEL_AR } from '../../../supabase/functions/leaders-api/labels.js';

const LANG = { ar: 'العربية', en: 'English' };

function Pick({ legend, options, value, onChange }) {
  const on = new Set(value);
  return (
    <fieldset className="xp-pick">
      <legend>{legend}</legend>
      <div>{options.map(([k, l, hint]) => (
        <label key={k} className={`xp-opt${on.has(k) ? ' on' : ''}`}>
          <input type="checkbox" checked={on.has(k)} onChange={() => { const n = new Set(on); if (n.has(k)) n.delete(k); else n.add(k); onChange([...n]); }} />
          <b>{l}</b>{hint && <small>{hint}</small>}
        </label>
      ))}</div>
    </fieldset>
  );
}

export default function ExpertApply() {
  const [v, setV] = useState({ full_name: '', email: '', phone: '', title: '', linkedin_url: '', years_experience: '', bio: '', roles: [], dimensions: [], levels: [], sectors: '', languages: ['ar'], weekly_hours: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const r = await call('expert.apply', v);
    setBusy(false);
    if (r.success) { setDone(true); window.scrollTo({ top: 0 }); } else setError(r.message);
  };

  if (done) {
    return (
      <div className="page narrow">
        <div className="card milestone-card stack">
          <div className="badge"><span>✓</span></div>
          <h2>وصل طلبك</h2>
          <p className="muted">نراجع طلبات الانضمام خلال 5 أيام عمل، ونراسلك بالنتيجة على بريدك.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="page narrow">
      <form className="card stack xp" onSubmit={submit}>
        <p className="eyebrow" dir="ltr">EXPERT NETWORK</p>
        <h2>انضم إلى شبكة خبراء برنامج القادة</h2>
        <p className="muted">نبحث عن خبراء في إدارة المشروعات وتحويلها إلى أثر وتمكين القادة، يرافقون القادة موجّهين ومستشارين ومقيّمين. يُراجع كل طلب قبل إسناد أي خدمة.</p>

        <div className="xp-grid">
          <label className="field"><span>الاسم الكامل *</span><input className="input" required value={v.full_name} onChange={set('full_name')} maxLength={120} autoComplete="name" /></label>
          <label className="field"><span>البريد الإلكتروني *</span><input className="input" dir="ltr" type="email" required value={v.email} onChange={set('email')} autoComplete="email" /></label>
          <label className="field"><span>المسمى المهني</span><input className="input" value={v.title} onChange={set('title')} maxLength={160} placeholder="مثل: مستشار إدارة محافظ، PMP" /></label>
          <label className="field"><span>الجوال</span><input className="input" dir="ltr" value={v.phone} onChange={set('phone')} autoComplete="tel" /></label>
          <label className="field"><span>LinkedIn</span><input className="input" dir="ltr" value={v.linkedin_url} onChange={set('linkedin_url')} placeholder="https://www.linkedin.com/in/…" /></label>
          <label className="field"><span>سنوات الخبرة</span><input className="input" inputMode="numeric" value={v.years_experience} onChange={set('years_experience')} /></label>
        </div>

        <Pick legend="كيف تحب أن تخدم؟ *" options={Object.entries(EXPERT_ROLE_AR).map(([k, [l, h]]) => [k, l, h])} value={v.roles} onChange={(roles) => setV({ ...v, roles })} />
        <Pick legend="أبعاد البرنامج التي تتقنها *" options={Object.entries(DIM_AR).map(([k, l]) => [k, l])} value={v.dimensions} onChange={(dimensions) => setV({ ...v, dimensions })} />
        <Pick legend="مستويات القادة التي تناسبك" options={Object.entries(LEVEL_AR).map(([k, l]) => [k, l])} value={v.levels} onChange={(levels) => setV({ ...v, levels })} />
        <Pick legend="لغات العمل" options={Object.entries(LANG)} value={v.languages} onChange={(languages) => setV({ ...v, languages })} />

        <div className="xp-grid">
          <label className="field"><span>القطاعات التي عملت فيها</span><input className="input" value={v.sectors} onChange={set('sectors')} placeholder="حكومي، طاقة، صحة" /></label>
          <label className="field"><span>الساعات المتاحة أسبوعيًا</span><input className="input" inputMode="numeric" value={v.weekly_hours} onChange={set('weekly_hours')} /></label>
        </div>
        <label className="field"><span>عرّف بخبرتك *</span>
          <textarea className="input" rows={5} required minLength={80} maxLength={3000} value={v.bio} onChange={set('bio')} placeholder="مشاريع قدتها أو أشرفت عليها، والمنهجيات التي تعمل بها، وما تضيفه للقادة" />
          <small className="muted">{v.bio.length < 80 ? `${80 - v.bio.length} حرفًا على الأقل بعد` : 'ممتاز'}</small></label>

        {error && <div className="alert err" role="alert">{error}</div>}
        <button className="btn" disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'أرسل طلب الانضمام'}</button>
        <p className="small muted">نستخدم بياناتك لمراجعة طلبك وإسناد الخدمات إليك فقط، ولا تُشارك مع أي جهة.</p>
      </form>
    </div>
  );
}
