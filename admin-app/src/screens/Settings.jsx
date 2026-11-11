// ════════════════════════════════════════════════════════════════
// الإعدادات: الملف، تطبيق المصادقة، مفاتيح المرور، الجلسات، المستخدمون
// ════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import Ico from '../../../shared/ui/Ico.jsx';
import { BRAND } from '../../../shared/js/brand.js';
import { call, fmtDate, ROLE_LABELS, session } from '../api.js';
import { passkeyCancelled, passkeyCreate, passkeySupported } from '../passkey.js';
import { useEscape, useUI } from '../ui.jsx';
import QRCode from 'qrcode';
import { isSuperAdminUser } from '../leaders.js';

const METHOD = { passkey: 'مفتاح المرور', totp: 'تطبيق المصادقة', email: 'رمز البريد' };

// رمز QR يُولَّد محليًا من حزمة qrcode، فلا يُحمَّل سكربت من خارج اللوحة
function Qr({ uri }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(uri, { width: 160, margin: 1, errorCorrectionLevel: 'M', color: { dark: BRAND.ink, light: BRAND['off-white'] } })
      .then((u) => { if (live) setSrc(u); }).catch(() => {});
    return () => { live = false; };
  }, [uri]);
  return src ? <img src={src} width="160" height="160" alt="رمز QR لتطبيق المصادقة" /> : null;
}

function Totp({ user, onUser }) {
  const { toast, confirm, prompt } = useUI();
  const [setup, setSetup] = useState(null);   // { secret, uri }
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  // تغيير TOTP المفعّل أو تعطيله يطلب رمزه الحالي، فلا تكفي جلسة مسروقة لإزالته
  const currentCode = async () => {
    const c = ((await prompt('أدخل الرمز الحالي من تطبيق المصادقة (6 أرقام)')) || '').trim();
    if (!/^\d{6}$/.test(c)) { if (c) toast('❌ الرمز 6 أرقام'); return ''; }
    return c;
  };
  const begin = async () => {
    const d = await call('setup-totp', { email: user.email });
    if (!d.success) return toast('❌ ' + d.message);
    setSetup({ secret: d.secret, uri: d.uri }); setCode(''); setError('');
  };
  const reset = async () => {
    if (!(await confirm('سيتم توليد رمز QR جديد، والتطبيق القديم لن يعمل. متابعة؟'))) return;
    const c = await currentCode(); if (!c) return;
    const d = await call('reset-totp', { email: user.email, code: c });
    if (!d.success) return toast('❌ ' + d.message);
    setSetup({ secret: d.secret, uri: d.uri }); setCode(''); setError('');
  };
  const disable = async () => {
    if (!(await confirm('سيتم تعطيل TOTP وستعتمد على رمز البريد فقط. متابعة؟', { danger: true }))) return;
    const c = await currentCode(); if (!c) return;
    const d = await call('disable-totp', { email: user.email, code: c });
    if (!d.success) return toast('❌ ' + d.message);
    onUser({ totp_enabled: false }); setSetup(null);
    toast('✅ تم تعطيل TOTP');
  };
  const confirmSetup = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) return setError('الرمز 6 أرقام');
    const d = await call('confirm-totp', { email: user.email, code: code.trim() });
    if (!d.success) return setError(d.message);
    onUser({ totp_enabled: true }); setSetup(null);
    toast('✅ تم تفعيل TOTP');
  };

  const on = !!user.totp_enabled;
  return (
    <>
      <div className="totp-status-row"><div className="totp-status-info">
        <div className={`totp-status-dot ${on ? 'on' : 'off'}`} />
        <div><div className="totp-status-label">{on ? 'TOTP مفعّل' : 'TOTP غير مفعّل'}</div>
          {/* من فعّل التطبيق لا يُقبل منه رمز البريد ولا يُرسل له (admin-api: login-send وlogin-verify) */}
          <div className="totp-status-sub">{on ? 'يقبل رمز التطبيق وحده عند الدخول، ولا يُرسل لك رمز بريد' : 'يستخدم رمز البريد فقط حالياً'}</div></div>
      </div></div>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        {on ? <>
          <button className="btn-sm ghost" onClick={reset}><Ico name="refresh" /> إعادة ربط التطبيق</button>
          <button className="btn-sm danger" onClick={disable}>تعطيل TOTP</button>
        </> : <button className="btn-sm primary" onClick={begin}><Ico name="lock" /> تفعيل TOTP</button>}
      </div>
      {setup && (
        <form onSubmit={confirmSetup}>
          <div className="qr-wrap-modal">
            <Qr uri={setup.uri} />
            <div className="qr-apps"><span className="qr-app-tag">Google Authenticator</span><span className="qr-app-tag">Authy</span><span className="qr-app-tag">1Password</span></div>
            <div style={{ fontSize: '.74rem', color: 'var(--ink-light)' }}>أو أدخل يدوياً:</div>
            <div className="qr-secret-txt">{setup.secret}</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="totpConfirm">رمز التأكيد من التطبيق</label>
            <input id="totpConfirm" className="form-input code-input" placeholder="• • • • • •" maxLength={6} inputMode="numeric" autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </div>
          <button className="login-btn" type="submit">تأكيد الإعداد</button>
          {error && <div className="login-error show" role="alert">{error}</div>}
        </form>
      )}
    </>
  );
}

