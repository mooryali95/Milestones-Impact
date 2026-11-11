// ════════════════════════════════════════════════════════════════
// شهادات المشاركة: الإعداد العام، والسجل بالإلغاء وإعادة الإصدار
// ════════════════════════════════════════════════════════════════
// الإصدار تلقائي باعتماد التقييم الختامي بنجاح وتأكيد المشارك اسمه (D05 و7.3). من هنا: ضبط ما يظهر على الشهادات
// الجديدة، ومعاينتها، وإلغاء شهادة، أو إعادة إصدارها لتصحيح الاسم.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { date, L } from '../leaders.js';
import { Spinner, useEscape, useGuardedClose, useUI } from '../ui.jsx';
import { CertPreview, openCertificate, SignatoryChoice } from '../cert.jsx';
import FilterBar, { useFilters } from '../FilterBar.jsx';
import { applyFilters, presetCounts } from '../filters.js';
import { SITES } from '../../../supabase/functions/_shared/sites.js';

const ST = { valid: ['سارية', 'ok'], suspended: ['معلّقة', 'warn'], revoked: ['ملغاة', 'bad'], replaced: ['مستبدلة', ''] };

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
      <div className="la-row between"><div><h3>نموذج الشهادة العام</h3><small className="la-muted">يسري على كل الشهادات الجديدة، وما تخصّصه جهة يعلوه لمشاركيها</small></div>
        <label className="of-switch"><input type="checkbox" checked={s.enabled} disabled={!canWrite} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
          <span>{s.enabled ? 'الإصدار التلقائي مفعّل' : 'الإصدار التلقائي متوقف'}</span></label></div>
      <div className="ce-split">
      <div className="ce-form">
      <ol className="ce-how">
        {/* النص يطابق الخادم (certificates.ts: onFinalApproved): كان يقول إنها تصدر بتغيير الحالة، وهي لا تصدر به (البند 9.2) */}
        <li>تُصدر تلقائيًا حين يُعتمد التقييم الختامي بقرار «اجتاز» أو «اجتاز بملاحظات»، ويؤكد المشارك اسمه كما سيُطبع، ثم يُقفل الاسم. تغيير الحالة يدويًا لا يصدر شهادة.</li>
        <li>التعديل هنا يسري على الشهادات الجديدة، ولا يغيّر ما صدر.</li>
        <li>لكل جهة أن تخصّص ما يختلف من نموذجها{extra ? ` (${extra} جهة مخصّصة الآن)` : ''}.</li>
      </ol>
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
      </div>
      </div>
      <CertPreview body={{ settings: draft() }} label="معاينة نموذج الشهادة" />
      </div>
    </section>
  );
}

function Reissue({ c, onClose, onDone }) {
  const [start] = useState(() => ({ name_ar: c.name_ar || '', name_en: c.name_en || '', reason: '' }));
  const [v, setV] = useState(start);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // صندوقها .mid-box مثل نافذة التأكيد، فكان شرط Esc القديم يتجاهلها؛ Esc الآن للعليا وحدها (ui.jsx)
  const close = useGuardedClose(JSON.stringify(v) !== JSON.stringify(start), () => onClose());
  useEscape(close);
  const go = async (e) => {
    e.preventDefault();
    if (!v.reason.trim()) return setErr('اكتب سبب إعادة الإصدار');
    setBusy(true);
    const r = await L('admin.certificate-reissue', { id: c.id, ...v });
    setBusy(false);
    if (r.success) onDone(r.certificate?.serial); else setErr(r.message);
  };
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="mid-box ce-reissue" role="dialog" aria-modal="true" aria-label="إعادة إصدار الشهادة" onSubmit={go}>
        <p className="mid-msg">إعادة إصدار <span dir="ltr">{c.serial}</span></p>
        <p className="la-muted">تُعلَّم الحالية «مستبدلة» وتشير صفحة تحققها إلى الجديدة، ويصل المشارك بريد بالشهادة الجديدة.</p>
        <label className="of-field"><span className="of-label">الاسم</span><input value={v.name_ar} onChange={(e) => setV({ ...v, name_ar: e.target.value })} /></label>
        <label className="of-field"><span className="of-label">الاسم بالإنجليزية</span><input dir="ltr" value={v.name_en} onChange={(e) => setV({ ...v, name_en: e.target.value })} /></label>
        <label className="of-field"><span className="of-label">السبب *</span><input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="مثل: تصحيح إملاء الاسم" /></label>
        {err && <small className="of-err" role="alert">{err}</small>}
        <div className="mid-act">
          <button className="mid-btn ok" disabled={busy}>{busy ? 'لحظة…' : 'إعادة الإصدار'}</button>
          <button type="button" className="mid-btn" onClick={close}>إلغاء</button>
        </div>
      </form>
    </div>
  );
}

