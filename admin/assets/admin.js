// ══════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════
const SUPA_URL = 'https://eormhcupwgwpllhrfxxg.supabase.co';
// Public anon key — used only to pass the Edge Function gateway. It grants no
// data access; every privileged call is authorized by the admin session token.
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvcm1oY3Vwd2d3cGxsaHJmeHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3OTY2OTksImV4cCI6MjA4NjM3MjY5OX0.xbZtLH9R9mE3ogfNToojrtzQUK799y5rZrj29ggB1f0';
const ADMIN_API = `${SUPA_URL}/functions/v1/admin-api`;
const ROLE_LABELS = { super_admin: 'مدير عام', admin: 'مدير نظام', viewer: 'مراقب' };

let authToken    = null;
let currentEmail = '';
let settingsUser = null;
let allData      = [];
let filteredData = [];
let currentPage  = 1;
const PAGE_SIZE  = 20;

// ══════════════════════════════════════════════════════
// SESSION
// ══════════════════════════════════════════════════════
const Session = {
  KEY: 'mi_admin_v3',
  save(token, user) {
    try { sessionStorage.setItem(this.KEY, JSON.stringify({ token, user, ts: Date.now() })); } catch {}
  },
  load() {
    try {
      const d = JSON.parse(sessionStorage.getItem(this.KEY) || 'null');
      if (!d) return null;
      if (Date.now() - d.ts > 8 * 60 * 60 * 1000) { this.clear(); return null; }
      return d;
    } catch { return null; }
  },
  clear() { try { sessionStorage.removeItem(this.KEY); localStorage.removeItem(this.KEY); } catch {} }
};

// ══════════════════════════════════════════════════════
// SUPABASE QUERY (للداشبورد فقط)
// ══════════════════════════════════════════════════════
// All admin operations go through the admin-api Edge Function. The anon key
// only satisfies the gateway; the admin session token (carried in the body)
// is what actually authorizes each action server-side.
const LEGACY_ACTION_MAP = { 'send-code': 'login-send', 'verify-code': 'login-verify' };
async function callAuth(body) {
  const action = LEGACY_ACTION_MAP[body.action] || body.action;
  const payload = { ...body, action };
  if (authToken) payload.token = authToken;
  // إقلاع الدالة يرد 502/503/504 مؤقتًا، والدالة لم تعمل، فتُعاد المحاولة
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(ADMIN_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      if ([502, 503, 504].includes(res.status)) {
        if (i < 3) { await new Promise(r => setTimeout(r, 800 * i)); continue; }
        return { success: false, message: 'الخادم مشغول لحظيًا، حدّث الصفحة بعد ثوانٍ' };
      }
      return res.json();
    } catch (e) {
      if (i < 2) { await new Promise(r => setTimeout(r, 800)); continue; }
      return { success: false, message: 'خطأ في الاتصال بالخادم' };
    }
  }
}

// ══════════════════════════════════════════════════════
// LOGIN — Step 1: البريد
// ══════════════════════════════════════════════════════
async function handleSendEmail() {
  const email = document.getElementById('loginEmail').value.trim();
  const btn   = document.getElementById('loginBtnSend');
  if (btn.disabled) return;
  const err   = document.getElementById('loginError');
  err.classList.remove('show'); err.style.display = 'none';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showLoginError('loginError', 'يرجى إدخال بريد إلكتروني صحيح'); return;
  }
  btn.disabled = true; btn.textContent = 'جارٍ التحقق...';
  try {
    const d = await callAuth({ action: 'send-code', email });
    if (!d.success) throw new Error(d.message || 'البريد غير مسجّل');
    currentEmail = email;
    document.getElementById('loginStepEmail').style.display = 'none';
    document.getElementById('loginStepCode').style.display  = 'block';
    setTimeout(() => document.getElementById('loginCode').focus(), 100);
  } catch(e) {
    showLoginError('loginError', e.message);
  } finally { btn.disabled = false; btn.textContent = 'متابعة'; }
}
async function handleSendOtp() { await handleSendEmail(); }

// ══════════════════════════════════════════════════════
// LOGIN — إرسال OTP اختياري بالبريد
// ══════════════════════════════════════════════════════
async function handleSendEmailCode() {
  const email = currentEmail || document.getElementById('loginEmail').value.trim();
  const btn   = document.getElementById('sendCodeEmailBtn');
  btn.disabled = true; btn.textContent = 'جارٍ الإرسال...';
  try {
    const d = await callAuth({ action: 'send-code', email });
    if (!d.success) throw new Error(d.message);
    showToast('✅ تم إرسال الرمز إلى بريدك');
  } catch(e) {
    showLoginError('loginErrorCode', e.message);
  } finally { btn.disabled = false; btn.textContent = 'إرسال رمز لبريدي الإلكتروني ←'; }
}

