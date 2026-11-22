// «اسأل المساعد» من المبادرة: المساعد نفسه ببوابته، وسلوك البوابة المغلقة لكل سبب، وما يُرسل للنموذج
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { accessOf, ACTIONABLE, fieldQuestion } from './screens/Assistant.jsx';
import { GATE_AR } from '../../supabase/functions/leaders-api/guide.js';

const read = (p) => readFileSync(p, 'utf8');

describe('البوابة المغلقة لكل سبب', () => {
  it('حساب العرض والمساعد المغلق وبلا رد: لا مدخل', () => {
    expect(accessOf({ demo: true, ai: true, gate: { ok: true } }).kind).toBe('hidden');
    expect(accessOf({ ai: false, gate: { ok: true } }).kind).toBe('hidden');
    expect(accessOf({ ai: true, gate: null }).kind).toBe('hidden');
  });
  it('مفتوحة: الزر', () => expect(accessOf({ ai: true, gate: { ok: true, reason: null } }).kind).toBe('open'));
  it('كل سبب في GATE_AR: سطر لما يقدر عليه المشارك، وإخفاء للعام', () => {
    for (const reason of Object.keys(GATE_AR)) {
      const a = accessOf({ ai: true, gate: { ok: false, reason, message: GATE_AR[reason] } });
      expect(a.kind).toBe(ACTIONABLE.has(reason) ? 'line' : 'hidden');
      if (a.kind === 'line') expect(a.message).toBe(GATE_AR[reason]);
    }
    expect([...ACTIONABLE].sort()).toEqual(['consent', 'start']);
  });
});

describe('السؤال المملوء من الحقل', () => {
  it('اسم الفصل والحقل وحدهما', () => {
    expect(fieldQuestion('بطاقة المبادرة', 'الهدف الأعلى')).toBe('في فصل «بطاقة المبادرة»، حقل «الهدف الأعلى»: ');
    expect(fieldQuestion('', 'الهدف')).toBe('في حقل «الهدف»: ');
  });
});

describe('تنفيذ واحد ولا مسودة للنموذج', () => {
  const src = read('leaders-app/src/screens/Assistant.jsx');
  it('يستعمل GuideChat نفسه وguide.state، ولا guide.ask خاص ولا إجابات', () => {
    expect(src).toContain("import { GuideChat } from './Guidance.jsx'");
    expect(src).toContain('context="capstone"');
    expect(src).not.toMatch(/call\('guide\.ask'/);
    expect(src).not.toMatch(/answers/);
  });
  it('GuideChat يرسل النص الذي كتبه المشارك وحده', () => {
    expect(read('leaders-app/src/screens/Guidance.jsx')).toContain("call('guide.ask', { text: q, context, chapter_id: chapterId })");
  });
  it('الزر في الفصل لا يظهر خارج المبادرة (سياق من Capstone وحده)', () => {
    expect(read('leaders-app/src/screens/Capstone.jsx')).toContain('<AssistantContext.Provider value={assistant}>');
  });
});
