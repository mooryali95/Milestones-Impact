// ════════════════════════════════════════════════════════════════
// وثيقة المبادرة (مشروع التخرج)
// ════════════════════════════════════════════════════════════════
// فصول الوثيقة هي نماذجك التعليمية نفسها، تفتحها من هنا أو من المكتبة
// فتجد العمل ذاته. الصفحة تجمعها، وتفحص اتساقها، وتسلّمها للمستشار، وتصدر
// الوثيقة الاحترافية للطباعة. لا محتوى يُكتب مرتين.
import React, { useEffect, useState } from 'react';
import Ico from '../Ico.jsx';
import FirstOpen from '../FirstOpen.jsx';
import { call } from '../api.js';
import { useUnsavedGuard } from '../unsaved.js';
import { dimOf, levelOf } from '../labels.js';
import { ModelView } from './Models.jsx';
import Tracking from './Tracking.jsx';
import Discovery from './Discovery.jsx';
import AskExpert from './AskExpert.jsx';
import { CHECK_CHAPTERS, stuckSignals } from '../../../supabase/functions/leaders-api/stuck.js';
import ChooseExpert from './ChooseExpert.jsx';
import { MAX_REVISIONS, PRIORITY_WEIGHT, returnedBy, RUBRIC_MAX } from '../../../supabase/functions/leaders-api/capstone.js';
import { countAr, TERMS } from '../../../supabase/functions/leaders-api/labels.js';
import { caseStatus } from '../../../supabase/functions/leaders-api/business-case.js';
import { exampleDoc, examplesFor } from '../guide.js';
import { isoLtr, POPUP_BLOCKED } from '../ui.jsx';
import { ChapterNav, Meaning, Navigator } from './InitiativeMap.jsx';
import SharePanel, { ShareCard } from './Share.jsx';
import Visuals, { VisualsCard } from './Visuals.jsx';
import { Annotated } from '../Term.jsx';

const REVISIONS_AR = MAX_REVISIONS === 1 ? 'تحسين واحد' : MAX_REVISIONS === 2 ? 'تحسينان' : `${MAX_REVISIONS} تحسينات`;

const CARD_GATE_TITLE = { none: 'الخطوة الأولى: اعتماد بطاقة المبادرة', waiting: 'بطاقة مبادرتك عند المستشار', returned: 'أعاد المستشار بطاقة مبادرتك' };
// إغلاق بطاقة التوجيه راحة عرض لكل مشارك في جهازه (لا حالة رحلة)، فلا تعود الإشارة نفسها بعد «ليس الآن»
const DISMISS_KEY = 'mi_leaders_stuck_dismissed';
const readDismissed = () => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); } catch { return []; } };
const saveDismissed = (list) => { try { localStorage.setItem(DISMISS_KEY, JSON.stringify(list.slice(-50))); } catch { /* تخزين محجوب: تبقى في الجلسة */ } };

const STATUS_CHIP = { draft: '', submitted: 'gold', returned: 'bad', accepted: 'gold', approved: 'ok' };
const FLOW = [['draft', 'ابنِ الفصول'], ['submitted', 'مراجعة المستشار'], ['accepted', 'تأييد الراعي إن وُجد'], ['approved', 'الاعتماد']];

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

