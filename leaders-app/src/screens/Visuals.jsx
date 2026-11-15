// ════════════════════════════════════════════════════════════════
// لوحة المبادرة: اللوحات المرئية المولّدة من فصول الوثيقة
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-15-تصور-اللوحات-المرئية-للمبادرة-v1.md. الرسوم من src/lib/brand/visuals.js،
// والرسم نفسه يُطبع في الوثيقة وملف PDF. لا إدخال هنا: كل رسم يقرأ فصله، والنقر على عنصر يفتح فصله.
// ما ينقص الرسم يُقال بزر يفتح الفصل الذي يُكمله.
import React, { useEffect, useMemo, useState } from 'react';
import { call } from '../api.js';
import { countAr } from '../../../supabase/functions/leaders-api/labels.js';

export default function Visuals({ initiative, sections, onBack, onOpenChapter }) {
  const [doc, setDoc] = useState(null);
  const [lib, setLib] = useState(null);
  const [tab, setTab] = useState('gantt');
  useEffect(() => {
    call('capstone.doc').then(setDoc);
    import('../../../src/lib/brand/visuals.js').then(setLib);
  }, []);
  const model = useMemo(() => (lib && doc?.success ? lib.scheduleModel(doc.doc) : null), [lib, doc]);
  if (!doc || !lib) return <div className="center-load"><div className="spinner" /></div>;
  if (!doc.success) return <div className="alert err">{doc.message}</div>;

  const boards = lib.boardsFor(doc.doc);
  const board = boards.find((b) => b.key === tab) || boards[0];
  const parts = board ? board.parts(doc.doc, model) : [];
  const st = lib.ganttStats(model);
  const chapterOf = (key) => sections.find((s) => s.key === key);
  // النقر على عنصر يفتح فصله
  const onClick = (e) => {
    const k = e.target.closest?.('[data-chapter]')?.getAttribute('data-chapter');
    const s = k && chapterOf(k);
    if (s) onOpenChapter(s.id);
  };
  const fix = board && chapterOf(board.chapter);
  return (
    <div className="viz-page">
      <button className="link small" onClick={onBack}>→ وثيقة مبادرتك</button>
      <header className="sh-hero">
        <span className="book-eyebrow">لوحة المبادرة</span>
        <h1>{initiative || 'مبادرتك'} مرئية</h1>
        <p>رسوم تُولَّد من فصولك كما كتبتها، فتتحدث كلما عدّلت فصلًا، وتُطبع في الوثيقة الاحترافية وملفها. مرّر المؤشر على أي عنصر لتفاصيله، وانقره لتفتح فصله.</p>
      </header>
      <div className="viz-stats" role="list">
        <div role="listitem"><b>{st.activities}</b><span>نشاطًا في الجدول</span></div>
        <div role="listitem"><b>{st.cycle ? '·' : st.finish}</b><span>يومًا على المسار الحرج</span></div>
        <div role="listitem" className={st.critical ? 'crit' : ''}><b>{st.cycle ? '·' : st.critical}</b><span>نشاطًا حرجًا</span></div>
        <div role="listitem" className={st.broken || st.cycle ? 'bad' : 'ok'}><b>{st.cycle ? 'حلقة' : st.broken}</b><span>{st.cycle ? 'في العلاقات' : 'مخالفة للعلاقات'}</span></div>
      </div>
      <div className="book-tablist sh-tabs viz-tabs" role="tablist" aria-label="اللوحات">
        {boards.map((b) => <button key={b.key} role="tab" aria-selected={board?.key === b.key} className={board?.key === b.key ? 'on' : ''} onClick={() => setTab(b.key)}>{b.title}</button>)}
      </div>
      {board && (
        <section className="card viz-card" aria-label={board.title}>
          {parts.map((v, i) => (
            <div key={i} className="viz-part">
              {v.title && <h3>{v.title}</h3>}
              {v.missing.length > 0 && (
                <div className="viz-missing" role="status">
                  <b>{v.svg ? 'ليكتمل الرسم:' : 'لا يظهر الرسم بعد:'}</b>
                  <ul>{v.missing.map((m) => <li key={m}>{m}</li>)}</ul>
                  {fix && <button type="button" className="btn ghost sm" onClick={() => onOpenChapter(fix.id)}>افتح «{fix.title}»</button>}
                </div>
              )}
              {v.svg && (
                <>
                  {/* الرسم مولَّد من نص الفصول بعد تهريبه (visuals.js esc) */}
                  <div className="viz-scroll" onClick={onClick} dangerouslySetInnerHTML={{ __html: v.svg }} />
                  {v.legend && <div className="viz-legend" dangerouslySetInnerHTML={{ __html: v.legend }} />}
                </>
              )}
            </div>
          ))}
          {board.key === 'network' && st.path.length > 0 && <p className="small muted">المسار الحرج: {st.path.join(' ← ')}. {countAr(st.path.length, 'نشاط واحد', 'نشاطان', 'أنشطة', 'نشاطًا')} أي تأخير في أحدها يؤخر المبادرة كلها.</p>}
        </section>
      )}
    </div>
  );
}

/** بطاقة في صفحة المبادرة تفتح اللوحة */
export function VisualsCard({ onOpen }) {
  return (
    <section className="card viz-entry" aria-labelledby="viz-entry-h">
      <h3 id="viz-entry-h">لوحة المبادرة المرئية</h3>
      <p className="muted small">جانت بعلاقاته ومساره الحرج، والشبكة، وشجرة التجزئة، والمعالم، والإنفاق، والمخاطر، وأصحاب المصلحة، والمنافع، والمسؤوليات: مولَّدة من فصولك وتُطبع في الوثيقة.</p>
      <button type="button" className="btn ghost block" onClick={onOpen}>افتح اللوحة</button>
    </section>
  );
}
