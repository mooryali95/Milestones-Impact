// ════════════════════════════════════════════════════════════════
// مركز البريد: كم بقي من الحصة، ما الذي لم يُرسل، ولماذا لم يصل بريد عنوان بعينه
// ════════════════════════════════════════════════════════════════
// قراءة من admin.mail-center (العداد الموحد leaders.mail_events وطابور mail_queue). القرار في الخادم
// (_shared/mail-budget.js)؛ هنا العرض وأفعال المدير: أرسل الآن، انسخ النص، أرسلتها بنفسي، رابط دخول يدوي.
import React, { useCallback, useEffect, useState } from 'react';
import { dateTime, L } from '../leaders.js';
import { Empty, Spinner, useUI } from '../ui.jsx';
import { DELIVERY_AR, KIND_AR, SOURCE_AR, STATUS_AR } from '../../../supabase/functions/leaders-api/mail-center.js';

const QUEUE_ST = { waiting: ['ينتظر الحصة', 'warn'], gave_up: ['تعذّر بعد محاولات', 'bad'], stale: ['فات أوانه', ''], cancelled: ['أُغلق يدويًّا', ''] };
const EV_TONE = { sent: 'ok', failed: 'bad', blocked: 'warn' };
const copy = async (text, toast, ok) => {
  try { await navigator.clipboard.writeText(text); toast(ok); } catch { toast('تعذّر النسخ: انسخ النص يدويًّا'); }
};

// مقياس الحصة: المُرسل من السقف، وحدّ الإشعارات داخله
function Gauge({ b }) {
  const share = b.cap ? Math.round((b.nonCodeLimit / b.cap) * 100) : 0;
  return (
    <div className="mc-gauge" role="img" aria-label={`أُرسل ${b.sent} من ${b.cap} في آخر 24 ساعة`}>
      <div className="mc-gauge-bar"><i className={b.state} style={{ inlineSize: `${b.pct}%` }} /><em style={{ insetInlineStart: `${share}%` }} title="حد الإشعارات: ما بعده محجوز لرموز الدخول" /></div>
      <div className="mc-gauge-scale"><span>0</span><span>حد الإشعارات {b.nonCodeLimit}</span><span>{b.cap}</span></div>
    </div>
  );
}

