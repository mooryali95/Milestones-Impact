// ════════════════════════════════════════════════════════════════
// وثيقة مبادرة مشاركة برابط خاص: leaders.sunkvalue.com/i?t=<الرمز>
// ════════════════════════════════════════════════════════════════
// صفحة مفتوحة بلا حساب. تعرض الوثيقة بتصميمها كاملة داخل الصفحة، وتتيح ما سمح به صاحبها في هذا الرابط وحده:
// تحميل PDF (pdf.js)، وكتابة ملاحظة تصله هو فقط. لا يرى القارئ ملاحظات غيره، ولا تقييم المستشار، ولا أي بريد (share.js publicDoc).
// التصور: docs/content/2026-11-15-تصور-تصدير-المبادرة-ومشاركتها-v1.md
import React, { useEffect, useRef, useState } from 'react';
import { call } from '../api.js';
import { linkToken } from '../link-token.js';
import { dateAr } from '../../../supabase/functions/leaders-api/capstone.js';

// الوثيقة في إطار بارتفاع محتواها: يعزل تنسيقها عن الصفحة، ولا تمرير داخل تمرير
function DocFrame({ html }) {
  const ref = useRef(null);
  const fit = () => { const f = ref.current; const h = f?.contentDocument?.documentElement?.scrollHeight; if (h) f.style.height = `${h + 8}px`; };
  useEffect(() => {
    const f = ref.current;
    if (!f) return undefined;
    const t = setInterval(fit, 800);
    const stop = setTimeout(() => clearInterval(t), 8000);
    window.addEventListener('resize', fit);
    return () => { clearInterval(t); clearTimeout(stop); window.removeEventListener('resize', fit); };
  }, [html]);
  return <iframe ref={ref} className="si-frame" title="وثيقة المبادرة" srcDoc={html} onLoad={fit} />;
}

function NoteForm({ t, sections, owner, onSent }) {
  const [f, setF] = useState({ name: '', role: '', section: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await call('share.note', { t, ...f });
    setBusy(false);
    if (!r.success) return setErr(r.message);
    onSent();
  };
  return (
    <form className="si-note" onSubmit={send} aria-labelledby="si-note-h">
      <h2 id="si-note-h">ملاحظة إلى {owner}</h2>
      <p className="small muted">تصله وحده، ولا يراها أحد غيره. اكتب ما يقوّي المبادرة: سؤال، أو تحفّظ، أو فرصة رأيتها.</p>
      <div className="grid2">
        <label className="field"><span>اسمك</span><input className="input" required minLength={2} maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
        <label className="field"><span>صفتك <em>(اختياري)</em></span><input className="input" maxLength={80} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="مثل: مدير الإدارة" autoComplete="organization-title" /></label>
      </div>
      <label className="field"><span>عن أي جزء؟ <em>(اختياري)</em></span>
        <select className="input" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}>
          <option value="">الوثيقة عامة</option>
          {sections.map((s, i) => <option key={s.key} value={s.key}>{i + 1}. {s.title}</option>)}
        </select></label>
      <label className="field"><span>ملاحظتك</span><textarea className="input" required minLength={2} maxLength={2000} rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
      {err && <div className="alert err" role="alert">{err}</div>}
      <button className="btn gold" disabled={busy}>{busy ? 'لحظة…' : 'أرسل الملاحظة'}</button>
    </form>
  );
}

export default function SharedInitiative() {
  const [t] = useState(() => linkToken());
  const [data, setData] = useState(null);
  const [html, setHtml] = useState('');
  const [report, setReport] = useState(null);
  const [pdf, setPdf] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!t) { setData({ success: false, message: 'الرابط غير صالح' }); return; }
    call('share.get', { t }).then(async (r) => {
      setData(r);
      if (!r.success) return;
      const [{ capstoneReport }, { documentHtml }] = await Promise.all([import('../../../src/lib/brand/capstone.js'), import('../../../src/lib/brand/doc.js')]);
      const rep = capstoneReport(r.doc);
      // علامة المشاركة في الوثيقة نفسها وفي ملفها: من شاركها، وحتى متى
      const meta = { ...rep.meta, pdfName: rep.meta.pdfName, confidential: `نسخة شاركها ${r.owner} برابط خاص صالح حتى ${dateAr(r.expires_at.slice(0, 10))}` };
      setReport({ meta, body: rep.body });
      setHtml(documentHtml(meta, rep.body, { embed: true }));
    });
  }, [t]);

  if (!data) return <div className="center-load"><div className="spinner" /></div>;
  if (!data.success) {
    return (
      <div className="page narrow">
        <div className="card stack si-closed">
          <h1 className="as-h2">الرابط غير متاح</h1>
          <p>{data.message}</p>
          <p className="small muted">روابط المشاركة خاصة ومؤقتة، ويملك صاحب الوثيقة إلغاءها متى شاء.</p>
        </div>
      </div>
    );
  }
  const m = data.doc?.meta || {};
  const download = async () => {
    if (!report || pdf) return;
    setPdf('لحظة…');
    try {
      const { downloadPdf } = await import('../../../src/lib/brand/pdf.js');
      await downloadPdf(report.meta, report.body, { onProgress: setPdf });
    } catch (e) { console.error(e); }
    setPdf('');
  };
  return (
    <div className="page si">
      <header className="si-hero">
        <div className="grow">
          <span className="book-eyebrow">وثيقة مبادرة · مشاركة خاصة</span>
          <h1>{m.initiative || 'وثيقة المبادرة'}</h1>
          <p>شاركك <b>{data.owner}</b> وثيقة مبادرته{m.org?.name ? ` في ${m.org.name}` : ''}. الرابط خاص بك وصالح حتى {dateAr(data.expires_at.slice(0, 10))}.</p>
        </div>
        <div className="si-acts">
          {data.allow_download && <button type="button" className="btn gold" onClick={download} disabled={!report || !!pdf} aria-live="polite">{pdf || 'تحميل PDF'}</button>}
          {data.allow_notes && !sent && <button type="button" className="btn ghost" onClick={() => { setNoteOpen(true); requestAnimationFrame(() => document.getElementById('si-note-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>اكتب ملاحظة لصاحبها</button>}
        </div>
      </header>
      {data.allow_notes && (sent
        ? <div className="card si-thanks" role="status"><b>وصلت ملاحظتك إلى {data.owner}.</b><span className="muted small"> شكرًا لك. لا يراها أحد غيره.</span></div>
        : noteOpen && <div className="card"><NoteForm t={t} sections={data.sections || []} owner={data.owner} onSent={() => { setSent(true); setNoteOpen(false); }} /></div>)}
      {html ? <DocFrame html={html} /> : <div className="center-load"><div className="spinner" /></div>}
      <p className="small muted si-foot">وثيقة من برنامج القادة في Milestone Impact. لا تُنشر ولا تُعاد مشاركتها دون إذن صاحبها.</p>
    </div>
  );
}
