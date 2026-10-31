// ════════════════════════════════════════════════════════════════
// أدوات الشهادة المشتركة: عرضها، ومعاينتها من الخادم، ومحرر الموقّع
// ════════════════════════════════════════════════════════════════
// الإعداد العام وإعداد الجهة يستعملان المحرر نفسه، والمعاينة تُبنى على
// الخادم بالدالة نفسها التي تُصدر الشهادة، فلا نسخة ثانية من المنطق هنا.
import React from 'react';
import { L } from './leaders.js';
import { useUI } from './ui.jsx';
import { BRAND } from '../../shared/js/brand.js';

const STAMP = { revoked: 'ملغاة', replaced: 'مستبدلة', sample: 'نموذج' };

// تُفتح النافذة متزامنة مع النقرة، ثم تُكتب الشهادة فيها حين تجهز بياناتها
export async function openCertificate(load, status) {
  const win = window.open('', '_blank');
  if (!win) return alert('اسمح بالنوافذ المنبثقة لعرض الشهادة');
  win.document.write(`<p dir="rtl" style="font:16px system-ui;padding:40px;color:${BRAND['ink-blue']}">جارٍ تجهيز الشهادة…</p>`);
  try {
    const snapshot = await load();
    if (!snapshot) return win.close();
    const { writeCertificate } = await import('../../src/lib/brand/certificate.js');
    await writeCertificate(win, snapshot, { status: STAMP[status] });
  } catch (e) {
    // لا صفحة فارغة: السبب يظهر في النافذة نفسها
    win.document.body.innerHTML = '';
    const msg = win.document.createElement('p');
    msg.dir = 'rtl'; msg.style.cssText = `font:16px system-ui;padding:40px;color:${BRAND.umber}`;
    msg.textContent = `تعذّر عرض الشهادة: ${e?.message || e}`;
    win.document.body.appendChild(msg);
  }
}

// معاينة نموذج: الإعداد العام (settings) أو جهة (organization_id) مع مسودتها (cert)
export const previewCertificate = (body, onError) => openCertificate(async () => {
  const r = await L('admin.cert-preview', body);
  if (!r.success) { onError?.(r.message); return null; }
  return r.certificate;
}, 'sample');

// معاينة حية داخل الصفحة: الشهادة نفسها في إطار معزول، تتحدث بعد توقف قصير عن الكتابة.
// لا نافذة منبثقة: لا يحجبها المتصفح، ويظهر سبب الفشل مكانها بدل صفحة فارغة.
export function CertPreview({ body, label = 'معاينة الشهادة' }) {
  const [html, setHtml] = React.useState(null);
  const [err, setErr] = React.useState('');
  const key = JSON.stringify(body);
  React.useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await L('admin.cert-preview', body);
        if (!live) return;
        if (!r.success) { setErr(r.message || 'تعذّرت المعاينة'); return; }
        const { certificateHtml, qrSvgFor } = await import('../../src/lib/brand/certificate.js');
        const doc = certificateHtml(r.certificate, await qrSvgFor(r.certificate.verify_url), { status: STAMP.sample });
        // شريط أزرار الشهادة للنافذة المستقلة؛ داخل الإطار يُخفى
        if (live) { setErr(''); setHtml(doc.replace('</style>', '.toolbar{display:none}body{padding:0}</style>')); }
      } catch (e) { if (live) setErr(`تعذّرت المعاينة: ${e.message || e}`); }
    }, 500);
    return () => { live = false; clearTimeout(t); };
  }, [key]);
  return (
    <figure className="ce-preview" aria-label={label}>
      <div className="ce-frame">
        {err ? <div className="la-err" role="alert">{err}</div>
          : html ? <iframe title={label} srcDoc={html} sandbox="" />
          : <div className="ce-wait">جارٍ تجهيز المعاينة…</div>}
      </div>
      <figcaption className="la-row between">
        <small className="la-muted">نموذج يتحدث مع كل تعديل، قبل الحفظ</small>
        <button type="button" className="btn-sm ghost" disabled={!html} onClick={() => previewCertificate(body)}>فتح بالحجم الكامل</button>
      </figcaption>
    </figure>
  );
}

