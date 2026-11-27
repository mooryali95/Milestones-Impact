// ════════════════════════════════════════════════════════════════
// قارئ الكتاب الأم: الأبواب السبعة والعشرون بالأطر الثلاثة، بفهرس وتعليقات ونسخة مراجعة PDF
// ════════════════════════════════════════════════════════════════
// المرحلة 1 من تصور «الكتاب الأم» (اعتمده المالك 2026-11-15). قارئ واحد للوحة الإدارة وبوابة الخبير:
// كل منهما يمرر api بأفعاله (admin.book… أو xp.book…)، والقواعد كلها على الخادم وفي master-book.js.
// الإخراج نفسه الذي تطبعه النسخة الشخصية (mdHtml من book.js): البطاقات ومسار الخطوات والرسوم، فلا محلل ثانٍ.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COVER_CSS, chapterImage, coverHtml, mdHtml, partImage, writeBook } from '../../src/lib/brand/book.js';
import { DIMENSIONS, LEVEL_AR } from '../../supabase/functions/leaders-api/labels.js';
import { parseQuiz } from '../../supabase/functions/leaders-api/logic.js';
import { bookSections, chapterVisible, markTiers, outOfSeat, tierAr, tierVisible, BODY_MAX, OUT_OF_SEAT_AR, QUOTE_MAX } from '../../supabase/functions/leaders-api/master-book.js';
import { chapterDeps } from './deps.js';
import { ProposalEditor, ProposalsSheet, useDialogFocus } from './Proposals.jsx';
import ReleaseSheet from './Release.jsx';
import { REFLECTION } from '../../supabase/functions/leaders-api/book-proposals.js';
import { canResume, chapterRef, cleanPrefs, FONTS, hashRef, hashWithRef, inHScroll, isMarked, LEGACY_KEY, lineHeight, liveMarks, normalizeAr, readerKey, refIndex, resumeAt, searchBook, SIZES, SPACINGS, THEMES, toggleMark } from './reader.js';
import './master-book.css';

const ROMAN = { milestone: 'I', impact: 'II', leadership: 'III' };
const PART = { milestone: 'الجزء الأول', impact: 'الجزء الثاني', leadership: 'الجزء الثالث' };
// الأجزاء الثلاثة بترتيبها الثابت، ثم «مسودات للمراجعة»: وثائق معروضة على اللجنة تُقرأ ويُعلَّق عليها كالأبواب
const DRAFT = { key: 'draft', roman: '✎', label: 'ملحق · مسودات للمراجعة', title: 'مسودات للمراجعة', short: 'مسودات' };
const PARTS = [...DIMENSIONS.map((d) => ({ key: d.key, roman: ROMAN[d.key], label: `${PART[d.key]} · ${d.short}`, title: d.title, short: d.short })), DRAFT];
// المقعد (المرحلة 1 من «أجزاء الكتاب وخبير المحتوى»): سطر في الرف يسمي جزء العضو، أو نطاقه الكتاب كاملًا لعضو القياس
const seatLine = (seat) => {
  if (seat === 'all') return { label: 'نطاقك', text: 'الكتاب كاملًا' };
  if (!Array.isArray(seat)) return null;
  if (!seat.length) return { label: 'مقعدك', text: 'لم يُحدَّد إطارك بعد، فتعليقك يظهر موسومًا من خارج الإطار' };
  return { label: 'مقعدك', text: PARTS.filter((p) => seat.includes(p.key)).map((p) => `${PART[p.key]} · ${p.title}`).join('، ') };
};
// شارة التعليق من خارج إطار كاتبه: محايدة لا توحي بالخطأ
const OutSeat = () => <span className="mb-outseat">{OUT_OF_SEAT_AR}</span>;
// نطاق القراءة (المرحلة 2): الجزء وحده يقصر الفهرس والتقليب على أبواب الجزء الحالي، والكتاب كاملًا كما كان
const SCOPES = [['part', 'الجزء وحده'], ['book', 'الكتاب كاملًا']];
const LEVELS = [['all', 'كل المستويات'], ['beginner', LEVEL_AR.beginner], ['intermediate', LEVEL_AR.intermediate], ['advanced', LEVEL_AR.advanced]];
const two = (n) => String(n).padStart(2, '0');
const anchor = (s) => `mb-s-${encodeURIComponent(s || 'top').replace(/%/g, '')}`;
const dateAr = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const ago = (d) => {
  const m = Math.round((Date.now() - Date.parse(d)) / 6e4);
  if (m < 1) return 'الآن';
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  return dateAr(d);
};
const initials = (n) => String(n || '؟').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* التخزين غير متاح: يعمل القارئ بلا تذكّر */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* */ } },
};
// أقسام الباب للبحث والعلامات: المفتاح والعنوان والمتن كله بمستوياته
const sectionsOf = (c) => bookSections(c.md).map((s) => ({ key: s.key, title: s.title, md: s.parts.map((p) => p.md).join('\n') }));
const sectionKeys = (c) => bookSections(c.md).filter((s) => s.title).map((s) => s.key);
const SIZE_AR = { 16: 'صغير', 18: 'متوسط', 20: 'كبير', 22: 'أكبر' };
const Ribbon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-4-5 4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── الكتاب ثلاثي الأبعاد: الغلاف نفسه في المنصة والنسخة المطبوعة، بكعب وحافة صفحات، يميل مع المؤشر ──
function Book3D({ version, onOpen, opening }) {
  const ref = useRef(null);
  const move = (e) => {
    const el = ref.current;
    if (!el || reduced()) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.setProperty('--ry', `${-22 + x * 14}deg`);
    el.style.setProperty('--rx', `${6 - y * 8}deg`);
  };
  const leave = () => { ref.current?.style.removeProperty('--ry'); ref.current?.style.removeProperty('--rx'); };
  return (
    <button type="button" className={`mb-stage${opening ? ' opening' : ''}`} onPointerMove={move} onPointerLeave={leave} onClick={onOpen} aria-label="افتح الكتاب الأم">
      <span className="mb-book3d" ref={ref}>
        <span className="mb-face mb-front" dangerouslySetInnerHTML={{ __html: coverHtml({ code: version ? `MASTER · ${version}` : 'MASTER' }) }} />
        <span className="mb-face mb-pages" aria-hidden="true" />
        <span className="mb-face mb-spine" aria-hidden="true"><b>كتاب القائد</b><small>الكتاب الأم</small></span>
        <span className="mb-face mb-back" aria-hidden="true" />
        <span className="mb-face mb-edge" aria-hidden="true" />
      </span>
      <span className="mb-shadow" aria-hidden="true" />
    </button>
  );
}

// ── شارة المعلّق ──
function Avatar({ c }) {
  return <span className={`mb-av ${c.author_kind}`} aria-hidden="true">{initials(c.author_name)}</span>;
}

function Comment({ c, viewer, onReply, onDelete, onStatus, reply = false }) {
  return (
    <article className={`mb-cm${reply ? ' reply' : ''}${c.status === 'resolved' ? ' done' : ''}`}>
      <header>
        <Avatar c={c} />
        <div className="mb-cm-who">
          <b>{c.deleted ? 'تعليق محذوف' : c.author_name}</b>
          <small>{c.author_role}{c.out_of_seat && !c.deleted ? <> <OutSeat /></> : null}{c.created_at ? ` · ${ago(c.created_at)}` : ''}</small>
        </div>
        {!reply && <span className={`mb-chip ${c.status === 'resolved' ? 'ok' : 'open'}`}>{c.status === 'resolved' ? 'محسوم' : 'مفتوح'}</span>}
      </header>
      {c.stale && !c.deleted && <p className="mb-stale">كُتب على نص تغيّر بعده</p>}
      {c.quote && <blockquote className="mb-quote">{c.quote}</blockquote>}
      {!c.deleted && <p className="mb-cm-body">{c.body}</p>}
      {!c.deleted && (
        <footer>
          {!reply && viewer.write && <button type="button" className="mb-link" onClick={() => onReply(c)}>رد</button>}
          {!reply && viewer.resolve && <button type="button" className="mb-link" onClick={() => onStatus(c, c.status === 'resolved' ? 'open' : 'resolved')}>{c.status === 'resolved' ? 'أعد الفتح' : 'حسم'}</button>}
          {c.mine && (viewer.write || viewer.kind === 'admin') && <button type="button" className="mb-link danger" onClick={() => onDelete(c)}>حذف</button>}
          {c.status === 'resolved' && c.resolved_at && !reply && <small className="mb-muted">حُسم {ago(c.resolved_at)}</small>}
        </footer>
      )}
      {(c.replies || []).map((r) => <Comment key={r.id} c={r} viewer={viewer} onDelete={onDelete} onStatus={onStatus} reply />)}
    </article>
  );
}

