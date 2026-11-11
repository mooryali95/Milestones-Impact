// ════════════════════════════════════════════════════════════════
// تحكم القاعة الحية: المكوّن المشترك بين لوحة الإدارة وبوابة الخبير (المرحلة 9)
// ════════════════════════════════════════════════════════════════
// يقود القاعة مرحلة مرحلة (الدخول، التدريب، التقسيم، الجولة، الكشف) أو يفتحها ذاتية، ويقسّم الفرق
// ويسند القائد والشخصية ويغلقها. التحديث كل ثانيتين بسؤال خفيف عن رقم النسخة.
// لا يعرف من ينادي: call(key, body) تربطه اللوحة بإجراءات admin.hall-* والبوابة بـxp.hall-*، والخادم
// يقيّد الخبير بدفعاته. أصناف CSS تُمرَّر (ui) لأن للتطبيقين نظامي أنماط مختلفين.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import HallView, { TEAM_AR, TEAM_COLOR, Q_AR, OPT_AR, CONF_AR } from './HallView.jsx';
import { HALL_SPLIT_AR, HALL_STAGE_AR, publicView } from '../../supabase/functions/leaders-api/hall.js';
import { useHallTimer, timerLabel } from './HallTimer.jsx';
import { POLL_FAIL_LIMIT } from '../../leaders-app/src/hallPoll.js';

const STEPS = ['enter', 'train', 'split', 'round', 'reveal'];
export const HALL_UI_ADMIN = { card: 'la-card', row: 'la-row', muted: 'la-muted', chip: 'la-chip', link: 'la-link', btn: 'btn-sm primary', ghost: 'btn-sm ghost', fields: 'la-adj-row', ok: 'ok' };
export const HALL_UI_APP = { card: 'card stack', row: 'row', muted: 'muted small', chip: 'chip', link: 'link small', btn: 'btn sm', ghost: 'btn ghost sm', fields: 'row', ok: 'gold' };