// ══════════════════════════════════════════════════════
// LOGIN — Step 2: التحقق من الرمز (TOTP أو OTP)
// ══════════════════════════════════════════════════════
async function handleVerifyCode() {
  const email = currentEmail || document.getElementById('loginEmail').value.trim();
  const code  = document.getElementById('loginCode').value.trim();
  const btn   = document.getElementById('loginBtnVerify');
  if (btn.disabled) return;
  document.getElementById('loginErrorCode').style.display = 'none';
  if (code.length !== 6) { showLoginError('loginErrorCode', 'الرمز 6 أرقام'); return; }
  btn.disabled = true; btn.textContent = 'جارٍ التحقق...';
  try {
    const d = await callAuth({ action: 'verify-code', email, code });
    if (!d.success) throw new Error(d.message || 'الرمز غير صحيح أو منتهي الصلاحية');
    if (!d.user || !d.token) throw new Error('خطأ في الاستجابة — حاول مجدداً');
    // تأكد أن user يحتوي email
    const userObj = { ...d.user, email: d.user.email || email };
    authToken = d.token;
    Session.save(d.token, userObj);
    showDashboard(userObj, userObj.email);
  } catch(e) {
    showLoginError('loginErrorCode', e.message);
    document.getElementById('loginCode').value = '';
    document.getElementById('loginCode').focus();
  } finally { btn.disabled = false; btn.textContent = 'تأكيد الدخول'; }
}
async function handleVerifyOtp() { await handleVerifyCode(); }

function handleBackToEmail() {
  currentEmail = '';
  document.getElementById('loginStepCode').style.display  = 'none';
  document.getElementById('loginStepEmail').style.display = 'block';
  document.getElementById('loginCode').value = '';
  document.getElementById('loginErrorCode').style.display = 'none';
}

function showLoginError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg; el.classList.add('show'); el.style.display = 'block';
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  // الزر المركّز ينفّذ نقرته بنفسه؛ تجاهل Enter عليه كي لا يُرسل الرمز مرتين
  if (e.target.tagName === 'BUTTON') return;
  const login = document.getElementById('screen-login');
  if (!login || login.style.display === 'none') return;
  const codeStep = document.getElementById('loginStepCode');
  if (codeStep && codeStep.style.display !== 'none') handleVerifyCode();
  else handleSendEmail();
});

// ══════════════════════════════════════════════════════
// SETTINGS MODAL
// ══════════════════════════════════════════════════════
function openSettings() {
  const session = Session.load();
  if (!session) return;
  settingsUser = session.user;
  document.getElementById('settingsName').textContent  = session.user.name  || '—';
  document.getElementById('settingsEmail').textContent = session.user.email || '—';
  document.getElementById('settingsRole').textContent  = ROLE_LABELS[session.user.role] || session.user.role || '—';
  renderTotpStatus(!!session.user.totp_enabled);
  document.getElementById('settingsName').insertAdjacentHTML('beforeend', session.user.is_owner ? '<span class="owner-badge">المالك</span>' : '');
  loadSecurity();
  const uSection = document.getElementById('usersSection');
  if (session.user.role === 'super_admin') { uSection.style.display = 'block'; loadUsers(); }
  else uSection.style.display = 'none';
  document.getElementById('settingsOverlay').classList.add('open');
  document.getElementById('settingsQrWrap').style.display = 'none';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('settingsOverlay')?.classList.contains('open') && !document.querySelector('.mid-ov')) closeSettings();
});
function closeSettings() {
  const ov = document.getElementById('settingsOverlay');
  if (ov) ov.classList.remove('open');
}

function renderTotpStatus(enabled) {
  const dot = document.getElementById('totpDot');
  const lbl = document.getElementById('totpLabel');
  const sub = document.getElementById('totpSub');
  const bts = document.getElementById('totpBtns');
  if (!dot) return;
  if (enabled) {
    dot.className   = 'totp-status-dot on';
    lbl.textContent = 'TOTP مفعّل';
    sub.textContent = 'يقبل: رمز التطبيق + OTP البريد';
    bts.innerHTML   = `<button class="btn-sm ghost" onclick="handleResetTotp()">🔄 إعادة ربط التطبيق</button><button class="btn-sm danger" onclick="handleDisableTotp()">تعطيل TOTP</button>`;
  } else {
    dot.className   = 'totp-status-dot off';
    lbl.textContent = 'TOTP غير مفعّل';
    sub.textContent = 'يستخدم OTP البريد فقط حالياً';
    bts.innerHTML   = `<button class="btn-sm primary" onclick="handleSetupTotp()">🔐 تفعيل TOTP</button>`;
  }
}

