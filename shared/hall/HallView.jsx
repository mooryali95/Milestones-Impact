// ════════════════════════════════════════════════════════════════
// منظور القاعة: المكوّن المشترك بين شاشة العرض (اللوحة) وتطبيق المشارك
// ════════════════════════════════════════════════════════════════
// من نموذج التصميم المعتمد: أرضية بمنظور، منصة وشاشة، أربع طاولات بشكل الهرم،
// مقعد للشخصية الافتراضية، تاج القائد، يد مرفوعة، ودوائر تنتقل بحركة ناعمة.
// يرسم ما يصله فقط (view من hallView)؛ لا يقرر من يرى ماذا.
import React, { useMemo, useState } from 'react';

export const TEAM_COLOR = { support: '#5fa8a0', lead: '#c79a4b', guide: '#7d93d6', eval: '#c9786b', persona: '#b48ad1' };
const TEAM_AR = { support: 'فريق الدعم', lead: 'فريق القيادة', guide: 'فريق التوجيه', eval: 'فريق التقييم', persona: 'الشخصية الافتراضية' };
const LVL_AR = { beginner: 'تأسيسي', intermediate: 'متوسط', advanced: 'احترافي' };
const GLYPH = { question: '؟', research: '⌕', true: '✓', false: '✕', idea: '✦', can: '⚙', believe: '←', assume: '«' };
const OPT_AR = { question: 'لدي سؤال', research: 'تحتاج بحث', true: 'صحيحة 100%', false: 'خاطئة 100%', idea: 'لدي فكرة', can: 'أستطيع تنفيذها', believe: 'آمن بالرأي', assume: 'أفترض' };
const Q_AR = { why: 'لماذا', what: 'ماذا', how: 'كيف', absent: 'ماذا لو', who: 'من', when: 'متى' };
const TABLES = { lead: { x: 800, y: 395, rx: 120, ry: 42 }, support: { x: 470, y: 570, rx: 150, ry: 52 }, guide: { x: 1130, y: 570, rx: 150, ry: 52 }, eval: { x: 800, y: 740, rx: 170, ry: 58 }, persona: { x: 1250, y: 330, rx: 70, ry: 26 } };
const R = 22;

function gridLines() {
  const out = [];
  for (let i = 1; i < 10; i++) { const y = 250 + i * 63; const t = (y - 250) / 630; out.push([250 - 210 * t, y, 1350 + 210 * t, y]); }
  for (let i = 0; i <= 12; i++) out.push([250 + i * (1100 / 12), 250, 40 + i * (1520 / 12), 880]);
  return out;
}
const GRID = gridLines();

// موضع كل مشارك بحسب المرحلة
function layout(people, stage) {
  const atTables = ['split', 'round', 'reveal'].includes(stage);
  const pos = {};
  people.forEach((p, i) => {
    if (stage === 'enter' || (!atTables && !p.joined)) { pos[p.id] = { x: 1475 - (i % 4) * 30, y: 760 - Math.floor(i / 4) * 0 }; return; }
    if (!atTables || (!p.team && !p.persona)) {
      const row = Math.floor(i / 7), col = i % 7; const y = 430 + row * 110; const t = (y - 250) / 630; const w = 760 + 300 * t;
      pos[p.id] = { x: 800 - w / 2 + col * (w / 6), y }; return;
    }
    const team = p.persona ? 'persona' : p.team;
    const mates = people.filter((q) => (q.persona ? 'persona' : q.team) === team);
    const k = mates.indexOf(p), n = mates.length, t = TABLES[team];
    if (team === 'persona') { pos[p.id] = { x: t.x, y: t.y - 18 }; return; }
    const a = Math.PI * (0.12 + 0.76 * (k + 0.5) / n);
    pos[p.id] = { x: t.x + Math.cos(Math.PI - a) * (t.rx + 12), y: t.y - Math.sin(a) * (t.ry + 30) };
  });
  return pos;
}

