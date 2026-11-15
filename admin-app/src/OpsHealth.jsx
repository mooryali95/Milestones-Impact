// ════════════════════════════════════════════════════════════════
// صحة البريد والتنبيه: بطاقة أعلى النظرة العامة، وشريط أحمر رفيع أعلى كل صفحة حين يكون العطل الآن
// ════════════════════════════════════════════════════════════════
// الحقائق من admin.ops-health (ops-watch.js، طلب واحد مشترك كل 60 ثانية والصفحة ظاهرة)، والحكم باللون والشريط من
// ops-health.js وحده. اللون لا يحمل المعنى وحده: لكل حال رمز وكلمة. التنبيه التجريبي للمدير الأعلى وحده (admin.alert-test).
import React, { useEffect, useState } from 'react';
import { L } from './leaders.js';
import { navigate, parseRoute } from './route.js';
import { refreshAfterTest, useOpsHealth } from './ops-watch.js';
import { opsSummary } from './ops-summary.js';
import { agoAr, countAr, meterLevel, minutesAr, slackLabel } from '../../supabase/functions/leaders-api/ops-health.js';
import { dateTime } from './dates.js';
import './ops-health.css';

const ICON = { green: '✓', amber: '!', red: '✕' };
const CARD_ID = 'ops-health';
let focusPending = false;

const when = (iso) => (iso ? agoAr(iso) || dateTime(iso) : null);
const n = (v) => (v == null ? 'غير مقروء' : String(v));

// الشريط: يظهر في الحكم الأحمر وحده، ويفتح البطاقة ويضع التركيز عليها. منطقة التنبيه (role=alert) فيها الجملة الثابتة
// وحدها، فلا يعيد قارئ الشاشة قراءتها كل دقيقة؛ المدة المتغيرة («منذ 20 دقيقة») بجوارها خارج المنطقة
export function OpsBanner({ enabled }) {
  const { verdict } = useOpsHealth(enabled);
  if (!verdict || verdict.level !== 'red') return null;
  const open = (e) => {
    e.preventDefault();
    focusPending = true;
    const r = parseRoute(window.location.hash);
    if (r.ctx === 'leaders' && (r.tab || 'overview') === 'overview') focusCard();
    else navigate({ ctx: 'leaders', tab: 'overview' });
  };
  return (
    <div className="ops-banner">
      <span className="ops-ic" aria-hidden="true">{ICON.red}</span>
      <span className="ops-banner-text">
        <b role="alert">{verdict.banner}</b>
        {verdict.bannerSince && <span className="ops-banner-since" aria-live="off"> {verdict.bannerSince}</span>}
      </span>
      <a className="ops-banner-link" href="#/leaders/overview" onClick={open}>افتح بطاقة صحة البريد</a>
    </div>
  );
}

function focusCard() {
  const el = document.getElementById(CARD_ID);
  if (!el) return false;
  focusPending = false;
  el.scrollIntoView({ block: 'start' });
  el.focus({ preventScroll: true });
  return true;
}

function Row({ label, children }) {
  return <div className="ops-row"><dt>{label}</dt><dd>{children}</dd></div>;
}
const Flag = ({ on, yes = 'مضبوط', no = 'غير مضبوط' }) => (
  <span className={`ops-flag ${on ? 'on' : 'off'}`}><span aria-hidden="true">{on ? '✓' : '○'}</span> {on ? yes : no}</span>
);

// أين ذهب التنبيه التجريبي: الرابط والبريد بنتيجتهما، وسلاك (لا يُنتظر) إلى سلسلة التنبيهات إن ضُبط
export function alertTestText(r, slackOn) {
  const slack = r.channels?.slack ?? slackOn;
  const went = [r.delivered?.webhook && 'رابط التنبيه', r.delivered?.email && 'بريد التنبيه'].filter(Boolean);
  const set = [r.channels?.webhook && 'رابط التنبيه', r.channels?.email && 'بريد التنبيه'].filter(Boolean);
  const inSlack = 'أُرسل إلى سلسلة التنبيهات في سلاك';
  if (went.length) return { bad: false, text: `وصل التنبيه التجريبي عبر: ${went.join(' و')}.${slack ? ` و${inSlack}.` : ''}` };
  if (set.length) return { bad: true, text: `ضُبط ${set.join(' و')} ولم يصل التنبيه منه: راجع القيمة في أسرار الدالة.${slack ? ` و${inSlack}.` : ''}` };
  if (slack) return { bad: false, text: `${inSlack}، وهو قناة التنبيه الوحيدة المضبوطة.` };
  return { bad: true, text: 'لا قناة تنبيه مضبوطة، فلم يصل التنبيه إلى أحد. اضبط سلاك، أو أضف LEADERS_ALERT_WEBHOOK أو LEADERS_ALERT_EMAIL.' };
}