async function handleSetupTotp() {
  const email = settingsUser?.email; if (!email) return;
  const d = await callAuth({ action: 'setup-totp', email });
  if (!d.success) { showToast('❌ ' + d.message); return; }
  document.getElementById('settingsQrSecret').textContent  = d.secret;
  drawQR(d.uri, 'settingsQrCanvas');
  document.getElementById('settingsQrWrap').style.display  = 'block';
  document.getElementById('settingsConfirmToken').value    = '';
  document.getElementById('settingsQrError').style.display = 'none';
  setTimeout(() => document.getElementById('settingsConfirmToken').focus(), 100);
}

async function handleSettingsConfirmTotp() {
  const email = settingsUser?.email; if (!email) return;
  const code  = document.getElementById('settingsConfirmToken').value.trim();
  document.getElementById('settingsQrError').style.display = 'none';
  if (code.length !== 6) { showLoginError('settingsQrError', 'الرمز 6 أرقام'); return; }
  const d = await callAuth({ action: 'confirm-totp', email, code });
  if (!d.success) { showLoginError('settingsQrError', d.message); return; }
  document.getElementById('settingsQrWrap').style.display = 'none';
  const session = Session.load();
  if (session) { session.user.totp_enabled = true; Session.save(session.token, session.user); }
  renderTotpStatus(true);
  showToast('✅ تم تفعيل TOTP');
}

// تغيير TOTP المفعّل أو تعطيله يطلب رمزه الحالي، فلا تكفي جلسة مسروقة لإزالته.
async function currentTotpCode() {
  const code = ((await miPrompt('أدخل الرمز الحالي من تطبيق المصادقة (6 أرقام)')) || '').trim();
  if (!/^\d{6}$/.test(code)) { if (code) showToast('❌ الرمز 6 أرقام'); return ''; }
  return code;
}

async function handleResetTotp() {
  if (!(await miConfirm('سيتم توليد رمز QR جديد — التطبيق القديم لن يعمل. متابعة؟'))) return;
  const email = settingsUser?.email; if (!email) return;
  const code = await currentTotpCode(); if (!code) return;
  const d = await callAuth({ action: 'reset-totp', email, code });
  if (!d.success) { showToast('❌ ' + d.message); return; }
  document.getElementById('settingsQrSecret').textContent = d.secret;
  drawQR(d.uri, 'settingsQrCanvas');
  document.getElementById('settingsQrWrap').style.display = 'block';
  document.getElementById('settingsConfirmToken').value   = '';
}

async function handleDisableTotp() {
  if (!(await miConfirm('سيتم تعطيل TOTP. ستعتمد على OTP البريد فقط. متابعة؟', { danger: true }))) return;
  const email = settingsUser?.email; if (!email) return;
  const code = await currentTotpCode(); if (!code) return;
  const d = await callAuth({ action: 'disable-totp', email, code });
  if (!d.success) { showToast('❌ ' + d.message); return; }
  const session = Session.load();
  if (session) { session.user.totp_enabled = false; Session.save(session.token, session.user); }
  renderTotpStatus(false);
  document.getElementById('settingsQrWrap').style.display = 'none';
  showToast('✅ تم تعطيل TOTP');
}

function drawQR(uri, containerId) {
  const wrap = document.getElementById(containerId); if (!wrap) return;
  function render() {
    wrap.innerHTML = '';
    new QRCode(wrap, { text: uri, width: 160, height: 160, colorDark: '#061318', colorLight: '#FDFCF8', correctLevel: QRCode.CorrectLevel.M });
  }
  if (!window.QRCode) {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    sc.integrity = 'sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU';
    sc.crossOrigin = 'anonymous';
    sc.onload = render; document.head.appendChild(sc);
  } else render();
}

// ══════════════════════════════════════════════════════
// مفاتيح المرور (WebAuthn)
// ══════════════════════════════════════════════════════
// الخادم يرسل الخيارات بصيغة JSON (base64url)، والمتصفح يريد ArrayBuffer.
const b64uToBuf = s => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0)).buffer;
};
const bufToB64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const passkeySupported = () => !!(window.PublicKeyCredential && navigator.credentials);

