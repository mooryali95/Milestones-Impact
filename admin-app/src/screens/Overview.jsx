// ════════════════════════════════════════════════════════════════
// مكتب اليوم (نظرة عامة على تطبيق القادة): ماذا ينتظر قراري اليوم؟ وما الذي انكسر ويحتاجني؟
// ════════════════════════════════════════════════════════════════
// تصور تبويبات الإدارة 2026-11-24 (المرحلة أ، معتمد): «نظرة عامة» = قرارات اليوم + الاستثناءات فقط. التحية، ثم «قرارات
// اليوم» (صندوق admin.inbox)، ثم الأرقام الأربعة، ثم «ما يحتاج انتباهك» (المرحلة 8: قسم عرض واحد من مصدرين كما هما،
// exceptionRows وتنبيهات admin.today، عبر attentionRows في today.js؛ يختفي كله حين يسلم كل شيء)، ثم سطر عدد المتوقفين في
// مصفوفة التأثير (من matrix.js، الأسماء في المصفوفة وحدها). الروابط السريعة في الرأس بجانب التحية. الصندوق لا يُدمج بغيره. لا تُرسم هنا بطاقة مجال آخر: جاهزية الإطلاق والفحوص
// وحالة النظام وبيئة التجربة في «الإعداد › صحة المنصة» (PlatformHealth.jsx)، وصحة البريد في مركز البريد، ونبض كل دفعة
// في ملفها، وطلبات المتطلبات نوع في الصندوق نفسه. حارس ذلك single-source.test.js.
import React, { Suspense, useEffect, useState } from 'react';
import Inbox from './Inbox.jsx';
import { L } from '../leaders.js';
import { session } from '../api.js';
import { dayFull } from '../dates.js';
import { useOpsHealth } from '../ops-watch.js';
import { useInbox } from '../pending.js';
import { LoadError, SkeletonRows } from '../ui.jsx';
import { lazyRetry } from '../lazy-retry.js';
import { readQuery } from '../route.js';
import { ageAr } from '../../../supabase/functions/leaders-api/inbox.js';
import { attentionRows, deskNote, exceptionRows, greetingAr, HEALTH_HREF, PROGRAM_VIEW, STALE_DAYS, STRIP_MAX, todayNumbers, waitingSub } from '../today.js';
import { IDLE_DAYS, IDLE_HREF, idleCount } from '../matrix.js';

