// ════════════════════════════════════════════════════════════════
// «إجابات القياس» في ملف المشارك: لوحة جانبية من بطاقة المستوى (المدير ذو الكتابة وحده)
// ════════════════════════════════════════════════════════════════
// (تصور بطاقة المستوى وإجابات القياس، المرحلة 2، قرار المالك 2026-11-11)
// تُحمَّل عند الطلب لا مع الملف، فيُسجَّل كل فتح في السجل على الخادم. العرض من src/lib/AnswersPanel.jsx
// المشترك مع بوابة الخبير، والتصدير هنا وحده (للمدير) بالزر الموحد نفسه (ExportButton). التركيز وحبسه من useModalFocus، وEsc من useEscape.
import React, { useCallback, useEffect, useState } from 'react';
import AnswersPanel from '../../../src/lib/AnswersPanel.jsx';
import { reviewCsvRows } from '../../../supabase/functions/leaders-api/answer-review.js';
import { DIM_EN, L } from '../leaders.js';
import { ExportDialog } from '../ExportButton.jsx';
import { useEscape } from '../ui.jsx';

export default function AssessmentAnswers({ participant, dim, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async (assessmentId) => {
    setError('');
    const r = await L('admin.assessment-answers', { participant_id: participant.id, ...(assessmentId ? { assessment_id: assessmentId } : {}) });
    if (!r.success) return setError(r.message);
    setData(r);
  }, [participant.id]);
  useEffect(() => { load(); }, [load]);
  useEscape(onClose);
  // الجدول من reviewCsvRows نفسه (رؤوسه وصفوفه)، ويخرج بنافذة التصدير الموحدة
  const [out, setOut] = useState(null);
  const csv = (d) => {
    const { head, rows } = reviewCsvRows(d, (x) => DIM_EN[x] || x);
    setOut({ kind: d.assessment.kind || 'assessment', rows, columns: head.map((label, i) => ({ key: `c${i}`, label, width: i === 3 ? 60 : i === 4 || i === 5 ? 36 : 14, get: (r) => r[i] })) });
  };
  return (<>
    <AnswersPanel who={participant.full_name} data={data} error={error} onRetry={() => load(data?.assessment?.id)} onClose={onClose}
      onPick={(id) => { setData(null); load(id); }} focusDim={dim && dim !== 'all' ? dim : null} onCsv={csv} />
    {out && <ExportDialog scope="answers" meta={{ kind: 'ANS', title: `إجابات ${participant.full_name}`, sheet: 'الإجابات', file: 'Answers', code: `${participant.id.slice(0, 8)}-${out.kind}` }}
      columns={out.columns} sets={{ selected: [], filtered: out.rows, all: out.rows }} noun="إجابة" onClose={() => setOut(null)} />}
  </>);
}