async function passkeyGet(o) {
  const cred = await navigator.credentials.get({ publicKey: {
    ...o, challenge: b64uToBuf(o.challenge),
    allowCredentials: (o.allowCredentials || []).map(c => ({ ...c, id: b64uToBuf(c.id) })),
  } });
  const r = cred.response;
  return {
    id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bufToB64u(r.clientDataJSON), authenticatorData: bufToB64u(r.authenticatorData),
      signature: bufToB64u(r.signature), userHandle: r.userHandle ? bufToB64u(r.userHandle) : undefined,
    },
  };
}

async function passkeyCreate(o) {
  const cred = await navigator.credentials.create({ publicKey: {
    ...o, challenge: b64uToBuf(o.challenge), user: { ...o.user, id: b64uToBuf(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map(c => ({ ...c, id: b64uToBuf(c.id) })),
  } });
  const r = cred.response;
  return {
    id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bufToB64u(r.clientDataJSON), attestationObject: bufToB64u(r.attestationObject),
      transports: r.getTransports ? r.getTransports() : undefined,
    },
  };
}

// إلغاء المستخدم للنافذة ليس خطأ يستحق رسالة حمراء.
const passkeyCancelled = e => e && (e.name === 'NotAllowedError' || e.name === 'AbortError');

if (passkeySupported()) document.getElementById('passkeyLoginWrap').style.display = 'block';

async function handlePasskeyLogin() {
  const btn = document.getElementById('loginBtnPasskey');
  if (btn.disabled) return;
  document.getElementById('loginError').style.display = 'none';
  btn.disabled = true;
  try {
    const o = await callAuth({ action: 'passkey-login-options' });
    if (!o.success) throw new Error(o.message);
    const response = await passkeyGet(o.options);
    const d = await callAuth({ action: 'passkey-login-verify', response });
    if (!d.success || !d.token) throw new Error(d.message || 'تعذّر الدخول');
    authToken = d.token;
    Session.save(d.token, d.user);
    showDashboard(d.user, d.user.email);
  } catch (e) {
    if (!passkeyCancelled(e)) showLoginError('loginError', e.message || 'تعذّر الدخول بمفتاح المرور');
  } finally { btn.disabled = false; }
}

async function loadSecurity() {
  const list = document.getElementById('pkList');
  const d = await callAuth({ action: 'security-status' });
  if (!d.success) { list.innerHTML = ''; return; }
  const methodLabel = { passkey: 'مفتاح المرور', totp: 'تطبيق المصادقة', email: 'رمز البريد' };
  list.innerHTML = d.passkeys.length ? d.passkeys.map(p => `<div class="pk-row">
      <div><div class="pk-name">🔑 ${esc(p.device_label || 'مفتاح مرور')}${p.backed_up ? ' · متزامن' : ''}</div>
      <div class="pk-sub">أُضيف ${fmtDate(p.created_at)}${p.last_used_at ? ' · آخر استخدام ' + fmtDate(p.last_used_at) : ''}</div></div>
      <button class="btn-sm danger" data-pk-del="${esc(p.id)}">حذف</button></div>`).join('')
    : '<div class="pk-sub">لا توجد مفاتيح بعد. أضف مفتاحًا لهذا الجهاز ثم مفتاحًا احتياطيًا.</div>';
  const only = !!d.passkey_only;
  document.getElementById('pkOnlyDot').className = 'totp-status-dot ' + (only ? 'on' : 'off');
  document.getElementById('pkOnlyLabel').textContent = only ? 'الدخول بمفتاح المرور وحده: مفعّل' : 'الدخول بمفتاح المرور وحده: غير مفعّل';
  document.getElementById('pkOnlySub').textContent = only
    ? 'رموز البريد وتطبيق المصادقة لا تفتح حسابك'
    : 'يتطلب مفتاحين ودخولًا بمفتاح. الجلسة الحالية: ' + (methodLabel[d.method] || 'قديمة');
  document.getElementById('pkOnlyBtn').textContent = only ? 'تعطيل' : 'تفعيل';
  document.getElementById('pkOnlyBtn').dataset.enable = only ? 'false' : 'true';
  loadSessions();
}

async function loadSessions() {
  const box = document.getElementById('sessList');
  const d = await callAuth({ action: 'sessions-list' });
  if (!d.success) { box.innerHTML = ''; return; }
  const methodLabel = { passkey: 'مفتاح المرور', totp: 'تطبيق المصادقة', email: 'رمز البريد' };
  box.innerHTML = d.sessions.map(x => `<div class="pk-row"><div>
      <div class="pk-name">${x.current ? '● هذه الجلسة' : 'جلسة أخرى'} · ${esc(methodLabel[x.method] || 'قديمة')}</div>
      <div class="pk-sub" style="direction:ltr;text-align:right">${esc(x.ip || '')} ${esc((x.ua || '').slice(0, 60))}</div>
      <div class="pk-sub">${x.auth_at ? 'الدخول ' + fmtDate(new Date(x.auth_at).toISOString()) : ''}</div></div></div>`).join('');
}

async function handleAddPasskey() {
  if (!passkeySupported()) { showToast('❌ المتصفح لا يدعم مفاتيح المرور'); return; }
  const label = await miPrompt('اسم الجهاز (مثل: آيفون، ماك العمل)', '');
  if (label === null) return;
  const btn = document.getElementById('pkAddBtn');
  btn.disabled = true;
  try {
    const o = await callAuth({ action: 'passkey-register-options' });
    if (!o.success) throw new Error(o.message);
    const response = await passkeyCreate(o.options);
    const d = await callAuth({ action: 'passkey-register-verify', response, label });
    if (!d.success) throw new Error(d.message);
    showToast('✅ ' + d.message);
    loadSecurity();
  } catch (e) {
    if (e && e.name === 'InvalidStateError') showToast('هذا الجهاز مسجّل مسبقًا');
    else if (!passkeyCancelled(e)) showToast('❌ ' + (e.message || 'تعذّر حفظ المفتاح'));
  } finally { btn.disabled = false; }
}

async function handleDeletePasskey(id) {
  if (!(await miConfirm('حذف هذا المفتاح؟ لن يفتح حسابك بعد الآن.', { danger: true }))) return;
  const d = await callAuth({ action: 'passkey-delete', id });
  showToast((d.success ? '✅ ' : '❌ ') + d.message);
  if (d.success) loadSecurity();
}

async function handleTogglePasskeyOnly() {
  const enable = document.getElementById('pkOnlyBtn').dataset.enable === 'true';
  if (enable && !(await miConfirm('بعد التفعيل لن تقبل رموز البريد ولا تطبيق المصادقة، وتُنهى الجلسات المفتوحة بها. تأكد أن لديك مفتاحين يعملان. متابعة؟'))) return;
  const d = await callAuth({ action: 'passkey-only', enable });
  if (!d.success) { showToast('❌ ' + d.message); return; }
  const session = Session.load();
  if (session) { session.user.passkey_only = d.passkey_only; Session.save(session.token, session.user); }
  showToast(d.passkey_only ? '✅ الدخول الآن بمفتاح المرور وحده' : '✅ عادت رموز البريد وتطبيق المصادقة');
  loadSecurity();
}

async function handleRevokeOthers() {
  if (!(await miConfirm('إنهاء كل جلساتك في الأجهزة الأخرى؟', { danger: true }))) return;
  const d = await callAuth({ action: 'sessions-revoke-others' });
  showToast((d.success ? '✅ ' : '❌ ') + d.message);
  if (d.success) loadSessions();
}

// ══════════════════════════════════════════════════════
// USER MANAGEMENT
// ══════════════════════════════════════════════════════
async function loadUsers() {
  const email = Session.load()?.user?.email; if (!email) return;
  const d = await callAuth({ action: 'list-users', email });
  if (!d.success) return;
  const tbody = document.getElementById('usersTableBody');
  if (!d.users?.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--ink-light)">لا يوجد مستخدمون</td></tr>';
    return;
  }
  tbody.innerHTML = d.users.map(u => `<tr>
    <td style="font-weight:500">${esc(u.name)}${u.is_owner ? '<span class="owner-badge">المالك</span>' : ''}</td>
    <td style="font-size:.78rem;color:var(--ink-mid);direction:ltr">${esc(u.email)}</td>
    <td><select class="role-select" data-user-role="${esc(u.id)}"${u.is_owner ? ' disabled title="حساب المالك محمي"' : ''}>${['super_admin','admin','viewer'].map(r => `<option value="${r}"${u.role_id===r?' selected':''}>${ROLE_LABELS[r]}</option>`).join('')}</select></td>
    <td><span style="font-size:.7rem;padding:2px 7px;border-radius:99px;background:${u.totp_enabled?'rgba(74,122,58,.1)':'var(--sand-light)'};color:${u.totp_enabled?'#4A7A3A':'var(--ink-faint)'};">${u.totp_enabled?'✓ نشط':'—'}</span></td>
    <td>${u.is_owner ? '🔒' : `<button class="toggle-btn ${u.is_active?'on':'off'}" data-user-toggle="${esc(u.id)}" data-active="${u.is_active === true}"></button>`}</td>
  </tr>`).join('');
}

