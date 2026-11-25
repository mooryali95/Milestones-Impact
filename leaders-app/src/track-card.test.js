// بطاقة المسار (اعتمدها المالك 2026-11-25): 27 مسارًا من مصدر واحد، وtrackManifest وحده يحلها.
// الحراس: بطاقة كاملة لكل مسار، ولا شاشة تخالفها، ولا تنقص الرحلة حين يرتفع مستوى، والمستويات الثلاثة في كل إطار
// تختلف فعلًا، وكل ملف تعريف يبلغه مسار، وحد الحقول المطلوبة، ولقطة الـ27 من سكربت المصفوفة.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { DIMENSIONS, LEVELS, nearMastery, priorityFor, trackKey, trackLevels } from '../../supabase/functions/leaders-api/logic.js';
import { CARDS, SLICES, cardLayers, labsAt, requiredCap, termsAt, trackManifest } from '../../supabase/functions/leaders-api/track-manifest.js';
import { computeMatrix, deliveryFor, distinctCounts, SNAPSHOT } from '../../scripts/tracks/matrix.mjs';
import { afterState } from '../../scripts/tracks/state.mjs';

const ROOT = join(__dirname, '../..');
const TRACKS = [1, 2, 3].flatMap((m) => [1, 2, 3].flatMap((i) => [1, 2, 3].map((l) => `M${m}I${i}L${l}`)));
const RANK = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
// هامش «نحو» في حد الحقول المطلوبة (cards.json _about)
const CAP_SLACK = 1.05;

let rows, after;
beforeAll(async () => { after = await afterState(); rows = await computeMatrix(); }, 120000);

describe('بطاقة كاملة لكل مسار من الـ27', () => {
  it.each(TRACKS)('%s', (key) => {
    const m = trackManifest(key);
    const c = m.card;
    expect(c.identity.name && c.identity.title && c.identity.description).toBeTruthy();
    expect(['guided', 'applied', 'specialist']).toContain(c.handbook.type);
    expect([...c.handbook.order].sort()).toEqual([...DIMENSIONS].sort());
    expect(c.handbook.order[0]).toBe(m.priority);
    expect(c.handbook.deepened).toBe(m.priority);
    for (const d of DIMENSIONS) {
      expect(c.handbook.frameworks[d].level).toBe(m.levels[d]);
      expect(c.handbook.frameworks[d].terms.length).toBeGreaterThan(0);
      expect(c.initiative.units[d].mode).toBe(m.levels[d] === 'advanced' ? 'chapters' : 'grouped');
    }
    expect(['card', 'charter', 'case']).toContain(c.initiative.form);
    expect(c.initiative.required_cap).toBeGreaterThanOrEqual(40);
    expect(c.initiative.required_cap).toBeLessThanOrEqual(80);
    expect(c.journey.requirements.length).toBeGreaterThan(0);
    expect(c.journey.labs.length).toBeGreaterThan(0);
    expect(['readiness', 'examples', 'on_demand']).toContain(c.support.mode);
    expect(c.support.estimate_hours).toEqual(m.estimate_hours);
    expect(c.bridges.length).toBeLessThanOrEqual(CARDS.base.bridges.cap);
  });
  it('بلا مسار: لا بطاقة، والبيان القديم كما هو', () => {
    expect(trackManifest(null).card).toBeNull();
    expect(trackManifest('X').document.key).toBe('case');
  });
});

describe('لا شاشة تخالف البطاقة', () => {
  it.each(TRACKS)('%s: الوثيقة والكثافة وأسئلة صاحب القرار والرحلة من البطاقة نفسها', (key) => {
    const m = trackManifest(key);
    expect(m.card.initiative.form).toBe(m.document.key);
    expect(m.card.initiative.name).toBe(m.document.name);
    expect(m.card.support.case.form).toBe(m.density.case);
    expect(m.card.support.examples).toBe(m.density.examples);
    // أسئلة صاحب القرار بمستوى الأثر، والتأسيسي يجيب أسئلة الجاهزية الثلاثة نفسها
    const want = { beginner: 'readiness', intermediate: 'case3', advanced: 'case5' }[m.levels.impact];
    expect(m.density.case).toBe(want);
    if (want === 'readiness') expect(m.card.support.case.readiness).toHaveLength(3);
    else expect(Object.keys(m.card.support.case.questions)).toEqual(want === 'case3' ? m.case3 : ['strategic', 'economic', 'commercial', 'financial', 'management']);
    // الرحلة في البطاقة = ما يصل فعلًا بعد الترحيلات (المتطلبات بإطار، والمختبرات تلقائيًا)
    const d = deliveryFor(m.levels, after, m.priority);
    const framed = d.journey.filter((c) => after.requirements.find((r) => r.code === c)?.dimension);
    expect([...m.card.journey.requirements].sort()).toEqual([...framed].sort());
    expect([...m.card.journey.labs].sort()).toEqual([...d.labs].sort());
  });
  it('الأولوية في البيان = ما يحسبه الخادم بافتراض المسار', () => {
    const { tracks } = JSON.parse(readFileSync(join(ROOT, 'supabase/content/tracks/v2/tracks.json'), 'utf8'));
    for (const t of tracks) expect(trackManifest(t.key).priority, t.key).toBe(priorityFor(trackLevels(t.key), null, t.priority_dimension));
  });
  it('الوراثة: base ← by_level ← profiles ← tracks، والاستثناء معلل', () => {
    expect(cardLayers('M1I1L3', 'milestone-beginner', 'beginner').support.mode).toBe('examples');
    expect(cardLayers('M1I1L1', 'milestone-beginner', 'beginner').support.mode).toBe('readiness');
    for (const [k, v] of Object.entries(CARDS.tracks)) if (!k.startsWith('_')) expect(v._why, k).toBeTruthy();
  });
});

