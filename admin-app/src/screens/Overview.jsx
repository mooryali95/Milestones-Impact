// ════════════════════════════════════════════════════════════════
// مكتب اليوم (نظرة عامة على تطبيق القادة): ماذا أفعل اليوم؟
// ════════════════════════════════════════════════════════════════
// المرحلة 3أ من تصور لوحة الإدارة (4.3): التحية والتاريخ وشارة صحة واحدة، ثم «قرارات اليوم» (صندوق admin.inbox نفسه)،
// ثم أربعة أرقام من الصندوق والنظرة العامة، ثم (المرحلة 3ب) «تنبيهات» و«نبض الدفعات» من admin.today، ثم روابط سريعة،
// ثم طابور المتطلبات حتى تنتقل إلى «المراجعات» (المرحلة 5).
// بطاقات التحليل انتقلت إلى «الرؤية الشاملة» (Analytics.jsx)، والمنطق الخالص للأرقام والشارة في today.js.
import React, { useEffect, useState } from 'react';
import Inbox from './Inbox.jsx';
import { L, isSuperAdmin } from '../leaders.js';
import { session } from '../api.js';
import { dateTime, dayFull } from '../dates.js';
import { focusOpsCard, OpsHealthCard, OPS_REVEAL, opsRevealPending } from '../OpsHealth.jsx';
import { useOpsHealth } from '../ops-watch.js';
import { useInbox } from '../pending.js';
import { Spinner, useUI } from '../ui.jsx';
import { DemoLinks, resetConfirmAr, useDemoLinks } from '../DemoLinks.jsx';
import ReqQueue from './ReqQueue.jsx';
import { readinessSummary } from '../org-hub.js';
import { ageAr } from '../../../supabase/functions/leaders-api/inbox.js';
import { alertHref, deskNote, greetingAr, healthLine, healthOpen, healthProblems, orgsReadinessRows, problemsSig, STALE_DAYS, systemNotes, todayNumbers, waitingSub } from '../today.js';