async function handleUpdateUser(id, field, value) {
  const email = Session.load()?.user?.email;
  const d = await callAuth({ action: 'update-user', email, targetId: id, field, value });
  if (!d.success) showToast('❌ ' + d.message); else showToast('✅ تم التحديث');
}

async function handleToggleActive(id, current) {
  const email = Session.load()?.user?.email;
  const d = await callAuth({ action: 'update-user', email, targetId: id, field: 'is_active', value: !current });
  if (d.success) loadUsers(); else showToast('❌ ' + d.message);
}

function toggleAddUserForm() {
  const f = document.getElementById('addUserForm');
  f.classList.toggle('open');
  if (f.classList.contains('open')) document.getElementById('newUserName').focus();
}

async function handleAddUser() {
  const email    = Session.load()?.user?.email;
  const newName  = document.getElementById('newUserName').value.trim();
  const newEmail = document.getElementById('newUserEmail').value.trim();
  const newRole  = document.getElementById('newUserRole').value;
  document.getElementById('addUserError').style.display = 'none';
  if (!newName || !newEmail) { showLoginError('addUserError', 'الاسم والبريد مطلوبان'); return; }
  const d = await callAuth({ action: 'add-user', email, newName, newEmail, newRole });
  if (!d.success) { showLoginError('addUserError', d.message); return; }
  document.getElementById('newUserName').value  = '';
  document.getElementById('newUserEmail').value = '';
  toggleAddUserForm();
  loadUsers();
  showToast('✅ تم إضافة المستخدم');
}

