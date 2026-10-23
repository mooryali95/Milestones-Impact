// ════════════════════════════════════════════════════════════════
// شهادات المشاركة: الإعدادات والموقّعون، والسجل بالإلغاء وإعادة الإصدار
// ════════════════════════════════════════════════════════════════
// الإصدار تلقائي عند «أنهى البرنامج». من هنا: ضبط ما يظهر على الشهادات
// الجديدة، ومعاينتها، وإلغاء شهادة، أو إعادة إصدارها لتصحيح الاسم.
import React, { useCallback, useEffect, useState } from 'react';
import { date, L } from '../leaders.js';
import { Spinner, useEscape, useUI } from '../ui.jsx';

const ST = { valid: ['سارية', 'ok'], revoked: ['ملغاة', 'bad'], replaced: ['مستبدلة', ''] };

async function view(win, snapshot, status) {
  const { writeCertificate } = await import('../../../src/lib/brand/certificate.js');
  const stamp = status === 'revoked' ? 'ملغاة' : status === 'replaced' ? 'مستبدلة' : status === 'sample' ? 'نموذج' : undefined;
  if (!(await writeCertificate(win, snapshot, { status: stamp }))) alert('اسمح بالنوافذ المنبثقة لعرض الشهادة');
}

function Signer({ s, i, onChange, onRemove }) {
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const { processLogo } = await import('../../../src/lib/brand/logo.js');
    const r = await processLogo(f, { maxSide: 600 });
    onChange({ ...s, image: r.dataUrl });
  };
  return (
    <div className="ce-signer">
      <label className="of-field"><span className="of-label">اسم الموقّع {i + 1}</span><input value={s.name} onChange={(e) => onChange({ ...s, name: e.target.value })} maxLength={120} /></label>
      <label className="of-field"><span className="of-label">الصفة</span><input value={s.title} onChange={(e) => onChange({ ...s, title: e.target.value })} maxLength={160} placeholder="مثل: المدير التنفيذي" /></label>
      <div className="ce-sig">
        {s.image ? <img src={s.image} alt={`توقيع ${s.name}`} /> : <small>بلا صورة توقيع</small>}
        <label className="btn-sm ghost">{s.image ? 'استبدال' : 'رفع توقيع'}<input type="file" accept="image/png,image/jpeg" hidden onChange={pick} /></label>
        {s.image && <button type="button" className="btn-sm ghost" onClick={() => onChange({ ...s, image: undefined })}>إزالة الصورة</button>}
        <button type="button" className="btn-sm danger" onClick={onRemove}>حذف الموقّع</button>
      </div>
    </div>
  );
}

