// ════════════════════════════════════════════════════════════════
// قوالب البريد: كل رسالة كما تصل، مجمّعة بعائلاتها، مع «أرسل نسخة لي»
// ════════════════════════════════════════════════════════════════
// المعاينة من الخادم بالدوال نفسها التي تُرسل (MAIL_GALLERY في core.ts)، فلا نسخة ثانية للقالب هنا.
import React, { useEffect, useMemo, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';

const FAMILY_AR = { access: 'الدخول والأمان', journey: 'الرحلة', capstone: 'مشروع التخرج', sessions: 'الجلسات', organization: 'الجهات', experts: 'شبكة الخبراء', admin: 'تقارير الإدارة', general: 'عامة' };

export default function MailGallery({ canWrite }) {
  const { toast } = useUI();
  const [d, setD] = useState(null);
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { L('admin.mail-gallery').then((r) => { setD(r); if (r.success) setPick(r.mails[0]?.key); }); }, []);
  const groups = useMemo(() => {
    const g = {};
    for (const m of d?.mails || []) (g[m.family] ||= []).push(m);
    return Object.entries(g);
  }, [d]);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err">{d.message}</div>;
  const m = d.mails.find((x) => x.key === pick);
  const send = async () => {
    setBusy(true);
    const r = await L('admin.mail-send-test', { key: m.key });
    setBusy(false);
    toast(r.success ? `أُرسلت نسخة تجريبية إلى ${r.to}` : r.message);
  };
  return (
    <div className="mg">
      <nav className="la-card mg-list" aria-label="القوالب">
        <h3>قوالب البريد <small className="la-muted">· {d.mails.length}</small></h3>
        {groups.map(([fam, list]) => (
          <div key={fam}><h4>{FAMILY_AR[fam] || fam}</h4>
            {list.map((x) => <button key={x.key} className={`mg-item${x.key === pick ? ' on' : ''}`} onClick={() => setPick(x.key)}>{x.label}</button>)}
          </div>
        ))}
      </nav>
      {m && (
        <section className="la-card mg-view">
          <div className="la-row between">
            <div><small className="la-muted">العنوان في صندوق الوارد</small><h3>{m.subject}</h3></div>
            {canWrite && <button className="btn-sm primary" disabled={busy} onClick={send}>{busy ? 'لحظة…' : 'أرسل نسخة لي'}</button>}
          </div>
          <iframe className="mg-frame" title={`معاينة: ${m.label}`} srcDoc={m.html} sandbox="" />
          <p className="la-muted">بيانات تجريبية. الرسالة الحقيقية تُبنى بالدالة نفسها ببيانات المستلم، ومعها نسخة نصية لبرامج البريد التي لا تعرض HTML.</p>
        </section>
      )}
    </div>
  );
}
