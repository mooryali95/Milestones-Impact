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
import FirstOpen from '../FirstOpen.jsx';
import { BRAND } from '../../../shared/js/brand.js';
import { call, lastRead } from '../api.js';
import { BookSkeleton, POPUP_BLOCKED } from '../ui.jsx';
import { DIMENSIONS, dimOf } from '../labels.js';
import { POINTS } from '../../../supabase/functions/leaders-api/logic.js';
import { countAr, TERMS } from '../../../supabase/functions/leaders-api/labels.js';
import { Models, Wins } from './Models.jsx';
import { ChapterLab } from './Lab.jsx';
import { COVER_CSS, coverHtml, readingBlocks as parse, writeBook } from '../../../src/lib/brand/book.js';

import logoDark from '../milestone-impact.svg';

// خط القراءة نسخي كتب، والعناوين أميري، واللاتيني Cormorant
const FONT = '"Noto Naskh Arabic", "Amiri", "Noto Kufi Arabic", serif';
const DISPLAY = '"Amiri", "Noto Naskh Arabic", serif';
const KUFI = '"Noto Kufi Arabic", system-ui, sans-serif';
const LATIN = '"Cormorant Garamond", Georgia, serif';
const COLORS = { text: BRAND['ink-text'], muted: BRAND['muted-mid'], accent: BRAND.gold, gold: BRAND['gold-warm'], quote: BRAND.slate, rule: 'rgba(169,122,46,.35)', paper: BRAND.paper };
const WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const PART_EN = { milestone: 'Part I · Milestone', impact: 'Part II · Impact', leadership: 'Part III · Leadership' };

// الشعار يُرسم على الصفحة، فيُحمَّل مرة واحدة
let logoImg = null;
const loadLogo = () => {
  if (logoImg) return logoImg;
  logoImg = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = logoDark; });
  return logoImg;
};

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