// INIT — Check existing session
// ══════════════════════════════════════════════════════
(function init() {
  try {
    const session = Session.load();
    if (session && session.user && session.user.email && session.token) {
      authToken = session.token;
      showDashboard(session.user, session.user.email);
    }
  } catch(e) {
    console.warn('INIT error:', e.message);
    Session.clear();
  }
})();

// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════
function showDashboard(user, email) {
  if (!user || !email) {
    console.error('showDashboard: missing user or email', user, email);
    Session.clear();
    return;
  }
  const loginEl = document.getElementById('screen-login');
  const dashEl  = document.getElementById('screen-dashboard');
  if (!loginEl || !dashEl) {
    console.error('showDashboard: missing DOM elements');
    return;
  }
  loginEl.style.display = 'none';
  dashEl.classList.add('visible');
  dashEl.style.display  = 'flex';
  document.getElementById('dashUserName').textContent = user.name || email;
  document.getElementById('dashUserRole').textContent = ROLE_LABELS[user.role_id || user.role] || '—';
  loadRequests();
}

function handleLogout() {
  Session.clear();
  authToken = null;
  allData = [];
  filteredData = [];
  const _dash = document.getElementById('screen-dashboard');
  _dash.classList.remove('visible');
  _dash.style.display = 'none';
  document.getElementById('screen-login').style.display = 'grid';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginCode').value = '';
  document.getElementById('loginStepCode').style.display  = 'none';
  document.getElementById('loginStepEmail').style.display = 'block';
  currentEmail = ''; if(typeof closeSettings==='function') closeSettings();
}

// ══════════════════════════════════════════════════════
// LOAD DATA
// ══════════════════════════════════════════════════════
async function loadRequests() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '<tr class="loading-row"><td colspan="7"><div class="spinner"></div></td></tr>';

  try {
    const res = await callAuth({ action: 'list-contacts' });
    if (!res.success) {
      if (res.message && res.message.includes('الجلسة')) { handleLogout(); return; }
      throw new Error(res.message || 'تعذّر تحميل البيانات');
    }

    allData = res.contacts || [];
    updateStats();
    filterTable();

    const now = new Date();
    document.getElementById('lastUpdated').textContent =
      'آخر تحديث: ' + now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

  } catch (e) {
    tbody.innerHTML = `<tr class="loading-row"><td colspan="7" style="color:#B42828">خطأ في تحميل البيانات: ${esc(e.message)}</td></tr>`;
  }
}

// ══════════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════════
function updateStats() {
  const total    = allData.length;
  const newCount = allData.filter(r => r.status === 'new').length;
  const replied  = allData.filter(r => r.status === 'replied').length;
  const archived = allData.filter(r => r.status === 'archived').length;

  document.getElementById('statTotal').textContent   = total;
  document.getElementById('statNew').textContent      = newCount;
  document.getElementById('statReplied').textContent  = replied;
  document.getElementById('statArchived').textContent = archived;
}

