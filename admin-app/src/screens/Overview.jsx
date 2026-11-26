// ════════════════════════════════════════════════════════════════
// مكتب اليوم (نظرة عامة على تطبيق القادة): ماذا ينتظر قراري اليوم؟ وما الذي انكسر ويحتاجني؟
// ════════════════════════════════════════════════════════════════
// تصور تبويبات الإدارة 2026-11-24 (المرحلة أ، معتمد): «نظرة عامة» = قرارات اليوم + الاستثناءات فقط. التحية، ثم «قرارات
// اليوم» (صندوق admin.inbox)، ثم الأرقام الأربعة، ثم شريط «يحتاج انتباهك» (سطر لكل مشكلة برابط إلى مكان إصلاحها، يختفي
// كله حين يسلم كل شيء)، ثم «تنبيهات» admin.today، ثم روابط سريعة. لا تُرسم هنا بطاقة مجال آخر: جاهزية الإطلاق والفحوص
// وحالة النظام وبيئة التجربة في «الإعداد › صحة المنصة» (PlatformHealth.jsx)، وصحة البريد في مركز البريد، ونبض كل دفعة
// في ملفها، وطلبات المتطلبات نوع في الصندوق نفسه. حارس ذلك single-source.test.js.
import React, { Suspense, useEffect, useState } from 'react';
import Inbox from './Inbox.jsx';
import { L } from '../leaders.js';
import { session } from '../api.js';
import { dayFull } from '../dates.js';
import { useOpsHealth } from '../ops-watch.js';
import { useInbox } from '../pending.js';
import { SkeletonRows, Spinner } from '../ui.jsx';
import { lazyRetry } from '../lazy-retry.js';
import { readQuery } from '../route.js';
import { ageAr } from '../../../supabase/functions/leaders-api/inbox.js';
import { alertHref, deskNote, exceptionRows, greetingAr, HEALTH_HREF, STALE_DAYS, STRIP_MAX, todayNumbers, waitingSub } from '../today.js';

// ── «يحتاج انتباهك»: سطر لكل مشكلة قائمة «ما المشكلة · أين تُصلح ←»، خمسة أسطر ثم «و3 أخرى ←» إلى صحة المنصة ──
// يظهر لكل مدير بما يُعرض له (healthProblems بالبوابات نفسها)، وروابطه تنقُّل لا أفعال، فلا زر فيه لمن يقرأ وحده.
// لا يُحكم بالسلامة قبل وصول المصادر، ولا يُرسم شيء حين يسلم كل شيء
function Exceptions({ h, ph, orgs, orgsLoaded, canWrite }) {
  const writer = canWrite !== false;
  const ops = useOpsHealth(writer);
  const rows = exceptionRows({ ops: writer ? ops : null, h, orgs, canWrite: writer, withOrgs: orgsLoaded, ph });
  if (!rows.length) return null;
  const shown = rows.slice(0, STRIP_MAX);
  const more = rows.length - shown.length;
  return (
    <section className="today-exc" aria-labelledby="today-exc-h">
      <h2 className="today-sec" id="today-exc-h">يحتاج انتباهك <span className="la-chip warn">{rows.length}</span></h2>
      <ul role="list">
        {shown.map((x) => (
          <li key={x.key} className={`today-exc-row ${x.level}`} data-key={x.key}>
            <span className="today-alert-ic" aria-hidden="true">{x.level === 'bad' ? '!' : '•'}</span>
            <span className="today-exc-t">{x.level === 'bad' && <span className="sr-only">عاجل: </span>}{x.text}</span>
            <a className="la-link" href={x.href}>{x.where} ←</a>
          </li>
        ))}
      </ul>
      {more > 0 && <a className="la-link today-exc-more" href={HEALTH_HREF}>{more === 1 ? 'وأمر آخر' : `و${more} أخرى`} ←</a>}
    </section>
  );
}