function AlertTest({ slackOn }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const send = async () => {
    setBusy(true);
    setOut(null);
    const r = await L('admin.alert-test');
    setBusy(false);
    if (!r?.success) return setOut({ bad: true, text: r?.message || 'تعذّر إرسال التنبيه التجريبي' });
    setOut(alertTestText(r, slackOn));
    // أرقام البطاقة تتبع التجربة: البريد الآن، وحالة سلاك بعد ثوانٍ (تُكتب بعد الرد)
    refreshAfterTest();
  };
  return (
    <div className="ops-test">
      <button type="button" className="btn-sm ghost" disabled={busy} onClick={send}>{busy ? 'جارٍ الإرسال…' : 'أرسل تنبيهًا تجريبيًا'}</button>
      <span className={`ops-test-out${out?.bad ? ' bad' : ''}`} role="status">{out?.text || ''}</span>
    </div>
  );
}

// الطي والفتح: اختيار المتصفح محفوظ (localStorage)، وأي حال غير سليمة تفتح البطاقة مهما كان المحفوظ
const PREF_KEY = 'mi_admin_ops_card';
const BODY_ID = 'ops-body';
const readPref = () => { try { return localStorage.getItem(PREF_KEY); } catch { return null; } };
const writePref = (v) => { try { localStorage.setItem(PREF_KEY, v); } catch { /* التخزين محجوب: الاختيار لهذه الجلسة */ } };
export const cardOpen = (level, pref, chosen = null) => (chosen ?? (level !== 'green' ? true : pref === 'open'));

const Ring = ({ m }) => {
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <span className={`ops-ring ${m.tone}`} role="img" aria-label={m.aria}>
      <svg viewBox="0 0 28 28" aria-hidden="true" focusable="false">
        <circle className="trk" cx="14" cy="14" r={r} />
        {m.pct != null && <circle className="val" cx="14" cy="14" r={r} strokeDasharray={`${(m.pct / 100) * c} ${c}`} />}
      </svg>
      <span className="ops-ring-txt" dir="ltr" aria-hidden="true"><b>{m.sent ?? '?'}</b><small>/{m.cap ?? '?'}</small></span>
    </span>
  );
};
const PILL_IC = { sent: '✓', failed: '✕', blocked: '⊘' };
// السطر الهادئ حين تُطوى البطاقة: لا حركة ولا تحديث مرئي غير الأرقام
function OpsStrip({ s }) {
  return (
    <ul className="ops-strip" aria-label="ملخص صحة البريد والتنبيه">
      <li className="ops-sum mail"><Ring m={s.mail} /><span className="ops-sum-l">البريد في 24 ساعة</span></li>
      <li className="ops-sum codes">
        <span className="ops-sum-l">رموز الدخول</span>
        <span className="ops-pills">
          {s.codes.map((p) => (
            <span key={p.key} className={`ops-pill ${p.tone}`}><span aria-hidden="true">{PILL_IC[p.key]}</span> {p.label} <b>{p.n ?? '?'}</b></span>
          ))}
        </span>
      </li>
      <li className="ops-sum slack"><span className="ops-sum-l">سلاك</span><span className={`ops-pill ${s.slack.tone}`} data-state={s.slack.state}>{s.slack.text}</span></li>
      <li className="ops-sum alerts"><span className="ops-sum-l">قنوات التنبيه</span><span className={`ops-pill ${s.alerts.tone}`}>{s.alerts.text}</span></li>
    </ul>
  );
}

