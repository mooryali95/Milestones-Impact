// ════════════════════════════════════════════════════════════════
// أدوات الشهادة المشتركة: عرضها، ومعاينتها من الخادم، ومحرر الموقّع
// ════════════════════════════════════════════════════════════════
// الإعداد العام وإعداد الجهة يستعملان المحرر نفسه، والمعاينة تُبنى على
// الخادم بالدالة نفسها التي تُصدر الشهادة، فلا نسخة ثانية من المنطق هنا.
import React from 'react';
import { L } from './leaders.js';

const STAMP = { revoked: 'ملغاة', replaced: 'مستبدلة', sample: 'نموذج' };

// تُفتح النافذة متزامنة مع النقرة، ثم تُكتب الشهادة فيها حين تجهز بياناتها
export async function openCertificate(load, status) {
  const win = window.open('', '_blank');
  if (!win) return alert('اسمح بالنوافذ المنبثقة لعرض الشهادة');
  const snapshot = await load();
  if (!snapshot) return win.close();
  const { writeCertificate } = await import('../../src/lib/brand/certificate.js');
  await writeCertificate(win, snapshot, { status: STAMP[status] });
}

// معاينة نموذج: الإعداد العام (settings) أو جهة (organization_id) مع مسودتها (cert)
export const previewCertificate = (body, onError) => openCertificate(async () => {
  const r = await L('admin.cert-preview', body);
  if (!r.success) { onError?.(r.message); return null; }
  return r.certificate;
}, 'sample');

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
