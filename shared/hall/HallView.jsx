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
// الحكم (✓/✕ بدرجة ثقة 1..3) ووسوم الموقف بلا نقاط (CBM الثلاثي، المرحلة ط)
const GLYPH = { true: '✓', false: '✕', none: '•', question: '؟', research: '⌕', idea: '✦', can: '⚙', believe: '←', assume: '«' };
const OPT_AR = { true: 'صحيحة', false: 'خاطئة', none: 'بلا حكم', question: 'لدي سؤال', research: 'تحتاج بحث', idea: 'لدي فكرة', can: 'أستطيع تنفيذها', believe: 'آمن بالرأي', assume: 'أفترض' };
const CONF_AR = { 1: 'أرجّح', 2: 'واثق', 3: 'متيقن' };
// شريط التوزيع: الأحكام مجموعة على درجات الثقة، ثم وسوم الموقف
const DIST = [
  ['true', (d) => (d.true1 || 0) + (d.true2 || 0) + (d.true3 || 0)], ['false', (d) => (d.false1 || 0) + (d.false2 || 0) + (d.false3 || 0)], ['none', (d) => d.none || 0],
  ...['question', 'research', 'idea', 'can', 'believe', 'assume'].map((k) => [k, (d) => d[k] || 0]),
];
const Q_AR = { why: 'لماذا', what: 'ماذا', how: 'كيف', absent: 'ماذا لو', who: 'من', when: 'متى' };
const TABLES = { lead: { x: 800, y: 395, rx: 120, ry: 42 }, support: { x: 470, y: 570, rx: 150, ry: 52 }, guide: { x: 1130, y: 570, rx: 150, ry: 52 }, eval: { x: 800, y: 740, rx: 170, ry: 58 }, persona: { x: 1250, y: 305, rx: 70, ry: 26 } };
const R = 22;
const ARC_MAX = 5;
// محيط القطع الناقص تقريبًا (Ramanujan)، ونصف قطر مقعد يترك فراغًا بين الجارين
const perimeter = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
// n نقطة على القطع الناقص بمسافات قوسية متساوية (الزوايا المتساوية تزحم المقاعد عند طرفيه لأنه مفلطح)، من أعلاه
const RINGS = new Map();
function ringPoints(n, rx, ry) {
  const key = `${n}:${rx}:${ry}`;
  if (RINGS.has(key)) return RINGS.get(key);
  const STEPS = 720, pts = [], acc = [0];
  for (let i = 0; i <= STEPS; i++) { const a = (2 * Math.PI * i) / STEPS - Math.PI / 2; pts.push({ x: Math.cos(a) * rx, y: Math.sin(a) * ry }); }
  for (let i = 1; i <= STEPS; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const out = []; let j = 0;
  for (let k = 0; k < n; k++) { const target = (acc[STEPS] * (k + 0.5)) / n; while (acc[j] < target) j += 1; out.push(pts[j]); }
  RINGS.set(key, out);
  return out;
}
export const seatRadius = (n, rx, ry) => Math.max(11, Math.min(R, perimeter(rx, ry) / n / 2.25));

// خط الشاشة يتبع طول الجملة: القصيرة أكبر، والطويلة تبقى في سطورها الثلاثة
const screenFont = (stage, s) => { const n = stage === 'round' || stage === 'reveal' ? (s?.text_ar || '').length : 40; return n <= 90 ? 30 : n <= 160 ? 26 : n <= 230 ? 22 : 19; };

function gridLines() {
  const out = [];
  for (let i = 1; i < 10; i++) { const y = 250 + i * 63; const t = (y - 250) / 630; out.push([250 - 210 * t, y, 1350 + 210 * t, y]); }
  for (let i = 0; i <= 12; i++) out.push([250 + i * (1100 / 12), 250, 40 + i * (1520 / 12), 880]);
  return out;
}
const GRID = gridLines();

// موضع كل مشارك بحسب المرحلة
// مواضع الطاولات المرقّمة (كل فريق طاولات من خمسة إلى سبعة): صفوف على الأرضية، والطاولة 1 أعلى اليمين (اتجاه القراءة)،
// وحول كل طاولة حلقة مقاعد كاملة. صف واحد حتى 4 طاولات، وصفّان حتى 8، وثلاثة لما زاد (حتى 15 طاولة، أي نحو مئة مشارك).
const TABLE_RX = 70, TABLE_RY = 24, SEAT_RX = TABLE_RX + 30, SEAT_RY = TABLE_RY + 30;
export function tableSlots(nos) {
  const list = [...nos].sort((x, y) => x - y);
  const rows = list.length <= 4 ? 1 : list.length <= 8 ? 2 : 3;
  const per = Math.ceil(list.length / rows);
  const ys = rows === 1 ? [615] : rows === 2 ? [510, 720] : [460, 615, 770];
  const out = {};
  list.forEach((no, i) => {
    const row = Math.floor(i / per), col = i % per, inRow = Math.min(per, list.length - row * per);
    const y = ys[row], t = (y - 250) / 630, left = 250 - 210 * t, w = 1100 + 420 * t;
    out[no] = { x: left + w - (col + 0.5) * (w / inRow), y };
  });
  return out;
}

function layout(people, stage) {
  const atTables = ['split', 'round', 'reveal'].includes(stage);
  const pos = {};
  // أمام المنصة (الدخول والتدريب): صفوف تتسع لكل الحاضرين داخل الأرضية، والدائرة تصغر مع العدد
  const floor = people.filter((p) => !atTables && p.joined);
  const cols = Math.max(7, Math.ceil(floor.length / 5)), rows = Math.max(1, Math.ceil(floor.length / cols));
  const gap = Math.min(110, 420 / rows);
  const loose = people.filter((p) => atTables && !p.team && !p.persona);
  const waiting = people.filter((p) => !atTables && !p.joined);
  const numbered = atTables ? people.filter((p) => !p.persona && p.team && p.table) : [];
  const slots = numbered.length ? tableSlots(new Set(numbered.map((p) => p.table))) : null;
  people.forEach((p) => {
    // من لم يدخل بعد: عند الباب في صفوف صغيرة
    if (!atTables && !p.joined) { const i = waiting.indexOf(p); pos[p.id] = { x: 1500 - (i % 4) * 24, y: 690 - Math.floor(i / 4) * 24, r: 11 }; return; }
    if (!atTables) {
      const i = floor.indexOf(p), row = Math.floor(i / cols), col = i % cols; const y = 400 + row * gap; const t = (y - 250) / 630; const w = 760 + 300 * t;
      pos[p.id] = { x: 800 - w / 2 + (cols > 1 ? col * (w / (cols - 1)) : w / 2), y, r: Math.max(11, Math.min(R, w / cols / 2.4, gap / 2.4)) }; return;
    }
    // بلا فريق بعد التقسيم: صف على حافة الأرضية الأمامية، لا فوق الطاولات
    if (!p.team && !p.persona) { const i = loose.indexOf(p); pos[p.id] = { x: 130 + (i % 12) * 42, y: 850 - Math.floor(i / 12) * 40, r: 16 }; return; }
    // على طاولته المرقّمة حين يصل رقمها من الخادم؛ وإلا طاولات الفرق الأربع (معاينة أو حالة بلا طاولات)
    if (slots && !p.persona && p.table) {
      const at = slots[p.table], seat = people.filter((q) => !q.persona && q.table === p.table);
      const a = (2 * Math.PI * seat.indexOf(p)) / seat.length - Math.PI / 2;
      pos[p.id] = { x: at.x + Math.cos(a) * SEAT_RX, y: at.y + Math.sin(a) * SEAT_RY, r: seat.length > 8 ? 18 : R }; return;
    }
    const team = p.persona ? 'persona' : p.team;
    const mates = people.filter((q) => (q.persona ? 'persona' : q.team) === team);
    const k = mates.indexOf(p), n = mates.length, t = TABLES[team];
    if (team === 'persona') { pos[p.id] = { x: t.x, y: t.y - 18, r: R }; return; }
    // حتى خمسة: قوس خلف الطاولة كما في النموذج. فوقها: حلقة حول الطاولة كلها، ونصف قطر الدائرة يصغر
    // حتى لا تتراكب (14 في الفريق عند 50 مشاركًا كانت تتراكب فلا يُقرأ حرف ولا علامة إجابة)
    if (n <= ARC_MAX) {
      const a = Math.PI * (0.12 + 0.76 * (k + 0.5) / n);
      pos[p.id] = { x: t.x + Math.cos(Math.PI - a) * (t.rx + 12), y: t.y - Math.sin(a) * (t.ry + 30), r: R };
      return;
    }
    const rx = t.rx + 34, ry = t.ry + 36;
    const r = seatRadius(n, rx, ry);
    const at = ringPoints(n, rx, ry)[k];
    pos[p.id] = { x: t.x + at.x, y: t.y + at.y, r };
  });
  return pos;
}

// ما تعرضه بطاقة الشخص عند المرور يصل قارئ الشاشة في اسمه: الفريق والقيادة والحكم والحضور.
// الشخص زر حين يكون لاختياره أثر (لوحة الميسّر)، وإلا صورة موسومة تُبلغ بالتركيز كما تُبلغ بالمرور
function personLabel(p, team) {
  return [p.name, team && TEAM_AR[team], p.table && !p.persona && `طاولة ${p.table}`, p.leader && 'قائد الجولة', p.choice && `حكمه: ${OPT_AR[p.choice]}`,
    !p.present && (p.joined ? 'خارج القاعة الآن' : 'لم يدخل القاعة بعد')].filter(Boolean).join('، ');
}

export { layout as hallLayout };

export default function HallView({ view, me = null, onPerson, compact = false, timer = '' }) {
  const [tip, setTip] = useState(null);
  const people = view?.people || [];
  const stage = view?.session?.stage || 'enter';
  const atTables = ['split', 'round', 'reveal'].includes(stage);
  const pos = useMemo(() => layout(people, stage), [people, stage]);
  const s = view?.sentence;
  const dist = view?.distribution;
  const numbered = atTables && view?.tables?.length > 0 && people.some((p) => p.table);
  const slots = useMemo(() => (numbered ? tableSlots(view.tables.map((t) => t.no)) : {}), [numbered, view?.tables]);
  const waiting = people.filter((p) => !p.joined).length;

  return (
    <div className="hv-wrap" style={{ position: 'relative' }}>
      <svg className="hv" viewBox="0 0 1600 900" role="group" aria-label="منظور القاعة والفرق" style={{ width: '100%', display: 'block', borderRadius: 18 }}>
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
          <rect x="330" y="20" width="940" height="212" rx="14" fill="url(#hvScreen)" stroke="#c79a4b" strokeOpacity=".55" />
          <text x="1240" y="54" textAnchor="start" direction="rtl" fill="#c79a4b" fontSize="22">
            {view?.topic?.title_ar ? `${view.topic.title_ar}${s && atTables ? ` · الجولة ${view.session.round} · ${Q_AR[s.question] || ''}` : ''}` : 'القاعة'}
          </text>
          {timer && atTables && <text x="362" y="56" textAnchor="start" direction="ltr" fill="#f3ead9" fontSize="28" fontWeight="700" aria-hidden="true">{timer}</text>}
          <foreignObject x="360" y="64" width="880" height="118">
            <div xmlns="http://www.w3.org/1999/xhtml" style={{ color: '#f3ead9', font: `500 ${screenFont(stage, s)}px/1.5 'IBM Plex Sans Arabic',sans-serif`, direction: 'rtl', textAlign: 'right', maxHeight: 118, overflow: 'hidden' }}>
              {stage === 'enter' ? `أهلًا بكم. ادخلوا القاعة من التطبيق${view?.session?.code ? ` برمز ${view.session.code}` : ''}`
                : stage === 'train' ? 'التدريب: الجميع أمام المنصة'
                  : s ? s.text_ar : 'اختر جملة لتبدأ الجولة'}
            </div>
          </foreignObject>
          {dist && atTables && s && (() => {
            // الأحكام الثلاثة دائمًا، ووسوم الموقف التي اختارها أحد فقط؛ كل خانة باسمها لا برمز وحده
            const chips = DIST.map(([k, of]) => [k, of(dist)]).filter(([k, n]) => ['true', 'false', 'none'].includes(k) || n > 0);
            const w = Math.min(150, 880 / chips.length - 8);
            return chips.map(([k, n], i) => {
              const x = 1240 - w / 2 - i * (w + 8), y = 188, hit = view.revealed && s.key === k, miss = view.revealed && (k === 'true' || k === 'false') && s.key !== k;
              return (
                <g key={k}><rect x={x - w / 2} y={y} width={w} height="34" rx="9" fill={hit ? '#2c5a43' : miss ? '#5a2e2a' : '#1a3139'} stroke="#2a4651" />
                  <text x={x} y={y + 23} textAnchor="middle" fontSize={w < 110 ? 13 : 16} fill="#f3ead9">{OPT_AR[k]} <tspan fontWeight="700" fill="#e6c78d">{n}</tspan></text></g>
              );
            });
          })()}
          <path d="M560,236 L1040,236 L1080,262 L520,262 Z" fill="#203a43" stroke="#2a4651" />
          <text x="800" y="256" textAnchor="middle" fill="#c5d2d5" fontSize="16">منصة المدرّب{s && atTables ? ` · أجاب ${view.answered} من ${view.total}` : view && !atTables ? ` · دخل ${people.length - waiting} من ${people.length}` : ''}</text>
        </g>

        {numbered && view.tables.map((t) => {
          const c = slots[t.no]; if (!c) return null;
          return (
            <g key={t.no}>
              <ellipse cx={c.x} cy={c.y + 8} rx={TABLE_RX} ry={TABLE_RY} fill="#0b171c" opacity=".6" />
              <ellipse cx={c.x} cy={c.y} rx={TABLE_RX} ry={TABLE_RY} fill="#1d3640" stroke={TEAM_COLOR[t.team]} strokeWidth="2" />
              <text x={c.x} y={c.y + 1} textAnchor="middle" fill="#f3ead9" fontSize="16" fontWeight="600">طاولة {t.no}</text>
              <text x={c.x} y={c.y + 16} textAnchor="middle" fill={TEAM_COLOR[t.team]} fontSize="12">{TEAM_AR[t.team]}</text>
            </g>
          );
        })}
        {numbered && Object.entries(view.teams || {}).map(([k, t], i) => (
          <text key={k} x={1180 - i * 250} y="872" textAnchor="middle" fill={TEAM_COLOR[k]} fontSize="15">{TEAM_AR[k]} · {t.count}{t.score != null ? ` · رصيده ${t.score > 0 ? '+' : ''}${t.score}` : ''}</text>
        ))}
        {Object.entries(TABLES).filter(([k]) => !numbered || k === 'persona').map(([k, t]) => (
          <g key={k} opacity={atTables ? 1 : 0} style={{ transition: 'opacity .6s' }}>
            <ellipse cx={t.x} cy={t.y + 10} rx={t.rx} ry={t.ry} fill="#0b171c" opacity=".6" />
            <ellipse cx={t.x} cy={t.y} rx={t.rx} ry={t.ry} fill="#1d3640" stroke={TEAM_COLOR[k]} strokeWidth="2" />
            <text x={t.x} y={k === 'persona' ? t.y + t.ry + 22 : t.y + (view?.teams?.[k]?.score != null || (stage === 'round' && s?.tasks?.[k]) ? -2 : 7)} textAnchor="middle" fill={TEAM_COLOR[k]} fontSize={k === 'persona' ? 16 : 22} fontWeight="600">{TEAM_AR[k]}</text>
            {k !== 'persona' && view?.teams?.[k]?.score != null && <text x={t.x} y={t.y + 22} textAnchor="middle" fill="#c5d2d5" fontSize="16">رصيد الفريق {view.teams[k].score > 0 ? '+' : ''}{view.teams[k].score}</text>}
            {k !== 'persona' && stage === 'round' && s?.tasks?.[k] && (
              <foreignObject x={t.x - t.rx + 22} y={t.y + 4} width={(t.rx - 22) * 2} height={t.ry - 6}>
                <div xmlns="http://www.w3.org/1999/xhtml" style={{ color: '#c5d2d5', font: "400 14px/1.35 'IBM Plex Sans Arabic',sans-serif", direction: 'rtl', textAlign: 'center', overflow: 'hidden', maxHeight: t.ry - 6 }}>{s.tasks[k]}</div>
              </foreignObject>
            )}
          </g>
        ))}
        {!atTables && <g><rect x="1405" y="560" width="120" height="290" rx="6" fill="#0f2128" stroke="#2a4651" /><text x="1465" y="872" textAnchor="middle" fill="#c5d2d5" fontSize="16">لم يدخلوا بعد</text></g>}

        {people.map((p) => {
          const at = pos[p.id] || { x: 1475, y: 760 };
          const r = at.r || R, k = r / R;
          const team = p.persona ? 'persona' : p.team;
          const col = atTables && team ? TEAM_COLOR[team] : '#93a8ad';
          const mine = me && p.id === me;
          return (
            <g key={p.id} tabIndex={0} role={onPerson ? 'button' : 'img'} aria-label={personLabel(p, team)}
              style={{ transform: `translate(${at.x}px,${at.y}px)`, transition: 'transform .9s cubic-bezier(.6,.05,.25,1)', cursor: onPerson ? 'pointer' : 'default', opacity: p.present || (stage === 'enter' && !p.joined) ? 1 : 0.45 }}
              onMouseEnter={() => setTip({ p, at })} onMouseLeave={() => setTip(null)} onFocus={() => setTip({ p, at })} onBlur={() => setTip(null)}
              onClick={() => onPerson?.(p)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPerson?.(p); } }}>
              {mine && <circle r={r + 7} fill="none" stroke="#e6c78d" strokeWidth="2" strokeDasharray="4 4" />}
              <circle r={r} fill={atTables && team ? `${col}55` : '#28434d'} stroke={col} strokeWidth="1.5" />
              <text y={6 * k} textAnchor="middle" fill="#f3ead9" fontSize={Math.round(16 * k)} fontWeight="600">{p.name.charAt(0)}</text>
              {p.leader && atTables && <text y={-r - 8} textAnchor="middle" fontSize={Math.round(20 * k)} fill="#e6c78d">♔</text>}
              {p.hand && <text x={-r + 2} y={-r + 4} textAnchor="middle" fontSize={Math.round(18 * k)}>✋</text>}
              {(p.choice || p.answered) && atTables && (
                <g><circle cx={r - 2} cy={-r + 2} r={Math.max(7, 11 * k)} fill="#0d1b22" stroke="#c79a4b" />
                  <text x={r - 2} y={-r + 2 + 5 * k} textAnchor="middle" fontSize={Math.max(9, Math.round(13 * k))} fill="#e6c78d">{p.choice ? GLYPH[p.choice] : '•'}</text></g>
              )}
              {p.points != null && <text y={r + 16} textAnchor="middle" fontSize="13" fontWeight="600" fill={p.points < 0 ? '#d9705f' : '#6fbf8c'}>{p.points > 0 ? '+' : ''}{p.points}</text>}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="hv-tip" role="tooltip" style={{
          position: 'absolute', left: `${(tip.at.x / 1600) * 100}%`, top: `${(tip.at.y / 900) * 100}%`, transform: 'translate(-50%,-118%)', pointerEvents: 'none',
          background: '#0f2128f2', color: '#f3ead9', border: '1px solid #2a4651', borderRadius: 14, padding: '10px 14px', minWidth: 200, maxWidth: 270, fontSize: 14, lineHeight: 1.6, boxShadow: '0 18px 40px #0008', direction: 'rtl', zIndex: 5,
        }}>
          {(tip.p.persona || tip.p.team) && <span style={{ background: TEAM_COLOR[tip.p.persona ? 'persona' : tip.p.team], color: '#0d1b22', fontWeight: 600, fontSize: 14, padding: '2px 8px', borderRadius: 999 }}>
            {TEAM_AR[tip.p.persona ? 'persona' : tip.p.team]}{tip.p.table && !tip.p.persona ? ` · طاولة ${tip.p.table}` : ''}{tip.p.leader ? ' · قائد الجولة' : ''}</span>}
          <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>{tip.p.name}</div>
          {(tip.p.title || tip.p.org) && <div style={{ color: '#93a8ad' }}>{[tip.p.title, tip.p.org].filter(Boolean).join(' · ')}</div>}
          {tip.p.level && <div style={{ color: '#93a8ad' }}>المستوى: {LVL_AR[tip.p.level]}</div>}
          {tip.p.choice && <div>حكمه: {GLYPH[tip.p.choice]} {OPT_AR[tip.p.choice]}{tip.p.confidence ? ` (${CONF_AR[tip.p.confidence]})` : ''}</div>}
          {tip.p.stances?.length > 0 && <div>موقفه: {tip.p.stances.map((k) => `${GLYPH[k]} ${OPT_AR[k]}`).join('، ')}</div>}
          {!tip.p.present && <div style={{ color: '#93a8ad' }}>{tip.p.joined ? 'خارج القاعة الآن' : 'لم يدخل القاعة بعد'}</div>}
        </div>
      )}
    </div>
  );
}

export { TEAM_AR, OPT_AR, GLYPH, Q_AR, CONF_AR };