describe('الرحلة لا تنقص حين يرتفع مستوى', () => {
  it.each(TRACKS)('%s', (key) => {
    const lv = trackLevels(key);
    const here = trackManifest(key).card.journey;
    for (const d of DIMENSIONS) {
      if (lv[d] === 'advanced') continue;
      const up = trackManifest(trackKey({ ...lv, [d]: LEVELS[RANK[lv[d]] + 1] })).card.journey;
      expect(up.by_framework[d].requirements.length, `${key} ${d}`).toBeGreaterThanOrEqual(here.by_framework[d].requirements.length);
      expect(up.by_framework[d].labs.length, `${key} ${d}`).toBeGreaterThanOrEqual(here.by_framework[d].labs.length);
      expect(up.requirements.length).toBeGreaterThanOrEqual(here.requirements.length);
    }
  });
});

describe('المستويات الثلاثة في كل إطار تختلف فعلًا', () => {
  // في ثلاثة على الأقل من أربعة: الرحلة، والمختبرات، وحقول الوثيقة، والكتيب. والمسرد يختلف دائمًا
  it.each(DIMENSIONS)('%s', (d) => {
    const at = (l) => {
      const levels = { milestone: 'beginner', impact: 'beginner', leadership: 'beginner', [d]: l };
      const x = deliveryFor(levels, after, null);
      return {
        journey: SLICES.frameworks[d].journey[l].join(' '), labs: labsAt(d, l).join(' '),
        doc: JSON.stringify(x.fields.filter((f) => f.dimension === d)), handbook: JSON.stringify(x.hb.filter((c) => c.dimension === d)),
        terms: JSON.stringify(termsAt(d, l)),
      };
    };
    const s = Object.fromEntries(LEVELS.map((l) => [l, at(l)]));
    for (const [a, b] of [['beginner', 'intermediate'], ['intermediate', 'advanced'], ['beginner', 'advanced']]) {
      const differ = ['journey', 'labs', 'doc', 'handbook'].filter((k) => s[a][k] !== s[b][k]);
      expect(differ.length, `${d} ${a}/${b}: ${differ}`).toBeGreaterThanOrEqual(3);
      expect(s[a].terms).not.toBe(s[b].terms);
    }
  });
});

describe('كل ملف تعريف يبلغه مسار', () => {
  it('التسعة كلها بافتراض المسار، لا بالتعادل وحده', () => {
    const reached = new Set(TRACKS.map((k) => trackManifest(k).profile));
    expect(reached.size).toBe(9);
    expect(reached.has('impact-advanced') && reached.has('leadership-advanced')).toBe(true);
  });
  it('قرب الإتقان: إطار متوسط واثنان احترافيان يُطويان إلى الإطار الذي يلي الأضعف', () => {
    expect(nearMastery(trackLevels('M2I3L3'))).toBe('impact');
    expect(nearMastery(trackLevels('M3I2L3'))).toBe('leadership');
    expect(nearMastery(trackLevels('M3I3L2'))).toBe('milestone');
    expect(nearMastery(trackLevels('M3I3L3'))).toBeNull();
    expect(nearMastery(trackLevels('M1I3L3'))).toBeNull();
    // المؤشرات لا تكسر القاعدة: لا تعادل فيها
    expect(priorityFor(trackLevels('M3I2L3'), { milestone: 10, impact: 5, leadership: 90 })).toBe('leadership');
  });
});

describe('لقطة الـ27 من سكربت المصفوفة', () => {
  it('تطابق المودعة (node scripts/tracks/matrix.mjs يعيد توليدها)', () => {
    const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
    expect(rows).toEqual(snap.rows);
    const n = distinctCounts(rows);
    expect(n.journey).toBe(27);
    expect(n.profile).toBe(9);
    expect(n.labs).toBeGreaterThanOrEqual(12);
  });
  it('تحقق المسارات (scripts/tracks/verify.mjs) سليم', () => {
    expect(() => execFileSync('node', ['scripts/tracks/verify.mjs'], { cwd: ROOT, stdio: 'pipe' })).not.toThrow();
  }, 120000);
  it('ترحيل البطاقة مولَّد من مصدره', () => {
    expect(() => execFileSync('node', ['scripts/tracks/build-cards.mjs', '--check'], { cwd: ROOT, stdio: 'pipe' })).not.toThrow();
  });
});

describe('لا مستوى ملخص في البطاقة', () => {
  it('track-manifest.js لا يستورد overallLevel', () => {
    expect(readFileSync(join(ROOT, 'supabase/functions/leaders-api/track-manifest.js'), 'utf8')).not.toMatch(/overallLevel/);
  });
});
