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
import { call } from '../api.js';
import { DIMENSIONS, dimOf, levelOf } from '../labels.js';

const FONT = '"Noto Kufi Arabic", "Noto Sans Arabic", system-ui, sans-serif';
const COLORS = { text: '#0B272F', muted: '#4A6A72', accent: '#8E6524', quote: '#12414E', rule: 'rgba(11,39,47,.12)' };

// ── تحويل الـ Markdown المبسط إلى كتل ──
function parse(md) {
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    let m;
    if ((m = line.match(/^(#{2,3})\s+(.*)$/))) { flush(); blocks.push({ type: m[1].length === 2 ? 'h2' : 'h3', text: m[2] }); }
    else if ((m = line.match(/^[-•]\s+(.*)$/))) { flush(); blocks.push({ type: 'li', marker: '•', text: m[1] }); }
    else if ((m = line.match(/^(\d+)[.)]\s+(.*)$/))) { flush(); blocks.push({ type: 'li', marker: `${m[1]}.`, text: m[2] }); }
    else if ((m = line.match(/^>\s?(.*)$/))) { flush(); blocks.push({ type: 'quote', text: m[1] }); }
    else para.push(line);
  }
  flush();
  return blocks;
}

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

export default function Handbook({ me, onBack }) {
  const [toc, setToc] = useState(null);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shield, setShield] = useState(false);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    (async () => {
      const r = await call('handbook.toc');
      if (!r.success) return setError(r.message);
      setToc(r);
      if (r.chapters[0]) setCurrent(r.chapters[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!current) return;
    (async () => {
      setLoading(true);
      const r = await call('handbook.chapter', { id: current });
      setLoading(false);
      if (!r.success) return setError(r.message);
      setError('');
      setChapter(r);
      (document.querySelector('.hb-sheet') || document.body).scrollIntoView({ behavior: 'smooth', block: 'start' });
    })();
  }, [current]);

  const paint = useCallback(async () => {
    if (!chapter || !canvasRef.current || !wrapRef.current) return;
    try { await document.fonts.load(`400 15px ${FONT}`); await document.fonts.load(`700 15px ${FONT}`); } catch { /* الخط الاحتياطي */ }
    render(canvasRef.current, chapter.chapter, chapter.watermark, Math.min(wrapRef.current.clientWidth, 780));
  }, [chapter]);

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
      const combo = (e.ctrlKey || e.metaKey) && ['p', 's', 'c', 'a'].includes(k);
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
    const block = (e) => e.preventDefault();
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
    return <div className="page narrow"><div className="alert err">{error}</div><button className="btn ghost" style={{ marginTop: 14 }} onClick={onBack}>رجوع للرحلة</button></div>;
  }
  if (!toc) return <div className="center-load"><div className="spinner" /></div>;

  const list = toc.chapters;
  const idx = list.findIndex((c) => c.id === current);
  const go = (d) => { const n = list[idx + d]; if (n) setCurrent(n.id); };

  return (
    <div className="page hb">
      <div className="row between" style={{ marginBottom: 16 }}>
        <div>
          <p className="eyebrow">كتيبك الشخصي</p>
          <h1 style={{ fontSize: 22 }}>مصمم على مستواك في الأبعاد الثلاثة</h1>
        </div>
        <button className="btn ghost sm" onClick={onBack}>رجوع للرحلة</button>
      </div>
      <div className="hb-grid">
        <nav className="hb-toc" aria-label="فهرس الكتيب">
          {DIMENSIONS.map((d) => {
            const items = list.filter((c) => c.dimension === d.key);
            if (!items.length) return null;
            return (
              <div key={d.key} className="hb-group">
                <div className="hb-dim">{d.short} <span className="chip gold">{levelOf(toc.levels[d.key]).title}</span></div>
                {items.map((c) => (
                  <button key={c.id} className={c.id === current ? 'on' : ''} onClick={() => setCurrent(c.id)}>{c.title}</button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="hb-reader" ref={wrapRef}>
          {chapter && <div className="small muted" style={{ marginBottom: 8 }}>{dimOf(chapter.chapter.dimension).title} · الباب {idx + 1} من {list.length}</div>}
          <div className={`hb-sheet${shield ? ' shield' : ''}${loading ? ' loading' : ''}`}>
            <canvas ref={canvasRef} role="img" aria-label={chapter?.chapter.title || 'صفحة الكتيب'} />
            {shield && <div className="hb-cover">عد إلى الصفحة لمتابعة القراءة</div>}
          </div>
          {error && <div className="alert err" style={{ marginTop: 10 }}>{error}</div>}
          <div className="row between" style={{ marginTop: 14 }}>
            <button className="btn ghost sm" disabled={idx <= 0} onClick={() => go(-1)}>السابق</button>
            <button className="btn ghost sm" disabled={idx >= list.length - 1} onClick={() => go(1)}>الباب التالي</button>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>المحتوى ملكية فكرية لـ Milestone Impact، ومرخص لك للقراءة داخل المنصة فقط. كل صفحة تحمل اسمك.</p>
        </div>
      </div>
    </div>
  );
}
