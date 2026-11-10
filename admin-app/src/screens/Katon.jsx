// ════════════════════════════════════════════════════════════════
// بنك «كاتون»: المواضيع، وجملها الست بمفاتيحها ومهام الفرق، وتوزيع الأحكام والمواقف، وجدول النقاط الثلاثي
// ════════════════════════════════════════════════════════════════
// البنك المستورد من ملف الأسس يبدأ مسودة: يراجع الأدمن الجمل ويضبط المفاتيح ثم ينشر. لا يُنشر موضوع
// بأقل من جملتين خاطئتين محوّطتين وصحيحة حازمة (حارس الصياغة)، ولا يُحفظ جدول نقاط ليس قاعدة تسجيل سليمة.
import React, { useCallback, useEffect, useState } from 'react';
import { DIM, L } from '../leaders.js';
import Form from '../Form.jsx';
import { Empty, Spinner, useUI } from '../ui.jsx';
import { KATON_KEY_AR, KATON_QUESTION_AR } from '../../../supabase/functions/leaders-api/logic.js';

const STATUS = { draft: 'مسودة', published: 'منشور', archived: 'مؤرشف' };
const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
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
  { name: 'text_ar', label: 'نص الجملة', type: 'textarea', rows: 3, help: 'الخاطئة بلا قرائن إطلاق (وحده، فقط، دائمًا…) حتى لا يُستدل على المفتاح من الصياغة؛ واجعل بعض الصحيحة حازمة.' },
  { name: 'key', label: 'المفتاح', type: 'select', options: KATON_KEY_AR, help: 'صحيحة أو خاطئة يُحكم بها بثقة مدرَّجة (أرجّح/واثق/متيقن). جملة الرأي لا تُسجَّل عليها نقاط.' },
  { name: 'explain_ar', label: 'شرح يظهر بعد كشف المفتاح', type: 'textarea', rows: 2 },
  { name: 't_support', label: 'مهمة فريق الدعم' },
  { name: 't_lead', label: 'مهمة فريق القيادة' },
  { name: 't_guide', label: 'مهمة فريق التوجيه' },
  { name: 't_eval', label: 'مهمة فريق التقييم' },
];
const lines = (a) => (a || []).join('\n');
const CONF_AR = { 1: 'أرجّح', 2: 'واثق', 3: 'متيقن' };

// توزيع جملة في سطر: الأحكام بدرجاتها ثم وسوم الموقف
function distLine(d, stances) {
  const parts = [];
  for (const v of ['true', 'false']) {
    const n = (d[`${v}1`] || 0) + (d[`${v}2`] || 0) + (d[`${v}3`] || 0);
    if (n) parts.push(`${v === 'true' ? '✓' : '✕'} ${n} (${[1, 2, 3].map((c) => `${CONF_AR[c]} ${d[`${v}${c}`] || 0}`).join('، ')})`);
  }
  if (d.none) parts.push(`• بلا حكم ${d.none}`);
  for (const s of stances) if (d[s.key]) parts.push(`${s.glyph} ${s.ar} ${d[s.key]}`);
  return parts.join(' · ');
}