// ── لوحة التعليقات: سلاسل قسم واحد، ومحرر تعليق جديد أو رد ──
function Thread({ target, chapter, list, viewer, api, onChanged, onClose }) {
  const dlg = useDialogFocus();
  const [text, setText] = useState('');
  const [quote, setQuote] = useState(target.quote || '');
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const box = useRef(null);
  useEffect(() => { setQuote(target.quote || ''); setReplyTo(null); setErr(''); }, [target]);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const send = async () => {
    setBusy(true); setErr('');
    const r = await api.add({ module_id: chapter.id, section: target.section || '', quote: replyTo ? '' : quote, body: text, parent_id: replyTo?.id || null });
    setBusy(false);
    if (!r?.success) { setErr(r?.message || 'تعذّر الحفظ'); return; }
    setText(''); setQuote(''); setReplyTo(null);
    onChanged();
  };
  const del = async (c) => { if (!confirm('حذف التعليق؟')) return; const r = await api.del(c.id); if (r?.success) onChanged(); else setErr(r?.message || 'تعذّر الحذف'); };
  const status = async (c, s) => { const r = await api.status(c.id, s); if (r?.success) onChanged(); else setErr(r?.message || 'تعذّر التحديث'); };
  return (
    <div className="mb-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={dlg} tabIndex={-1} className="mb-sheet" role="dialog" aria-modal="true" aria-label="التعليقات">
        <span className="mb-grip" aria-hidden="true" />
        <header className="mb-sheet-h">
          <div><small>{chapter.title}</small><b>{target.section || 'الباب كله'}</b></div>
          <button type="button" className="mb-x" onClick={onClose} aria-label="إغلاق">×</button>
        </header>
        <div className="mb-sheet-body">
          {!list.length && <p className="mb-empty">لا تعليقات على هذا القسم بعد.{viewer.write ? ' كن أول من يعلّق.' : ''}</p>}
          {list.map((c) => <Comment key={c.id} c={c} viewer={viewer} onReply={(x) => { setReplyTo(x); box.current?.focus(); }} onDelete={del} onStatus={status} />)}
        </div>
        {viewer.write ? (
          <footer className="mb-compose">
            {outOfSeat(viewer, chapter) && <p className="mb-seat-note">تعليقك هنا يظهر موسومًا: {OUT_OF_SEAT_AR}</p>}
            {replyTo && <p className="mb-replying">ردًا على {replyTo.author_name} <button type="button" className="mb-link" onClick={() => setReplyTo(null)}>إلغاء</button></p>}
            {!replyTo && quote && <blockquote className="mb-quote">{quote}<button type="button" className="mb-link" onClick={() => setQuote('')}>إزالة الاقتباس</button></blockquote>}
            <textarea ref={box} rows={3} value={text} maxLength={BODY_MAX} onChange={(e) => setText(e.target.value)} placeholder={replyTo ? 'اكتب ردك' : 'ملاحظتك على هذا القسم: ما الذي يُضاف أو يُصحح أو يُحذف، ولماذا'} />
            {err && <p className="mb-err" role="alert">{err}</p>}
            <div className="mb-row"><small className="mb-muted">يظهر تعليقك باسمك وصفتك للإدارة ولأعضاء اللجنتين</small><button type="button" className="mb-btn gold" disabled={busy || text.trim().length < 2} onClick={send}>{busy ? 'يُحفظ…' : replyTo ? 'أرسل الرد' : 'أضف التعليق'}</button></div>
          </footer>
        ) : <footer className="mb-compose"><p className="mb-muted">{viewer.paused ? 'عضويتك في اللجنة موقوفة مؤقتًا: تقرأ الكتاب ولا تعلّق حتى تُفعَّل.' : viewer.kind === 'expert' ? 'حسابك للقراءة فقط، فتقرأ الكتاب والتعليقات ولا تكتب.' : 'حسابك للقراءة. التعليق يحتاج صلاحية الكتابة ودخولًا بمفتاح المرور أو تطبيق المصادقة.'}</p></footer>}
      </aside>
    </div>
  );
}

// ── المشاركة مع الخبراء (للإدارة): المشاركة عضوية في لجنة، لا رابط منفصل يُرسل ──
const COMM = [['content', 'لجنة المحتوى'], ['measurement', 'لجنة القياس']];
function ShareSheet({ share, viewer, api, onChanged, onExperts, onClose }) {
  const dlg = useDialogFocus();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const invite = `السلام عليكم،\nيسعدنا اطلاعك على «الكتاب الأم» لبرنامج القادة ومراجعته. ادخل بوابة الخبراء ببريدك المسجل لدينا:\n${share.portal_url}\nوستجد في لوحتك بطاقة «الكتاب الأم»: اقرأ الأطر الثلاثة بمستوياتها، وعلّق على أي قسم أو جملة، ويظهر تعليقك باسمك.`;
  const copy = async (text, done) => { try { await navigator.clipboard.writeText(text); setMsg({ ok: true, t: done }); } catch { setMsg({ ok: false, t: 'تعذّر النسخ، انسخ النص يدويًا' }); } };
  const toggle = async (x, c, on) => {
    setBusy(`${x.id}|${c}`); setMsg(null);
    const r = await api.reader(x.id, c, on);
    setBusy('');
    if (!r?.success) { setMsg({ ok: false, t: r?.message || 'تعذّر الحفظ' }); return; }
    setMsg({ ok: true, t: on ? `أُضيف ${x.name} إلى ${COMM.find(([k]) => k === c)[1]}، ويرى الكتاب عند دخوله البوابة` : `أُزيل ${x.name} من ${COMM.find(([k]) => k === c)[1]}` });
    onChanged();
  };
  const needle = q.trim();
  const cands = share.candidates.filter((x) => !needle || `${x.name} ${x.title}`.includes(needle));
  return (
    <div className="mb-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={dlg} tabIndex={-1} className="mb-sheet tall" role="dialog" aria-modal="true" aria-label="مشاركة الكتاب الأم مع الخبراء">
        <span className="mb-grip" aria-hidden="true" />
        <header className="mb-sheet-h"><div><small>الكتاب الأم</small><b>المشاركة مع الخبراء</b></div><button type="button" className="mb-x" onClick={onClose} aria-label="إغلاق">×</button></header>
        <div className="mb-sheet-body">
          <ol className="mb-howto">
            <li><b>اجعله عضوًا في لجنة</b><span>يقرأ الكتاب ويعلّق عليه عضو فاعل في لجنة المحتوى أو لجنة القياس. أضفه من القائمة أدناه بنقرة.</span></li>
            <li><b>أرسل له رابط البوابة</b><span>يدخل بوابة الخبراء ببريده المسجل لدينا، برمز يصله على البريد.</span></li>
            <li><b>يجد «الكتاب الأم» في لوحته</b><span>يقرأ الأطر الثلاثة، ويعلّق باسمه وصفته، وترى تعليقه هنا.</span></li>
          </ol>
          <div className="mb-link-box">
            <code dir="ltr">{share.portal_url}</code>
            <div className="mb-row"><button type="button" className="mb-btn" onClick={() => copy(share.portal_url, 'نُسخ رابط البوابة')}>انسخ الرابط</button><button type="button" className="mb-btn" onClick={() => copy(invite, 'نُسخ نص الدعوة، ألصقه في البريد أو الواتساب')}>انسخ نص دعوة جاهز</button></div>
          </div>
          {msg && <p className={msg.ok ? 'mb-ok' : 'mb-err'} role="status">{msg.t}</p>}
          <h3 className="mb-h">يقرؤه الآن <small>{share.readers.length}</small></h3>
          {!share.readers.length && <p className="mb-empty">لا أحد بعد. أضف أول قارئ من القائمة أدناه.</p>}
          <ul className="mb-people">{share.readers.map((x) => (
            <li key={x.id}><span className="mb-av expert" aria-hidden="true">{initials(x.name)}</span>
              <span className="mb-pp"><b>{x.name}</b><small>{x.title || ' '}</small></span>
              <span className="mb-pp-acts">{COMM.map(([c, l]) => x.committees.includes(c) && (
                <button key={c} type="button" className="mb-tag on" disabled={!viewer.write || !!busy} onClick={() => toggle(x, c, false)} title={`أزل من ${l}`}>{l} ×</button>))}</span></li>
          ))}</ul>
          {share.blocked.length > 0 && <p className="mb-note">{share.blocked.map((x) => x.name).join('، ')}: {share.blocked.length === 1 ? 'عضو' : 'أعضاء'} في لجنة وملفه غير فعّال، فلا يرى الكتاب حتى يُفعَّل من قسم الخبراء.</p>}
          {(share.applicants || []).length > 0 && <p className="mb-note">{share.applicants.map((x) => x.name).join('، ')}: {share.applicants.length === 1 ? 'طلب عضوية لم يُراجع بعد' : 'طلبات عضوية لم تُراجع بعد'}، ولا يُفتح الكتاب قبل اعتماده من قسم الخبراء.</p>}
          <h3 className="mb-h">أضف عضوًا <small>{share.candidates.length} خبيرًا فاعلًا خارج الرحلة</small></h3>
          {share.candidates.length > 6 && <input className="mb-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الخبير" aria-label="بحث في الخبراء" />}
          {!share.candidates.length && <p className="mb-empty">لا خبير فاعل خارج الرحلة ينتظر الإضافة. خبراء الرحلة لا يُعرضون هنا، وعضوية اللجنة لأحدهم تُضبط من ملفه في قسم الخبراء.</p>}
          <ul className="mb-people">{cands.slice(0, 60).map((x) => (
            <li key={x.id}><span className="mb-av expert" aria-hidden="true">{initials(x.name)}</span>
              <span className="mb-pp"><b>{x.name}</b><small>{x.title || ' '}</small></span>
              <span className="mb-pp-acts">{COMM.map(([c, l]) => (
                <button key={c} type="button" className="mb-tag" disabled={!viewer.write || !!busy} onClick={() => toggle(x, c, true)}>{busy === `${x.id}|${c}` ? '…' : `+ ${l}`}</button>))}</span></li>
          ))}</ul>
          <p className="mb-muted mb-foot">خبير غير مسجل بعد؟ {onExperts ? <button type="button" className="mb-link" onClick={onExperts}>ادعُه من قسم الخبراء</button> : 'ادعُه من قسم الخبراء'}، ثم أضفه هنا بعد تفعيل ملفه.{!viewer.write && ' الإضافة تحتاج صلاحية الكتابة ودخولًا بمفتاح المرور أو تطبيق المصادقة.'}</p>
        </div>
      </aside>
    </div>
  );
}