// الموقّع: اسم وصفة وصورة توقيع اختيارية. الختم يظهر دائمًا.
export function SignatoryEditor({ value, onChange, disabled }) {
  const s = value || { name: '', title: '' };
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const { processLogo } = await import('../../src/lib/brand/logo.js');
    onChange({ ...s, image: (await processLogo(f, { maxSide: 600 })).dataUrl });
  };
  return (
    <div className="ce-signer">
      <label className="of-field"><span className="of-label">اسم الموقّع</span><input value={s.name} disabled={disabled} onChange={(e) => onChange({ ...s, name: e.target.value })} maxLength={120} /></label>
      <label className="of-field"><span className="of-label">الصفة</span><input value={s.title} disabled={disabled} onChange={(e) => onChange({ ...s, title: e.target.value })} maxLength={160} placeholder="مثل: المدير التنفيذي" /></label>
      <div className="ce-sig">
        {s.image ? <img src={s.image} alt={`توقيع ${s.name}`} /> : <small>بلا صورة توقيع: يظهر الاسم والصفة فوق خط التوقيع</small>}
        {!disabled && <label className="btn-sm ghost">{s.image ? 'استبدال الصورة' : 'رفع صورة توقيع'}<input type="file" accept="image/png,image/jpeg" hidden onChange={pick} /></label>}
        {!disabled && s.image && <button type="button" className="btn-sm ghost" onClick={() => { const { image: _i, ...rest } = s; onChange(rest); }}>إزالة الصورة</button>}
      </div>
    </div>
  );
}

// اختيار الموقّع: inherit (للجهة فقط) · none (ختم Milestone وحده) · custom
export function SignatoryChoice({ mode, onMode, value, onChange, inheritLabel, disabled }) {
  const opts = [...(inheritLabel ? [['inherit', inheritLabel]] : []), ['custom', 'موقّع'], ['none', 'بلا موقّع (ختم Milestone وحده)']];
  return (
    <div className="ce-choice">
      <div className="of-logo-pick" role="radiogroup" aria-label="الموقّع">
        {opts.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? 'on' : ''} disabled={disabled} onClick={() => onMode(k)}>{l}</button>)}
      </div>
      {mode === 'custom' && <SignatoryEditor value={value} onChange={onChange} disabled={disabled} />}
    </div>
  );
}

export function Field({ label, hint, error, children, wide, group }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={`of-field${wide ? ' wide' : ''}${error ? ' bad' : ''}`} {...(group ? { role: 'group', 'aria-label': label.replace(' *', '') } : {})}>
      <span className="of-label">{label}</span>
      {children}
      {error ? <small className="of-err" role="alert">{error}</small> : hint ? <small className="of-hint">{hint}</small> : null}
    </Tag>
  );
}


// تخصيص طبقة فوق الإعداد العام (برنامج أو جهة): يُكتب ما يختلف فقط، والفارغ يُورث.
// base: ما يُورث منه للعرض في الخانات الفارغة. preview: جسم طلب المعاينة.
const sigMode = (cert) => (!('signatory' in cert) ? 'inherit' : cert.signatory ? 'custom' : 'none');
export function CertOverride({ cert, onChange, base, what, hint, preview, extra }) {
  const { toast } = useUI();
  const mode = sigMode(cert);
  const setText = (k) => (e) => {
    const v = k === 'hours' ? e.target.value.replace(/\D/g, '') : e.target.value;
    const { [k]: _old, ...rest } = cert;
    onChange(v ? { ...rest, [k]: k === 'hours' ? Number(v) : v } : rest);
  };
  const setMode = (m) => {
    const { signatory: prev, ...rest } = cert;
    onChange(m === 'inherit' ? rest : { ...rest, signatory: m === 'none' ? null : prev || { name: '', title: '' } });
  };
  const g = base || {};
  const inherited = g.signatory ? `العام: ${g.signatory.name}` : 'العام: بلا موقّع';
  return (
    <>
      <p className="of-hint">{hint}</p>
      <div className="of-grid">
        <Field label={`اسم البرنامج على شهادات ${what}`} hint={`فارغ = ${g.program_ar || 'العام'}`}><input value={cert.program_ar || ''} onChange={setText('program_ar')} maxLength={200} placeholder={g.program_ar} /></Field>
        <Field label="بالإنجليزية"><input dir="ltr" value={cert.program_en || ''} onChange={setText('program_en')} maxLength={200} placeholder={g.program_en} /></Field>
        <Field label="الساعات التدريبية" hint={g.hours ? `فارغ = ${g.hours}` : 'اختياري'}><input inputMode="numeric" value={cert.hours ?? ''} onChange={setText('hours')} placeholder={g.hours ? String(g.hours) : ''} /></Field>
        <Field group label="الموقّع" hint="ختم Milestone يظهر دائمًا" wide>
          <SignatoryChoice mode={mode} onMode={setMode} value={cert.signatory} onChange={(signatory) => onChange({ ...cert, signatory })} inheritLabel={inherited} />
        </Field>
      </div>
      <div className="la-row">
        <button type="button" className="btn-sm ghost" onClick={() => previewCertificate(preview, toast)}>معاينة شهادة {what}</button>
        {extra}
      </div>
    </>
  );
}
