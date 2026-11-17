// ════════════════════════════════════════════════════════════════
// مكتب اليوم (نظرة عامة على تطبيق القادة): ماذا أفعل اليوم؟
// ════════════════════════════════════════════════════════════════
// المرحلة 3أ من تصور لوحة الإدارة (4.3): التحية والتاريخ وشارة صحة واحدة، ثم «قرارات اليوم» (صندوق admin.inbox نفسه)،
// ثم أربعة أرقام من الصندوق والنظرة العامة، ثم روابط سريعة، ثم طابور المتطلبات حتى تنتقل إلى «المراجعات» (المرحلة 5).
// بطاقات التحليل انتقلت إلى «الرؤية الشاملة» (Analytics.jsx)، والمنطق الخالص للأرقام والشارة في today.js.
import React, { useEffect, useState } from 'react';
import Inbox from './Inbox.jsx';
import { L, isSuperAdmin } from '../leaders.js';
import { session } from '../api.js';
import { dayFull } from '../dates.js';
import { OpsHealthCard } from '../OpsHealth.jsx';
import { useOpsHealth } from '../ops-watch.js';
import { useInbox } from '../pending.js';
import { Spinner, useUI } from '../ui.jsx';
import ReqQueue from './ReqQueue.jsx';
import { readinessSummary } from '../org-hub.js';
import { ageAr } from '../../../supabase/functions/leaders-api/inbox.js';
import { greetingAr, healthLine, healthOpen, healthProblems, orgsReadinessRows, problemsSig, STALE_DAYS, systemIssues, todayNumbers } from '../today.js';

// حالة النظام: ترحيلات لم تُطبَّق بوسم بوابة النشر، وأسرار ناقصة، واقتراب البريد من سقفه اليومي، وما تعذّرت قراءته منها.
// الوسم من الخادم (pending_migrations، المصدر نفسه لبوابات المراحل): المؤجل بقرار لا يُطلب تطبيقه. خادم قبل الحقل يُقرأ كما كان
function Health({ h }) {
  if (!systemIssues(h)) return null;
  const near = h.mail.today >= h.mail.cap * 0.8;
  const unread = h.migrations_ledger === false || h.mail.today == null;
  const pending = h.pending_migrations || (h.missing_migrations || []).map((name) => ({ name, gate: 'blocking' }));
  const gate = (g) => pending.filter((m) => m.gate === g);
  const files = (list) => list.map((m) => <code key={m.name}>{m.name}.sql</code>);
  return (
    <div className="la-note la-health" role="status">
      <b>حالة النظام</b>
      {h.migrations_ledger === false && <p>تعذّرت قراءة سجل الترحيلات، فلا يُعرف ما لم يُطبَّق.</p>}
      {h.mail.today == null && <p>تعذّرت قراءة عداد البريد: لا يخرج الآن إلا الرموز والتنبيه، والتذكيرات في الطابور.</p>}
      {gate('blocking').length > 0 && <p>ترحيلات لم تُطبَّق على الإنتاج، تُطبَّق بسير migrate.yml بأسمائها قبل نشر الدوال: {files(gate('blocking'))}</p>}
      {gate('tolerant').length > 0 && <p>ترحيلات لم تُطبَّق تعمل الدوال قبلها وبعدها، تُطبَّق بسير migrate.yml في أقرب نافذة: {files(gate('tolerant'))}</p>}
      {gate('deferred').length > 0 && <p>ترحيلات مؤجلة بقرار، لا تُطبَّق قبل رفع التأجيل: {gate('deferred').map((m) => <span key={m.name}><code>{m.name}.sql</code>{m.note ? ` (${m.note})` : ''} </span>)}</p>}
      {h.missing_secrets.length > 0 && <p>أسرار ناقصة في دالة leaders-api: {h.missing_secrets.map((k) => <code key={k}>{k}</code>)}</p>}
      {near && <p>رسائل الرموز اليوم {h.mail.today} من {h.mail.cap}. عند السقف يتوقف إرسال الرموز حتى الغد، ويبقى الدخول بمفتاح المرور.</p>}
    </div>
  );
}

