// ════════════════════════════════════════════════════════════════
// المحتوى العام: تفاصيل العمليات ونصوص التطبيق (جداول للقراءة فقط)
// ════════════════════════════════════════════════════════════════
// تُجلب في الخلفية بعد الإقلاع. detailsState يخبر الواجهة أن تعرض
// هيكل انتظار بدل فراغ صامت: 'loading' | 'ready' | 'error'.
import { useCallback, useEffect, useState } from 'react';
import { publicRead } from '../lib/api';

const byKey = (rows, k, v) => Object.fromEntries((rows || []).map((r) => [r[k], v ? r[v] : r]));

export default function usePublicContent() {
  const [processDetails, setProcessDetails] = useState({});
  const [appContent, setAppContent] = useState({});
  const [detailsState, setDetailsState] = useState('loading');

  const load = useCallback(async () => {
    setDetailsState('loading');
    try {
      const [details, content] = await Promise.all([
        publicRead('process_details?select=*'),
        publicRead('app_content?select=*'),
      ]);
      if (details?.length) setProcessDetails(byKey(details, 'process_key'));
      if (content?.length) setAppContent(byKey(content, 'key', 'value'));
      // publicRead يعيد null عند تعذّر الوصول ولا يُلقي استثناءً
      setDetailsState(details === null ? 'error' : 'ready');
    } catch {
      setDetailsState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { processDetails, setProcessDetails, appContent, setAppContent, detailsState, reloadContent: load };
}
