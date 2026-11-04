// ════════════════════════════════════════════════════════════════
// لوحة الإدارة (React) — الإطار: الدخول، الترويسة، السياقات، الإعدادات
// ════════════════════════════════════════════════════════════════
// السياقات: طلبات التواصل وتطبيق القادة ومصفوفة التأثير وزيارات الموقع.
import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { call, ROLE_LABELS, session, setExpiredHandler } from './api.js';
import { setLeadersExpired } from './leaders.js';
import { UIProvider } from './ui.jsx';
import Login from './screens/Login.jsx';
const Settings = lazy(() => import('./screens/Settings.jsx'));
const Contacts = lazy(() => import('./screens/Contacts.jsx'));
const Leaders = lazy(() => import('./screens/Leaders.jsx'));
const Visits = lazy(() => import('./screens/Visits.jsx'));
const Matrix = lazy(() => import('./screens/Matrix.jsx'));
import { navigate, useRoute } from './route.js';
import { leadersTotal, usePending } from './pending.js';
import Palette from './Palette.jsx';

const LOGO = '/assets/milestone-impact-inverted.svg';

// السياق يُحفظ للجلسة، فالتحديث يعيدك حيث كنت
const CTX_KEY = 'mi_admin_next_ctx';
const savedCtx = () => { try { const c = sessionStorage.getItem(CTX_KEY); return ['leaders', 'matrix', 'visits'].includes(c) ? c : 'contacts'; } catch { return 'contacts'; } };

function Dashboard({ user, onUser, onLogout }) {
  const [settings, setSettings] = useState(false);
  // السياق من عنوان الصفحة، وإن خلا فآخر سياق في الجلسة
  const route = useRoute();
  const ctx = route.ctx || savedCtx();
  useEffect(() => { if (!route.ctx) navigate({ ctx }, { replace: true }); }, [route.ctx, ctx]);
  useEffect(() => { try { sessionStorage.setItem(CTX_KEY, ctx); } catch { /* */ } }, [ctx]);
  const setCtx = (c) => navigate({ ctx: c });
  const pending = usePending(ctx);
  const badge = { contacts: pending?.contacts || 0, leaders: leadersTotal(pending) };
  const canWrite = (user.role_id || user.role) !== 'viewer';
  const closeSettings = useCallback(() => setSettings(false), []);
  return (
    <div id="screen-dashboard" className="visible">
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
          <button key={k} className={`ctx-tab${ctx === k ? ' active' : ''}`} data-ctx={k} aria-current={ctx === k ? 'page' : undefined} onClick={() => setCtx(k)}><span className="dot" />{l}{badge[k] > 0 && <span className="ctx-badge" aria-label={`${badge[k]} بانتظارك`}>{badge[k]}</span>}</button>
        ))}
      </nav>

      {/* حد التعليق هنا لا في main.jsx وحده: الإطار (الترويسة والسياقات والبحث الشامل) يظهر فورًا
          ويستقبل Ctrl+K، وتنتظر منطقة الشاشة وحدها قطعتها الكسولة */}
      <Suspense fallback={<div className="la-loading">جارٍ التحميل…</div>}>
        {ctx === 'leaders' ? <Leaders canWrite={canWrite} pending={pending} /> : ctx === 'matrix' ? <Matrix canWrite={canWrite} tab={route.tab} id={route.id} /> : ctx === 'visits' ? <Visits /> : <Contacts />}
      </Suspense>

      <Palette />
      <Suspense fallback={null}>
        {settings && <Settings user={user} onUser={onUser} onClose={closeSettings} />}
      </Suspense>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => session.load()?.user || null);

  useEffect(() => {
    setExpiredHandler(() => setUser(null));
    setLeadersExpired(() => setUser(null));
  }, []);

  const signedIn = (token, u) => { session.save(token, u); setUser(u); };
  const patchUser = useCallback((patch) => { session.patchUser(patch); setUser((u) => ({ ...u, ...patch })); }, []);
  const logout = async () => {
    await call('logout').catch(() => {});
    session.clear();
    setUser(null);
  };

  return (
    <UIProvider>
      {user ? <Dashboard user={user} onUser={patchUser} onLogout={logout} /> : <Login onSignedIn={signedIn} />}
    </UIProvider>
  );
}
