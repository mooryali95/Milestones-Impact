// ════════════════════════════════════════════════════════════════
// نموذج الجهة: أربعة أقسام، تحقق فوري، ومنطقة حذف محمية
// ════════════════════════════════════════════════════════════════
// الحفظ يكتب الجهة ثم منسقها (إن فُعّل حساب الاطلاع) في خطوة واحدة للمدير.
// الحذف لا يتم إلا بعد عرض أثره وكتابة اسم الجهة، والإيقاف هو البديل المقترح.
import React, { useEffect, useMemo, useState } from 'react';
import { domainsOf, inviteUrl, L, orgColor } from '../leaders.js';
import { useEscape, useUI } from '../ui.jsx';

export const SWATCHES = ['#12414E', '#0B272F', '#A97A2E', '#2E7D5B', '#1F5FA8', '#7A3E9D', '#A8322D', '#B26B00', '#4A6A72', '#00897B'];
const HEX = /^#[0-9A-Fa-f]{6}$/;
const CODE = /^[a-z0-9-]{4,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const host = (s) => {
  try { const h = new URL(s.includes('://') ? s : `https://${s}`).hostname.replace(/^www\./, '').toLowerCase(); return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? h : null; } catch { return null; }
};

export function validateOrg(v, coord) {
  const e = {};
  if (!v.name.trim()) e.name = 'اسم الجهة مطلوب';
  else if (v.name.length > 200) e.name = 'الاسم أطول من 200 حرف';
  if (v.short_name.length > 40) e.short_name = '40 حرفًا على الأكثر';
  if (v.seats !== '' && (!Number.isInteger(Number(v.seats)) || Number(v.seats) < 0)) e.seats = 'عدد صحيح موجب';
  if (v.color && !HEX.test(v.color)) e.color = 'لون بصيغة #RRGGBB';
  if (v.invite_code && !CODE.test(v.invite_code)) e.invite_code = 'أحرف إنجليزية صغيرة وأرقام وشرطة، من 4 إلى 40';
  if (coord.enabled) {
    if (!EMAIL.test(coord.email.trim())) e.coord_email = 'بريد صحيح مطلوب لحساب الاطلاع';
  } else if (coord.email && !EMAIL.test(coord.email.trim())) e.coord_email = 'البريد غير صحيح';
  return e;
}

// حقل بعنصر إدخال واحد يُلفّ بـ label فيُربط اسمه به تلقائيًا؛
// والمجموعات (ألوان، نطاقات، عدّاد، مفتاح) تُعلَّم بـ group فتأخذ role=group
function Field({ label, hint, error, children, wide, group }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={`of-field${wide ? ' wide' : ''}${error ? ' bad' : ''}`} {...(group ? { role: 'group', 'aria-label': label.replace(' *', '') } : {})}>
      <span className="of-label">{label}</span>
      {children}
      {error ? <small className="of-err" role="alert">{error}</small> : hint ? <small className="of-hint">{hint}</small> : null}
    </Tag>
  );
}

function Domains({ list, onChange }) {
  const [draft, setDraft] = useState('');
  const [bad, setBad] = useState('');
  const add = () => {
    const parts = draft.split(/[\s,،]+/).filter(Boolean);
    const ok = []; let wrong = '';
    parts.forEach((p) => { const h = host(p); if (h) ok.push(h); else wrong = p; });
    if (ok.length) onChange([...new Set([...list, ...ok])].slice(0, 20));
    setBad(wrong ? `«${wrong}» ليس نطاقًا صحيحًا` : '');
    setDraft(wrong);
  };
  return (
    <>
      <div className="of-chips">
        {list.map((d) => (
          <span key={d} className="of-chip" dir="ltr">{d}<button type="button" aria-label={`حذف ${d}`} onClick={() => onChange(list.filter((x) => x !== d))}>×</button></span>
        ))}
        <input dir="ltr" aria-label="أضف موقعًا" placeholder={list.length ? 'موقع آخر…' : 'mi.example.sa ثم Enter'} value={draft}
          onChange={(e) => setDraft(e.target.value)} onBlur={() => draft && add()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !draft && list.length) onChange(list.slice(0, -1)); }} />
      </div>
      {bad && <small className="of-err" role="alert">{bad}</small>}
    </>
  );
}