function SettingsCard({ canWrite }) {
  const { toast } = useUI();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { L('admin.cert-settings').then((r) => setS(r.success ? r.settings : { error: r.message })); }, []);
  if (!s) return <section className="la-card"><h3>إعدادات الشهادة</h3><Spinner /></section>;
  if (s.error) return <section className="la-card"><h3>إعدادات الشهادة</h3><div className="la-err">{s.error}</div></section>;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const signers = s.signatories || [];
  const setSigner = (i, v) => setS({ ...s, signatories: signers.map((x, j) => (j === i ? v : x)) });
  const save = async () => {
    setBusy(true);
    const r = await L('admin.cert-settings-save', { settings: s });
    setBusy(false);
    toast(r.success ? 'حُفظت الإعدادات، وتسري على الشهادات الجديدة' : r.message);
    if (r.success) setS(r.settings);
  };
  const sample = () => {
    const win = window.open('', '_blank');
    const now = new Date().toISOString();
    view(win, {
      serial: 'MI-LDR-2026-SAMPLE', name_ar: 'اسم المشارك كما في ملفه', name_en: 'Participant Name',
      program_ar: s.program_ar, program_en: s.program_en, track_ar: 'مسار التوازن القيادي', track_en: 'Balanced Leadership Track',
      hours: s.hours, start: now, end: now, issued_at: now, org: null, signatories: signers,
      verify_url: 'https://leaders.sunkvalue.com/v/MI-LDR-2026-SAMPLE',
    }, 'sample');
  };
  return (
    <section className="la-card ce-settings">
      <div className="la-row between"><h3>إعدادات الشهادة</h3>
        <label className="of-switch"><input type="checkbox" checked={s.enabled} disabled={!canWrite} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
          <span>{s.enabled ? 'الإصدار التلقائي مفعّل' : 'الإصدار التلقائي متوقف'}</span></label></div>
      <p className="la-muted">تُصدر الشهادة حين تصير حالة المشارك «أنهى البرنامج»، ويُقفل اسمه. التعديلات هنا تسري على الشهادات الجديدة فقط، ولا تغيّر ما صدر.</p>
      <fieldset disabled={!canWrite} className="ce-grid">
        <label className="of-field"><span className="of-label">اسم البرنامج</span><input value={s.program_ar} onChange={set('program_ar')} maxLength={200} /></label>
        <label className="of-field"><span className="of-label">اسم البرنامج بالإنجليزية</span><input dir="ltr" value={s.program_en} onChange={set('program_en')} maxLength={200} /></label>
        <label className="of-field"><span className="of-label">الساعات التدريبية</span><input inputMode="numeric" value={s.hours ?? ''} onChange={(e) => setS({ ...s, hours: e.target.value.replace(/\D/g, '') })} placeholder="اختياري" /></label>
      </fieldset>
      <h4 className="ce-sub">الموقّعون <small>حتى اثنين</small></h4>
      <fieldset disabled={!canWrite} className="ce-signers">
        {signers.map((x, i) => <Signer key={i} s={x} i={i} onChange={(v) => setSigner(i, v)} onRemove={() => setS({ ...s, signatories: signers.filter((_, j) => j !== i) })} />)}
        {signers.length < 2 && <button type="button" className="btn-sm ghost" onClick={() => setS({ ...s, signatories: [...signers, { name: '', title: '' }] })}>+ إضافة موقّع</button>}
      </fieldset>
      <div className="la-row">
        {canWrite && <button className="btn-sm primary" onClick={save} disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}</button>}
        <button className="btn-sm ghost" onClick={sample}>معاينة نموذج</button>
      </div>
    </section>
  );
}