export default function KatonBank({ canWrite, programId }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => setD(await L('admin.katon', programId ? { program_id: programId } : {})), [programId]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err">{d.message}</div>;

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
  // جدول النقاط الثلاثي لكل برنامج: الصواب والخطأ بدرجة الثقة؛ الخادم يرفض ما ليس قاعدة تسجيل سليمة
  const editPoints = () => setForm({
    title: `جدول نقاط «كاتون»${d.program_name ? ` · ${d.program_name}` : ''}`,
    fields: [1, 2, 3].flatMap((c) => [
      { name: `right${c}`, label: `${CONF_AR[c]} وأصاب`, type: 'number', help: c === 1 ? 'الافتراضي Gardner-Medwin: 1/2/3 للصواب و0/−2/−6 للخطأ؛ تقاطعا القيمة المتوقعة عند 67% و80%' : undefined },
      { name: `wrong${c}`, label: `${CONF_AR[c]} وأخطأ`, type: 'number' },
    ]),
    values: Object.fromEntries([1, 2, 3].flatMap((c) => [[`right${c}`, d.points.right[c]], [`wrong${c}`, d.points.wrong[c]]])),
    onSave: (v) => L('admin.katon-points', { program_id: d.program_id, points: { right: { 1: v.right1, 2: v.right2, 3: v.right3 }, wrong: { 1: v.wrong1, 2: v.wrong2, 3: v.wrong3 } } }),
  });
  const publish = async (t, status) => {
    if (status === 'published' && t.issues?.length && !(await confirm(`لن يقبل الخادم النشر حتى تُصلح: ${t.issues.join('؛ ')}. تحاول على حاله؟`))) return;
    const r = await L('admin.katon-topic-save', { row: { id: t.id, title_ar: t.title_ar, dimension: t.dimension, ...t.layers, status } });
    toast(r.success ? STATUS[status] : r.message); if (r.success) load();
  };
  const th = d.points_check?.thresholds;

  return (
    <>
      <p className="la-muted">كل موضوع ست جمل تجيب عن الأسئلة الست (لماذا، ماذا، كيف، ماذا لو، من، متى). المشارك يحكم على كل جملة (صحيحة أو خاطئة) بدرجة ثقة من ثلاث، ويضع وسوم موقفه بلا نقاط، ويُكشف المفتاح بعد إتمامه الموضوع. البنك المستورد من ملف الأسس يبدأ مسودة.</p>
      <div className="la-row between">
        <div className="la-muted">النقاط{d.program_name ? ` (${d.program_name})` : ''}: {[1, 2, 3].map((c) => `${CONF_AR[c]} ${sign(d.points.right[c])}/${sign(d.points.wrong[c])}`).join('  ·  ')}
          {th && <small> · يربح الصدق فوق {Math.round(th.c1_c2 * 100)}% و{Math.round(th.c2_c3 * 100)}%</small>}
          {d.points_check && !d.points_check.ok && <span className="la-chip bad"> ليس قاعدة تسجيل سليمة</span>}
          {canWrite && d.program_id && <> <button className="la-link" onClick={editPoints}>تعديل النقاط</button></>}</div>
        {canWrite && <button className="btn-sm ghost" onClick={() => editTopic()}>+ موضوع</button>}
      </div>
      {!d.topics.length && <Empty title="لا موضوعات بعد" hint="الموضوع جلسة قاعة: جمل يجيب عنها المشاركون ثم يناقشونها. أضف موضوعًا لتفتح به قاعة.">{canWrite && <button className="btn-sm primary" type="button" onClick={() => editTopic()}>+ موضوع</button>}</Empty>}
      {d.topics.map((t) => (
        <section key={t.id} className={`la-card${t.status === 'archived' ? ' off' : ''}`}>
          <div className="la-row between">
            <div><b>{t.title_ar}</b> <span className={`la-chip ${t.status === 'published' ? 'ok' : 'warn'}`}>{STATUS[t.status]}</span>
              <small className="la-muted"> · {t.sentences.length} جمل · {t.sentences.filter((s) => s.key === 'false').length} خاطئة · {t.sentences.reduce((a, s) => a + s.answers, 0)} إجابة{t.source ? ` · ${t.source}` : ''}</small></div>
            <span className="la-row">
              <button className="la-link" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>{open === t.id ? 'إخفاء الجمل' : 'الجمل'}</button>
              {canWrite && <button className="la-link" onClick={() => editTopic(t)}>تحرير</button>}
              {canWrite && t.status !== 'published' && <button className="btn-sm primary" onClick={() => publish(t, 'published')}>نشر</button>}
              {canWrite && t.status === 'published' && <button className="btn-sm ghost" onClick={() => publish(t, 'draft')}>إيقاف</button>}
            </span>
          </div>
          {t.issues?.length > 0 && <ul className="la-flags">{t.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
          {open === t.id && (
            <ol className="la-reqs">
              {t.sentences.map((s) => (
                <li key={s.id}>
                  <span>
                    <span className="la-chip">{KATON_QUESTION_AR[s.question]}</span> <span className={`la-chip ${s.key === 'false' ? 'bad' : s.key === 'true' ? 'ok' : ''}`}>{KATON_KEY_AR[s.key]}</span> {s.text_ar}
                    {s.answers > 0 && <><br /><small className="la-muted">{distLine(s.distribution, d.stances)}</small></>}
                  </span>
                  {canWrite && <button className="la-link" onClick={() => editSent(t, s)}>تحرير</button>}
                </li>
              ))}
              {canWrite && <li><button className="la-link" onClick={() => editSent(t)}>+ جملة</button></li>}
            </ol>
          )}
        </section>
      ))}
      {form && <Form {...form} onClose={(saved) => { setForm(null); if (saved) { toast('تم الحفظ'); load(); } }} />}
    </>
  );
}
