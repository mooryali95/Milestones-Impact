// ════════════════════════════════════════════════════════════════
// «المساعد الذكي»: قسم واحد في الشريط بثلاثة تبويبات داخلية (قرار المالك 2026-11-17)
// ════════════════════════════════════════════════════════════════
// مساعد الموقع العام، والتوجيه والإرشاد داخل الرحلة، وإتاحته للجهات والدفعات. محتوى كل شاشة كما هو،
// والتبويب الداخلي في العنوان (#/leaders/ai/<site|guidance|access>) فيعمل التحديث وزر الرجوع والروابط.
// الرأس: العنوان والوصف وسطر حال المساعدَين من ردود الشاشات نفسها (ai-hub-data.js)، بلا نقطة خادم جديدة.
import React, { Suspense, useRef } from 'react';
import { lazyRetry } from '../lazy-retry.js';
import { AI_TABS } from '../leaders-tabs.js';
import { navigate } from '../route.js';
import { ScreenBoundary } from '../ui.jsx';
import { useAiData } from '../ai-hub-data.js';
import { AiSkeleton, dollarsOf, guideWord } from '../ai-ui.jsx';
import { normState, normUsage } from '../agent-data.js';
import { stateSummary, usd2 } from '../agent-admin.js';
import '../agent-admin.css';

// كل شاشة تُحمَّل عند أول فتح لتبويبها، وملفاتها كما كانت (Agent وGuidanceAdmin)
const Agent = lazyRetry(() => import('./Agent.jsx'));
const GuidanceAdmin = lazyRetry(() => import('./GuidanceAdmin.jsx'));
const GuidanceAccess = lazyRetry(() => import('./GuidanceAdmin.jsx').then((m) => ({ default: m.GuidanceAccess })));

const KEYS = AI_TABS.map(([k]) => k);
// تبويب داخلي غير معروف أو غائب: «مساعد الموقع»
export const aiSub = (id) => (KEYS.includes(id) ? id : 'site');

// سطر حال مساعد الموقع: ما لم يُقرأ لا يُكتب، فلا عنصر نائب ولا «غير مقروء»
export function siteFacts(stRaw, usRaw) {
  const s = normState(stRaw);
  if (!s.success || !s.ready) return null;
  const sum = stateSummary(s);
  const u = normUsage(usRaw);
  const facts = [];
  if (u.success && u.today.cap_micros) facts.push(`اليوم ${usd2(u.today.spent_micros)} من ${usd2(u.today.cap_micros)} دولار`);
  if (u.success && u.conversations != null) facts.push(`${u.conversations} محادثة في 30 يومًا`);
  return { level: sum.level, word: sum.text, facts };
}
// سطر حال التوجيه والإرشاد من لوحته (admin.guide-dashboard). الكلمة نتيجة البوابة كما في صف المؤشرات (guideWord)،
// وحال المفتاح في اللوحة سبب يتبعها، فلا تتعدد أسماء الحال الواحدة
export function guideFacts(d) {
  if (!d?.success || !d.settings || !Array.isArray(d.blockers)) return null;
  const open = d.blockers.length === 0;
  const facts = [];
  if (!open) facts.push(d.settings.enabled ? 'مشغّل وينتظر الشروط' : 'متوقف من اللوحة');
  if (d.today && d.settings.cap_usd != null) facts.push(`اليوم ${dollarsOf(d.today.usd, d.settings.cap_usd)}`);
  const m = (d.report?.windows || []).find((w) => w.days === 30);
  if (m) facts.push(`${m.asked} سؤالًا في 30 يومًا`);
  return { level: open ? 'green' : 'amber', word: guideWord(open), facts };
}

function StatusItem({ name, f }) {
  if (!f) return null;
  return (
    <li className={`ai-st ai-st-${f.level}`}>
      <span className="ai-st-dot" aria-hidden="true" />
      <span className="ai-st-main"><b>{name}</b> <span className="ai-st-word">{f.word}</span></span>
      {f.facts.length > 0 && <span className="ai-st-facts">{f.facts.join('، ')}</span>}
    </li>
  );
}

function HubStatus() {
  const d = useAiData(['admin.agent-state', 'admin.agent-usage', 'admin.guide-dashboard']);
  const site = siteFacts(d['admin.agent-state'], d['admin.agent-usage']);
  const guide = guideFacts(d['admin.guide-dashboard']);
  // أول تحميل: صفّان بشكل السطر فلا يقفز الرأس حين يصل الرد
  if (!site && !guide && d.pending) return <ul className="ai-hub-status ai-st-skel" aria-hidden="true"><li className="ai-st" /><li className="ai-st" /></ul>;
  if (!site && !guide) return null;
  return (
    <ul className="ai-hub-status" aria-label="حال المساعدَين الآن">
      <StatusItem name="مساعد الموقع" f={site} />
      <StatusItem name="التوجيه والإرشاد" f={guide} />
    </ul>
  );
}

export default function AiHub({ sub, isSuper = false }) {
  const cur = aiSub(sub);
  const tabs = useRef([]);
  // النقر يضيف مدخلًا في سجل الرجوع، والأسهم تستبدله فلا يمتلئ السجل بكل ضغطة
  const open = (k, replace = false) => navigate({ ctx: 'leaders', tab: 'ai', id: k }, replace ? { replace: true } : undefined);
  // الأسهم تتنقل بين التبويبات (من اليمين إلى اليسار)، وHome وEnd إلى الطرفين، كما في «أقسام الدفعة»
  const keyNav = (e, i) => {
    const to = { ArrowLeft: i + 1, ArrowRight: i - 1, Home: 0, End: KEYS.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    const n = (to + KEYS.length) % KEYS.length;
    open(KEYS[n], true); tabs.current[n]?.focus();
  };
  return (
    <div className="ai-hub">
      <header className="ai-hub-head">
        <div className="ai-hub-head-txt">
          <h2 className="ai-hub-title">المساعد الذكي</h2>
          <p className="ai-hub-lead">مساعدان بسقف إنفاق وتقييم قبل الإطلاق: مساعد الموقع للزوار، والتوجيه والإرشاد داخل رحلة المشارك.</p>
        </div>
        <HubStatus />
      </header>
      {/* تبويبات داخلية بشكل مفتاح مقسّم، والدور والتنقل بالأسهم كما كانا */}
      <div className="ai-seg" role="tablist" aria-label="أقسام المساعد الذكي">
        {AI_TABS.map(([k, l], i) => (
          <button key={k} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`ai-tab-${k}`} aria-selected={cur === k} aria-controls={`ai-panel-${k}`}
            tabIndex={cur === k ? 0 : -1} className={cur === k ? 'on' : ''} onClick={() => open(k)} onKeyDown={(e) => keyNav(e, i)}>{l}</button>
        ))}
      </div>
      <div role="tabpanel" id={`ai-panel-${cur}`} aria-labelledby={`ai-tab-${cur}`} className="ai-panel">
        <ScreenBoundary key={cur}><Suspense fallback={<AiSkeleton />}>
          {cur === 'guidance' ? <GuidanceAdmin /> : cur === 'access' ? <GuidanceAccess /> : <Agent isSuper={isSuper} />}
        </Suspense></ScreenBoundary>
      </div>
    </div>
  );
}