// جاهزية الإطلاق: تختفي حين تكتمل البنود كلها
function Readiness({ items, onTab }) {
  const todo = (items || []).filter((x) => !x.ok);
  if (!todo.length) return null;
  return (
    <section className="la-card la-ready" aria-label="جاهزية الإطلاق">
      <div className="la-row between"><h3>جاهزية الإطلاق</h3><span className="la-muted">{items.length - todo.length} من {items.length}</span></div>
      <ul>
        {items.map((x) => (
          <li key={x.key} className={x.ok ? 'ok' : ''}>
            <span aria-hidden="true">{x.ok ? '✓' : '○'}</span>
            <span>{x.label}
              {/* الناقص بأسمائه: كل اسم يفتح ملف الجهة أو الدفعة نفسها، والبرنامج قائمة البرامج (لا ملف لكل برنامج) */}
              {!x.ok && x.refs?.length > 0 && <span className="la-ready-refs">{x.refs.map((r) => (
                <a key={r.id} className="la-chip warn" href={r.kind === 'org' ? `#/leaders/orgs/${encodeURIComponent(r.id)}` : r.kind === 'program' ? '#/leaders/programs' : `#/leaders/programs/${encodeURIComponent(r.id)}`}>{r.name}</a>
              ))}</span>}
            </span>
            {!x.ok && onTab && x.where && !x.refs?.length && <button className="la-link" onClick={() => onTab(x.where)}>اضبطه</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// جاهزية الجهات: سطر لكل جهة فعّالة بما بقي فيها (org-hub.js نفسه الذي في رأس صفحتها)، ويفتح صفحتها.
// المستوى الأوسط بين جاهزية الإطلاق (المنظومة) وملف الدفعة. حال الدفعة من admin.orgs (orgCohortSetups)، المصدر
// نفسه لصفحة الجهة، فلا يقول السطر «جاهزة» وصفحتها تقول غير ذلك
function OrgsReadiness({ orgs, onOrg }) {
  const rows = orgsReadinessRows(orgs);
  if (!rows.length) return null;
  const ready = rows.filter((x) => !x.r.missing).length;
  return (
    <section className="la-card la-ready" aria-label="جاهزية الجهات">
      <div className="la-row between"><h3>جاهزية الجهات</h3><span className="la-muted">{ready} من {rows.length} جاهزة</span></div>
      <ul>
        {rows.map(({ o, r }) => (
          <li key={o.id} className={r.missing ? '' : 'ok'}>
            <span aria-hidden="true">{r.missing ? '○' : '✓'}</span>
            <span><button className="la-link" onClick={() => onOrg(o.id)}><b>{o.name}</b></button>
              {r.missing > 0 && <small className="la-muted"> · {r.items.filter((x) => !x.ok).map((x) => x.title).join('، ')}</small>}</span>
            <span className={`la-chip ${r.missing ? 'warn' : 'ok'}`}>{readinessSummary(r)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// حساب العرض للورش: يفتح تطبيق المشارك من شاشة الدخول مع جولة الخطوات، ويُعاد إلى البداية بضغطة
function DemoCard() {
  const { toast, confirm } = useUI();
  const [busy, setBusy] = useState(false);
  const openDemo = async () => {
    // النافذة تُفتح فورًا بضغطة المستخدم، ثم يُكتب فيها الرابط، فلا يمنعها المتصفح
    const w = window.open('', '_blank');
    setBusy(true);
    const r = await L('admin.demo-open');
    setBusy(false);
    if (!r.success) { w?.close(); return toast(r.message); }
    if (w) w.location.href = r.url; else location.href = r.url;
  };
  const reset = async () => {
    if (!(await confirm('إعادة حساب العرض إلى البداية؟ تُمسح إجاباته وتقدمه، ويبدأ العرض التالي من شاشة الدخول.'))) return;
    setBusy(true);
    const r = await L('admin.demo-reset');
    setBusy(false);
    toast(r.success ? 'أُعيد حساب العرض إلى البداية' : r.message);
  };
  return (
    <section className="la-card la-demo">
      <div className="la-row between">
        <div><b>حساب العرض التوضيحي</b><p className="la-muted">للورش: يفتح المنصة من شاشة الدخول، وجولة حيّة بثماني عشرة خطوة تضيء كل عنصر وتشرح المنظومة كاملة. لا يدخل الإحصاءات ولا يصله بريد.</p></div>
        <span className="la-row">
          <button className="btn-sm primary" disabled={busy} onClick={openDemo}>افتح حساب العرض</button>
          <button className="btn-sm ghost" disabled={busy} onClick={reset}>أعِده إلى البداية</button>
        </span>
      </div>
    </section>
  );
}


// ── شارة الصحة: سطر واحد مطوي حين يسلم كل شيء، ويتمدد وحده عند الخلل ──
// تجمع ما كان خمس بطاقات (صحة البريد، وحالة النظام، وحساب العرض، وجاهزية الإطلاق، وجاهزية الجهات) بفحوصها وأزرارها
// وبواباتها كما هي، والذي تغيّر هو الوعاء وحده. اختيار المدير (طي أو فتح) لهذه الجلسة وحدها، مقرون ببصمة الحال
// (healthOpen)، فخلل جديد يفتح الشارة ولو طواها قبله
const HEALTH_KEY = 'mi_admin_today_health';
const readChosen = () => { try { return JSON.parse(sessionStorage.getItem(HEALTH_KEY) || 'null'); } catch { return null; } };
const writeChosen = (v) => { try { sessionStorage.setItem(HEALTH_KEY, JSON.stringify(v)); } catch { /* التخزين محجوب: الاختيار لهذا الرسم */ } };

function HealthBadge({ h, orgs, onOrg, onTab, canWrite }) {
  const writer = canWrite !== false;
  const ops = useOpsHealth(writer);
  const [chosen, setChosen] = useState(readChosen);
  const problems = healthProblems({ ops: writer ? ops : null, h, orgs, canWrite: writer, withOrgs: !!onOrg });
  const sig = problemsSig(problems);
  const open = healthOpen(sig, chosen);
  const toggle = () => { const v = { sig, open: !open }; setChosen(v); writeChosen(v); };
  const bad = problems.length > 0;
  return (
    <section className={`today-health${bad ? ' bad' : ''}`} aria-label="صحة المنظومة" data-state={bad ? 'attention' : 'ok'}>
      <button type="button" id="th-toggle" className="th-toggle" aria-expanded={open} aria-controls="th-body" onClick={toggle}>
        <span className="th-ic" aria-hidden="true">{bad ? '!' : '✓'}</span>
        <span className="th-line">{healthLine(problems)}</span>
        <span className="ops-chev" aria-hidden="true" />
      </button>
      <div id="th-body" className="th-body" role="region" aria-label="تفاصيل صحة المنظومة" hidden={!open}>
        {/* صحة البريد والتنبيه (للمدير ذي الكتابة): أخضر أو كهرماني أو أحمر، وشريطها الأحمر في App.jsx */}
        <OpsHealthCard enabled={writer} isSuper={isSuperAdmin()} />
        <Health h={h} />
        {writer && <DemoCard />}
        {writer && <Readiness items={h?.readiness} onTab={onTab} />}
        {writer && onOrg && <OrgsReadiness orgs={orgs} onOrg={onOrg} />}
        {!bad && !writer && <p className="la-muted">حالة النظام سليمة.</p>}
      </div>
    </section>
  );
}

// ── الأرقام الأربعة: من الصندوق والنظرة العامة المحمّلين أصلًا، وكل رقم يفتح عرضه في الصندوق حيث وُجد ──
function TodayNumbers({ nums, onView, onTab }) {
  const plus = nums.partial ? '+' : '';
  const v = (x) => (x == null ? '·' : `${x}${plus}`);
  const w = nums.waiting;
  const cells = [
    { key: 'waiting', label: 'القرارات المنتظرة', value: v(w?.n), sub: w?.oldest != null && w.n ? `أقدمها ${ageAr(w.oldest)}` : 'لا شيء ينتظر', go: () => onView('') },
    { key: 'late', label: 'المتجاوز للمهلة الآن', value: v(nums.late), sub: 'تجاوز مهلة نوعه', go: () => onView('late'), tone: nums.late ? 'bad' : '' },
    { key: 'stale', label: `المنتظر منذ أكثر من ${STALE_DAYS} أيام`, value: v(nums.stale), sub: 'بعمر البند في الصندوق', go: () => onView('stale'), tone: nums.stale ? 'warn' : '' },
    { key: 'program', label: 'المشاركون في البرنامج', value: nums.program ? `${nums.program.n} من ${nums.program.of}` : '·', sub: 'من أصل المسجلين', go: () => onTab?.('participants') },
  ];
  return (
    <div className="stats-grid today-nums" role="group" aria-label="أرقام اليوم">
      {cells.map((c) => (
        <button key={c.key} type="button" className={`stat-card today-n${c.tone ? ` ${c.tone}` : ''}`} data-k={c.key} onClick={c.go}>
          <span className="stat-label">{c.label}</span><span className="stat-value">{c.value}</span><span className="stat-sub">{c.sub}</span>
        </button>
      ))}
    </div>
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

export default function Overview({ orgs, onPerson, onOrg, onTab, pending, canWrite }) {
  const [d, setD] = useState(null);
  const [n, setN] = useState(0);
  const [view, setView] = useState('');
  // رد الصندوق من مخزن العدّادات نفسه (pending.js): طلب واحد يرسم الصندوق والأرقام والعدّادات
  const [inbox] = useInbox();
  useEffect(() => {
    let live = true;
    setD(null);
    Promise.all([
      L('admin.overview', {}), L('admin.reviews', {}),
      L('admin.health').catch(() => null),
    ]).then(([o, r, h]) => live && setD({ o, r, h }));
    return () => { live = false; };
  }, [n]);

  if (!d) return <Spinner />;
  const { o, r, h } = d;
  if (!o.success) return <div className="la-err" role="alert">{o.message}</div>;
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
      <HealthBadge h={h} orgs={orgs} onOrg={onOrg} onTab={onTab} canWrite={canWrite} />
      {/* جلسة رمز البريد: شريط «للقراءة فقط» بزر «فعّل الكتابة» في إطار اللوحة (App.jsx) لا هنا، فيظهر في كل صفحة */}

      <h2 className="today-sec">قرارات اليوم</h2>
      {/* صندوق واحد لكل ما ينتظر القرار (Inbox.jsx، admin.inbox) */}
      <div id="today-decisions" tabIndex={-1} className="today-decisions">
        <Inbox contacts={pending?.contacts || 0} canWrite={canWrite} onPerson={onPerson} view={view} onView={setView} />
      </div>
      <TodayNumbers nums={nums} onView={toDecisions} onTab={onTab} />
      <QuickLinks onTab={onTab} canWrite={canWrite} />
      <div id="rq"><ReqQueue rows={r.submitted || []} canWrite={canWrite} onPerson={onPerson} onDone={() => setN((x) => x + 1)} /></div>
    </>
  );
}
