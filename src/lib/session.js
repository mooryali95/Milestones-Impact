// ════════════════════════════════════════════════════════════════
// SESSION MANAGERS — localStorage persistence with TTL
// ════════════════════════════════════════════════════════════════

const SESSION_KEY = 'mi_local_session';
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms

export const LocalSession = {
  save(userData, sessionId, dates, confirmed, submitted, reopenRequested, token) {
    try {
      const payload = {
        user: userData,
        sessionId,
        token,
        dates,
        confirmed,
        submitted,
        reopenRequested,
        savedAt: Date.now(),
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (e) { console.log('LocalSession save error:', e); }
  },
  load() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload?.savedAt) return null;
      if (Date.now() - payload.savedAt > SESSION_TTL) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return payload;
    } catch (e) { return null; }
  },
  update(fields) {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...payload, ...fields, savedAt: Date.now() }));
    } catch (e) { console.log('LocalSession update error:', e); }
  },
  clear() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  },
};

const ADMIN_SESSION_KEY = 'mi_admin_session';
const ADMIN_SESSION_TTL = 4 * 60 * 60 * 1000; // 4 hours

export const AdminSession = {
  save(token) {
    try {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ token, savedAt: Date.now() }));
    } catch (e) {}
  },
  load() {
    try {
      const raw = localStorage.getItem(ADMIN_SESSION_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload?.savedAt || Date.now() - payload.savedAt > ADMIN_SESSION_TTL) {
        localStorage.removeItem(ADMIN_SESSION_KEY);
        return null;
      }
      return payload.token;
    } catch (e) { return null; }
  },
  clear() {
    try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch (e) {}
  },
};
