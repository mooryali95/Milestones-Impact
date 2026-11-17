// ════════════════════════════════════════════════════════════════
// «المساعد الذكي»: قسم واحد في الشريط بثلاثة تبويبات داخلية (قرار المالك 2026-11-17)
// ════════════════════════════════════════════════════════════════
// مساعد الموقع العام، والتوجيه والإرشاد داخل الرحلة، وإتاحته للجهات والدفعات. محتوى كل شاشة كما هو،
// والتبويب الداخلي في العنوان (#/leaders/ai/<site|guidance|access>) فيعمل التحديث وزر الرجوع والروابط
import React, { Suspense, useRef } from 'react';
import { lazyRetry } from '../lazy-retry.js';
import { AI_TABS } from '../leaders-tabs.js';
import { navigate } from '../route.js';
import { ScreenBoundary, Spinner } from '../ui.jsx';

// كل شاشة تُحمَّل عند أول فتح لتبويبها، وملفاتها كما كانت (Agent وGuidanceAdmin)
const Agent = lazyRetry(() => import('./Agent.jsx'));
const GuidanceAdmin = lazyRetry(() => import('./GuidanceAdmin.jsx'));
const GuidanceAccess = lazyRetry(() => import('./GuidanceAdmin.jsx').then((m) => ({ default: m.GuidanceAccess })));

const KEYS = AI_TABS.map(([k]) => k);
// تبويب داخلي غير معروف أو غائب: «مساعد الموقع»
export const aiSub = (id) => (KEYS.includes(id) ? id : 'site');

export default function AiHub({ sub, isSuper = false }) {
  const cur = aiSub(sub);
  const tabs = useRef([]);
  const open = (k) => navigate({ ctx: 'leaders', tab: 'ai', id: k });
  // الأسهم تتنقل بين التبويبات (من اليمين إلى اليسار)، وHome وEnd إلى الطرفين، كما في «أقسام الدفعة»
  const keyNav = (e, i) => {
    const to = { ArrowLeft: i + 1, ArrowRight: i - 1, Home: 0, End: KEYS.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    const n = (to + KEYS.length) % KEYS.length;
    open(KEYS[n]); tabs.current[n]?.focus();
  };
  return (
    <div className="ai-hub">
      <h2 className="ai-hub-title">المساعد الذكي</h2>
      <div className="la-subtabs" role="tablist" aria-label="أقسام المساعد الذكي">
        {AI_TABS.map(([k, l], i) => (
          <button key={k} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`ai-tab-${k}`} aria-selected={cur === k} aria-controls={`ai-panel-${k}`}
            tabIndex={cur === k ? 0 : -1} className={cur === k ? 'on' : ''} onClick={() => open(k)} onKeyDown={(e) => keyNav(e, i)}>{l}</button>
        ))}
      </div>
      <div role="tabpanel" id={`ai-panel-${cur}`} aria-labelledby={`ai-tab-${cur}`}>
        <ScreenBoundary key={cur}><Suspense fallback={<Spinner />}>
          {cur === 'guidance' ? <GuidanceAdmin /> : cur === 'access' ? <GuidanceAccess /> : <Agent isSuper={isSuper} />}
        </Suspense></ScreenBoundary>
      </div>
    </div>
  );
}
