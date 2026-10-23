// ════════════════════════════════════════════════════════════════
// لوحة الإدارة (React) — الإطار: الدخول، الترويسة، السياقات، الإعدادات
// ════════════════════════════════════════════════════════════════
// السياقات المنقولة تُعرض هنا، وغير المنقولة بعد تفتح اللوحة القديمة.
import React, { useCallback, useEffect, useState } from 'react';
import { call, ROLE_LABELS, session, setExpiredHandler } from './api.js';
import { UIProvider } from './ui.jsx';
import Login from './screens/Login.jsx';
import Settings from './screens/Settings.jsx';
import Contacts from './screens/Contacts.jsx';

const LOGO = '/assets/milestone-impact-inverted.svg';

function Dashboard({ user, onUser, onLogout }) {
  const [settings, setSettings] = useState(false);
  const closeSettings = useCallback(() => setSettings(false), []);
  return (
    <div id="screen-dashboard" className="visible">
      <header className="dash-header">
        <div className="dash-header-left">
          <div className="mi-logo"><img className="mi-logo-img" src={LOGO} alt="Milestone Impact" width="132" height="60" /></div>
          <div className="dash-header-sep" />
          <div className="dash-header-title">لوحة الإدارة<span className="next-badge">الإصدار الجديد</span></div>
        </div>
        <div className="dash-header-right">
          <div className="dash-user">
            <div className="dash-user-name">{user.name || user.email}</div>
            <div className="dash-user-role">{ROLE_LABELS[user.role_id || user.role] || '—'}</div>
          </div>
          <button className="dash-settings-btn" onClick={() => setSettings(true)} title="الإعدادات" aria-label="الإعدادات">⚙</button>
          <button className="dash-logout" onClick={onLogout}>خروج</button>
        </div>
      </header>

      <nav className="ctx-bar" aria-label="السياق">
        <button className="ctx-tab active" data-ctx="contacts" aria-current="page"><span className="dot" />طلبات التواصل</button>
        {/* لم يُنقل بعد: يفتح اللوحة الحالية بالجلسة نفسها */}
        <a className="ctx-tab" data-ctx="leaders" href="/#leaders"><span className="dot" />تطبيق القادة</a>
        <a className="ctx-tab ext" href="https://matrix.sunkvalue.com" target="_blank" rel="noopener noreferrer">مصفوفة التأثير ↗</a>
      </nav>

      <Contacts />

      {settings && <Settings user={user} onUser={onUser} onClose={closeSettings} />}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => session.load()?.user || null);

  useEffect(() => { setExpiredHandler(() => setUser(null)); }, []);

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
