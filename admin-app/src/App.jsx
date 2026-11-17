// ════════════════════════════════════════════════════════════════
// لوحة الإدارة (React) — الإطار: الدخول، الترويسة، السياقات، الإعدادات
// ════════════════════════════════════════════════════════════════
// السياقات: طلبات التواصل وتطبيق القادة ومصفوفة التأثير وزيارات الموقع.
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { lazyRetry } from './lazy-retry.js';
import { call, ROLE_LABELS, session, setExpiredHandler } from './api.js';
import { setLeadersExpired } from './leaders.js';
import { resetAiData } from './ai-hub-data.js';
import { UIProvider, useUI } from './ui.jsx';
import { writeState } from './write-access.js';
import StepUp from './StepUp.jsx';
import Login from './screens/Login.jsx';
const Settings = lazyRetry(() => import('./screens/Settings.jsx'));
const Contacts = lazyRetry(() => import('./screens/Contacts.jsx'));
const Leaders = lazyRetry(() => import('./screens/Leaders.jsx'));
const Visits = lazyRetry(() => import('./screens/Visits.jsx'));
const Matrix = lazyRetry(() => import('./screens/Matrix.jsx'));
import { navigate, parseRoute, useRoute } from './route.js';
import { badgeLabel, badgeText, leadersTotal, resetInbox, usePending } from './pending.js';
import Palette from './Palette.jsx';
import { OpsBanner } from './OpsHealth.jsx';

const LOGO = '/assets/milestone-impact-inverted.svg';

// السياق يُحفظ للجلسة، فالتحديث يعيدك حيث كنت
const CTX_KEY = 'mi_admin_next_ctx';
// الدخول يفتح تطبيق القادة على نظرته العامة (صندوق «ينتظرني»)، لا طلبات التواصل: هناك ما ينتظر القرار. ومن ترك سياقًا آخر في جلسته يعود إليه
const savedCtx = () => { try { const c = sessionStorage.getItem(CTX_KEY); return ['contacts', 'matrix', 'visits'].includes(c) ? c : 'leaders'; } catch { return 'leaders'; } };

