// تصور المرحلة 1، البند 6: بند E-360 لا يكتمل بتقييم بعدي واحد. يكتمل حين يبلغ المقدَّم البعدي من غير المدير min_others
// من إعدادات 360 نفسها، أو حين يغلق حد التقييم (لا مقيّم بعدي ينتظر ودعوته سارية) ولو بأقل، بوسم «اكتمل بعدد أقل».
// والسريان (القرار 3): من اعتُمد تقييمه الختامي يُحفظ اكتماله بالقاعدة القديمة.
import { describe, expect, it } from 'vitest';
import { AUTO_CHECKS, AUTO_EVIDENCE, buildJourney, postRatedState } from '../../supabase/functions/leaders-api/logic.js';

const NOW = Date.parse('2026-11-26T10:00:00Z');
const FUTURE = '2026-12-20T00:00:00Z', PAST = '2026-11-01T00:00:00Z';
const sub = (relation = 'peer') => ({ phase: 'post', status: 'submitted', relation });
const open = (status = 'invited', expires_at = FUTURE) => ({ phase: 'post', status, relation: 'peer', expires_at });
const st = (raters, extra = {}) => postRatedState(raters, { minOthers: 3, now: NOW, ...extra });

describe('اكتمال E-360', () => {
  it('واحد واثنان والنافذة مفتوحة: غير مكتمل', () => {
    expect(st([sub(), open()])).toEqual({ done: false, fewer: false, others: 1 });
    expect(st([sub(), sub('report'), open('awaiting')]).done).toBe(false);
  });
  it('ثلاثة من غير المدير: مكتمل بلا وسم، والمدير لا يُحسب منهم', () => {
    expect(st([sub(), sub(), sub(), open()])).toEqual({ done: true, fewer: false, others: 3 });
    expect(st([sub(), sub(), sub('manager'), open()]).done).toBe(false);
  });
  it('الإغلاق بأقل: لا مقيّم بعدي ينتظر بدعوة سارية، فيكتمل بوسم «اكتمل بعدد أقل»', () => {
    expect(st([sub(), open('invited', PAST)])).toEqual({ done: true, fewer: true, others: 1 });
    expect(st([sub('manager')])).toEqual({ done: true, fewer: true, others: 0 });
    expect(st([open('invited', PAST)]).done).toBe(false);
    expect(st([]).done).toBe(false);
  });
  it('القبلي لا يُحسب للبعدي، والمسحوب لا ينتظر', () => {
    expect(st([{ ...sub(), phase: 'pre' }, sub(), { ...open(), status: 'revoked' }]).fewer).toBe(true);
  });
  it('السريان: من اعتُمد تقييمه الختامي يبقى مكتملًا بمقيّم واحد', () => {
    expect(st([sub(), open()], { finalApproved: true })).toEqual({ done: true, fewer: false, others: 1 });
  });
  it('البند يقرأ الحالة، والدليل يقول «اكتمل بعدد أقل» للمرشد والإدارة', () => {
    expect(AUTO_CHECKS['E-360']({ postRated: true })).toBe(true);
    expect(AUTO_EVIDENCE['E-360']({ postRated: true, postRatedFewer: true })).toBe('اكتمل بعدد أقل');
    expect(AUTO_EVIDENCE['E-360']({ postRated: true, postRatedFewer: false })).toBe(null);
  });
  it('الوسم يخرج في بند الرحلة (auto_note) بلا تجاوز يدوي، فتعرضه شاشتا المرشد والإدارة', () => {
    const stages = [{ key: 'evaluation', title_ar: 'التقييم', sort: 1, active: true }];
    const requirements = [{ id: 'q1', stage_key: 'evaluation', code: 'E-360', title_ar: 'تقييم 360 البعدي', sort: 1, required: true, kind: 'auto' }];
    const j = buildJourney({ stages, requirements, progress: {}, levels: {}, state: { postRated: true, postRatedFewer: true }, activity: {}, overrides: {}, detail: true });
    const it0 = j.flatMap((s) => s.items || []).find((i) => i.code === 'E-360');
    expect(it0.status).toBe('done');
    expect(it0.auto_note).toBe('اكتمل بعدد أقل');
    expect(it0.override_ok).toBeUndefined();
  });
});
