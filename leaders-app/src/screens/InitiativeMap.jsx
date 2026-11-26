// ════════════════════════════════════════════════════════════════
// خريطة المبادرة: معناها، وفهرس فصولها بمراحل بنائها، والتنقل بين الفصول، والإحالة إلى الكتاب
// ════════════════════════════════════════════════════════════════
// المحتوى كله من anatomy.json (مصدر واحد يراجعه الخبير عند الطلب)، وحالة الفصول من الخادم كما هي.
// التصور: docs/content/2026-11-15-تصور-فهم-المبادرة-وإخراج-وثيقتها-v1.md
import React, { useState } from 'react';
import '../spine.css';
import { MEANING, chapterInfo } from '../../../supabase/content/initiative-guide/v1/anatomy.js';
import { CHAPTER_STATUS_AR, SUBMISSION_STATUS } from '../../../supabase/functions/leaders-api/labels.js';
import { CHECK_CHAPTERS } from '../../../supabase/functions/leaders-api/stuck.js';
import { changedSinceRead, chapterState, checksOn, readByExpert, spineSummary, STATE_AR, STATE_ORDER, unitsFor, unitState } from '../../../supabase/content/initiative-guide/v1/spine.js';

// حالة الفصل بلون واحد في الشريط والقائمة: مكتمل، أو قيد العمل، أو معاد، أو لم يبدأ
// optional: فصل لا حقل مطلوبًا فيه للمشارك (لا يُحسب في الجاهزية)، فلا يقال عنه «مكتمل»
export const chapterTone = (s) => (s.status === 'returned' ? 'bad' : s.optional ? 'opt' : s.complete ? 'ok' : s.status === 'draft' || s.status === 'submitted' ? 'warn' : 'idle');
// الحالات من المصدر الواحد (labels.js)، و«مكتمل» و«اختياري» وصف للجاهزية لا حالة تقديم
const TONE_AR = { ok: 'مكتمل', warn: CHAPTER_STATUS_AR.draft, bad: SUBMISSION_STATUS.returned, idle: CHAPTER_STATUS_AR.empty, opt: 'اختياري' };
/** الفصول التي تُحسب في الاكتمال والجاهزية */
export const countedChapters = (sections) => (sections || []).filter((s) => !s.optional);

/** الفصل التالي المقترح: أول فصل معاد، وإلا أول فصل لم يكتمل بترتيب الوثيقة */
export const nextChapter = (sections) => (sections || []).find((s) => s.status === 'returned') || (sections || []).find((s) => !s.complete && !s.optional) || null;

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

// ── خط الوثيقة («الوثيقة الحية»، اعتمده المالك 2026-11-25): مراحل محطات، ووحدات وفصول بلون حالتها، وبوابات على الخط ──
// جانبي ثابت على الحاسب (يمين الصفحة)، وشريط علوي على الجوال يفتح لوحة منزلقة. الخط نفسه في الصفحة وداخل الفصل
// وفي شاشة مراجعة الخبير (expert: «جديد» على ما تغيّر بعد قراءته). الوحدات بمستوى إطار كل فصل (spine.js unitsFor)
const GATE_AR = { card: 'اعتماد البطاقة', submit: 'تقديم الوثيقة', sponsor: 'تأييد الراعي', final: 'الاعتماد النهائي' };
function gatesOf(card, status) {
  const after = (k) => ['submitted', 'accepted', 'approved'].indexOf(status) >= ['submitted', 'accepted', 'approved'].indexOf(k);
  return {
    card: card ? (card.state === 'approved' ? 'ok' : card.state === 'waiting' ? 'wait' : card.state === 'returned' ? 'bad' : 'idle') : null,
    submit: status === 'returned' ? 'bad' : after('submitted') ? 'ok' : 'idle',
    sponsor: after('approved') || status === 'accepted' ? (status === 'accepted' ? 'wait' : 'ok') : 'idle',
    final: status === 'approved' ? 'ok' : 'idle',
  };
}
function Gate({ k, st }) {
  return <li className={`sp-gate ${st}`} data-gate={k}><i aria-hidden="true">◆</i><span>{GATE_AR[k]}</span><small>{st === 'ok' ? 'تم' : st === 'wait' ? 'بانتظار القرار' : st === 'bad' ? 'أُعيد بملاحظة' : ''}</small></li>;
}