// حالة النظام: ترحيلات لم تُطبَّق بوسم بوابة النشر، وأسرار ناقصة، واقتراب البريد من سقفه اليومي، وما تعذّرت قراءته منها.
// الوسم من الخادم (pending_migrations، المصدر نفسه لبوابات المراحل): المؤجل بقرار لا يُطلب تطبيقه. خادم قبل الحقل يُقرأ كما كان
function Health({ h }) {
  if (!systemNotes(h)) return null;
  const near = h.mail.today >= h.mail.cap * 0.8;
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

// الحساب التجريبي للورش: يفتح تطبيق المشارك من شاشة الدخول مع جولة الخطوات، ويُعاد إلى البداية بضغطة
function DemoCard() {
  const { toast, confirm } = useUI();
  const [busy, setBusy] = useState(false);
  // روابط التجربة: تُسمّى النشطة منها في تأكيد إعادة الضبط، فالحساب واحد يشتركون فيه
  const links = useDemoLinks();
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
    // القائمة تُقرأ من جديد قبل السؤال: رابط أنشأه مدير آخر للتو يُذكر باسمه
    const now = await links.load();
    if (!(await confirm(resetConfirmAr(now?.success ? now.links : links.state?.links), { danger: true }))) return;
    setBusy(true);
    const r = await L('admin.demo-reset');
    setBusy(false);
    toast(r.success ? 'أُعيد الحساب التجريبي إلى البداية' : r.message);
  };
  return (
    <section className="la-card la-demo">
      <div className="la-row between">
        <div><b>الحساب التجريبي</b><><p className="la-muted">للورش: جولة حيّة كاملة بحساب لا يدخل الإحصاءات.</p><details className="la-more small muted"><summary>كيف يعمل؟</summary><p>للورش: يفتح المنصة من شاشة الدخول، وجولة حيّة بثماني عشرة خطوة تضيء كل عنصر وتشرح المنظومة كاملة. في أعلى شاشاته شريط «حساب تجريبي» وفيه «تخطَّ هذه المرحلة» و«افتح كل المراحل»، فتُعرض الرحلة كلها في جلسة واحدة. لا يدخل الإحصاءات ولا يصله بريد ولا تصدر له شهادة.</p></details></></div>
        <span className="la-row">
          <button className="btn-sm primary" disabled={busy} onClick={openDemo}>افتح الحساب التجريبي</button>
          <button className="btn-sm ghost" disabled={busy} onClick={reset}>أعِده إلى البداية</button>
        </span>
      </div>
      <DemoLinks state={links.state} load={links.load} />
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

function HealthBadge({ h, orgs, orgsLoaded = true, onOrg, onTab, canWrite }) {
  const writer = canWrite !== false;
  const ops = useOpsHealth(writer);
  const [chosen, setChosen] = useState(readChosen);
  // شريط العطل الأحمر (OpsBanner) يكشف البطاقة ولو طواها المدير، ثم يقع التركيز عليها
  const [reveal, setReveal] = useState(opsRevealPending);
  useEffect(() => {
    const on = () => setReveal(true);
    window.addEventListener(OPS_REVEAL, on);
    return () => window.removeEventListener(OPS_REVEAL, on);
  }, []);
  const problems = healthProblems({ ops: writer ? ops : null, h, orgs, canWrite: writer, withOrgs: !!onOrg });
  // ما لم يصل بعد من مصادر الشارة (صحة البريد، والجهات) لا يُحكم عليه بالسلامة
  const checking = (writer && !ops.verdict && !ops.failed) || (writer && !!onOrg && !orgsLoaded);
  const sig = problemsSig(problems);
  const open = reveal || healthOpen(sig, chosen);
  useEffect(() => { if (open) focusOpsCard(); }, [open]);
  const toggle = () => { const v = { sig, open: !open }; setReveal(false); setChosen(v); writeChosen(v); };
  const bad = problems.length > 0;
  const state = bad ? 'attention' : checking ? 'checking' : 'ok';
  return (
    <section className={`today-health${bad ? ' bad' : ''}`} aria-label="صحة المنظومة" data-state={state}>
      <button type="button" id="th-toggle" className="th-toggle" aria-expanded={open} aria-controls="th-body" onClick={toggle}>
        <span className="th-ic" aria-hidden="true">{bad ? '!' : checking ? '…' : '✓'}</span>
        <span className="th-line">{healthLine(problems, checking)}</span>
        <span className="ops-chev" aria-hidden="true" />
      </button>
      <div id="th-body" className="th-body" role="region" aria-label="تفاصيل صحة المنظومة" hidden={!open}>
        {/* صحة البريد والتنبيه (للمدير ذي الكتابة): أخضر أو كهرماني أو أحمر، وشريطها الأحمر في App.jsx */}
        <OpsHealthCard enabled={writer} isSuper={isSuperAdmin()} />
        {!h?.success && <p className="la-note" role="status">تعذّرت قراءة حالة النظام{writer ? ' وجاهزية الإطلاق' : ''} الآن، فلا يُعرف إن كانت سليمة. أعد فتح الصفحة بعد قليل.</p>}
        <Health h={h} />
        {writer && <DemoCard />}
        {writer && <Readiness items={h?.readiness} onTab={onTab} />}
        {writer && onOrg && <OrgsReadiness orgs={orgs} onOrg={onOrg} />}
        {!bad && !checking && !writer && <p className="la-muted">حالة النظام سليمة.</p>}
      </div>
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
    { key: 'program', label: 'المشاركون في البرنامج', value: nums.program ? `${nums.program.n} من ${nums.program.of}` : null, sub: nums.program ? 'من أصل المسجلين' : 'تعذّرت قراءة الأرقام', go: () => onTab?.('participants') },
  ];
  return (
    <div className="stats-grid today-nums" role="group" aria-label="أرقام اليوم">
      {cells.map((c) => (
        <button key={c.key} type="button" className={`stat-card today-n${c.tone ? ` ${c.tone}` : ''}`} data-k={c.key} onClick={c.go}>
          <span className="stat-label">{c.label}</span><span className="stat-value">{c.value == null ? <><span aria-hidden="true">·</span><span className="sr-only">غير مقروء</span></> : <bdi dir="ltr">{c.value}</bdi>}</span><span className="stat-sub">{c.sub}</span>
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

// عمود الجهة للدفعة بلا اسم جهة: دفعة الجهة التي لم يُقرأ اسمها «جهة»، لا «أفراد»
const KIND_AR = { open: 'مفتوحة', individuals: 'أفراد', org: 'جهة' };
// «نبض الدفعات»: سطر لكل دفعة جارية بجاهزيتها (ملف الدفعة نفسه) وأقرب جلسة وما ينتظر قرارًا لأعضائها.
// جدول يصير بطاقات على الهاتف (leaders-admin.css). يختفي حين لا دفعة جارية
function Pulse({ t }) {
  const rows = t?.success ? t.pulse || [] : [];
  if (!rows.length) return null;
  const plus = t.waiting_partial ? '+' : '';
  return (
    <section className="today-pulse" aria-labelledby="today-pulse-h">
      <h2 className="today-sec" id="today-pulse-h">نبض الدفعات</h2>
      <div className="today-pulse-wrap">
        {/* الأدوار صريحة: البطاقات على الهاتف (display: block) تُسقط دلالة الجدول في Safari وVoiceOver */}
        <table className="la-table today-pulse-t" role="table">
          <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">الدفعة</th><th scope="col" role="columnheader">الجهة</th><th scope="col" role="columnheader">الجاهزية</th><th scope="col" role="columnheader">أقرب جلسة</th><th scope="col" role="columnheader">ينتظر قرارًا</th></tr></thead>
          <tbody role="rowgroup">
            {rows.map((r) => (
              <tr key={r.id} data-id={r.id} role="row">
                <th scope="row" role="rowheader" data-label="الدفعة"><a className="la-link" href={`#/leaders/programs/${encodeURIComponent(r.id)}`}>{r.name}</a></th>
                <td role="cell" data-label="الجهة">{r.org || <span className="la-muted">{KIND_AR[r.kind] || 'جهة'}</span>}</td>
                <td role="cell" data-label="الجاهزية"><span className={`la-chip ${r.readiness.missing ? 'warn' : 'ok'}`}>{r.readiness.summary}</span></td>
                <td role="cell" data-label="أقرب جلسة">{r.next_at ? dateTime(r.next_at) : r.handbook ? <span className="la-muted">صيغة الكتاب</span> : t.unchecked?.includes('cohort_no_session') ? <span className="la-muted">غير مقروءة</span> : <span className="la-muted">لا جلسة مؤرخة</span>}</td>
                <td role="cell" data-label="ينتظر قرارًا">{r.waiting == null ? <span className="la-muted">غير مقروء</span> : <bdi dir="ltr">{r.waiting}{r.waiting ? plus : ''}</bdi>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

// «صحة المنصة» (admin.platform-health): خمسة فحوص تشغيلية للقراءة وحدها، أخضر أو كهرماني أو أحمر، وسطر علاج لكل خلل.
// الأحكام والنصوص من الخادم (platform-health.js)، فلا تُكتب هنا مرة ثانية. تعذّر القراءة سطر خافت، ورد بلا فحوص لا يُرسم
const PH_DOT = { ok: '✓', warn: '!', bad: '✕', unknown: '?' };
const PH_LEVEL_AR = { ok: 'سليم', warn: 'يحتاج انتباهًا', bad: 'خلل', unknown: 'غير معروف' };
function PlatformHealth() {
  const [r, setR] = useState(null);
  useEffect(() => {
    let live = true;
    L('admin.platform-health').then((x) => live && setR(x), () => live && setR({ success: false }));
    return () => { live = false; };
  }, []);
  if (!r) return null;
  if (!r.success) return <p className="la-muted small ph-err">تعذّرت قراءة صحة المنصة الآن.</p>;
  if (!Array.isArray(r.checks) || !r.checks.length) return null;
  return (
    <section className="la-card ph-card" aria-label="صحة المنصة" data-level={r.level}>
      <h3 className="ph-title">صحة المنصة <small className="la-muted">· {PH_LEVEL_AR[r.level] || ''}</small></h3>
      <ul className="ph-rows">
        {r.checks.map((c) => (
          <li key={c.key} className={`ph-row ph-${c.level}`} data-level={c.level}>
            <span className="ph-dot" aria-hidden="true">{PH_DOT[c.level] || '?'}</span>
            <span className="ph-main"><b>{c.label}</b> <span className="ph-line">{c.line}</span>
              {c.remedy && <span className="ph-remedy">{c.remedy}</span>}</span>
            <span className="sr-only">{PH_LEVEL_AR[c.level]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Overview({ orgs, orgsLoaded, onPerson, onOrg, onTab, pending, canWrite }) {
  const [d, setD] = useState(null);
  const [n, setN] = useState(0);
  const [view, setView] = useState('');
  // رد الصندوق من مخزن العدّادات نفسه (pending.js): طلب واحد يرسم الصندوق والأرقام والعدّادات
  const [inbox] = useInbox();
  const today = useToday();
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
  // admin.overview لا يغذي في المكتب إلا الرقم الرابع: تعذّره لا يحجب الصحة والقرارات والطابور
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
      <HealthBadge h={h} orgs={orgs} orgsLoaded={orgsLoaded} onOrg={onOrg} onTab={onTab} canWrite={canWrite} />
      {/* جلسة رمز البريد: شريط «للقراءة فقط» بزر «فعّل الكتابة» في إطار اللوحة (App.jsx) لا هنا، فيظهر في كل صفحة */}

      <h2 className="today-sec">قرارات اليوم</h2>
      {/* صندوق واحد لكل ما ينتظر القرار (Inbox.jsx، admin.inbox) */}
      <div id="today-decisions" tabIndex={-1} className="today-decisions">
        <Inbox contacts={pending?.contacts || 0} canWrite={canWrite} onPerson={onPerson} view={view} onView={setView} />
      </div>
      <TodayNumbers nums={nums} onView={toDecisions} onTab={onTab} />
      {!o.success && <div className="la-err" role="alert">{o.message || 'تعذّرت قراءة أرقام النظرة العامة.'}</div>}
      <Alerts t={today} />
      <Pulse t={today} />
      <DeskNote t={today} />
      <QuickLinks onTab={onTab} canWrite={canWrite} />
      <PlatformHealth />
      <div id="rq"><ReqQueue rows={r.submitted || []} canWrite={canWrite} onPerson={onPerson} onDone={() => setN((x) => x + 1)} /></div>
    </>
  );
}