export default function Certificates({ canWrite, onPerson, orgs = [] }) {
  const { toast, prompt } = useUI();
  const [d, setD] = useState(null);
  const [reissue, setReissue] = useState(null);
  const [f, setF, clearF, replaceF] = useFilters(['q', 'view', 'org', 'issued']);
  const load = useCallback(async () => setD(await L('admin.certificates', {})), []);
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

  const all = d?.certificates || [];
  const fields = useMemo(() => [
    { key: 'org', label: 'الجهات', get: (c) => c.organization_id || orgs.find((o) => o.name === c.org_name)?.id || 'none', options: [...orgs.map((o) => [o.id, o.name]), ['none', 'بدون جهة']] },
    { key: 'issued', label: 'الإصدار', all: 'أي تاريخ إصدار', type: 'period', get: (c) => c.issued_at },
  ], [orgs]);
  const presets = useMemo(() => Object.entries(ST).map(([k, [l]]) => ({ key: k, label: l, test: (c) => c.status === k })), []);
  const rows = useMemo(() => applyFilters(all, { fields, presets, text: (c) => [c.serial, c.name_ar, c.name_en, c.org_name].join(' ') }, f), [all, f, fields, presets]);
  const counts = useMemo(() => presetCounts(all, presets), [all, presets]);
  return (
    <div className="ce">
      <div className="stats-grid ce-kpis">
        <div className="stat-card"><div className="stat-label">الشهادات الصادرة</div><div className="stat-value">{d?.success ? all.length : '·'}</div><div className="stat-sub">منذ بدء البرنامج</div></div>
        <div className="stat-card"><div className="stat-label">سارية</div><div className="stat-value s-replied">{counts.valid ?? '·'}</div><div className="stat-sub">صالحة للتحقق</div></div>
        <div className="stat-card"><div className="stat-label">ملغاة أو مستبدلة</div><div className="stat-value">{d?.success ? (counts.revoked || 0) + (counts.replaced || 0) : '·'}</div><div className="stat-sub">بسبب مسجّل</div></div>
        <div className="stat-card"><div className="stat-label">عمليات التحقق</div><div className="stat-value">{d?.success ? d.checks : '·'}</div><div className="stat-sub">من صفحة التحقق العامة</div></div>
      </div>
      <SettingsCard canWrite={canWrite} />
      <section className="la-card">
        <h3>سجل الشهادات</h3>
        {!d ? <Spinner /> : !d.success ? <div className="la-err">{d.message}</div> : !all.length ? <p className="la-muted ce-empty">لا شهادات بعد. تصدر تلقائيًا باعتماد التقييم الختامي بنجاح وتأكيد المشارك اسمه، وتظهر هنا مع رابط تحقق لكل منها.</p> : <>
        <FilterBar scope="certs" state={f} set={setF} clear={clearF} replace={replaceF} fields={fields} presets={presets} counts={counts}
          shown={rows.length} total={all.length} noun="شهادة" placeholder="ابحث بالاسم أو الرقم أو الجهة" />
        {!rows.length ? <p className="la-muted">لا نتائج لهذه الفلاتر.</p> : (
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
        )}</>}
      </section>
      {reissue && <Reissue c={reissue} onClose={() => setReissue(null)} onDone={(serial) => { setReissue(null); toast(`صدرت الشهادة ${serial || ''}`); load(); }} />}
    </div>
  );
}
