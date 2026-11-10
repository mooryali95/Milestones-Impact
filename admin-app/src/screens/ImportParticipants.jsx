// ════════════════════════════════════════════════════════════════
// استيراد المشاركين دفعة واحدة: لصق من Excel أو ملف CSV، ثم معاينة حال كل صف قبل الإضافة
// ════════════════════════════════════════════════════════════════
// القراءة والتحقق من مصدرهما الواحد (import.js) المستعمل في الخادم نفسه. لا بريد يُرسل عند الاستيراد.
import React, { useMemo, useState } from 'react';
import { L } from '../leaders.js';
import { useEscape } from '../ui.jsx';
import { checkImport, IMPORT_MAX, IMPORT_STATUS_AR, importCounts, parseImport } from '../../../supabase/functions/leaders-api/import.js';

const TONE = { ok: 'ok', created: 'ok', invalid: 'warn', duplicate: 'warn', failed: 'warn', exists: '' };

export default function ImportParticipants({ orgs, onClose }) {
  const [text, setText] = useState('');
  const [org, setOrg] = useState('');
  const [server, setServer] = useState(null);   // رد الخادم: معاينة (dry_run) أو نتيجة الإضافة
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEscape(() => onClose(!!server && !server.dry_run));

  const parsed = useMemo(() => parseImport(text), [text]);
  const local = useMemo(() => checkImport(parsed), [parsed]);
  const rows = server?.rows || local;
  const counts = server?.counts || importCounts(local);
  const done = server && !server.dry_run;
  const edit = (v) => { setText(v); setServer(null); setError(''); };

  const run = async (dry) => {
    setBusy(true); setError('');
    const r = await L('admin.participants-import', { organization_id: org || null, rows: parsed, dry_run: dry });
    setBusy(false);
    if (r.success) setServer(r);
    // الواجهة قد تسبق نشر الخادم: الرسالة تقول ما يحدث بدل «إجراء غير معروف»
    else setError(r.code === 'unknown_action' ? 'الاستيراد يعمل بعد نشر تحديث الخادم. أضف المشاركين واحدًا واحدًا حتى ذلك.' : r.message || 'تعذّر التنفيذ');
  };
  const onFile = async (e) => { const f = e.target.files?.[0]; if (f) edit(await f.text()); };

  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose(done)}>
      <div className="la-form mi-form la-import" role="dialog" aria-modal="true" aria-label="استيراد مشاركين">
        <h3>استيراد مشاركين</h3>
        {!done && (
          <>
            <p className="la-import-hint">الصق الصفوف من Excel أو اختر ملف CSV. لكل صف: الاسم والبريد، ويجوز الجوال والمسمى الوظيفي. الأعمدة تُعرف بمحتواها فلا يهم ترتيبها. الحد {IMPORT_MAX} صفًا.</p>
            <label className="la-import-field"><span>الجهة الراعية</span>
              <select className="filter-select" value={org} onChange={(e) => { setOrg(e.target.value); setServer(null); }}>
                <option value="">بدون جهة</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select></label>
            <label className="la-import-field"><span>الجدول</span>
              <textarea rows={6} dir="auto" value={text} onChange={(e) => edit(e.target.value)} placeholder={'سارة الأحمد\tsara@example.sa\tمديرة مشاريع'} /></label>
            <input type="file" accept=".csv,.txt,text/csv,text/plain" aria-label="ملف CSV" onChange={onFile} />
          </>
        )}
        {done && <p className="la-import-hint" role="status">أُضيف {counts.created || 0} مشاركًا{server.organization ? ` إلى ${server.organization}، وأخذ ${server.seated} منهم مقعدًا` : ''}. لم يُرسل بريد: يدخل كل منهم ببريده من صفحة الدخول، أو شارك معهم رابط الجهة.</p>}
        {rows.length > 0 && (
          <>
            <div className="la-pills" aria-label="ملخص الصفوف">{Object.entries(counts).map(([k, n]) => <span key={k} className={`la-chip ${TONE[k]}`}>{IMPORT_STATUS_AR[k]} {n}</span>)}</div>
            <div className="la-import-table"><table className="la-table">
              <thead><tr><th>الاسم</th><th>البريد</th><th>الجوال</th><th>المسمى</th><th>الحال</th></tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={`${r.email}-${i}`}><td>{r.full_name || '·'}</td><td dir="ltr">{r.email}</td><td dir="ltr">{r.phone || '·'}</td><td>{r.job_title || '·'}</td>
                  <td><span className={`la-chip ${TONE[r.status]}`}>{IMPORT_STATUS_AR[r.status]}</span>{r.reason && <small> {r.reason}</small>}</td></tr>
              ))}</tbody>
            </table></div>
          </>
        )}
        {text.trim() && !parsed.length && <p className="la-err" role="alert">لم أجد صفًا فيه بريد صحيح.</p>}
        {error && <p className="la-err" role="alert">{error}</p>}
        <div className="la-row">
          {!done && !server && <button type="button" className="btn-sm primary" disabled={busy || !parsed.length} onClick={() => run(true)}>تحقق من المسجلين</button>}
          {!done && server?.dry_run && <button type="button" className="btn-sm primary" disabled={busy || !(counts.ok > 0)} onClick={() => run(false)}>أضف {counts.ok || 0} مشاركًا</button>}
          <button type="button" className="btn-sm ghost" onClick={() => onClose(done)}>{done ? 'تم' : 'إلغاء'}</button>
        </div>
      </div>
    </div>
  );
}