function Reissue({ c, onClose, onDone }) {
  const [v, setV] = useState({ name_ar: c.name_ar || '', name_en: c.name_en || '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEscape(onClose);
  const go = async (e) => {
    e.preventDefault();
    if (!v.reason.trim()) return setErr('اكتب سبب إعادة الإصدار');
    setBusy(true);
    const r = await L('admin.certificate-reissue', { id: c.id, ...v });
    setBusy(false);
    if (r.success) onDone(r.certificate?.serial); else setErr(r.message);
  };
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="mid-box ce-reissue" role="dialog" aria-modal="true" aria-label="إعادة إصدار الشهادة" onSubmit={go}>
        <p className="mid-msg">إعادة إصدار <span dir="ltr">{c.serial}</span></p>
        <p className="la-muted">تُعلَّم الحالية «مستبدلة» وتشير صفحة تحققها إلى الجديدة، ويصل المشارك بريد بالشهادة الجديدة.</p>
        <label className="of-field"><span className="of-label">الاسم</span><input value={v.name_ar} onChange={(e) => setV({ ...v, name_ar: e.target.value })} /></label>
        <label className="of-field"><span className="of-label">الاسم بالإنجليزية</span><input dir="ltr" value={v.name_en} onChange={(e) => setV({ ...v, name_en: e.target.value })} /></label>
        <label className="of-field"><span className="of-label">السبب *</span><input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="مثل: تصحيح إملاء الاسم" /></label>
        {err && <small className="of-err" role="alert">{err}</small>}
        <div className="mid-act">
          <button className="mid-btn ok" disabled={busy}>{busy ? 'لحظة…' : 'إعادة الإصدار'}</button>
          <button type="button" className="mid-btn" onClick={onClose}>إلغاء</button>
        </div>
      </form>
    </div>
  );
}

export default function Certificates({ canWrite, onPerson }) {
  const { toast, prompt } = useUI();
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [reissue, setReissue] = useState(null);
  const load = useCallback(async () => setD(await L('admin.certificates', filter ? { status: filter } : {})), [filter]);
  useEffect(() => { load(); }, [load]);

  const open = async (c) => {
    const win = window.open('', '_blank');
    const r = await L('admin.certificate', { id: c.id });
    if (!r.success) { win?.close(); return toast(r.message); }
    view(win, r.certificate.snapshot, r.certificate.status);
  };
  const revoke = async (c) => {
    const reason = await prompt(`سبب إلغاء شهادة ${c.name_ar}؟ ستظهر صفحة تحققها «ملغاة».`, '', { danger: true, ok: 'إلغاء الشهادة' });
    if (!reason?.trim()) return;
    const r = await L('admin.certificate-revoke', { id: c.id, reason });
    toast(r.success ? 'أُلغيت الشهادة' : r.message);
    if (r.success) load();
  };
  const copy = (c) => { navigator.clipboard?.writeText(`https://leaders.sunkvalue.com/v/${c.serial}`); toast('نُسخ رابط التحقق'); };

  const s = q.trim().toLowerCase();
  const rows = (d?.certificates || []).filter((c) => !s || [c.serial, c.name_ar, c.name_en, c.org_name].join(' ').toLowerCase().includes(s));
  return (
    <div className="ce">
      <SettingsCard canWrite={canWrite} />
      <section className="la-card">
        <div className="la-row between">
          <h3>الشهادات الصادرة {d?.success && <small className="la-muted">· {d.certificates.length} · {d.checks} عملية تحقق</small>}</h3>
          <div className="la-row">
            <input className="ce-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم أو الجهة" aria-label="بحث في الشهادات" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="الحالة">
              <option value="">كل الحالات</option><option value="valid">سارية</option><option value="revoked">ملغاة</option><option value="replaced">مستبدلة</option>
            </select>
          </div>
        </div>
        {!d ? <Spinner /> : !d.success ? <div className="la-err">{d.message}</div> : !rows.length ? <p className="la-muted">لا شهادات بعد. تصدر تلقائيًا حين تغيّر حالة مشارك إلى «أنهى البرنامج».</p> : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>الرقم</th><th>الاسم</th><th>الجهة</th><th>الإصدار</th><th>الحالة</th><th /></tr></thead>
            <tbody>{rows.map((c) => {
              const [l, t] = ST[c.status] || [c.status, ''];
              return (
                <tr key={c.id}>
                  <td dir="ltr" className="ce-serial">{c.serial}</td>
                  <td><button className="link" onClick={() => onPerson(c.participant_id)}>{c.name_ar}</button>{c.name_en && <small className="la-muted" dir="ltr"> · {c.name_en}</small>}</td>
                  <td>{c.org_name || '·'}</td>
                  <td>{date(c.issued_at)}</td>
                  <td><span className={`la-chip ${t}`} title={c.revoke_reason || ''}>{l}</span></td>
                  <td className="ce-act">
                    <button className="btn-sm ghost" onClick={() => open(c)}>عرض</button>
                    <button className="btn-sm ghost" onClick={() => copy(c)}>رابط التحقق</button>
                    {canWrite && c.status === 'valid' && <>
                      <button className="btn-sm ghost" onClick={() => setReissue(c)}>إعادة إصدار</button>
                      <button className="btn-sm danger" onClick={() => revoke(c)}>إلغاء</button>
                    </>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>
      {reissue && <Reissue c={reissue} onClose={() => setReissue(null)} onDone={(serial) => { setReissue(null); toast(`صدرت الشهادة ${serial || ''}`); load(); }} />}
    </div>
  );
}