// يلف الكلمات في أسطر بعرض محدد
function layoutLines(ctx, toks, width, size, weight, family = FONT) {
  const font = (b) => `${b ? 700 : weight} ${size}px ${family}`;
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

// وحدات السطر: الكلمات العربية منفردة، والعبارات اللاتينية المتتالية وحدة واحدة حتى لا ينقلب ترتيبها
const isLatin = (w) => /^[\x20-\x7E‐-’]+$/.test(w) && /[A-Za-z0-9]/.test(w);
function units(line) {
  const out = [];
  for (const t of line) {
    const last = out[out.length - 1];
    if (last && last.bold === t.bold && last.latin && isLatin(t.w)) last.text += ' ' + t.w;
    else out.push({ bold: t.bold, text: t.w, latin: isLatin(t.w) });
  }
  return out;
}

// يرسم السطر من اليمين؛ ومع justify يوزع الفراغ بين الوحدات فتستوي حافتا الفقرة كالكتب المطبوعة
function drawLine(ctx, line, rightX, y, font, color, justify) {
  const us = units(line);
  ctx.fillStyle = color;
  const widths = us.map((u) => { ctx.font = font(u.bold); return ctx.measureText(u.text).width; });
  ctx.font = font(false);
  const space = ctx.measureText(' ').width;
  const natural = widths.reduce((a, b) => a + b, 0) + space * (us.length - 1);
  const gap = justify && us.length > 1 && natural < justify && natural > justify * 0.72 ? space + (justify - natural) / (us.length - 1) : space;
  let x = rightX;
  us.forEach((u, i) => {
    ctx.font = font(u.bold);
    ctx.fillText(u.text, x, y);
    x -= widths[i] + gap;
  });
}

// زخرفة: خط ذهبي تتوسطه معينة
function ornament(ctx, cx, y, half) {
  ctx.fillStyle = COLORS.rule;
  ctx.fillRect(cx - half, y, half - 9, 1);
  ctx.fillRect(cx + 9, y, half - 9, 1);
  ctx.save();
  ctx.translate(cx, y + 0.5);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(-3.5, -3.5, 7, 7);
  ctx.restore();
}

function render(canvas, chapter, watermark, cssWidth, meta, logo) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const narrow = cssWidth < 520;
  const pad = narrow ? 22 : 56;
  const width = cssWidth - pad * 2;
  const right = pad + width;
  const blocks = parse(chapter.md);
  const ctx = canvas.getContext('2d');
  const k = narrow ? 0.94 : 1;
  const STY = {
    h2: { size: 21 * k, weight: 700, lh: 38 * k, before: 30, after: 6, color: COLORS.quote, family: DISPLAY },
    h3: { size: 17 * k, weight: 700, lh: 30 * k, before: 18, after: 2, color: COLORS.text, family: FONT },
    p: { size: 16 * k, weight: 400, lh: 32 * k, before: 8, after: 4, color: COLORS.text, family: FONT },
    lead: { size: 17.5 * k, weight: 400, lh: 34 * k, before: 4, after: 8, color: COLORS.quote, family: FONT },
    li: { size: 16 * k, weight: 400, lh: 30 * k, before: 4, after: 2, color: COLORS.text, family: FONT },
    quote: { size: 18 * k, weight: 400, lh: 34 * k, before: 22, after: 18, color: COLORS.quote, family: DISPLAY },
  };
  const firstP = blocks.findIndex((b) => b.type === 'p');

  const pass = (draw) => {
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    let y = pad - 14;

    // الترويسة الجارية: الشعار يسارًا، واسم الكتيب والجزء يمينًا
    y += 22;
    if (draw) {
      ctx.font = `500 11.5px ${KUFI}`;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`${TERMS.handbook} · ${meta.part}`, right, y);
      if (logo) { const h = 22; const w = (logo.width / logo.height) * h || 48; ctx.drawImage(logo, pad, y - h + 5, w, h); }
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(pad, y + 12, width, 1);
    }
    y += 54;

    // افتتاحية الباب: رقم كبير باهت، والجزء بالإنجليزية، ثم العنوان والزخرفة
    if (draw) {
      ctx.save();
      ctx.textAlign = 'left';
      ctx.direction = 'ltr';
      ctx.font = `700 ${narrow ? 78 : 118}px ${DISPLAY}`;
      ctx.fillStyle = 'rgba(169,122,46,.13)';
      ctx.fillText(meta.no, pad - 4, y + (narrow ? 44 : 70));
      ctx.restore();
      ctx.font = `italic 500 ${narrow ? 15 : 17}px ${LATIN}`;
      ctx.fillStyle = COLORS.gold;
      ctx.direction = 'ltr';
      ctx.fillText(`${meta.partEn}  ·  Chapter ${meta.word}`, right, y);
      ctx.direction = 'rtl';
    }
    y += 12;
    const title = layoutLines(ctx, tokens(chapter.title), width - (narrow ? 70 : 140), narrow ? 25 : 31, 700, DISPLAY);
    title.lines.forEach((ln) => { y += narrow ? 42 : 52; if (draw) drawLine(ctx, ln, right, y, title.font, COLORS.text); });
    y += 26;
    if (draw) ornament(ctx, right - 70, y, 70);
    y += 22;

    blocks.forEach((b, bi) => {
      const s = bi === firstP ? STY.lead : STY[b.type];
      const indent = b.type === 'li' ? 24 : b.type === 'quote' ? 34 : 0;
      const w = width - indent - (b.type === 'quote' ? 22 : 0);
      const { lines, font } = layoutLines(ctx, tokens(b.text), w, s.size, s.weight, s.family);
      y += s.before;
      const top = y;
      if (b.type === 'h2' && draw) {
        ctx.save(); ctx.translate(right - 4, y + s.lh - 9); ctx.rotate(Math.PI / 4); ctx.fillStyle = COLORS.gold; ctx.fillRect(-4, -4, 8, 8); ctx.restore();
      }
      const hIndent = b.type === 'h2' ? 18 : 0;
      lines.forEach((ln, i) => {
        y += s.lh;
        if (!draw || b.type === 'quote') return;
        if (b.type === 'li' && i === 0) {
          ctx.font = `700 ${s.size}px ${FONT}`;
          ctx.fillStyle = COLORS.accent;
          const dot = b.marker === '•' || b.marker === '◆';
          ctx.fillText(dot ? '◆' : b.marker, right - (dot ? 4 : 0), y - (dot ? 2 : 0));
        }
        const just = (b.type === 'p' || b.type === 'li') && i < lines.length - 1 ? w : 0;
        drawLine(ctx, ln, right - indent - hIndent, y, font, s.color, just);
      });
      if (b.type === 'quote') {
        if (draw) {
          ctx.fillStyle = 'rgba(169,122,46,.07)';
          ctx.fillRect(pad, top - 6, width, y - top + 24);
          ctx.fillStyle = COLORS.gold;
          ctx.fillRect(right - 2, top - 6, 2, y - top + 24);
          ctx.font = `600 64px ${LATIN}`;
          ctx.fillStyle = 'rgba(169,122,46,.45)';
          ctx.fillText('”', right - 8, top + 46);
          let yy = top;
          lines.forEach((ln) => { yy += s.lh; drawLine(ctx, ln, right - indent, yy, font, s.color); });
        }
        y += 10;
      }
      y += s.after;
    });

    // ختام الباب وتذييل الملكية: الاسم يمينًا، ورقم الصفحة يسارًا
    y += 30;
    if (draw) ornament(ctx, pad + width / 2, y, 34);
    y += 46;
    if (draw) {
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(pad, y - 20, width, 1);
      ctx.font = `500 11.5px ${KUFI}`;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`نسخة شخصية مرخصة لـ ${meta.name}`, right, y);
      ctx.textAlign = 'left';
      ctx.direction = 'ltr';
      ctx.font = `italic 500 15px ${LATIN}`;
      ctx.fillStyle = COLORS.gold;
      ctx.font = `400 13px ${DISPLAY}`;
      ctx.fillText(`— ${meta.folio} —`, pad, y);
      ctx.textAlign = 'right';
      ctx.direction = 'rtl';
      y += 20;
      ctx.font = `400 10.5px ${KUFI}`;
      ctx.fillStyle = 'rgba(91,113,120,.75)';
      ctx.fillText('© Milestone Impact. يُمنع النسخ والتصوير والتداول، وكل صفحة تحمل هوية صاحبها.', right, y);
    } else y += 20;
    return y + pad - 10;
  };

  const height = Math.ceil(pass(false));
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, cssWidth, height);
  // إطار داخلي رفيع كالكتب الفاخرة
  ctx.strokeStyle = 'rgba(169,122,46,.28)';
  ctx.lineWidth = 1;
  const fi = narrow ? 8 : 16;
  ctx.strokeRect(fi + 0.5, fi + 0.5, cssWidth - fi * 2 - 1, height - fi * 2 - 1);
  pass(true);

  // العلامة المائية فوق كل شيء
  const stamp = `${watermark} · ${new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}`;
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = COLORS.text;
  ctx.font = `600 15px ${KUFI}`;
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
// ── تتبع القراءة الفعلية ──
// الباب لوحة طويلة تُقسم إلى SLICES شريحة. كل ثانية والصفحة ظاهرة والقارئ
// نشط (تمرير أو لمس أو مفتاح خلال آخر دقيقة) تُوزع الثانية على الشرائح
// الظاهرة في وسط الشاشة. ترسل كل 15 ثانية، والخادم يسقفها بالزمن الفعلي.
const SLICES = 20;
const IDLE_MS = 60_000;
function useReadingTracker(chapterId, canvasRef, shield, onVerdict) {
  const shieldRef = useRef(shield);
  shieldRef.current = shield;
  useEffect(() => {
    if (!chapterId) return undefined;
    let acc = new Array(SLICES).fill(0);
    let lastActive = Date.now();
    const poke = () => { lastActive = Date.now(); };
    const evs = ['scroll', 'wheel', 'touchstart', 'touchmove', 'keydown', 'mousemove', 'pointerdown'];
    evs.forEach((e) => window.addEventListener(e, poke, { passive: true }));
    const tick = setInterval(() => {
      const c = canvasRef.current;
      if (!c || document.hidden || shieldRef.current || Date.now() - lastActive > IDLE_MS) return;
      const r = c.getBoundingClientRect();
      if (!r.height) return;
      const top = window.innerHeight * 0.15, bottom = window.innerHeight * 0.85;
      const from = Math.max(0, Math.floor(((top - r.top) / r.height) * SLICES));
      const to = Math.min(SLICES - 1, Math.floor(((bottom - r.top) / r.height) * SLICES));
      if (to < from || bottom < r.top || top > r.bottom) return;
      for (let i = from; i <= to; i++) acc[i] += 1 / (to - from + 1);
    }, 1000);
    const flush = async () => {
      const slices = acc.map((x) => Math.round(x * 10) / 10);
      if (!slices.some((x) => x > 0)) return;
      acc = new Array(SLICES).fill(0);
      const res = await call('handbook.ping', { id: chapterId, slices });
      if (res.success) onVerdict(res.reading);
    };
    const ping = setInterval(flush, 15000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, poke));
      clearInterval(tick); clearInterval(ping);
      flush();
    };
  }, [chapterId]);
}

