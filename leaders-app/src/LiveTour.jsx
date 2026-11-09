// ════════════════════════════════════════════════════════════════
// الجولة الحيّة التفاعلية لحساب العرض: إضاءة العنصر المقصود ولوحة شرح، خطوة خطوة على شاشات حقيقية
// ════════════════════════════════════════════════════════════════
// تظهر لحساب العرض وحده (رابط من لوحة الإدارة: /#demo=<جلسة>). الخطوات في tour-steps.js:
// كل خطوة تنقل إلى شاشتها، وتضيء العنصر الذي يحمل data-tour المطابق، وتشرحه؛ وبعضها يفعل فعلًا
// بضغطة (الدخول، تعبئة الملف، إرسال القياس، طرح سؤال أقران تجريبي). التعتيم لا يحجب النقر، فالمقدِّم
// يستطيع التفاعل مع الشاشة أثناء الشرح. وضع المقدِّم يكبّر النص لجهاز العرض، والأسهم تنقل بين الخطوات.
// التصور: docs/journey/2026-11-05-تصور-الجولة-الحية-التفاعلية-v1.md
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { call } from './api.js';
import { TOUR_ACTS, TOUR_AUDIO, TOUR_AUDIO_BASE, TOUR_PEER_SAMPLE, TOUR_STEPS } from './tour-steps.js';

const KEY = 'mi_demo_step';
export const DEMO_PENDING = 'mi_demo_pending';
const PRESENTER = 'mi_tour_presenter';
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* وضع خاص */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* وضع خاص */ } },
};

// رابط العرض: /#demo=<جلسة> يُحفظ ولا يُدخل تلقائيًا، فيبدأ العرض من شاشة الدخول
export function captureDemoLink() {
  const m = location.hash.match(/^#demo=([A-Za-z0-9_-]{20,})$/);
  if (!m) return false;
  store.set(DEMO_PENDING, m[1]);
  store.set(KEY, '0');
  history.replaceState(null, '', location.pathname);
  return true;
}
export const demoPending = () => !!store.get(DEMO_PENDING);

// يُعلم الشاشات المفتوحة بأن بيانات الجولة تغيّرت (مثل طلب أقران جديد) لتعيد التحميل
export const TOUR_REFRESH = 'mi-tour-refresh';

// موضع العنصر المضاء: يُبحث عنه بعد الانتقال (حتى 4 ثوانٍ)، ويُمرَّر إلى وسط الشاشة، ويُتابَع عند التمرير وتغيير المقاس
function useSpotlight(anchor, active) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    setRect(null);
    if (!active || !anchor) return undefined;
    let el = null, tries = 0, stopped = false, timer = 0;
    const find = () => document.querySelector(`[data-tour="${anchor}"]`);
    const measure = () => {
      if (stopped || !el || !el.isConnected) { el = null; return; }
      const r = el.getBoundingClientRect();
      setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    const seek = () => {
      if (stopped) return;
      el = find();
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); timer = setTimeout(measure, 420); return; }
      if (tries++ < 40) timer = setTimeout(seek, 100);
    };
    seek();
    const onChange = () => { if (el) measure(); else if (tries >= 40) seek(); };
    window.addEventListener('scroll', onChange, true);
    window.addEventListener('resize', onChange);
    const iv = setInterval(onChange, 600);
    return () => { stopped = true; clearTimeout(timer); clearInterval(iv); window.removeEventListener('scroll', onChange, true); window.removeEventListener('resize', onChange); };
  }, [anchor, active]);
  return rect;
}

