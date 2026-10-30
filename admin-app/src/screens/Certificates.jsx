// ════════════════════════════════════════════════════════════════
// شهادات المشاركة: الإعداد العام، والسجل بالإلغاء وإعادة الإصدار
// ════════════════════════════════════════════════════════════════
// الإصدار تلقائي عند «أنهى البرنامج». من هنا: ضبط ما يظهر على الشهادات
// الجديدة، ومعاينتها، وإلغاء شهادة، أو إعادة إصدارها لتصحيح الاسم.
import React, { useCallback, useEffect, useState } from 'react';
import { date, L } from '../leaders.js';
import { Spinner, useEscape, useUI } from '../ui.jsx';
import { openCertificate, previewCertificate, SignatoryChoice } from '../cert.jsx';
import { SITES } from '../../../supabase/functions/_shared/sites.js';

const ST = { valid: ['سارية', 'ok'], revoked: ['ملغاة', 'bad'], replaced: ['مستبدلة', ''] };

// الإعداد العام: يسري على كل الشهادات الجديدة، وما تخصّصه جهة يعلوه لمشاركيها
function SettingsCard({ canWrite }) {
  const { toast } = useUI();
  const [s, setS] = useState(null);
  const [mode, setMode] = useState('none');
  const [extra, setExtra] = useState(0);
  const [auto, setAuto] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    L('admin.cert-settings').then((r) => {
      if (!r.success) return setS({ error: r.message });
      setS(r.settings); setMode(r.settings.signatory ? 'custom' : 'none'); setExtra(r.customized_orgs || 0); setAuto(r.computed_hours || null);
    });
  }, []);
  if (!s) return <section className="la-card"><h3>إعدادات الشهادة</h3><Spinner /></section>;
  if (s.error) return <section className="la-card"><h3>إعدادات الشهادة</h3><div className="la-err">{s.error}</div></section>;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const draft = () => ({ ...s, signatory: mode === 'custom' ? s.signatory || { name: '', title: '' } : null });
  const save = async () => {
    setBusy(true);
    const r = await L('admin.cert-settings-save', { settings: draft() });
    setBusy(false);
    toast(r.success ? 'حُفظت الإعدادات، وتسري على الشهادات الجديدة' : r.message);
    if (r.success) setS(r.settings);
  };
  return (
    <section className="la-card ce-settings">
      <div className="la-row between"><h3>إعدادات الشهادة العامة</h3>
        <label className="of-switch"><input type="checkbox" checked={s.enabled} disabled={!canWrite} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
          <span>{s.enabled ? 'الإصدار التلقائي مفعّل' : 'الإصدار التلقائي متوقف'}</span></label></div>
      <p className="la-muted">تُصدر الشهادة حين تصير حالة المشارك «أنهى البرنامج»، ويُقفل اسمه. هذا الإعداد للجميع، ولكل جهة أن تخصّص ما يختلف من نموذجها{extra ? ` (${extra} جهة مخصّصة الآن)` : ''}. التعديل يسري على الشهادات الجديدة ولا يغيّر ما صدر.</p>
      <fieldset disabled={!canWrite} className="ce-grid">
        <label className="of-field"><span className="of-label">اسم البرنامج</span><input value={s.program_ar} onChange={set('program_ar')} maxLength={200} /></label>
        <label className="of-field"><span className="of-label">اسم البرنامج بالإنجليزية</span><input dir="ltr" value={s.program_en} onChange={set('program_en')} maxLength={200} /></label>
        <label className="of-field"><span className="of-label">الساعات التدريبية</span><input inputMode="numeric" value={s.hours ?? ''} onChange={(e) => setS({ ...s, hours: e.target.value.replace(/\D/g, '') })} placeholder={auto?.hours && !auto.missing?.length ? `تلقائيًا: ${auto.hours}` : 'اختياري'} />
          <small className="la-muted">{auto?.missing?.length ? `لا تُحسب الساعات تلقائيًا حتى تُكتب مدة هذه الأنشطة: ${auto.missing.join('، ')}. حتى ذلك تبقى فارغة على الشهادة ما لم تكتبها هنا.` : auto?.hours ? `فارغ = ${auto.hours} ساعة محسوبة من جلسات البرنامج وأيامه، وتتبعها إن تغيرت.` : 'فارغ = تُحسب من مدد الجلسات والأيام في أنشطة البرنامج.'}</small></label>
      </fieldset>
      <h4 className="ce-sub">الموقّع <small>بجانب ختم Milestone الثابت</small></h4>
      <SignatoryChoice mode={mode} onMode={setMode} value={s.signatory} onChange={(signatory) => setS({ ...s, signatory })} disabled={!canWrite} />
      <div className="la-row">
        {canWrite && <button className="btn-sm primary" onClick={save} disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}</button>}
        <button className="btn-sm ghost" onClick={() => previewCertificate({ settings: draft() }, toast)}>معاينة نموذج</button>
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

export default function Certificates({ canWrite, onPerson, orgs = [] }) {
  const { toast, prompt } = useUI();
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [org, setOrg] = useState('');
  const [reissue, setReissue] = useState(null);
  const load = useCallback(async () => setD(await L('admin.certificates', { ...(filter ? { status: filter } : {}), ...(org ? { organization_id: org } : {}) })), [filter, org]);
  useEffect(() => { load(); }, [load]);

  const open = (c) => openCertificate(async () => {
    const r = await L('admin.certificate', { id: c.id });
    if (!r.success) { toast(r.message); return null; }
    return r.certificate.snapshot;
  }, c.status);
  const revoke = async (c) => {
    const reason = await prompt(`سبب إلغاء شهادة ${c.name_ar}؟ ستظهر صفحة تحققها «ملغاة».`, '', { danger: true, ok: 'إلغاء الشهادة' });
    if (!reason?.trim()) return;
    const r = await L('admin.certificate-revoke', { id: c.id, reason });
    toast(r.success ? 'أُلغيت الشهادة' : r.message);
    if (r.success) load();
  };
  const copy = (c) => { navigator.clipboard?.writeText(`${SITES.leaders}/v/${c.serial}`); toast('نُسخ رابط التحقق'); };

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
            <select value={org} onChange={(e) => setOrg(e.target.value)} aria-label="الجهة">
              <option value="">كل الجهات</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
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