function Security({ onUser }) {
  const { toast, confirm, prompt } = useUI();
  const [sec, setSec] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [adding, setAdding] = useState(false);

  const loadSessions = useCallback(async () => {
    const d = await call('sessions-list');
    setSessions(d.success ? d.sessions : []);
  }, []);
  const load = useCallback(async () => {
    const d = await call('security-status');
    setSec(d.success ? d : { passkeys: [] });
    loadSessions();
  }, [loadSessions]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!passkeySupported()) return toast('❌ المتصفح لا يدعم مفاتيح المرور');
    const label = await prompt('اسم الجهاز (مثل: آيفون، ماك العمل)', '');
    if (label === null) return;
    setAdding(true);
    try {
      const o = await call('passkey-register-options');
      if (!o.success) throw new Error(o.message);
      const response = await passkeyCreate(o.options);
      const d = await call('passkey-register-verify', { response, label });
      if (!d.success) throw new Error(d.message);
      toast('✅ ' + d.message);
      load();
    } catch (e) {
      if (e?.name === 'InvalidStateError') toast('هذا الجهاز مسجّل مسبقًا');
      else if (!passkeyCancelled(e)) toast('❌ ' + (e.message || 'تعذّر حفظ المفتاح'));
    } finally { setAdding(false); }
  };
  const remove = async (id) => {
    if (!(await confirm('حذف هذا المفتاح؟ لن يفتح حسابك بعد الآن.', { danger: true }))) return;
    const d = await call('passkey-delete', { id });
    toast((d.success ? '✅ ' : '❌ ') + d.message);
    if (d.success) load();
  };
  const toggleOnly = async () => {
    const enable = !sec.passkey_only;
    if (enable && !(await confirm('بعد التفعيل لن تقبل رموز البريد ولا تطبيق المصادقة، وتُنهى الجلسات المفتوحة بها. تأكد أن لديك مفتاحين يعملان. متابعة؟'))) return;
    const d = await call('passkey-only', { enable });
    if (!d.success) return toast('❌ ' + d.message);
    onUser({ passkey_only: d.passkey_only });
    toast(d.passkey_only ? '✅ الدخول الآن بمفتاح المرور وحده' : '✅ عادت رموز البريد وتطبيق المصادقة');
    load();
  };
  const revokeOthers = async () => {
    if (!(await confirm('إنهاء كل جلساتك في الأجهزة الأخرى؟', { danger: true }))) return;
    const d = await call('sessions-revoke-others');
    toast((d.success ? '✅ ' : '❌ ') + d.message);
    if (d.success) loadSessions();
  };

  if (!sec) return <div className="pk-sub">جارٍ التحميل...</div>;
  const only = !!sec.passkey_only;
  return (
    <>
      <div className="settings-section-title" style={{ marginTop: 18 }}>
        <span>مفاتيح المرور</span>
        <button className="btn-sm primary" onClick={add} disabled={adding} style={{ fontSize: '.72rem', padding: '4px 10px' }}>+ إضافة مفتاح</button>
      </div>
      <div className="security-note">بصمة الوجه أو الإصبع أو قفل الجهاز. يعمل في لوحة الإدارة ودخول المستشار في المصفوفة، ولا يمكن تصيّده.</div>
      <div className="pk-list">
        {sec.passkeys.length ? sec.passkeys.map((p) => (
          <div className="pk-row" key={p.id}>
            <div>
              <div className="pk-name"><Ico name="key" /> {p.device_label || 'مفتاح مرور'}{p.backed_up ? ' · متزامن' : ''}</div>
              <div className="pk-sub">أُضيف {fmtDate(p.created_at)}{p.last_used_at ? ` · آخر استخدام ${fmtDate(p.last_used_at)}` : ''}</div>
            </div>
            <button className="btn-sm danger" onClick={() => remove(p.id)}>حذف</button>
          </div>
        )) : <div className="pk-sub">لا توجد مفاتيح بعد. أضف مفتاحًا لهذا الجهاز ثم مفتاحًا احتياطيًا.</div>}
      </div>
      <div className="totp-status-row">
        <div className="totp-status-info">
          <div className={`totp-status-dot ${only ? 'on' : 'off'}`} />
          <div>
            <div className="totp-status-label">الدخول بمفتاح المرور وحده: {only ? 'مفعّل' : 'غير مفعّل'}</div>
            <div className="totp-status-sub">{only ? 'رموز البريد وتطبيق المصادقة لا تفتح حسابك' : `يتطلب مفتاحين ودخولًا بمفتاح. الجلسة الحالية: ${METHOD[sec.method] || 'قديمة'}`}</div>
          </div>
        </div>
        <button className="btn-sm ghost" onClick={toggleOnly}>{only ? 'تعطيل' : 'تفعيل'}</button>
      </div>
      <div className="settings-section-title" style={{ marginTop: 18 }}>
        <span>الجلسات النشطة</span>
        <button className="btn-sm danger" onClick={revokeOthers} style={{ fontSize: '.72rem', padding: '4px 10px' }}>إنهاء الجلسات الأخرى</button>
      </div>
      <div className="pk-list">
        {sessions.map((x, i) => (
          <div className="pk-row" key={i}><div>
            <div className="pk-name">{x.current ? '● هذه الجلسة' : 'جلسة أخرى'} · {METHOD[x.method] || 'قديمة'}</div>
            <div className="pk-sub" style={{ direction: 'ltr', textAlign: 'right' }}>{x.ip || ''} {(x.ua || '').slice(0, 60)}</div>
            <div className="pk-sub">{x.auth_at ? `الدخول ${fmtDate(new Date(x.auth_at).toISOString())}` : ''}</div>
          </div></div>
        ))}
      </div>
    </>
  );
}

