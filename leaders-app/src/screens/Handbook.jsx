// ════════════════════════════════════════════════════════════════
// الكتيب الشخصي: قراءة فقط داخل المنصة
// ════════════════════════════════════════════════════════════════
// الحماية طبقات، ولا يوجد موقع يمنع التصوير منعًا مطلقًا:
//   • الخادم يرسل بابًا واحدًا بعد تصفيته بمستوى المشارك، ويسجل كل فتح
//   • النص يُرسم على لوحة canvas، فلا نص في الصفحة يُحدد أو يُنسخ أو يُحفظ
//   • علامة مائية متكررة باسم المشارك وبريده وتاريخ اليوم، فأي تسريب يُعرف مصدره
//   • لا طباعة ولا قائمة سياق ولا سحب، وتُحجب الصفحة حين تفقد التركيز
//     (أغلب أدوات التصوير تسرق التركيز) أو عند مفاتيح التصوير والطباعة
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { call, lastRead } from '../api.js';
import { BookSkeleton } from '../ui.jsx';
import { DIMENSIONS, dimOf } from '../labels.js';
import { Models, Wins } from './Models.jsx';
import { COVER_CSS, coverHtml, readingBlocks as parse, writeBook } from '../../../src/lib/brand/book.js';

const FONT = '"Noto Kufi Arabic", "Noto Sans Arabic", system-ui, sans-serif';
const COLORS = { text: '#0B272F', muted: '#4A6A72', accent: '#8E6524', quote: '#12414E', rule: 'rgba(11,39,47,.12)' };

// كلمات بوزنها: **عريض** أو عادي
function tokens(text) {
  const out = [];
  text.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (!part) return;
    const bold = part.startsWith('**') && part.endsWith('**');
    const clean = bold ? part.slice(2, -2) : part;
    clean.split(/\s+/).filter(Boolean).forEach((w) => out.push({ w, bold }));
  });
  return out;
}

// يلف الكلمات في أسطر بعرض محدد، ثم يرسم كل سطر من اليمين بمقاطع متتالية
function layoutLines(ctx, toks, width, size, weight) {
  const font = (b) => `${b ? 700 : weight} ${size}px ${FONT}`;
  const lines = [];
  let line = [];
  let w = 0;
  for (const t of toks) {
    ctx.font = font(t.bold);
    const tw = ctx.measureText(t.w + ' ').width;
    if (line.length && w + tw > width) { lines.push(line); line = []; w = 0; }
    line.push(t);
    w += tw;
  }
  if (line.length) lines.push(line);
  return { lines, font };
}

function drawLine(ctx, line, rightX, y, font, color) {
  // مقاطع متصلة بنفس الوزن؛ المتصفح يتولى اتجاه النص المختلط داخل كل مقطع
  const runs = [];
  for (const t of line) {
    const last = runs[runs.length - 1];
    if (last && last.bold === t.bold) last.text += ' ' + t.w;
    else runs.push({ bold: t.bold, text: t.w });
  }
  let x = rightX;
  for (const r of runs) {
    ctx.font = font(r.bold);
    ctx.fillStyle = color;
    ctx.fillText(r.text + ' ', x, y);
    x -= ctx.measureText(r.text + ' ').width;
  }
}

