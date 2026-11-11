// ════════════════════════════════════════════════════════════════
// لوحة المختبر (نوع الخطوة board): صفوف × أعمدة، والخلية تقبل عدة بطاقات
// ════════════════════════════════════════════════════════════════
// المكوّن المشترك بين المختبر عند المشارك ومعاينة الإدارة بأي مستوى. ثلاث طرق للوضع على حالة واحدة:
//   1. النقر واللمس (الأساس): تنقر البطاقة فتُحدَّد، ثم تنقر الخانة.
//   2. لوحة المفاتيح (WCAG 2.1.1): Tab إلى البطاقة، ومسافة أو Enter لالتقاطها، والأسهم بين الخانات
//      (السهم الأيمن نحو البدء لأن الاتجاه من اليمين)، ومسافة أو Enter للإفلات، وEsc للإلغاء.
//   3. السحب بالمؤشر (تحسين فوق النقر، المرحلة الثانية).
// وتُعلن كل حركة في aria-live. على الجوال (دون 720px) تُطوى الصفوف: كل مجال سطر يُفتح فتظهر خلاياه.
// المكوّن لا يعرف الحل: السقالة (العدّادات والصفوف المحلولة والرقم) تأتي من الخادم بحسب المستوى.
import React, { useEffect, useMemo, useRef, useState } from 'react';

export const BOARD_LEVEL_AR = { beginner: 'تأسيسي', intermediate: 'متوسط', advanced: 'احترافي' };

// وصف السقالة للمشارك من السقالة نفسها (لا من اسم المستوى)، فلا يَعِد بما لا يُعرض
export function scaffoldText(sc, withHints = false) {
  const parts = [];
  if (sc.solved_rows?.length) parts.push(sc.solved_rows.length === 1 ? 'صف محلول مثالًا' : 'صفوف محلولة مثالًا');
  if (sc.show_code) parts.push('رقم كل بطاقة ظاهر، والرقم بعد النقطة رقم المجال');
  if (sc.counts === 'cell') parts.push('عدد البطاقات المطلوب في كل خانة');
  if (sc.counts === 'col') parts.push('عدد البطاقات في كل عمود');
  if (sc.feedback === 'instant') parts.push('تُفحص كل بطاقة عند وضعها');
  if (sc.feedback === 'check2') parts.push(`«افحص لوحتي» ${sc.checks === 2 ? 'مرتين' : `${sc.checks} مرات`} لعدد الأخطاء لا أماكنها`);
  const base = parts.length ? `${parts.join('، و')}.` : 'بلا عدّادات ولا أرقام ولا فحص قبل الإرسال.';
  return withHints ? `${base} والتلميح متاح لأي بطاقة إن احتجته، ويُذكر عدده في النتيجة.` : base;
}

function useNarrow(q = '(max-width: 720px)') {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches;
  const [m, setM] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener?.('change', f);
    return () => mq.removeEventListener?.('change', f);
  }, [q]);
  return m;
}

// موضع كل بطاقة: المحلولة من السقالة، والباقية من إجابة المشارك
export function boardPositions(step, value) {
  return { ...(value || {}), ...(step.scaffold?.solved || {}) };
}
// هل وُضعت كل البطاقات التي على المشارك وضعها؟
export function boardReady(step, value) {
  const solved = step.scaffold?.solved || {};
  return step.cards.every((c) => solved[c.id] || (Array.isArray(value?.[c.id]) && value[c.id].length === 2));
}
const same = (p, q) => !!p && !!q && p[0] === q[0] && p[1] === q[1];
// درجة البطاقة بعد التصحيح: 1 في خانتها، ونصف لمحور واحد، وصفر
export function cardScore(step, pos, sol) {
  if (!pos || !sol) return 0;
  if (same(pos, sol)) return 1;
  const two = step.rows.length > 1 && step.cols.length > 1;
  return two && (pos[0] === sol[0] || pos[1] === sol[1]) ? 0.5 : 0;
}

