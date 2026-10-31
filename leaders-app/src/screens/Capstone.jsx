// ════════════════════════════════════════════════════════════════
// مشروع التخرج: وثيقة مبادرتك
// ════════════════════════════════════════════════════════════════
// فصول الوثيقة هي نماذجك التعليمية نفسها، تفتحها من هنا أو من المكتبة
// فتجد العمل ذاته. الصفحة تجمعها، وتفحص اتساقها، وتسلّمها للمستشار، وتصدر
// الوثيقة الاحترافية للطباعة. لا محتوى يُكتب مرتين.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { dimOf, levelOf } from '../labels.js';
import { ModelView } from './Models.jsx';
import Tracking from './Tracking.jsx';
import ChooseExpert from './ChooseExpert.jsx';
import { LEADER_WEIGHTS, PRIORITY_WEIGHT, RUBRIC_MAX } from '../../../supabase/functions/leaders-api/capstone.js';
import { SUBMISSION_STATUS } from '../../../supabase/functions/leaders-api/labels.js';

const SECTION_STATE = (s) => (s.status === 'reviewed' ? { t: SUBMISSION_STATUS.reviewed, c: 'ok' }
  : s.status === 'submitted' ? { t: SUBMISSION_STATUS.submitted, c: 'gold' }
    : s.status === 'returned' ? { t: SUBMISSION_STATUS.returned, c: 'bad' }
      : s.complete ? { t: 'مكتمل', c: 'ok' } : s.status === 'draft' ? { t: SUBMISSION_STATUS.draft, c: 'warn' } : { t: 'لم يبدأ', c: '' });
const STATUS_CHIP = { draft: '', submitted: 'gold', returned: 'bad', accepted: 'gold', approved: 'ok' };
const FLOW = [['draft', 'ابنِ الفصول'], ['submitted', 'مراجعة المستشار'], ['accepted', 'تأييد الراعي'], ['approved', 'الاعتماد']];

function Meter({ value, min }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div className={`cp-meter${value >= min ? ' ok' : ''}`}>
      <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
        <circle cx="42" cy="42" r={r} className="bg" />
        <circle cx="42" cy="42" r={r} className="fg" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, value) / 100)} />
      </svg>
      <b>{value}%</b>
      <small>الجاهزية · المطلوب {min}%</small>
    </div>
  );
}

