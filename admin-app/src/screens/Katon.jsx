// ════════════════════════════════════════════════════════════════
// بنك «كاتون»: المواضيع، وجملها الست بمفاتيحها ومهام الفرق، وتوزيع الإجابات
// ════════════════════════════════════════════════════════════════
// البنك المستورد من ملف الأسس يبدأ مسودة: يراجع الأدمن الجمل ويضبط المفاتيح ثم ينشر.
import React, { useCallback, useEffect, useState } from 'react';
import { DIM, L } from '../leaders.js';
import Form from '../Form.jsx';
import { Spinner, useUI } from '../ui.jsx';
import { KATON_KEY_AR, KATON_QUESTION_AR } from '../../../supabase/functions/leaders-api/logic.js';

const STATUS = { draft: 'مسودة', published: 'منشور', archived: 'مؤرشف' };
const topicFields = [
  { name: 'title_ar', label: 'عنوان الموضوع' },
  { name: 'dimension', label: 'الإطار', type: 'select', options: DIM, empty: 'كل الأطر' },
  { name: 'competencies', label: 'الجدارات (سطر لكل جدارة)', type: 'textarea', rows: 3 },
  { name: 'principles', label: 'المبادئ (من 4 إلى 6، سطر لكل مبدأ)', type: 'textarea', rows: 3 },
  { name: 'assumptions', label: 'الافتراضات (سطر لكل افتراض)', type: 'textarea', rows: 3 },
  { name: 'logic', label: 'المنطق', type: 'textarea', rows: 2 },
  { name: 'status', label: 'الحالة', type: 'select', options: STATUS },
];
const sentFields = [
  { name: 'question', label: 'السؤال الذي تجيب عنه', type: 'select', options: KATON_QUESTION_AR },
  { name: 'text_ar', label: 'نص الجملة', type: 'textarea', rows: 3 },
  { name: 'key', label: 'المفتاح', type: 'select', options: KATON_KEY_AR, help: 'صحيحة أو خاطئة يُحكم بها على اليقين (±). جملة الرأي لا يُكسب فيها يقين ولا يُخسر.' },
  { name: 'explain_ar', label: 'شرح يظهر بعد كشف المفتاح', type: 'textarea', rows: 2 },
  { name: 't_support', label: 'مهمة فريق الدعم' },
  { name: 't_lead', label: 'مهمة فريق القيادة' },
  { name: 't_guide', label: 'مهمة فريق التوجيه' },
  { name: 't_eval', label: 'مهمة فريق التقييم' },
];
const lines = (a) => (a || []).join('\n');