// ── الأرقام الأربعة: من الصندوق والنظرة العامة المحمّلين أصلًا، وكل رقم يفتح عرضه في الصندوق حيث وُجد ──
// البطاقة زر: سهم ووجهة في التلميح، وaria-current للعرض النشط في الصندوق. الرابعة تفتح المشاركين بمرشح «في البرنامج»
// (PROGRAM_VIEW، الحالتان IN_PROGRAM نفساهما اللتان حُسب بهما رقمها)
export const PROGRAM_HREF = `#/leaders/participants?view=${PROGRAM_VIEW}`;
function TodayNumbers({ nums, view, onView, loading }) {
  // «+» بعد الرقم يعني «على الأقل»: يُعزل الرقم باتجاه يسار إلى يمين فلا يُقرأ «+3» إشارة
  const v = (x) => (x == null ? null : nums.partial ? `${x}+` : String(x));
  const w = nums.waiting;
  const toBox = 'يفتح هذا العرض في قرارات اليوم';
  const cells = [
    { key: 'waiting', label: 'القرارات المنتظرة', value: v(w?.n), sub: waitingSub(nums, ageAr), go: () => onView(''), pressed: view === '', hint: 'يفتح كل القرارات المنتظرة' },
    { key: 'late', label: 'المتجاوز للمهلة الآن', value: v(nums.late), sub: 'تجاوز مهلة نوعه', go: () => onView('late'), tone: nums.late ? 'bad' : '', pressed: view === 'late', hint: toBox },
    { key: 'stale', label: `المنتظر منذ أكثر من ${STALE_DAYS} أيام`, value: v(nums.stale), sub: 'بعمر البند في الصندوق', go: () => onView('stale'), tone: nums.stale ? 'warn' : '', pressed: view === 'stale', hint: toBox },
    { key: 'program', label: 'المشاركون في البرنامج', // «25 من 43» جملة عربية برقمين: كل رقم معزول وحده والجملة باتجاه الصفحة، فلا تُقرأ «25 43 من» (عزلها كلها يسارًا قلبها)
      value: nums.program ? <><bdi>{nums.program.n}</bdi> من <bdi>{nums.program.of}</bdi></> : null, sub: nums.program ? 'من أصل المسجلين' : loading ? 'جارٍ التحميل…' : 'تعذّرت قراءة الأرقام',
      go: () => { window.location.hash = PROGRAM_HREF; }, hint: 'يفتح المشاركين بمرشح «في البرنامج»' },
  ];
  return (
    <div className="stats-grid today-nums" role="group" aria-label="أرقام اليوم">
      {cells.map((c) => (
        <button key={c.key} type="button" className={`stat-card today-n${c.tone ? ` ${c.tone}` : ''}`} data-k={c.key} onClick={c.go} title={c.hint}
          aria-current={c.pressed ? 'true' : undefined}>
          <span className="stat-label">{c.label}<span className="today-n-go" aria-hidden="true">←</span></span><span className="stat-value">{c.value == null ? <><span aria-hidden="true">·</span><span className="sr-only">غير مقروء</span></> : typeof c.value === 'string' ? <bdi dir="ltr">{c.value}</bdi> : c.value}</span><span className="stat-sub">{c.sub}</span>
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
  const [n, setN] = useState(0);
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
  }, [n]);
  return [t, () => { setT(null); setN((x) => x + 1); }];
}

// سطر خافت بما تعذّرت قراءته: غياب التنبيه أو النبض عندها «لم يُفحص» لا «لا شيء»
function DeskNote({ t }) {
  const note = deskNote(t);
  return note ? <p className="la-muted today-skip" role="status">{note}</p> : null;
}

// ── «ما يحتاج انتباهك» (المرحلة 8): قسم عرض واحد من مصدريه كما هما (attentionRows)، الأشد أولًا ──
// شكل صف واحد: نقطة النبرة ثم النص ثم الوجهة («افتح جاهزية الإطلاق ←»). الوجهة رابط تنقّل إلى موضع الإصلاح نفسه
// (‎#/leaders/health#ph-launch‎، أو ملف الجهة والدفعة والخبير)، لا زر فعل: يراه من يقرأ وحده. يختفي حين يسلم كل شيء
function AttentionRow({ x }) {
  return (
    <li className={`today-exc-row ${x.level}`} data-key={x.key} data-kind={x.kind} data-src={x.source}>
      <span className="today-alert-ic" aria-hidden="true">{x.level === 'bad' ? '!' : '•'}</span>
      {/* العاجل لا يُميَّز باللون والأيقونة وحدهما: قارئ الشاشة يسمعه «عاجل» */}
      <span className="today-exc-t">{x.level === 'bad' && <span className="sr-only">عاجل: </span>}{x.text}</span>
      <a className="la-link" href={x.href}>افتح {x.where} ←</a>
    </li>
  );
}
function Attention({ d, t, orgs, orgsLoaded, canWrite, onRetry }) {
  const writer = canWrite !== false;
  const [all, setAll] = useState(false);
  const [focusAt, setFocusAt] = useState(-1);
  // بعد «و n أخرى» يختفي الزر: يُنقل التركيز إلى أول سطر كان مخفيًا فلا يسقط إلى أعلى الصفحة
  useEffect(() => {
    if (focusAt < 0) return;
    const el = document.querySelectorAll('#today-exc-list > li')[focusAt];
    if (el) { el.tabIndex = -1; el.focus?.(); }
    setFocusAt(-1);
  }, [focusAt]);
  const ops = useOpsHealth(writer);
  const loading = !d || !t;
  const rows = loading ? [] : attentionRows(exceptionRows({ ops: writer ? ops : null, h: d.h, orgs, canWrite: writer, withOrgs: orgsLoaded, ph: d.ph }), t);
  if (loading) {
    return (
      <section className="today-exc" aria-labelledby="today-exc-h" aria-busy="true">
        <h2 className="today-sec" id="today-exc-h">ما يحتاج انتباهك</h2>
        <ul role="list" className="today-exc-sk">{[0, 1].map((i) => <li key={i} className="today-exc-row" aria-hidden={i > 0 || undefined}>{i === 0 && <span className="sr-only">جارٍ التحميل</span>}<span className="sk" /></li>)}</ul>
      </section>
    );
  }
  const failed = !t.success;
  if (!rows.length && !failed) return null;
  const shown = all ? rows : rows.slice(0, STRIP_MAX);
  const hidden = rows.slice(shown.length);
  const more = hidden.length;
  // الباقي كله من أحكام الصحة: رابط إلى صحة المنصة حيث تُعرض كاملة. وإن كان فيه تنبيه ملف فلا بيت واحد له: يُكشف هنا
  const toHealth = hidden.every((x) => x.source === 'health');
  const moreAr = more === 1 ? 'وأمر آخر' : `و${more} أخرى`;
  return (
    <section className="today-exc" aria-labelledby="today-exc-h">
      <h2 className="today-sec" id="today-exc-h">ما يحتاج انتباهك {rows.length > 0 && <span className={`la-chip ${rows.some((x) => x.level === 'bad') ? 'bad' : 'warn'}`}>{rows.length}</span>}</h2>
      {rows.length > 0 && <ul role="list" id="today-exc-list">{shown.map((x) => <AttentionRow key={x.key} x={x} />)}</ul>}
      {more > 0 && (toHealth
        ? <a className="la-link today-exc-more" href={HEALTH_HREF}>{moreAr} ←</a>
        : <button type="button" className="btn-sm ghost today-exc-more" onClick={() => { setAll(true); setFocusAt(shown.length); }}>{moreAr}</button>)}
      {failed && <LoadError message={deskNote(t)} onRetry={onRetry} />}
    </section>
  );
}

// ── سطر المصفوفة (البند 6): عدد واحد من مصدره (matrix.js، idleCount: آخر ما حسبته المصفوفة في هذه الجلسة)، والأسماء
// في قسم «متوقفون وطلبات إعادة فتح» هناك وحده. لا طلب عند فتح النظرة العامة: قبل فتح المصفوفة يُعرض رابطًا بلا رقم
function MatrixLine() {
  const m = idleCount();
  if (m && m.n === 0) return null;
  return (
    <p className="today-mx la-muted">
      <a className="la-link" href={IDLE_HREF()} title={`لم تُقدَّم ولم تُعدَّل منذ ${IDLE_DAYS} يومًا`}>
        {m ? <><bdi>{m.n}</bdi> متوقفون في مصفوفة التأثير ←</> : 'المتوقفون في مصفوفة التأثير ←'}
      </a>
    </p>
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
  const [o, setO] = useState(null);
  const [n, setN] = useState(0);
  const [view, setView] = useState('');
  // رد الصندوق من مخزن العدّادات نفسه (pending.js): طلب واحد يرسم الصندوق والأرقام والعدّادات، فيُرسم الصندوق فورًا
  const [inbox] = useInbox();
  const [today, retryToday] = useToday();
  useEffect(() => {
    let live = true;
    Promise.all([
      L('admin.health').catch(() => null),
      L('admin.platform-health').catch(() => ({ success: false })),
    ]).then(([h, ph]) => live && setD({ h, ph }));
    return () => { live = false; };
  }, []);
  // أرقام النظرة العامة مستقلة: إعادة محاولتها لا تمسح أحكام الصحة التي وصلت (البند 8)
  useEffect(() => {
    let live = true;
    setO(null);
    L('admin.overview', {}).catch((e) => ({ success: false, message: e?.message })).then((r) => live && setO(r));
    return () => { live = false; };
  }, [n]);

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
        <QuickLinks onTab={onTab} canWrite={canWrite} />
      </header>
      {/* جلسة رمز البريد: شريط «للقراءة فقط» بزر «فعّل الكتابة» في إطار اللوحة (App.jsx) لا هنا، فيظهر في كل صفحة */}
      <h2 className="today-sec">قرارات اليوم</h2>
      {/* صندوق واحد لكل ما ينتظر القرار (Inbox.jsx، admin.inbox)، ومنه طلبات المتطلبات (النوع requirement). لا يُدمج بغيره */}
      <div id="today-decisions" tabIndex={-1} className="today-decisions">
        <Inbox contacts={pending?.contacts || 0} canWrite={canWrite} onPerson={onPerson} view={view} onView={setView} />
      </div>
      <TodayNumbers nums={nums} view={view} onView={toDecisions} loading={!o} />
      {o && !o.success && <LoadError message={o.message || 'تعذّرت قراءة أرقام النظرة العامة'} onRetry={() => setN((x) => x + 1)} />}
      <Attention d={d} t={today} orgs={orgs} orgsLoaded={orgsLoaded !== false} canWrite={canWrite} onRetry={retryToday} />
      <DeskNote t={today?.success ? today : null} />
      <MatrixLine />
      <TrendSection />
    </>
  );
}