// ══════════════════════════════════════════════════════
// FILTER + RENDER
// ══════════════════════════════════════════════════════
function filterTable() {
  const q      = document.getElementById('searchInput').value.toLowerCase();
  const status = document.getElementById('filterStatus').value;
  const source = document.getElementById('filterSource').value;

  filteredData = allData.filter(r => {
    const matchQ = !q || [r.name, r.email, r.organization, r.phone].some(
      v => v && v.toLowerCase().includes(q)
    );
    const matchS = !status || r.status === status;
    const matchP = !source || r.product === source;
    return matchQ && matchS && matchP;
  });

  currentPage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filteredData.slice(start, start + PAGE_SIZE);

  if (filteredData.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <p>لا توجد طلبات مطابقة</p>
        </div>
      </td></tr>`;
    document.getElementById('pagination').style.display = 'none';
    return;
  }

  const STATUS_AR = { new: 'جديد', read: 'مقروء', replied: 'تم الرد', archived: 'مؤرشف' };
  const INTEREST_AR = {
    leaders: 'برنامج القادة',
    matrix: 'مصفوفة التأثير',
    partnership: 'شراكة',
    general: 'استشارة عامة',
    A: 'استشارة قيادية',
    B: 'تنفيذ مؤسسي',
    C: 'شراكة استراتيجية',
  };

  tbody.innerHTML = page.map(r => `
    <tr data-open="${esc(r.id)}">
      <td><strong>${esc(r.name)}</strong></td>
      <td style="color:var(--ink-mid)">${esc(r.organization)}</td>
      <td>
        <span style="font-size:0.83rem;direction:ltr;display:inline-block">${esc(r.email)}</span>
        <button class="copy-btn" data-copy="${esc(r.email)}">نسخ</button>
      </td>
      <td><span class="interest-badge">${INTEREST_AR[r.interest] || esc(r.interest) || '—'}</span></td>
      <td><span class="source-badge ${r.product === 'MI-HOME' ? 'home' : 'leaders'}">${r.product === 'MI-HOME' ? 'الرئيسية' : 'القادة'}</span></td>
      <td style="color:var(--ink-light);font-size:0.82rem;white-space:nowrap">${fmtDate(r.created_at)}</td>
      <td><span class="status-badge ${esc(r.status)}">${STATUS_AR[r.status] || esc(r.status)}</span></td>
    </tr>
  `).join('');

  renderPagination();
}

function renderPagination() {
  const total = filteredData.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  const pag   = document.getElementById('pagination');

  if (pages <= 1) { pag.style.display = 'none'; return; }
  pag.style.display = 'flex';

  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end   = Math.min(currentPage * PAGE_SIZE, total);
  document.getElementById('paginationInfo').textContent = `${start}–${end} من ${total}`;

  const btns = document.getElementById('pageBtns');
  let html = `<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`;
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - currentPage) <= 1) {
      html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
    } else if (Math.abs(i - currentPage) === 2) {
      html += `<span style="padding:6px 4px;color:var(--ink-faint)">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===pages?'disabled':''}>›</button>`;
  btns.innerHTML = html;
}

function goPage(p) {
  currentPage = p;
  renderTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ══════════════════════════════════════════════════════
// DRAWER
// ══════════════════════════════════════════════════════
function openDrawer(id) {
  const r = allData.find(x => x.id === id);
  if (!r) return;

  const STATUS_AR   = { new: 'جديد', read: 'مقروء', replied: 'تم الرد', archived: 'مؤرشف' };
  const INTEREST_AR = {
    leaders: 'برنامج القادة', matrix: 'مصفوفة التأثير',
    partnership: 'شراكة استراتيجية', general: 'استشارة عامة',
    A: 'استشارة قيادية', B: 'تنفيذ مؤسسي', C: 'شراكة استراتيجية',
  };

  document.getElementById('drawerTitle').textContent = r.name;

  document.getElementById('drawerBody').innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">بيانات المتواصل</div>
      <div class="detail-row"><span class="detail-key">الاسم</span><span class="detail-val">${esc(r.name)}</span></div>
      <div class="detail-row"><span class="detail-key">الجهة</span><span class="detail-val">${esc(r.organization)}</span></div>
      <div class="detail-row">
        <span class="detail-key">البريد</span>
        <span class="detail-val" style="direction:ltr">
          ${esc(r.email)}
          <button class="copy-btn" data-copy="${esc(r.email)}">نسخ</button>
        </span>
      </div>
      <div class="detail-row">
        <span class="detail-key">الجوال</span>
        <span class="detail-val" style="direction:ltr">
          ${esc(r.phone)}
          <button class="copy-btn" data-copy="${esc(r.phone)}">نسخ</button>
        </span>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">تفاصيل الطلب</div>
      <div class="detail-row"><span class="detail-key">نوع الطلب</span><span class="detail-val">${INTEREST_AR[r.interest] || esc(r.interest)}</span></div>
      <div class="detail-row"><span class="detail-key">المصدر</span><span class="detail-val">${r.product === 'MI-HOME' ? 'الصفحة الرئيسية' : 'صفحة القادة'}</span></div>
      <div class="detail-row"><span class="detail-key">التاريخ</span><span class="detail-val">${fmtDate(r.created_at)}</span></div>
      ${r.context ? `
      <div style="margin-top:4px">
        <div style="font-size:0.78rem;color:var(--ink-light);margin-bottom:6px">السياق الإضافي</div>
        <div class="context-box">${esc(r.context)}</div>
      </div>` : ''}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">تغيير الحالة</div>
      <div class="status-changer">
        ${['new','read','replied','archived'].map(s => `
          <button class="status-btn ${s} ${r.status === s ? 'active' : ''}"
            data-status-id="${esc(r.id)}" data-status="${s}">
            ${STATUS_AR[s]}
          </button>
        `).join('')}
      </div>
    </div>

    <button class="reply-btn" data-reply="${esc(r.id)}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 2 11 13M22 2 15 22 11 13 2 9l20-7z"/>
      </svg>
      إرسال رد بالبريد
    </button>
  `;

  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');

  // تحديث الحالة لـ "مقروء" إن كانت جديدة
  if (r.status === 'new') {
    updateStatus(r.id, 'read', true);
  }
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

// ══════════════════════════════════════════════════════
// UPDATE STATUS
// ══════════════════════════════════════════════════════
async function updateStatus(id, status, silent = false) {
  try {
    const res = await callAuth({ action: 'update-contact', id, fields: { status } });
    if (!res.success) throw new Error(res.message || 'تعذّر التحديث');

    // تحديث محلي
    const idx = allData.findIndex(r => r.id === id);
    if (idx !== -1) allData[idx].status = status;
    updateStats();
    // نبقى في الصفحة نفسها بدل العودة للأولى عند تغيير الحالة
    const keepPage = currentPage;
    filterTable();
    currentPage = Math.min(keepPage, Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE)));
    renderTable();

    // تحديث الـ drawer إن كان مفتوحاً
    const drawer = document.getElementById('drawer');
    if (drawer.classList.contains('open')) {
      document.querySelectorAll('.status-btn').forEach(btn => {
        btn.classList.toggle('active', btn.classList.contains(status));
      });
    }

    if (!silent) showToast(`تم تغيير الحالة إلى: ${({ new:'جديد',read:'مقروء',replied:'تم الرد',archived:'مؤرشف' })[status]}`);

  } catch (e) {
    showToast(e.message || 'خطأ في تحديث الحالة');
  }
}

