// فحص الجاهزية p-entry-2 (2026-11-11): حد «لا ينطبق» في عبارات الممارسة كان خفيًا حتى رفض الإرسال (too_many_na)،
// وإرشاد كل عبارة يدعو إليه. القاعدة الآن من مصدر واحد (logic.js) يحسبها الخادم عند الإرسال والشاشة قبله.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_NA_MESSAGE, BEHAVIOR_NA_RULE, behaviorNaCounts, behaviorNaExcess, isBehaviorNa, MAX_BEHAVIOR_NA,
} from '../../supabase/functions/leaders-api/logic.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// الخادم يرى الدرجات (−1 = لا ينطبق)، والشاشة ترى k والعلامة na فقط
const server = [{ score: 0 }, { score: 4 }, { score: -1 }];
const client = [{ k: 0, label: 'نادرًا' }, { k: 1, label: 'دائمًا' }, { k: 2, label: 'لا ينطبق على عملي', na: true }];
const qs = (options) => [
  { id: 'm1', dimension: 'milestone', tier: 'behavior', options },
  { id: 'm2', dimension: 'milestone', tier: 'behavior', options },
  { id: 'mk', dimension: 'milestone', tier: 'knowledge', options: [{ score: -1 }, { score: 1 }] },
  { id: 'i1', dimension: 'impact', tier: 'behavior', options },
  { id: 'i2', dimension: 'impact', tier: 'behavior', options },
];

describe('قاعدة «لا ينطبق» من مصدر واحد', () => {
  it('isBehaviorNa: الدرجة السالبة في الخادم، والعلامة na في الشاشة، وعبارات الممارسة وحدها', () => {
    for (const opts of [server, client]) {
      const [m1, , mk] = qs(opts);
      expect(isBehaviorNa(m1, 2)).toBe(true);
      expect(isBehaviorNa(m1, 1)).toBe(false);
      expect(isBehaviorNa(m1, null)).toBe(false);
      expect(isBehaviorNa(mk, 0)).toBe(false);
      expect(isBehaviorNa({ ...m1, active: false }, 2)).toBe(false);
    }
    // خيارات الشاشة تُطابق بـk لا بموضعها
    expect(isBehaviorNa({ tier: 'behavior', options: [client[2], client[0], client[1]] }, 2)).toBe(true);
    expect(isBehaviorNa({ tier: 'behavior', options: [client[2], client[0], client[1]] }, 0)).toBe(false);
  });
  it('العد والعبارات الزائدة بالحساب نفسه في الخادم والشاشة', () => {
    for (const opts of [server, client]) {
      const list = qs(opts);
      expect(behaviorNaCounts(list, { m1: 2, m2: 1, mk: 0, i1: 2 })).toEqual({ milestone: 1, impact: 1, leadership: 0 });
      expect(behaviorNaExcess(list, { m1: 2, m2: 1, i1: 2 })).toEqual([]);
      expect(behaviorNaExcess(list, { m1: 2, m2: 2, i1: 2, i2: 1 })).toEqual(['m1', 'm2']);
      expect(behaviorNaExcess(list, { m1: 2, m2: 2, i1: 2, i2: 2 })).toEqual(['m1', 'm2', 'i1', 'i2']);
    }
    expect(MAX_BEHAVIOR_NA).toBe(1);
  });
  it('نص القاعدة واحد، ورسالة الرفض كما وثّقها ملحق التدقيق 1', () => {
    expect(BEHAVIOR_NA_RULE).toBe('«لا ينطبق» لعبارة واحدة على الأكثر في كل قسم');
    expect(BEHAVIOR_NA_MESSAGE).toBe('اختر «لا ينطبق» لعبارة واحدة على الأكثر في كل قسم');
  });
});

describe('الخادم يسمّي العبارات، والشاشة تعرض القاعدة قبل الإرسال', () => {
  it('assessment.submit يرد question_ids مع too_many_na', () => {
    const p = read('supabase/functions/leaders-api/participant.ts');
    expect(p).toContain('const naOver = behaviorNaExcess(questions, answers);');
    expect(p).toContain("if (naOver.length) throw new Fail(BEHAVIOR_NA_MESSAGE, 400, 'too_many_na', { question_ids: naOver });");
  });
  it('شاشة القياس: القاعدة في المقدمة وأول القسم، ورد الاختيار الزائد، والمراجعة، ورفض الخادم', () => {
    const a = read('leaders-app/src/screens/Assessment.jsx');
    expect(a).toContain("from '../../../supabase/functions/leaders-api/logic.js';");
    expect(a).toContain('في عبارات الممارسة، {BEHAVIOR_NA_MESSAGE}، وأجب عن البقية بأقرب تكرار لما تفعله.');
    expect(a).toContain("لا إجابة صحيحة هنا: اختر ما تفعله فعلًا{naLimit ? `، و${BEHAVIOR_NA_RULE}` : ''}.");
    expect(a).toContain('behaviorNaCounts(qs, { ...answers, [q.id]: k })[q.dimension] > MAX_BEHAVIOR_NA');
    expect(a).toContain('behaviorNaExcess(qs, answers)');
    expect(a).toContain("res.code === 'too_many_na' ? qs.findIndex((x) => x.id === res.question_ids?.[0])");
    // الحد على المبدئي وحده كما في الخادم (postSubmit لا يفرضه)
    expect(a).toContain('const naLimit = !post;');
  });
});
