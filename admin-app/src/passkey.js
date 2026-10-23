// ════════════════════════════════════════════════════════════════
// مفاتيح المرور (WebAuthn)
// ════════════════════════════════════════════════════════════════
// الخادم يرسل الخيارات بصيغة JSON (base64url)، والمتصفح يريد ArrayBuffer.
export const b64uToBuf = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer;
};
export const bufToB64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const passkeySupported = () => !!(window.PublicKeyCredential && navigator.credentials);
// إلغاء المستخدم للنافذة ليس خطأ يستحق رسالة
export const passkeyCancelled = (e) => e && (e.name === 'NotAllowedError' || e.name === 'AbortError');

export async function passkeyGet(o) {
  const cred = await navigator.credentials.get({ publicKey: {
    ...o, challenge: b64uToBuf(o.challenge),
    allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })),
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

export async function passkeyCreate(o) {
  const cred = await navigator.credentials.create({ publicKey: {
    ...o, challenge: b64uToBuf(o.challenge), user: { ...o.user, id: b64uToBuf(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })),
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
