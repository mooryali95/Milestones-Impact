import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanVisibility, resolveVisibility, VISIBILITY, VISIBILITY_DEFAULTS, VISIBILITY_KEYS, visibilityLabel, widened } from '../../supabase/functions/leaders-api/visibility.js';
import { DEFAULTS, SETTINGS } from '../../supabase/functions/leaders-api/settings.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('التحكم في الرؤية', () => {
  it('كل مفتاح له جمهور وتسمية وشرح، وافتراضه «مرئي» فلا يتغير شيء عند النشر', () => {
    expect(VISIBILITY_KEYS.length).toBe(14);
    for (const k of VISIBILITY_KEYS) {
      expect(['advisor', 'assigned']).toContain(VISIBILITY[k].audience);
      expect(VISIBILITY[k].label_ar && VISIBILITY[k].hint_ar).toBeTruthy();
      expect(VISIBILITY_DEFAULTS[k]).toBe(true);
    }
    expect(visibilityLabel('adv_contact')).toBe('مستشار الدفعة وخبير المجموعة: وسائل التواصل');
  });
  it('ثلاث طبقات: الافتراضي، ثم الإعداد العام، ثم استثناء الدفعة', () => {
    expect(resolveVisibility(null, null).adv_contact).toBe(true);
    expect(resolveVisibility({ adv_contact: false }, null).adv_contact).toBe(false);
    expect(resolveVisibility({ adv_contact: false }, { adv_contact: true }).adv_contact).toBe(true);
    expect(resolveVisibility({ adv_answers: true }, { adv_answers: false }).adv_answers).toBe(false);
  });
  it('الاستثناء يقبل المفاتيح المعروفة بقيم منطقية وحدها', () => {
    expect(cleanVisibility({ adv_contact: false, hack: true, adv_effort: 'no', asg_levels: true })).toEqual({ adv_contact: false, asg_levels: true });
    expect(cleanVisibility(null)).toEqual({});
  });
  it('ما وُسّع يُسمّى: كان محجوبًا فصار مرئيًا', () => {
    const before = resolveVisibility({ adv_contact: false, asg_levels: false }, null);
    const after = resolveVisibility({ adv_contact: false, asg_levels: false }, { adv_contact: true });
    expect(widened(before, after)).toEqual(['adv_contact']);
    expect(widened(after, before)).toEqual([]);
  });
  it('مصدر واحد: مجموعة الإعدادات تُولَّد من المفاتيح نفسها', () => {
    expect(Object.keys(SETTINGS.visibility.fields)).toEqual(VISIBILITY_KEYS);
    expect(DEFAULTS.visibility).toEqual(VISIBILITY_DEFAULTS);
  });
  it('الخادم يحجب ويرفض من المفاتيح: الحمولة في file.ts، والفعل بـrequireVisible', () => {
    const f = read('supabase/functions/leaders-api/file.ts');
    expect(f).toContain('const vis = await visibilityOfCohort(cohort?.id || null);');
    for (const k of ['adv_answers', 'adv_observations_write', 'adv_final_edit', 'adv_hall_control']) expect(f, k).toContain(`'${k}')`);
    // كل مفتاح مستعمل في الخادم، فلا مفتاح يُعرض للمالك ولا أثر له
    for (const k of VISIBILITY_KEYS) expect(f, k).toContain(k);
    // تعليل الإدارة لا يخرج للخبير المسند مهما كانت المفاتيح
    expect(f).toContain("const withNotes = adv && on('adv_admin_notes');");
  });
});
