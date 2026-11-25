// ════════════════════════════════════════════════════════════════
// مصفوفة المسارات الـ27: ما يصل كل مسار فعلًا، محسوبًا بدوال الخادم نفسها على الحالة بعد الترحيلات
// ════════════════════════════════════════════════════════════════
// لكل مسار: ملف تعريفه وبطاقته (trackManifest)، وأبواب الكتيب وكلماته بعد قص كتل المستوى، ومتطلبات رحلته، وفصول وثيقته
// وحقولها والمطلوب منها، ومختبراته. اللقطة المودعة supabase/content/tracks/v2/matrix.json يقارنها اختبار
// leaders-app/src/track-card.test.js، فأي تغيير في ما يصل مسارًا يظهر في الفرق ويُراجع.
//   node scripts/tracks/matrix.mjs           يكتب اللقطة ويطبع عدد القيم المتمايزة لكل عمود
//   node scripts/tracks/matrix.mjs --check   يفشل إن اختلفت اللقطة المودعة عن المحسوبة
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { filterHandbookMd, handbookModulesFor, priorityFor, profileKey, requirementApplies, trackKey } from '../../supabase/functions/leaders-api/logic.js';
import { capstoneModels, modelFields } from '../../supabase/functions/leaders-api/capstone.js';
import { labVisible } from '../../supabase/functions/leaders-api/lab.js';
import { trackManifest } from '../../supabase/functions/leaders-api/track-manifest.js';
import { afterState, state } from './state.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const SNAPSHOT = join(ROOT, 'supabase/content/tracks/v2/matrix.json');
const HB = join(ROOT, 'supabase/content/handbook/v3.1');
const LV = ['beginner', 'intermediate', 'advanced'];
const h = (x) => createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 8);
const words = (s) => s.split(/\s+/).filter(Boolean).length;
const { tracks } = JSON.parse(readFileSync(join(ROOT, 'supabase/content/tracks/v2/tracks.json'), 'utf8'));

export const chapters = readdirSync(HB).filter((f) => /^[a-z]+_\d_\w+\.md$/.test(f)).map((f) => {
  const [dim, sort, key] = f.replace('.md', '').split('_');
  const meta = state.chapters.find((c) => c.dimension === dim && c.chapter_key === key) || {};
  return { id: `${dim}:${key}`, dimension: dim, chapter_key: key, sort: +sort, min_level: meta.min_level || 'beginner', body_md: readFileSync(join(HB, f), 'utf8') };
});

/** ما يصل مستويات بعينها، بالدوال التي يستعملها الخادم */
export function deliveryFor(levels, after, priority = null) {
  const models = after.models.map((m) => ({ ...m, id: m.key }));
  const hb = handbookModulesFor(chapters, levels).map((c) => ({ id: c.id, dimension: c.dimension, md: filterHandbookMd(c.body_md, levels[c.dimension]) }));
  const doc = capstoneModels(models, levels, null);
  const fields = doc.map((m) => ({ key: m.key, dimension: m.dimension, f: modelFields(m, levels, null, priority).map((f) => f.key + (f.required === false ? '?' : '')) }));
  return {
    hb, doc, fields,
    journey: after.requirements.filter((r) => r.active && requirementApplies(r, levels)).map((r) => r.code),
    labs: labVisible(after.labs, { levels, participantId: 'x' }).map((x) => x.key),
  };
}

export async function computeMatrix() {
  const after = await afterState();
  const rows = [];
  for (const m of LV) for (const i of LV) for (const l of LV) {
    const levels = { milestone: m, impact: i, leadership: l };
    const key = trackKey(levels);
    const fb = tracks.find((t) => t.key === key)?.priority_dimension;
    const pri = priorityFor(levels, null, fb);
    const man = trackManifest(key);
    const d = deliveryFor(levels, after, pri);
    const required = d.fields.reduce((n, x) => n + x.f.filter((k) => !k.endsWith('?')).length, 0);
    rows.push({
      key, profile: profileKey(levels, pri), priority: pri, manifest_profile: man.profile,
      form: man.document.key, case: man.card.support.case.form, handbook_type: man.card.handbook.type, support: man.card.support.mode,
      hb_chapters: d.hb.length, hb_sections: d.hb.reduce((n, c) => n + (c.md.match(/^##\s/gm) || []).length, 0), hb_words: d.hb.reduce((n, c) => n + words(c.md), 0),
      journey: d.journey.filter((c) => after.requirements.find((r) => r.code === c)?.dimension).join(' '),
      doc_chapters: d.doc.length, doc_fields: d.fields.reduce((n, x) => n + x.f.length, 0), doc_required: required, required_cap: man.card.initiative.required_cap,
      labs: d.labs.join(' '), terms: Object.values(man.card.handbook.frameworks).reduce((n, f) => n + f.terms.length, 0),
      hb_hash: h(d.hb), doc_hash: h(d.fields),
    });
  }
  return rows;
}

export function distinctCounts(rows) {
  const cols = ['hb_hash', 'journey', 'doc_hash', 'labs', 'profile', 'form', 'case', 'terms'];
  return Object.fromEntries(cols.map((c) => [c, new Set(rows.map((r) => r[c])).size]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await computeMatrix();
  const out = `${JSON.stringify({ _about: 'لقطة مولَّدة بـ node scripts/tracks/matrix.mjs: ما يصل كل مسار من الـ27. لا تُحرَّر باليد.', rows }, null, 1)}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(SNAPSHOT, 'utf8') !== out) { console.error('matrix.json لا يطابق المحسوب: node scripts/tracks/matrix.mjs'); process.exit(1); }
    console.log('✓ matrix.json يطابق المحسوب');
  } else {
    writeFileSync(SNAPSHOT, out);
    console.table(distinctCounts(rows));
  }
}
