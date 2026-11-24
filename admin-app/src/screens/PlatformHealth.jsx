// ════════════════════════════════════════════════════════════════
// الإعداد › صحة المنصة: بيت واحد لجاهزية الإطلاق وفحوص المنصة وحالة النظام وبيئة التجربة
// ════════════════════════════════════════════════════════════════
// تصور تبويبات الإدارة 2026-11-24 (المرحلة أ، القسم 0.1): نُقلت هذه البطاقات من «نظرة عامة» كما هي، و«نظرة عامة» تقرأ
// حكمها وحده سطرًا في شريط «يحتاج انتباهك» (today.js exceptionRows). القاعدة: لا يُصلح بند هنا؛ تُعرض الحال ويُنقل
// المدير إلى مكان الإصلاح. صحة البريد والتنبيه بطاقتها في مركز البريد، وهنا حكمها سطرًا برابط إليها.
// كل مكوّن مجال هنا يُرسم من هذه الشاشة وحدها (حارسه single-source.test.js).
import React, { useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { refresh as refreshOps, useOpsHealth } from '../ops-watch.js';
import { Spinner, useUI } from '../ui.jsx';
import { DemoLinks, resetConfirmAr, useDemoLinks } from '../DemoLinks.jsx';
import { readinessSummary } from '../org-hub.js';
import { dateTime } from '../dates.js';
import { exceptionRows, orgsReadinessRows, systemNotes } from '../today.js';

// وجهة بند الجاهزية الناقص: اسم الجهة أو الدفعة يفتح ملفها، والبرنامج قائمة البرامج (لا ملف لكل برنامج)
const refHref = (r) => (r.kind === 'org' ? `#/leaders/orgs/${encodeURIComponent(r.id)}` : r.kind === 'program' ? '#/leaders/programs' : `#/leaders/programs/${encodeURIComponent(r.id)}`);

// حالة النظام: ترحيلات لم تُطبَّق بوسم بوابة النشر، وأسرار ناقصة، واقتراب البريد من سقفه اليومي، وما تعذّرت قراءته منها.
// الوسم من الخادم (pending_migrations، المصدر نفسه لبوابات المراحل): المؤجل بقرار لا يُطلب تطبيقه. خادم قبل الحقل يُقرأ كما كان
function SystemState({ h }) {
  if (!h?.success) return <p className="la-note" role="status">تعذّرت قراءة حالة النظام الآن، فلا يُعرف إن كانت سليمة. أعد الفحص بعد قليل.</p>;
  if (!systemNotes(h)) return <section className="la-card ph-sys" aria-label="حالة النظام"><b>حالة النظام</b> <span className="la-muted">· سليمة: الترحيلات مطبقة والأسرار مضبوطة.</span></section>;
  const near = h.mail.today >= h.mail.cap * 0.8;
  const pending = h.pending_migrations || (h.missing_migrations || []).map((name) => ({ name, gate: 'blocking' }));
  const gate = (g) => pending.filter((m) => m.gate === g);
  const files = (list) => list.map((m) => <code key={m.name}>{m.name}.sql</code>);
  return (
    <div className="la-note la-health" role="status" aria-label="حالة النظام">
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

// جاهزية الإطلاق: كل بند ناقص يحمل رابطه إلى حيث يُصلح (where وrefs من admin.health)، والمكتمل مطوي تحت عدده
function Readiness({ items }) {
  const all = items || [];
  if (!all.length) return null;
  const todo = all.filter((x) => !x.ok);
  const done = all.filter((x) => x.ok);
  return (
    <section className="la-card la-ready" aria-label="جاهزية الإطلاق" data-missing={todo.length}>
      <div className="la-row between"><h3>جاهزية الإطلاق</h3><span className="la-muted">{done.length} من {all.length}</span></div>
      {todo.length > 0 && (
        <ul>
          {todo.map((x) => (
            <li key={x.key} data-key={x.key}>
              <span aria-hidden="true">○</span>
              <span>{x.label}
                {x.refs?.length > 0 && <span className="la-ready-refs">{x.refs.map((r) => <a key={r.id} className="la-chip warn" href={refHref(r)}>{r.name}</a>)}</span>}
              </span>
              {x.where && !x.refs?.length && <a className="la-link" href={`#/leaders/${x.where}`}>اضبطه ←</a>}
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <details className="la-ready-done">
          <summary className="la-muted">{done.length === 1 ? 'بند مكتمل' : `${done.length} مكتملة`}</summary>
          <ul>{done.map((x) => <li key={x.key} className="ok"><span aria-hidden="true">✓</span><span>{x.label}</span></li>)}</ul>
        </details>
      )}
    </section>
  );
}

// جاهزية الجهات: سطر لكل جهة فعّالة بما بقي فيها (org-hub.js نفسه الذي في رأس صفحتها)، ويفتح صفحتها
function OrgsReadiness({ orgs }) {
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
            <span><a className="la-link" href={`#/leaders/orgs/${encodeURIComponent(o.id)}`}><b>{o.name}</b></a>
              {r.missing > 0 && <small className="la-muted"> · {r.items.filter((x) => !x.ok).map((x) => x.title).join('، ')}</small>}</span>
            <span className={`la-chip ${r.missing ? 'warn' : 'ok'}`}>{readinessSummary(r)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// الفحوص التشغيلية (admin.platform-health): الأحكام والنصوص من الخادم (platform-health.js) كما هي، وسطر علاج لكل خلل
const PH_DOT = { ok: '✓', warn: '!', bad: '✕', unknown: '?' };
const PH_LEVEL_AR = { ok: 'سليم', warn: 'يحتاج انتباهًا', bad: 'خلل', unknown: 'غير معروف' };
function PlatformChecks({ r }) {
  if (!r) return null;
  if (!r.success) return <p className="la-muted small ph-err">تعذّرت قراءة فحوص المنصة الآن.</p>;
  if (!Array.isArray(r.checks) || !r.checks.length) return null;
  return (
    <section className="la-card ph-card" aria-label="الفحوص التشغيلية" data-level={r.level}>
      <div className="ph-title"><b>الفحوص التشغيلية</b> <small className="la-muted">· {PH_LEVEL_AR[r.level] || ''}</small></div>
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

// صحة البريد والتنبيه: بطاقتها الكاملة في مركز البريد (المصدر الواحد)، وهنا حكمها سطرًا برابط إليها
function MailVerdict({ enabled }) {
  const { verdict, failed } = useOpsHealth(enabled);
  if (!enabled) return null;
  const lv = failed ? 'unread' : verdict?.level;
  const text = failed ? 'تعذّرت قراءة صحة البريد والتنبيه الآن.' : !verdict ? 'جارٍ الفحص…' : verdict.title;
  return (
    <section className="la-card ph-mail" aria-label="البريد والتنبيه" data-level={lv || 'checking'}>
      <b>البريد والتنبيه</b> <span className="la-muted">· {text}</span>{' '}
      <a className="la-link" href="#/leaders/mailcenter">التفاصيل في مركز البريد ←</a>
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
        <div><b>الحساب التجريبي</b><p className="la-muted">للورش: جولة حيّة كاملة بحساب لا يدخل الإحصاءات.</p><details className="la-more small muted"><summary>كيف يعمل؟</summary><p>للورش: يفتح المنصة من شاشة الدخول، وجولة حيّة بثماني عشرة خطوة تضيء كل عنصر وتشرح المنظومة كاملة. في أعلى شاشاته شريط «حساب تجريبي» وفيه «تخطَّ هذه المرحلة» و«افتح كل المراحل»، فتُعرض الرحلة كلها في جلسة واحدة. لا يدخل الإحصاءات ولا يصله بريد ولا تصدر له شهادة.</p></details></div>
        <span className="la-row">
          <button className="btn-sm primary" disabled={busy} onClick={openDemo}>افتح الحساب التجريبي</button>
          <button className="btn-sm ghost" disabled={busy} onClick={reset}>أعِده إلى البداية</button>
        </span>
      </div>
      <DemoLinks state={links.state} load={links.load} />
    </section>
  );
}

const VERDICT_AR = { ok: 'سليم', warn: 'يحتاج انتباهًا', bad: 'خلل', checking: 'جارٍ الفحص…' };

export default function PlatformHealth({ orgs = [], orgsLoaded = true, canWrite, reloadOrgs = null }) {
  const writer = canWrite !== false;
  const ops = useOpsHealth(writer);
  const [d, setD] = useState(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setD(null);
    Promise.all([
      L('admin.health').catch(() => null),
      L('admin.platform-health').catch(() => ({ success: false })),
    ]).then(([h, ph]) => live && setD({ h, ph, at: new Date().toISOString() }));
    return () => { live = false; };
  }, [n]);
  // «أعد الفحص» يسأل كل مصادر الحكم: الحالة والفحوص، وصحة البريد، والجهات
  const recheck = () => { setN((x) => x + 1); if (writer) refreshOps(); reloadOrgs?.(); };
  if (!d) return <Spinner />;
  const { h, ph } = d;
  const rows = exceptionRows({ ops: writer ? ops : null, h, orgs, canWrite: writer, ph });
  const checking = (writer && !ops.verdict && !ops.failed) || (writer && !orgsLoaded);
  const level = rows.some((x) => x.level === 'bad') ? 'bad' : rows.length ? 'warn' : checking ? 'checking' : 'ok';
  return (
    <div className="ph-page">
      <header className={`ph-head ph-${level}`} data-level={level} role="status">
        <span className="ph-dot" aria-hidden="true">{level === 'ok' ? '✓' : level === 'bad' ? '✕' : level === 'warn' ? '!' : '…'}</span>
        <span><b>صحة المنصة: {VERDICT_AR[level]}</b>{rows.length > 0 && <small className="la-muted"> · {rows.length === 1 ? 'أمر واحد' : `${rows.length} أمور`} تحتاج انتباهك</small>}
          <br /><small className="la-muted">آخر فحص {dateTime(d.at)}</small></span>
        <button type="button" className="btn-sm ghost" onClick={recheck}>أعد الفحص</button>
      </header>
      {writer && <Readiness items={h?.readiness} />}
      <PlatformChecks r={ph} />
      <SystemState h={h} />
      <MailVerdict enabled={writer} />
      {writer && <OrgsReadiness orgs={orgs} />}
      {writer && (
        <details id="ph-demo" className="today-tools">
          <summary>بيئة التجربة <small className="la-muted">· الحساب التجريبي وروابط التجربة</small></summary>
          <DemoCard />
        </details>
      )}
    </div>
  );
}