export default function KatonBank({ canWrite, programId }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => setD(await L('admin.katon', programId ? { program_id: programId } : {})), [programId]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err">{d.message}</div>;
  const opt = Object.fromEntries(d.options.map((o) => [o.key, o]));

  const editTopic = (t = {}) => setForm({
    title: t.id ? `موضوع: ${t.title_ar}` : 'موضوع جديد', fields: topicFields,
    values: { ...t, competencies: lines(t.layers?.competencies), principles: lines(t.layers?.principles), assumptions: lines(t.layers?.assumptions), logic: t.layers?.logic || '', status: t.status || 'draft' },
    onSave: (v) => L('admin.katon-topic-save', { row: { ...v, id: t.id } }),
  });
  const editSent = (topic, s = {}) => setForm({
    title: s.id ? 'تحرير جملة' : `جملة جديدة في «${topic.title_ar}»`, fields: sentFields,
    values: { question: s.question || 'what', text_ar: s.text_ar || '', key: s.key || 'true', explain_ar: s.explain_ar || '',
      t_support: s.tasks?.support || '', t_lead: s.tasks?.lead || '', t_guide: s.tasks?.guide || '', t_eval: s.tasks?.eval || '' },
    onSave: (v) => L('admin.katon-sentence-save', { row: { id: s.id, topic_id: topic.id, question: v.question, text_ar: v.text_ar, key: v.key, explain_ar: v.explain_ar,
      tasks: { support: v.t_support, lead: v.t_lead, guide: v.t_guide, eval: v.t_eval } } }),
    onDelete: s.id ? () => L('admin.katon-sentence-delete', { id: s.id }) : undefined,
  });
  // جدول النقاط «يعدّله الأدمن» (قرار المالك في التصور المعتمد): لكل برنامج، من 0 إلى 20 لكل خيار
  const editPoints = () => setForm({
    title: `جدول نقاط «كاتون»${d.program_name ? ` · ${d.program_name}` : ''}`,
    fields: d.options.map((o) => ({ name: o.key, label: `${o.glyph} ${o.ar}`, type: 'number', help: o.key === 'true' || o.key === 'false' ? 'تُكسب إن وافق المفتاح وتُخصم إن خالفه' : undefined })),
    values: { ...d.points },
    onSave: (v) => L('admin.katon-points', { program_id: d.program_id, points: Object.fromEntries(d.options.map((o) => [o.key, Number(v[o.key] ?? d.points[o.key])])) }),
  });
  const publish = async (t, status) => {
    if (status === 'published' && t.sentences.some((s) => s.key === 'true') && t.sentences.every((s) => s.key === 'true')
      && !(await confirm('كل جمل هذا الموضوع مفتاحها «صحيحة»، فاليقين بالصحة يكسب دائمًا. أضف جملًا خاطئة لتقيس دقة التحليل فعلًا. تنشر على حاله؟'))) return;
    const r = await L('admin.katon-topic-save', { row: { id: t.id, title_ar: t.title_ar, dimension: t.dimension, ...t.layers, status } });
    toast(r.success ? STATUS[status] : r.message); if (r.success) load();
  };

  return (
    <>
      <p className="la-muted">كل موضوع ست جمل تجيب عن الأسئلة الست (لماذا، ماذا، كيف، ماذا لو، من، متى). المشارك يختار لكل جملة أحد الخيارات الثمانية، ويُكشف المفتاح بعد إتمامه الموضوع. البنك المستورد من ملف الأسس يبدأ مسودة.</p>
      <div className="la-row between">
        <div className="la-muted">النقاط{d.program_name ? ` (${d.program_name})` : ''}: {d.options.map((o) => `${o.glyph} ${o.key === 'true' || o.key === 'false' ? '±' : '+'}${d.points[o.key]}`).join('  ·  ')}
          {canWrite && d.program_id && <> <button className="la-link" onClick={editPoints}>تعديل النقاط</button></>}</div>
        {canWrite && <button className="btn-sm ghost" onClick={() => editTopic()}>+ موضوع</button>}
      </div>
      {d.topics.map((t) => {
        const allTrue = t.sentences.length > 0 && t.sentences.every((s) => s.key === 'true');
        return (
          <section key={t.id} className={`la-card${t.status === 'archived' ? ' off' : ''}`}>
            <div className="la-row between">
              <div><b>{t.title_ar}</b> <span className={`la-chip ${t.status === 'published' ? 'ok' : 'warn'}`}>{STATUS[t.status]}</span>
                <small className="la-muted"> · {t.sentences.length} جمل · {t.sentences.reduce((a, s) => a + s.answers, 0)} إجابة{t.source ? ` · ${t.source}` : ''}</small></div>
              <span className="la-row">
                <button className="la-link" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>{open === t.id ? 'إخفاء الجمل' : 'الجمل'}</button>
                {canWrite && <button className="la-link" onClick={() => editTopic(t)}>تحرير</button>}
                {canWrite && t.status !== 'published' && <button className="btn-sm primary" onClick={() => publish(t, 'published')}>نشر</button>}
                {canWrite && t.status === 'published' && <button className="btn-sm ghost" onClick={() => publish(t, 'draft')}>إيقاف</button>}
              </span>
            </div>
            {allTrue && <p className="la-muted">⚠ كل الجمل مفتاحها «صحيحة»؛ اجعل بعضها خاطئة (حرّف جملة عمدًا) ليقيس اليقين دقة التحليل.</p>}
            {open === t.id && (
              <ol className="la-reqs">
                {t.sentences.map((s) => (
                  <li key={s.id}>
                    <span>
                      <span className="la-chip">{KATON_QUESTION_AR[s.question]}</span> <span className={`la-chip ${s.key === 'false' ? 'bad' : s.key === 'true' ? 'ok' : ''}`}>{KATON_KEY_AR[s.key]}</span> {s.text_ar}
                      {s.answers > 0 && <><br /><small className="la-muted">{Object.entries(s.distribution).filter(([, n]) => n).map(([k, n]) => `${opt[k].glyph} ${opt[k].ar}: ${n}`).join(' · ')}</small></>}
                    </span>
                    {canWrite && <button className="la-link" onClick={() => editSent(t, s)}>تحرير</button>}
                  </li>
                ))}
                {canWrite && <li><button className="la-link" onClick={() => editSent(t)}>+ جملة</button></li>}
              </ol>
            )}
          </section>
        );
      })}
      {form && <Form {...form} onClose={(saved) => { setForm(null); if (saved) { toast('تم الحفظ'); load(); } }} />}
    </>
  );
}