export default function HallView({ view, me = null, onPerson, compact = false }) {
  const [tip, setTip] = useState(null);
  const people = view?.people || [];
  const stage = view?.session?.stage || 'enter';
  const atTables = ['split', 'round', 'reveal'].includes(stage);
  const pos = useMemo(() => layout(people, stage), [people, stage]);
  const s = view?.sentence;
  const dist = view?.distribution;

  return (
    <div className="hv-wrap" style={{ position: 'relative' }}>
      <svg className="hv" viewBox="0 0 1600 900" role="img" aria-label="منظور القاعة والفرق" style={{ width: '100%', display: 'block', borderRadius: 18 }}>
        <defs>
          <linearGradient id="hvFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b3640" /><stop offset="1" stopColor="#10232a" /></linearGradient>
          <linearGradient id="hvScreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22414b" /><stop offset="1" stopColor="#162c34" /></linearGradient>
          <radialGradient id="hvSpot" cx="50%" cy="0%" r="70%"><stop offset="0" stopColor="#c79a4b" stopOpacity=".16" /><stop offset="1" stopColor="#c79a4b" stopOpacity="0" /></radialGradient>
          <radialGradient id="hvBg" cx="50%" cy="0%" r="120%"><stop offset="0" stopColor="#1d3a45" /><stop offset=".55" stopColor="#13262f" /><stop offset="1" stopColor="#0d1b22" /></radialGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#hvBg)" />
        <polygon points="250,250 1350,250 1560,880 40,880" fill="url(#hvFloor)" stroke="#2a4651" />
        <g stroke="#24404a" strokeWidth="1" opacity=".55">{GRID.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}</g>
        <polygon points="250,250 1350,250 1560,880 40,880" fill="url(#hvSpot)" />

        <g opacity={view?.session?.mode === 'self' ? 0.4 : 1}>
          <rect x="470" y="34" width="660" height="190" rx="14" fill="url(#hvScreen)" stroke="#c79a4b" strokeOpacity=".55" />
          <text x="1100" y="68" textAnchor="start" direction="rtl" fill="#c79a4b" fontSize="17">
            {view?.topic?.title_ar ? `${view.topic.title_ar} · الجولة ${view.session.round}${s ? ` · ${Q_AR[s.question] || ''}` : ''}` : 'القاعة'}
          </text>
          <foreignObject x="500" y="80" width="600" height="100">
            <div xmlns="http://www.w3.org/1999/xhtml" style={{ color: '#f3ead9', font: `500 ${compact ? 24 : 21}px/1.6 'IBM Plex Sans Arabic',sans-serif`, direction: 'rtl', textAlign: 'right' }}>
              {stage === 'enter' ? `أهلًا بكم. ادخلوا القاعة من التطبيق${view?.session?.code ? ` برمز ${view.session.code}` : ''}`
                : stage === 'train' ? 'التدريب: الجميع أمام المنصة'
                  : s ? s.text_ar : 'اختر جملة لتبدأ الجولة'}
            </div>
          </foreignObject>
          {dist && atTables && s && Object.entries(GLYPH).map(([k, g], i) => {
            const x = 1086 - i * 76, y = 186, hit = view.revealed && s.key === k, miss = view.revealed && (k === 'true' || k === 'false') && s.key !== k;
            return (
              <g key={k}><rect x={x - 34} y={y} width="68" height="30" rx="8" fill={hit ? '#2c5a43' : miss ? '#5a2e2a' : '#1a3139'} stroke="#2a4651" />
                <text x={x} y={y + 20} textAnchor="middle" fontSize="13" fill="#f3ead9">{g} {dist[k] || 0}<title>{OPT_AR[k]}</title></text></g>
            );
          })}
          <path d="M560,236 L1040,236 L1080,262 L520,262 Z" fill="#203a43" stroke="#2a4651" />
          <text x="800" y="255" textAnchor="middle" fill="#93a8ad" fontSize="13">منصة المدرّب{view ? ` · أجاب ${view.answered} من ${view.total}` : ''}</text>
        </g>

        {Object.entries(TABLES).map(([k, t]) => (
          <g key={k} opacity={atTables ? 1 : 0} style={{ transition: 'opacity .6s' }}>
            <ellipse cx={t.x} cy={t.y + 10} rx={t.rx} ry={t.ry} fill="#0b171c" opacity=".6" />
            <ellipse cx={t.x} cy={t.y} rx={t.rx} ry={t.ry} fill="#1d3640" stroke={TEAM_COLOR[k]} strokeWidth="2" />
            <text x={t.x} y={k === 'persona' ? t.y + t.ry + 20 : t.y + 6} textAnchor="middle" fill={TEAM_COLOR[k]} fontSize={k === 'persona' ? 14 : 18}>{TEAM_AR[k]}</text>
            {k !== 'persona' && view?.teams?.[k]?.score != null && <text x={t.x} y={t.y + t.ry + 26} textAnchor="middle" fill="#93a8ad" fontSize="14">رصيد الفريق {view.teams[k].score > 0 ? '+' : ''}{view.teams[k].score}</text>}
            {k !== 'persona' && stage === 'round' && s?.tasks?.[k] && <text x={t.x} y={t.y + t.ry + 26} textAnchor="middle" fill="#93a8ad" fontSize="13">{s.tasks[k]}</text>}
          </g>
        ))}
        {stage === 'enter' && <g><rect x="1430" y="700" width="90" height="150" rx="6" fill="#0f2128" stroke="#2a4651" /><text x="1475" y="870" textAnchor="middle" fill="#93a8ad" fontSize="13">باب القاعة</text></g>}

        {people.map((p) => {
          const at = pos[p.id] || { x: 1475, y: 760 };
          const team = p.persona ? 'persona' : p.team;
          const col = atTables && team ? TEAM_COLOR[team] : '#93a8ad';
          const mine = me && p.id === me;
          return (
            <g key={p.id} tabIndex={0} role="button" aria-label={`${p.name}${team ? `، ${TEAM_AR[team]}` : ''}`}
              style={{ transform: `translate(${at.x}px,${at.y}px)`, transition: 'transform .9s cubic-bezier(.6,.05,.25,1)', cursor: 'pointer', opacity: p.present || stage === 'enter' ? 1 : 0.45 }}
              onMouseEnter={() => setTip({ p, at })} onMouseLeave={() => setTip(null)} onFocus={() => setTip({ p, at })} onBlur={() => setTip(null)}
              onClick={() => onPerson?.(p)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPerson?.(p); } }}>
              {mine && <circle r={R + 7} fill="none" stroke="#e6c78d" strokeWidth="2" strokeDasharray="4 4" />}
              <circle r={R} fill={atTables && team ? `${col}55` : '#28434d'} stroke={col} strokeWidth="1.5" />
              <text y="6" textAnchor="middle" fill="#f3ead9" fontSize="16" fontWeight="600">{p.name.charAt(0)}</text>
              {p.leader && atTables && <text y={-R - 8} textAnchor="middle" fontSize="20" fill="#e6c78d">♔</text>}
              {p.hand && <text x={-R + 2} y={-R + 4} textAnchor="middle" fontSize="18">✋</text>}
              {(p.choice || p.answered) && atTables && (
                <g><circle cx={R - 2} cy={-R + 2} r="11" fill="#0d1b22" stroke="#c79a4b" />
                  <text x={R - 2} y={-R + 7} textAnchor="middle" fontSize="13" fill="#e6c78d">{p.choice ? GLYPH[p.choice] : '•'}</text></g>
              )}
              {p.points != null && <text y={R + 20} textAnchor="middle" fontSize="13" fontWeight="600" fill={p.points < 0 ? '#d9705f' : '#6fbf8c'}>{p.points > 0 ? '+' : ''}{p.points}</text>}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="hv-tip" role="tooltip" style={{
          position: 'absolute', left: `${(tip.at.x / 1600) * 100}%`, top: `${(tip.at.y / 900) * 100}%`, transform: 'translate(-50%,-118%)', pointerEvents: 'none',
          background: '#0f2128f2', color: '#f3ead9', border: '1px solid #2a4651', borderRadius: 14, padding: '10px 14px', minWidth: 200, maxWidth: 270, fontSize: 13.5, lineHeight: 1.6, boxShadow: '0 18px 40px #0008', direction: 'rtl', zIndex: 5,
        }}>
          {(tip.p.persona || tip.p.team) && <span style={{ background: TEAM_COLOR[tip.p.persona ? 'persona' : tip.p.team], color: '#0d1b22', fontWeight: 600, fontSize: 12, padding: '2px 8px', borderRadius: 999 }}>
            {TEAM_AR[tip.p.persona ? 'persona' : tip.p.team]}{tip.p.leader ? ' · قائد الجولة' : ''}</span>}
          <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>{tip.p.name}</div>
          {(tip.p.title || tip.p.org) && <div style={{ color: '#93a8ad' }}>{[tip.p.title, tip.p.org].filter(Boolean).join(' · ')}</div>}
          {tip.p.level && <div style={{ color: '#93a8ad' }}>المستوى: {LVL_AR[tip.p.level]}</div>}
          {tip.p.choice && <div>اختياره: {GLYPH[tip.p.choice]} {OPT_AR[tip.p.choice]}</div>}
          {!tip.p.present && <div style={{ color: '#93a8ad' }}>{tip.p.joined ? 'خارج القاعة الآن' : 'لم يدخل القاعة بعد'}</div>}
        </div>
      )}
    </div>
  );
}

export { TEAM_AR, OPT_AR, GLYPH, Q_AR };