function Series({ rows }) {
  const max = Math.max(1, ...rows.map((d) => d.sent + d.blocked + d.failed));
  return (
    <div className="mc-series" role="img" aria-label="البريد اليومي لآخر 14 يومًا">
      {rows.map((d) => (
        <span key={d.day} title={`${d.day}: أُرسل ${d.sent}${d.blocked ? ` · حُجب ${d.blocked}` : ''}${d.failed ? ` · رُفض ${d.failed}` : ''}`}>
          {d.failed > 0 && <i className="bad" style={{ blockSize: `${(d.failed / max) * 100}%` }} />}
          {d.blocked > 0 && <i className="warn" style={{ blockSize: `${(d.blocked / max) * 100}%` }} />}
          <i className="ok" style={{ blockSize: `${Math.max(d.sent ? 3 : 0, (d.sent / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

// «لماذا لم يصل البريد؟»: عنوان واحد، ما جرى له، وما العمل
function Trace({ canWrite, isSuper, onPerson }) {
  const { toast, confirm } = useUI();
  const [email, setEmail] = useState('');
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);
  const run = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setLink(null);
    setR(await L('admin.mail-trace', { email: email.trim() }));
    setBusy(false);
  };
  const who = r?.success ? r.account.participant : null;
  const makeLink = async () => {
    if (!(await confirm(`إنشاء رابط دخول إلى حساب ${who.full_name}؟ يصلح مرة واحدة ولدقائق، ويُسجَّل باسمك في سجل التدقيق. أرسله لصاحب الحساب وحده.`))) return;
    setBusy(true);
    const x = await L('admin.mail-login-link', { participant_id: who.id, reason: 'البريد لا يصل' });
    setBusy(false);
    if (x.success) setLink(x); else toast(x.message);
  };
  const wa = who?.phone && link ? `https://wa.me/${String(who.phone).replace(/[^\d]/g, '').replace(/^0(5\d{8})$/, '966$1')}?text=${encodeURIComponent(`رابط دخولك إلى برنامج القادة (صالح ${link.minutes} دقيقة ولمرة واحدة):\n${link.url}`)}` : null;
  return (
    <section className="la-card mc-trace">
      <h3>لماذا لم يصل البريد؟</h3>
      <p className="la-muted small">اكتب بريد من يشتكي. يظهر ما أرسلته المنصة إليه، وهل خرج، وهل وصل إلى خادمه، وما العمل.</p>
      <form className="la-row" onSubmit={run}>
        <input type="email" dir="ltr" aria-label="بريد المشتكي" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-sm primary" disabled={busy || !email.trim()}>{busy ? 'لحظة…' : 'ابحث'}</button>
      </form>
      {r && !r.success && <p className="la-err" role="alert">{r.message}</p>}
      {r?.success && (
        <div className="mc-result">
          <div className={`mc-verdict ${r.diagnosis.tone}`} role="status">
            <b>{r.diagnosis.title}</b>
            <p>{r.diagnosis.advice}</p>
          </div>
          <div className="la-row mc-who">
            {who ? <><span>الحساب: <b>{who.full_name}</b>{who.last_login_at ? ` · آخر دخول ${dateTime(who.last_login_at)}` : ' · لم يدخل بعد'}</span>
              <button className="btn-sm ghost" onClick={() => onPerson(who.id)}>ملفه</button>
              {isSuper && canWrite && <button className="btn-sm ghost" disabled={busy} onClick={makeLink}>أنشئ رابط دخول</button>}</>
              : <span className="la-muted">{r.account.expert ? `خبير: ${r.account.expert.full_name}` : r.account.coordinator ? `مسؤول جهة: ${r.account.coordinator.full_name}` : 'لا حساب مشارك بهذا العنوان'}</span>}
          </div>
          {link && (
            <div className="mc-link" role="status">
              <b>رابط الدخول جاهز</b> <small className="la-muted">صالح {link.minutes} دقيقة ولمرة واحدة</small>
              <code dir="ltr">{link.url}</code>
              <div className="la-row">
                <button className="btn-sm primary" onClick={() => copy(link.url, toast, 'نُسخ الرابط')}>انسخ الرابط</button>
                {wa && <a className="btn-sm ghost" href={wa} target="_blank" rel="noopener noreferrer">أرسله بواتساب</a>}
              </div>
            </div>
          )}
          {r.waiting.length > 0 && <p className="la-chip warn">{r.waiting.length} رسالة له تنتظر في صندوق «لم يُرسل» أسفل الصفحة</p>}
          {r.events.length > 0 && (
            <div className="la-table-wrap">
              <table className="la-table">
                <thead><tr><th scope="col">الوقت</th><th scope="col">الرسالة</th><th scope="col">عندنا</th><th scope="col">عند خادمه</th></tr></thead>
                <tbody>
                  {r.events.map((e) => (
                    <tr key={e.id}>
                      <td>{dateTime(e.created_at)}</td>
                      <td>{e.subject || KIND_AR[e.kind] || e.kind}<br /><small className="la-muted">{KIND_AR[e.kind] || e.kind} · {SOURCE_AR[e.source] || e.source}</small></td>
                      <td><span className={`la-chip ${EV_TONE[e.status] || ''}`}>{STATUS_AR[e.status] || e.status}</span></td>
                      <td>{e.delivery ? <span className={`la-chip ${e.delivery.tone === 'info' ? '' : e.delivery.tone}`}>{e.delivery.label}</span> : <small className="la-muted">{e.status === 'sent' ? (r.delivery_readable ? 'غير متاح' : 'يحتاج مفتاحًا كامل الصلاحية') : '·'}</small>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// رسالة منتظرة: نصها كما كانت ستصل، مع النسخ والإرسال اليدوي
function QueueBody({ id, onClose }) {
  const { toast } = useUI();
  const [m, setM] = useState(null);
  useEffect(() => { L('admin.mail-queue-body', { id }).then(setM); }, [id]);
  if (!m) return <Spinner />;
  if (!m.success) return <p className="la-err">{m.message}</p>;
  return (
    <div className="mc-body">
      <div className="la-row between">
        <div><small className="la-muted">إلى <span dir="ltr">{m.to}</span></small><h4>{m.subject}</h4></div>
        <button className="btn-sm ghost" onClick={onClose}>إغلاق</button>
      </div>
      <iframe className="mg-frame" title={`نص الرسالة: ${m.subject}`} srcDoc={m.html} sandbox="" />
      <div className="la-row">
        <button className="btn-sm ghost" onClick={() => copy(m.text, toast, 'نُسخ نص الرسالة')}>انسخ النص</button>
        <button className="btn-sm ghost" onClick={() => copy(m.to, toast, 'نُسخ العنوان')}>انسخ العنوان</button>
        <a className="btn-sm ghost" href={m.mailto}>افتحها في بريدي</a>
      </div>
    </div>
  );
}

export default function MailCenter({ canWrite, isSuper = false, onPerson }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => setD(await L('admin.mail-center')), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err" role="alert">{d.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div>;
  const b = d.budget;
  const act = async (action, id, ok, extra = {}) => {
    setBusy(true);
    const r = await L(action, { id, ...extra });
    setBusy(false);
    toast(r.success ? ok : r.message);
    if (r.success) { setOpen(null); load(); }
  };
  const sendNow = async (m) => { if (await confirm(`إرسال «${m.subject}» إلى ${m.to_email} الآن؟ تُحسب من حصة اليوم.`)) act('admin.mail-queue-send', m.id, 'أُرسلت'); };
  const closeIt = async (m) => { if (await confirm(`إغلاق «${m.subject}»؟ لن تُرسل آليًّا بعد الآن. اختر هذا إن أرسلتها بنفسك أو لم تعد لازمة.`)) act('admin.mail-queue-cancel', m.id, 'أُغلقت', { manual: true }); };
  const waiting = d.queue.filter((m) => m.state === 'waiting');
  const senderDomain = d.provider.domains.find((x) => x.sender);
  return (
    <div className="mc">
      <div className={`pay-hero mc-hero ${b.state}`}>
        <div>
          <p className="pay-eyebrow">البريد · آخر 24 ساعة</p>
          <b className="pay-total" dir="ltr">{b.remaining}</b>
          <span className="la-muted">رسالة باقية من {b.cap} · أُرسل {b.sent}</span>
          <span className={`la-chip ${b.state === 'ok' ? 'ok' : b.state === 'warn' ? 'warn' : 'bad'}`}>{d.budget_ar}</span>
          {d.next_free_at && <span className="la-muted">أول رسالة تتحرر {dateTime(d.next_free_at)}</span>}
        </div>
        <div><Gauge b={b} /><Series rows={d.series} /></div>
      </div>
      {!d.counter_ok && <p className="la-err" role="alert">العداد غير مقروء الآن: رموز الدخول والتنبيهات تمر، وما سواها ينتظر.</p>}

      <div className="pay-kpis">
        <span><b>{b.codes}</b>رموز دخول وتنبيهات</span>
        <span><b>{b.nonCode}</b>إشعارات، وبقي لها {b.nonCodeLeft}</span>
        <span><b>{waiting.length}</b>تنتظر في الصندوق</span>
        <span><b>{d.blocked_24h}</b>حُجبت بالسقف اليوم</span>
        <span><b>{d.failed_24h}</b>رفضها المزوّد اليوم</span>
      </div>

      {canWrite ? <Trace canWrite={canWrite} isSuper={isSuper} onPerson={onPerson} />
        : <section className="la-card"><h3>لماذا لم يصل البريد؟</h3><p className="la-muted">البحث بعنوان ونصوص الرسائل المنتظرة لمن له صلاحية التعديل، لأنها قد تحمل روابط دخول.</p></section>}

      <section className="la-card">
        <div className="la-row between"><h3>لم يُرسل <small className="la-muted">· آخر 7 أيام</small></h3><button className="btn-sm ghost" onClick={load}>حدّث</button></div>
        <p className="la-muted small">الإشعار الذي يحجبه السقف ينتظر هنا ويخرج آليًّا حين تتسع الحصة، وما انتظر أكثر من يومين يُترك. لك أن ترسله الآن، أو تنسخ نصه وترسله بنفسك ثم تغلقه. رمز الدخول لا ينتظر: صاحبه يطلبه من جديد، أو تنشئ له رابطًا من البحث أعلاه.</p>
        {d.queue.length === 0 ? <Empty compact title="لا رسائل منتظرة" hint="كل ما طُلب إرساله خرج." /> : (
          <div className="la-table-wrap">
            <table className="la-table">
              <thead><tr><th scope="col">منذ</th><th scope="col">إلى</th><th scope="col">الرسالة</th><th scope="col">الحالة</th><th scope="col"><span className="sr-only">أفعال</span></th></tr></thead>
              <tbody>
                {d.queue.map((m) => {
                  const [st, tone] = QUEUE_ST[m.state] || [m.state, ''];
                  return (
                    <React.Fragment key={m.id}>
                      <tr>
                        <td>{dateTime(m.created_at)}</td>
                        <td dir="ltr">{m.to_email || '·'}</td>
                        <td>{m.subject}<br /><small className="la-muted">{KIND_AR[m.kind] || m.kind}{m.attempts ? ` · ${m.attempts} محاولة` : ''}</small></td>
                        <td><span className={`la-chip ${tone}`}>{st}</span></td>
                        <td className="la-row">
                          {canWrite && <button className="btn-sm ghost" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>النص</button>}
                          {canWrite && m.state !== 'cancelled' && <button className="btn-sm primary" disabled={busy} onClick={() => sendNow(m)}>أرسل الآن</button>}
                          {canWrite && m.state === 'waiting' && <button className="btn-sm ghost" disabled={busy} onClick={() => closeIt(m)}>أرسلتها بنفسي</button>}
                        </td>
                      </tr>
                      {open === m.id && <tr><td colSpan={5}><QueueBody id={m.id} onClose={() => setOpen(null)} /></td></tr>}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {d.lost.length > 0 && (
          <details className="mc-lost">
            <summary>سجل ما حُجب أو رُفض ({d.lost.length}) · بلا عناوين</summary>
            <div className="la-table-wrap">
              <table className="la-table">
                <thead><tr><th scope="col">الوقت</th><th scope="col">النوع</th><th scope="col">الرسالة</th><th scope="col">النطاق</th><th scope="col">ما جرى</th></tr></thead>
                <tbody>
                  {d.lost.map((e) => (
                    <tr key={e.id}><td>{dateTime(e.at)}</td><td>{KIND_AR[e.kind] || e.kind}<br /><small className="la-muted">{SOURCE_AR[e.source] || e.source}</small></td>
                      <td>{e.subject || '·'}</td><td dir="ltr">{e.to_domain || '·'}</td><td><span className={`la-chip ${EV_TONE[e.status]}`}>{STATUS_AR[e.status]}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <div className="la-grid2">
        <section className="la-card">
          <h3>توزيع اليوم</h3>
          {b.sent === 0 ? <Empty compact title="لم يُرسل شيء في آخر 24 ساعة" /> : <>
            <ul className="mc-split">{Object.entries(d.by_kind).map(([k, n]) => <li key={k}><span>{KIND_AR[k] || k}</span><i style={{ inlineSize: `${(n / b.sent) * 100}%` }} /><b>{n}</b></li>)}</ul>
            <h4>من أين</h4>
            <ul className="mc-split">{Object.entries(d.by_source).map(([k, n]) => <li key={k}><span>{SOURCE_AR[k] || k}</span><i style={{ inlineSize: `${(n / b.sent) * 100}%` }} /><b>{n}</b></li>)}</ul>
          </>}
        </section>
        <section className="la-card">
          <h3>المزوّد <span dir="ltr">Resend</span></h3>
          {d.provider.readable ? (
            <ul className="pay-health">
              {d.provider.domains.length === 0 && <li className="bad"><b>✗</b><span>النطاق</span><small className="la-muted">لا نطاق مضاف عند المزوّد</small></li>}
              {d.provider.domains.map((x) => <li key={x.name} className={x.status === 'verified' ? 'ok' : 'bad'}><b>{x.status === 'verified' ? '✓' : '✗'}</b><span dir="ltr">{x.name}</span><small className="la-muted">{x.status === 'verified' ? 'موثّق' : `غير موثّق (${x.status})`}{x.sender ? ' · نطاق الإرسال' : ''}</small></li>)}
              {!senderDomain && d.provider.domains.length > 0 && <li className="bad"><b>✗</b><span>نطاق الإرسال</span><small className="la-muted">عنوان المرسل ليس على نطاق من هذه</small></li>}
            </ul>
          ) : <p className="la-muted">{d.provider.reason}</p>}
          {d.provider.usage && Object.keys(d.provider.usage).length > 0 && <p className="la-muted small">استهلاك الحساب عند المزوّد: {Object.entries(d.provider.usage).map(([k, v]) => <span key={k} dir="ltr" className="mc-q">{k}: {v}</span>)}</p>}
          <p className="la-muted small">حصة المزوّد المجانية تُحسب باليوم التقويمي وتُصفَّر 03:00 بتوقيت الرياض، وسقف المنصة يُحسب على آخر 24 ساعة متحركة ليبقى دونها.</p>
          {Object.keys(d.provider.quota).length > 0 && <p className="la-muted small">ما يعلنه المزوّد: {Object.entries(d.provider.quota).map(([k, v]) => <span key={k} dir="ltr" className="mc-q">{k}: {v}</span>)}</p>}
          <ul className="pay-health">
            <li className={d.alert_channel ? 'ok' : 'bad'}><b>{d.alert_channel ? '✓' : '✗'}</b><span>قناة التنبيه</span><small className="la-muted">{d.alert_channel ? 'تنبيه عند 70% من السقف وعند رفض المزوّد' : 'غير مضبوطة: أضف رابط Slack في LEADERS_ALERT_WEBHOOK ليصلك تنبيه عند اقتراب السقف'}</small></li>
            <li className={d.traceable ? 'ok' : 'bad'}><b>{d.traceable ? '✓' : '✗'}</b><span>البحث بالعنوان</span><small className="la-muted">{d.traceable ? 'السجل يحمل بصمة العنوان، ويُحفظ ' + d.retention_days + ' يومًا' : 'ينتظر ترحيل مركز البريد'}</small></li>
          </ul>
          <p className="la-muted small">حالات التسليم: {Object.values(DELIVERY_AR).slice(0, 3).map(([l]) => l).join('، ')}، وغيرها كما يعلنها المزوّد.</p>
        </section>
      </div>
    </div>
  );
}
