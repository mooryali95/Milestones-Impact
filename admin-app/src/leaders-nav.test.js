// معمارية الشريط (المرحلة 2 من تدقيق لوحة الإدارة): كل قسم في مجموعة واحدة، لا يضيع قسم ولا رابط قديم
import { describe, expect, it } from 'vitest';
import { FEATURE_TABS, GROUP_OF, groupOf, groupOpen, NAV_GROUPS, navGroups, navReady, SETUP_GROUP, TAB_ALIASES, TABS, TRIAL_GROUP } from './leaders-tabs.js';

// أقسام الشريط قبل المرحلة 2 (المجموعات الأربع السابقة): كل مفتاح منها يبقى رابطًا صالحًا
const OLD_KEYS = ['overview', 'insight', 'participants', 'hall', 'capstones', 'activities', 'experts', 'journey', 'book', 'handbook', 'katon', 'lab', 'assessment', 'content',
  'programs', 'orgs', 'tracks', 'levels', 'settings', 'ai', 'payments', 'impact', 'f360', 'certs', 'mailcenter', 'mail'];

describe('مجموعات الشريط', () => {
  it('خمس مجموعات بترتيبها', () => {
    expect(NAV_GROUPS.map(([g]) => g)).toEqual(['العمل', 'الأشخاص', 'المنهج والمحتوى', 'التقارير', 'الإعداد']);
    expect(NAV_GROUPS.at(-1)[0]).toBe(SETUP_GROUP);
  });
  it('كل قسم في مجموعة واحدة بالضبط، ولا قسم في مجموعة بلا شاشة', () => {
    const all = NAV_GROUPS.flatMap(([, k]) => k);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(TABS.map(([k]) => k).sort());
  });
  it('لا يختفي قسم قديم: كل مفتاح سابق ما زال قسمًا أو اسمًا بديلًا', () => {
    for (const k of OLD_KEYS) expect(GROUP_OF[k] || TAB_ALIASES[k], k).toBeTruthy();
    for (const k of Object.keys(TAB_ALIASES)) expect(GROUP_OF[TAB_ALIASES[k][0]]).toBeTruthy();
  });
  it('الإعداد مطوي افتراضيًا، ومجموعة القسم المفتوح مفتوحة دائمًا، واختيار المدير يُحترم', () => {
    const setup = NAV_GROUPS.find(([g]) => g === SETUP_GROUP)[1];
    const work = NAV_GROUPS[0][1];
    expect(groupOpen(SETUP_GROUP, setup, 'overview', {})).toBe(false);
    expect(groupOpen(SETUP_GROUP, setup, 'mailcenter', {})).toBe(true);
    expect(groupOpen(SETUP_GROUP, setup, 'overview', { [SETUP_GROUP]: true })).toBe(true);
    expect(groupOpen('العمل', work, 'mail', {})).toBe(true);
    expect(groupOpen('العمل', work, 'mail', { العمل: false })).toBe(false);
    expect(groupOpen('العمل', work, 'overview', { العمل: false })).toBe(true);
  });
});

describe('مجموعة القسم الواحدة للشريط والبحث (المرحلة 7)', () => {
  it('groupOf يطابق مجموعة الشريط لكل قسم مخفيًا أو ظاهرًا', () => {
    const hid = (k) => k === 'f360';
    for (const [g, keys] of navGroups(hid)) for (const k of keys) expect(groupOf(k, hid)).toBe(g);
    expect(groupOf('f360', hid)).toBe(TRIAL_GROUP);
  });
  it('أقسام الميزات تُحجب قبل وصول المفاتيح فلا يتبدل ترتيب الشريط', () => {
    for (const k of Object.keys(FEATURE_TABS)) { expect(navReady(k, false, 'home')).toBe(false); expect(navReady(k, true, 'home')).toBe(true); }
    expect(navReady('f360', false, 'f360')).toBe(true);
    expect(navReady('settings', false, 'home')).toBe(true);
  });
});