export async function openCapstoneDoc(doc) {
  const win = window.open('', '_blank');
  const [{ writeDocument }, { capstoneReport }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/capstone.js')]);
  const { meta, body } = capstoneReport(doc);
  return writeDocument(win, meta, body);
}

export default function Capstone({ me, onEditProfile, onBack }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const load = () => call('capstone.get').then((r) => { setD(r); if (r.success) setSummary(r.capstone.summary || ''); });
  useEffect(() => { load(); }, []);

  if (open) return <div className="page"><ModelView id={open} name={me.participant.full_name} backLabel="وثيقة مبادرتك" onBack={() => { setOpen(null); load(); }} onPoints={() => {}} /></div>;
  if (!d) return <div className="center-load"><div className="spinner" /></div>;
  if (!d.success) return <div className="page narrow"><div className="alert err">{d.message}</div></div>;

  const c = d.capstone;
  const editable = c.status === 'draft' || c.status === 'returned';
  const step = c.status === 'returned' ? 0 : Math.max(0, FLOW.findIndex(([k]) => k === c.status));
  const done = d.sections.filter((s) => s.complete).length;
  const failing = d.checks.filter((x) => !x.ok);

  const saveSummary = async () => {
    setBusy('summary'); setMsg(null);
    const r = await call('capstone.summary', { summary });
    setBusy('');
    setMsg(r.success ? { ok: 'حُفظ الملخص.' } : { err: r.message });
  };
  const submit = async () => {
    if (!window.confirm('تُسلَّم الوثيقة للمستشار، وتُقفل فصولها حتى تعود إليك. متابعة؟')) return;
    setBusy('submit'); setMsg(null);
    if (summary !== (c.summary || '')) await call('capstone.summary', { summary });
    const r = await call('capstone.submit');
    setBusy('');
    if (!r.success) return setMsg({ err: r.message });
    setD(r);
    setMsg({ ok: 'سُلّمت الوثيقة للمستشار. يصلك بريد بقراره.' });
  };
  const view = async () => {
    setBusy('doc');
    const r = await call('capstone.doc');
    setBusy('');
    if (!r.success) return setMsg({ err: r.message });
    if (!(await openCapstoneDoc(r.doc))) setMsg({ err: 'اسمح بالنوافذ المنبثقة لفتح الوثيقة' });
  };

  return (
    <div className="page capstone">
      <section className="cp-hero">
        <div className="cp-hero-main">
          <span className="book-eyebrow">The Capstone · Initiative Document</span>
          <h1>{d.initiative || 'وثيقة مبادرتك'}</h1>
          <p>
            {d.scope_title ? <>مشروع تخرجك: <b>{d.scope_title}</b></> : 'مشروع تخرجك'}
            {' · '}مستوى {levelOf(d.level).title}{d.track?.title ? <> · {d.track.title}</> : null}
          </p>
          <ol className="cp-flow">
            {FLOW.map(([k, t], i) => <li key={k} className={i < step || c.status === 'approved' ? 'past' : i === step ? 'now' : ''}><span>{i < step || c.status === 'approved' ? '✓' : i + 1}</span>{t}</li>)}
          </ol>
        </div>
        <div className="cp-hero-side">
          <Meter value={d.readiness} min={d.ready_min} />
          <span className={`chip ${STATUS_CHIP[c.status] || ''}`}>{c.status_title}</span>
          <small>{done} من {d.sections.length} فصول مكتملة</small>
        </div>
      </section>

      {!d.scope && (
        <div className="alert info cp-alert">
          نوع مشروعك (مشروع، أو برنامج، أو محفظة) يأتي من نطاق عملك في ملفك، وبه تتحدد فصول الوثيقة.
          {' '}<button className="link" onClick={onEditProfile}>حدد نطاق عملك</button>
        </div>
      )}
      {d.track?.brief && <div className="card cp-brief"><span className="mg-cap">توجيه مسارك</span><p>{d.track.brief}</p></div>}

      {c.status === 'returned' && (c.sponsor?.status === 'declined' ? (
        <div className="card cp-review bad"><h3>ملاحظات راعي المبادرة</h3><p>{c.sponsor.note}</p><small className="muted">عدّل الفصول ثم أعد التسليم.</small></div>
      ) : c.review && (
        <div className="card cp-review bad">
          <h3>ملاحظات المستشار</h3>
          {c.review.note && <p>{c.review.note}</p>}
          {Object.keys(c.review.notes || {}).length > 0 && (
            <ul>{d.rubric.filter((r) => c.review.notes[r.key]).map((r) => <li key={r.key}><b>{r.title}:</b> {c.review.notes[r.key]}</li>)}</ul>
          )}
          <small className="muted">هذا التحسين المتاح بعد المراجعة. عدّل الفصول ثم أعد التسليم.</small>
        </div>
      ))}
      {c.status === 'approved' && (
        <div className="card cp-review ok">
          <h3>اعتُمدت وثيقة مبادرتك</h3>
          {c.review?.score != null && <p className="cp-score"><b>{c.review.score}</b> من 100 في معيار المستشار</p>}
          {c.sponsor?.status === 'endorsed' && <p>أيّدها راعيها{c.sponsor.name ? ` ${c.sponsor.name}` : ''}{c.sponsor.note ? `: «${c.sponsor.note}»` : '.'}</p>}
          {c.review?.note && <p className="muted">{c.review.note}</p>}
        </div>
      )}
      {c.status === 'approved' && <Tracking />}
      {c.status !== 'approved' && <ChooseExpert context="capstone" title="استشارة لمبادرتك" />}
      {c.status === 'accepted' && (
        <div className="alert info cp-alert">قبل المستشار وثيقتك، وأُرسل طلب التأييد إلى راعيها{c.sponsor?.name ? ` ${c.sponsor.name}` : ''}. تُعتمد حين يؤيدها.</div>
      )}

      <div className="cp-grid">
        <section className="card cp-sections">
          <h2>فصول الوثيقة</h2>
          <p className="muted small">كل فصل نموذج من مكتبة النماذج، يحفظ تلقائيًا ويُحسب في نقاطك. ابدأ ببطاقة المبادرة: منها يأخذ كل فصل اسمها.</p>
          <ol className="cp-list">
            {d.sections.map((s, i) => {
              const st = SECTION_STATE(s);
              return (
                <li key={s.id}>
                  <button className={`cp-sec${s.complete ? ' done' : ''}`} onClick={() => setOpen(s.id)}>
                    <span className="cp-n">{String(i + 1).padStart(2, '0')}</span>
                    <span className="model-icon sm">{s.icon}</span>
                    <span className="cp-t"><b>{s.title}</b><small>{dimOf(s.dimension).short}{!s.complete && s.missing ? ` · ${s.missing} حقول ناقصة` : ''}</small></span>
                    {st.t && <span className={`chip ${st.c}`}>{st.t}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="cp-side">
          <section className="card">
            <h3>فحوص الاتساق</h3>
            <p className="muted small">الوثيقة الاحترافية تتحدث فصولها مع بعضها. يفحصها النظام كلما فتحت الصفحة.</p>
            <ul className="cp-checks">
              {d.checks.map((x) => <li key={x.key} className={x.ok ? 'ok' : 'no'}><b>{x.title}{x.blocking && <span className="chip bad" title="لا تُسلَّم الوثيقة قبله"> لازم</span>}</b>{x.detail && <small>{x.detail}</small>}</li>)}
              {!d.checks.length && <li className="muted">تظهر الفحوص حين تملأ الفصول.</li>}
            </ul>
            {failing.length > 0 && <small className="muted">{failing.length} فحص مفتوح</small>}
          </section>

          <section className="card">
            <h3>الملخص التنفيذي</h3>
            <p className="muted small">رسالتك لصانع القرار في فقرة أو فقرتين: المشكلة، والحل، والقيمة، وما تطلبه.</p>
            <textarea className="input" rows={6} maxLength={3000} disabled={!editable} value={summary} onChange={(e) => setSummary(e.target.value)} />
            {editable && <button className="btn ghost sm" disabled={!!busy} onClick={saveSummary}>{busy === 'summary' ? 'لحظة…' : 'حفظ الملخص'}</button>}
          </section>

          <section className="card cp-act">
            {msg?.err && <div className="alert err">{msg.err}</div>}
            {msg?.ok && <div className="alert ok">{msg.ok}</div>}
            <button className="btn ghost block" disabled={!!busy} onClick={view}>{busy === 'doc' ? 'لحظة…' : 'اعرض الوثيقة الاحترافية'}</button>
            {editable && (
              <>
                <button className="btn gold block" disabled={!!busy || !d.can_submit} onClick={submit}>{busy === 'submit' ? 'لحظة…' : 'سلّم الوثيقة للمستشار'}</button>
                {!d.can_submit && d.blocker && <small className="muted">{d.blocker}</small>}
              </>
            )}
          </section>

          <details className="card cp-rubric">
            <summary>كيف تُقيَّم الوثيقة</summary>
            <p className="muted small">{d.rubric.length} أبعاد، كل بُعد من 1 إلى {RUBRIC_MAX}. أبعاد الإطار الأولوي في مسارك وزنها ×{PRIORITY_WEIGHT}{d.track?.priority ? ` (${dimOf(d.track.priority).short})` : ''}. الدرجة تدخل تقرير القائد بوزن {LEADER_WEIGHTS.capstone}%، ولا تظهر في الشهادة.</p>
            <ul>{d.rubric.map((r) => <li key={r.key}><b>{r.title}</b><small>{r.anchors[3]}</small></li>)}</ul>
          </details>
        </aside>
      </div>
      <p className="row"><button className="link small" onClick={onBack}>رجوع للرحلة</button></p>
    </div>
  );
}
