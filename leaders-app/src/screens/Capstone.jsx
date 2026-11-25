// ════════════════════════════════════════════════════════════════
// وثيقة المبادرة
// ════════════════════════════════════════════════════════════════
// فصول الوثيقة هي نماذجك التعليمية نفسها، تفتحها من هنا أو من المكتبة
// فتجد العمل ذاته. الصفحة تجمعها، وتفحص اتساقها، وتقدّمها إلى المستشار، وتصدر
// الوثيقة الاحترافية للطباعة. لا محتوى يُكتب مرتين.
import React, { useEffect, useState } from 'react';
import Ico from '../Ico.jsx';
import FirstOpen from '../FirstOpen.jsx';
import { call } from '../api.js';
import { useUnsavedGuard } from '../unsaved.js';
import { DIMENSIONS, dimOf, levelOf } from '../labels.js';
import { ModelView } from './Models.jsx';
import Tracking from './Tracking.jsx';
import Discovery from './Discovery.jsx';
import AskExpert from './AskExpert.jsx';
import { CHECK_CHAPTERS, stuckSignals } from '../../../supabase/functions/leaders-api/stuck.js';
import { GuidancePanel } from './Guidance.jsx';
import { AssistantContext, AssistantDrawer, GateLine, useAssistantAccess } from './Assistant.jsx';
import { MAX_REVISIONS, PRIORITY_WEIGHT, returnedBy, RUBRIC_MAX } from '../../../supabase/functions/leaders-api/capstone.js';
import { countAr, TERMS } from '../../../supabase/functions/leaders-api/labels.js';
import { caseStatus } from '../../../supabase/functions/leaders-api/business-case.js';
import { exampleDoc, examplesFor } from '../guide.js';
import { isoLtr, POPUP_BLOCKED } from '../ui.jsx';
import { Meaning, Spine } from './InitiativeMap.jsx';
import { trackManifest } from '../../../supabase/functions/leaders-api/track-manifest.js';
import { afterOf, chapterState, LENS, newInLevel, readinessQuestions, recentChanges, unitsFor, whereOf } from '../../../supabase/content/initiative-guide/v1/spine.js';
import SharePanel, { ShareCard } from './Share.jsx';
import Visuals, { VisualsCard } from './Visuals.jsx';
import { Annotated } from '../Term.jsx';

const REVISIONS_AR = MAX_REVISIONS === 1 ? 'تحسين واحد' : MAX_REVISIONS === 2 ? 'تحسينان' : `${MAX_REVISIONS} تحسينات`;

const CARD_GATE_TITLE = { none: 'الخطوة الأولى: اعتماد بطاقة المبادرة', waiting: 'بطاقة مبادرتك عند المستشار', returned: 'أعاد المستشار بطاقة مبادرتك' };
// إغلاق بطاقة التوجيه راحة عرض لكل مشارك في جهازه (لا حالة رحلة)، فلا تعود الإشارة نفسها بعد «ليس الآن»
const DISMISS_KEY = 'mi_leaders_stuck_dismissed';
const readDismissed = () => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); } catch { return []; } };
const saveDismissed = (list) => { try { localStorage.setItem(DISMISS_KEY, JSON.stringify(list.slice(-50))); } catch { /* تخزين محجوب: تبقى في الجلسة */ } };

// «جديد في مستواك»: مفاتيح الفصول التي رآها المشارك على هذا الجهاز. راحة عرض (لا حالة رحلة)، وأول زيارة لا توسم شيئًا
const SEEN_KEY = 'mi_leaders_spine_seen';
const readSeen = () => { try { const v = localStorage.getItem(SEEN_KEY); return v ? JSON.parse(v) : null; } catch { return null; } };
const saveSeen = (keys) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(keys)); } catch { /* تخزين محجوب */ } };

// سطر العدسة: لماذا يأتي إطار أعمق من غيره. من مستوى المشارك في إطار كل فصل (sections[].level)، لا من مستوى ملخص
export function lensLine(sections) {
  const by = {};
  for (const s of sections || []) if (s.level && s.dimension) by[s.dimension] = s.level;
  const ds = DIMENSIONS.filter((x) => by[x.key]);
  if (new Set(ds.map((x) => by[x.key])).size < 2) return null;
  return `فصول كل إطار بعمق مستواك فيه: ${ds.map((x) => `${x.short} ${levelOf(by[x.key]).title}`).join('، ')}. لذلك يأتي بعضها مجمّعًا في وحدات وبعضها فصلًا فصلًا.`;
}

