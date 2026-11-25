// الترقية بين المسارات (بطاقة المسار، المرحلة 3): لا يضيع شيء كُتب، والجديد يُحسب مرة ويُخزَّن على القاعدة،
// وسطر التطور في الرحلة، والإشعار في مركز الرسائل، وسجل المسار للمشارك والمستشار.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { trackLevels } from '../../supabase/functions/leaders-api/logic.js';
import { capstoneModels, modelFields } from '../../supabase/functions/leaders-api/capstone.js';
import { diffSummary, evolutionLine, newItemRows, raisedFrameworks, upgradeDiff, upgradeMessage } from '../../supabase/functions/leaders-api/track-upgrade.js';
import { EXPORT_TABLES } from '../../supabase/functions/leaders-api/privacy.js';
import { MAIL_CATEGORIES } from '../../supabase/functions/leaders-api/labels.js';
import { chapters as MODULES } from '../../scripts/tracks/matrix.mjs';
import { afterState } from '../../scripts/tracks/state.mjs';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let models;
beforeAll(async () => { models = (await afterState()).models.map((m) => ({ ...m, id: m.key })); }, 120000);
const diff = (a, b) => upgradeDiff({ from: trackLevels(a), to: trackLevels(b), modules: MODULES, models });

describe('ما يضيفه المسار الجديد', () => {
  it('ارتفاع الأثر من التأسيسي إلى المتوسط يضيف فصولًا وحقولًا وأبوابًا، ولا يحذف شيئًا', () => {
    const d = diff('M1I1L1', 'M1I2L1');
    expect(d.chapters).toEqual(expect.arrayContaining(['options-analysis']));
    expect(d.handbook.length).toBeGreaterThan(0);
    expect(d.fields.every((k) => /^[a-z-]+\.[a-z_]+$/.test(k))).toBe(true);
    // كل فصل قبل الترقية باقٍ بعدها
    const before = capstoneModels(models, trackLevels('M1I1L1'), null).map((m) => m.key);
    const after = capstoneModels(models, trackLevels('M1I2L1'), null).map((m) => m.key);
    for (const k of before) expect(after).toContain(k);
  });
  it('الاحترافي في الأثر يضيف «القيمة مقابل المال»', () => {
    expect(diff('M3I2L3', 'M3I3L3').chapters).toContain('value-for-money');
  });
  it('لا فقد عند النزول: الفصل الذي كتب فيه يبقى ظاهرًا وحقوله غير مطلوبة', () => {
    const answered = { 'value-for-money': { appraisal: [['عدم التدخل', '0', '', '', '']] } };
    const lv = trackLevels('M3I2L3');
    const kept = capstoneModels(models, lv, null, new Set(['value-for-money']));
    const vfm = kept.find((m) => m.key === 'value-for-money');
    expect(vfm).toBeTruthy();
    expect(modelFields(vfm, lv, null, null, answered['value-for-money']).every((f) => f.required === false)).toBe(true);
  });
  it('نفس المسار أو أول اعتماد: لا جديد', () => {
    expect(diff('M2I2L2', 'M2I2L2')).toEqual({ handbook: [], chapters: [], fields: [] });
    expect(upgradeDiff({ from: null, to: trackLevels('M2I2L2'), modules: MODULES, models })).toEqual({ handbook: [], chapters: [], fields: [] });
  });
  it('صفوف «جديد في مستواك» بنوعها، والملخص أعداد', () => {
    const d = diff('M1I1L1', 'M2I1L1');
    const rows = newItemRows('p1', 'M2I1L1', d);
    expect(rows.length).toBe(d.handbook.length + d.chapters.length + d.fields.length);
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(['handbook', 'chapter', 'field'].filter((k) => rows.some((r) => r.kind === k))));
    expect(diffSummary(d)).toEqual({ handbook: d.handbook.length, chapters: d.chapters.length, fields: d.fields.length });
  });
});

describe('سطر التطور والإشعار', () => {
  it('يسمي الأطر التي ارتفعت وحدها', () => {
    expect(raisedFrameworks(trackLevels('M1I1L1'), trackLevels('M2I1L3'))).toEqual(['milestone', 'leadership']);
    expect(evolutionLine(trackLevels('M1I1L1'), trackLevels('M2I1L1'))).toBe('تقدمت في إطار إدارة المشروعات، وهذا ما أضيف إلى منهجك');
    expect(evolutionLine(trackLevels('M2I2L2'), trackLevels('M1I2L2'))).toBeNull();
  });
  it('الرسالة تطمئن أن ما كُتب باقٍ، وفئتها «تحديثات رحلتك» في مركز الرسائل', () => {
    const m = upgradeMessage('سارة', 'تقدمت في إطار الأثر، وهذا ما أضيف إلى منهجك', { handbook: 2, chapters: 1, fields: 3 });
    expect(m.html).toMatch(/كل ما كتبته باقٍ/);
    expect(m.html).toMatch(/جديد في مستواك/);
    expect(MAIL_CATEGORIES.journey).toBeTruthy();
    expect(read('supabase/functions/leaders-api/track-history.ts')).toMatch(/sendMail\([^)]*category: 'journey'/);
  });
});

describe('الحلقة كاملة في الخادم والواجهة', () => {
  it('اعتماد المستشار يسجل تغيّر المسار بعد حفظ المستويات', () => {
    const src = read('supabase/functions/leaders-api/admin.ts');
    const at = src.indexOf("must(await db.from('placements').upsert(rows));");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, at + 900)).toMatch(/recordTrackChange\(p, fromLv, toLv, a\.email/);
  });
  it('«جديد في مستواك» من القاعدة لا من تخزين المتصفح', () => {
    const cap = read('leaders-app/src/screens/Capstone.jsx');
    expect(cap).not.toMatch(/mi_leaders_spine_seen|readSeen|saveSeen/);
    expect(cap).toMatch(/call\('track\.seen'/);
    expect(read('leaders-app/src/screens/Handbook.jsx')).toMatch(/call\('track\.seen', \{ kind: 'handbook'/);
    expect(read('supabase/functions/leaders-api/capstone.ts')).toMatch(/new_fields:/);
  });
  it('السجل يراه المشارك (الرحلة) والمستشار (ملفه)', () => {
    expect(read('leaders-app/src/screens/Journey.jsx')).toMatch(/<TrackHistory history=\{profile\.history\}/);
    expect(read('leaders-app/src/screens/ExpertFile.jsx')).toMatch(/<TrackHistory history=\{d\.profile\.history\}/);
    expect(read('supabase/functions/leaders-api/participant.ts')).toMatch(/approved, track, history/);
  });
  it('الجدولان الجديدان في نسخة بيانات المشارك', () => {
    expect(EXPORT_TABLES.participant_track_history).toEqual(['decided_by']);
    expect(EXPORT_TABLES.participant_new_items).toEqual([]);
    const sql = read('supabase/migrations/20261129120000_leaders_track_history.sql');
    expect(sql).toMatch(/references leaders\.participants\(id\) on delete cascade[\s\S]*references leaders\.participants\(id\) on delete cascade/);
  });
});
