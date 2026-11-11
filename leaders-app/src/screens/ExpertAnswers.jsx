// ════════════════════════════════════════════════════════════════
// «إجابات القياس» من بوابة الخبير: لمستشار الدفعة فيمن يشرف عليهم (قرار المالك 2026-11-11)
// ════════════════════════════════════════════════════════════════
// يرى ما يراه المدير: اختيار المشارك مقابل مفتاح الدرجة القصوى، والزمن التقديري. بلا تصدير.
// الخادم يحصرها في مستشار الدفعة (requireAdvisorOf) ويسجّل كل اطلاع. العرض من src/lib/AnswersPanel.jsx
// المشترك مع لوحة الإدارة، وسلوك النافذة من useDialog (التركيز وحبسه وEsc وإعادته إلى ما فتحها).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AnswersPanel from '../../../src/lib/AnswersPanel.jsx';
import { useDialog } from '../../../src/lib/a11y.js';
import { xpCall } from '../api.js';

export default function ExpertAnswers({ participant, onClose }) {
  const box = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async (assessmentId) => {
    setError('');
    const r = await xpCall('xp.assessment-answers', { participant_id: participant.id, ...(assessmentId ? { assessment_id: assessmentId } : {}) });
    if (!r.success) return setError(r.message);
    setData(r);
  }, [participant.id]);
  useEffect(() => { load(); }, [load]);
  useDialog(box, onClose, { self: true });
  return (
    <AnswersPanel boxRef={box} who={participant.full_name} data={data} error={error} onRetry={() => load(data?.assessment?.id)} onClose={onClose}
      onPick={(id) => { setData(null); load(id); }} />
  );
}