// ── الأرقام الأربعة: من الصندوق والنظرة العامة المحمّلين أصلًا، وكل رقم يفتح عرضه في الصندوق حيث وُجد ──
function TodayNumbers({ nums, onView, onTab }) {
  // «+» بعد الرقم يعني «على الأقل»: يُعزل الرقم باتجاه يسار إلى يمين فلا يُقرأ «+3» إشارة
  const v = (x) => (x == null ? null : nums.partial ? `${x}+` : String(x));
  const w = nums.waiting;
  const cells = [
    { key: 'waiting', label: 'القرارات المنتظرة', value: v(w?.n), sub: waitingSub(nums, ageAr), go: () => onView('') },
    { key: 'late', label: 'المتجاوز للمهلة الآن', value: v(nums.late), sub: 'تجاوز مهلة نوعه', go: () => onView('late'), tone: nums.late ? 'bad' : '' },
    { key: 'stale', label: `المنتظر منذ أكثر من ${STALE_DAYS} أيام`, value: v(nums.stale), sub: 'بعمر البند في الصندوق', go: () => onView('stale'), tone: nums.stale ? 'warn' : '' },
    { key: 'program', label: 'المشاركون في البرنامج', // «25 من 43» جملة عربية برقمين: كل رقم معزول وحده والجملة باتجاه الصفحة، فلا تُقرأ «25 43 من» (عزلها كلها يسارًا قلبها)
      value: nums.program ? <><bdi>{nums.program.n}</bdi> من <bdi>{nums.program.of}</bdi></> : null, sub: nums.program ? 'من أصل المسجلين' : 'تعذّرت قراءة الأرقام', go: () => onTab?.('participants') },
  ];
  return (
    <div className="stats-grid today-nums" role="group" aria-label="أرقام اليوم">
      {cells.map((c) => (
        <button key={c.key} type="button" className={`stat-card today-n${c.tone ? ` ${c.tone}` : ''}`} data-k={c.key} onClick={c.go}>
          <span className="stat-label">{c.label}</span><span className="stat-value">{c.value == null ? <><span aria-hidden="true">·</span><span className="sr-only">غير مقروء</span></> : typeof c.value === 'string' ? <bdi dir="ltr">{c.value}</bdi> : c.value}</span><span className="stat-sub">{c.sub}</span>
        </button>
      ))}
    </div>
  );
}