const READ_LABEL = { read: 'قراءة مكتملة', skimmed: 'تصفّح سريع، تمهّل ليُحتسب', partial: 'قراءة جارية', unread: 'لم تبدأ القراءة' };
function ReadMeter({ v }) {
  if (!v) return null;
  return (
    <div className={`read-meter ${v.state}`}>
      <span>{v.state === 'read' ? '✓ ' : ''}{READ_LABEL[v.state]}</span>
      {v.state !== 'read' && <i><b style={{ width: `${v.pct}%` }} /></i>}
    </div>
  );
}

function Review({ data, onDone }) {
  const [answers, setAnswers] = useState(() => data.quiz.map(() => null));
  const [reflection, setReflection] = useState(data.done?.reflection || '');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = answers.every((x) => x !== null);
  const potential = POINTS.chapter + data.quiz.length * POINTS.perCorrect + (data.reflection ? POINTS.reflection : 0);

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
          <small className="muted">التأمل يمنحك {countAr(POINTS.reflection, 'نقطة إضافية', 'نقطتين إضافيتين', 'نقاط إضافية', 'نقطة إضافية')}، ويبقى بينك وبين مستشارك.</small>
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

export default function Handbook({ me, lab, onLab, onBack }) {
  const [toc, setToc] = useState(null);
  const [tab, setTab] = useState('read');
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shield, setShield] = useState(false);
  const [toast, setToast] = useState('');
  const [reading, setReading] = useState(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  useReadingTracker(tab === 'read' && data && data.chapter.id === current ? current : null, canvasRef, shield || loading, setReading);

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
      setReading(r.reading || null);
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
    try {
      await Promise.all([`400 16px "Noto Naskh Arabic"`, `700 16px "Noto Naskh Arabic"`, `700 30px "Amiri"`, `400 18px "Amiri"`, `italic 500 17px "Cormorant Garamond"`, `500 64px "Cormorant Garamond"`, `500 12px "Noto Kufi Arabic"`]
        .map((f) => document.fonts.load(f)));
    } catch { /* الخط الاحتياطي */ }
    const logo = await loadLogo();
    const list = toc?.chapters || [];
    const i = list.findIndex((c) => c.id === data.chapter.id);
    const inPart = list.filter((x) => x.dimension === data.chapter.dimension).findIndex((x) => x.id === data.chapter.id) + 1;
    render(canvasRef.current, data.chapter, data.watermark, Math.min(wrapRef.current.clientWidth, 820), {
      name: toc?.name || me.participant.full_name, part: `${PART[data.chapter.dimension]} · ${dimOf(data.chapter.dimension).title}`,
      partEn: PART_EN[data.chapter.dimension], no: pad(inPart || 1), word: WORDS[(inPart || 1) - 1] || String(inPart), folio: `${i + 1} / ${list.length}`,
    }, logo);
  }, [data, toc, me]);

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
    return <div className="page narrow"><div className="alert err">{error}</div><div className="row" style={{ marginTop: 14 }}><button className="btn sm" onClick={retry}>حاول مرة أخرى</button><button className="btn ghost sm" onClick={onBack}>→ رحلتي</button></div></div>;
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
  const chapterLab = data && (lab || []).filter((it) => it.dimension === data.chapter.dimension && it.chapter_key === data.chapter.chapter_key);
  // النسخة الشخصية PDF: الخادم يصدرها برقم ويسجلها، والنافذة تُفتح متزامنة مع النقرة
  const parts = DIMENSIONS.map((d) => ({ key: d.key, roman: ROMAN[d.key], label: `${PART[d.key]} · ${d.short}`, title: d.title, short: d.short }));
  const exportBook = async () => {
    const win = window.open('', '_blank');
    const r = await call('handbook.export');
    if (!r.success) { win?.close(); return setToast(r.message); }
    if (!writeBook(win, r.book, parts)) setToast(POPUP_BLOCKED);
  };

  return (
    <div className="page book">
      <FirstOpen id="handbook" icon="📘" title="كتيبك على مستواك" lines={[
        'الأبواب مرتبة بمستواك في كل إطار؛ ابدأ بالباب المعلّم «التالي».',
        'في نهاية كل باب سؤال تأمل واختبار قصير يوثّقان قراءتك في رحلتك تلقائيًا.',
        'يحفظ الكتيب موضعك، فتعود إليه من حيث توقفت على أي جهاز.',
      ]} />
      <section className="book-hero">
        <div className="book-hero-main">
          <span className="book-eyebrow">The Leader's Book</span>
          <h1>{TERMS.handbook}</h1>
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
        <nav className="book-tabs" aria-label="أقسام الكتيب">
          <div className="book-tablist" role="tablist">
            {[['read', 'الكتيب'], ['models', `النماذج التعليمية${toc.models?.total ? ` · ${toc.models.submitted}/${toc.models.total}` : ''}`], ['wins', 'إنجازاتي']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <span className="spacer" />
          <button className="link small book-act" onClick={exportBook} title="نسخة PDF باسمك ورقم إصدار، حتى 3 نسخ يوميًا">⤓ نسخة PDF شخصية</button>
          <button className="link small book-act book-back" onClick={onBack}>→ رحلتي</button>
        </nav>
      </section>

      {tab === 'models' && <Models name={toc.name || me.participant.full_name} onPoints={onPoints} />}
      {tab === 'wins' && <Wins />}

      {tab === 'read' && (
        <div className="book-grid">
          <nav className="book-toc" data-tour="handbook-toc" aria-label="فهرس الكتيب">
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
                <ReadMeter v={reading} />
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
              <canvas ref={canvasRef} role="img" aria-label={data?.chapter.title || 'صفحة الكتيب'} />
              {shield && <div className="hb-cover">عد إلى الصفحة لمتابعة القراءة</div>}
            </div>
            {error && <div className="alert err" style={{ marginTop: 10 }}>{error}</div>}
            {current !== COVER && data && !loading && <Review key={data.chapter.id} data={data} onDone={onPoints} />}
            {current !== COVER && data && !loading && <ChapterLab items={chapterLab} onOpen={onLab} />}
            <div className="row between book-nav">
              <button className="btn ghost sm" disabled={current === COVER} onClick={() => (idx <= 0 ? setCurrent(COVER) : go(-1))}>{idx === 0 ? 'الغلاف' : 'الباب السابق'}</button>
              <button className="btn sm" disabled={idx >= list.length - 1} onClick={() => (current === COVER ? setCurrent(list[0].id) : go(1))}>{current === COVER ? 'ابدأ القراءة' : 'الباب التالي'}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast pts-toast" role="status">{toast}</div>}
    </div>
  );
}
