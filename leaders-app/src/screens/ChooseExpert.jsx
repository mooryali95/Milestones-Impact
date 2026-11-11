// ════════════════════════════════════════════════════════════════
// اطلب استشارة: متى احتاجها المشارك، خلال البرنامج أو أثناء بناء المبادرة أو تنفيذها
// ════════════════════════════════════════════════════════════════
// يختار نوع الدعم والإطار ويصف حاجته، فيرشّح محرك المطابقة ثلاثة خبراء.
// يرى الاسم والنبذة والتقييم (إن بلغ حدّه) فقط؛ التكلفة والساعات للإدارة.
// الاختيار يُعرض على الخبير مع وصف الحاجة، فإن اعتذر انتقل للتالي آليًا.
// الأدوار والمواضع والحالات كلها من الخادم (labels.js).
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { CONTACT_EMAIL } from '../../../supabase/functions/leaders-api/labels.js';

export default function ChooseExpert({ context = 'program', note: presetNote = '', dimension: presetDim = '', title = 'اطلب استشارة', open: startOpen = false }) {
  const [d, setD] = useState(null);
  const [form, setForm] = useState({ role: 'coach', dimension: presetDim, context, note: presetNote });
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const load = (f = form) => call('experts.suggest', { role: f.role, dimension: f.dimension || null }).then(setD);
  useEffect(() => { load(); }, [form.role, form.dimension]);
  useEffect(() => { setForm((f) => ({ ...f, note: presetNote || f.note })); }, [presetNote]);
  if (!d?.success || !Array.isArray(d.roles) || !Array.isArray(d.requests)) return null;

  const choose = async (e) => {
    setBusy(e.id); setMsg(null);
    const r = await call('experts.choose', { ...form, dimension: form.dimension || null, expert_id: e.id });
    setBusy('');
    // ما يحدث فعلًا بعد الاختيار: إن اعتذر الخبير أو انقضت مهلته عُرض الطلب على التالي، وحالته تبقى هنا
    if (r.success) { setMsg({ ok: `أرسلنا طلبك إلى ${r.expert} مع ما كتبته. يصلك بريد حين يقبله خبير، وإن اعتذر عرضناه على التالي الأنسب. تابع حالته هنا.` }); setOpen(false); load(); } else setMsg({ err: r.message });
  };
  const busyRole = d.requests.find((x) => x.role === form.role);
  // طلبات انتهت بلا خدمة مؤخرًا («لا خبير مطابق» أو ألغاها الفريق): تبقى ظاهرة بسببها، ولا تحجز الدور
  const ended = Array.isArray(d.recent) ? d.recent : [];

  return (
    <section className="card stack rx" aria-labelledby="cx-h">
      <div className="row between">
        <h2 id="cx-h" className="as-h3">{title}</h2>
        {!open && <button className="btn ghost sm" onClick={() => setOpen(true)}>اطلب الآن</button>}
      </div>
      {d.requests.length + ended.length > 0 && (
        <ul className="cx-live">
          {[...d.requests, ...ended].map((x) => (
            <li key={x.id} data-request={x.status}><b>{x.role_ar}</b>{x.dimension ? ` · ${d.dimensions[x.dimension]}` : ''}{x.expert ? <> · {x.expert}{x.title ? ` (${x.title})` : ''}</> : ''} · <span className={`chip${ended.includes(x) ? ' warn' : ''}`}>{x.status_ar}</span>
              {x.note && <small className="muted"> {x.note}</small>}
              {x.hint && <small className="muted cx-hint">{x.hint}</small>}</li>
          ))}
        </ul>
      )}
      {msg?.ok && <div className="banner"><span className="ico">✓</span><div className="grow">{msg.ok}</div></div>}

      {open && (
        <div className="stack">
          <div className="cx-form">
            <label className="field"><span>نوع الدعم</span>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {d.roles.map((r) => <option key={r.key} value={r.key}>{r.title}: {r.hint}</option>)}
              </select></label>
            <label className="field"><span>الإطار</span>
              <select className="input" value={form.dimension} onChange={(e) => setForm({ ...form, dimension: e.target.value })}>
                <option value="">أي إطار</option>
                {Object.entries(d.dimensions).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select></label>
            <label className="field"><span>متى</span>
              <select className="input" value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })}>
                {Object.entries(d.contexts).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select></label>
          </div>
          <label className="field"><span>ما الذي تحتاجه؟ <em>(يصل إلى الخبير مع الطلب)</em></span>
            <textarea className="input" rows={3} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="مثال: أحتاج مراجعة سجل المخاطر قبل عرضه على الراعي" /></label>

          {busyRole ? (
            <p className="small muted">لديك طلب {busyRole.role_ar} قائم ({busyRole.status_ar}). {busyRole.hint || ''} اختر نوع دعم آخر في الأثناء إن احتجت.</p>
          ) : d.candidates.length ? (
            <>
              <p className="small muted">أنسب 3 خبراء لطلبك ومستواك.</p>
              <div className="cx-grid">
                {d.candidates.map((e) => (
                  <article key={e.id} className="cx-card stack">
                    <b>{e.full_name}</b>
                    {e.team && <span className="chip ok cx-team">من فريق دفعتك</span>}
                    {e.title && <small className="muted">{e.title}{e.years ? ` · ${e.years} سنة خبرة` : ''}</small>}
                    {e.bio && <p className="small">{e.bio}</p>}
                    {/* غياب التقييم المعلن لا يدل على حداثة الخبير، فلا يُقال عنه ما لا نعرفه (تصور 360، المرحلة 0) */}
                    {e.rating && <small>★ {e.rating.avg} ({e.rating.count} تقييم)</small>}
                    <button className="btn sm" disabled={!!busy || !form.note.trim()} onClick={() => choose(e)}>{busy === e.id ? 'لحظة…' : 'اختره'}</button>
                  </article>
                ))}
              </div>
              {!form.note.trim() && <small className="muted">اكتب ما تحتاجه أولًا ليعرف الخبير كيف يستعد.</small>}
            </>
          ) : (
            <p className="small muted">لا خبير متاح الآن لهذا النوع من الدعم. جرّب نوعًا آخر، أو راسل <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
          )}
          {msg?.err && <div className="alert err small">{msg.err}</div>}
          <div className="row"><button className="btn ghost sm" onClick={() => { setOpen(false); setMsg(null); }}>إغلاق</button></div>
        </div>
      )}
    </section>
  );
}