// ── ما يعتمد على هذا (للإدارة، المرحلة 3): حجم أي تعديل قبل طلبه ──
function DepsSheet({ target, chapter, data, onClose }) {
  const dlg = useDialogFocus();
  const d = chapterDeps({ chapter, section: target.section, deps: data.deps, counts: data.counts });
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const row = (label, n, body = null, warn = false) => (
    <section className={`mb-dep${warn ? ' warn' : ''}${n ? '' : ' none'}`}>
      <header><b>{label}</b><span className="mb-dep-n">{n || '·'}</span></header>
      {n > 0 && body}
    </section>
  );
  const whole = !target.section;
  return (
    <div className="mb-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={dlg} tabIndex={-1} className="mb-sheet tall" role="dialog" aria-modal="true" aria-label="ما يعتمد على هذا">
        <span className="mb-grip" aria-hidden="true" />
        <header className="mb-sheet-h"><div><small>{chapter.title}</small><b>{whole ? 'ما يعتمد على هذا الباب' : `ما يعتمد على قسم «${target.section}»`}</b></div><button type="button" className="mb-x" onClick={onClose} aria-label="إغلاق">×</button></header>
        <div className="mb-sheet-body">
          <p className="mb-dep-lead">{d.total ? `تعديل ${whole ? 'هذا الباب' : 'هذا القسم'} يمس ${d.total} من عناصر المنصة. راجعها قبل طلب التعديل، فما يتغير هنا يتغير هناك.` : `لا شيء في المنصة يعتمد على ${whole ? 'هذا الباب' : 'هذا القسم'} مباشرة، فتعديله لا يمس غيره.`}</p>
          {whole && row('اختبار الباب', d.quiz.completed, <p>{d.quiz.completed} مشارك أكملوا الباب، فاختباره مقفل: لا يتغير إلا في إصدار جديد، ويبقى من أجاب على نسخته.</p>, true)}
          {whole && row('فقرات القياس المربوطة بالباب', d.questions.total, <>
            <ul className="mb-dep-list">{Object.entries(d.questions.byInstrument).map(([k, n]) => <li key={k}>{k}: {n}</li>)}</ul>
            {d.questions.competencies.length > 0 && <p className="mb-dep-tags">{d.questions.competencies.slice(0, 18).map((c) => <span key={c} className="mb-tag">{c}</span>)}</p>}
          </>)}
          {whole && row('أدوات المختبر', d.labs.length, <ul className="mb-dep-list">{d.labs.map((l) => <li key={l.key}>{l.title}{l.min_level && l.min_level !== 'beginner' ? ` · من ${LEVEL_AR[l.min_level]}` : ''}</li>)}</ul>)}
          {whole && row('المسارات التي تعد المشارك به', d.tracks.length, <ul className="mb-dep-list">{d.tracks.map((t) => <li key={t.key}>{t.title} <small>({t.level})</small></li>)}</ul>)}
          {row('إحالات وثيقة المبادرة', d.refs.length, <ul className="mb-dep-list">{d.refs.map((r) => <li key={r.chapter + r.section_id}>فصل «{r.chapter}» يحيل إلى «{r.section}» <small dir="ltr">{r.section_id}</small></li>)}</ul>)}
          {row('تعليقات الخبراء المفتوحة', d.comments, <p>تُحسم أو يُرد عليها قبل التعديل، فتعليق على نص تغيّر يُعلَّم «كُتب على نص تغيّر بعده».</p>)}
          {!d.live && <p className="mb-note">تعذّرت قراءة أجزاء القاعدة الآن (القياس والمختبر والاختبار). المعروض من المستودع وحده.</p>}
        </div>
      </aside>
    </div>
  );
}