// win: نافذة فُتحت متزامنة مع النقرة قبل أي انتظار، وإلا حجبها Safari (p-capstone-5). من يملك الوثيقة عند النقر
// (رابط الراعي) يتركها فتُفتح هنا متزامنة أيضًا
export async function openCapstoneDoc(doc, win = window.open('', '_blank')) {
  const [{ writeDocument }, { capstoneReport }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/capstone.js')]);
  const { meta, body } = capstoneReport(doc);
  return writeDocument(win, meta, body);
}

// onHandbook: إحالة فصل إلى بابه في الكتيب؛ reopen: الفصل الذي يُفتح عند العودة من الكتيب
export default function Capstone({ me, onEditProfile, onBack, onHandbook = null, reopen = null, onReopened = () => {} }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState('');
  const [pdfNote, setPdfNote] = useState('');
  // المشاركة برابط وملاحظات القراء (Share.jsx): ملخصها في الصفحة، ولوحتها تُفتح مكانها كالفصل
  const [shares, setShares] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [vizOpen, setVizOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  const [skipDiscovery, setSkipDiscovery] = useState(false);
  const [ask, setAsk] = useState(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const load = () => call('capstone.get').then((r) => { setD(r); if (r.success) setSummary(r.capstone.summary || ''); });
  useEffect(() => { load(); call('capstone.shares').then(setShares).catch(() => {}); }, []);
  // العودة من الكتيب تفتح الفصل الذي خرج منه المشارك
  useEffect(() => { if (reopen && d?.success) { setOpen(reopen); onReopened(); } }, [reopen, d]);
  // الملخص التنفيذي يُحفظ يدويًا؛ مغادرة الصفحة وفيه تعديل تدفعه، وإغلاقها يحذّر
  const summaryDirty = !!d?.success && ['draft', 'returned'].includes(d.capstone.status) && summary !== (d.capstone.summary || '');
  useUnsavedGuard(summaryDirty, () => call('capstone.summary', { summary }));

  if (open) {
    return (
      <div className="page">
        <ModelView key={open} id={open} name={me.participant.full_name} backLabel="وثيقة مبادرتك" onBack={() => { setOpen(null); load(); }} onPoints={() => {}}
          nav={d?.success ? <ChapterNav sections={d.sections} id={open} onOpen={(x) => { setOpen(x); window.scrollTo({ top: 0 }); }} onHandbook={onHandbook} /> : null} />
      </div>
    );
  }
  if (vizOpen && d?.success) {
    return <div className="page"><Visuals initiative={d.initiative} sections={d.sections} onBack={() => setVizOpen(false)} onOpenChapter={(id) => { setVizOpen(false); setOpen(id); window.scrollTo({ top: 0 }); }} /></div>;
  }
  if (shareOpen && d?.success) {
    return <div className="page"><SharePanel initiative={d.initiative} sections={d.sections} onBack={() => setShareOpen(false)} onChanged={setShares} /></div>;
  }
  if (!d) return <div className="center-load"><div className="spinner" /></div>;
  if (!d.success) return <div className="page narrow"><div className="alert err">{d.message}</div></div>;

  const c = d.capstone;
  const editable = c.status === 'draft' || c.status === 'returned';
  const step = c.status === 'returned' ? 0 : Math.max(0, FLOW.findIndex(([k]) => k === c.status));
  const done = d.sections.filter((s) => s.complete).length;
  const failing = d.checks.filter((x) => !x.ok);

  // الفصل يُفتح والصفحة قائمة خلفه (فلا يدفع حارس المغادرة الحفظ)، ثم تُحمَّل من جديد عند الرجوع فتستبدل الملخص
  // بنسخة الخادم: يُحفظ الملخص المعدَّل قبل فتح الفصل، وإن تعذّر بقي في مكانه برسالة (p-capstone-3)
  const openSection = async (id) => {
    if (summaryDirty) {
      setBusy('summary'); setMsg(null);
      const r = await call('capstone.summary', { summary });
      setBusy('');
      if (!r.success) return setMsg({ err: `لم يُحفظ الملخص التنفيذي، فبقيت في الصفحة حتى لا يضيع: ${r.message}` });
    }
    setOpen(id);
  };
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
  // ملف PDF جاهز مباشرة، بلا نافذة طباعة (src/lib/brand/pdf.js). التقدم يظهر في الزر نفسه
  const downloadPdfNow = async () => {
    setBusy('pdf'); setMsg(null); setPdfNote('لحظة…');
    const r = await call('capstone.doc');
    if (!r.success) { setBusy(''); setPdfNote(''); return setMsg({ err: r.message }); }
    try {
      const [{ capstoneReport }, { downloadPdf }] = await Promise.all([import('../../../src/lib/brand/capstone.js'), import('../../../src/lib/brand/pdf.js')]);
      const { meta, body } = capstoneReport(r.doc);
      await downloadPdf(meta, body, { onProgress: setPdfNote });
    } catch (e) {
      console.error(e);
      setMsg({ err: 'تعذّر بناء الملف في هذا المتصفح. افتح «اعرض الوثيقة الاحترافية» واختر «طباعة» ثم «حفظ PDF».' });
    }
    setBusy(''); setPdfNote('');
  };
  const view = async () => {
    const win = window.open('', '_blank');   // متزامنة مع النقرة حتى لا يحجبها المتصفح، ثم تُملأ بعد رد الخادم
    setBusy('doc'); setMsg(null);
    const r = await call('capstone.doc');
    setBusy('');
    if (!r.success) { win?.close(); return setMsg({ err: r.message }); }
    if (!(await openCapstoneDoc(r.doc, win))) setMsg({ err: POPUP_BLOCKED });
  };

  return (
    <div className="page capstone">
      <FirstOpen id="capstone" icon="compass" title="مبادرتك من واقع تعرفه" lines={[
        'ابنِ مبادرة تقودها من واقع تعرفه: في جهة أو مجتمع أو سوق، وفصول الوثيقة تتبع نوعها (مشروع أو برنامج أو محفظة) كما حددته في ملفك.',
        'احفظ مسودتك متى شئت؛ لا يراها المستشار إلا حين تسلّمها.',
        // قاعدة التحسين من مصدرها (MAX_REVISIONS): تُقال قبل التسليم لا بعده
        `بعد التسليم لك ${REVISIONS_AR} بعد ملاحظات المستشار، ثم يقرر بدرجتها. فسلّمها حين تكتمل.`,
      ]} />
      <section className="cp-hero">
        <div className="cp-hero-main">
          <span className="book-eyebrow">{TERMS.capstoneEyebrow}</span>
          <h1>{d.initiative || 'وثيقة مبادرتك'}</h1>
          <p>
            {d.scope_title ? <b>{d.scope_title}</b> : 'وثيقة مبادرتك'}
            {' · '}مستوى {levelOf(d.level).title}{d.track?.title ? <> · {d.track.title}</> : null}
          </p>
          <ol className="cp-flow">
            {FLOW.map(([k, t], i) => <li key={k} className={i < step || c.status === 'approved' ? 'past' : i === step ? 'now' : ''}><span>{i < step || c.status === 'approved' ? '✓' : i + 1}</span>{t}</li>)}
          </ol>
        </div>
        <div className="cp-hero-side">
          <Meter value={d.readiness} min={d.ready_min} />
          <span className={`chip ${STATUS_CHIP[c.status] || ''}`}>{c.status_title}</span>
          <small>اكتمل {done} من {countAr(d.sections.length, 'فصل واحد', 'فصلين', 'فصول', 'فصلًا')}</small>
        </div>
      </section>

      {!d.scope && (
        <div className="alert info cp-alert">
          نوع مشروعك (مشروع، أو برنامج، أو محفظة) يأتي من نطاق عملك في ملفك، وبه تتحدد فصول الوثيقة.
          {' '}<button className="link" onClick={onEditProfile}>حدد نطاق عملك</button>
        </div>
      )}
      {d.track?.brief && <div className="card cp-brief"><span className="mg-cap">توجيه مسارك</span><p>{d.track.brief}</p></div>}

      {/* الأحدث بين رفض الراعي ومراجعة المستشار، لا رفض راعٍ قديم بقي في السجل */}
      {c.status === 'returned' && (returnedBy(c) === 'sponsor' ? (
        <div className="card cp-review bad"><h2>ملاحظات راعي المبادرة</h2><p>{c.sponsor.note}</p><small className="muted">عدّل الفصول ثم أعد التسليم.</small></div>
      ) : c.review && (
        <div className="card cp-review bad">
          <h2>ملاحظات المستشار</h2>
          {c.review.note && <p>{c.review.note}</p>}
          {Object.keys(c.review.notes || {}).length > 0 && (
            <ul>{d.rubric.filter((r) => c.review.notes[r.key]).map((r) => <li key={r.key}><b>{r.title}:</b> {c.review.notes[r.key]}</li>)}</ul>
          )}
          <small className="muted">أعاد المستشار الوثيقة إليك. عدّل الفصول ثم أعد التسليم.</small>
        </div>
      ))}
      {c.status === 'approved' && (
        <div className="card cp-review ok">
          <h2>اعتُمدت وثيقة مبادرتك</h2>
          {c.review?.score != null && <p className="cp-score"><b>{c.review.score}</b> من 100 في معيار المستشار</p>}
          {c.sponsor?.status === 'endorsed' && <p>أيّدها راعيها{c.sponsor.name ? ` ${c.sponsor.name}` : ''}{c.sponsor.note ? `: «${c.sponsor.note}»` : '.'}</p>}
          {c.review?.note && <p className="muted">{c.review.note}</p>}
        </div>
      )}
      {c.status === 'approved' && <Tracking owner={me.participant.id} />}
      {/* إشارات التعثر (4د): أعلاها أولوية وحدها، بثلاثة خيارات. تُشتق مما يرسله الخادم (stuck.js) */}
      {editable && (() => {
        const sig = stuckSignals({ sections: d.sections, checks: d.checks, card: d.card }).find((x) => !dismissed.includes(x.key));
        if (!sig) return null;
        const ex = d.examples?.doc !== false ? examplesFor(me?.sector, d.examples?.sectors ?? null, d.examples?.context ?? null)[0] : null;
        return (
          <section className="card stuck" aria-labelledby="stuck-h" data-stuck={sig.kind}>
            <h3 id="stuck-h">تحتاج توجيهًا؟</h3>
            <p><b>{sig.title}</b>{sig.detail && <small className="muted"> {isoLtr(sig.detail)}</small>}</p>
            <div className="row">
              <button type="button" className="btn gold sm" onClick={() => openSection(sig.chapter.id)}>افتح «{sig.chapter.title}»</button>
              {ex && <button type="button" className="btn ghost sm" onClick={() => openCapstoneDoc(exampleDoc(ex))}>أرني المثال</button>}
              <button type="button" className="btn ghost sm" onClick={() => setAsk({ chapterTitle: sig.chapter.title, detail: sig.kind === 'check' ? sig.title : null, dimension: sig.chapter.dimension })}>أريد التحدث مع مختص</button>
              <button type="button" className="link small" onClick={() => { const n = [...dismissed, sig.key]; setDismissed(n); saveDismissed(n); }}>ليس الآن</button>
            </div>
          </section>
        );
      })()}
      {ask && <AskExpert {...ask} onClose={() => setAsk(null)} />}

      {c.status !== 'approved' && !ask && <ChooseExpert context="capstone" title="استشارة لمبادرتك" />}
      {c.status === 'accepted' && (
        <div className="alert info cp-alert">قبل المستشار وثيقتك، وأُرسل طلب التأييد إلى راعيها{c.sponsor?.name ? ` ${c.sponsor.name}` : ''}. تُعتمد حين يؤيدها.</div>
      )}

      {/* ما المبادرة؟ مفتوحة لمن لم يسمّ مبادرته بعد، ومطوية بعدها (anatomy.json) */}
      <Meaning scope={d.scope} open={!d.initiative} onHandbook={onHandbook} />

      {/* اكتشاف المبادرة (4ج): قبل البطاقة وحدها، حين لا اسم للمبادرة ولم تُسلَّم البطاقة بعد. ناتجه مسودة البطاقة نفسها */}
      {(() => {
        const charter = d.sections.find((s) => s.key === 'initiative-charter');
        if (!editable || skipDiscovery || d.initiative || !charter || (d.card && d.card.state !== 'none')) return null;
        return <Discovery level={d.level} charterId={charter.id} onSkip={() => setSkipDiscovery(true)} onDone={() => openSection(charter.id)} />;
      })()}

      {/* بوابة البطاقة: ما ينتظره المشارك من المستشار قبل تسليم الوثيقة، وما يفعله في الأثناء */}
      {editable && d.card && d.card.state !== 'approved' && (
        <div className={`banner${d.card.state === 'returned' ? '' : ' gold'}`} data-card-gate={d.card.state}>
          <span className="ico"><Ico name={d.card.state === 'waiting' ? 'hourglass' : 'target'} /></span>
          <div className="grow">
            <b>{CARD_GATE_TITLE[d.card.state]}</b>
            <p className="small">{d.card.state === 'none' ? `اكتب بطاقة المبادرة وسلّمها أولًا: يعتمد مستشارك اختيار المبادرة عادةً خلال ${d.card.sla}، قبل أن تبني عليها بقية الفصول.`
              : d.card.state === 'waiting' ? `الاعتماد عادةً خلال ${d.card.sla}. تابع بقية الفصول في الأثناء، وتُسلَّم الوثيقة بعد اعتماد البطاقة.`
                : 'افتح بطاقة المبادرة لترى ملاحظات المستشار، ثم عدّلها وسلّمها من جديد.'}</p>
          </div>
        </div>
      )}
      <div className="cp-grid">
        <Navigator sections={d.sections} busy={busy === 'summary'} onOpen={openSection} onHandbook={onHandbook} />

        <aside className="cp-side">
          <section className="card">
            <h3>فحوص الاتساق</h3>
            <p className="muted small">يفحص النظام اتساق الفصول كلما فتحت الصفحة.</p>
            <ul className="cp-checks">
              {d.checks.map((x) => {
                const ch = !x.ok && editable ? d.sections.find((sec) => (CHECK_CHAPTERS[x.key] || []).includes(sec.key)) : null;
                return (
                  <li key={x.key} className={x.ok ? 'ok' : 'no'}><b><Annotated text={x.title} />{x.blocking && <span className="chip bad" title="لا تُسلَّم الوثيقة قبله"> لازم</span>}</b>{x.detail && <small>{isoLtr(x.detail)}</small>}
                    {ch && <button type="button" className="link small" onClick={() => setAsk({ chapterTitle: ch.title, detail: x.title, dimension: ch.dimension })}>اسأل مختصًا</button>}
                  </li>
                );
              })}
              {!d.checks.length && <li className="muted">تظهر الفحوص حين تملأ الفصول.</li>}
            </ul>
            {failing.length > 0 && <small className="muted">{failing.length} فحص مفتوح</small>}
          </section>

          {/* المبادرات المحلولة كاملة: يعرضها أو يحجبها المالك عامةً أو للدفعة، وكل قطاع وحده (examples من الخادم) */}
          {d.examples?.doc !== false && examplesFor(me?.sector, d.examples?.sectors ?? null, d.examples?.context ?? null).length > 0 && (
            <section className="card cp-example" aria-labelledby="cp-ex-h">
              <h3 id="cp-ex-h">مبادرة محلولة كاملة</h3>
              <p className="muted small">قبل أن تكتب، شاهد كيف تبدو وثيقة مكتملة من أول البطاقة إلى قصة التحول. للتعلم من بنيتها لا لنقلها: مبادرتك من واقع تعرفه.</p>
              <div className="row">
                {examplesFor(me?.sector, d.examples?.sectors ?? null, d.examples?.context ?? null).map((ex, i) => (
                  <button key={ex.sector} type="button" className={`btn ${i ? 'ghost' : 'gold'} sm`} onClick={() => openCapstoneDoc(exampleDoc(ex))}>مثال {ex.sector_title}</button>
                ))}
              </div>
            </section>
          )}

          <section className="card cp-case" aria-labelledby="cp-case-h">
            <h3 id="cp-case-h">حالة العمل</h3>
            <p className="muted small">خمسة أسئلة يطرحها صاحب القرار قبل التمويل، يجاب عنها من فصولك نفسها، وتظهر مع ميثاق المبادرة في الوثيقة الاحترافية.</p>
            <ul className="cp-checks">
              {caseStatus(d.sections).map((c) => (
                <li key={c.key} className={c.state === 'done' ? 'ok' : 'no'}>
                  <b>{c.title}{c.total > 0 && <span className="muted"> · {c.done} من {c.total}</span>}</b>
                  <small>{c.state === 'none' ? 'ليس من فصول وثيقتك في مستواك' : c.question}</small>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h3 id="cp-summary-h">الملخص التنفيذي</h3>
            <p className="muted small" id="cp-summary-hint">رسالتك لصانع القرار في فقرة أو فقرتين: المشكلة، والحل، والقيمة، وما تطلبه.</p>
            <textarea className="input" rows={6} maxLength={3000} disabled={!editable} value={summary} onChange={(e) => setSummary(e.target.value)}
              aria-labelledby="cp-summary-h" aria-describedby="cp-summary-hint" />
            {editable && <button className="btn ghost sm" disabled={!!busy} onClick={saveSummary}>{busy === 'summary' ? 'لحظة…' : 'حفظ الملخص'}</button>}
          </section>

          <VisualsCard onOpen={() => { setVizOpen(true); window.scrollTo({ top: 0 }); }} />

          <ShareCard data={shares} onOpen={() => { setShareOpen(true); window.scrollTo({ top: 0 }); }} />

          <section className="card cp-act">
            {msg?.err && <div className="alert err">{msg.err}</div>}
            {msg?.ok && <div className="alert ok">{msg.ok}</div>}
            <button className="btn ghost block" disabled={!!busy} onClick={view}>{busy === 'doc' ? 'لحظة…' : 'اعرض الوثيقة الاحترافية'}</button>
            <button className="btn ghost block" disabled={!!busy} onClick={downloadPdfNow} aria-live="polite">{busy === 'pdf' ? pdfNote || 'لحظة…' : 'تحميل PDF'}</button>
            {editable && (
              <>
                <button className="btn gold block" disabled={!!busy || !d.can_submit} onClick={submit}>{busy === 'submit' ? 'لحظة…' : 'سلّم الوثيقة للمستشار'}</button>
                {!d.can_submit && d.blocker && <small className="muted">{d.blocker}</small>}
                {d.can_submit && <small className="muted">بعد التسليم تُقفل الفصول حتى يرد المستشار، ولك {REVISIONS_AR} بعد ملاحظاته، ثم تأييد الراعي إن كتبت بريده.</small>}
              </>
            )}
          </section>

          <details className="card cp-rubric">
            <summary>كيف تُقيَّم الوثيقة</summary>
            <p className="muted small">{d.rubric.length} أبعاد، كل بُعد من 1 إلى {RUBRIC_MAX}. {d.track?.priority ? `أبعاد إطارك الأولوي (${dimOf(d.track.priority).short}) وزنها ×${PRIORITY_WEIGHT}.` : 'مستوياتك في الأطر الثلاثة متساوية، فكل الأبعاد بوزن واحد.'} الدرجة مكوّن «المشروع» في التقييم الختامي بوزنه المعلن في برنامجك، ومنه قرار الشهادة.</p>
            <ul>{d.rubric.map((r) => <li key={r.key}><b>{r.title}</b><small>{r.anchors[3]}</small></li>)}</ul>
          </details>
        </aside>
      </div>
      <p className="row"><button className="link small" onClick={onBack}>→ رحلتي</button></p>
    </div>
  );
}