// ── التنبيهات ونبض الدفعات (المرحلة 3ب): رد admin.today، يُطلب مرة مع فتح المكتب، ثم بعد كل قرار وحين تعود الصفحة ظاهرة ──
// «mi:pending» يطلقه كل فعل قرار (CHANGES_PENDING في pending.js)، ومنها قرار طابور المتطلبات، فلا يُعاد الطلب بغيره.
// الطلب ثقيل (الجهات والدفعات والصندوق والخبراء معًا)، فتُجمع الأحداث المتتابعة في طلب واحد (TODAY_DEBOUNCE_MS).
// والحفظ الذي لا يطلق الحدث (المقاعد والعقد والجلسة والدفعة) يظهر أثره عند فتح المكتب أو عودة الصفحة ظاهرة. الرد الأقدم يُهمل
const TODAY_DEBOUNCE_MS = 400;
function useToday() {
  const [t, setT] = useState(null);
  useEffect(() => {
    let seq = 0, timer = null;
    const load = () => {
      const my = ++seq;
      L('admin.today', {}).catch((e) => ({ success: false, message: e?.message })).then((r) => { if (my === seq) setT(r); });
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(load, TODAY_DEBOUNCE_MS); };
    const onVis = () => { if (document.visibilityState === 'visible') later(); };
    load();
    window.addEventListener('mi:pending', later);
    document.addEventListener('visibilitychange', onVis);
    return () => { seq = -1; clearTimeout(timer); window.removeEventListener('mi:pending', later); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return t;
}

// سطر خافت بما تعذّرت قراءته: غياب التنبيه أو النبض عندها «لم يُفحص» لا «لا شيء»
function DeskNote({ t }) {
  const note = deskNote(t);
  return note ? <p className="la-muted today-skip" role="status">{note}</p> : null;
}

// «تنبيهات»: ما يحتاج انتباهك قبل أن يصير مشكلة، كل تنبيه رابط إلى ملفه. يختفي القسم حين لا تنبيه
function Alerts({ t }) {
  const list = t?.success ? t.alerts || [] : [];
  if (!list.length) return null;
  return (
    <section className="today-alerts" aria-labelledby="today-alerts-h">
      <h2 className="today-sec" id="today-alerts-h">تنبيهات <span className="la-chip">{list.length}</span></h2>
      {/* role="list": إزالة علامات القائمة بالتنسيق تُسقط دورها في Safari وVoiceOver */}
      <ul role="list">
        {list.map((a) => (
          <li key={a.id} className={`today-alert ${a.severity}`} data-kind={a.kind}>
            <span className="today-alert-ic" aria-hidden="true">{a.severity === 'bad' ? '!' : '•'}</span>
            {/* العاجل لا يُميَّز باللون والأيقونة وحدهما: قارئ الشاشة يسمعه «عاجل» */}
            <a className="la-link" href={alertHref(a)}>{a.severity === 'bad' && <span className="sr-only">عاجل: </span>}{a.text}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── اتجاه البرنامج (نُقل من «زيارات الموقع»، تصور الزيارات 2026-11-26 البند 2): يُطلب admin.trends عند فتحه وحده،
// أو فورًا إن جاء الرابط ‎?trend=1‎ من صفحة الزيارات. الأعداد 1 و2 تُعرض «أقل من 3» لدور المشاهد (لا يرى المشاركين)
const ProgramTrend = lazyRetry(() => import('./ProgramTrend.jsx'));
export const TREND_ID = 'program-trend';
function TrendSection() {
  const [open, setOpen] = useState(() => new URLSearchParams(readQuery()).get('trend') === '1');
  const viewer = (session.load()?.user?.role_id || session.load()?.user?.role) === 'viewer';
  useEffect(() => { if (open && new URLSearchParams(readQuery()).get('trend') === '1') document.getElementById(TREND_ID)?.scrollIntoView?.({ block: 'start' }); }, []); // eslint-disable-line
  return (
    <section className="la-card today-trend" id={TREND_ID} aria-labelledby="today-trend-h">
      <div className="today-trend-head">
        <h2 className="today-sec" id="today-trend-h">اتجاه البرنامج</h2>
        <button type="button" className="btn-sm ghost" aria-expanded={open} aria-controls="today-trend-body" onClick={() => setOpen(!open)}>{open ? 'أخفِ' : 'اعرض أسبوعًا بأسبوع'}</button>
      </div>
      {open && <div id="today-trend-body"><Suspense fallback={<SkeletonRows rows={4} cols={5} />}><ProgramTrend hideSmall={viewer} /></Suspense></div>}
    </section>
  );
}

// ── روابط سريعة إلى أماكنها القائمة: «دفعة جديدة» معالج الدفعة (‎?new=‎ في البرامج)، والباقي تبويب يحمل الفعل ──
function QuickLinks({ onTab, canWrite }) {
  const writer = canWrite !== false;
  const links = [
    writer && { key: 'cohort', label: 'دفعة جديدة', href: '#/leaders/programs?new=' },
    writer && { key: 'people', label: 'أضف مشاركين', href: '#/leaders/participants', tab: 'participants' },
    { key: 'sessions', label: 'الجلسات اليوم', href: '#/leaders/activities', tab: 'activities' },
    { key: 'insight', label: 'التحليل الكامل', href: '#/leaders/insight', tab: 'insight' },
  ].filter(Boolean);
  return (
    <nav className="today-links" aria-label="روابط سريعة">
      {links.map((l) => (
        <a key={l.key} className="btn-sm ghost" href={l.href} onClick={l.tab && onTab ? (e) => { e.preventDefault(); onTab(l.tab); } : undefined}>{l.label}</a>
      ))}
    </nav>
  );
}

export default function Overview({ orgs, orgsLoaded, onPerson, onTab, pending, canWrite }) {
  const [d, setD] = useState(null);
  const [view, setView] = useState('');
  // رد الصندوق من مخزن العدّادات نفسه (pending.js): طلب واحد يرسم الصندوق والأرقام والعدّادات
  const [inbox] = useInbox();
  const today = useToday();
  useEffect(() => {
    let live = true;
    Promise.all([
      L('admin.overview', {}),
      L('admin.health').catch(() => null),
      L('admin.platform-health').catch(() => ({ success: false })),
    ]).then(([o, h, ph]) => live && setD({ o, h, ph }));
    return () => { live = false; };
  }, []);

  if (!d) return <Spinner />;
  const { o, h, ph } = d;
  // admin.overview لا يغذي في المكتب إلا الرقم الرابع: تعذّره لا يحجب القرارات والاستثناءات
  const nums = todayNumbers(inbox, o);
  const name = session.load()?.user?.name;
  const toDecisions = (v) => {
    setView(v);
    const el = document.getElementById('today-decisions');
    el?.scrollIntoView?.({ block: 'start' });
    el?.focus({ preventScroll: true });
  };
  return (
    <>
      <header className="today-head">
        <div>
          <h2 className="today-hi">{greetingAr()}{name ? `، ${name}` : ''}</h2>
          <p className="la-muted today-date">{dayFull()}</p>
        </div>
      </header>
      {/* جلسة رمز البريد: شريط «للقراءة فقط» بزر «فعّل الكتابة» في إطار اللوحة (App.jsx) لا هنا، فيظهر في كل صفحة */}
      <h2 className="today-sec">قرارات اليوم</h2>
      {/* صندوق واحد لكل ما ينتظر القرار (Inbox.jsx، admin.inbox)، ومنه طلبات المتطلبات (النوع requirement) */}
      <div id="today-decisions" tabIndex={-1} className="today-decisions">
        <Inbox contacts={pending?.contacts || 0} canWrite={canWrite} onPerson={onPerson} view={view} onView={setView} />
      </div>
      <TodayNumbers nums={nums} onView={toDecisions} onTab={onTab} />
      <Exceptions h={h} ph={ph} orgs={orgs} orgsLoaded={orgsLoaded !== false} canWrite={canWrite} />
      {!o.success && <div className="la-err" role="alert">{o.message || 'تعذّرت قراءة أرقام النظرة العامة.'}</div>}
      <Alerts t={today} />
      <DeskNote t={today} />
      <TrendSection />
      <QuickLinks onTab={onTab} canWrite={canWrite} />
    </>
  );
}
