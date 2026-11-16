// ════════════════════════════════════════════════════════════════
// خريطة المبادرة: معناها، وفهرس فصولها بمراحل بنائها، والتنقل بين الفصول، والإحالة إلى الكتاب
// ════════════════════════════════════════════════════════════════
// المحتوى كله من anatomy.json (مصدر واحد يراجعه الخبير عند الطلب)، وحالة الفصول من الخادم كما هي.
// التصور: docs/content/2026-11-15-تصور-فهم-المبادرة-وإخراج-وثيقتها-v1.md
import React, { useState } from 'react';
import { MEANING, chapterInfo, groupByPhase, phaseOf, FEEDS } from '../../../supabase/content/initiative-guide/v1/anatomy.js';
import { countAr } from '../../../supabase/functions/leaders-api/labels.js';
import { dimOf } from '../labels.js';
import { Annotated } from '../Term.jsx';

// حالة الفصل بلون واحد في الشريط والقائمة: مكتمل، أو قيد العمل، أو معاد، أو لم يبدأ
export const chapterTone = (s) => (s.status === 'returned' ? 'bad' : s.complete ? 'ok' : s.status === 'draft' || s.status === 'submitted' ? 'warn' : 'idle');
const TONE_AR = { ok: 'مكتمل', warn: 'قيد العمل', bad: 'أُعيد إليك', idle: 'لم يبدأ' };

/** الفصل التالي المقترح: أول فصل معاد، وإلا أول فصل لم يكتمل بترتيب الوثيقة */
export const nextChapter = (sections) => (sections || []).find((s) => s.status === 'returned') || (sections || []).find((s) => !s.complete) || null;

/** إحالة الفصل في الكتاب بصيغة يفهمها الكتاب، أو null */
export function bookRef(section) {
  const h = chapterInfo(section?.key)?.handbook;
  return h ? { ...h, from: section.title, chapter_id: section.id } : null;
}

// ── ما المبادرة؟ مفتوحة لمن لم يسمّ مبادرته بعد، ومطوية بعد ذلك ──
export function Meaning({ scope, open, onHandbook }) {
  return (
    <details className="card im-meaning" open={open} data-meaning>
      <summary><span className="mg-cap">قبل أن تبدأ</span><b>{MEANING.title}</b><small className="muted">المبادرة والمشروع والبرنامج والمحفظة، ومكونات وثيقتك</small></summary>
      <p className="im-def">{MEANING.definition}</p>
      <p className="muted small">{MEANING.in_program}</p>
      <div className="im-levels" role="list">
        {MEANING.levels.map((l) => (
          <div key={l.key} role="listitem" className={`im-level${l.key === scope ? ' mine' : ''}${l.key === 'initiative' ? ' lead' : ''}`}>
            <span className="im-q">{l.question}</span>
            <b>{l.title}{l.key === scope && <span className="chip gold">نطاقك</span>}</b>
            <p>{l.is}</p>
            <small>مثال: {l.example}</small>
          </div>
        ))}
      </div>
      <div className="im-not">
        {MEANING.not.map((n) => <p key={n.title}><b>{n.title}.</b> {n.is}</p>)}
      </div>
      <p className="im-test"><b>اختبار سريع:</b> {MEANING.test}</p>
      <p className="small">{MEANING.components}</p>
      {onHandbook && <button type="button" className="btn ghost sm" onClick={() => onHandbook({ ...MEANING.handbook, from: MEANING.title })}>اقرأ الطبقات الثلاث في الكتاب</button>}
    </details>
  );
}