export default function LiveTour({ me, onAccept, onGo }) {
  const [i, setI] = useState(() => Math.min(TOUR_STEPS.length - 1, Math.max(0, Number(store.get(KEY)) || 0)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [min, setMin] = useState(false);
  const [presenter, setPresenter] = useState(() => store.get(PRESENTER) === '1');
  const [audioOk, setAudioOk] = useState(TOUR_AUDIO);
  const audio = useRef(null);
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;
  const signedIn = !!me;
  const rect = useSpotlight(step.anchor, !min && (signedIn || !step.go));

  const to = useCallback((n) => {
    const k = Math.min(TOUR_STEPS.length - 1, Math.max(0, n));
    setI(k); store.set(KEY, String(k)); setErr('');
    audio.current?.pause();
    if (TOUR_STEPS[k].go && me) onGo(TOUR_STEPS[k].go);
  }, [me, onGo]);

  // الأسهم تنقل بين الخطوات، وEscape يصغّر اللوحة (لا تعمل أثناء الكتابة في حقل)
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || e.target?.isContentEditable) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (!TOUR_STEPS[i].act || signedIn) to(i + 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); to(i - 1); }
      else if (e.key === 'Escape') setMin((m) => !m);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [i, signedIn, to]);

  const run = async () => {
    setBusy(true); setErr('');
    try {
      if (step.act === 'login') {
        const token = store.get(DEMO_PENDING);
        if (!token) throw new Error('افتح رابط العرض من لوحة الإدارة من جديد');
        onAccept({ token });
        const r = await call('me');
        if (!r.success) throw new Error(r.message);
        store.del(DEMO_PENDING);
        onAccept(r);
      } else if (step.act === 'profile') {
        const r = await call('demo.fill-profile');
        if (!r.success) throw new Error(r.message);
        onAccept(r);
      } else if (step.act === 'assessment') {
        const r = await call('demo.fill-assessment');
        if (!r.success) throw new Error(r.message);
        onAccept(r);
      } else if (step.act === 'peer') {
        const r = await call('peer.ask', { text: TOUR_PEER_SAMPLE, source: 'free', ref_id: null, target_team: null });
        if (!r.success) throw new Error(r.message);
        window.dispatchEvent(new CustomEvent(TOUR_REFRESH));
      }
      to(i + 1);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const togglePresenter = () => { const v = !presenter; setPresenter(v); store.set(PRESENTER, v ? '1' : '0'); };
  // فعل الخطوة متاح إن لم تكن تحتاج دخولًا، أو كان المشارك داخلًا
  const canAct = step.act && (step.act === 'login' ? !signedIn : signedIn);
  const nextAllowed = !step.act || signedIn;

  if (min) return <button type="button" className="tour-pill" onClick={() => setMin(false)}>الجولة الحيّة · {i + 1} من {TOUR_STEPS.length}</button>;
  return (
    <>
      {rect && <div className="tour-spot" aria-hidden="true" style={{ left: rect.x - 8, top: rect.y - 8, width: rect.w + 16, height: rect.h + 16 }} />}
      <aside className={`tour${presenter ? ' presenter' : ''}`} role="region" aria-label="الجولة الحيّة">
        <div className="tour-steps" aria-hidden="true">{TOUR_STEPS.map((s, k) => <i key={s.key} className={k < i ? 'done' : k === i ? 'on' : ''} />)}</div>
        <div className="tour-body">
          <div className="tour-head">
            <p className="tour-eyebrow">الجولة الحيّة · الخطوة {i + 1} من {TOUR_STEPS.length}</p>
            <select className="tour-jump" aria-label="انتقل إلى خطوة" value={i} onChange={(e) => to(Number(e.target.value))}>
              {TOUR_STEPS.map((s, k) => <option key={s.key} value={k}>{k + 1}. {s.t}</option>)}
            </select>
          </div>
          <h2>{step.t}</h2>
          <p>{step.d}</p>
          {step.links && (
            <p className="tour-links">{step.links.map(([l, href]) => <a key={href} className="btn sm ghost" href={href} target="_blank" rel="noopener noreferrer">{l}</a>)}</p>
          )}
          {err && <p className="tour-err" role="alert">{err}</p>}
        </div>
        <div className="tour-actions">
          {canAct && <button type="button" className="btn" disabled={busy} onClick={run}>{busy ? 'لحظة…' : step.btn}</button>}
          {!canAct && !last && <button type="button" className="btn" disabled={!nextAllowed} onClick={() => to(i + 1)}>التالي</button>}
          {last && <button type="button" className="btn" onClick={() => to(0)}>من البداية</button>}
          {i > 0 && <button type="button" className="btn ghost" onClick={() => to(i - 1)}>السابق</button>}
          <div className="tour-tools">
            {/* مقطع الخطوة تسجيل said القديم: لا يُعرض حيث صُحّح نصها (d) حتى يُعاد التسجيل */}
            {audioOk && !step.said && (
              <button type="button" className="link small" onClick={() => { const a = audio.current; if (!a) return; if (a.paused) { a.src = `${TOUR_AUDIO_BASE}${i + 1}.mp3`; a.play().catch(() => setAudioOk(false)); } else a.pause(); }}>▶ الصوت</button>
            )}
            <button type="button" className="link small" onClick={togglePresenter} aria-pressed={presenter}>{presenter ? 'نص عادي' : 'وضع المقدِّم'}</button>
            <button type="button" className="link small" onClick={() => setMin(true)}>إخفاء</button>
          </div>
          {TOUR_AUDIO && !step.said && <audio ref={audio} preload="none" onError={() => setAudioOk(false)} />}
        </div>
      </aside>
    </>
  );
}