function CardButton({ card, sel, tone, locked, onPick, onKey, small, onPointerDown, dragging }) {
  return (
    <button type="button" className={`lb-card${small ? ' sm' : ''}${sel ? ' on' : ''}${tone ? ` is-${tone}` : ''}${locked ? ' locked' : ''}${dragging ? ' dragging' : ''}`}
      aria-pressed={locked ? undefined : sel} aria-disabled={locked || undefined}
      onClick={(e) => { e.stopPropagation(); if (!locked) onPick(card.id); }} onKeyDown={onKey} onPointerDown={locked ? undefined : onPointerDown}
      data-card={card.id}>
      {card.code && <b className="lb-code" dir="ltr">{card.code}</b>}
      <span>{card.label}</span>
      {tone === 'ok' && <span className="lb-sr"> (صحيحة)</span>}
      {tone === 'half' && <span className="lb-sr"> (نصف صحيحة)</span>}
      {tone === 'bad' && <span className="lb-sr"> (خطأ)</span>}
      {tone === 'revealed' && <span className="lb-sr"> (كُشفت بالتلميح)</span>}
    </button>
  );
}

// زر التلميح بحسب الدرجة التالية في السلّم
export const HINT_NEXT_AR = ['تلميح: سؤال موجه', 'تلميح: أضئ الصف', 'تلميح: أضئ العمود', 'اكشف خانتها (درجتها صفر)'];
const DRAG_PX = 6;
const EDGE_PX = 64;

/**
 * @param {{ step: any, value?: Record<string, string[]>, onChange?: (v: any, meta?: any) => void, result?: any, marks?: Record<string, string>, hints?: Record<string, any>, onHint?: ((id: string) => void) | null, readOnly?: boolean, children?: any }} props
 * marks: علامات فورية لبطاقات بعينها (ok/bad) من فحص الخادم، للمستوى التأسيسي
 * hints: تلميحات الخادم لكل بطاقة { degree, question_ar, row, col, revealed }، والمكشوفة مقفلة في خانتها
 */
