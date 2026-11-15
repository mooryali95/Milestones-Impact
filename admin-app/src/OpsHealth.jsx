// ════════════════════════════════════════════════════════════════
// صحة البريد والتنبيه: بطاقة أعلى النظرة العامة، وشريط أحمر رفيع أعلى كل صفحة حين يكون العطل الآن
// ════════════════════════════════════════════════════════════════
// الحقائق من admin.ops-health (ops-watch.js، طلب واحد مشترك كل 60 ثانية والصفحة ظاهرة)، والحكم باللون والشريط من
// ops-health.js وحده. اللون لا يحمل المعنى وحده: لكل حال رمز وكلمة. التنبيه التجريبي للمدير الأعلى وحده (admin.alert-test).
import React, { useEffect, useState } from 'react';
import { L } from './leaders.js';
import { navigate, parseRoute } from './route.js';
import { useOpsHealth } from './ops-watch.js';
import { agoAr, minutesAr } from '../../supabase/functions/leaders-api/ops-health.js';
import { dateTime } from './dates.js';
import './ops-health.css';

const ICON = { green: '✓', amber: '!', red: '✕' };
const CARD_ID = 'ops-health';
let focusPending = false;

const when = (iso) => (iso ? agoAr(iso) || dateTime(iso) : null);
const n = (v) => (v == null ? 'غير مقروء' : String(v));

// الشريط: يظهر في الحكم الأحمر وحده، ويفتح البطاقة ويضع التركيز عليها
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
    <div className="ops-banner" role="alert">
      <span className="ops-ic" aria-hidden="true">{ICON.red}</span>
      <span className="ops-banner-text"><b>{verdict.banner}</b></span>
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

function AlertTest() {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const send = async () => {
    setBusy(true);
    setOut(null);
    const r = await L('admin.alert-test');
    setBusy(false);
    if (!r?.success) return setOut({ bad: true, text: r?.message || 'تعذّر إرسال التنبيه التجريبي' });
    const went = [r.delivered?.webhook && 'رابط التنبيه', r.delivered?.email && 'بريد التنبيه'].filter(Boolean);
    const set = [r.channels?.webhook && 'رابط التنبيه', r.channels?.email && 'بريد التنبيه'].filter(Boolean);
    if (went.length) setOut({ bad: false, text: `وصل التنبيه التجريبي عبر: ${went.join(' و')}. وفي سلاك يظهر في سلسلة التنبيهات إن كان مضبوطًا.` });
    else setOut({ bad: true, text: set.length ? `ضُبط ${set.join(' و')} ولم يصل التنبيه منه: راجع القيمة في أسرار الدالة.` : 'لا قناة تنبيه مضبوطة، فلم يصل التنبيه إلى أحد. أضف LEADERS_ALERT_WEBHOOK أو LEADERS_ALERT_EMAIL.' });
  };
  return (
    <div className="ops-test">
      <button type="button" className="btn-sm ghost" disabled={busy} onClick={send}>{busy ? 'جارٍ الإرسال…' : 'أرسل تنبيهًا تجريبيًا'}</button>
      <span className={`ops-test-out${out?.bad ? ' bad' : ''}`} role="status">{out?.text || ''}</span>
    </div>
  );
}

