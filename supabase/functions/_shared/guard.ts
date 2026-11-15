// ════════════════════════════════════════════════════════════════
// حراسة الدوال العامة: عنوان الشبكة والتحقق البشري (Cloudflare Turnstile)
// ════════════════════════════════════════════════════════════════
// مستخرجة من send-otp ليستعملها نموذج التواصل والمساعد الآلي (agent-chat) بالسلوك نفسه.
// أما حدود الإغراق فلكل دالة عداداتها على جداولها، فلا تُنقل من هنا.

export const clientIp = (req: Request) =>
  req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

// يفشل مغلقًا: رمز غائب أو غير صالح أو تعذّر الاتصال = لا
export async function turnstileOk(secret: string, token: unknown, ip: string | null) {
  if (!secret || typeof token !== 'string' || token.length < 10 || token.length > 4096) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    return !!(await r.json())?.success;
  } catch { return false; }
}