// ── كل التعليقات: تصفية بالحالة والإطار والمعلّق، والنقر يفتح موضعها ──
function AllComments({ data, onGo, onClose }) {
  const dlg = useDialogFocus();
  const [st, setSt] = useState('open');
  const [dim, setDim] = useState('');
  const [who, setWho] = useState('');
  const [seat, setSeat] = useState('');
  const chap = Object.fromEntries(data.chapters.map((c) => [c.id, c]));
  const authors = [...new Map(data.comments.filter((c) => !c.deleted).map((c) => [c.author_ref, c.author_name])).entries()];
  const list = data.comments.filter((c) => (!st || c.status === st) && (!dim || chap[c.module_id]?.dimension === dim) && (!who || c.author_ref === who)
    // «من أصحاب الإطار»: تعليق خبير في مقعده أو نطاقه، و«من خارج الإطار»: الموسوم. تعليق الإدارة لا هذا ولا ذاك
    && (!seat || (seat === 'out' ? c.out_of_seat : c.author_kind === 'expert' && !c.out_of_seat)));
  return (
    <div className="mb-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={dlg} tabIndex={-1} className="mb-sheet tall" role="dialog" aria-modal="true" aria-label="كل التعليقات">
        <span className="mb-grip" aria-hidden="true" />
        <header className="mb-sheet-h"><div><small>الكتاب الأم</small><b>كل التعليقات</b></div><button type="button" className="mb-x" onClick={onClose} aria-label="إغلاق">×</button></header>
        <div className="mb-filters">
          <select value={st} onChange={(e) => setSt(e.target.value)} aria-label="الحالة"><option value="open">المفتوحة</option><option value="resolved">المحسومة</option><option value="">الكل</option></select>
          <select value={dim} onChange={(e) => setDim(e.target.value)} aria-label="الإطار"><option value="">الأطر الثلاثة</option>{PARTS.map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}</select>
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="المعلّق"><option value="">كل المعلّقين</option>{authors.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <select value={seat} onChange={(e) => setSeat(e.target.value)} aria-label="صلة المعلّق بالإطار"><option value="">الكل</option><option value="in">من أصحاب الإطار</option><option value="out">من خارج الإطار</option></select>
        </div>
        <div className="mb-sheet-body">
          {!list.length && <p className="mb-empty">لا تعليقات بهذه التصفية.</p>}
          {list.map((c) => (
            <button key={c.id} type="button" className="mb-cm-link" onClick={() => onGo(c)}>
              <Avatar c={c} />
              <span><small>{PARTS.find((p) => p.key === chap[c.module_id]?.dimension)?.short} · {chap[c.module_id]?.title}{c.section ? ` · ${c.section}` : ''}</small>
                <b>{c.author_name} <i>{c.author_role}</i>{c.out_of_seat && !c.deleted ? <> <OutSeat /></> : null}</b>
                <em>{c.deleted ? 'تعليق محذوف' : c.body}</em>
                <small>{ago(c.created_at)}{c.replies?.length ? ` · ${c.replies.length} رد` : ''}{c.status === 'resolved' ? ' · محسوم' : ''}</small></span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

// ── الفهرس: الأجزاء ثم الأبواب ثم أقسامها، بعدد التعليقات المفتوحة، وبحث في العناوين والمتن ──
// only: مفتاح الجزء في وضع «الجزء وحده»، فلا يعرض الفهرس ولا البحث إلا أبوابه
// البحث بالتطبيع (reader.js): لا تفرق الحركات ولا صور الألف ولا التاء المربوطة، وكل نتيجة بمقتطف حول ما طابق.
// والعلامات أعلى الفهرس حين لا بحث
function Toc({ data, level, current, only = null, marks = [], onGo, onUnmark, onClose }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(current?.id || null);
  const searching = normalizeAr(q).length >= 2;
  const pool = only ? data.chapters.filter((c) => c.dimension === only) : data.chapters;
  const hits = searching ? searchBook(pool, q, sectionsOf) : [];
  const shown = only ? marks.filter((m) => m.chapter.dimension === only) : marks;
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="mb-sheet-wrap side" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <nav className="mb-toc" aria-label="فهرس الكتاب الأم">
        <header className="mb-sheet-h"><div><small>{only ? PARTS.find((p) => p.key === only)?.label : 'الكتاب الأم'}</small><b>{only ? 'فهرس الجزء' : 'الفهرس'}</b></div><button type="button" className="mb-x" onClick={onClose} aria-label="إغلاق">×</button></header>
        <input className="mb-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={only ? 'ابحث في عناوين الجزء ومتنه' : 'ابحث في عناوين الكتاب ومتنه'} aria-label="بحث في الكتاب" />
        {searching ? (
          <div className="mb-toc-body" role="region" aria-label="نتائج البحث" aria-live="polite">
            {!hits.length && <p className="mb-empty">لا نتائج.</p>}
            {hits.map(({ c, s, snip }, i) => (
              <button key={i} type="button" className="mb-hit" onClick={() => onGo(c, s.key)}>
                <small>{PARTS.find((p) => p.key === c.dimension)?.short} · {c.title}</small><b>{s.key || 'مدخل الباب'}</b>
                {snip && <em>{snip.before}<mark>{snip.match}</mark>{snip.after}</em>}
              </button>
            ))}
          </div>
        ) : (
          <div className="mb-toc-body">
            {shown.length > 0 && (
              <section className="mb-marks" aria-label="علاماتك">
                <h3>علاماتك</h3>
                <ul>{shown.map((m) => (
                  <li key={`${m.id}|${m.section}`}>
                    <button type="button" onClick={() => onGo(m.chapter, m.section || null)}><small>{PARTS.find((p) => p.key === m.chapter.dimension)?.short} · {m.chapter.title}</small><b>{m.section || 'مدخل الباب'}</b></button>
                    <button type="button" className="mb-x" aria-label={`أزل العلامة: ${m.section || m.chapter.title}`} onClick={() => onUnmark(m)}>×</button>
                  </li>
                ))}</ul>
              </section>
            )}
            {PARTS.filter((p) => !only || p.key === only).map((p) => {
              const chs = data.chapters.filter((c) => c.dimension === p.key);
              if (!chs.length) return null;
              return (
                <section key={p.key} className="mb-toc-part">
                  <h3><span>{p.roman}</span>{p.title}</h3>
                  <ol>
                    {chs.map((c, i) => {
                      const n = data.counts.byModule[c.id] || 0;
                      const vis = chapterVisible(c, level);
                      const secs = bookSections(c.md).filter((s) => s.title);
                      return (
                        <li key={c.id} className={`${current?.id === c.id ? 'on' : ''}${vis ? '' : ' dim'}`}>
                          <div className="mb-toc-ch">
                            <button type="button" onClick={() => onGo(c)}><span>{two(i + 1)}</span>{c.title}</button>
                            {n > 0 && <i className="mb-count" title={`${n} تعليق مفتوح`}>{n}</i>}
                            {secs.length > 0 && <button type="button" className="mb-more" aria-expanded={open === c.id} aria-label="أقسام الباب" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? '−' : '+'}</button>}
                          </div>
                          {open === c.id && <ul>{secs.map((s) => { const k = data.counts.bySection[`${c.id}|${s.key}`] || 0; return <li key={s.key}><button type="button" onClick={() => onGo(c, s.key)}>{s.key}</button>{k > 0 && <i className="mb-count">{k}</i>}</li>; })}</ul>}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>
        )}
      </nav>
    </div>
  );
}

// ── اختبار الباب كما يراجعه الخبير: الإجابة الصحيحة وسببها ظاهران ──
function QuizReview({ md }) {
  const qs = useMemo(() => parseQuiz(md), [md]);
  if (!qs.length) return null;
  return (
    <details className="mb-quiz">
      <summary>اختبار الباب للمراجعة <small>{qs.length} أسئلة، والإجابة الصحيحة ظاهرة</small></summary>
      <ol>{qs.map((q, i) => (
        <li key={i}><p>{q.q}</p>
          <ul>{q.options.map((o, k) => <li key={k} className={k === q.answer ? 'right' : ''}>{o}</li>)}</ul>
          {q.why && <p className="mb-why">لماذا: {q.why}</p>}
        </li>
      ))}</ol>
    </details>
  );
}

// ── صفحة الباب ──
function Chapter({ ch, idx, partIdx, level, data, scope, marks = [], onMark, onThread, onDeps, onProposals, onCopyLink, flip }) {
  const sections = useMemo(() => bookSections(ch.md), [ch.md]);
  const img = chapterImage(ch.id);
  const part = PARTS.find((p) => p.key === ch.dimension);
  const visible = chapterVisible(ch, level);
  const n = data.counts.byModule[ch.id] || 0;
  return (
    <article className={`mb-page${flip ? ` turn-${flip}` : ''}`}>
      <header className="mb-ch-open" style={{ '--chimg': `url('${img || partImage(ch.dimension)}')` }}>
        <div className="mb-ch-band" aria-hidden="true" />
        <div className="mb-ch-in">
          <span className="mb-ch-num">{two(partIdx + 1)}</span>
          <div>
            <small>{part?.label}</small>
            <h1>{ch.title}</h1>
            <p className="mb-ch-meta">
              {ch.draft ? <span className="mb-chip draft">مسودة · {ch.status}</span>
                : <span className="mb-chip lvl">{ch.min_level === 'beginner' ? 'لكل المستويات' : `من المستوى ${LEVEL_AR[ch.min_level]}`}</span>}
              <span className="mb-chip">{sections.filter((s) => s.title).length} أقسام</span>
              {n > 0 && <span className="mb-chip open">{n} تعليق مفتوح</span>}
              {onCopyLink && <button type="button" className="mb-chip link" onClick={onCopyLink}>انسخ رابط الباب</button>}
              {data.deps !== undefined && data.viewer.kind === 'admin' && !ch.draft && (() => { const t = chapterDeps({ chapter: ch, deps: data.deps, counts: data.counts }).total; return <button type="button" className="mb-chip deps" onClick={() => onDeps({ section: null })}>ما يعتمد على هذا الباب{t ? ` (${t})` : ''}</button>; })()}
            </p>
          </div>
        </div>
      </header>
      {ch.draft && <p className="mb-note draft">مسودة معروضة على لجنة المحتوى، وليست جزءًا من الكتاب الذي يقرؤه المشاركون. علّق على أي قسم أو جملة، ويظهر تعليقك باسمك.</p>}
      {!visible && <p className="mb-note">هذا الباب لا يظهر لمستوى «{LEVEL_AR[level]}»: يبدأ من {LEVEL_AR[ch.min_level]}. يُعرض هنا للمراجعة.</p>}
      {sections.filter((s) => s.title).length > 1 && (
        <nav className="mb-inside" aria-label="في هذا الباب">
          <b>في هذا الباب</b>
          <ol>{sections.filter((s) => s.title).map((s, k) => <li key={s.key}><a href={`#${anchor(s.key)}`} onClick={(e) => { e.preventDefault(); document.getElementById(anchor(s.key))?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }}><span>{k + 1}</span>{s.key}</a></li>)}</ol>
        </nav>
      )}
      <div className="mb-txt">
        {sections.map((s, si) => {
          const k = data.counts.bySection[`${ch.id}|${s.key}`] || 0;
          const parts = s.parts.filter((p) => tierVisible(p.tier, level));
          if (!parts.length && level !== 'all') return null;
          return (
            <section key={si} id={anchor(s.key)} className="mb-sec" data-section={s.key}>
              {s.title && (
                <div className="mb-sec-tools">
                  {data.viewer.kind === 'admin' && !ch.draft && chapterDeps({ chapter: ch, section: s.key, deps: data.deps, counts: data.counts }).refs.length > 0 && (
                    <button type="button" className="mb-sec-ref" onClick={() => onDeps({ section: s.key })} title="أقسام تحيل إليها وثيقة المبادرة">↳ إحالة</button>
                  )}
                  {!ch.draft && (() => {
                    const all = (data.proposals || []).filter((p) => p.module_id === ch.id && p.section === s.key && ['draft', 'review', 'approved'].includes(p.status));
                    if (!all.length && !data.viewer.propose) return null;
                    const r = data.proposal_counts?.bySection?.[`${ch.id}|${s.key}`] || 0;
                    return (
                      <button type="button" className={`mb-sec-p${all.length ? ' has' : ''}`} onClick={() => onProposals({ section: s.key })} aria-label={`مقترحات تعديل القسم: ${s.key}`}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
                        {all.length ? <b>{r || all.length}</b> : <span>اقترح</span>}
                      </button>
                    );
                  })()}
                  {onMark && (() => {
                    const on = isMarked(marks, { id: ch.id, section: s.key });
                    return <button type="button" className="mb-sec-m" aria-pressed={on} aria-label={on ? `أزل العلامة عن القسم: ${s.key}` : `ضع علامة على القسم: ${s.key}`} onClick={() => onMark({ id: ch.id, section: s.key })}><Ribbon /></button>;
                  })()}
                  <button type="button" className={`mb-sec-c${k ? ' has' : ''}`} onClick={() => onThread({ section: s.key })} aria-label={`تعليقات القسم: ${s.key}`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
                    {k ? <b>{k}</b> : <span>علّق</span>}
                  </button>
                </div>
              )}
              {parts.map((p, pi) => (p.tier
                ? <div key={pi} className="mb-tier"><span className="mb-tier-l">{tierAr(p.tier)}</span><div dangerouslySetInnerHTML={{ __html: mdHtml(p.md) }} /></div>
                : <div key={pi} dangerouslySetInnerHTML={{ __html: mdHtml(p.md) }} />))}
            </section>
          );
        })}
      </div>
      {ch.reflection && <div className="mb-reflect"><small>تأمل</small><p>{ch.reflection}</p>
        {!ch.draft && (data.viewer.propose || (data.proposals || []).some((p) => p.module_id === ch.id && p.section === REFLECTION && ['draft', 'review', 'approved'].includes(p.status)))
          && <button type="button" className="mb-sec-p mb-reflect-p" onClick={() => onProposals({ section: REFLECTION })}>✎ اقترح تعديل السؤال</button>}</div>}
      <QuizReview md={ch.quiz_md} />
      <button type="button" className="mb-btn ghost wide" onClick={() => onThread({ section: '' })}>تعليق على الباب كله{(data.counts.bySection[`${ch.id}|`] || 0) ? ` (${data.counts.bySection[`${ch.id}|`]})` : ''}</button>
      <p className="mb-colophon">{scope === 'part' ? `الباب ${partIdx + 1} من ${data.chapters.filter((c) => c.dimension === ch.dimension).length} في هذا الجزء` : `الباب ${idx + 1} من ${data.chapters.length}`}{ch.updated_at ? ` · آخر تعديل ${dateAr(ch.updated_at)}` : ''}</p>
    </article>
  );
}

// ── اختيار نسخة PDF: الكتاب كاملًا أو جزء واحد كتابًا مكتملًا ببدايته ونهايته ──
function PdfSheet({ parts, data, onPick, onClose }) {
  const dlg = useDialogFocus();
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const n = (key) => data.chapters.filter((c) => !c.draft && (!key || c.dimension === key)).length;
  return (
    <div className="mb-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={dlg} tabIndex={-1} className="mb-sheet" role="dialog" aria-modal="true" aria-label="نسخة PDF">
        <span className="mb-grip" aria-hidden="true" />
        <header className="mb-sheet-h"><div><small>نسخة المراجعة</small><b>نسخة PDF</b></div><button type="button" className="mb-x" onClick={onClose} aria-label="إغلاق">×</button></header>
        <div className="mb-sheet-body">
          <p className="mb-muted">الجزء يأتي كتابًا مكتملًا: غلافه، ثم «عن هذا الجزء»، ثم فهرسه وأبوابه، ثم «يتكامل مع»، ثم الغلاف الخلفي. وكل صفحة تحمل اسمك وبريدك.</p>
          <ul className="mb-pdf">
            <li><button type="button" onClick={() => onPick(null)}><i>◆</i><span><b>الكتاب كاملًا</b><small>الأجزاء الثلاثة · {n(null)} بابًا</small></span></button></li>
            {parts.map((p) => {
              const away = outOfSeat(data.viewer, { dimension: p.key });
              const mine = data.viewer.kind === 'expert' && Array.isArray(data.viewer.seat) && data.viewer.seat.includes(p.key);
              return (
                <li key={p.key}><button type="button" onClick={() => onPick(p.key)}><i>{p.roman}</i><span><b>{p.title}</b><small>{PART[p.key]} · {n(p.key)} أبواب{mine ? ' · مقعدك' : away ? ' · خارج إطارك' : ''}</small></span></button></li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}

// ── «Aa»: خط المتن وحجمه ومسافاته ووضع القراءة. يُطبَّق فورًا ويُحفظ لهذا القارئ وحده ──
function Seg({ label, value, items, onPick, cls = () => '' }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="mb-seg" role="radiogroup" aria-label={label}>
        {items.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={value === k} className={cls(k)} onClick={() => onPick(k)}>{l}</button>)}
      </div>
    </fieldset>
  );
}
function LookSheet({ prefs, onChange, onClose }) {
  const dlg = useDialogFocus();
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="mb-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={dlg} tabIndex={-1} className="mb-sheet" role="dialog" aria-modal="true" aria-label="إعدادات القراءة">
        <span className="mb-grip" aria-hidden="true" />
        <header className="mb-sheet-h"><div><small>يُحفظ لك على هذا الجهاز</small><b>إعدادات القراءة</b></div><button type="button" className="mb-x" onClick={onClose} aria-label="إغلاق">×</button></header>
        <div className="mb-look">
          <Seg label="الخط" value={prefs.font} items={FONTS} onPick={(font) => onChange({ font })} cls={(k) => `f-${k}`} />
          <Seg label="حجم الخط" value={prefs.size} items={SIZES.map((n) => [n, SIZE_AR[n]])} onPick={(size) => onChange({ size })} />
          <Seg label="المسافة بين الأسطر" value={prefs.spacing} items={SPACINGS} onPick={(spacing) => onChange({ spacing })} />
          <Seg label="وضع القراءة" value={prefs.theme} items={THEMES} onPick={(theme) => onChange({ theme })} cls={(k) => `t-${k}`} />
        </div>
      </aside>
    </div>
  );
}

// العلامة المائية بنمط الكتاب الشخصي (leaders-app/src/screens/Handbook.jsx): اسم القارئ وبريده وتاريخ اليوم، مائلة
// متكررة بشفافية خفيفة فوق الصفحة كلها، فأي تصوير يُعرف مصدره. لا تلتقط النقر ولا تُقرأ لقارئ الشاشة
export const WM_TILE = { w: 520, h: 220 };
export const NO_VERSION = 'لم يصدر بعد';
const xmlEsc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export function watermarkUrl(text, date = new Date()) {
  if (!text) return '';
  const stamp = xmlEsc(`${text} · ${date.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}`);
  // المرحلة 20: بلاطة أكبر (520×220) تخفف الكثافة، والشفافية لا تُكتب هنا بل على .mb-wm بمتغير يحدده الإطار
  // (--mb-wm-opacity محصور بين 0.07 و0.09 في master-book.css)، فلا تنزل تحت حد الحماية
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WM_TILE.w}" height="${WM_TILE.h}"><text x="260" y="115" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Tahoma, sans-serif" font-size="15" font-weight="600" fill="#5a6468" transform="rotate(-25.7 260 110)">${stamp}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
// التاريخ يتجدد إن بقي القارئ مفتوحًا بعد منتصف الليل: فحص كل دقيقة، ولا يُعاد الرسم إلا إن تغيّر اليوم
const today = () => new Date().toDateString();
function Watermark({ text }) {
  const [day, setDay] = useState(today);
  useEffect(() => { const t = setInterval(() => setDay(today()), 60000); return () => clearInterval(t); }, []);
  const url = useMemo(() => watermarkUrl(text, new Date(day)), [text, day]);
  return url ? <div className="mb-wm" aria-hidden="true" style={{ backgroundImage: url }} /> : null;
}
/** @param {{ api: { get: () => Promise<any>, add: (b: any) => Promise<any>, del: (id: string) => Promise<any>, status: (id: string, s: string) => Promise<any>, reader?: (id: string, c: string, on: boolean) => Promise<any>, propose?: (b: any) => Promise<any>, move?: (id: string, to: string, note?: string, seen?: string) => Promise<any>, release?: () => Promise<any>, releaseStart?: () => Promise<any>, releasePr?: () => Promise<any>, releasePublish?: (n: number, sha: string) => Promise<any> }, onClose?: () => void, onExperts?: () => void, place?: string, ui?: { Head: any, Menu: any, menuText: string } }} props */
// ui: مكونات اللوحة المشتركة (ScreenHead وMoreMenu وMENU_TEXT) تمررها الإدارة، فلا يستورد القارئ المشترك شيفرة اللوحة
export default function MasterBook({ api, onClose, onExperts, place = 'admin', ui = null }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState('shelf');
  const [idx, setIdx] = useState(0);
  // التفضيلات والموضع والعلامات لكل قارئ بمفتاحه (reader.js)، فتُقرأ بعد أن يعرّف الخادم القارئ
  const [prefs, setPrefs] = useState(null);
  const [look, setLook] = useState(false);
  const [pdfMenu, setPdfMenu] = useState(false);
  const [toc, setToc] = useState(false);
  const [all, setAll] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [depsOf, setDepsOf] = useState(null);
  const [propsOf, setPropsOf] = useState(null);
  const [editing, setEditing] = useState(null);
  const [releasing, setReleasing] = useState(false);
  const [thread, setThread] = useState(null);
  const [opening, setOpening] = useState(false);
  const [flip, setFlip] = useState(null);
  const [sel, setSel] = useState(null);
  // رابط الباب (reader.js): الباب الذي فتحه الرابط عند التحميل، وتنبيه رابط لا يُتاح لهذا القارئ، وسطر النسخ
  const firstRef = useRef(typeof window !== 'undefined' ? hashRef(window.location.hash) : null);
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState(null);
  const selGone = useRef(null);
  const [progress, setProgress] = useState(0);
  const reader = useRef(null);
  const root = useRef(null);
  const touch = useRef(null);
  // القارئ طبقة كاملة فوق التطبيق بتمرير خاص بها، فلا تتحرك الصفحة خلفها
  useEffect(() => { const b = document.body; const was = b.style.overflow; b.style.overflow = 'hidden'; return () => { b.style.overflow = was; }; }, []);

  const load = useCallback(() => api.get().then(setData), [api]);
  useEffect(() => { load(); }, [load]);
  const key = data?.success ? readerKey(data.viewer) : null;
  useEffect(() => { if (!key) return; store.del(LEGACY_KEY); setPrefs(cleanPrefs(store.get(key))); }, [key]);
  useEffect(() => { if (key && prefs) store.set(key, prefs); }, [key, prefs]);
  const patch = useCallback((o) => setPrefs((p) => ({ ...(p || cleanPrefs(null)), ...o })), []);
  const level = prefs?.level || 'all';
  const scope = prefs?.scope || 'book';
  const setLevel = (v) => patch({ level: v });
  const setScope = (v) => patch({ scope: v });

  const ch = data?.chapters?.[idx];
  const partIdx = ch ? data.chapters.filter((c) => c.dimension === ch.dimension).findIndex((c) => c.id === ch.id) : 0;

  // تقدم القراءة في الباب، وتحديد نص للتعليق عليه
  useEffect(() => {
    if (view !== 'read') return undefined;
    const sc = root.current;
    const id = data?.chapters?.[idx]?.id;
    // الاستئناف داخل الباب: القسم الذي بلغه القارئ يُحفظ بعد توقف التمرير، فيعود إليه «تابع القراءة»
    let still = null;
    const spot = () => {
      if (!sc || !id) return;
      // آخر قسم بلغ رأس الشاشة، وفي آخر الباب (لا تمرير بعده) آخر قسم بلغ منتصفها
      const end = sc.scrollTop >= sc.scrollHeight - sc.clientHeight - 2;
      const line = end ? sc.clientHeight * 0.6 : 150;
      let section = '';
      for (const el of sc.querySelectorAll('.mb-sec[data-section]')) { if (el.getBoundingClientRect().top <= line) section = el.dataset.section || ''; else break; }
      setPrefs((p) => (p && (p.pos?.id !== id || p.pos.section !== section) ? { ...p, pos: { id, section } } : p));
    };
    const onScroll = (e) => {
      if (!sc) return;
      const total = sc.scrollHeight - sc.clientHeight;
      setProgress(total > 0 ? Math.min(1, Math.max(0, sc.scrollTop / total)) : 1);
      if (e) { clearTimeout(still); still = setTimeout(spot, 350); }
    };
    const onSel = () => {
      const s = getSelection?.();
      const t = s && !s.isCollapsed ? s.toString().replace(/\s+/g, ' ').trim() : '';
      const node = s?.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
      const sec = node?.closest?.('.mb-sec');
      // على الهاتف تلغي لمسة الزر التحديد قبل أن تصله، فيبقى الزر لحظة بعد زوال التحديد
      clearTimeout(selGone.current);
      if (t.length >= 3 && sec) setSel({ quote: t.slice(0, QUOTE_MAX), section: sec.dataset.section || '' });
      else selGone.current = setTimeout(() => setSel(null), 1500);
    };
    sc?.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('selectionchange', onSel);
    onScroll();
    return () => { clearTimeout(still); sc?.removeEventListener('scroll', onScroll); document.removeEventListener('selectionchange', onSel); };
  }, [view, idx, data]);

  // الرابط في العنوان: كل باب يُفتح يُكتب في سجل المتصفح فيعمل الرجوع والتقدم، والرف بلا باب. replace لا يضيف خطوة
  const linkTo = useCallback((ref, replace = false) => {
    if (typeof window === 'undefined') return;
    const next = hashWithRef(window.location.hash, ref);
    if (next === (window.location.hash || '')) return;
    const url = `${window.location.pathname}${window.location.search}${next}`;
    if (replace) window.history.replaceState(window.history.state, '', url);
    else window.history.pushState(window.history.state, '', url);
  }, []);
  const go = useCallback((to, section = null, dir = null, record = true) => {
    if (!data) return;
    const n = Math.max(0, Math.min(data.chapters.length - 1, to));
    setFlip(dir && !reduced() ? dir : null);
    setIdx(n);
    patch({ pos: { id: data.chapters[n].id, section: section || '' } });
    setView('read');
    setMissing(false);
    if (record) linkTo(chapterRef(data.chapters[n]));
    setToc(false); setAll(false);
    requestAnimationFrame(() => {
      if (section) document.getElementById(anchor(section))?.scrollIntoView({ block: 'start' });
      else root.current?.scrollTo({ top: 0 });
    });
  }, [data, patch, linkTo]);
  const toShelf = () => { setView('shelf'); linkTo(null); };
  // فتح الرابط عند التحميل بعد أن يعرّف الخادم القارئ وأبوابه: الباب إن كان بين ما أُتيح له، وإلا الرف بتنبيه
  const linked = useRef(false);
  useEffect(() => {
    if (!data?.success || !prefs || linked.current) return;
    linked.current = true;
    const ref = firstRef.current;
    if (!ref) return;
    const at = refIndex(data.chapters, ref);
    // تحديث الصفحة على الباب نفسه يعود إلى القسم الذي بلغه القارئ فيه، كما يعود إليه «تابع القراءة»
    if (at >= 0) go(at, prefs.pos?.id === data.chapters[at].id ? prefs.pos.section || null : null, null, false);
    else { setMissing(true); linkTo(null, true); }
  }, [data, prefs, go, linkTo]);
  // الرجوع والتقدم في المتصفح بين الأبواب والرف
  useEffect(() => {
    if (!data?.success) return undefined;
    const on = () => {
      const ref = hashRef(window.location.hash);
      if (!ref) { setView('shelf'); return; }
      const at = refIndex(data.chapters, ref);
      if (at >= 0) go(at, null, null, false);
      else { setView('shelf'); setMissing(true); }
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, [data, go]);
  // إغلاق القارئ يزيل الباب من العنوان، فلا يفتحه التحديث بعد الخروج
  useEffect(() => () => { if (typeof window !== 'undefined' && hashRef(window.location.hash)) linkTo(null, true); }, [linkTo]);
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${hashWithRef(window.location.hash, chapterRef(ch))}`;
    try { await navigator.clipboard.writeText(url); setCopied({ text: 'نُسخ رابط الباب. يفتحه من له وصول إلى الكتاب وحده.' }); }
    catch { setCopied({ text: 'انسخ الرابط:', url }); }
  };
  useEffect(() => { if (!copied) return undefined; const t = setTimeout(() => setCopied(null), 5000); return () => clearTimeout(t); }, [copied]);
  const goChapter = (c, section) => go(data.chapters.findIndex((x) => x.id === c.id), section);
  // في وضع الجزء يقف التقليب عند حدود الجزء الحالي، وفي وضع الكتاب يعبر الأجزاء كما كان
  const scoped = data && ch ? (scope === 'part' ? data.chapters.map((c, i) => [c, i]).filter(([c]) => c.dimension === ch.dimension).map(([, i]) => i) : data.chapters.map((_, i) => i)) : [];
  const at = scoped.indexOf(idx);
  const prevIdx = at > 0 ? scoped[at - 1] : null;
  const nextIdx = at >= 0 && at < scoped.length - 1 ? scoped[at + 1] : null;
  const step = (d) => { const to = d > 0 ? nextIdx : prevIdx; if (to !== null) go(to, null, d > 0 ? 'next' : 'prev'); };

  // السحب أفقيًا على الهاتف يقلب الباب (يمينًا للسابق ويسارًا للتالي، كتقليب كتاب عربي)
  // لمسة داخل جدول عريض أو شريط يتمرر أفقيًا لا تقلب الباب
  const onTouchStart = (e) => { if (inHScroll(e.target, reader.current)) { touch.current = null; return; } const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY, at: Date.now() }; };
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null;
    if (!s || getSelection?.()?.toString()) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2 && Date.now() - s.at < 600) step(dx < 0 ? 1 : -1);
  };

  // «تابع القراءة» تعود إلى الباب والقسم المحفوظين، والباب الأول كغيره؛ ومن لم يفتح بابًا بعد يبدأ من الأول
  const resume = () => { const at = resumeAt(data.chapters, prefs?.pos); if (at >= 0) go(at, prefs.pos.section || null); else go(0); };
  const open = () => { if (reduced()) { resume(); return; } setOpening(true); setTimeout(() => { setOpening(false); resume(); }, 900); };

  // part: مفتاح الجزء لطبعة الجزء، أو null للكتاب كاملًا. النافذة تُفتح في النقرة نفسها فلا يحجبها المتصفح
  const exportPdf = (part = null) => {
    setPdfMenu(false);
    const win = window.open('', '_blank');
    if (!win || !data) return;
    const now = new Date().toISOString();
    writeBook(win, {
      ref: `MB-${(data.version || 'v').replace(/\W/g, '')}-${now.slice(0, 10).replace(/-/g, '')}${part ? `-${ROMAN[part]}` : ''}`, issued_at: now, name: data.viewer.name, email: data.viewer.email || data.viewer.role,
      code: `MASTER ${data.version || ''}`.trim(), edition: 'نسخة المراجعة',
      chapters: data.chapters.filter((c) => !c.draft && (!part || c.dimension === part)).map((c) => ({ id: c.id, dimension: c.dimension, title: c.title, md: markTiers(c.md), reflection: c.reflection })), tools: [],
    }, PARTS.filter((p) => p.key !== 'draft'), part ? { part } : {});
  };

  const threadList = thread && ch ? data.comments.filter((c) => c.module_id === ch.id && (c.section || '') === (thread.section || '')) : [];

  if (!data) return <div className="mb-root" ref={root}><div className="mb-loading"><span className="mb-spin" aria-hidden="true" /><p>يُفتح الكتاب الأم…</p></div></div>;
  if (!data.success) return <div className="mb-root" ref={root}><div className="mb-loading"><p className="mb-err" role="alert">{data.message || 'تعذّر فتح الكتاب'}</p>{onClose && <button type="button" className="mb-btn" onClick={onClose}>رجوع</button>}</div></div>;

  if (!prefs) return <div className="mb-root" ref={root}><div className="mb-loading"><span className="mb-spin" aria-hidden="true" /><p>يُفتح الكتاب الأم…</p></div></div>;
  const total = data.counts.total;
  const marks = liveMarks(prefs.marks, data.chapters, sectionKeys);
  const onMark = (spot) => patch({ marks: toggleMark(prefs.marks, spot) });
  const lastAt = resumeAt(data.chapters, prefs.pos);
  const review = data.proposal_counts?.review || 0;
  const showProposals = data.proposals_ready && (data.viewer.propose || (data.proposals || []).length > 0);
  // رف الخبير: أجزاء مقعده أولًا ثم الأجزاء الأخرى، والمسودات آخرًا. الإدارة ومن نطاقه الكتاب كله بالترتيب الثابت
  const seatInfo = data.viewer.kind === 'expert' ? seatLine(data.viewer.seat) : null;
  // اختيار نسخة PDF: الكتاب كاملًا ثم الأجزاء الثلاثة، وجزء مقعد العضو أولها
  const pdfParts = PARTS.filter((p) => p.key !== 'draft' && data.chapters.some((c) => c.dimension === p.key)).sort((a, b) => outOfSeat(data.viewer, { dimension: a.key }) - outOfSeat(data.viewer, { dimension: b.key }));
  const shelfParts = [...PARTS].sort((a, b) => (a.key === 'draft') - (b.key === 'draft') || outOfSeat(data.viewer, { dimension: a.key }) - outOfSeat(data.viewer, { dimension: b.key }));
  // المرحلة 20: في اللوحة ترويسة مضغوطة على سطح فاتح، وفعل أساسي واحد بحسب الدور والبقية في «إجراءات ▾».
  // كل فعل يُبنى بشرط صلاحيته (viewer.decide وapi.release وapi.reader) لا بالإخفاء في CSS. البوابة كما هي
  const compact = place === 'admin' && !!ui;
  const readAct = { label: canResume(data.chapters, prefs.pos) ? 'تابع القراءة' : 'افتح الكتاب', run: compact ? resume : open }; // بلا كتاب مجسم في الترويسة المضغوطة فلا حركة فتح
  const propsAct = showProposals && { label: `المقترحات${review ? ` (${review})` : ''}`, run: () => setPropsOf({}) };
  const acts = [
    readAct,
    propsAct,
    { label: `التعليقات${total ? ` (${total})` : ''}`, run: () => setAll(true) },
    { label: 'الفهرس', run: () => setToc(true) },
    data.viewer.decide && api.release && data.proposals_ready && { label: `أصدر الكتاب${data.proposal_counts?.approved ? ` (${data.proposal_counts.approved} معتمد)` : ''}`, run: () => setReleasing(true) },
    { label: 'نسخة PDF', title: 'يفتح اختيار الجزء', run: () => setPdfMenu(true) },
    data.share && api.reader && { label: `شارك مع الخبراء${data.share.readers.length ? ` (${data.share.readers.length})` : ''}`, run: () => setSharing(true) },
  ].filter(Boolean);
  // من يحسم المقترحات وأمامه مقترح للمراجعة: فعله الأول المقترحات، وغيره القراءة
  const primaryAct = data.viewer.decide && review > 0 && propsAct ? propsAct : readAct;
  const restActs = acts.filter((a) => a !== primaryAct);
  return (
    <div className={`mb-root place-${place}${view === 'read' ? ` theme-${prefs.theme}` : ''}`} ref={root}>
      <Watermark text={data.viewer.watermark} />
      <style>{COVER_CSS}</style>
      {view === 'shelf' ? (
        <div className={`mb-shelf${compact ? ' compact' : ''}`}>
          {compact ? (
            <ui.Head title="الكتاب الأم"
              desc="المرجع الواحد لبرنامج القادة: الأطر الثلاثة كاملة بكل مستوياتها، ومنه تُشتق نسخة كل مشارك بحسب مستواه ونطاق عمله."
              actions={<>
                <button type="button" className="mb-btn gold" onClick={primaryAct.run}>{primaryAct.label}</button>
                <ui.Menu text={ui.menuText} label="الكتاب الأم" items={restActs} />
              </>}
              status={<p className="mb-status">
                <span>الإصدار: <b>{data.version || NO_VERSION}</b></span>
                <span>{data.chapters.filter((c) => !c.draft).length} باب</span>
                <span>{total ? `${total} تعليق مفتوح` : 'لا تعليقات مفتوحة'}</span>
                <span>تقرأ بصفتك: <b>{data.viewer.name}</b>{data.viewer.role ? ` (${data.viewer.role})` : ''}</span>
                {lastAt >= 0 && <span>توقفت عند <b>{data.chapters[lastAt].title}</b>{prefs.pos.section ? `، ${prefs.pos.section}` : ''}</span>}
              </p>} />
          ) : (<>
          <header className="mb-top dark">
            {onClose ? <button type="button" className="mb-ic" onClick={onClose} aria-label="رجوع">→</button> : <span />}
            <span className="mb-brand">الكتاب الأم</span>
            <button type="button" className="mb-ic" onClick={() => setToc(true)} aria-label="الفهرس">☰</button>
          </header>
          <section className="mb-hero">
            <Book3D version={data.version} onOpen={open} opening={opening} />
            <div className="mb-hero-t">
              <p className="mb-eyebrow">The Master Book</p>
              <h1>الكتاب الأم</h1>
              <p className="mb-lede">المرجع الواحد لبرنامج القادة: الأطر الثلاثة كاملة بكل مستوياتها، ومنه تُشتق نسخة كل مشارك بحسب مستواه ونطاق عمله.</p>
              <dl className="mb-facts">
                <div><dt>الإصدار</dt><dd className={data.version ? undefined : 'mb-none'}>{data.version || NO_VERSION}</dd></div>
                <div><dt>الأبواب</dt><dd>{data.chapters.filter((c) => !c.draft).length}</dd></div>
                <div><dt>تعليقات مفتوحة</dt><dd>{total}</dd></div>
              </dl>
              <div className="mb-actions">
                <button type="button" className="mb-btn gold" onClick={open}>{canResume(data.chapters, prefs.pos) ? 'تابع القراءة' : 'افتح الكتاب'}</button>
                <button type="button" className="mb-btn line" onClick={() => setAll(true)}>التعليقات{total ? ` (${total})` : ''}</button>
                {showProposals && <button type="button" className="mb-btn line" onClick={() => setPropsOf({})}>المقترحات{review ? ` (${review})` : ''}</button>}
                {data.viewer.decide && api.release && data.proposals_ready && <button type="button" className="mb-btn line" onClick={() => setReleasing(true)}>أصدر الكتاب{data.proposal_counts?.approved ? ` (${data.proposal_counts.approved} معتمد)` : ''}</button>}
                <button type="button" className="mb-btn line" aria-haspopup="dialog" aria-expanded={pdfMenu} onClick={() => setPdfMenu(true)}>نسخة PDF</button>
                {data.share && api.reader && <button type="button" className="mb-btn line" onClick={() => setSharing(true)}>شارك مع الخبراء{data.share.readers.length ? ` (${data.share.readers.length})` : ''}</button>}
              </div>
              {lastAt >= 0 && <p className="mb-who mb-last">توقفت عند <b>{data.chapters[lastAt].title}</b>{prefs.pos.section ? ` · ${prefs.pos.section}` : ''}</p>}
              <p className="mb-who">تقرأ بصفتك: <b>{data.viewer.name}</b> · {data.viewer.role}</p>
              {seatInfo && <p className="mb-seat">{seatInfo.label}: <b>{seatInfo.text}</b></p>}
            </div>
          </section>
          </>)}
          <section className="mb-vols" aria-label="الأجزاء الثلاثة">
            {shelfParts.map((p) => {
              const chs = data.chapters.filter((c) => c.dimension === p.key);
              const n = chs.reduce((s, c) => s + (data.counts.byModule[c.id] || 0), 0);
              // جزء خارج مقعد عضو المحتوى: يُقرأ كاملًا وعليه علامة خفيفة، فيعرف أن تعليقه فيه يُوسم
              const away = p.key !== 'draft' && outOfSeat(data.viewer, { dimension: p.key });
              return (
                chs.length > 0 && <button key={p.key} type="button" className={`mb-vol${p.key === 'draft' ? ' draft' : ''}${away ? ' away' : ''}`} style={{ '--vimg': `url('${partImage(p.key)}')` }} onClick={() => chs[0] && goChapter(chs[0])}>
                  <span className="mb-vol-img" aria-hidden="true" />
                  {away && <span className="mb-vol-away">خارج إطارك</span>}
                  <span className="mb-vol-in"><i>{p.roman}</i><small>{PART[p.key] || 'للجنة المحتوى'}</small><b>{p.title}</b><em>{p.key === 'draft' ? `${chs.length === 1 ? 'مسودة واحدة' : `${chs.length} مسودات`}` : `${chs.length} أبواب`}{n ? ` · ${n} تعليق مفتوح` : ''}</em></span>
                </button>
              );
            })}
          </section>
          {missing && <p className="mb-note" role="alert">الرابط لباب غير متاح لك، أو لم يعد في الكتاب. اختر بابًا من الأجزاء أو الفهرس.</p>}
          {!data.comments_ready && <p className="mb-note">التعليقات تُفعَّل بعد تطبيق ترحيلها على الإنتاج. القراءة متاحة الآن.</p>}
        </div>
      ) : (
        <div className={`mb-reader font-${prefs.font} theme-${prefs.theme}`} style={{ '--mb-size': `${prefs.size}px`, '--mb-lh': lineHeight(prefs.spacing) }} ref={reader} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <header className="mb-top">
            <button type="button" className="mb-ic" onClick={toShelf} aria-label="غلاف الكتاب">⌂</button>
            <div className="mb-top-t"><small>{PARTS.find((p) => p.key === ch.dimension)?.label}</small><b>{ch.title}</b></div>
            <button type="button" className="mb-ic mb-aa" onClick={() => setLook(true)} aria-label="إعدادات القراءة" aria-haspopup="dialog" aria-expanded={look}>Aa</button>
            <button type="button" className="mb-ic" onClick={() => setAll(true)} aria-label="كل التعليقات">✎{total ? <i className="mb-dot">{total}</i> : null}</button>
            <button type="button" className="mb-ic" onClick={() => setToc(true)} aria-label="الفهرس">☰</button>
            <span className="mb-prog" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
          </header>
          <div className="mb-levels mb-scope" role="radiogroup" aria-label="نطاق القراءة">
            <span className="mb-row-l" aria-hidden="true">النطاق</span>
            {SCOPES.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={scope === k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{l}</button>)}
          </div>
          <div className="mb-levels" role="radiogroup" aria-label="اعرض الكتاب كما يراه مستوى">
            <span className="mb-row-l" aria-hidden="true">المستوى</span>
            {LEVELS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={level === k} className={level === k ? 'on' : ''} onClick={() => setLevel(k)}>{l}</button>)}
          </div>
          {/* منطقة الإعلان ثابتة يتغير نصها وحده، فيقرؤها قارئ الشاشة؛ والرابط معزول باتجاهه كي لا تقلبه الفقرة العربية */}
          <p className={copied ? 'mb-copied' : 'sr-only'} role="status">{copied && <>{copied.text}{copied.url && <> <bdi dir="ltr">{copied.url}</bdi></>}</>}</p>
          <Chapter key={ch.id} ch={ch} idx={idx} partIdx={partIdx} level={level} data={data} scope={scope} flip={flip} marks={prefs.marks} onMark={onMark} onCopyLink={copyLink} onThread={(t) => setThread(t)} onDeps={(t) => setDepsOf(t)} onProposals={(t) => {
            // قسم بلا مقترحات: يفتح المحرر مباشرة لمن يقترح، وإلا قائمة مقترحات القسم
            const has = (data.proposals || []).some((p) => p.module_id === ch.id && p.section === t.section && ['draft', 'review', 'approved'].includes(p.status));
            if (!has && data.viewer.propose && api.propose) setEditing({ chapter: ch, section: t.section, proposal: null });
            else setPropsOf({ chapter: ch, section: t.section });
          }} />
          <nav className="mb-pager" aria-label="التنقل بين الأبواب">
            <button type="button" disabled={prevIdx === null} onClick={() => step(-1)}><small>السابق</small><b>{prevIdx !== null ? data.chapters[prevIdx].title : scope === 'part' ? 'أول الجزء' : '·'}</b></button>
            <button type="button" disabled={nextIdx === null} onClick={() => step(1)}><small>التالي</small><b>{nextIdx !== null ? data.chapters[nextIdx].title : scope === 'part' ? 'آخر الجزء' : '·'}</b></button>
          </nav>
          {sel && data.viewer.write && !thread && (
            <button type="button" className="mb-selbtn" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => { clearTimeout(selGone.current); setThread({ section: sel.section, quote: sel.quote }); getSelection?.()?.removeAllRanges(); setSel(null); }}>
              ✎ علّق على النص المحدد
            </button>
          )}
        </div>
      )}
      {toc && <Toc data={data} level={level} current={view === 'read' ? ch : null} only={view === 'read' && scope === 'part' ? ch.dimension : null} marks={marks} onUnmark={onMark} onGo={goChapter} onClose={() => setToc(false)} />}
      {look && <LookSheet prefs={prefs} onChange={patch} onClose={() => setLook(false)} />}
      {pdfMenu && <PdfSheet parts={pdfParts} data={data} onPick={exportPdf} onClose={() => setPdfMenu(false)} />}
      {all && <AllComments data={data} onGo={(c) => { const at = data.chapters.findIndex((x) => x.id === c.module_id); setAll(false); go(at, c.section || null); setThread({ section: c.section || '' }); }} onClose={() => setAll(false)} />}
      {depsOf && ch && <DepsSheet target={depsOf} chapter={ch} data={data} onClose={() => setDepsOf(null)} />}
      {sharing && data.share && <ShareSheet share={data.share} viewer={data.viewer} api={api} onChanged={load} onExperts={onExperts} onClose={() => setSharing(false)} />}
      {propsOf && <ProposalsSheet data={data} api={api} scope={propsOf.chapter ? propsOf : null} onChanged={load} onClose={() => setPropsOf(null)} inactive={!!editing}
        onGo={(p) => { const at = data.chapters.findIndex((x) => x.id === p.module_id); setPropsOf(null); go(at, p.section || null); }}
        onEdit={(p, sc) => { const c = data.chapters.find((x) => x.id === (p ? p.module_id : sc.chapter.id)); setEditing({ chapter: c, section: p ? p.section : sc.section, proposal: p }); }} />}
      {editing && <ProposalEditor chapter={editing.chapter} section={editing.section} proposal={editing.proposal} data={data} api={api}
        onSaved={() => { setEditing(null); load(); }} onClose={() => setEditing(null)} />}
      {releasing && <ReleaseSheet api={api} onClose={() => { setReleasing(false); load(); }} />}
      {thread && ch && <Thread target={thread} chapter={ch} list={threadList} viewer={data.viewer} api={api} onChanged={load} onClose={() => setThread(null)} />}
    </div>
  );
}
