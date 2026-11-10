// ════════════════════════════════════════════════════════════════
// فرق القاعة قائمةً: منظور المشارك على الجوال
// ════════════════════════════════════════════════════════════════
// الساحة (HallView) تُصغَّر على الجوال حتى لا يُقرأ فيها حرف، خصوصًا بخمسين مشاركًا. هنا المعلومة نفسها
// بنص مقروء: كل فريق باسمه وعدد حاضريه، وأعضاؤه بأسمائهم الأولى وعلاماتهم (القائد، اليد، أجاب).
// يرسم ما يصله من hallView فقط؛ اختيارات الزملاء لا تصله قبل الكشف فلا يعرضها.
import React from 'react';
import { TEAM_AR, TEAM_COLOR, GLYPH, OPT_AR } from './HallView.jsx';

const ORDER = ['lead', 'support', 'guide', 'eval'];
const mark = (p) => [p.leader && 'قائد الجولة', p.hand && 'رفع يده', p.choice ? `حكمه ${OPT_AR[p.choice]}` : p.answered && 'أجاب',
  !p.present && (p.joined ? 'خارج القاعة الآن' : 'لم يدخل بعد')].filter(Boolean).join('، ');

function Person({ p, me }) {
  return (
    <li className={`ht-p${p.id === me ? ' me' : ''}${p.present ? '' : ' away'}`} aria-label={[p.name, mark(p)].filter(Boolean).join('، ')}>
      {p.leader && <span aria-hidden="true">♔</span>}
      <span>{p.name}{p.id === me ? ' (أنت)' : ''}</span>
      {p.hand && <span aria-hidden="true">✋</span>}
      {(p.choice || p.answered) && <span className="ht-a" aria-hidden="true">{p.choice ? GLYPH[p.choice] : '✓'}</span>}
      {p.points != null && <b className={p.points < 0 ? 'neg' : 'pos'} dir="ltr">{p.points > 0 ? '+' : ''}{p.points}</b>}
    </li>
  );
}

export default function HallTeams({ view, me = null }) {
  const people = view?.people || [];
  const split = people.some((p) => p.team || p.persona);
  const groups = split
    ? [...ORDER.map((k) => [k, people.filter((p) => !p.persona && p.team === k)]), ['persona', people.filter((p) => p.persona)], [null, people.filter((p) => !p.team && !p.persona)]]
    : [[null, people]];
  return (
    <div className="ht" role="group" aria-label="فرق القاعة">
      {view && <p className="ht-sum">{people.filter((p) => p.present).length} حاضرون من {view.total ?? people.length}{view.sentence ? ` · أجاب ${view.answered}` : ''}{people.some((p) => p.hand) ? ` · ${people.filter((p) => p.hand).length} أيدٍ مرفوعة` : ''}</p>}
      {groups.filter(([, ps]) => ps.length).map(([k, ps]) => (
        <section key={k || 'none'} className="ht-team" style={{ borderInlineStartColor: k ? TEAM_COLOR[k] : undefined }}>
          <h3>{k ? TEAM_AR[k] : split ? 'بلا فريق بعد' : 'الحضور'} <small>{ps.filter((p) => p.present).length} من {ps.length}{k && view?.teams?.[k]?.score != null ? ` · رصيد الفريق ${view.teams[k].score > 0 ? '+' : ''}${view.teams[k].score}` : ''}</small></h3>
          <ul>{ps.map((p) => <Person key={p.id} p={p} me={me} />)}</ul>
        </section>
      ))}
    </div>
  );
}