export default function HallControl({ cohortId, call, canWrite = true, toast = () => {}, prompt, confirm, ui = HALL_UI_ADMIN }) {
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ mode: 'live', topic_id: '', workshop_session_id: '' });
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('all');
  const ver = useRef(0);
  const fails = useRef(0);
  // تسلسل الإجراءات: سؤال دوري تزامن مع إجراء (أُرسل قبل اكتماله) يحمل حالة أقدم من نتيجة الإجراء فيُهمل،
  // وإلا أعاد القاعة المغلقة مفتوحة حتى السؤال التالي (التُقط في CI بعد عودة Actions، 2026-11-11)
  const seq = useRef(0);
  const u = ui;

  const load = useCallback(async (force) => {
    if (!cohortId) return;
    const at = seq.current;
    const r = await call('state', { cohort_id: cohortId, since: force ? 0 : ver.current });
    if (at !== seq.current) return;
    // إخفاق عابر في السؤال الدوري يصلحه السؤال التالي؛ يُبلَّغ عند أول تحميل، أو حين يتوالى (مرة لا كل ثانيتين)
    if (!r.success) { fails.current += 1; if (force || fails.current === POLL_FAIL_LIMIT) toast(r.message, true); return; }
    fails.current = 0;
    if (r.unchanged) return;
    ver.current = r.session?.version || 0;
    setV(r);
  }, [cohortId, call, toast]);
  useEffect(() => { ver.current = 0; setV(null); load(true); const t = setInterval(() => { if (!document.hidden) load(); }, 2000); return () => clearInterval(t); }, [load]);

  const act = async (key, body, ok) => {
    setBusy(true);
    seq.current += 1;
    const r = await call(key, body);
    seq.current += 1;
    setBusy(false);
    // toast(نص، خطأ؟): البوابة تعرض الخطأ تنبيهًا لا نجاحًا (اللوحة تتجاهل المعامل الثاني)
    if (!r.success) return toast(r.message, true);
    if (ok) toast(ok);
    // نتيجة كتابة الحضور عند الإغلاق تُقال للخبير صريحة: كم كُتب، أو لماذا لم يُكتب
    if (key === 'close' && r.attendance) {
      const t = r.attendance;
      toast(t.written ? `أُغلقت القاعة، وكُتب حضور ${t.written} مشاركًا في «${t.workshop}»`
        : t.reason === 'no_workshop' ? 'أُغلقت القاعة. لم تُربط بجلسة ورشة، فلم يُكتب حضور؛ سجّله من «الحضور والجلسات»'
          : t.reason === 'no_rounds' ? 'أُغلقت القاعة. لم تُكشف جولة، فلم يُكتب حضور؛ سجّله من «الحضور والجلسات»'
            : t.reason === 'not_written' ? 'أُغلقت القاعة، وتعذّر حفظ الحضور؛ سجّله من «الحضور والجلسات»'
              : 'أُغلقت القاعة، ولم يبلغ أحد حد المشاركة', t.reason === 'not_written');
    }
    ver.current = r.session?.version || 0; setV(r);
  };
  const left = useHallTimer(v);
  const ask = (text, def) => (prompt ? prompt(text, def) : Promise.resolve(window.prompt(text, def ?? '')));
  const sure = (text) => (confirm ? confirm(text, { danger: true }) : Promise.resolve(window.confirm(text)));
  // الرجوع إلى مرحلة سابقة وإعادة التقسيم يغيّران ما يراه الخمسون في لحظة، فيُؤكَّدان
  const goStage = async (k) => {
    if (STEPS.indexOf(k) < STEPS.indexOf(v.session.stage) && !(await sure(`ترجع القاعة من «${HALL_STAGE_AR[v.session.stage]}» إلى «${HALL_STAGE_AR[k]}» عند كل المشاركين. متابعة؟`))) return;
    act('step', { session_id: v.session.id, stage: k });
  };
  const doSplit = async (k) => {
    const seated = (v.people || []).filter((p) => p.team).length;
    if (seated && (k === 'mixed' || k === 'level') && !(await sure(`${seated} مشاركًا في فرقهم وطاولاتهم الآن. التوزيع الآلي يعيد توزيعهم جميعًا ويغيّر طاولاتهم. متابعة؟`))) return;
    act('split', { session_id: v.session.id, method: k }, k === 'choose' ? 'يختار المشاركون فرقهم الآن من جوالاتهم' : 'وُزّعت الفرق والطاولات');
  };

  if (!cohortId) return null;
  if (!v) return <p className={u.muted}>جارٍ التحميل…</p>;
  const sess = v.session;
  const sid = sess?.id;
  const person = sel && v.people?.find((p) => p.id === sel);
  const persona = async (p) => {
    const t = await ask(`${p.name} يتقمّص أي شخصية؟ (مثال: راعي المشروع، صانع القرار)`, sess.persona_ar || 'راعي المشروع');
    if (t) act('assign', { session_id: sid, participant_id: p.id, persona: true, persona_ar: t }, 'أُسندت الشخصية');
  };

  return (
    <div className="hall-admin">
      {sess && <div className={`${u.row} between`}><span className={`${u.chip} ${u.ok}`}>{sess.mode === 'self' ? 'المسار الذاتي' : 'القاعة الحية'}</span>
        <span className="hall-code">رمز الدخول <b dir="ltr">{sess.code}</b></span></div>}

      {!sess && (
        <section className={u.card}>
          <h3>لا قاعة مفتوحة لهذه الدفعة</h3>
          <div className={u.fields}>
            <label className="field"><span>النمط</span>
              <select className="input" aria-label="نمط القاعة" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="live">القاعة الحية: تقودها مرحلة مرحلة على شاشة العرض</option>
                <option value="self">المسار الذاتي: تبقى الفرق، والجمل مفتوحة للعمل دون اجتماع</option>
              </select></label>
            <label className="field"><span>موضوع «كاتون» للجلسة</span>
              <select className="input" aria-label="موضوع الجلسة" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })}>
                <option value="">بلا موضوع الآن</option>
                {(v.topics || []).map((t) => <option key={t.id} value={t.id}>{t.title_ar}{t.status !== 'published' ? ' (مسودة: يُفتح للقاعة فقط)' : ''}</option>)}
              </select></label>
          </div>
          {form.mode === 'live' && (
            <label className="field"><span>جلسة الورشة التي يُكتب فيها الحضور</span>
              <select className="input" aria-label="جلسة الورشة" value={form.workshop_session_id} onChange={(e) => setForm({ ...form, workshop_session_id: e.target.value })}>
                <option value="">{(v.workshops || []).some((w) => w.open) ? 'الجلسة الجارية الآن (تلقائيًا)' : 'بلا جلسة: لا يُكتب حضور من القاعة'}</option>
                {(v.workshops || []).map((w) => <option key={w.id} value={w.id}>{w.title} · {new Date(w.starts_at).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</option>)}
              </select>
              <small className={u.muted}>عند الإغلاق يُكتب حضور من شارك في 60% من الجولات المكشوفة، فيكتمل بند الورشة في رحلته.</small></label>
          )}
          {canWrite && <button className={u.btn} disabled={busy} onClick={() => act('open', { cohort_id: cohortId, mode: form.mode, topic_id: form.topic_id, ...(form.workshop_session_id ? { workshop_session_id: form.workshop_session_id } : {}) }, 'فُتحت القاعة')}>افتح القاعة</button>}
        </section>
      )}

      {sess && (
        <>
          <div className="hall-stage-bar">
            {sess.mode === 'live' && STEPS.map((k, i) => (
              <button key={k} className={`step${sess.stage === k ? ' on' : ''}`} disabled={!canWrite || busy || (k === 'reveal' && !v.sentence)}
                onClick={() => goStage(k)}><b>{i + 1}</b>{HALL_STAGE_AR[k]}</button>
            ))}
            <span className="grow" />
            {canWrite && <button className={u.ghost} onClick={() => document.querySelector('.hall-screen')?.requestFullscreen?.().catch(() => {})}>اعرض على الشاشة الكبيرة</button>}
          </div>

          {/* شاشة العرض بما يراه المشاركون: لا أحكام أفراد ولا توزيع قبل الكشف، فتُعرض على البروجكتر بأمان */}
          <div className="hall-screen"><HallView view={publicView(v)} onPerson={(p) => setSel(p.id)} timer={timerLabel(left)} /></div>
          {canWrite && !v.revealed && v.sentence && v.distribution && (
            <p className={u.muted} aria-live="polite">لك وحدك قبل الكشف: أجاب {v.answered} من {v.total} · صحيحة {(v.distribution.true1 || 0) + (v.distribution.true2 || 0) + (v.distribution.true3 || 0)} · خاطئة {(v.distribution.false1 || 0) + (v.distribution.false2 || 0) + (v.distribution.false3 || 0)}. لا يظهر هذا على شاشة العرض.</p>
          )}

          {canWrite && (
            <div className="hall-controls">
              <section className={u.card}>
                <h4>التقسيم</h4>
                <div className={`${u.row} wrap`}>{Object.entries(HALL_SPLIT_AR).map(([k, l]) => (
                  <button key={k} className={sess.split_method === k ? u.btn : u.ghost} disabled={busy} onClick={() => doSplit(k)}>{l}</button>
                ))}</div>
                <small className={u.muted}>التوزيع الآلي على الحاضرين: أربعة فرق، وكل فريق طاولات من خمسة إلى سبعة. القيادة أصغر الفرق، وقائد الجولة يتبدّل مع كل جولة، والمتأخر يُلحق بأصغر طاولة.</small>
              </section>
              <section className={u.card}>
                <h4>الجملة</h4>
                <select className="input" aria-label="الجملة المعروضة" value={v.sentence?.id || ''} onChange={(e) => act('step', { session_id: sid, sentence_id: e.target.value, stage: 'round' })} disabled={busy || !v.sentences?.length}>
                  <option value="">اختر الجملة</option>
                  {(v.sentences || []).map((x) => <option key={x.id} value={x.id}>{x.sort}. {Q_AR[x.question]}{x.text_ar ? ` · ${x.text_ar.length > 60 ? `${x.text_ar.slice(0, 60)}…` : x.text_ar}` : ''}</option>)}
                </select>
                <div className={u.row}>
                  <button className={u.btn} disabled={busy || !v.sentence || v.revealed} onClick={() => act('step', { session_id: sid, stage: 'reveal' })}>اكشف المفتاح</button>
                  <button className={u.ghost} disabled={busy || !v.sentence} onClick={() => act('step', { session_id: sid, next: true }, 'جولة جديدة وقائد جديد')}>الجملة التالية ↞</button>
                </div>
                {left != null && !v.revealed && (
                  <div className={u.row} role="timer" aria-label="وقت الإجابة">
                    <b className={`hall-clock${left === 0 ? ' over' : ''}`}>{timerLabel(left)}</b>
                    <button className={u.ghost} disabled={busy} onClick={() => act('step', { session_id: sid, extend: 30 }, 'مُدّد الوقت 30 ثانية')}>+30 ثانية</button>
                  </div>
                )}
                {left === 0 && !v.revealed && <small className={u.muted}>أُقفلت الإجابة. اكشف المفتاح أو مدّد الوقت.</small>}
                {v.revealed && v.sentence?.explain_ar && <p className={u.muted}>{v.sentence.explain_ar}</p>}
              </section>
              <section className={u.card}>
                <h4>الحضور</h4>
                <div className="hall-teams">{Object.entries(v.teams).map(([t, x]) => (
                  <span key={t}><i style={{ background: TEAM_COLOR[t] }} />{TEAM_AR[t]}: {x.present}/{x.count}</span>
                ))}<span>بلا فريق: {v.people.filter((p) => !p.team).length}</span><span>✋ {v.people.filter((p) => p.hand).length}</span></div>
                {sess.mode === 'live' && v.attendance && (
                  <p className={u.muted}>{!v.attendance.workshop ? 'لم تُربط القاعة بجلسة ورشة، فلن يُكتب منها حضور.'
                    : !v.attendance.rounds ? `الحضور يُكتب في «${v.attendance.workshop.title}» عند الإغلاق، لمن يشارك في 60% من الجولات المكشوفة.`
                      : `لو أُغلقت الآن: حضور ${v.attendance.eligible} من ${v.attendance.total} في «${v.attendance.workshop.title}» (أجابوا عن ${v.attendance.need} من ${v.attendance.rounds} جولات على الأقل).`}</p>
                )}
                <button className={u.link} onClick={async () => { if (await ask('اكتب «إغلاق» لإغلاق القاعة. تبقى الإجابات والفرق محفوظة، ويُكتب الحضور.', '') === 'إغلاق') act('close', { session_id: sid }); }}>إغلاق القاعة</button>
              </section>
            </div>
          )}

          {(() => {
            const FILTERS = [['all', 'الكل', () => true], ['hand', '✋ رفعوا أيديهم', (p) => p.hand], ['pending', 'لم يجيبوا', (p) => p.present && !p.answered], ['away', 'خارج القاعة', (p) => !p.present], ['free', 'بلا فريق', (p) => !p.team]];
            const term = q.trim();
            const rows = v.people.filter((p) => FILTERS.find((f) => f[0] === only)[2](p) && (!term || p.name.includes(term)));
            return (
              <section className={`${u.card} hall-list`} aria-label="المشاركون في القاعة">
                <div className={`${u.row} wrap`}>
                  <h4>المشاركون <small className={u.muted}>· {rows.length} من {v.people.length}</small></h4>
                  <input className="input hall-search" type="search" aria-label="ابحث باسم المشارك" placeholder="ابحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className={`${u.row} wrap`} role="group" aria-label="تصفية المشاركين">{FILTERS.map(([k, l, f]) => (
                  <button key={k} className={only === k ? u.btn : u.ghost} aria-pressed={only === k} onClick={() => setOnly(k)}>{l}{k !== 'all' ? ` ${v.people.filter(f).length}` : ''}</button>
                ))}</div>
                <ul className="hall-rows">{rows.map((p) => (
                  <li key={p.id}><button className={`hall-row${sel === p.id ? ' on' : ''}`} onClick={() => setSel(p.id)}>
                    <i style={{ background: p.team ? TEAM_COLOR[p.team] : 'transparent' }} /><b>{p.name}</b>
                    <span className={u.muted}>{[p.team ? TEAM_AR[p.team] : 'بلا فريق', p.table ? `طاولة ${p.table}` : null, p.leader ? 'القائد ♔' : null, p.hand ? '✋' : null, !p.present ? 'خارج القاعة' : null].filter(Boolean).join(' · ')}</span>
                  </button></li>
                ))}</ul>
                {!rows.length && <p className={u.muted}>لا أحد بهذه التصفية.</p>}
              </section>
            );
          })()}

          {person && (
            <aside className={`${u.card} hall-person`} aria-live="polite">
              <div className={`${u.row} between`}><h3>{person.name}</h3><button className={u.link} onClick={() => setSel(null)}>إغلاق</button></div>
              <p className={u.muted}>{[person.title, person.org].filter(Boolean).join(' · ')}</p>
              <p>{person.team ? TEAM_AR[person.team] : 'بلا فريق'}{person.table ? ` · طاولة ${person.table}` : ''}{person.leader ? ' · قائد الجولة ♔' : ''}{person.persona ? ` · يتقمّص: ${sess.persona_ar || ''}` : ''}</p>
              {(person.choice || person.stances?.length > 0) && <p>
                {person.choice ? `حكمه: ${person.choice === 'true' ? 'صحيحة' : 'خاطئة'}${person.confidence ? ` (${CONF_AR[person.confidence]})` : ''}` : 'بلا حكم'}
                {person.stances?.length ? ` · موقفه: ${person.stances.map((k) => OPT_AR[k]).join('، ')}` : ''}{person.note ? ` · «${person.note}»` : ''}</p>}
              {canWrite && <div className={`${u.row} wrap`}>
                {Object.keys(TEAM_AR).filter((t) => t !== 'persona').map((t) => (
                  <button key={t} className={person.team === t ? u.btn : u.ghost} onClick={() => act('assign', { session_id: sid, participant_id: person.id, team: t })}>{TEAM_AR[t]}</button>
                ))}
                <button className={u.ghost} onClick={() => act('assign', { session_id: sid, participant_id: person.id, leader: true }, 'صار قائد الجولة')}>اجعله القائد ♔</button>
                {person.persona
                  ? <button className={u.ghost} onClick={() => act('assign', { session_id: sid, participant_id: person.id, persona: false })}>أنهِ الشخصية</button>
                  : <button className={u.ghost} onClick={() => persona(person)}>الشخصية الافتراضية</button>}
              </div>}
            </aside>
          )}
        </>
      )}
    </div>
  );
}
