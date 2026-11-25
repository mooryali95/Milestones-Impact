// الدفعات المثبتة على نسخة رحلة مجمدة (program_versions، ترحيل 20261116110000): ترحيل بطاقة المسار (20261129110000) أضاف
// O-COST وO-EVID وL-GOV إلى صفوف البرنامج الحية ولم يمس النسخ المجمدة. غيابها عن النسخة لا يكسر الرحلة ولا جاهزيتها،
// والبطاقة تعد ما في رحلة المشارك فعلًا (cardOnJourney)
import { describe, expect, it } from 'vitest';
import { buildJourney, cohortDefinition, journeyProgress } from '../../supabase/functions/leaders-api/logic.js';
import { cardOnJourney, trackManifest } from '../../supabase/functions/leaders-api/track-manifest.js';
import SLICES from '../../supabase/content/tracks/v2/slices.json';

const NEW = SLICES.additions.requirements.map((r) => r.code);
const stages = [{ key: 'ojt_coaching', sort: 1, title_ar: 'التطبيق' }];
// كل رمز في الشرائح بإطاره ومستواه، كما تكون صفوف البرنامج الحية بعد الترحيل
const live = () => {
  const rows = [];
  for (const [d, fw] of Object.entries(SLICES.frameworks)) {
    for (const [lv, codes] of Object.entries(fw.journey)) for (const code of codes) rows.push({ id: `${code}:${d}:${lv}`, code, stage_key: 'ojt_coaching', dimension: d, level: lv, kind: 'check', sort: rows.length });
  }
  return rows;
};
// النسخة المجمدة: قبل الترحيل، بلا الرموز الجديدة
const frozen = () => ({ data: { stages, requirements: live().filter((r) => !NEW.includes(r.code)) } });
const LEVELS = { milestone: 'intermediate', impact: 'intermediate', leadership: 'intermediate' };

describe('نسخة رحلة مجمدة بلا متطلبات البطاقة الجديدة', () => {
  it('الرموز الجديدة تخص مستويات فعلًا، وغائبة عن النسخة', () => {
    expect(NEW.sort()).toEqual(['L-GOV', 'O-COST', 'O-EVID']);
    expect(frozen().data.requirements.some((r) => NEW.includes(r.code))).toBe(false);
  });
  it('الرحلة تُبنى على النسخة وتكتمل جاهزيتها بما فيها وحده', () => {
    const def = cohortDefinition({ live: null, version: frozen(), cohort: null });
    const items = buildJourney({ stages: def.stages, requirements: def.requirements, progress: {}, levels: LEVELS, state: {} }).flatMap((s) => s.items);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => NEW.includes(i.code))).toBe(false);
    const progress = Object.fromEntries(def.requirements.map((r) => [r.id, { status: 'done' }]));
    const j = buildJourney({ stages: def.stages, requirements: def.requirements, progress, levels: LEVELS, state: {} });
    expect(journeyProgress(j)).toBe(100);
  });
  it('البطاقة تعد أعمال المستوى التي في رحلته، والمسار الحي يبقى كما هو', () => {
    for (const key of ['M2I2L2', 'M3I3L3', 'M1I1L1', 'M2I3L2']) {
      const card = trackManifest(key).card;
      const def = cohortDefinition({ live: null, version: frozen(), cohort: null });
      const onFrozen = cardOnJourney(card, def.requirements);
      expect(onFrozen.journey.requirements.some((c) => NEW.includes(c))).toBe(false);
      expect(onFrozen.journey.requirements).toEqual(card.journey.requirements.filter((c) => !NEW.includes(c)));
      for (const v of Object.values(onFrozen.journey.by_framework)) expect(v.requirements.some((c) => NEW.includes(c))).toBe(false);
      // المختبرات والكتاب والوثيقة لا تتبع نسخة الرحلة
      expect(onFrozen.journey.labs).toEqual(card.journey.labs);
      expect(onFrozen.initiative).toEqual(card.initiative);
      // على البرنامج الحي (بكل الرموز) أو بلا رحلة معروفة: البطاقة كما هي
      expect(cardOnJourney(card, live())).toEqual(card);
      expect(cardOnJourney(card, null)).toBe(card);
    }
    // المتوسط في الأطر الثلاثة كان سيعد ثلاثة أعمال ليست في رحلته
    const c = trackManifest('M2I2L2').card;
    expect(c.journey.requirements.length - cardOnJourney(c, frozen().data.requirements).journey.requirements.length).toBe(3);
  });
  it('البند المعطّل في النسخة لا يُعد', () => {
    const card = trackManifest('M2I2L2').card;
    const reqs = live().map((r) => (r.code === 'O-MREG' ? { ...r, active: false } : r));
    expect(cardOnJourney(card, reqs).journey.requirements).not.toContain('O-MREG');
  });
});
