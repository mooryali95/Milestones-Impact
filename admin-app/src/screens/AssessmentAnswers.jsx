// ════════════════════════════════════════════════════════════════
// «إجابات القياس» في ملف المشارك: لوحة جانبية من بطاقة المستوى (المدير ذو الكتابة وحده)
// ════════════════════════════════════════════════════════════════
// (تصور بطاقة المستوى وإجابات القياس، المرحلة 2، قرار المالك 2026-11-11)
// تُحمَّل عند الطلب لا مع الملف، فيُسجَّل كل فتح في السجل على الخادم. العرض من src/lib/AnswersPanel.jsx
// المشترك مع بوابة الخبير، والتصدير CSV هنا وحده (للمدير). التركيز وحبسه من useModalFocus، وEsc من useEscape.
import React, { useCallback, useEffect, useState } from 'react';
import AnswersPanel from '../../../src/lib/AnswersPanel.jsx';
import { reviewCsvRows } from '../../../supabase/functions/leaders-api/answer-review.js';
import { csvBlob, DIM_EN, download, L } from '../leaders.js';
import { useEscape, useUI } from '../ui.jsx';

export default function AssessmentAnswers({ participant, dim, onClose }) {
  const { toast } = useUI();
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
  const csv = (d) => {
    const { head, rows } = reviewCsvRows(d, (x) => DIM_EN[x] || x);
    download(csvBlob(head, rows), `answers-${participant.id.slice(0, 8)}-${d.assessment.kind || 'assessment'}.csv`);
    toast('صُدّرت الإجابات');
  };
  return (
    <AnswersPanel who={participant.full_name} data={data} error={error} onRetry={() => load(data?.assessment?.id)} onClose={onClose}
      onPick={(id) => { setData(null); load(id); }} focusDim={dim && dim !== 'all' ? dim : null} onCsv={csv} />
  );
}