// ── فهرس الوثيقة: رؤية شاملة بشريط الفصول، والتالي المقترح، والمراحل بفصولها، وتصفية الناقص ──
export function Navigator({ sections, busy, onOpen, onHandbook }) {
  const [only, setOnly] = useState('all');
  const done = sections.filter((s) => s.complete).length;
  const next = nextChapter(sections);
  const groups = groupByPhase(sections).map((g) => ({ ...g, shown: only === 'all' ? g.items : g.items.filter((s) => !s.complete) }));
  return (
    <section className="card cp-sections im-nav" data-tour="capstone-sections" aria-labelledby="im-nav-h">
      <div className="im-nav-head">
        <h2 id="im-nav-h">فهرس الوثيقة</h2>
        <span className="muted small">اكتمل {done} من {countAr(sections.length, 'فصل واحد', 'فصلين', 'فصول', 'فصلًا')}</span>
      </div>
      {/* الشريط: كل فصل قطعة بلون حالته، تنقر فتفتحه. رؤية الوثيقة كلها في سطر. اختصار للفأرة واللمس، والقائمة تحته
          هي طريق لوحة المفاتيح وقارئ الشاشة بالفصول نفسها، فلا يتكرر كل فصل مرتين في الأسماء المقروءة */}
      <div className="im-strip" aria-hidden="true">
        {sections.map((s, i) => {
          const t = chapterTone(s);
          return <span key={s.id} className={`im-seg ${t}`} onClick={() => !busy && onOpen(s.id)} title={`${i + 1}. ${s.title}: ${TONE_AR[t]}`} />;
        })}
      </div>
      <p className="sr-only">اكتمل {done} من {sections.length}، وقائمة الفصول أدناه بحالة كل فصل.</p>
      <div className="im-legend small muted">{Object.entries(TONE_AR).map(([k, t]) => <span key={k}><i className={`im-dot ${k}`} />{t}</span>)}</div>

      {next && (
        <div className="im-next">
          <div className="grow">
            <small>{next.status === 'returned' ? 'أعاده المستشار إليك' : 'التالي المقترح'}</small>
            <b>{sections.indexOf(next) + 1}. {next.title}</b>
            {chapterInfo(next.key)?.why && <span className="muted small">{chapterInfo(next.key).why}</span>}
          </div>
          <button type="button" className="btn gold sm" disabled={busy} onClick={() => onOpen(next.id)}>{next.status === 'draft' ? 'تابع' : 'افتح'}</button>
        </div>
      )}

      <div className="im-filter" role="tablist" aria-label="عرض الفصول">
        {[['all', 'كل الفصول'], ['todo', `الناقص فقط (${sections.length - done})`]].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={only === k} className={only === k ? 'on' : ''} onClick={() => setOnly(k)}>{t}</button>
        ))}
      </div>

      {groups.map((g, gi) => {
        const gd = g.items.filter((s) => s.complete).length;
        if (!g.shown.length) return null;
        return (
          <div key={g.key} className="im-phase" data-phase={g.key}>
            <header>
              <span className="im-ph-n">{gi + 1}</span>
              <div className="grow"><b>{g.title}</b>{g.lead && <small className="muted">{g.lead}</small>}</div>
              <span className={`chip ${gd === g.items.length ? 'ok' : ''}`}>{gd}/{g.items.length}</span>
            </header>
            <ol className="cp-list">
              {g.shown.map((s) => {
                const t = chapterTone(s);
                const info = chapterInfo(s.key);
                const feeds = (info?.feeds || []).map((f) => FEEDS[f]).filter(Boolean);
                const ref = bookRef(s);
                return (
                  <li key={s.id} className="im-row">
                    <button className={`cp-sec${s.complete ? ' done' : ''}`} disabled={busy} onClick={() => onOpen(s.id)}>
                      <span className="cp-n">{String(s.n).padStart(2, '0')}</span>
                      <span className="model-icon sm">{s.icon}</span>
                      <span className="cp-t">
                        <b id={`im-t-${s.id}`}>{s.title}</b>
                        <small>{info?.why || dimOf(s.dimension).short}</small>
                        <small className="im-meta">{dimOf(s.dimension).short}{!s.complete && s.missing ? ` · ${countAr(s.missing, 'حقل واحد ناقص', 'حقلان ناقصان', 'حقول ناقصة', 'حقلًا ناقصًا')}` : ''}{feeds.length ? ` · يغذي ${feeds.join('، ')}` : ''}</small>
                      </span>
                      <span className={`chip ${t === 'idle' ? '' : t}`}>{t === 'warn' && s.status === 'submitted' ? 'مسلّم' : TONE_AR[t]}</span>
                    </button>
                    {ref && onHandbook && <button type="button" className="link small im-book" onClick={() => onHandbook(ref)} aria-describedby={`im-t-${s.id}`}>في الكتاب</button>}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
      {only === 'todo' && done === sections.length && <p className="muted small">اكتملت الفصول كلها.</p>}
    </section>
  );
}

// ── داخل الفصل: أين أنا في الوثيقة، والسابق والتالي، وما يشرحه في الكتاب ──
export function ChapterNav({ sections, id, onOpen, onHandbook }) {
  const i = sections.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const s = sections[i], prev = sections[i - 1], next = sections[i + 1];
  const ph = phaseOf(s.key);
  const info = chapterInfo(s.key);
  const ref = bookRef(s);
  return (
    <nav className="im-chnav" aria-label="التنقل بين فصول الوثيقة">
      <div className="im-chnav-where">
        <small>الفصل {i + 1} من {sections.length}{ph ? ` · ${ph.title}` : ''}</small>
        {info?.why && <span><Annotated text={info.why} /></span>}
      </div>
      <div className="row">
        {prev && <button type="button" className="btn ghost sm" onClick={() => onOpen(prev.id)} title={prev.title}>→ السابق</button>}
        {ref && onHandbook && <button type="button" className="btn ghost sm" onClick={() => onHandbook(ref)}>اقرأ في الكتاب: {ref.look_for}</button>}
        {next && <button type="button" className="btn ghost sm" onClick={() => onOpen(next.id)} title={next.title}>التالي ←</button>}
      </div>
    </nav>
  );
}
