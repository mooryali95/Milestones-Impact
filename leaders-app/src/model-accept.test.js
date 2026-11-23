// «بوابتان، والباقي ملاحظات» على نسخ الرحلة المجمدة: الفصول الخمسة تكتمل بالتسليم ولو حفظتها النسخة «يحتاج اعتمادًا»،
// وبطاقة المبادرة وغيرها تبقى بحسب إعدادها
import { describe, expect, it } from 'vitest';
import { modelStatus, SUBMIT_ONLY_MODELS } from '../../supabase/functions/leaders-api/logic.js';

const models = (key, status) => ({ [key]: { status, model_id: 'x', title: 't' } });

describe('modelStatus', () => {
  it('فصل من الخمسة في نسخة قديمة (accept: reviewed) يكتمل بالتسليم وبالإرجاع', () => {
    for (const key of SUBMIT_ONLY_MODELS) {
      expect(modelStatus({ model_key: key, accept: 'reviewed' }, models(key, 'submitted'))).toMatchObject({ done: true, accept: 'submitted' });
      expect(modelStatus({ model_key: key, accept: 'reviewed' }, models(key, 'returned')).done).toBe(true);
      expect(modelStatus({ model_key: key, accept: 'reviewed' }, models(key, 'draft')).done).toBe(false);
    }
  });
  it('بطاقة المبادرة تبقى بوابة: لا تكتمل إلا بالاعتماد', () => {
    expect(modelStatus({ model_key: 'initiative-charter', accept: 'reviewed' }, models('initiative-charter', 'submitted'))).toMatchObject({ done: false, accept: 'reviewed' });
    expect(modelStatus({ model_key: 'initiative-charter', accept: 'reviewed' }, models('initiative-charter', 'reviewed')).done).toBe(true);
    expect(SUBMIT_ONLY_MODELS).not.toContain('initiative-charter');
  });
  it('نموذج آخر يحتفظ بإعداده من محرر الرحلة', () => {
    expect(modelStatus({ model_key: 'other', accept: 'reviewed' }, models('other', 'submitted')).done).toBe(false);
    expect(modelStatus({ model_key: 'other', accept: 'submitted' }, models('other', 'submitted')).done).toBe(true);
  });
});