// ══════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════
// قيم الطلبات يكتبها الزائر، فلا تدخل أبدًا في نص JavaScript داخل onclick:
// المتصفح يفك &#39; إلى ' داخل الخاصية قبل التنفيذ، فيكسر esc() هناك.
// تُحمل المعرّفات في data-* وتُلتقط هنا، ثم تُجلب القيم من allData.
document.addEventListener('click', e => {
  const el = e.target.closest('[data-copy],[data-reply],[data-status-id],[data-user-toggle],[data-open],[data-pk-del]');
  if (!el) return;
  if (el.dataset.pkDel) { handleDeletePasskey(el.dataset.pkDel); return; }
  if (el.dataset.copy !== undefined) { e.stopPropagation(); copyText(el.dataset.copy); return; }
  if (el.dataset.reply) {
    const r = allData.find(x => x.id === el.dataset.reply);
    if (r) replyByEmail(r.id, r.email, r.name);
    return;
  }
  if (el.dataset.statusId) { updateStatus(el.dataset.statusId, el.dataset.status); return; }
  if (el.dataset.userToggle) { handleToggleActive(el.dataset.userToggle, el.dataset.active === 'true'); return; }
  if (el.dataset.open) openDrawer(el.dataset.open);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-user-role]');
  if (el) handleUpdateUser(el.dataset.userRole, 'role_id', el.value);
});

function replyByEmail(id, email, name) {
  const subject = encodeURIComponent(`رداً على استفساركم — Milestone Impact`);
  const body    = encodeURIComponent(`السلام عليكم ${name}،\n\nشكراً لتواصلكم مع Milestone Impact.\n\n`);
  window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
  updateStatus(id, 'replied');
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('تم النسخ ✓'));
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