function Dashboard({ user, onUser, onLogout, sessionGen = 0 }) {
  const [settings, setSettings] = useState(false);
  // السياق من عنوان الصفحة، وإن خلا فآخر سياق في الجلسة
  const route = useRoute();
  const ctx = route.ctx || savedCtx();
  // يُقرأ العنوان لحظة التنفيذ لا من الحالة: تغيّر العنوان بين الرسم والأثر كان يعيد اللوحة إلى السياق المحفوظ
  useEffect(() => { if (!route.ctx && !parseRoute(window.location.hash).ctx) navigate({ ctx }, { replace: true }); }, [route.ctx, ctx]);
  useEffect(() => { try { sessionStorage.setItem(CTX_KEY, ctx); } catch { /* */ } }, [ctx]);
  // السياق المفتوح نفسه لا يُعاد التنقل إليه: كان يفرغ العنوان من فلاتره، وحين تُحمَّل الشاشة الكسولة بعده تقرؤه فارغًا
  // فتضيع فلاتر رابط مشترك أو صفحة أُعيد تحميلها (التُقط مع تقسيم الحزمة، البند 9.13)
  const setCtx = (c) => { if (c !== ctx) navigate({ ctx: c }); };
  const pending = usePending(ctx);
  // عدّاد تطبيق القادة مجموع صندوق «ينتظرني» نفسه، ويحمرّ إن تأخر فيه بند عن مهلته
  const badge = { contacts: pending?.contacts || 0, leaders: leadersTotal(pending) };
  const lateOf = { leaders: pending?.badges?.late || 0 };
  const partialOf = { leaders: !!pending?.badges?.partial };
  // صلاحية الكتابة من حكم الخادم (me): جلسة رمز البريد للقراءة حتى «فعّل الكتابة» (write-access.js)
  const { toast } = useUI();
  const [me, setMe] = useState(null);
  const [elevate, setElevate] = useState(false);
  // كل قراءة برقمها: رد جلسة سابقة يصل متأخرًا لا يغلب رد الجلسة الحالية
  const meSeq = useRef(0);
  const readMe = useCallback(() => {
    const n = ++meSeq.current;
    return call('me').then((r) => { if (n !== meSeq.current) return; setMe(r); if (r?.success && r.method) onUser({ method: r.method }); })
      .catch(() => { if (n === meSeq.current) setMe(null); });
  }, [onUser]);
  // إعادة الدخول بعد انتهاء الجلسة تبقي اللوحة (المفتاح بالبريد) لكنها جلسة جديدة قد تختلف طريقتها: يُنسى حكم الجلسة
  // السابقة ويُقرأ «me» من جديد، فلا يبقى شريط «للقراءة فقط» لجلسة تكتب ولا تُعرض الكتابة لجلسة رمز البريد
  useEffect(() => { setMe(null); readMe(); }, [readMe, sessionGen]);
  const { canWrite, readOnly } = writeState(user, me);
  const elevated = async (m) => { setElevate(false); onUser({ method: m }); await readMe(); toast('فُعّلت الكتابة لهذه الجلسة'); };
  const closeSettings = useCallback(() => setSettings(false), []);
  return (
    <div id="screen-dashboard" className="visible">
      {/* عطل البريد الآن: شريط أحمر رفيع أعلى كل صفحة يفتح بطاقة الصحة (للمدير ذي الكتابة) */}
      <OpsBanner enabled={canWrite} />
      {readOnly && (
        <div className="ro-banner" role="status">
          <span className="ro-banner-text"><b>للقراءة فقط.</b> دخلت برمز البريد، فالتعديل مقفل في هذه الجلسة حتى تؤكد بمفتاح المرور أو تطبيق المصادقة.</span>
          <button type="button" className="btn-sm primary" onClick={() => setElevate(true)}>فعّل الكتابة</button>
        </div>
      )}
      {elevate && <StepUp purpose="write" title="فعّل الكتابة في هذه الجلسة" onCancel={() => setElevate(false)} onDone={elevated} />}
      <header className="dash-header">
        <div className="dash-header-left">
          <div className="mi-logo"><img className="mi-logo-img" src={LOGO} alt="Milestone Impact" width="132" height="60" /></div>
          <div className="dash-header-sep" />
          <div className="dash-header-title">لوحة الإدارة</div>
        </div>
        <div className="dash-header-right">
          <div className="dash-user">
            <div className="dash-user-name">{user.name || user.email}</div>
            <div className="dash-user-role">{ROLE_LABELS[user.role_id || user.role] || '—'}</div>
          </div>
          <button className="dash-search-btn" onClick={() => window.dispatchEvent(new Event('mi:search'))} aria-keyshortcuts="Control+K" title="البحث الشامل (Ctrl+K)">بحث <kbd>Ctrl K</kbd></button>
          <button className="dash-settings-btn" onClick={() => setSettings(true)} title="الإعدادات" aria-label="الإعدادات">⚙</button>
          <button className="dash-logout" onClick={onLogout}>خروج</button>
        </div>
      </header>

      <nav className="ctx-bar" aria-label="السياق">
        {[['contacts', 'طلبات التواصل'], ['leaders', 'تطبيق القادة'], ['matrix', 'مصفوفة التأثير'], ['visits', 'زيارات الموقع']].map(([k, l]) => (
          <button key={k} className={`ctx-tab${ctx === k ? ' active' : ''}`} data-ctx={k} aria-current={ctx === k ? 'page' : undefined} onClick={() => setCtx(k)}><span className="dot" />{l}{badge[k] > 0 && <span className={`ctx-badge${lateOf[k] ? ' late' : ''}`} aria-label={badgeLabel(badge[k], lateOf[k], partialOf[k])}>{badgeText(badge[k], partialOf[k])}</span>}</button>
        ))}
      </nav>

      {/* حد التعليق هنا لا في main.jsx وحده: الإطار (الترويسة والسياقات والبحث الشامل) يظهر فورًا
          ويستقبل Ctrl+K، وتنتظر منطقة الشاشة وحدها قطعتها الكسولة */}
      <Suspense fallback={<div className="la-loading">جارٍ التحميل…</div>}>
        {/* تغيّر الصلاحية (فعّل الكتابة) يعيد رسم الشاشة فتقرأ أزرارها وبياناتها من جديد */}
        {ctx === 'leaders' ? <Leaders key={canWrite ? 'w' : 'r'} canWrite={canWrite} pending={pending} isSuper={(user.role_id || user.role) === 'super_admin'} isOwner={!!user.is_owner} /> : ctx === 'matrix' ? <Matrix canWrite={canWrite} tab={route.tab} id={route.id} /> : ctx === 'visits' ? <Visits /> : <Contacts />}
      </Suspense>

      <Palette owner={(user.role_id || user.role) === 'super_admin' || !!user.is_owner} />
      <Suspense fallback={null}>
        {settings && <Settings user={user} onUser={onUser} onClose={closeSettings} />}
      </Suspense>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => session.load()?.user || null);
  // انتهاء الجلسة لا يفك اللوحة: تبقى الشاشة وما كُتب في نماذجها تحت نافذة إعادة الدخول،
  // ثم يُعاد الحفظ من حيث توقف (تدقيق الجاهزية admin-core-8). مدة الجلسة نفسها لا تتغير
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpiredHandler(() => { resetAiData(); setExpired(true); });
    // انتهاء الجلسة يمسح ردود «المساعد الذكي» المحفوظة، فلا تُعرض صلاحية الجلسة السابقة بعد إعادة الدخول
    setLeadersExpired(() => { resetAiData(); setExpired(true); });
  }, []);

  // من يدخل بحساب آخر تُفتح له اللوحة من جديد (المفتاح بالبريد)، فلا يرث ما فتحه غيره
  // ورقم الجلسة يتقدم مع كل دخول، فتعيد اللوحة قراءة صلاحيتها (me) لجلسة إعادة الدخول
  const [sessionGen, setSessionGen] = useState(0);
  // مخزن العدّادات مشترك على مستوى الوحدة: دخول جديد أو خروج لا يرث أعداد الجلسة السابقة
  const signedIn = (token, u) => { resetInbox(); resetAiData(); session.save(token, u); setUser(u); setExpired(false); setSessionGen((g) => g + 1); };
  const patchUser = useCallback((patch) => { session.patchUser(patch); setUser((u) => ({ ...u, ...patch })); }, []);
  const logout = async () => {
    await call('logout').catch(() => {});
    session.clear();
    resetInbox();
    resetAiData();
    setUser(null);
    setExpired(false);
  };

  return (
    <UIProvider>
      {user ? (
        <>
          {/* inert="" (React 18) يخرج اللوحة من التركيز والنقر ما دامت نافذة إعادة الدخول ظاهرة */}
          <div inert={expired ? '' : undefined}>
            <Dashboard key={user.email} user={user} onUser={patchUser} onLogout={logout} sessionGen={sessionGen} />
          </div>
          {expired && (
            <div className="reauth-overlay" role="dialog" aria-modal="true" aria-label="انتهت الجلسة">
              <Login onSignedIn={signedIn} initialEmail={user.email}
                notice="انتهت جلستك. ادخل من جديد لتكمل، وما كتبته في الشاشة باقٍ كما هو، فأعد الحفظ بعد الدخول." />
            </div>
          )}
        </>
      ) : <Login onSignedIn={signedIn} />}
    </UIProvider>
  );
}