export function Spine({ sections, checks = [], card = null, status = 'draft', current = null, busy = false, onOpen, onHandbook = null, expert = false, fresh = [], lensLine = null, checkMap = CHECK_CHAPTERS }) {
  const [sheet, setSheet] = useState(false);
  const sum = spineSummary(sections);
  const units = unitsFor(sections);
  const gates = gatesOf(card, status);
  const open = (id) => { setSheet(false); if (!busy) onOpen(id); };
  let phase = null;
  const rows = [];
  units.forEach((u) => {
    if (u.phase !== phase) { phase = u.phase; rows.push(<li key={`ph-${u.key}`} className="sp-phase">{u.phase || 'فصول أخرى'}</li>); }
    const st = unitState(u);
    const multi = u.items.length > 1;
    rows.push(
      <li key={u.key} className={`sp-unit ${st}${u.items.some((x) => x.id === current) ? ' cur' : ''}`} data-unit={u.key} data-level={u.level}>
        {multi && <b className="sp-unit-t">{u.title}</b>}
        <ol>
          {u.items.map((x) => {
            const cs = chapterState(x);
            const warn = checksOn(checks, x.key, checkMap);
            const isNew = expert ? changedSinceRead(x) : fresh.includes(x.key);
            return (
              <li key={x.id}>
                <button type="button" className={`sp-node ${cs}${x.id === current ? ' cur' : ''}`} aria-current={x.id === current ? 'step' : undefined} disabled={busy} onClick={() => open(x.id)}
                  data-chapter={x.key} data-state={cs}>
                  <i className="sp-dot" aria-hidden="true" />
                  <span className="sp-t">{x.n}. {x.title}</span>
                  <small className="sp-st">{x.optional && cs !== 'done' ? 'اختياري' : STATE_AR[cs]}{!expert && readByExpert(x) ? ' · قرأه خبيرك' : ''}</small>
                  {isNew && <span className="chip gold sp-new">{expert ? 'جديد' : 'جديد في مستواك'}</span>}
                  {warn.length > 0 && <span className="chip bad sp-check" title={warn.map((w) => w.title).join('، ')}>{warn.length === 1 ? 'فحص' : `${warn.length} فحوص`}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </li>,
    );
    if (u.items.some((x) => x.key === 'initiative-charter') && gates.card) rows.push(<Gate key="g-card" k="card" st={gates.card} />);
  });
  ['submit', 'sponsor', 'final'].forEach((k) => rows.push(<Gate key={`g-${k}`} k={k} st={gates[k]} />));
  const body = (
    <>
      <div className="sp-head">
        <h2 id="sp-h">خط الوثيقة</h2>
        <p className="sp-line" data-spine-line>{sum.line}</p>
        <span className="bar"><i style={{ width: `${sum.total ? Math.round((sum.done / sum.total) * 100) : 0}%` }} /></span>
        {lensLine && <p className="small muted sp-lens">{lensLine}</p>}
        {sum.next && sum.next.id !== current && <button type="button" className="btn gold sm" disabled={busy} onClick={() => open(sum.next.id)}>{chapterState(sum.next) === 'note' ? 'افتح ملاحظة خبيرك' : chapterState(sum.next) === 'writing' ? 'تابع' : 'ابدأ'}: {sum.next.title}</button>}
      </div>
      <ol className="sp-list">{rows}</ol>
      <div className="im-legend small muted">{STATE_ORDER.map((k) => <span key={k}><i className={`sp-dot ${k}`} />{STATE_AR[k]}</span>)}</div>
      {onHandbook && current && bookRef(sections.find((x) => x.id === current)) && (
        <button type="button" className="btn ghost sm" onClick={() => onHandbook(bookRef(sections.find((x) => x.id === current)))}>اقرأ في الكتاب: {bookRef(sections.find((x) => x.id === current)).look_for}</button>
      )}
    </>
  );
  return (
    <>
      <button type="button" className="sp-bar" aria-label={`الفصول: ${sum.line}`} aria-expanded={sheet} aria-controls="sp-panel" onClick={() => setSheet(true)}>
        <span className="sp-bar-t">خط الوثيقة</span><span className="sp-bar-btn" aria-hidden="true">الفصول</span><span className="sp-bar-l">{sum.line}</span><span className="bar"><i style={{ width: `${sum.total ? Math.round((sum.done / sum.total) * 100) : 0}%` }} /></span>
      </button>
      {sheet && <div className="sp-scrim" onClick={() => setSheet(false)} aria-hidden="true" />}
      <aside id="sp-panel" className={`card sp${sheet ? ' open' : ''}`} data-tour="capstone-sections" aria-labelledby="sp-h">
        {sheet && <button type="button" className="sp-close link small" onClick={() => setSheet(false)}>إغلاق</button>}
        {body}
      </aside>
    </>
  );
}
// الاسم القديم لصفحة الوثيقة: الخط نفسه
export const Navigator = Spine;
