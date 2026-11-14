// دفعة الأمان الثالثة (تدقيق 2026-11-14): رمز الرابط خارج العنوان (F7)، وسقف دعوات المقيّمين (N5)،
// والعامل الثاني لفتح السير والإجابات (N10)، وجلسة حساب «مفتاح المرور وحده» (N12)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { linkToken } from './link-token.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };

describe('F7: رمز الرابط يُزال من العنوان', () => {
  it('يُقرأ مرة، ويُزال من العنوان مع بقاء بقية المعاملات، ويبقى للتبويب عند إعادة التحميل', () => {
    const store = mem();
    const calls = [];
    const hist = { replaceState: (_s, _t, url) => calls.push(url) };
    expect(linkToken({ search: '?t=abc123&x=1', pathname: '/rate', hash: '' }, hist, store)).toBe('abc123');
    expect(calls).toEqual(['/rate?x=1']);
    // إعادة التحميل: العنوان بلا رمز، والرمز من التبويب
    expect(linkToken({ search: '?x=1', pathname: '/rate', hash: '' }, hist, store)).toBe('abc123');
    expect(calls.length).toBe(1);
    // مسار آخر لا يرى رمز غيره
    expect(linkToken({ search: '', pathname: '/sponsor', hash: '' }, hist, store)).toBe('');
  });
  it('التخزين المعطّل لا يكسر الشاشة', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(linkToken({ search: '?t=zz', pathname: '/offer', hash: '' }, { replaceState: () => {} }, broken)).toBe('zz');
    expect(linkToken({ search: '', pathname: '/offer', hash: '' }, { replaceState: () => {} }, broken)).toBe('');
  });
  it('الشاشات الأربع تقرأ الرمز بالدالة لا من العنوان مباشرة', () => {
    for (const f of ['Rater', 'Sponsor', 'Outcome', 'ExpertOffer']) {
      const s = read(`leaders-app/src/screens/${f}.jsx`);
      expect(s, f).toContain('useState(() => linkToken())');
      expect(s, f).not.toMatch(/URLSearchParams\(location\.search\)\.get\('t'\)/);
    }
  });
});

describe('حراس الخادم', () => {
  const admin = read('supabase/functions/leaders-api/admin.ts');
  const body = (s, name) => { const i = s.indexOf(`export async function ${name}(`); return s.slice(i, s.indexOf('\n}\n', i)); };
  it('N5: دعوات المقيّمين لها سقف يومي يشمل الملغاة، قبل أي إرسال', () => {
    const b = body(read('supabase/functions/leaders-api/impact.ts'), 'invite');
    expect(b).toContain(".eq('action', 'rater.invite')");
    expect(b).toContain('RATER_INVITES_PER_DAY');
    expect(b.indexOf('RATER_INVITES_PER_DAY')).toBeLessThan(b.indexOf('sendMail('));
    expect(b.indexOf('RATER_INVITES_PER_DAY')).toBeLessThan(b.indexOf('notifyConfirmers('));
  });
  it('N10: السير الذاتية وإجابات القياس تحتاج العامل الثاني', () => {
    for (const fn of ['evidenceUrl', 'assessmentAnswers']) expect(body(admin, fn), fn).toContain('requireWrite(a)');
  });
  it('N12: حساب «مفتاح المرور وحده» لا تُقبل له إلا جلسة مفتاح مرور', () => {
    expect(admin).toContain("live.passkey_only && s.meta?.method !== 'passkey'");
  });
});
