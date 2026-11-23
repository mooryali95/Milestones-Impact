// ════════════════════════════════════════════════════════════════
// انضم كخبير: leaders.sunkvalue.com/expert
// ════════════════════════════════════════════════════════════════
// صفحة مفتوحة بلا حساب. تبدأ ببطاقتين لاختيار المسار (تصور أجزاء الكتاب وخبير المحتوى، المرحلة 3، اعتمده المالك 2026-11-16):
// خبير الرحلة بنموذجه كما كان، وخبير المحتوى بنموذج المراجعة (track: 'content'). المسار في العنوان (?track=content)
// فيُشارك رابطه، وزر الرجوع في المتصفح يعيد إلى البطاقتين. الطلب يدخل قائمة «طلبات بانتظار المراجعة» في لوحة
// الإدارة، ولا يُسند إلى صاحبه شيء قبل اعتماده. الخادم يطلب التحقق البشري قبل
// قبول الطلب: تظهر الأداة، ويُعاد الإرسال وحده حين تكتمل (كما في بوابات الدخول).
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import Captcha from '../Captcha.jsx';
import { captchaGate } from '../captcha.js';
import { DIM_AR, EXPERT_ROLE_AR, LEVEL_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { APPLY_TRACKS, COMMITTEE_AR, CONTENT_DIM_AR, COMMITTEE_NEEDED_AR } from '../../../supabase/functions/leaders-api/committees.js';
import EmailInput from '../../../shared/ui/EmailInput.jsx';

const LANG = { ar: 'العربية', en: 'English' };

function Pick({ legend, hint = null, options, value, onChange }) {
  const on = new Set(value);
  return (
    <fieldset className="xp-pick">
      <legend>{legend}</legend>
      {hint && <p className="xp-pick-hint">{hint}</p>}
      <div>{options.map(([k, l, hint]) => (
        <label key={k} className={`xp-opt${on.has(k) ? ' on' : ''}`}>
          <input type="checkbox" checked={on.has(k)} onChange={() => { const n = new Set(on); if (n.has(k)) n.delete(k); else n.add(k); onChange([...n]); }} />
          <b>{l}</b>{hint && <small>{hint}</small>}
        </label>
      ))}</div>
    </fieldset>
  );
}

const EMPTY = { full_name: '', email: '', phone: '', title: '', linkedin_url: '', years_experience: '', bio: '', roles: [], dimensions: [], levels: [], sectors: '', languages: ['ar'], weekly_hours: '' };
// من ملف قائم (الخبير المدعو في لوحته) إلى قيم النموذج
const fromExpert = (e) => ({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).filter((k) => e[k] != null).map((k) => [k, e[k]])),
  sectors: (e.sectors || []).join('، '), years_experience: e.years_experience ?? '', weekly_hours: e.weekly_hours ?? '', languages: e.languages?.length ? e.languages : ['ar'] });