function Users({ me }) {
  const { toast, confirm } = useUI();
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState(null);   // { name, email, role }
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const d = await call('list-users', { email: me.email });
    setUsers(d.success ? d.users || [] : []);
  }, [me.email]);
  useEffect(() => { load(); }, [load]);

  const update = async (id, field, value) => {
    const d = await call('update-user', { email: me.email, targetId: id, field, value });
    if (!d.success) { toast('❌ ' + d.message); return false; }
    return true;
  };
  // القائمة تعرض الدور المحفوظ وحده (value لا defaultValue): ما رفضه الخادم أو أُلغي تأكيده لا يبقى ظاهرًا
  const changeRole = async (u, role) => {
    if (role === 'super_admin' && !(await confirm(`منح ${u.name} دور «${ROLE_LABELS.super_admin}»؟ يملك به إدارة المستخدمين وأدوارهم وكل صلاحيات اللوحة.`))) return;
    if (!(await update(u.id, 'role_id', role))) return;
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, role_id: role } : x)));
    toast('✅ تم التحديث');
  };
  const toggleActive = async (u) => {
    if (u.is_active && !(await confirm(`تعطيل حساب ${u.name}؟ لا يدخل اللوحة حتى تعيد تفعيله.`, { danger: true, ok: 'تعطيل' }))) return;
    if (await update(u.id, 'is_active', !u.is_active)) load();
  };
  const resetAccess = async (u) => {
    if (!(await confirm(`إعادة وصول ${u.name}؟ يُلغى مفتاح المرور الوحيد وتطبيق المصادقة، ويدخل برمز البريد.`, { danger: true, ok: 'إعادة الوصول' }))) return;
    if (await update(u.id, 'reset_access', true)) { toast('✅ أُعيد الوصول وأُبلغ بالبريد'); load(); }
  };
  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email.trim()) return setError('الاسم والبريد مطلوبان');
    const d = await call('add-user', { email: me.email, newName: form.name.trim(), newEmail: form.email.trim(), newRole: form.role });
    if (!d.success) return setError(d.message);
    setForm(null); load();
    toast('✅ تم إضافة المستخدم');
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <span>إدارة المستخدمين</span>
        <button className="btn-sm primary" onClick={() => setForm(form ? null : { name: '', email: '', role: 'admin' })} style={{ fontSize: '.72rem', padding: '4px 10px' }}>+ إضافة</button>
      </div>
      {form && (
        <form className="add-user-form open" onSubmit={save}>
          <div className="form-row-3">
            <div><label className="form-label" htmlFor="nuName">الاسم</label><input id="nuName" className="form-input" placeholder="الاسم الكامل" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="form-label" htmlFor="nuEmail">البريد</label><input id="nuEmail" className="form-input" type="email" dir="ltr" placeholder="email@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="form-label" htmlFor="nuRole">الدور</label>
              <select id="nuRole" className="form-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="admin">مدير نظام</option><option value="viewer">مراقب</option><option value="super_admin">مدير عام</option>
              </select></div>
          </div>
          <div className="btn-row"><button className="btn-sm primary" type="submit">حفظ</button><button className="btn-sm ghost" type="button" onClick={() => setForm(null)}>إلغاء</button></div>
          {error && <div className="login-error show" role="alert">{error}</div>}
        </form>
      )}
      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        <table className="users-table">
          <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>TOTP</th><th>نشط</th></tr></thead>
          <tbody>
            {!users ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-light)' }}>جارٍ التحميل...</td></tr>
              : !users.length ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-light)' }}>لا يوجد مستخدمون</td></tr>
                : users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.name}{u.is_owner && <span className="owner-badge">المالك</span>}</td>
                    <td style={{ fontSize: '.78rem', color: 'var(--ink-mid)', direction: 'ltr' }}>{u.email}</td>
                    <td>
                      <select className="role-select" value={u.role_id} disabled={u.is_owner} title={u.is_owner ? 'حساب المالك محمي' : undefined} aria-label={`دور ${u.name}`}
                        onChange={(e) => changeRole(u, e.target.value)}>
                        {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                    <td><span style={{ fontSize: '.7rem', padding: '2px 7px', borderRadius: 99, background: u.totp_enabled ? 'rgba(74,122,58,.1)' : 'var(--sand-light)', color: u.totp_enabled ? 'var(--st-ok)' : 'var(--ink-faint)' }}>{u.totp_enabled ? '✓ نشط' : u.passkey_only ? 'مفتاح فقط' : '—'}</span>
                      {me.is_owner && !u.is_owner && (u.totp_enabled || u.passkey_only) && (
                        <button className="btn-ghost-small" style={{ marginInlineStart: 6 }} title="يدخل برمز البريد ثم يضبط وسيلته من جديد"
                          onClick={() => resetAccess(u)}>إعادة الوصول</button>
                      )}</td>
                    <td>{u.is_owner ? <Ico name="lock" /> : (
                      <button className={`toggle-btn ${u.is_active ? 'on' : 'off'}`} role="switch" aria-checked={!!u.is_active} aria-label={`تفعيل ${u.name}`}
                        onClick={() => toggleActive(u)} />
                    )}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Settings({ user, onUser, onClose }) {
  useEscape(onClose);
  return (
    <div className="modal-overlay open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label="الإعدادات">
        <div className="modal-header">
          <div><div className="modal-eyebrow">Account Settings</div><div className="modal-title">الإعدادات</div></div>
          <button className="modal-close" onClick={onClose} aria-label="إغلاق">✕</button>
        </div>
        <div className="modal-body">
          <div className="settings-section">
            <div className="settings-section-title">الملف الشخصي</div>
            <div className="profile-row"><span className="profile-key">الاسم</span><span className="profile-val">{user.name || '—'}{user.is_owner && <span className="owner-badge">المالك</span>}</span></div>
            <div className="profile-row"><span className="profile-key">البريد</span><span className="profile-val">{user.email}</span></div>
            <div className="profile-row"><span className="profile-key">الصلاحية</span><span className="profile-val">{ROLE_LABELS[user.role_id || user.role] || '—'}</span></div>
          </div>
          <div className="settings-section">
            <div className="settings-section-title">أمان الحساب</div>
            <Totp user={user} onUser={onUser} />
            <Security onUser={onUser} />
          </div>
          {isSuperAdminUser(user) && <Users me={user} />}
        </div>
      </div>
    </div>
  );
}

// يُستعمل في App لحفظ تغيّر بيانات المستخدم في الجلسة أيضًا
export const persistUser = (patch) => session.patchUser(patch);