function Danger({ org, onDone, onSuspend }) {
  const { toast } = useUI();
  const [impact, setImpact] = useState(null);
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open && !impact) L('admin.org-impact', { id: org.id }).then(setImpact); }, [open, impact, org.id]);
  const blocked = impact?.success && (impact.participants > 0 || impact.reports > 0);
  const remove = async () => {
    const r = await L('admin.delete', { entity: 'organizations', id: org.id });
    if (r.success) { toast('حُذفت الجهة'); onDone('deleted'); } else toast(r.message);
  };
  return (
    <section className="of-danger">
      <div className="of-danger-head">
        <div><b>منطقة الخطر</b><small>الإيقاف يعطّل الرابط وحساب المنسق ويحفظ البيانات. الحذف نهائي.</small></div>
        <div className="la-row">
          {org.status !== 'inactive' && <button type="button" className="btn-sm ghost" onClick={onSuspend}>إيقاف الجهة</button>}
          <button type="button" className="btn-sm danger" aria-expanded={open} onClick={() => setOpen(!open)}>حذف الجهة…</button>
        </div>
      </div>
      {open && (
        <div className="of-danger-body">
          {!impact ? <small>جارٍ حساب الأثر…</small> : blocked ? (
            <p className="of-err">لا يمكن حذفها الآن: لها <b>{impact.participants}</b> مشارك و<b>{impact.reports}</b> تقرير. انقل المشاركين من لوحة الجهة إلى جهة أخرى، أو أوقف الجهة بدل حذفها.</p>
          ) : (
            <>
              <p>لا مشاركين ولا تقارير مرتبطة.{impact.coordinator ? ' سيُحذف حساب المنسق وجلساته.' : ''} اكتب اسم الجهة للتأكيد:</p>
              <input aria-label="اكتب اسم الجهة للتأكيد" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={org.name} />
              <button type="button" className="btn-sm danger" disabled={typed.trim() !== org.name.trim()} onClick={remove}>حذف نهائي</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function OrgForm({ org, coordinator, onClose }) {
  const { toast, confirm } = useUI();
  const initial = useMemo(() => ({
    name: org?.name || '', short_name: org?.short_name || '', sector: org?.sector || '', status: org?.status || 'active',
    color: org?.color || SWATCHES[0], seats: org?.seats ?? '', invite_code: org?.invite_code || '', domains: domainsOf(org), notes: org?.notes || '',
  }), [org]);
  const initialCoord = useMemo(() => ({
    enabled: !!coordinator, email: coordinator?.email || org?.contact_email || '', full_name: coordinator?.full_name || org?.contact_name || '',
    phone: coordinator?.phone || org?.contact_phone || '',
  }), [org, coordinator]);
  const [v, setV] = useState(initial);
  const [coord, setCoord] = useState(initialCoord);
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState('');
  const [showNotes, setShowNotes] = useState(!!initial.notes);

  const errors = validateOrg(v, coord);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial) || JSON.stringify(coord) !== JSON.stringify(initialCoord);
  const err = (k) => (touched[k] || touched.all ? errors[k] : null);
  const set = (k) => (e) => { setV({ ...v, [k]: e.target.value }); setTouched({ ...touched, [k]: true }); };
  const setC = (k) => (e) => { setCoord({ ...coord, [k]: e.target.value }); setTouched({ ...touched, [`coord_${k}`]: true }); };

  const close = async (saved) => {
    if (!saved && dirty && !(await confirm('لديك تعديلات لم تُحفظ. إغلاق دون حفظ؟', { danger: true, ok: 'إغلاق' }))) return;
    onClose(saved);
  };
  useEscape(() => close(false));

  const save = async (e, patch) => {
    e?.preventDefault();
    setTouched({ all: true });
    const next = { ...v, ...patch };
    if (Object.keys(validateOrg(next, coord)).length) return;
    setBusy(true); setServerErr('');
    const row = {
      name: next.name.trim(), short_name: next.short_name.trim() || null, sector: next.sector.trim() || null, status: next.status,
      color: next.color, seats: next.seats === '' ? null : Number(next.seats), domains: next.domains.join(','), notes: next.notes.trim() || null,
      contact_name: coord.full_name.trim() || null, contact_email: coord.email.trim().toLowerCase() || null, contact_phone: coord.phone.trim() || null,
      ...(next.invite_code || !org ? { invite_code: next.invite_code.trim().toLowerCase() || null } : {}),
    };
    const r = await L('admin.save', { entity: 'organizations', row: { ...(org ? { id: org.id } : {}), ...row } });
    if (!r.success) { setBusy(false); return setServerErr(r.message || 'تعذّر الحفظ'); }
    const orgId = org?.id || r.row?.id || r.id;
    let note = 'تم الحفظ';
    if (coord.enabled && orgId) {
      const c = await L('admin.coordinator-save', { organization_id: orgId, email: coord.email, full_name: coord.full_name, phone: coord.phone });
      if (!c.success) { setBusy(false); return setServerErr(`حُفظت الجهة، لكن حساب المنسق لم يُحفظ: ${c.message}`); }
      if (c.invited) note = `تم الحفظ، وأُرسلت الدعوة إلى ${coord.email}`;
    } else if (!coord.enabled && coordinator && orgId) {
      await L('admin.coordinator-remove', { organization_id: orgId });
      note = 'تم الحفظ، وأُلغي حساب المنسق';
    }
    setBusy(false);
    toast(note);
    onClose(true);
  };
  const suspend = async () => {
    if (!(await confirm(`إيقاف ${org.name}؟ يتعطل رابط الدعوة وحساب المنسق، وتبقى البيانات كما هي.`, { ok: 'إيقاف' }))) return;
    await save(null, { status: 'inactive' });
  };

  const preview = inviteUrl({ invite_code: v.invite_code || 'يُولَّد-تلقائيًا' });
  const mark = (v.short_name || v.name || '؟').slice(0, 2);

  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <form className="of" role="dialog" aria-modal="true" aria-label={org ? `جهة: ${org.name}` : 'جهة جديدة'} onSubmit={save} noValidate>
        <header className="of-head">
          <span className="la-org-mark" style={{ '--org': orgColor(v) }}>{mark}</span>
          <div><small>{org ? 'تحرير جهة' : 'جهة جديدة'}</small><h3>{v.name || 'بلا اسم بعد'}</h3></div>
          <button type="button" className="modal-close" aria-label="إغلاق" onClick={() => close(false)}>✕</button>
        </header>

        <div className="of-body">
          <section className="of-sec">
            <h4>بيانات الجهة</h4>
            <div className="of-grid">
              <Field label="اسم الجهة *" error={err('name')} wide><input autoFocus value={v.name} onChange={set('name')} maxLength={200} aria-invalid={!!err('name')} /></Field>
              <Field label="اسم مختصر" hint="يظهر في الشارات والجداول" error={err('short_name')}><input value={v.short_name} onChange={set('short_name')} maxLength={40} /></Field>
              <Field label="القطاع"><input value={v.sector} onChange={set('sector')} placeholder="حكومي، خاص، غير ربحي…" /></Field>
              <Field group label="الحالة" hint={v.status === 'active' ? 'رابط الدعوة وحساب المنسق يعملان' : 'الرابط والحساب معطّلان، والبيانات محفوظة'} wide>
                <label className="of-switch"><input type="checkbox" checked={v.status === 'active'} onChange={(e) => setV({ ...v, status: e.target.checked ? 'active' : 'inactive' })} />
                  <span>{v.status === 'active' ? 'نشطة' : 'موقوفة'}</span></label>
              </Field>
            </div>
          </section>

          <section className="of-sec">
            <h4>الهوية</h4>
            <Field group label="لون الجهة" error={err('color')} wide>
              <div className="of-swatches" role="radiogroup" aria-label="لون الجهة">
                {SWATCHES.map((c) => <button key={c} type="button" role="radio" aria-checked={v.color === c} aria-label={c} className={v.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setV({ ...v, color: c })} />)}
                <label className="of-custom" title="لون مخصص"><input type="color" value={HEX.test(v.color) ? v.color : '#12414E'} onChange={set('color')} aria-label="لون مخصص" /><span dir="ltr">{v.color}</span></label>
              </div>
            </Field>
          </section>

          <section className="of-sec">
            <h4>الدعوة والانتساب</h4>
            <div className="of-grid">
              <Field group label="المقاعد المتعاقد عليها" hint="اتركه فارغًا إن لم يُحدد" error={err('seats')}>
                <div className="of-stepper">
                  <button type="button" aria-label="إنقاص" onClick={() => setV({ ...v, seats: Math.max(0, Number(v.seats || 0) - 1) })}>−</button>
                  <input inputMode="numeric" value={v.seats} onChange={(e) => setV({ ...v, seats: e.target.value.replace(/\D/g, '') })} aria-label="عدد المقاعد" />
                  <button type="button" aria-label="زيادة" onClick={() => setV({ ...v, seats: Number(v.seats || 0) + 1 })}>+</button>
                </div>
              </Field>
              <Field label="رمز رابط الدعوة" hint={org ? 'تغييره يعطّل الرابط القديم' : 'اتركه فارغًا ليُولَّد تلقائيًا'} error={err('invite_code')}>
                <input dir="ltr" value={v.invite_code} onChange={(e) => { setV({ ...v, invite_code: e.target.value.toLowerCase() }); setTouched({ ...touched, invite_code: true }); }} placeholder="مثل moe-2026" />
              </Field>
              <div className="of-link wide"><small>رابط الدعوة</small><code dir="ltr">{preview}</code></div>
              <Field group label="مواقع الجهة" hint="من يصل منها يُنسب للجهة تلقائيًا. اكتب النطاق واضغط Enter." wide>
                <Domains list={v.domains} onChange={(domains) => setV({ ...v, domains })} />
              </Field>
            </div>
          </section>

          <section className="of-sec">
            <h4>منسق الجهة</h4>
            <div className="of-grid">
              <Field label="الاسم"><input value={coord.full_name} onChange={setC('full_name')} /></Field>
              <Field label="البريد" error={err('coord_email')}><input type="email" dir="ltr" value={coord.email} onChange={setC('email')} aria-invalid={!!err('coord_email')} /></Field>
              <Field label="الجوال"><input dir="ltr" inputMode="tel" value={coord.phone} onChange={setC('phone')} /></Field>
              <Field group label="حساب الاطلاع" wide hint={coord.enabled
                ? (coordinator && coordinator.email === coord.email.trim().toLowerCase() ? 'الحساب قائم. تغيير البريد ينقل الوصول وينهي جلسات البريد القديم.' : 'يُنشأ الحساب ويُرسل للمنسق بريد دعوة عند الحفظ.')
                : 'بلا حساب: المنسق جهة اتصال فقط.'}>
                <label className="of-switch"><input type="checkbox" checked={coord.enabled} onChange={(e) => setCoord({ ...coord, enabled: e.target.checked })} />
                  <span>يرى لوحة الجهة وتقاريرها ويصله ملخص أسبوعي</span></label>
              </Field>
            </div>
          </section>

          <section className="of-sec">
            {showNotes ? (
              <Field label="ملاحظات داخلية" hint="لا تظهر للمنسق" wide><textarea rows={3} value={v.notes} onChange={set('notes')} /></Field>
            ) : <button type="button" className="la-link" onClick={() => setShowNotes(true)}>+ ملاحظات داخلية</button>}
          </section>

          {org && <Danger org={org} onDone={onClose} onSuspend={suspend} />}
        </div>

        <footer className="of-foot">
          {serverErr && <div className="la-err" role="alert">{serverErr}</div>}
          <div className="la-row">
            <button className="btn-sm primary" type="submit" disabled={busy || (org && !dirty)}>{busy ? 'جارٍ الحفظ…' : org ? 'حفظ التعديلات' : 'إنشاء الجهة'}</button>
            <button className="btn-sm ghost" type="button" onClick={() => close(false)}>إلغاء</button>
            {dirty && <small className="la-muted">تعديلات غير محفوظة</small>}
          </div>
        </footer>
      </form>
    </div>
  );
}