function render(canvas, chapter, watermark, cssWidth) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pad = cssWidth < 520 ? 20 : 44;
  const width = cssWidth - pad * 2;
  const blocks = parse(chapter.md);
  const ctx = canvas.getContext('2d');
  const STY = {
    h2: { size: 19, weight: 700, lh: 34, before: 26, after: 8, color: COLORS.text },
    h3: { size: 16, weight: 700, lh: 28, before: 18, after: 4, color: COLORS.text },
    p: { size: 15, weight: 400, lh: 29, before: 8, after: 4, color: COLORS.text },
    li: { size: 15, weight: 400, lh: 28, before: 4, after: 2, color: COLORS.text },
    quote: { size: 15, weight: 600, lh: 28, before: 14, after: 10, color: COLORS.quote },
  };

  // تمريرتان: الأولى تحسب الارتفاع، والثانية ترسم
  const pass = (draw) => {
    let y = pad + 8;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    // عنوان الباب
    const title = layoutLines(ctx, tokens(chapter.title), width, 23, 700);
    title.lines.forEach((ln) => { y += 38; if (draw) drawLine(ctx, ln, pad + width, y, title.font, COLORS.text); });
    y += 14;
    if (draw) { ctx.fillStyle = '#A97A2E'; ctx.fillRect(pad + width - 64, y, 64, 3); }
    y += 10;

    for (const b of blocks) {
      const s = STY[b.type];
      const indent = b.type === 'li' ? 22 : b.type === 'quote' ? 18 : 0;
      const { lines, font } = layoutLines(ctx, tokens(b.text), width - indent - (b.type === 'quote' ? 12 : 0), s.size, s.weight);
      y += s.before;
      const top = y;
      lines.forEach((ln, i) => {
        y += s.lh;
        if (!draw) return;
        if (b.type === 'li' && i === 0) {
          ctx.font = `700 ${s.size}px ${FONT}`;
          ctx.fillStyle = COLORS.accent;
          ctx.fillText(b.marker, pad + width, y);
        }
        drawLine(ctx, ln, pad + width - indent, y, font, s.color);
      });
      if (draw && b.type === 'quote') {
        ctx.fillStyle = 'rgba(169,122,46,.10)';
        ctx.fillRect(pad, top + 4, width, y - top + 10);
        ctx.fillStyle = '#A97A2E';
        ctx.fillRect(pad + width - 3, top + 4, 3, y - top + 10);
        // إعادة رسم النص فوق الخلفية
        let yy = top;
        lines.forEach((ln) => { yy += s.lh; drawLine(ctx, ln, pad + width - indent, yy, font, s.color); });
        y += 10;
      }
      y += s.after;
    }

    // تذييل الملكية
    y += 34;
    if (draw) {
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(pad, y - 22, width, 1);
      ctx.font = `400 12px ${FONT}`;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`© Milestone Impact. نسخة شخصية مرخصة لـ ${watermark}. يُمنع النسخ والتصوير والتداول.`, pad + width, y);
    }
    return y + pad;
  };

  const height = Math.ceil(pass(false));
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cssWidth, height);
  pass(true);

  // العلامة المائية فوق كل شيء
  const stamp = `${watermark} · ${new Date().toLocaleDateString('en-GB')}`;
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = COLORS.text;
  ctx.font = `600 15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.rotate(-Math.PI / 7);
  for (let y = -cssWidth; y < height + cssWidth; y += 150) {
    for (let x = -cssWidth; x < cssWidth * 2; x += 380) ctx.fillText(stamp, x + ((y / 150) % 2) * 190, y);
  }
  ctx.restore();
}

const COVER = 'cover';   // الغلاف أول صفحة في القارئ، ويُفتح أولًا لمن لم يقرأ بعد
const PART = { milestone: 'الجزء الأول', impact: 'الجزء الثاني', leadership: 'الجزء الثالث' };
const ROMAN = { milestone: 'I', impact: 'II', leadership: 'III' };
const pad = (n) => String(n).padStart(2, '0');

// حلقة تقدم صغيرة
function Ring({ value, total, size = 64 }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? value / total : 0;
  return (
    <svg className="bring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="bring-bg" />
      <circle cx={size / 2} cy={size / 2} r={r} className="bring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
    </svg>
  );
}

// مراجعة الباب: سؤال تأمل واختبار قصير، والنقاط تُمنح أول مرة
function Review({ data, onDone }) {
  const [answers, setAnswers] = useState(() => data.quiz.map(() => null));
  const [reflection, setReflection] = useState(data.done?.reflection || '');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = answers.every((x) => x !== null);
  const potential = 10 + data.quiz.length * 5 + 5;

  const submit = async () => {
    setBusy(true); setError('');
    const r = await call('handbook.complete', { id: data.chapter.id, answers, reflection });
    setBusy(false);
    if (!r.success) return setError(r.message);
    setResult(r);
    onDone(r);
  };

  return (
    <section className="review">
      <header className="review-head">
        <div><span className="eyebrow">مراجعة الباب</span><h3>ثبّت ما قرأت</h3></div>
        {data.done
          ? <span className="chip ok">أتممته · {data.done.score}/{data.done.total}</span>
          : <span className="chip gold">حتى {potential} نقطة</span>}
      </header>

      {data.reflection && (
        <label className="reflect">
          <span className="reflect-q"><b>سؤال للتأمل</b>{data.reflection}</span>
          <textarea className="input" rows={3} value={reflection} onChange={(e) => setReflection(e.target.value)}
            placeholder="اكتب تأملك على عملك الحقيقي. سطران يكفيان." />
          <small className="muted">التأمل الصادق يمنحك 5 نقاط إضافية، ويبقى خاصًا بك وبمستشارك.</small>
        </label>
      )}

      {data.quiz.map((q, i) => {
        const res = result?.results?.[i];
        return (
          <fieldset key={i} className="quiz-q">
            <legend><span className="qn">{i + 1}</span>{q.q}</legend>
            <div className="quiz-opts">
              {q.options.map((o, j) => {
                const cls = res ? (j === res.answer ? ' right' : answers[i] === j ? ' wrong' : '') : answers[i] === j ? ' on' : '';
                return (
                  <button key={j} type="button" className={`quiz-opt${cls}`} disabled={!!res}
                    onClick={() => setAnswers((a) => a.map((x, k) => (k === i ? j : x)))}>{o}</button>
                );
              })}
            </div>
            {res && <p className={`quiz-why ${res.correct ? 'ok' : 'bad'}`}><b>{res.correct ? 'إجابة صحيحة.' : 'ليست الإجابة الأدق.'}</b> {res.why}</p>}
          </fieldset>
        );
      })}

      {error && <div className="alert err">{error}</div>}
      {result ? (
        <div className={`review-out${result.gained ? ' win' : ''}`}>
          <b>{result.score} من {result.total}</b>
          <span>{result.gained ? `+${result.gained} نقطة أضيفت إلى رصيدك` : 'المحاولة الأولى هي التي تُحتسب، وهذه للتعلم.'}</span>
        </div>
      ) : (
        <button className="btn gold block" disabled={busy || (data.quiz.length > 0 && !ready)} onClick={submit}>
          {busy ? 'لحظة…' : data.done ? 'أعد الاختبار وحدّث تأملك' : 'أتممت الباب'}
        </button>
      )}
    </section>
  );
}

export default function Handbook({ me, onBack }) {
  const [toc, setToc] = useState(null);
  const [tab, setTab] = useState('read');
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shield, setShield] = useState(false);
  const [toast, setToast] = useState('');
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  const loadToc = useCallback(async (first) => {
    const r = await call('handbook.toc');
    if (!r.success) return setError(r.message);
    setToc(r);
    if (first && r.chapters.length) {
      const last = lastRead.get();
      const resume = last && r.chapters.find((c) => c.id === last.id);
      setCurrent(resume ? resume.id : r.chapters.some((c) => c.done) ? (r.chapters.find((c) => !c.done) || r.chapters[0]).id : COVER);
    }
  }, []);
  const retry = () => { setError(''); loadToc(true); };
  useEffect(() => { loadToc(true); }, [loadToc]);

  useEffect(() => {
    if (!current || current === COVER || tab !== 'read') return;
    (async () => {
      setLoading(true);
      const r = await call('handbook.chapter', { id: current });
      setLoading(false);
      if (!r.success) return setError(r.message);
      setError('');
      setData(r);
      lastRead.set({ id: current, title: r.chapter.title });
      document.querySelector('.book-page')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    })();
  }, [current, tab]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const paint = useCallback(async () => {
    if (!data || !canvasRef.current || !wrapRef.current) return;
    try { await document.fonts.load(`400 15px ${FONT}`); await document.fonts.load(`700 15px ${FONT}`); } catch { /* الخط الاحتياطي */ }
    render(canvasRef.current, data.chapter, data.watermark, Math.min(wrapRef.current.clientWidth, 780));
  }, [data]);

  useEffect(() => {
    paint();
    const onResize = () => paint();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [paint]);

  // حجب عند فقدان التركيز ومفاتيح التصوير والطباعة والحفظ
  useEffect(() => {
    const hide = () => setShield(true);
    const show = () => setShield(false);
    const onVis = () => (document.hidden ? hide() : show());
    const onKey = (e) => {
      const k = e.key?.toLowerCase();
      const combo = (e.ctrlKey || e.metaKey) && ['p', 's', 'c', 'a'].includes(k) && !e.target.closest?.('textarea, input');
      const mac = e.metaKey && e.shiftKey && ['3', '4', '5', 's'].includes(k);
      if (k === 'printscreen' || combo || mac) {
        e.preventDefault();
        hide();
        try { navigator.clipboard?.writeText(''); } catch { /* */ }
        setTimeout(show, 1500);
      }
    };
    window.addEventListener('blur', hide);
    window.addEventListener('focus', show);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    const block = (e) => { if (!e.target.closest?.('textarea, input')) e.preventDefault(); };
    document.addEventListener('contextmenu', block);
    document.addEventListener('dragstart', block);
    document.addEventListener('copy', block);
    document.body.classList.add('protected');
    return () => {
      window.removeEventListener('blur', hide);
      window.removeEventListener('focus', show);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('dragstart', block);
      document.removeEventListener('copy', block);
      document.body.classList.remove('protected');
    };
  }, []);

  if (error && !toc) {
    return <div className="page narrow"><div className="alert err">{error}</div><div className="row" style={{ marginTop: 14 }}><button className="btn sm" onClick={retry}>حاول مرة أخرى</button><button className="btn ghost sm" onClick={onBack}>رجوع للرحلة</button></div></div>;
  }
  if (!toc) return <BookSkeleton />;

  const list = toc.chapters;
  const idx = list.findIndex((c) => c.id === current);
  const doneN = list.filter((c) => c.done).length;
  const go = (d) => { const n = list[idx + d]; if (n) setCurrent(n.id); };
  const pts = toc.points || { total: 0, rank: { title: 'مستكشف', next: null } };
  const nextPct = pts.rank.next ? Math.min(100, (1 - pts.rank.next.left / Math.max(1, pts.rank.next.at)) * 100) : 100;
  const numInPart = (c) => list.filter((x) => x.dimension === c.dimension).findIndex((x) => x.id === c.id) + 1;
  const onPoints = (r) => {
    if (r.gained) setToast(`+${r.gained} نقطة`);
    loadToc(false);
  };
  // النسخة الشخصية PDF: الخادم يصدرها برقم ويسجلها، والنافذة تُفتح متزامنة مع النقرة
  const parts = DIMENSIONS.map((d) => ({ key: d.key, roman: ROMAN[d.key], label: `${PART[d.key]} · ${d.short}`, title: d.title, short: d.short }));
  const exportBook = async () => {
    const win = window.open('', '_blank');
    const r = await call('handbook.export');
    if (!r.success) { win?.close(); return setToast(r.message); }
    if (!writeBook(win, r.book, parts)) setToast('اسمح بالنوافذ المنبثقة لفتح النسخة');
  };

  return (
    <div className="page book">
      <section className="book-hero">
        <div className="book-hero-main">
          <span className="book-eyebrow">The Leader's Book</span>
          <h1>كتاب القائد</h1>
          <p>نسخة شخصية مرخصة باسم <b>{toc.name || me.participant.full_name}</b>{toc.code ? <> · <span dir="ltr">{toc.code}</span></> : ''}</p>
        </div>
        <div className="book-stats">
          <div className="book-stat bring-wrap">
            <Ring value={doneN} total={list.length} />
            <span className="bring-n">{doneN}<small>/{list.length}</small></span>
            <small>باب أتممته</small>
          </div>
          <div className="book-stat">
            <b className="pts">{pts.total}</b>
            <small>نقطة</small>
          </div>
          <div className="book-stat rank">
            <span className="rank-badge">{pts.rank.title}</span>
            <span className="bar"><i style={{ width: `${nextPct}%` }} /></span>
            <small>{pts.rank.next ? `${pts.rank.next.left} نقطة إلى ${pts.rank.next.title}` : 'أعلى لقب في البرنامج'}</small>
          </div>
        </div>
        <nav className="book-tabs" role="tablist">
          {[['read', 'الكتاب'], ['models', `النماذج التعليمية${toc.models?.total ? ` · ${toc.models.submitted}/${toc.models.total}` : ''}`], ['wins', 'إنجازاتي']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
          <span className="spacer" />
          <button className="link small" onClick={exportBook} title="نسخة PDF باسمك ورقم إصدار، حتى 3 نسخ يوميًا">نسخة PDF شخصية</button>
          <button className="link small book-back" onClick={onBack}>رجوع للرحلة</button>
        </nav>
      </section>

      {tab === 'models' && <Models onPoints={onPoints} />}
      {tab === 'wins' && <Wins />}

      {tab === 'read' && (
        <div className="book-grid">
          <nav className="book-toc" aria-label="فهرس الكتاب">
            <button className={`toc-ch toc-cover${current === COVER ? ' on' : ''}`} onClick={() => setCurrent(COVER)}>
              <span className="toc-num">◆</span><span className="toc-t">الغلاف</span>
            </button>
            {DIMENSIONS.map((d) => {
              const items = list.filter((c) => c.dimension === d.key);
              if (!items.length) return null;
              const partDone = items.filter((c) => c.done).length;
              return (
                <div key={d.key} className="toc-part">
                  <div className="toc-part-head">
                    <span className="toc-roman">{ROMAN[d.key]}</span>
                    <div><small>{PART[d.key]} · {d.short}</small><b>{d.title}</b></div>
                    <span className="toc-part-n">{partDone}/{items.length}</span>
                  </div>
                  {items.map((c, i) => (
                    <button key={c.id} className={`toc-ch${c.id === current ? ' on' : ''}${c.done ? ' done' : ''}`} onClick={() => setCurrent(c.id)}>
                      <span className="toc-num">{c.done ? '✓' : pad(i + 1)}</span>
                      <span className="toc-t">{c.title}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>

          <div className="book-reader" ref={wrapRef}>
            {current !== COVER && data && idx >= 0 && (
              <div className="page-head">
                <span>{PART[data.chapter.dimension]} · {dimOf(data.chapter.dimension).title}</span>
                <span>الباب {pad(numInPart(list[idx]))} · {idx + 1} من {list.length}</span>
              </div>
            )}
            {current === COVER && (
              <div className={`book-page bk-cover-host${shield ? ' shield' : ''}`}>
                <style>{COVER_CSS}</style>
                <div dangerouslySetInnerHTML={{ __html: coverHtml({ name: toc.name || me.participant.full_name, code: toc.code }) }} />
                {shield && <div className="hb-cover">عد إلى الصفحة لمتابعة القراءة</div>}
              </div>
            )}
            <div hidden={current === COVER} className={`book-page hb-sheet${shield ? ' shield' : ''}${loading ? ' loading' : ''}`}>
              <canvas ref={canvasRef} role="img" aria-label={data?.chapter.title || 'صفحة الكتاب'} />
              {shield && <div className="hb-cover">عد إلى الصفحة لمتابعة القراءة</div>}
            </div>
            {error && <div className="alert err" style={{ marginTop: 10 }}>{error}</div>}
            {current !== COVER && data && !loading && <Review key={data.chapter.id} data={data} onDone={onPoints} />}
            <div className="row between book-nav">
              <button className="btn ghost sm" disabled={current === COVER} onClick={() => (idx <= 0 ? setCurrent(COVER) : go(-1))}>{idx === 0 ? 'الغلاف' : 'الباب السابق'}</button>
              <button className="btn sm" disabled={idx >= list.length - 1} onClick={() => (current === COVER ? setCurrent(list[0].id) : go(1))}>{current === COVER ? 'ابدأ القراءة' : 'الباب التالي'}</button>
            </div>
            <p className="small muted" style={{ marginTop: 12 }}>المحتوى ملكية فكرية لـ Milestone Impact، ومرخص لك للقراءة داخل المنصة فقط. كل صفحة تحمل اسمك.</p>
          </div>
        </div>
      )}
      {toast && <div className="toast pts-toast" role="status">{toast}</div>}
    </div>
  );
}