// البطاقة: الحكم ثم ما يحتاج تدخلك ثم الأرقام الثلاثة (البريد، سلاك، قنوات التنبيه)
export function OpsHealthCard({ enabled, isSuper }) {
  const { data, verdict, failed } = useOpsHealth(enabled);
  const [chosen, setChosen] = useState(null);
  const [pref] = useState(readPref);
  const lv = verdict?.level;
  // حال غير سليمة تظهر: يسقط اختيار الجلسة فتنفتح البطاقة
  useEffect(() => { if (lv && lv !== 'green') setChosen(null); }, [lv]);
  useEffect(() => { if (data && focusPending) focusCard(); }, [data]);
  if (!enabled) return null;
  if (failed) return <p className="la-muted ops-unread" role="status">تعذّرت قراءة صحة البريد والتنبيه الآن، ويُعاد السؤال بعد دقيقة.</p>;
  if (!data || !verdict) return null;
  const { mail, slack, alerts } = data;
  const open = cardOpen(lv, pref, chosen);
  const toggle = () => { setChosen(!open); writePref(open ? 'closed' : 'open'); };
  const q = mail.queue || {};
  const pct = mail.sent != null && mail.cap ? Math.min(100, Math.round((mail.sent / mail.cap) * 100)) : null;
  const meter = meterLevel(verdict);
  return (
    <section id={CARD_ID} tabIndex={-1} className={`la-card ops-card ops-${lv}`} aria-labelledby="ops-title" data-level={lv}>
      <div className="ops-head">
        <span className="ops-ic" aria-hidden="true">{ICON[lv]}</span>
        <h3 id="ops-title">
          <button type="button" className="ops-toggle" aria-expanded={open} aria-controls={BODY_ID} onClick={toggle}>
            صحة البريد والتنبيه<span className="ops-chev" aria-hidden="true" />
          </button>
        </h3>
        <span className={`ops-badge ops-${lv}`}>{verdict.label}</span>
      </div>
      {!open && <OpsStrip s={opsSummary(data, verdict)} />}
      <div id={BODY_ID} className="ops-body" hidden={!open}>
      <p className="ops-summary" role="status">{verdict.title}{verdict.issues.length ? ` (${countAr(verdict.issues.length)}).` : '. لا شيء يحتاج تدخلك.'}</p>
      {verdict.issues.length > 0 && (
        <ul className="ops-issues">
          {verdict.issues.map((i) => (
            <li key={i.key} className={`ops-${i.level}`}>
              <span className="ops-ic sm" aria-hidden="true">{ICON[i.level]}</span>
              <span><b>{i.level === 'red' ? 'عطل: ' : 'متابعة: '}</b>{i.text}{i.code && <> <code dir="ltr" className="ops-code">{i.code}</code></>}{i.hint && <small>{i.hint}</small>}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="ops-grid">
        <div>
          <h4>البريد في آخر 24 ساعة</h4>
          <dl>
            <Row label="أُرسل">{mail.sent == null ? 'غير مقروء' : <><b>{mail.sent}</b> من {mail.cap}</>}
              {pct != null && <span className={`ops-meter${meter ? ` ${meter}` : ''}`} role="img" aria-label={`${pct}٪ من السقف اليومي`}><i style={{ inlineSize: `${pct}%` }} /></span>}</Row>
            <Row label="رموز الدخول">وصل {n(mail.codes?.sent)} · تعذّر {n(mail.codes?.failed)} · حُجب {n(mail.codes?.blocked)}
              {mail.codes?.matrix_blocked > 0 && <small className="ops-codes">ومصفوفة التأثير: حُجب {mail.codes.matrix_blocked} (نصيبها أو السقف)</small>}</Row>
            <Row label="طابور البريد">{q.waiting == null ? 'غير مقروء' : q.waiting ? `${q.waiting} تنتظر${q.oldest_minutes != null ? `، أقدمها منذ ${minutesAr(q.oldest_minutes)}` : ''}` : 'فارغ'}</Row>
            <Row label="رسائل أخرى لم تصل">تعذّر {n(mail.failed_24h)} · حُجب {n(mail.blocked_24h)}</Row>
          </dl>
        </div>
        <div>
          <h4>سلاك</h4>
          <dl>
            <Row label="الربط">{slack.configured ? <Flag on /> : <><Flag on={false} />{slack.missing?.length > 0 && <small className="ops-codes">ينقص: {slack.missing.map((k) => <code key={k}>{k}</code>)}</small>}</>}</Row>
            <Row label="آخر نشر ناجح">{!slack.readable ? 'غير مقروء' : when(slack.ok_at) || 'لم يُنشر شيء بعد'}</Row>
            <Row label="آخر خطأ">{!slack.readable ? 'غير مقروء' : slack.error ? <>{slackLabel(slack.error)} {when(slack.error_at)} <code dir="ltr" className="ops-code">{slack.error}</code></> : 'لا خطأ'}</Row>
          </dl>
        </div>
        <div>
          <h4>قنوات التنبيه</h4>
          <dl>
            <Row label="بريد التنبيه"><Flag on={!!alerts.email} /></Row>
            <Row label="رابط التنبيه"><Flag on={!!alerts.webhook} /></Row>
            <Row label="سلسلة التنبيهات في سلاك"><Flag on={!!slack.configured} /></Row>
          </dl>
          {isSuper && <AlertTest slackOn={!!slack.configured} />}
        </div>
      </div>
      <p className="la-muted ops-at">حُدّثت {when(data.at) || dateTime(data.at)}، وتتحدث كل دقيقة والصفحة مفتوحة.</p>
      </div>
    </section>
  );
}
