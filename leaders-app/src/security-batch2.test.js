// دفعة الأمان الثانية: حراس مصدر لما لا يُختبر بلا قاعدة (M3 دورة حياة المفتاح، M5 حساب العرض، M9 سقف الجلسة)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fn = (p) => readFileSync(join(process.cwd(), 'supabase/functions/leaders-api', p), 'utf8');
const body = (s, name) => { const i = s.indexOf(`export async function ${name}(`); return s.slice(i, s.indexOf('\n}\n', i)); };

describe('M9: سقف مطلق لجلسة المشارك', () => {
  const s = fn('participant.ts');
  it('الجلسة تُرفض بعد سقفها، والتجديد لا يتجاوزه', () => {
    const b = body(s, 'participantFromToken');
    expect(b).toContain('hardEnd < Date.now()');
    expect(b).toContain('Math.min(now + CONFIG.sessionDays * 864e5, hardEnd)');
    expect(b).toMatch(/select\('id, participant_id, expires_at, revoked_at, created_at, method'\)/);
  });
});

describe('M3: مفتاح المرور', () => {
  const s = fn('passkeys.ts');
  it('التسجيل بخطوتيه يشترط دخولًا حديثًا', () => {
    expect(body(s, 'registerOptions')).toContain('await requireStepUp(sessionId)');
    expect(body(s, 'registerVerify')).toContain('await requireStepUp(sessionId)');
  });
  it('التسجيل يُشعر صاحب الحساب، والحذف مقيد بصاحبه ويُنهي الجلسات الأخرى', () => {
    expect(body(s, 'registerVerify')).toContain('passkeyAddedMail(');
    const r = body(s, 'remove');
    expect(r).toContain(".eq('participant_id', p.id)");
    expect(r).toMatch(/auth_sessions'\)\.update\(\{ revoked_at/);
    expect(r).toContain(".neq('id', sessionId)");
  });
  it('الإجراءان في الموجّه', () => {
    const i = fn('index.ts');
    expect(i).toContain("'passkey.list': (p) => K.list(p)");
    expect(i).toContain("'passkey.remove': (p, b, sid) => K.remove(p, b, sid)");
  });
});

describe('M5: حساب العرض', () => {
  const i = fn('index.ts');
  const blocked = i.slice(i.indexOf('const DEMO_BLOCKED'), i.indexOf(']);', i.indexOf('const DEMO_BLOCKED')));
  it('مغلق عليه ما يراسل الناس أو يدخل القاعة الحقيقية أو يفتح دفعًا أو يثبّت وصولًا دائمًا', () => {
    for (const a of ['experts.choose', 'rater.invite', 'f360.nominate', 'coaching.instant', 'sponsor.request', 'pay.checkout',
      'hall.join', 'hall.hand', 'hall.pick', 'upload.url', 'passkey.register-options', 'passkey.register-verify', 'me.switch']) expect(blocked, a).toContain(`'${a}'`);
  });
  it('رابط عرض جديد يُبطل جلسات العرض السابقة', () => {
    const o = body(fn('demo.ts'), 'open');
    expect(o.indexOf('revoked_at')).toBeGreaterThan(-1);
    expect(o.indexOf('revoked_at')).toBeLessThan(o.indexOf("issueSession(p.id, 'demo'"));
  });
});