export default function LabBoard({ step, value, onChange = () => {}, result = null, marks = {}, hints = {}, onHint = null, readOnly = false, children = null }) {
  const narrow = useNarrow();
  const { rows, cols, cards } = step;
  const sc = step.scaffold || {};
  const solved = sc.solved || {};
  const done = !!result || readOnly;
  const isLocked = (id) => !!solved[id] || !!hints[id]?.revealed;
  const [sel, setSel] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const drag = useRef(null);
  const suppress = useRef(false);
  const [cur, setCur] = useState([0, 0]);
  const [openRow, setOpenRow] = useState(() => rows.find((r) => !(sc.solved_rows || []).includes(r.id))?.id || rows[0]?.id);
  const [live, setLive] = useState('');
  const [showSol, setShowSol] = useState(false);
  const cellRefs = useRef({});
  const trayRef = useRef(null);
  const focusCell = useRef(false);

  const label = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, c.label])), [cards]);
  const src = showSol && result ? result.solution : boardPositions(step, value);
  const inCell = (r, c) => cards.filter((k) => same(src[k.id], [r.id, c.id]));
  const tray = done ? [] : cards.filter((k) => !src[k.id]);
  const cellName = (r, c) => `${c.label} × ${r.label}`;

  useEffect(() => {
    if (!focusCell.current) return;
    focusCell.current = false;
    cellRefs.current[`${cur[0]}:${cur[1]}`]?.focus();
  }, [cur, openRow]);

  const pick = (id) => {
    if (suppress.current) return;
    if (done || isLocked(id)) return;
    const next = sel === id ? null : id;
    setSel(next);
    if (next) {
      const p = src[id];
      setLive(`حُددت «${label[id]}»${p ? `، وهي الآن في ${cellName(rows.find((r) => r.id === p[0]), cols.find((c) => c.id === p[1]))}` : ''}. اختر خانتها بالأسهم ثم مسافة، أو انقرها.`);
    } else setLive('أُلغي التحديد.');
  };
  const placeCard = (id, ri, ci) => {
    if (done || !id || isLocked(id)) return;
    const r = rows[ri]; const c = cols[ci];
    const v = { ...(value || {}), [id]: [r.id, c.id] };
    onChange(v, { card: id, to: [r.id, c.id] });
    const after = boardPositions(step, v);
    const n = cards.filter((k) => same(after[k.id], [r.id, c.id])).length;
    setLive(`«${label[id]}»: في ${cellName(r, c)}. عدد البطاقات في الخانة ${n}.`);
    setSel(null);
  };
  const place = (ri, ci) => { if (!suppress.current) placeCard(sel, ri, ci); };

  // السحب بالمؤشر (الفأرة والقلم): تحسين فوق النقر. اللمس يبقى بالنقر لأن السحب يعطّل تمرير الصينية.
  // عتبة 6px تميز السحب من النقر، وظل البطاقة يتبع المؤشر، والخانة المستهدفة تُبرز، والصفحة تُمرَّر قرب الحافتين.
  const endDrag = useRef(() => {});
  useEffect(() => () => endDrag.current(), []);
  const startDrag = (id) => (e) => {
    if (done || e.pointerType === 'touch' || e.button !== 0 || isLocked(id)) return;
    drag.current = { id, x0: e.clientX, y0: e.clientY, active: false, ghost: null };
    const cellAt = (ev) => document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-cell]');
    const move = (ev) => {
      const d = drag.current;
      if (!d) return;
      if (!d.active) {
        if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < DRAG_PX) return;
        d.active = true;
        d.ghost = document.createElement('div');
        d.ghost.className = 'lb-card lb-ghost';
        d.ghost.setAttribute('aria-hidden', 'true');
        d.ghost.textContent = label[d.id];
        document.body.appendChild(d.ghost);
        setDragId(d.id); setSel(null);
      }
      ev.preventDefault();
      d.ghost.style.left = `${ev.clientX}px`; d.ghost.style.top = `${ev.clientY}px`;
      setOver(cellAt(ev)?.getAttribute('data-cell') || null);
      if (ev.clientY < EDGE_PX) window.scrollBy(0, -14);
      else if (ev.clientY > window.innerHeight - EDGE_PX) window.scrollBy(0, 14);
    };
    const up = (ev) => {
      const d = drag.current;
      endDrag.current();
      if (!d?.active) return;
      suppress.current = true;
      setTimeout(() => { suppress.current = false; }, 0);
      const at = cellAt(ev)?.getAttribute('data-cell');
      if (at) { const [ri, ci] = at.split(':').map(Number); placeCard(d.id, ri, ci); }
    };
    endDrag.current = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      drag.current?.ghost?.remove();
      drag.current = null;
      setDragId(null); setOver(null);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  const askHint = (id) => {
    if (!onHint) return;
    onHint(id);
  };
  // إعلان التلميح حين يصل من الخادم
  const hintKey = sel && hints[sel] ? `${sel}:${hints[sel].degree}` : '';
  useEffect(() => {
    if (!hintKey) return;
    const h = hints[sel];
    const rl = h.row && rows.find((r) => r.id === h.row)?.label;
    const cl = h.col && cols.find((c) => c.id === h.col)?.label;
    setLive(h.revealed ? `كُشفت خانة «${label[sel]}»: ${cl} × ${rl}.` : cl ? `تلميح: ${cl} × ${rl}.` : rl ? `تلميح: صفها ${rl}.` : `تلميح: ${h.question_ar}`);
    if (h.revealed) setSel(null);
  }, [hintKey]);
  const unplace = (id) => {
    const v = { ...(value || {}) };
    delete v[id];
    onChange(v, { card: id, to: null });
    setLive(`أُعيدت «${label[id]}» إلى الصينية.`);
    setSel(null);
  };

  // لوحة المفاتيح: الالتقاط من البطاقة ينقل التركيز إلى الخانة الحالية
  const cardKey = (id) => (e) => {
    if (done) return;
    if (e.key === 'Escape' && sel) { e.preventDefault(); setSel(null); setLive('أُلغي التحديد.'); return; }
    if ((e.key === 'Enter' || e.key === ' ') && !sel) {
      e.preventDefault(); e.stopPropagation();
      pick(id);
      const p = src[id];
      const ri = p ? rows.findIndex((r) => r.id === p[0]) : Math.max(0, rows.findIndex((r) => r.id === openRow));
      const ci = p ? cols.findIndex((c) => c.id === p[1]) : 0;
      focusCell.current = true;
      if (narrow) setOpenRow(rows[ri].id);
      setCur([ri, ci]);
    }
  };
  const cellKey = (ri, ci) => (e) => {
    if (done) return;
    const moves = { ArrowRight: [0, -1], ArrowLeft: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    if (narrow) { moves.ArrowUp = [0, -1]; moves.ArrowDown = [0, 1]; moves.ArrowRight = [-1, 0]; moves.ArrowLeft = [1, 0]; }
    if (moves[e.key]) {
      e.preventDefault();
      let [r, c] = [ri + moves[e.key][0], ci + moves[e.key][1]];
      if (narrow && (c < 0 || c >= cols.length)) { r += c < 0 ? -1 : 1; c = c < 0 ? cols.length - 1 : 0; }
      r = Math.max(0, Math.min(rows.length - 1, r)); c = Math.max(0, Math.min(cols.length - 1, c));
      focusCell.current = true;
      if (narrow) setOpenRow(rows[r].id);
      setCur([r, c]);
      setLive(`${cellName(rows[r], cols[c])}، عدد البطاقات فيها ${inCell(rows[r], cols[c]).length}.`);
      return;
    }
    if (e.target !== e.currentTarget) return;
    if ((e.key === 'Enter' || e.key === ' ') && sel) { e.preventDefault(); place(ri, ci); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      const was = sel;
      setSel(null); setLive('أُلغي التحديد.');
      (trayRef.current?.querySelector(`[data-card="${was}"]`) || trayRef.current?.querySelector('button'))?.focus();
    }
  };

  const toneOf = (id) => {
    if (hints[id]?.revealed && !showSol) return 'revealed';
    if (result && !showSol) {
      const s = cardScore(step, src[id], result.solution?.[id]);
      return solved[id] ? null : s === 1 ? 'ok' : s === 0.5 ? 'half' : 'bad';
    }
    return marks[id] || null;
  };
  const selHint = sel ? hints[sel] : null;
  const placedInCol = (c) => cards.filter((k) => src[k.id]?.[1] === c.id).length;
  const selCard = sel && cards.find((k) => k.id === sel);

  return (
    <div className={`lb${narrow ? ' narrow' : ''}${done ? ' done' : ''}`}>
      {!done && (
        <div className="lb-trayzone">
          <div className="lb-tray-head"><b>البطاقات المتبقية</b><span className="lb-left">{tray.length}</span></div>
          <div className="lb-tray" ref={trayRef} role="group" aria-label={`البطاقات المتبقية: ${tray.length}`}>
            {tray.length ? tray.map((k) => <CardButton key={k.id} card={k} sel={sel === k.id} tone={marks[k.id]} onPick={pick} onKey={cardKey(k.id)} onPointerDown={startDrag(k.id)} dragging={dragId === k.id} />)
              : <span className="lb-empty">وُضعت كل البطاقات. انقر بطاقة على اللوحة لتحريكها.</span>}
          </div>
          {selCard && (
            <p className="lb-status">
              <span>المحددة: «{selCard.label}». اختر خانتها، أو بالأسهم ثم مسافة.</span>
              {src[sel] && !solved[sel] && <button type="button" className="lb-back" onClick={() => unplace(sel)}>↩ أعدها إلى الصينية</button>}
              {onHint && <button type="button" className="lb-back lb-hintbtn" onClick={() => askHint(sel)}>{HINT_NEXT_AR[Math.min(3, selHint?.degree || 0)]}</button>}
              <button type="button" className="lb-back" onClick={() => { setSel(null); setLive('أُلغي التحديد.'); }}>إلغاء</button>
            </p>
          )}
          {selHint?.question_ar && !selHint.revealed && <p className="lb-hintq" role="note"><b>سؤال موجه:</b> {selHint.question_ar}</p>}
          {children}
        </div>
      )}
      <div className="lb-scroll">
        <div role="grid" aria-label={step.title_ar || 'اللوحة'} aria-rowcount={rows.length + 1} className="lb-grid"
          style={narrow ? undefined : { gridTemplateColumns: `minmax(118px, 1.05fr) repeat(${cols.length}, minmax(104px, 1fr))` }}>
          <div role="row" className="lb-row lb-headrow">
            <div role="columnheader" className="lb-corner">{step.row_label_ar}</div>
            {cols.map((c) => (
              <div key={c.id} role="columnheader" className="lb-colhead">
                <span>{c.label}</span>
                {sc.counts === 'col' && <small className="lb-count">{placedInCol(c)}/{sc.col_counts?.[c.id] || 0}</small>}
              </div>
            ))}
          </div>
          {rows.map((r, ri) => {
            const isSolved = (sc.solved_rows || []).includes(r.id);
            const open = !narrow || openRow === r.id;
            const rowPlaced = cards.filter((k) => src[k.id]?.[0] === r.id).length;
            return (
              <div key={r.id} role="row" className={`lb-row${isSolved ? ' solved' : ''}${open ? ' open' : ''}`}>
                <div role="rowheader" className={`lb-rowhead${selHint?.row === r.id ? ' hint' : ''}`}>
                  {narrow ? (
                    <button type="button" className="lb-rowtoggle" aria-expanded={open} onClick={() => setOpenRow(open ? null : r.id)}>
                      {r.n ? <b dir="ltr">{r.n}.</b> : null}<span>{r.label}</span>{isSolved ? <em>مثال محلول</em> : <small>{rowPlaced}</small>}
                    </button>
                  ) : (<>{r.n ? <b dir="ltr">{r.n}.</b> : null}<span>{r.label}</span>{isSolved && <em>مثال محلول</em>}</>)}
                </div>
                {open && cols.map((c, ci) => {
                  const here = inCell(r, c);
                  const want = sc.cell_counts?.[r.id]?.[c.id] || 0;
                  const target = !!sel && !done;
                  return (
                    <div key={c.id} role="gridcell" ref={(el) => { cellRefs.current[`${ri}:${ci}`] = el; }} data-cell={`${ri}:${ci}`}
                      tabIndex={done ? -1 : cur[0] === ri && cur[1] === ci ? 0 : -1}
                      aria-label={`${cellName(r, c)}${sc.counts === 'cell' ? `، ${here.length} من ${want}` : ''}`}
                      className={`lb-cell${target || dragId ? ' target' : ''}${isSolved ? ' solved' : ''}${over === `${ri}:${ci}` ? ' over' : ''}${selHint?.row === r.id && (!selHint.col || selHint.col === c.id) ? ' hint' : ''}`}
                      onClick={() => place(ri, ci)} onKeyDown={cellKey(ri, ci)} onFocus={() => setCur([ri, ci])}>
                      {narrow && <small className="lb-cellcol">{c.label}</small>}
                      {sc.counts === 'cell' && <small className={`lb-count${want && here.length === want ? ' full' : ''}`}>{here.length}/{want}</small>}
                      {here.map((k) => (
                        <CardButton key={k.id} card={k} small sel={sel === k.id} tone={toneOf(k.id)} locked={isLocked(k.id) || done}
                          onPick={(id) => { if (sel && sel !== id) place(ri, ci); else pick(id); }} onKey={cardKey(k.id)}
                          onPointerDown={startDrag(k.id)} dragging={dragId === k.id} />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {result && (
        <div className="lb-solbar">
          <button type="button" className="lb-back" aria-pressed={showSol} onClick={() => setShowSol(!showSol)}>{showSol ? 'اعرض لوحتي' : 'اعرض اللوحة الصحيحة'}</button>
          <span className="lb-legend"><i className="ok" />في خانتها <i className="half" />محور واحد صحيح <i className="bad" />خطأ{Object.values(hints).some((h) => h?.revealed) && <><i className="revealed" />كُشفت بالتلميح</>}</span>
        </div>
      )}
      <div className="lb-sr lb-live" aria-live="polite">{live}</div>
    </div>
  );
}

// ── الخريطة الحرارية: أي الأعمدة خلطت بينها، وأي الصفوف أكثر خطأ (من confusion في نتيجة الخادم) ──
export function BoardInsight({ step, value, result }) {
  if (!result?.confusion) return null;
  const { cols: cm, rows: re } = result.confusion;
  const colLabel = Object.fromEntries(step.cols.map((c) => [c.id, c.label]));
  const pairs = [];
  for (const e of step.cols) for (const g of step.cols) if (e.id !== g.id && cm[e.id]?.[g.id]) pairs.push({ e: e.id, g: g.id, n: cm[e.id][g.id] });
  pairs.sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...step.cols.flatMap((e) => step.cols.map((g) => (e.id === g.id ? 0 : cm[e.id]?.[g.id] || 0))));
  const names = (p) => step.cards.filter((k) => result.solution?.[k.id]?.[1] === p.e && value?.[k.id]?.[1] === p.g).map((k) => k.label);
  const rowsBad = step.rows.filter((r) => re?.[r.id]).sort((a, b) => re[b.id] - re[a.id]);
  const rmax = Math.max(1, ...rowsBad.map((r) => re[r.id]));
  return (
    <div className="lb-insight">
      <p className="lb-score-line">في خانتها {result.right} من {result.total}{result.half ? `، ومحور واحد صحيح في ${result.half}` : ''}{result.revealed ? `، وكُشف بالتلميح ${result.revealed}` : ''}.</p>
      {pairs.length > 0 ? (
        <>
          <ul className="lb-mixups">
            {pairs.slice(0, 3).map((p) => (
              <li key={`${p.e}${p.g}`}>خلطت بين {colLabel[p.e]} و{colLabel[p.g]} في {p.n === 1 ? 'بطاقة واحدة' : p.n === 2 ? 'بطاقتين' : `${p.n} بطاقات`}: {names(p).join('، ')}.</li>
            ))}
          </ul>
          <div className="lb-heat-wrap">
            <table className="lb-heat">
              <caption>المجموعة الصحيحة (صفوف) والمجموعة التي اخترتها (أعمدة)</caption>
              <thead><tr><th scope="col"><span className="lb-sr">الصحيحة</span></th>{step.cols.map((c) => <th key={c.id} scope="col">{c.label}</th>)}</tr></thead>
              <tbody>
                {step.cols.map((e) => (
                  <tr key={e.id}>
                    <th scope="row">{e.label}</th>
                    {step.cols.map((g) => {
                      const n = cm[e.id]?.[g.id] || 0;
                      const diag = e.id === g.id;
                      return <td key={g.id} className={diag ? 'diag' : ''} style={!diag && n ? { '--heat': (0.15 + 0.85 * n / max).toFixed(2) } : undefined}>{n || ''}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="small">لم تخلط بين المجموعات: كل بطاقة في عمودها الصحيح.</p>}
      {rowsBad.length > 0 && (
        <div className="lb-rowbars" aria-label="الأخطاء في كل مجال">
          {rowsBad.map((r) => (
            <div key={r.id} className="lb-rowbar"><span>{r.label}</span><i style={{ width: `${(100 * re[r.id]) / rmax}%` }} /><b>{re[r.id]}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}