// البطاقة: الحكم ثم ما يحتاج تدخلك ثم الأرقام الثلاثة (البريد، سلاك، قنوات التنبيه)
export function OpsHealthCard({ enabled, isSuper }) {
  const { data, verdict, failed } = useOpsHealth(enabled);
  useEffect(() => { if (data && focusPending) focusCard(); }, [data]);
  if (!enabled) return null;
  if (failed) return <p className="la-muted ops-unread" role="status">تعذّرت قراءة صحة البريد والتنبيه الآن، ويُعاد السؤال بعد دقيقة.</p>;
  if (!data || !verdict) return null;
  const { mail, slack, alerts } = data;
  const lv = verdict.level;
  const q = mail.queue || {};
  const pct = mail.sent != null && mail.cap ? Math.min(100, Math.round((mail.sent / mail.cap) * 100)) : null;
  return (
    <section id={CARD_ID} tabIndex={-1} className={`la-card ops-card ops-${lv}`} aria-labelledby="ops-title" data-level={lv}>
      <div className="ops-head">
        <span className="ops-ic" aria-hidden="true">{ICON[lv]}</span>
        <h3 id="ops-title">صحة البريد والتنبيه</h3>
        <span className={`ops-badge ops-${lv}`}>{verdict.label}</span>
      </div>
      <p className="ops-summary" role="status">{verdict.title}.{verdict.issues.length ? ` ما يحتاج تدخلك: ${verdict.issues.length === 1 ? 'أمر واحد' : verdict.issues.length === 2 ? 'أمران' : `${verdict.issues.length} أمور`}.` : ' لا شيء يحتاج تدخلك.'}</p>
      {verdict.issues.length > 0 && (
        <ul className="ops-issues">
          {verdict.issues.map((i) => (
            <li key={i.key} className={`ops-${i.level}`}>
              <span className="ops-ic sm" aria-hidden="true">{ICON[i.level]}</span>
              <span><b>{i.level === 'red' ? 'عطل: ' : 'متابعة: '}</b>{i.text}{i.hint && <small>{i.hint}</small>}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="ops-grid">
        <div>
          <h4>البريد اليوم</h4>
          <dl>
            <Row label="أُرسل في آخر 24 ساعة">{mail.sent == null ? 'غير مقروء' : <><b>{mail.sent}</b> من {mail.cap}</>}
              {pct != null && <span className={`ops-meter${mail.sent >= mail.cap ? ' full' : pct >= 70 ? ' near' : ''}`} role="img" aria-label={`${pct}٪ من السقف اليومي`}><i style={{ inlineSize: `${pct}%` }} /></span>}</Row>
            <Row label="رموز الدخول">وصل {n(mail.codes?.sent)} · تعذّر {n(mail.codes?.failed)} · حُجب {n(mail.codes?.blocked)}</Row>
            <Row label="طابور البريد">{q.waiting == null ? 'غير مقروء' : q.waiting ? `${q.waiting} تنتظر${q.oldest_minutes != null ? `، أقدمها منذ ${minutesAr(q.oldest_minutes)}` : ''}` : 'فارغ'}</Row>
            <Row label="رفضه المزوّد أو حُجب (24 ساعة)">رُفض {n(mail.failed_24h)} · حُجب {n(mail.blocked_24h)}</Row>
          </dl>
        </div>
        <div>
          <h4>سلاك</h4>
          <dl>
            <Row label="الربط">{slack.configured ? <Flag on /> : <><Flag on={false} />{slack.missing?.length > 0 && <small className="ops-codes">ينقص: {slack.missing.map((k) => <code key={k}>{k}</code>)}</small>}</>}</Row>
            <Row label="آخر نشر ناجح">{!slack.readable ? 'غير مقروء' : when(slack.ok_at) || 'لم يُنشر شيء بعد'}</Row>
            <Row label="آخر خطأ">{!slack.readable ? 'غير مقروء' : slack.error ? <><code>{slack.error}</code> {when(slack.error_at)}</> : 'لا خطأ'}</Row>
          </dl>
        </div>
        <div>
          <h4>قنوات التنبيه</h4>
          <dl>
            <Row label="بريد التنبيه"><Flag on={!!alerts.email} /></Row>
            <Row label="رابط التنبيه"><Flag on={!!alerts.webhook} /></Row>
          </dl>
          {isSuper && <AlertTest />}
        </div>
      </div>
      <p className="la-muted ops-at">حُدّثت {when(data.at) || dateTime(data.at)}، وتتحدث كل دقيقة والصفحة مفتوحة.</p>
    </section>
  );
}