// الإرسال بالتحقق البشري: الخادم يطلب الأداة، فتظهر، ويُعاد الإرسال برمزها وحده. save للوحة الخبير بلا تحقق
function useSubmit({ send, save = null, onSaved = null, check = null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(null);
  const submit = async (e, captcha) => {
    e?.preventDefault();
    const why = check?.();
    if (why) return setError(why);
    setError('');
    setBusy(true);
    const r = save ? await save() : await send(captcha);
    setBusy(false);
    if (!save && r.code === 'captcha') { const g = captchaGate(r, captcha); setCaptchaKey(g.box); return setError(g.error); }
    setCaptchaKey(null);
    if (r.success) { if (onSaved) onSaved(r); else setDone(true); window.scrollTo({ top: 0 }); } else setError(r.message);
  };
  const gate = <>
    {error && <div className="alert err" role="alert">{error}</div>}
    {captchaKey && <Captcha key={captchaKey.n} siteKey={captchaKey.site} onToken={(t) => submit(null, t)} />}
  </>;
  return { busy, done, submit, gate };
}

function Received({ title, text }) {
  return (
    <div className="page narrow">
      <div className="card milestone-card stack">
        <div className="badge"><span>✓</span></div>
        <h1 className="as-h2">{title}</h1>
        <p className="muted">{text}</p>
      </div>
    </div>
  );
}

// المسار من العنوان: ?track=journey أو ?track=content، وغيرهما بطاقتا الاختيار
const readTrack = () => { const t = new URLSearchParams(location.search).get('track'); return APPLY_TRACKS.includes(t) ? t : null; };

// الصفحة نفسها: الطلب المفتوح بمساريه، أو استكمال المدعو ملفه في لوحة الخبير (expert + save + onSaved) بنموذج الرحلة كما كان
export default function ExpertApply(props) {
  if (props.expert || props.save) return <JourneyForm {...props} />;
  return <OpenApply />;
}

function OpenApply() {
  const [track, setTrack] = useState(readTrack);
  useEffect(() => {
    const back = () => setTrack(readTrack());
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const pick = (t) => {
    const q = new URLSearchParams(location.search);
    if (t) q.set('track', t); else q.delete('track');
    const qs = q.toString();
    history.pushState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
    setTrack(t);
    window.scrollTo({ top: 0 });
  };
  if (track === 'content') return <ContentForm onBack={() => pick(null)} />;
  if (track === 'journey') return <JourneyForm onBack={() => pick(null)} />;
  return <Tracks onPick={pick} />;
}

const TRACKS = [
  { key: 'journey', title: 'خبير رحلة', lead: 'يرافق القادة كوتشًا ومستشارًا ومقيّمًا.', more: 'تخدم المشاركين في مراحل البرنامج بالدور الذي تختاره، وتُسند إليك الخدمات بحسب أبعادك ومستوياتك وطاقتك.' },
  { key: 'content', title: 'خبير محتوى', lead: 'يراجع الكتاب الأم ومحتوى البرنامج ضمن لجنة المحتوى أو لجنة القياس.', more: 'تقرأ الكتاب الأم قبل أن يصل إلى القادة، وتعلّق على أي قسم باسمك وصفتك.' },
];
function Tracks({ onPick }) {
  return (
    <div className="page narrow">
      <section className="card stack xp">
        <p className="eyebrow">خبراء البرنامج</p>
        <h1 className="as-h2">انضم إلى خبراء برنامج القادة</h1>
        <p className="muted">للخبراء في البرنامج مساران، لكل منهما طلبه ومراجعته. اختر ما يناسب خبرتك.</p>
        <div className="xp-tracks">{TRACKS.map((t) => (
          // الزر لا يحوي إلا محتوى سطريًا: العنوان والسطران span، فلا عنوان مسطّح داخل زر
          <button key={t.key} type="button" className={`xp-track xp-track-${t.key}`} onClick={() => onPick(t.key)}>
            <span className="xp-track-t">{t.title}</span>
            <span className="xp-track-lead">{t.lead}</span>
            <span className="xp-track-more">{t.more}</span>
            <span className="xp-track-go">قدّم طلبك <span aria-hidden="true">←</span></span>
          </button>
        ))}</div>
      </section>
    </div>
  );
}

const BackToTracks = ({ onBack }) => (onBack ? <button type="button" className="xp-back" onClick={onBack}><span aria-hidden="true">→</span> المساران</button> : null);

// ── خبير المحتوى: مختصر ويركز على المراجعة. لا أدوار ولا مستويات ولا ساعات ولا قطاعات (contentApplyError على الخادم) ──
const CONTENT_EMPTY = { full_name: '', email: '', title: '', committees: [], dimensions: [], bio: '', work_url: '' };
const COMMITTEE_HINT = { content: 'صحة ما يُدرَّس: المتن والأمثلة والمختبرات في جزء إطارك', measurement: 'صحة ما يُقاس به: الأسئلة ومفاتيحها والدرجات وحدود المستويات في الكتاب كله' };
const WHY = [
  ['لماذا تنضم', 'ما تراجعه يصل إلى كل قائد يقرأ الكتاب الأم: التصويب الذي تقترحه اليوم يقرؤه القادة في كل دفعة بعده.'],
  ['ماذا تراجع، وكم يأخذ من وقتك', 'عضو لجنة المحتوى يراجع جزء إطاره من الكتاب، ويقرأ الكتاب كله. وعضو لجنة القياس يراجع الأسئلة والمفاتيح في الكتاب كله. تقرأ وتعلّق في الوقت الذي يناسبك، ولكل مسودة مهلة خمسة أيام عمل للرد.'],
  ['كيف يُنسب تعليقك', 'يظهر كل تعليق باسمك وصفتك في اللجنة. وما تكتبه في جزء خارج إطارك يظهر موسومًا: «خبير من خارج الإطار».'],
  ['السرية', 'في أول دخول تؤكد تعهد السرية قبل أن يُفتح الكتاب، وكل نسخة منه تحمل علامة مائية باسمك وبريدك.'],
];
function ContentForm({ onBack }) {
  const [v, setV] = useState(CONTENT_EMPTY);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const needsDim = v.committees.includes('content');
  const { busy, done, submit, gate } = useSubmit({
    send: (captcha) => call('expert.apply', { ...v, track: 'content', captcha }),
    check: () => (!v.committees.length ? COMMITTEE_NEEDED_AR : needsDim && !v.dimensions.length ? CONTENT_DIM_AR : null),
  });
  if (done) return <Received title="وصل طلب عضويتك" text="نراجع طلبات العضوية خلال 5 أيام عمل، ونراسلك بالنتيجة على بريدك. وإن اعتُمدت فُتح لك الكتاب الأم في بوابة الخبير." />;
  return (
    <div className="page narrow">
      <form className="card stack xp xp-content" onSubmit={submit}>
        <BackToTracks onBack={onBack} />
        <p className="eyebrow">لجنتا المحتوى والقياس</p>
        <h1 className="as-h2">انضم كخبير محتوى</h1>
        <p className="muted">يراجع خبير المحتوى الكتاب الأم لبرنامج القادة ومحتواه قبل أن يصل إلى القادة، عضوًا في لجنة المحتوى أو لجنة القياس.</p>
        <dl className="xp-why">{WHY.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>

        <div className="xp-grid">
          <label className="field"><span>الاسم الكامل *</span><input className="input" required value={v.full_name} onChange={set('full_name')} maxLength={120} autoComplete="name" /></label>
          <label className="field"><span>البريد الإلكتروني *</span><EmailInput className="input" dir="ltr" type="email" required value={v.email} onChange={set('email')} autoComplete="email" /></label>
          <label className="field"><span>المسمى المهني</span><input className="input" value={v.title} onChange={set('title')} maxLength={160} placeholder="مثل: مصممة تعلم، باحث في القياس" /></label>
        </div>

        <Pick legend="اللجنة المطلوبة *" options={Object.entries(COMMITTEE_AR).map(([k, l]) => [k, l, COMMITTEE_HINT[k]])} value={v.committees} onChange={(committees) => setV({ ...v, committees })} />
        <Pick legend={needsDim ? 'الإطار الذي تراجعه *' : 'الإطار الذي تراجعه'} hint={needsDim ? 'مقعدك في لجنة المحتوى هو إطارك، واختر إطارًا واحدًا على الأقل.' : v.committees.length ? 'لجنة القياس تراجع الكتاب كله، والإطار يعرّف بخبرتك.' : 'الإطار شرط لعضوية لجنة المحتوى، واختياري للجنة القياس.'}
          options={Object.entries(DIM_AR).map(([k, l]) => [k, l])} value={v.dimensions} onChange={(dimensions) => setV({ ...v, dimensions })} />

        <label className="field"><span>خبرتك في المحتوى *</span>
          <textarea className="input" rows={5} required minLength={80} maxLength={2900} value={v.bio} onChange={set('bio')} placeholder="تأليف، أو تصميم تعلم، أو بحث، أو قياس: ما أنجزته فيه، وأين، وما تضيفه للمراجعة" />
          <small className="muted">{v.bio.length < 80 ? `${80 - v.bio.length} حرفًا على الأقل بعد` : 'ممتاز'}</small></label>
        <label className="field"><span>رابط لأعمالك أو سيرتك</span><input className="input" dir="ltr" type="text" inputMode="url" autoComplete="url" value={v.work_url} onChange={set('work_url')} maxLength={300} placeholder="https://…" /><small className="muted">اختياري: صفحة أعمال، أو سيرة، أو LinkedIn.</small></label>

        {gate}
        <button className="btn" disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'أرسل طلب العضوية'}</button>
        <p className="small muted">نستخدم بياناتك لمراجعة طلب عضويتك ونسبة تعليقك إليك فقط، ولا تُشارك مع أي جهة.</p>
      </form>
    </div>
  );
}

// ── خبير الرحلة: النموذج نفسه للطلب المفتوح، ولاستكمال المدعو ملفه في لوحة الخبير (expert + onSaved) ──
// reviewer: عضو لجنة مدعو بلا دور في الرحلة، يُطلب منه الاسم والنبذة والإطار وحدها بلا حقول المطابقة (portalProfileSave)
function JourneyForm({ expert = null, save = null, onSaved = null, reviewer = false, onBack = null }) {
  const needsDim = !reviewer || (expert?.committees || []).includes('content');
  const [v, setV] = useState(() => (expert ? fromExpert(expert) : EMPTY));
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const { busy, done, submit, gate } = useSubmit({ send: (captcha) => call('expert.apply', { ...v, captcha }), save: save && (() => save(v)), onSaved });

  if (done) return <Received title="وصل طلبك" text="نراجع طلبات الانضمام خلال 5 أيام عمل، ونراسلك بالنتيجة على بريدك." />;
  return (
    <div className="page narrow">
      <form className="card stack xp" onSubmit={submit}>
        <BackToTracks onBack={onBack} />
        <p className="eyebrow">شبكة الخبراء</p>
        <h1 className="as-h2">{reviewer ? 'أكّد بياناتك لمراجعة الكتاب الأم' : expert ? 'استكمل ملفك كخبير' : 'انضم إلى شبكة خبراء برنامج القادة'}</h1>
        {reviewer ? <p className="muted">اسمك ونبذة عن خبرتك{needsDim ? ' والإطار الذي تراجعه' : ''}، ليظهر تعليقك في الكتاب باسمك وصفتك. نعتمد عضويتك ثم يُفتح لك الكتاب.</p> : expert ? <p className="muted">أدوارك والأبعاد التي تتقنها ونبذة عن خبرتك، ليُسند إليك ما يناسبك. نراجع الملف ثم نفعّل لوحتك.</p> : <p className="muted">نبحث عن خبراء في إدارة المشروعات وتحويلها إلى أثر وتمكين القادة، يرافقون القادة موجّهين ومستشارين ومقيّمين. يُراجع كل طلب قبل إسناد أي خدمة.</p>}

        <div className="xp-grid">
          <label className="field"><span>الاسم الكامل *</span><input className="input" required value={v.full_name} onChange={set('full_name')} maxLength={120} autoComplete="name" /></label>
          <label className="field"><span>البريد الإلكتروني *</span><EmailInput className="input" dir="ltr" type="email" required readOnly={!!expert} value={v.email} onChange={set('email')} autoComplete="email" /></label>
          <label className="field"><span>المسمى المهني</span><input className="input" value={v.title} onChange={set('title')} maxLength={160} placeholder="مثل: مستشار إدارة محافظ، PMP" /></label>
          <label className="field"><span>الجوال</span><input className="input" dir="ltr" value={v.phone} onChange={set('phone')} autoComplete="tel" /></label>
          <label className="field"><span>LinkedIn</span><input className="input" dir="ltr" value={v.linkedin_url} onChange={set('linkedin_url')} placeholder="https://www.linkedin.com/in/…" /></label>
          <label className="field"><span>سنوات الخبرة</span><input className="input" inputMode="numeric" value={v.years_experience} onChange={set('years_experience')} /></label>
        </div>

        {!reviewer && <Pick legend="كيف تحب أن تخدم؟ *" options={Object.entries(EXPERT_ROLE_AR).map(([k, [l, h]]) => [k, l, h])} value={v.roles} onChange={(roles) => setV({ ...v, roles })} />}
        <Pick legend={reviewer ? `الإطار الذي تراجعه${needsDim ? ' *' : ''}` : 'أبعاد البرنامج التي تتقنها *'} options={Object.entries(DIM_AR).map(([k, l]) => [k, l])} value={v.dimensions} onChange={(dimensions) => setV({ ...v, dimensions })} />
        {!reviewer && <Pick legend="مستويات القادة التي تناسبك" options={Object.entries(LEVEL_AR).map(([k, l]) => [k, l])} value={v.levels} onChange={(levels) => setV({ ...v, levels })} />}
        <Pick legend="لغات العمل" options={Object.entries(LANG)} value={v.languages} onChange={(languages) => setV({ ...v, languages })} />

        {!reviewer && <div className="xp-grid">
          <label className="field"><span>القطاعات التي عملت فيها</span><input className="input" value={v.sectors} onChange={set('sectors')} placeholder="حكومي، طاقة، صحة" /></label>
          <label className="field"><span>الساعات المتاحة أسبوعيًا</span><input className="input" inputMode="numeric" value={v.weekly_hours} onChange={set('weekly_hours')} /></label>
        </div>}
        <label className="field"><span>عرّف بخبرتك *</span>
          <textarea className="input" rows={5} required minLength={80} maxLength={3000} value={v.bio} onChange={set('bio')} placeholder="مشاريع قدتها أو أشرفت عليها، والمنهجيات التي تعمل بها، وما تضيفه للقادة" />
          <small className="muted">{v.bio.length < 80 ? `${80 - v.bio.length} حرفًا على الأقل بعد` : 'ممتاز'}</small></label>

        {gate}
        <button className="btn" disabled={busy}>{busy ? 'جارٍ الإرسال…' : expert ? 'احفظ الملف وأرسله للمراجعة' : 'أرسل طلب الانضمام'}</button>
        <p className="small muted">{reviewer ? 'نستخدم بياناتك لعضويتك في اللجنة ونسبة تعليقك إليك فقط، ولا تُشارك مع أي جهة.' : 'نستخدم بياناتك لمراجعة طلبك وإسناد الخدمات إليك فقط، ولا تُشارك مع أي جهة.'}</p>
      </form>
    </div>
  );
}