// بيان المسار الواحد (track-manifest.js): الكثافة لا تُحسب من المستويات هنا. بلا مسار بعد: كثافة المتوسط
const FALLBACK_TRACK = 'M2I2L2';
const manifestOf = (r) => trackManifest(r?.track_key || FALLBACK_TRACK, r?.profile?.dimension) || trackManifest(FALLBACK_TRACK);

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
// keepReadiness: قراءة داخلية (الخبير) تبقي الجاهزية
// kind: 'working' ملف العمل الكامل، أو 'institutional' الوثيقة المؤسسية؛ المحجوبة تعيد { blocked, message }
export async function openCapstoneDoc(doc, win = window.open('', '_blank'), { keepReadiness = false, kind = 'working' } = {}) {
  const [{ writeDocument }, { withoutReadiness }, { renderInitiative }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/capstone.js'), import('../../../src/lib/brand/institutional.js')]);
  // نسخة تخرج من المنصة (طباعة المشارك، ورابط الراعي): بلا نسبة الجاهزية (قرار المالك 2026-11-24)
  const r = renderInitiative(keepReadiness ? doc : withoutReadiness(doc), kind);
  if (r.blocked) { win?.close(); return r; }
  return writeDocument(win, r.meta, r.body);
}

// onHandbook: إحالة فصل إلى بابه في الكتاب؛ reopen: الفصل الذي يُفتح عند العودة من الكتاب
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
  const [fresh, setFresh] = useState([]);
  // «اسأل المساعد» من الفصول: البوابة نفسها (guide.state)، ونص السؤال المملوء باسم الحقل وحده
  const access = useAssistantAccess(me);
  const [asst, setAsst] = useState(null);
  const assistant = { access, open: (text) => setAsst({ text }) };
  const load = () => call('capstone.get').then((r) => {
    setD(r);
    if (!r.success) return;
    setSummary(r.capstone.summary || (manifestOf(r).density.summary === 'auto' ? r.summary_draft || '' : ''));
    setFresh((f) => (f.length ? f : newInLevel(r.sections, readSeen())));
    saveSeen(r.sections.map((x) => x.key));
  });
  useEffect(() => { load(); call('capstone.shares').then(setShares).catch(() => {}); }, []);
  // العودة من الكتاب تفتح الفصل الذي خرج منه المشارك
  useEffect(() => { if (reopen && d?.success) { setOpen(reopen); onReopened(); } }, [reopen, d]);
  // الملخص التنفيذي يُحفظ يدويًا؛ مغادرة الصفحة وفيه تعديل تدفعه، وإغلاقها يحذّر
  // الملخص المقترح من البطاقة لا يُعد تعديلًا حتى يغيّره المشارك أو يحفظه
  const summaryDirty = !!d?.success && ['draft', 'returned'].includes(d.capstone.status) && summary !== (d.capstone.summary || '') && !(!d.capstone.summary && summary === (d.summary_draft || ''));
  useUnsavedGuard(summaryDirty, () => call('capstone.summary', { summary }));

  const go = (x) => { setOpen(x); load(); window.scrollTo({ top: 0 }); };
  // «أنهيت ← التالي»: الفصل التالي غير المنتهي، و«أنهيت الوحدة» حين يكون آخر فصل في وحدته
  const chapterCtx = (id) => {
    const next = afterOf(d.sections, id);
    const unit = unitsFor(d.sections).find((u) => u.items.some((x) => x.id === id));
    return { where: whereOf(d.sections, id), nextId: next?.id || null, nextTitle: next?.title || '', unitLast: !!unit && unit.items.length > 1 && unit.items[unit.items.length - 1].id === id, onNext: (x) => go(x) };
  };
  if (open) {
    return (
      <div className="page">
        <AssistantContext.Provider value={assistant}>
        <ModelView key={open} id={open} name={me.participant.full_name} backLabel="وثيقة مبادرتك" onBack={() => { setOpen(null); load(); }} onPoints={() => {}}
          nav={d?.success ? <Spine sections={d.sections} checks={d.checks} card={d.card} status={d.capstone.status} current={open} fresh={fresh} onOpen={go} onHandbook={onHandbook} /> : null}
          chapter={d?.success ? chapterCtx(open) : null} />
        </AssistantContext.Provider>
        <AssistantDrawer open={!!asst} initialText={asst?.text || ''} onClose={() => setAsst(null)} />
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
  // الفصل الاختياري (لا حقل مطلوبًا فيه) لا يُحسب مكتملًا ولا ناقصًا، كما في الجاهزية
  const req = d.sections.filter((s) => !s.optional);
  // «منتهٍ» بالتعريف الواحد على الخط (spine.js chapterState)، فلا يقول الرأس رقمًا والخط غيره
  const done = req.filter((s) => chapterState(s) === 'done').length;
  const failing = d.checks.filter((x) => !x.ok);
  // كثافة الصفحة بملف التعريف (track-manifest.js من lens.json)، لا بمستوى ملخص
  const den = manifestOf(d).density;
  const shownChecks = den.checks === 'blocking' ? d.checks.filter((x) => x.blocking) : d.checks;
  const cardOk = !d.card || d.card.state === 'approved';
  const recent = recentChanges(d.sections);

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
    if (!window.confirm('تُقدَّم الوثيقة إلى المستشار، وتُقفل فصولها حتى تعود إليك. متابعة؟')) return;
    setBusy('submit'); setMsg(null);
    if (summary !== (c.summary || '')) await call('capstone.summary', { summary });
    const r = await call('capstone.submit');
    setBusy('');
    if (!r.success) return setMsg({ err: r.message });
    setD(r);
    setMsg({ ok: 'قُدّمت الوثيقة إلى المستشار. يصلك بريد بقراره.' });
  };
  // ملف PDF جاهز مباشرة، بلا نافذة طباعة (src/lib/brand/pdf.js). التقدم يظهر في الزر نفسه
  const downloadPdfNow = async () => {
    setBusy('pdf'); setMsg(null); setPdfNote('لحظة…');
    const r = await call('capstone.doc');
    if (!r.success) { setBusy(''); setPdfNote(''); return setMsg({ err: r.message }); }
    try {
      const [{ capstoneReport, withoutReadiness }, { downloadPdf }] = await Promise.all([import('../../../src/lib/brand/capstone.js'), import('../../../src/lib/brand/pdf.js')]);
      const { meta, body } = capstoneReport(withoutReadiness(r.doc));
      await downloadPdf(meta, body, { onProgress: setPdfNote });
    } catch (e) {
      console.error(e);
      setMsg({ err: 'تعذّر بناء الملف في هذا المتصفح. افتح «ملف العمل الكامل» واختر «طباعة» ثم «حفظ PDF».' });
    }
    setBusy(''); setPdfNote('');
  };
  const view = async (kind = 'working') => {
    const win = window.open('', '_blank');   // متزامنة مع النقرة حتى لا يحجبها المتصفح، ثم تُملأ بعد رد الخادم
    setBusy(kind === 'institutional' ? 'inst' : 'doc'); setMsg(null);
    const r = await call('capstone.doc');
    setBusy('');
    if (!r.success) { win?.close(); return setMsg({ err: r.message }); }
    const ok = await openCapstoneDoc(r.doc, win, { kind });
    if (ok?.blocked) return setMsg({ err: ok.message });
    if (!ok) setMsg({ err: POPUP_BLOCKED });
  };

  return (
    <div className="page capstone">
      <FirstOpen id="capstone" icon="compass" title="مبادرتك من واقع تعرفه" lines={[
        'ابنِ مبادرة تقودها من واقع تعرفه: في جهة أو مجتمع أو سوق، وفصول الوثيقة تتبع نوعها (مشروع أو برنامج أو محفظة) كما حددته في ملفك.',
        'احفظ مسودتك متى شئت؛ لا يراها المستشار إلا حين تقدّمها.',
        // قاعدة التحسين من مصدرها (MAX_REVISIONS): تُقال قبل التسليم لا بعده
        `بعد التقديم لك ${REVISIONS_AR} بعد ملاحظات المستشار، ثم يقرر بحسب درجتها. فقدّمها حين تكتمل.`,
      ]} />
      <section className="cp-hero">
        <div className="cp-hero-main">
          <span className="book-eyebrow">{TERMS.capstoneEyebrow}</span>
          <h1>{d.initiative || 'وثيقة مبادرتك'}</h1>
          <p>
            {d.scope_title ? <b>{d.scope_title}</b> : 'وثيقة مبادرتك'}
            {d.track?.title ? <> · {d.track.title}</> : null}
          </p>
          {lensLine(d.sections) && <p className="small muted cp-lensline" data-lens-line>{lensLine(d.sections)}</p>}
          <ol className="cp-flow">
            {FLOW.map(([k, t], i) => <li key={k} className={i < step || c.status === 'approved' ? 'past' : i === step ? 'now' : ''}><span>{i < step || c.status === 'approved' ? '✓' : i + 1}</span>{t}</li>)}
          </ol>
        </div>
        <div className="cp-hero-side">
          <Meter value={d.readiness} min={d.ready_min} />
          <span className={`chip ${STATUS_CHIP[c.status] || ''}`}>{c.status_title}</span>
          <small>اكتمل {done} من {countAr(req.length, 'فصل واحد', 'فصلين', 'فصول', 'فصلًا')}</small>
        </div>
      </section>

      {!d.scope && (
        <div className="alert info cp-alert">
          نوع مبادرتك (مشروع، أو برنامج، أو محفظة) يأتي من نطاق عملك في ملفك، وبه تتحدد فصول الوثيقة.
          {' '}<button className="link" onClick={onEditProfile}>حدد نطاق عملك</button>
        </div>
      )}
      {d.track?.brief && <div className="card cp-brief"><span className="mg-cap">توجيه مسارك</span><p>{d.track.brief}</p></div>}

      {/* الأحدث بين رفض الراعي ومراجعة المستشار، لا رفض راعٍ قديم بقي في السجل */}
      {c.status === 'returned' && (returnedBy(c) === 'sponsor' ? (
        <div className="card cp-review bad"><h2>ملاحظات راعي المبادرة</h2><p>{c.sponsor.note}</p><small className="muted">عدّل الفصول ثم أعد التقديم.</small></div>
      ) : c.review && (
        <div className="card cp-review bad">
          <h2>ملاحظات المستشار</h2>
          {c.review.note && <p>{c.review.note}</p>}
          {Object.keys(c.review.notes || {}).length > 0 && (
            <ul>{d.rubric.filter((r) => c.review.notes[r.key]).map((r) => <li key={r.key}><b>{r.title}:</b> {c.review.notes[r.key]}</li>)}</ul>
          )}
          <small className="muted">أعاد المستشار الوثيقة إليك. عدّل الفصول ثم أعد التقديم.</small>
        </div>
      ))}
      {c.status === 'approved' && (
        <div className="card cp-review ok">
          <h2>اعتُمدت وثيقة مبادرتك</h2>
          {c.review?.score != null && <p className="cp-score"><b>{c.review.score}</b> من 100 بمعيار التقييم</p>}
          {c.sponsor?.status === 'endorsed' && <p>أيّدها راعيها{c.sponsor.name ? ` ${c.sponsor.name}` : ''}{c.sponsor.note ? `: «${c.sponsor.note}»` : '.'}</p>}
          {c.review?.note && <p className="muted">{c.review.note}</p>}
        </div>
      )}
      {/* الحساب التجريبي: المتابعة تُفتح للعرض بلا اعتماد (الخادم يحسبه له وحده ولا يخزّنه)، والشاشة تسمها «للعرض» */}
      {(c.status === 'approved' || me.participant.is_demo) && <Tracking owner={me.participant.id} />}
      {/* إشارات التعثر (4د): أعلاها أولوية وحدها، بثلاثة خيارات. تُشتق مما يرسله الخادم (stuck.js) */}
      {editable && (() => {
        const sig = stuckSignals({ sections: d.sections, checks: d.checks, card: d.card }).find((x) => !dismissed.includes(x.key));
        if (!sig) return null;
        const ex = den.examples !== 'adjacent' && d.examples?.doc !== false ? examplesFor(me?.participant?.sector, d.examples?.sectors ?? null, d.examples?.context ?? null)[0] : null;
        return (
          <section className="card stuck" aria-labelledby="stuck-h" data-stuck={sig.kind}>
            <h3 id="stuck-h">تحتاج توجيهًا؟</h3>
            <p><b>{sig.title}</b>{sig.detail && <small className="muted"> {isoLtr(sig.detail)}</small>}</p>
            <div className="row">
              <button type="button" className="btn gold sm" onClick={() => openSection(sig.chapter.id)}>افتح «{sig.chapter.title}»</button>
              {ex && <button type="button" className="btn ghost sm" onClick={() => openCapstoneDoc(exampleDoc(ex))}>اعرض المثال</button>}
              <button type="button" className="btn ghost sm" onClick={() => setAsk({ chapterTitle: sig.chapter.title, detail: sig.kind === 'check' ? sig.title : null, dimension: sig.chapter.dimension })}>اطلب استشارة خبير</button>
              <button type="button" className="link small" onClick={() => { const n = [...dismissed, sig.key]; setDismissed(n); saveDismissed(n); }}>ليس الآن</button>
            </div>
          </section>
        );
      })()}
      {ask && <AskExpert {...ask} onClose={() => setAsk(null)} />}

      {c.status !== 'approved' && !ask && <GuidancePanel guidance={me.guidance} context="capstone" consultTitle="استشارة لمبادرتك" />}
      {/* المدخل العام: المحادثة نفسها داخل اللوحة أعلاه حين تكون البوابة مفتوحة، وسطر السبب حين يستطيع المشارك فتحها */}
      {c.status !== 'approved' && !ask && access.kind === 'line' && access.reason !== 'start' && <AssistantContext.Provider value={assistant}><GateLine /></AssistantContext.Provider>}
      {c.status === 'accepted' && (
        <div className="alert info cp-alert">قبل المستشار وثيقتك، وأُرسل طلب التأييد إلى راعيها{c.sponsor?.name ? ` ${c.sponsor.name}` : ''}. تُعتمد حين يؤيدها.</div>
      )}

      {/* ما المبادرة؟ مفتوحة لمن لم يسمّ مبادرته بعد، ومطوية بعدها (anatomy.json) */}
      <Meaning scope={d.scope} open={!d.initiative} onHandbook={onHandbook} />

      {/* اكتشاف المبادرة (4ج): قبل البطاقة وحدها، حين لا اسم للمبادرة ولم تُسلَّم البطاقة بعد. ناتجه مسودة البطاقة نفسها */}
      {(() => {
        const charter = d.sections.find((s) => s.key === 'initiative-charter');
        if (!editable || skipDiscovery || d.initiative || !charter || (d.card && d.card.state !== 'none')) return null;
        return <Discovery level={charter.level} charterId={charter.id} onSkip={() => setSkipDiscovery(true)} onDone={() => openSection(charter.id)} />;
      })()}

      {/* بوابة البطاقة: ما ينتظره المشارك من المستشار قبل تقديم الوثيقة، وما يفعله في الأثناء */}
      {editable && d.card && d.card.state !== 'approved' && (
        <div className={`banner${d.card.state === 'returned' ? '' : ' gold'}`} data-card-gate={d.card.state}>
          <span className="ico"><Ico name={d.card.state === 'waiting' ? 'hourglass' : 'target'} /></span>
          <div className="grow">
            <b>{CARD_GATE_TITLE[d.card.state]}</b>
            <p className="small">{d.card.state === 'none' ? `اكتب بطاقة المبادرة وقدّمها أولًا: يعتمد مستشارك اختيار المبادرة عادةً خلال ${d.card.sla}، قبل أن تبني عليها بقية الفصول.`
              : d.card.state === 'waiting' ? `الاعتماد عادةً خلال ${d.card.sla}. تابع بقية الفصول في الأثناء، وتُقدَّم الوثيقة بعد اعتماد البطاقة.`
                : 'افتح بطاقة المبادرة لترى ملاحظات المستشار، ثم عدّلها وقدّمها من جديد.'}</p>
          </div>
        </div>
      )}
      <div className="cp-live">
        <Spine sections={d.sections} checks={d.checks} card={d.card} status={c.status} busy={busy === 'summary'} fresh={fresh} onOpen={openSection} onHandbook={onHandbook} />

        <aside className="cp-side cp-live-main">
          {recent.length > 0 && (
            <section className="card" aria-labelledby="cp-recent-h">
              <h3 id="cp-recent-h">آخر ما تغيّر في وثيقتك</h3>
              <ul className="cp-recent">{recent.map((x) => (
                <li key={x.id}><button type="button" className="link" onClick={() => openSection(x.id)}>{x.title}</button> <small className="muted">{new Date(x.updated_at).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long' })}</small></li>
              ))}</ul>
            </section>
          )}
          <section className="card">
            <h3>{den.checks === 'blocking' ? 'ما يلزم قبل التسليم' : 'فحوص الاتساق'}</h3>
            <p className="muted small">{den.checks === 'blocking' ? 'هذه وحدها تمنع تقديم الوثيقة، وكل منها يظهر أيضًا على فصله في الخط.' : 'يفحص النظام اتساق الفصول كلما فتحت الصفحة، وكل فحص مفتوح يظهر على فصله في الخط.'}</p>
            <ul className="cp-checks">
              {shownChecks.map((x) => {
                const ch = !x.ok && editable ? d.sections.find((sec) => (CHECK_CHAPTERS[x.key] || []).includes(sec.key)) : null;
                return (
                  <li key={x.key} className={x.ok ? 'ok' : 'no'}><b><Annotated text={x.title} />{x.blocking && <span className="chip bad" title="لا تُقدَّم الوثيقة قبله"> إلزامي</span>}</b>{x.detail && <small>{isoLtr(x.detail)}</small>}
                    {ch && <button type="button" className="link small" onClick={() => setAsk({ chapterTitle: ch.title, detail: x.title, dimension: ch.dimension })}>اسأل خبيرًا</button>}
                  </li>
                );
              })}
              {!shownChecks.length && <li className="muted">تظهر الفحوص حين تملأ الفصول.</li>}
            </ul>
            {failing.length > 0 && den.checks !== 'blocking' && <small className="muted">{failing.length} فحص مفتوح</small>}
          </section>

          {/* البطاقات الثانوية مطوية تحت الخط (المثال والمسوّغات والملخص)، وتُعرض بكثافة ملف التعريف */}
          <details className="card cp-fold">
            <summary>ملحقات الوثيقة: {[den.examples !== 'adjacent' && 'مثال محلول', den.case === 'readiness' ? 'جاهزية وثيقتك' : 'مسوّغات المبادرة', 'الملخص التنفيذي'].filter(Boolean).join('، ')}</summary>
            <div className="cp-side">

          {/* المبادرات المحلولة كاملة: يعرضها أو يحجبها المالك عامةً أو للدفعة، وكل قطاع وحده (examples من الخادم) */}
          {den.examples !== 'adjacent' && d.examples?.doc !== false && examplesFor(me?.participant?.sector, d.examples?.sectors ?? null, d.examples?.context ?? null).length > 0 && (
            <section className="card cp-example" aria-labelledby="cp-ex-h">
              <h3 id="cp-ex-h">مبادرة محلولة كاملة</h3>
              <p className="muted small">قبل أن تكتب، شاهد كيف تبدو وثيقة مكتملة من أول البطاقة إلى قصة التحول. للتعلم من بنيتها لا لنقلها: مبادرتك من واقع تعرفه.</p>
              <div className="row">
                {examplesFor(me?.participant?.sector, d.examples?.sectors ?? null, d.examples?.context ?? null).slice(0, den.examples === 'sector' ? 1 : undefined).map((ex, i) => (
                  <button key={ex.sector} type="button" className={`btn ${i ? 'ghost' : 'gold'} sm`} onClick={() => openCapstoneDoc(exampleDoc(ex))}>مثال {ex.sector_title}</button>
                ))}
              </div>
            </section>
          )}

          {den.case === 'readiness' ? (
            <section className="card cp-case" aria-labelledby="cp-case-h" data-case="readiness">
              <h3 id="cp-case-h">جاهزية وثيقتك</h3>
              <p className="muted small">ثلاثة أسئلة يسألها صاحب القرار، يجاب عنها من فصولك نفسها.</p>
              <ul className="cp-checks">
                {readinessQuestions(d.sections).map((q) => <li key={q.key} className={q.done ? 'ok' : 'no'}><b>{q.question}</b>{q.chapters[0] && !q.done && <button type="button" className="link small" onClick={() => openSection(q.chapters[0].id)}>افتح «{q.chapters[0].title}»</button>}</li>)}
              </ul>
            </section>
          ) : (
          <section className="card cp-case" aria-labelledby="cp-case-h" data-case={den.case}>
            <h3 id="cp-case-h">مسوّغات المبادرة</h3>
            <p className="muted small">{den.case === 'case3' ? 'ثلاثة' : 'خمسة'} أسئلة يطرحها صاحب القرار قبل التمويل، يجاب عنها من فصولك نفسها، وتظهر مع ميثاق المبادرة (صفحة القرار المولَّدة من بطاقتك) في الوثيقة الاحترافية.</p>
            <ul className="cp-checks">
              {caseStatus(d.sections).filter((x) => den.case !== 'case3' || LENS.density.case3.includes(x.key)).map((c) => (
                <li key={c.key} className={c.state === 'done' ? 'ok' : 'no'}>
                  <b>{c.title}{c.total > 0 && <span className="muted"> · {c.done} من {c.total}</span>}</b>
                  <small>{c.state === 'none' ? 'ليس من فصول وثيقتك في مستواك' : c.question}</small>
                </li>
              ))}
            </ul>
          </section>
          )}

          <section className="card">
            <h3 id="cp-summary-h">الملخص التنفيذي</h3>
            <p className="muted small" id="cp-summary-hint">{den.summary === 'auto' && !c.summary ? 'اقترحناه لك من بطاقة مبادرتك. عدّله إن شئت ثم احفظه.' : 'رسالتك إلى صاحب القرار في فقرة أو فقرتين: المشكلة، والحل، والقيمة، وما تطلبه.'}</p>
            <textarea className="input" rows={6} maxLength={3000} disabled={!editable} value={summary} onChange={(e) => setSummary(e.target.value)}
              aria-labelledby="cp-summary-h" aria-describedby="cp-summary-hint" />
            {editable && <button className="btn ghost sm" disabled={!!busy} onClick={saveSummary}>{busy === 'summary' ? 'لحظة…' : 'حفظ الملخص'}</button>}
          </section>
            </div>
          </details>

          {(den.panels !== 'after_card' || cardOk) && <VisualsCard onOpen={() => { setVizOpen(true); window.scrollTo({ top: 0 }); }} />}

          {(den.panels !== 'after_card' || cardOk) && <ShareCard data={shares} onOpen={() => { setShareOpen(true); window.scrollTo({ top: 0 }); }} />}

          <section className="card cp-act">
            {msg?.err && <div className="alert err">{msg.err}</div>}
            {msg?.ok && <div className="alert ok">{msg.ok}</div>}
            <button className="btn ghost block" disabled={!!busy} onClick={() => view()}>{busy === 'doc' ? 'لحظة…' : 'ملف العمل الكامل'}</button>
            <button className="btn ghost block" disabled={!!busy} onClick={() => view('institutional')}>{busy === 'inst' ? 'لحظة…' : 'الوثيقة المؤسسية'}</button>
            <button className="btn ghost block" disabled={!!busy} onClick={downloadPdfNow} aria-live="polite">{busy === 'pdf' ? pdfNote || 'لحظة…' : 'تحميل PDF'}</button>
            {editable && (
              <>
                <button className="btn gold block" disabled={!!busy || !d.can_submit} onClick={submit}>{busy === 'submit' ? 'لحظة…' : 'قدّم الوثيقة إلى المستشار'}</button>
                {!d.can_submit && d.blocker && <small className="muted">{d.blocker}</small>}
                {d.can_submit && <small className="muted">بعد التقديم تُقفل الفصول حتى يرد المستشار، ولك {REVISIONS_AR} بعد ملاحظاته، ثم تأييد الراعي إن كتبت بريده.</small>}
              </>
            )}
          </section>

          <details className="card cp-rubric">
            <summary>كيف تُقيَّم الوثيقة</summary>
            {den.rubric === 'lines4' ? <>
              <p className="muted small">ما يُنتظر منك في وثيقتك:</p>
              <ul>{LENS.density.rubric_lines.map((x) => <li key={x}><small>{x}</small></li>)}</ul>
            </> : <>
            <p className="muted small">{d.rubric.length} أبعاد، كل بُعد من 1 إلى {RUBRIC_MAX}. {d.track?.priority ? `أبعاد الإطار ذي الأولوية في مسارك (${dimOf(d.track.priority).short}) وزنها ×${PRIORITY_WEIGHT}.` : 'مستوياتك في الأطر الثلاثة متساوية، فكل الأبعاد بوزن واحد.'} الدرجة مكوّن «المشروع» في التقييم الختامي بوزنه المعلن في برنامجك، ومنه قرار الشهادة.</p>
            <ul>{d.rubric.map((r) => <li key={r.key}><b>{r.title}{den.rubric === 'weighted' && d.track?.priority === r.dimension ? ` · ×${PRIORITY_WEIGHT}` : ''}</b><small>{r.anchors[3]}</small></li>)}</ul>
            </>}
          </details>
        </aside>
      </div>
      <p className="row"><button className="link small" onClick={onBack}>→ رحلتي</button></p>
    </div>
  );
}
